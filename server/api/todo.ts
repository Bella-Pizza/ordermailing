import { createHash } from "node:crypto";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { db } from "../firebase-admin";
import { isValidPin, todoTokenIsValid, verifyTodoPin } from "../todo-access";

// Public router: there is no Firebase login here. Everything except the store list
// and PIN check requires the per-store token that a correct PIN hands out.
const todo = new Hono();

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_TITLE = 200;
const MAX_CATEGORY = 40;
const MAX_OPEN = 500;
const MAX_COMPLETED = 100;

// Automatic category clean-up: dropped once unused for this long, or when they fall
// outside the most-used MAX_CATEGORIES. Categories on open tasks are always kept.
const MAX_CATEGORIES = 20;
const CATEGORY_STALE_DAYS = 60;

const tasksOf = (storeId: string) => db.collection("stores").doc(storeId).collection("todos");
const categoriesOf = (storeId: string) => db.collection("stores").doc(storeId).collection("todoCategories");
const recurringOf = (storeId: string) => db.collection("stores").doc(storeId).collection("todoRecurring");

/** Reject IDs Firestore would treat as a path before they reach `.doc()`. */
function storeIdParam(c: any): string {
  const id = c.req.param("storeId");
  if (!ID_PATTERN.test(id)) throw new HTTPException(404, { message: "Store not found" });
  return id;
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** 1 = Monday ... 7 = Sunday */
function isoWeekday(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
}

/**
 * "Today" as the store sees it. The server runs in UTC while stores don't, so the
 * page sends its own date. It's only trusted within a couple of days of the server
 * clock, so nobody can create copies of recurring tasks for arbitrary dates.
 */
function storeToday(value: unknown): string {
  const serverToday = new Date().toISOString().slice(0, 10);
  if (!isValidDate(value)) return serverToday;
  const drift = Math.abs(Date.parse(`${value}T00:00:00Z`) - Date.parse(`${serverToday}T00:00:00Z`));
  return drift <= 2 * 86_400_000 ? value : serverToday;
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

const cleanText = (value: unknown) => (typeof value === "string" ? value.normalize("NFC").trim().replace(/\s+/g, " ") : "");

function categoryKey(name: string): string {
  return createHash("sha256").update(name.toLocaleLowerCase()).digest("hex").slice(0, 20);
}

const hueDistance = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/** A random hue, taking the best of a few tries so categories stay tellable apart. */
function randomHue(taken: number[]): number {
  let best = Math.floor(Math.random() * 360);
  let bestGap = -1;
  for (let i = 0; i < 8; i++) {
    const hue = Math.floor(Math.random() * 360);
    const gap = taken.length ? Math.min(...taken.map((t) => hueDistance(t, hue))) : 360;
    if (gap > bestGap) {
      best = hue;
      bestGap = gap;
    }
  }
  return best;
}

/** Record one use of a category, creating it (with a random colour) if it's new. */
function useCategory(storeId: string, name: string) {
  const collection = categoriesOf(storeId);
  const id = categoryKey(name);
  const ref = collection.doc(id);
  const now = new Date().toISOString();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const data = snap.data()!;
      tx.update(ref, { useCount: (data.useCount ?? 0) + 1, lastUsedAt: now });
      return { id, name: data.name as string, hue: data.hue as number };
    }
    const all = await tx.get(collection);
    const hue = randomHue(all.docs.map((d) => d.data().hue as number));
    tx.set(ref, { name, hue, useCount: 1, lastUsedAt: now, createdAt: now });
    return { id, name, hue };
  });
}

async function pruneCategories(storeId: string, justUsedId: string) {
  const snap = await categoriesOf(storeId).get();
  const staleBefore = new Date(Date.now() - CATEGORY_STALE_DAYS * 86_400_000).toISOString();

  // The category just used always stays, so it takes up one of the MAX_CATEGORIES
  // slots whatever its count: a brand-new one has the lowest count of all.
  const others = snap.docs
    .filter((d) => d.id !== justUsedId)
    .map((d) => ({ ref: d.ref, id: d.id, useCount: d.data().useCount ?? 0, lastUsedAt: String(d.data().lastUsedAt ?? "") }))
    .sort((a, b) => b.useCount - a.useCount || b.lastUsedAt.localeCompare(a.lastUsedAt));

  const candidates = others.filter((c, rank) => rank >= MAX_CATEGORIES - 1 || c.lastUsedAt < staleBefore);
  if (!candidates.length) return;

  // A recurring task keeps needing its category, however long it's been since anyone picked it.
  const [openSnap, recurringSnap] = await Promise.all([
    tasksOf(storeId).where("completedAt", "==", null).select("categoryId").limit(MAX_OPEN).get(),
    recurringOf(storeId).select("categoryId").get(),
  ]);
  const inUse = new Set([...openSnap.docs, ...recurringSnap.docs].map((d) => d.data().categoryId));

  const batch = db.batch();
  candidates.filter((c) => !inUse.has(c.id)).forEach((c) => batch.delete(c.ref));
  await batch.commit();
}

const serialize = (doc: FirebaseFirestore.DocumentSnapshot) => ({ id: doc.id, ...doc.data() });

// ─── Recurring tasks ──────────────────────────────────────────────────────────
// A recurring task is a template. Each day it's due, a normal task is created from
// it, so completing, swiping and undo all work unchanged. Copies are only made for
// today and tomorrow, when someone opens the list: a day nobody opened is skipped
// instead of piling up as overdue work.

const ALREADY_EXISTS = 6;

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
 * After a template changes or goes away, drop its copies that nobody has completed
 * yet from today on. The next load recreates them from the updated template, while
 * completed ones stay as a record.
 */
async function removeOpenCopies(storeId: string, recurringId: string, today: string) {
  const snap = await tasksOf(storeId).where("recurringId", "==", recurringId).get();
  const batch = db.batch();
  snap.docs
    .filter((d) => d.data().completedAt === null && d.data().dueDate >= today)
    .forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

function parseRecurringBody(body: Record<string, unknown>, partial: boolean) {
  const update: { title?: string; days?: number[]; importance?: number; category?: string } = {};
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

  const templates = await recurringOf(storeId).get();
  await createRecurringCopies(storeId, storeToday(c.req.query("today")), templates.docs);

  // `> ""` keeps this on Firestore's automatic single-field index and skips open
  // tasks, whose completedAt is null. No composite index needs deploying.
  const [store, open, completed, categories] = await Promise.all([
    db.collection("stores").doc(storeId).get(),
    tasks.where("completedAt", "==", null).limit(MAX_OPEN).get(),
    tasks.where("completedAt", ">", "").orderBy("completedAt", "desc").limit(MAX_COMPLETED).get(),
    categoriesOf(storeId).orderBy("useCount", "desc").get(),
  ]);
  if (!store.exists) throw new HTTPException(404, { message: "Store not found" });

  return c.json({
    storeName: store.data()!.name,
    open: open.docs.map(serialize),
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
    generatedThrough: null,
    createdAt: now,
    updatedAt: now,
  });
  await pruneCategories(storeId, category.id);
  return c.json(serialize(await ref.get()), 201);
});

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
  if (input.category && categoryKey(input.category) !== current.data()!.categoryId) {
    const category = await useCategory(storeId, input.category);
    update.categoryId = category.id;
    update.categoryName = category.name;
    update.categoryHue = category.hue;
  }

  await ref.update(update);
  await removeOpenCopies(storeId, recurringId, storeToday(body.today));
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

export { todo as todoRouter };
