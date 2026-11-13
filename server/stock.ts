import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "./firebase-admin";
import {
  ALREADY_EXISTS,
  ID_PATTERN,
  MAX_OPEN,
  addDaysIso,
  cleanText,
  isValidDate,
  isoWeekday,
  pruneCategories,
  stockConfigOf,
  stockCountsOf,
  storeIdParam,
  tasksOf,
  useCategory,
} from "./todo-shared";
import {
  LOCATIONS,
  countProgress,
  isQty,
  nextOpenDate,
  openWeekdays,
  prepList,
  stockLines,
  weekdayOfIso,
  type Location,
  type StockCounts,
  type StockItem,
} from "../lib/stockCalc";

// The stock card. Per product, the ideal quantity for each weekday in two places (the
// back storage and the service fridge) lives in ONE document, stock/config, whose
// changes are field-level so two people editing different cells never overwrite each
// other. The day before every open day a "count the stock" card appears on the board;
// once everything is counted, what's missing becomes a "to prepare" checklist.

const MAX_NAME = 60;
const MAX_ITEMS = 150;
const STOCK_CATEGORY = "Stock";

// Cards and prep lists are ordinary tasks with fixed IDs keyed on the day they prepare
// for, so a second device can't create a duplicate. Their titles are written by the
// page, in the viewer's language, so the stored one is only a neutral fallback.
const countCardId = (target: string) => `stockcount_${target}`;
const prepTaskId = (target: string) => `stockprep_${target}`;

type RawItem = { name: string; order?: number; chambre?: Record<string, number>; makeline?: Record<string, number> };

function toItems(raw: Record<string, RawItem> | undefined): StockItem[] {
  return Object.entries(raw ?? {})
    .map(([id, value]) => ({
      id,
      name: value.name,
      order: value.order ?? 0,
      chambre: value.chambre ?? {},
      makeline: value.makeline ?? {},
    }))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

export type StockConfig = {
  items: StockItem[];
  /** The last day count cards were made for, so a card someone deleted doesn't come back */
  cardsThrough: string | null;
  /** Which weekdays were open ("134567") when those cards were made */
  openSignature: string | null;
};

export async function loadStockConfig(storeId: string): Promise<StockConfig> {
  const data = (await stockConfigOf(storeId).get()).data();
  return {
    items: toItems(data?.items),
    cardsThrough: (data?.cardsThrough as string | undefined) ?? null,
    openSignature: (data?.openSignature as string | undefined) ?? null,
  };
}

// ─── Input checks ─────────────────────────────────────────────────────────────

/** `{ "3": 4, "5": null }`: a quantity per weekday, null clearing a day. */
function parseIdeals(value: unknown): Record<string, number | null> {
  if (value === undefined) return {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new HTTPException(400, { message: "Invalid quantities" });
  }
  const out: Record<string, number | null> = {};
  for (const [day, amount] of Object.entries(value)) {
    if (!/^[1-7]$/.test(day) || (amount !== null && !isQty(amount))) {
      throw new HTTPException(400, { message: "Invalid quantities" });
    }
    out[day] = amount as number | null;
  }
  return out;
}

const withoutNulls = (ideals: Record<string, number | null>) =>
  Object.fromEntries(Object.entries(ideals).filter(([, amount]) => amount !== null)) as Record<string, number>;

function itemIdParam(c: any): string {
  const id = c.req.param("itemId");
  if (!ID_PATTERN.test(id)) throw new HTTPException(404, { message: "Product not found" });
  return id;
}

/** The day a count is for. Kept within a couple of months of now, so nobody can fill the database with junk dates. */
function targetDateParam(c: any): string {
  const date = c.req.param("date");
  if (!isValidDate(date)) throw new HTTPException(404, { message: "Not found" });
  if (Math.abs(Date.parse(`${date}T00:00:00Z`) - Date.now()) > 60 * 86_400_000) {
    throw new HTTPException(404, { message: "Not found" });
  }
  return date;
}

// ─── Routes (mounted under /stores/:storeId/stock, behind the PIN token) ──────

export const stockRouter = new Hono();

// GET / — every product with its ideal quantities
stockRouter.get("/", async (c) => {
  const { items } = await loadStockConfig(storeIdParam(c));
  return c.json({ items, openWeekdays: openWeekdays(items) });
});

// POST /items — add a product
stockRouter.post("/items", async (c) => {
  const storeId = storeIdParam(c);
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const name = cleanText(body.name);
  if (!name || name.length > MAX_NAME) throw new HTTPException(400, { message: "Invalid name" });
  const chambre = withoutNulls(parseIdeals(body.chambre));
  const makeline = withoutNulls(parseIdeals(body.makeline));

  const id = db.collection("ids").doc().id;
  const ref = stockConfigOf(storeId);
  const item = await db.runTransaction(async (tx) => {
    const existing = Object.values((await tx.get(ref)).data()?.items ?? {}) as RawItem[];
    if (existing.length >= MAX_ITEMS) throw new HTTPException(400, { message: "Too many products" });
    const order = existing.reduce((highest, entry) => Math.max(highest, entry.order ?? 0), 0) + 1;
    const created = { name, order, chambre, makeline };
    tx.set(ref, { items: { [id]: created }, updatedAt: new Date().toISOString() }, { merge: true });
    return created;
  });
  return c.json({ id, ...item }, 201);
});

// PATCH /items/:itemId — rename, or change single quantities
stockRouter.patch("/items/:itemId", async (c) => {
  const storeId = storeIdParam(c);
  const itemId = itemIdParam(c);
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));

  const name = "name" in body ? cleanText(body.name) : null;
  if (name !== null && (!name || name.length > MAX_NAME)) throw new HTTPException(400, { message: "Invalid name" });
  const ideals: Record<Location, Record<string, number | null>> = {
    chambre: parseIdeals(body.chambre),
    makeline: parseIdeals(body.makeline),
  };

  const ref = stockConfigOf(storeId);
  await db.runTransaction(async (tx) => {
    // Checked first: updating a path under a deleted product would bring back a nameless ghost of it.
    if (!(await tx.get(ref)).data()?.items?.[itemId]) throw new HTTPException(404, { message: "Product not found" });
    const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (name !== null) update[`items.${itemId}.name`] = name;
    for (const location of LOCATIONS) {
      for (const [day, amount] of Object.entries(ideals[location])) {
        update[`items.${itemId}.${location}.${day}`] = amount === null ? FieldValue.delete() : amount;
      }
    }
    tx.update(ref, update);
  });
  return c.json({ ok: true });
});

