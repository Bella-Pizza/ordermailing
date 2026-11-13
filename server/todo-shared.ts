import { createHash } from "node:crypto";
import { HTTPException } from "hono/http-exception";
import { db } from "./firebase-admin";

// Helpers shared by the to-do routes (api/todo.ts) and the stock card (stock.ts).

export const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
export const MAX_OPEN = 500;

// Automatic category clean-up: dropped once unused for this long, or when they fall
// outside the most-used MAX_CATEGORIES. Categories on open tasks are always kept.
const MAX_CATEGORIES = 20;
const CATEGORY_STALE_DAYS = 60;

const storeRef = (storeId: string) => db.collection("stores").doc(storeId);
export const tasksOf = (storeId: string) => storeRef(storeId).collection("todos");
export const categoriesOf = (storeId: string) => storeRef(storeId).collection("todoCategories");
export const recurringOf = (storeId: string) => storeRef(storeId).collection("todoRecurring");
export const stockConfigOf = (storeId: string) => storeRef(storeId).collection("stock").doc("config");
export const stockCountsOf = (storeId: string) => storeRef(storeId).collection("stockCounts");

/** Firestore's "already exists" error code, which makes a fixed-ID create() safe to repeat. */
export const ALREADY_EXISTS = 6;

/** Reject IDs Firestore would treat as a path before they reach `.doc()`. */
export function storeIdParam(c: any): string {
  const id = c.req.param("storeId");
  if (!ID_PATTERN.test(id)) throw new HTTPException(404, { message: "Store not found" });
  return id;
}

export function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** 1 = Monday ... 7 = Sunday */
export function isoWeekday(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
}

/**
 * "Today" as the store sees it. The server runs in UTC while stores don't, so the
 * page sends its own date. It's only trusted within a couple of days of the server
 * clock, so nobody can create copies of recurring tasks for arbitrary dates.
 */
export function storeToday(value: unknown): string {
  const serverToday = new Date().toISOString().slice(0, 10);
  if (!isValidDate(value)) return serverToday;
  const drift = Math.abs(Date.parse(`${value}T00:00:00Z`) - Date.parse(`${serverToday}T00:00:00Z`));
  return drift <= 2 * 86_400_000 ? value : serverToday;
}

export const cleanText = (value: unknown) => (typeof value === "string" ? value.normalize("NFC").trim().replace(/\s+/g, " ") : "");

export function categoryKey(name: string): string {
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
export function useCategory(storeId: string, name: string) {
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

export async function pruneCategories(storeId: string, justUsedId: string) {
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

export const serialize = (doc: FirebaseFirestore.DocumentSnapshot) => ({ id: doc.id, ...doc.data() });
