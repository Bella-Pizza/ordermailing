import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { db } from "../firebase-admin";
import { isValidPin, todoTokenIsValid, verifyTodoPin } from "../todo-access";
import {
  ALREADY_EXISTS,
  ID_PATTERN,
  MAX_OPEN,
  addDaysIso,
  categoriesOf,
  categoryKey,
  cleanText,
  isValidDate,
  isoWeekday,
  pruneCategories,
  recurringOf,
  serialize,
  storeIdParam,
  storeToday,
  tasksOf,
  useCategory,
} from "../todo-shared";
import { ensureStockCards, loadStockConfig, stockRouter, withStockProgress } from "../stock";

// Public router: there is no Firebase login here. Everything except the store list
// and PIN check requires the per-store token that a correct PIN hands out.
const todo = new Hono();

const MAX_TITLE = 200;
const MAX_CATEGORY = 40;
const MAX_COMPLETED = 100;

// ─── Checklists ───────────────────────────────────────────────────────────────
// A recurring task can carry a checklist, e.g. the kitchen's daily preparations.
// Each item has a quantity per weekday ("1" = Monday ... "7" = Sunday). An item
// with no quantities appears every day without a number.
const MAX_CHECKLIST_ITEMS = 150;
const MAX_ITEM_NAME = 80;

type ChecklistTemplateItem = { name: string; qty: Record<string, number> };
type ChecklistItem = { name: string; qty: number | null; done: boolean };

function parseChecklist(value: unknown): ChecklistTemplateItem[] | null {
  if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) return null;
  if (!Array.isArray(value) || value.length > MAX_CHECKLIST_ITEMS) {
    throw new HTTPException(400, { message: "Invalid checklist" });
  }
  return value.map((raw) => {
    const name = cleanText((raw as { name?: unknown })?.name);
    if (!name || name.length > MAX_ITEM_NAME) throw new HTTPException(400, { message: "Invalid checklist item" });
    const qtyIn = (raw as { qty?: unknown }).qty ?? {};
    if (typeof qtyIn !== "object" || Array.isArray(qtyIn)) throw new HTTPException(400, { message: "Invalid quantities" });
    const qty: Record<string, number> = {};
    for (const [day, amount] of Object.entries(qtyIn as Record<string, unknown>)) {
      if (!/^[1-7]$/.test(day) || !Number.isInteger(amount) || (amount as number) < 0 || (amount as number) > 9999) {
        throw new HTTPException(400, { message: "Invalid quantities" });
      }
      if ((amount as number) > 0) qty[day] = amount as number;
    }
    return { name, qty };
  });
}

/** A checklist on a single task: one optional amount per item, plus whether it's ticked. */
function parseTaskChecklist(value: unknown): ChecklistItem[] | null {
  if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) return null;
  if (!Array.isArray(value) || value.length > MAX_CHECKLIST_ITEMS) {
    throw new HTTPException(400, { message: "Invalid checklist" });
  }
  return value.map((raw) => {
    const item = (raw ?? {}) as { name?: unknown; qty?: unknown; done?: unknown };
    const name = cleanText(item.name);
    if (!name || name.length > MAX_ITEM_NAME) throw new HTTPException(400, { message: "Invalid checklist item" });
    const qty = item.qty ?? null;
    if (qty !== null && (!Number.isInteger(qty) || (qty as number) < 0 || (qty as number) > 9999)) {
      throw new HTTPException(400, { message: "Invalid quantity" });
    }
    if (item.done !== undefined && typeof item.done !== "boolean") {
      throw new HTTPException(400, { message: "Invalid checklist item" });
    }
    return { name, qty: qty ? (qty as number) : null, done: item.done === true };
  });
}

/** The checklist as it applies to one weekday, ready to tick off. */
function checklistForDay(checklist: ChecklistTemplateItem[] | null | undefined, weekday: number): ChecklistItem[] | null {
  if (!checklist?.length) return null;
  return checklist
    .filter((item) => Object.keys(item.qty).length === 0 || item.qty[weekday] > 0)
    .map((item) => ({ name: item.name, qty: item.qty[weekday] ?? null, done: false }));
}

