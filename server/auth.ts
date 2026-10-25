import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { adminAuth, db } from "./firebase-admin";

function bearerToken(c: Context): string {
  const authorization = c.req.header("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new HTTPException(401, { message: "Missing or invalid Authorization header" });
  }
  return authorization.slice(7);
}

/** Verify the caller's ID token. Sets `uid` and `email`. */
export const verifyAuth: MiddlewareHandler = async (c, next) => {
  const idToken = bearerToken(c);
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    c.set("uid", decoded.uid);
    c.set("email", decoded.email ?? "");
  } catch {
    throw new HTTPException(401, { message: "Invalid or expired token" });
  }
  return next();
};

/**
 * Verify the caller's ID token and load their profile once per request. Sets
 * `uid`, `email`, `role` and `storeIds` so downstream handlers (and
 * `resolveStoreId`) never have to re-read `users/{uid}`.
 */
export const verifyAuthWithProfile: MiddlewareHandler = async (c, next) => {
  const idToken = bearerToken(c);
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    const userDoc = await db.collection("users").doc(decoded.uid).get();
    const profile = userDoc.data();
    c.set("uid", decoded.uid);
    c.set("email", decoded.email ?? "");
    c.set("role", profile?.role ?? "user");
    c.set("storeIds", (profile?.storeIds as string[]) ?? []);
    c.set("profile", profile ?? null);
  } catch {
    throw new HTTPException(401, { message: "Invalid or expired token" });
  }
  return next();
};