// DELETE /items/:itemId
stockRouter.delete("/items/:itemId", async (c) => {
  const storeId = storeIdParam(c);
  const itemId = itemIdParam(c);
  await stockConfigOf(storeId)
    .update({ [`items.${itemId}`]: FieldValue.delete(), updatedAt: new Date().toISOString() })
    .catch((err) => {
      if (err.code !== 5) throw err; // 5 = no config yet: nothing to delete
    });
  return c.json({ ok: true });
});

// GET /counts/:date — what has been counted for the day `date` so far
stockRouter.get("/counts/:date", async (c) => {
  const date = targetDateParam(c);
  const data = (await stockCountsOf(storeIdParam(c)).doc(date).get()).data();
  return c.json({ targetDate: date, counts: (data?.counts ?? {}) as StockCounts, finishedAt: data?.finishedAt ?? null });
});

// PATCH /counts/:date — set (or clear, with null) ONE product's count in ONE place.
// A merge of a single nested field, so two phones counting different places don't clash.
stockRouter.patch("/counts/:date", async (c) => {
  const storeId = storeIdParam(c);
  const date = targetDateParam(c);
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const { itemId, location, value } = body as { itemId?: unknown; location?: unknown; value?: unknown };

  if (typeof itemId !== "string" || !ID_PATTERN.test(itemId)) throw new HTTPException(400, { message: "Invalid product" });
  if (!LOCATIONS.includes(location as Location)) throw new HTTPException(400, { message: "Invalid place" });
  if (value !== null && !isQty(value)) throw new HTTPException(400, { message: "Invalid quantity" });

  const { items } = await loadStockConfig(storeId);
  if (!items.some((item) => item.id === itemId)) throw new HTTPException(404, { message: "Product not found" });

  await stockCountsOf(storeId)
    .doc(date)
    .set(
      {
        targetDate: date,
        counts: { [itemId]: { [location as string]: value === null ? FieldValue.delete() : value } },
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  return c.json({ ok: true });
});

// POST /counts/:date/finish — everything is counted: write the "to prepare" list for
// that day and complete the count card.
stockRouter.post("/counts/:date/finish", async (c) => {
  const storeId = storeIdParam(c);
  const date = targetDateParam(c);

  const [{ items }, countSnap] = await Promise.all([loadStockConfig(storeId), stockCountsOf(storeId).doc(date).get()]);
  const lines = stockLines(items, (countSnap.data()?.counts ?? {}) as StockCounts, weekdayOfIso(date));
  const { total, counted } = countProgress(lines);
  if (!total) throw new HTTPException(409, { message: "Nothing to count for that day" });
  if (counted < total) return c.json({ error: "incomplete", remaining: total - counted }, 409);

  const prep = prepList(lines);
  const now = new Date().toISOString();
  const prepRef = tasksOf(storeId).doc(prepTaskId(date));
  const existing = await prepRef.get();

  if (existing.exists && existing.data()!.completedAt) {
    // Already prepared and ticked off: a recount doesn't reopen finished work.
  } else if (!prep.length) {
    if (existing.exists) await prepRef.delete();
  } else {
    // A recount keeps what was already ticked off, by product.
    const ticked = new Set(((existing.data()?.checklist ?? []) as { name: string; done: boolean }[]).filter((i) => i.done).map((i) => i.name));
    const checklist = prep.map((entry) => ({ name: entry.item.name, qty: entry.qty, done: ticked.has(entry.item.name), parts: entry.parts }));
    if (existing.exists) {
      await prepRef.update({ checklist });
    } else {
      const category = await useCategory(storeId, STOCK_CATEGORY);
      await prepRef.create({
        title: "Stock prep",
        dueDate: date,
        importance: 3,
        categoryId: category.id,
        categoryName: category.name,
        categoryHue: category.hue,
        checklist,
        stock: { kind: "prep", targetDate: date },
        completedAt: null,
        createdAt: now,
      });
      await pruneCategories(storeId, category.id);
    }
  }

  await stockCountsOf(storeId).doc(date).set({ targetDate: date, finishedAt: now }, { merge: true });

  const card = tasksOf(storeId).doc(countCardId(date));
  const cardData = (await card.get()).data();
  if (cardData && cardData.completedAt === null) await card.update({ completedAt: now });

  return c.json({ prepare: prep.length });
});

// ─── Used by the board ────────────────────────────────────────────────────────

/**
 * Puts today's and tomorrow's "count the stock" card on the board: on every open day,
 * a count for the next open day. A day where every quantity is 0 is a closed day: it
 * gets no card, and the count before it prepares for the next open day instead.
 *
 * Cards are made once per day and then left alone, so a card someone deleted (say, for
 * a day off) doesn't come back. The exception is when days are opened or closed in the
 * settings: the cards still waiting are then rebuilt for the new week.
 */
export async function ensureStockCards(storeId: string, today: string, config: StockConfig) {
  const open = openWeekdays(config.items);
  const signature = open.join("");
  const tomorrow = addDaysIso(today, 1);

  const changed = config.openSignature !== null && config.openSignature !== signature;
  if (changed) await removeUpcomingCountCards(storeId, today);

  if (!open.length) {
    if (changed) await stockConfigOf(storeId).set({ cardsThrough: null, openSignature: signature }, { merge: true });
    return;
  }

  const through = changed ? null : config.cardsThrough;
  if (through && through >= tomorrow) return;

  let category: Awaited<ReturnType<typeof useCategory>> | null = null;
  for (const date of [today, tomorrow]) {
    if (through && date <= through) continue;
    if (!open.includes(isoWeekday(date))) continue; // closed: nobody counts
    const target = nextOpenDate(date, open)!;
    category ??= await useCategory(storeId, STOCK_CATEGORY);
    await tasksOf(storeId)
      .doc(countCardId(target))
      .create({
        title: "Stock count",
        dueDate: date,
        importance: 2,
        categoryId: category.id,
        categoryName: category.name,
        categoryHue: category.hue,
        checklist: null,
        stock: { kind: "count", targetDate: target },
        completedAt: null,
        createdAt: new Date().toISOString(),
      })
      .catch((err) => {
        // Made by another device a moment ago, or a count that was already finished
        if (err.code !== ALREADY_EXISTS) throw err;
      });
  }
  await stockConfigOf(storeId).set({ cardsThrough: tomorrow, openSignature: signature }, { merge: true });
}

/**
 * Drops the count cards that are still waiting from today on. What was counted stays
 * on the count itself, so a card that comes back for the same day picks it up again.
 */
async function removeUpcomingCountCards(storeId: string, today: string) {
  const snap = await tasksOf(storeId).where("completedAt", "==", null).limit(MAX_OPEN).get();
  const batch = db.batch();
  snap.docs
    .filter((doc) => doc.data().stock?.kind === "count" && doc.data().dueDate >= today)
    .forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
}

/** Adds "counted / total" to each open count card, worked out from what's been counted so far. */
export async function withStockProgress(storeId: string, tasks: Record<string, any>[], config: StockConfig) {
  const cards = tasks.filter((task) => task.stock?.kind === "count");
  if (!cards.length) return;
  const snaps = await Promise.all(cards.map((card) => stockCountsOf(storeId).doc(card.stock.targetDate).get()));
  cards.forEach((card, index) => {
    const lines = stockLines(config.items, (snaps[index].data()?.counts ?? {}) as StockCounts, weekdayOfIso(card.stock.targetDate));
    const { total, counted } = countProgress(lines);
    card.stock = { ...card.stock, total, done: counted };
  });
}

/**
 * Copies one store's stock settings to another, but only when the target has none yet:
 * a store that has already tuned its own quantities is never overwritten.
 */
export async function copyStockConfig(sourceStoreId: string, targetStoreId: string): Promise<"copied" | "skipped" | "none"> {
  const [source, target] = await Promise.all([loadStockConfig(sourceStoreId), loadStockConfig(targetStoreId)]);
  if (!source.items.length) return "none";
  if (target.items.length) return "skipped";
  const items = Object.fromEntries(
    source.items.map((item) => [db.collection("ids").doc().id, { name: item.name, order: item.order, chambre: item.chambre, makeline: item.makeline }]),
  );
  await stockConfigOf(targetStoreId).set({ items, updatedAt: new Date().toISOString() }, { merge: true });
  return "copied";
}