function isValidDays(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 7 &&
    new Set(value).size === value.length &&
    value.every((d) => Number.isInteger(d) && d >= 1 && d <= 7)
  );
}



// ─── Recurring tasks ──────────────────────────────────────────────────────────
// A recurring task is a template. Each day it's due, a normal task is created from
// it, so completing, swiping and undo all work unchanged. Copies are only made for
// today and tomorrow, when someone opens the list: a day nobody opened is skipped
// instead of piling up as overdue work.

/** Each template's copy for a date has a fixed ID, so concurrent loads can't duplicate it. */
const copyId = (recurringId: string, date: string) => `r_${recurringId}_${date}`;

async function createRecurringCopies(storeId: string, today: string, templates: FirebaseFirestore.QueryDocumentSnapshot[]) {
  const tomorrow = addDaysIso(today, 1);
  const tasks = tasksOf(storeId);

  await Promise.all(
    templates.map(async (template) => {
      const data = template.data();
      // `generatedThrough` saves every 30-second refresh from re-checking each copy.
      if (data.generatedThrough && data.generatedThrough >= tomorrow) return;

      for (const date of [today, tomorrow]) {
        if (!data.days.includes(isoWeekday(date))) continue;
        if (data.generatedThrough && date <= data.generatedThrough) continue;
        await tasks
          .doc(copyId(template.id, date))
          .create({
            title: data.title,
            dueDate: date,
            importance: data.importance,
            categoryId: data.categoryId,
            categoryName: data.categoryName,
            categoryHue: data.categoryHue,
            checklist: checklistForDay(data.checklist, isoWeekday(date)),
            recurringId: template.id,
            completedAt: null,
            createdAt: new Date().toISOString(),
          })
          .catch((err) => {
            // Already made by another device, or made and then deleted on purpose
            if (err.code !== ALREADY_EXISTS) throw err;
          });
      }
      await template.ref.update({ generatedThrough: tomorrow });
    }),
  );
}

/**
 * After a template changes, bring its open copies from today on in line with it.
 * Copies on days it no longer runs are removed; the rest are updated in place, so
 * checklist items already ticked off today stay ticked. Completed copies are left
 * alone as a record.
 */
async function refreshOpenCopies(storeId: string, recurringId: string, today: string) {
  const [templateSnap, copiesSnap] = await Promise.all([
    recurringOf(storeId).doc(recurringId).get(),
    tasksOf(storeId).where("recurringId", "==", recurringId).get(),
  ]);
  const template = templateSnap.data();
  if (!template) return;

  const batch = db.batch();
  for (const doc of copiesSnap.docs) {
    const copy = doc.data();
    if (copy.completedAt !== null || copy.dueDate < today) continue;
    const weekday = isoWeekday(copy.dueDate);
    if (!template.days.includes(weekday)) {
      batch.delete(doc.ref);
      continue;
    }
    const ticked = new Set(((copy.checklist ?? []) as ChecklistItem[]).filter((i) => i.done).map((i) => i.name));
    batch.update(doc.ref, {
      title: template.title,
      importance: template.importance,
      categoryId: template.categoryId,
      categoryName: template.categoryName,
      categoryHue: template.categoryHue,
      checklist: checklistForDay(template.checklist, weekday)?.map((i) => ({ ...i, done: ticked.has(i.name) })) ?? null,
    });
  }
  await batch.commit();
}

