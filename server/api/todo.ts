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

  const openSnap = await tasksOf(storeId).where("completedAt", "==", null).select("categoryId").limit(MAX_OPEN).get();
  const inUse = new Set(openSnap.docs.map((d) => d.data().categoryId));

  const batch = db.batch();
  candidates.filter((c) => !inUse.has(c.id)).forEach((c) => batch.delete(c.ref));
  await batch.commit();
}

const serialize = (doc: FirebaseFirestore.DocumentSnapshot) => ({ id: doc.id, ...doc.data() });

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
  });
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
