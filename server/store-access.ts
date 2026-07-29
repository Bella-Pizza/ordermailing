import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { db } from "./firebase-admin";

export const ALL_STORES = "__all__";

/**
 * Resolve and authorise the active store for a request. The client sends the
 * selected store via the `X-Store-Id` header. Admins may act on any store (and
 * may pass `__all__` on read endpoints); non-admins must be assigned to it.
 * Returns the storeId, or `null` when an admin requested the "all stores" view.
 */
export async function resolveStoreId(c: Context, opts?: { allowAll?: false }): Promise<string>;
export async function resolveStoreId(c: Context, opts: { allowAll: true }): Promise<string | null>;
export async function resolveStoreId(c: Context, opts: { allowAll?: boolean } = {}): Promise<string | null> {
  const storeId = c.req.header("X-Store-Id");
  const role = c.get("role");

  if (!storeId) {
    throw new HTTPException(400, { message: "No store selected (missing X-Store-Id header)" });
  }

  if (storeId === ALL_STORES) {
    if (role === "admin" && opts.allowAll) return null;
    throw new HTTPException(403, { message: "Not allowed to view all stores" });
  }

  if (role === "admin") return storeId;

  const uid = c.get("uid") as string;
  const userDoc = await db.collection("users").doc(uid).get();
  const storeIds: string[] = (userDoc.data()?.storeIds as string[]) ?? [];
  if (!storeIds.includes(storeId)) {
    throw new HTTPException(403, { message: "You do not have access to this store" });
  }
  return storeId;
}

/**
 * Delete every supplier (and its products) belonging to a store, then copy all
 * suppliers + products from `sourceStoreId` into `targetStoreId`. Overrides the
 * target store's current suppliers/products entirely.
 */
export async function copyStoreSuppliers(sourceStoreId: string, targetStoreId: string): Promise<{
  suppliersCopied: number;
  productsCopied: number;
}> {
  // 1. Wipe target store's suppliers + products
  const targetSnap = await db.collection("suppliers").where("storeId", "==", targetStoreId).get();
  for (const supplierDoc of targetSnap.docs) {
    const productsSnap = await supplierDoc.ref.collection("products").get();
    const batch = db.batch();
    productsSnap.docs.forEach((p) => batch.delete(p.ref));
    batch.delete(supplierDoc.ref);
    await batch.commit();
  }

  // 2. Copy source store's suppliers + products
  const sourceSnap = await db.collection("suppliers").where("storeId", "==", sourceStoreId).get();
  let suppliersCopied = 0;
  let productsCopied = 0;

  for (const supplierDoc of sourceSnap.docs) {
    const data = supplierDoc.data();
    const newSupplier = await db.collection("suppliers").add({
      name: data.name,
      email: data.email ?? "",
      description: data.description ?? "",
      isActive: data.isActive ?? true,
      storeId: targetStoreId,
      createdAt: new Date().toISOString(),
    });
    suppliersCopied++;

    const productsSnap = await supplierDoc.ref.collection("products").get();
    for (const p of productsSnap.docs) {
      const pd = p.data();
      await newSupplier.collection("products").add({ ...pd, createdAt: pd.createdAt ?? new Date().toISOString() });
      productsCopied++;
    }
  }

  return { suppliersCopied, productsCopied };
}