/** When a template is deleted: drop its copies nobody has completed yet, from today on. */
async function removeOpenCopies(storeId: string, recurringId: string, today: string) {
  const snap = await tasksOf(storeId).where("recurringId", "==", recurringId).get();
  const batch = db.batch();
  snap.docs
    .filter((d) => d.data().completedAt === null && d.data().dueDate >= today)
    .forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

function parseRecurringBody(body: Record<string, unknown>, partial: boolean) {
  const update: {
    title?: string;
    days?: number[];
    importance?: number;
    category?: string;
    checklist?: ChecklistTemplateItem[] | null;
  } = {};
  if (!partial || "checklist" in body) update.checklist = parseChecklist(body.checklist);
  if (!partial || "title" in body) {
    const title = cleanText(body.title);
    if (!title || title.length > MAX_TITLE) throw new HTTPException(400, { message: "Invalid title" });
    update.title = title;
  }
  if (!partial || "days" in body) {
    if (!isValidDays(body.days)) throw new HTTPException(400, { message: "Invalid days" });
    update.days = [...body.days].sort();
  }
  if (!partial || "importance" in body) {
    if (![1, 2, 3].includes(body.importance as number)) throw new HTTPException(400, { message: "Invalid importance" });
    update.importance = body.importance as number;
  }
  if (!partial || "category" in body) {
    const category = cleanText(body.category);
    if (!category || category.length > MAX_CATEGORY) throw new HTTPException(400, { message: "Invalid category" });
    update.category = category;
  }
  return update;
}

// ─── GET /api/todo/stores — names only, for the public store dropdown ─────────
todo.get("/stores", async (c) => {
  const snap = await db.collection("stores").orderBy("name").select("name").get();
  return c.json(snap.docs.map((d) => ({ id: d.id, name: d.data().name })));
});

// ─── POST /api/todo/stores/:storeId/verify — exchange a PIN for a token ───────
todo.post("/stores/:storeId/verify", async (c) => {
  const storeId = storeIdParam(c);
  const { pin } = await c.req.json<{ pin?: unknown }>().catch(() => ({ pin: undefined }));
  if (!isValidPin(pin)) throw new HTTPException(400, { message: "PIN must be 4 digits" });

  const result = await verifyTodoPin(storeId, pin);
  switch (result.status) {
    case "ok":
      return c.json({ token: result.token });
    case "locked":
      return c.json({ error: "locked", retryAfterSeconds: result.retryAfterSeconds }, 429);
    case "wrong":
      return c.json({ error: "wrong_pin" }, 401);
    case "not_found":
      throw new HTTPException(404, { message: "Store not found" });
  }
});

// Everything below needs a valid token. The verify route above already returned.
todo.use("/stores/:storeId/*", async (c, next) => {
  const storeId = storeIdParam(c);
  if (!(await todoTokenIsValid(storeId, c.req.header("X-Todo-Token")))) {
    throw new HTTPException(401, { message: "PIN required" });
  }
  return next();
});

// ─── GET /api/todo/stores/:storeId/board — tasks + categories ─────────────────
todo.get("/stores/:storeId/board", async (c) => {
  const storeId = storeIdParam(c);
  const tasks = tasksOf(storeId);

  const today = storeToday(c.req.query("today"));
  const [templates, stockConfig] = await Promise.all([recurringOf(storeId).get(), loadStockConfig(storeId)]);
  await Promise.all([
    createRecurringCopies(storeId, today, templates.docs),
    ensureStockCards(storeId, today, stockConfig),
  ]);

  // `> ""` keeps this on Firestore's automatic single-field index and skips open
  // tasks, whose completedAt is null. No composite index needs deploying.
  const [store, open, completed, categories] = await Promise.all([
    db.collection("stores").doc(storeId).get(),
    tasks.where("completedAt", "==", null).limit(MAX_OPEN).get(),
    tasks.where("completedAt", ">", "").orderBy("completedAt", "desc").limit(MAX_COMPLETED).get(),
    categoriesOf(storeId).orderBy("useCount", "desc").get(),
  ]);
  if (!store.exists) throw new HTTPException(404, { message: "Store not found" });

  const openTasks = open.docs.map(serialize);
  await withStockProgress(storeId, openTasks, stockConfig);

  return c.json({
    storeName: store.data()!.name,
    open: openTasks,
    completed: completed.docs.map(serialize),
    categories: categories.docs.map((d) => ({ id: d.id, name: d.data().name, hue: d.data().hue })),
    recurring: templates.docs
      .map((d) => {
        const { generatedThrough, ...rest } = d.data();
        return { id: d.id, ...rest };
      })
      .sort((a, b) => String(a.title).localeCompare(String(b.title))),
  });
});

// ─── POST /api/todo/stores/:storeId/recurring ─────────────────────────────────
todo.post("/stores/:storeId/recurring", async (c) => {
  const storeId = storeIdParam(c);
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const input = parseRecurringBody(body, false);

  const category = await useCategory(storeId, input.category!);
  const now = new Date().toISOString();
  const ref = await recurringOf(storeId).add({
    title: input.title,
    days: input.days,
    importance: input.importance,
    categoryId: category.id,
    categoryName: category.name,
    categoryHue: category.hue,
    checklist: input.checklist ?? null,
    generatedThrough: null,
    createdAt: now,
    updatedAt: now,
  });
  await pruneCategories(storeId, category.id);
  return c.json(serialize(await ref.get()), 201);
});

/**
 * Copy a store's recurring tasks into another store, skipping titles the target
 * already has so that copying twice doesn't duplicate anything. Used by the
 * dashboard (admins only); this router's PIN tokens are per store.
 */
export async function copyRecurringTasks(sourceStoreId: string, targetStoreId: string) {
  const [source, target] = await Promise.all([recurringOf(sourceStoreId).get(), recurringOf(targetStoreId).get()]);
  const existing = new Set(target.docs.map((d) => String(d.data().title).toLocaleLowerCase()));
  let copied = 0;
  let skipped = 0;

  for (const doc of source.docs) {
    const data = doc.data();
    if (existing.has(String(data.title).toLocaleLowerCase())) {
      skipped++;
      continue;
    }
    // Categories belong to a store, so the target gets its own (with its own colour).
    const category = await useCategory(targetStoreId, data.categoryName);
    const now = new Date().toISOString();
    await recurringOf(targetStoreId).add({
      title: data.title,
      days: data.days,
      importance: data.importance,
      categoryId: category.id,
      categoryName: category.name,
      categoryHue: category.hue,
      checklist: data.checklist ?? null,
      generatedThrough: null,
      createdAt: now,
      updatedAt: now,
    });
    copied++;
  }
  return { copied, skipped };
}

// ─── PATCH /api/todo/stores/:storeId/recurring/:recurringId ───────────────────
todo.patch("/stores/:storeId/recurring/:recurringId", async (c) => {
  const storeId = storeIdParam(c);
  const recurringId = c.req.param("recurringId");
  if (!ID_PATTERN.test(recurringId)) throw new HTTPException(404, { message: "Recurring task not found" });

  const ref = recurringOf(storeId).doc(recurringId);
  const current = await ref.get();
  if (!current.exists) throw new HTTPException(404, { message: "Recurring task not found" });

  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const input = parseRecurringBody(body, true);
  const update: Record<string, unknown> = { updatedAt: new Date().toISOString(), generatedThrough: null };
  if (input.title) update.title = input.title;
  if (input.days) update.days = input.days;
  if (input.importance) update.importance = input.importance;
  if ("checklist" in input) update.checklist = input.checklist ?? null;
  if (input.category && categoryKey(input.category) !== current.data()!.categoryId) {
    const category = await useCategory(storeId, input.category);
    update.categoryId = category.id;
    update.categoryName = category.name;
    update.categoryHue = category.hue;
  }

  await ref.update(update);
  await refreshOpenCopies(storeId, recurringId, storeToday(body.today));
  if (update.categoryId) await pruneCategories(storeId, update.categoryId as string);
  return c.json(serialize(await ref.get()));
});

// ─── DELETE /api/todo/stores/:storeId/recurring/:recurringId ──────────────────
todo.delete("/stores/:storeId/recurring/:recurringId", async (c) => {
  const storeId = storeIdParam(c);
  const recurringId = c.req.param("recurringId");
  if (!ID_PATTERN.test(recurringId)) throw new HTTPException(404, { message: "Recurring task not found" });
  await recurringOf(storeId).doc(recurringId).delete();
  await removeOpenCopies(storeId, recurringId, storeToday(c.req.query("today")));
  return c.json({ ok: true });
});

// ─── POST /api/todo/stores/:storeId/tasks ─────────────────────────────────────
todo.post("/stores/:storeId/tasks", async (c) => {
  const storeId = storeIdParam(c);
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));

  const title = cleanText(body.title);
  const categoryName = cleanText(body.category);
  if (!title || title.length > MAX_TITLE) throw new HTTPException(400, { message: "Invalid title" });
  if (!categoryName || categoryName.length > MAX_CATEGORY) throw new HTTPException(400, { message: "Invalid category" });
  if (!isValidDate(body.dueDate)) throw new HTTPException(400, { message: "Invalid due date" });
  if (![1, 2, 3].includes(body.importance as number)) throw new HTTPException(400, { message: "Invalid importance" });
  const checklist = parseTaskChecklist(body.checklist);

  const category = await useCategory(storeId, categoryName);
  // Name and colour are copied onto the task so it still renders after its category
  // has been cleaned up.
  const ref = await tasksOf(storeId).add({
    title,
    dueDate: body.dueDate,
    importance: body.importance,
    categoryId: category.id,
    categoryName: category.name,
    categoryHue: category.hue,
    checklist,
    completedAt: null,
    createdAt: new Date().toISOString(),
  });
  await pruneCategories(storeId, category.id);

  return c.json(serialize(await ref.get()), 201);
});

