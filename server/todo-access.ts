import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "./firebase-admin";

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export const DEFAULT_TODO_PIN = "0000";
const PIN_PATTERN = /^\d{4}$/;
const MAX_ATTEMPTS = 5;
const MAX_LOCK_MINUTES = 60;

export const isValidPin = (pin: unknown): pin is string => typeof pin === "string" && PIN_PATTERN.test(pin);

/**
 * Secrets for a store's to-do list. Deliberately a subdocument rather than fields
 * on the store: every store route returns the store document as-is, and non-admin
 * users can read those responses. Nothing outside this module reads this doc.
 */
function accessRef(storeId: string) {
  return db.collection("stores").doc(storeId).collection("private").doc("todoAccess");
}

async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(pin, salt, 32);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

async function pinMatches(pin: string, stored: string | undefined): Promise<boolean> {
  if (!stored) return pin === DEFAULT_TODO_PIN;
  const [salt, hash] = stored.split(":");
  const expected = Buffer.from(hash, "hex");
  const derived = await scryptAsync(pin, Buffer.from(salt, "hex"), expected.length);
  return timingSafeEqual(derived, expected);
}

const newToken = () => randomBytes(32).toString("hex");

export type VerifyResult =
  | { status: "ok"; token: string }
  | { status: "wrong" }
  | { status: "locked"; retryAfterSeconds: number }
  | { status: "not_found" };

/**
 * Check a PIN and hand back the store's access token. Failures count per store and
 * survive across serverless instances, so a four-digit PIN can't be enumerated:
 * every fifth wrong attempt locks for 1, 2, 4... minutes, capped at an hour.
 * Browsers that already hold the token are unaffected by a lockout.
 */
export function verifyTodoPin(storeId: string, pin: string): Promise<VerifyResult> {
  const storeRef = db.collection("stores").doc(storeId);
  const ref = accessRef(storeId);

  return db.runTransaction(async (tx): Promise<VerifyResult> => {
    const [storeSnap, accessSnap] = [await tx.get(storeRef), await tx.get(ref)];
    if (!storeSnap.exists) return { status: "not_found" };

    const access = accessSnap.data() ?? {};
    const now = Date.now();
    if (typeof access.lockedUntil === "number" && access.lockedUntil > now) {
      return { status: "locked", retryAfterSeconds: Math.ceil((access.lockedUntil - now) / 1000) };
    }

    if (await pinMatches(pin, access.pinHash)) {
      const token: string = access.accessToken ?? newToken();
      tx.set(ref, { accessToken: token, failedAttempts: 0, lockouts: 0, lockedUntil: null }, { merge: true });
      return { status: "ok", token };
    }

    const failedAttempts = (access.failedAttempts ?? 0) + 1;
    if (failedAttempts < MAX_ATTEMPTS) {
      tx.set(ref, { failedAttempts }, { merge: true });
      return { status: "wrong" };
    }

    const lockouts = (access.lockouts ?? 0) + 1;
    const minutes = Math.min(2 ** (lockouts - 1), MAX_LOCK_MINUTES);
    tx.set(ref, { failedAttempts: 0, lockouts, lockedUntil: now + minutes * 60_000 }, { merge: true });
    return { status: "locked", retryAfterSeconds: minutes * 60 };
  });
}

export async function todoTokenIsValid(storeId: string, token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const snap = await accessRef(storeId).get();
  const expected: unknown = snap.data()?.accessToken;
  if (typeof expected !== "string") return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Change a store's PIN. Replacing the token signs out every remembered browser,
 * which is the only way to revoke access from someone who shouldn't have it.
 * `todoPinCustom` is a non-secret flag so the dashboard can warn about the default.
 */
export async function setTodoPin(storeId: string, pin: string): Promise<void> {
  const batch = db.batch();
  batch.set(
    accessRef(storeId),
    {
      pinHash: await hashPin(pin),
      accessToken: newToken(),
      failedAttempts: 0,
      lockouts: 0,
      lockedUntil: null,
      pinChangedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  batch.update(db.collection("stores").doc(storeId), { todoPinCustom: pin !== DEFAULT_TODO_PIN });
  await batch.commit();
}