// ─── PATCH /api/todo/stores/:storeId/tasks/:taskId — edit, complete, reopen ───
todo.patch("/stores/:storeId/tasks/:taskId", async (c) => {
  const storeId = storeIdParam(c);
  const taskId = c.req.param("taskId");
  if (!ID_PATTERN.test(taskId)) throw new HTTPException(404, { message: "Task not found" });

  const ref = tasksOf(storeId).doc(taskId);
  const current = await ref.get();
  if (!current.exists) throw new HTTPException(404, { message: "Task not found" });

  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const update: Record<string, unknown> = {};

  // Ticking one checklist item. A transaction on just that item, so two people
  // ticking different items at the same moment don't undo each other.
  if ("checkItem" in body) {
    const { index, done } = (body.checkItem ?? {}) as { index?: unknown; done?: unknown };
    if (!Number.isInteger(index) || typeof done !== "boolean") {
      throw new HTTPException(400, { message: "Invalid checklist update" });
    }
    await db.runTransaction(async (tx) => {
      const list = (await tx.get(ref)).data()?.checklist as ChecklistItem[] | null | undefined;
      if (!Array.isArray(list) || (index as number) < 0 || (index as number) >= list.length) {
        throw new HTTPException(400, { message: "Invalid checklist item" });
      }
      list[index as number] = { ...list[index as number], done };
      tx.update(ref, { checklist: list });
    });
  }

  if ("title" in body) {
    const title = cleanText(body.title);
    if (!title || title.length > MAX_TITLE) throw new HTTPException(400, { message: "Invalid title" });
    update.title = title;
  }
  if ("dueDate" in body) {
    if (!isValidDate(body.dueDate)) throw new HTTPException(400, { message: "Invalid due date" });
    update.dueDate = body.dueDate;
  }
  if ("importance" in body) {
    if (![1, 2, 3].includes(body.importance as number)) throw new HTTPException(400, { message: "Invalid importance" });
    update.importance = body.importance;
  }
  if ("checklist" in body) update.checklist = parseTaskChecklist(body.checklist);
  if ("completed" in body) {
    if (typeof body.completed !== "boolean") throw new HTTPException(400, { message: "Invalid completed flag" });
    update.completedAt = body.completed ? new Date().toISOString() : null;
  }
  if ("category" in body) {
    const name = cleanText(body.category);
    if (!name || name.length > MAX_CATEGORY) throw new HTTPException(400, { message: "Invalid category" });
    if (categoryKey(name) !== current.data()!.categoryId) {
      const category = await useCategory(storeId, name);
      update.categoryId = category.id;
      update.categoryName = category.name;
      update.categoryHue = category.hue;
    }
  }

  if (Object.keys(update).length) await ref.update(update);
  if (update.categoryId) await pruneCategories(storeId, update.categoryId as string);

  return c.json(serialize(await ref.get()));
});

// ─── DELETE /api/todo/stores/:storeId/tasks/:taskId ───────────────────────────
todo.delete("/stores/:storeId/tasks/:taskId", async (c) => {
  const storeId = storeIdParam(c);
  const taskId = c.req.param("taskId");
  if (!ID_PATTERN.test(taskId)) throw new HTTPException(404, { message: "Task not found" });
  await tasksOf(storeId).doc(taskId).delete();
  return c.json({ ok: true });
});

// The stock card: ideal quantities, counting, and what to prepare. After the token check above.
todo.route("/stores/:storeId/stock", stockRouter);

export { todo as todoRouter };
