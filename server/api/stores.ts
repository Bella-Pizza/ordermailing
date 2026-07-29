import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { adminAuth, db } from "../firebase-admin";
import { copyStoreSuppliers } from "../store-access";

const stores = new Hono();

// ─── Auth middleware ──────────────────────────────────────────────────────────
stores.use("*", async (c, next) => {
  const authorization = c.req.header("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new HTTPException(401, { message: "Missing or invalid Authorization header" });
  }
  try {
    const idToken = authorization.slice(7);
    const decoded = await adminAuth.verifyIdToken(idToken);
    c.set("uid", decoded.uid);
    const userDoc = await db.collection("users").doc(decoded.uid).get();
    c.set("role", userDoc.exists ? (userDoc.data()?.role ?? "user") : "user");
    c.set("storeIds", (userDoc.data()?.storeIds as string[]) ?? []);
  } catch {
    throw new HTTPException(401, { message: "Invalid or expired token" });
  }
  return next();
});

function requireAdmin(c: any) {
  if (c.get("role") !== "admin") {
    throw new HTTPException(403, { message: "Only admins can manage stores" });
  }
}

// ─── GET /api/stores — stores the current user can access ────────────────────
stores.get("/", async (c) => {
  const role = c.get("role");
  const snapshot = await db.collection("stores").orderBy("name").get();
  let docs = snapshot.docs;

  if (role !== "admin") {
    const storeIds = (c.get("storeIds") as string[] | undefined) ?? [];
    docs = docs.filter((d) => storeIds.includes(d.id));
  }

  const list = docs.map((d) => ({ id: d.id, ...d.data() }));
  return c.json(list);
});

// ─── POST /api/stores — create a store (admin) ───────────────────────────────
// Optional `copyFromStoreId` clones suppliers + products from another store.
stores.post("/", async (c) => {
  requireAdmin(c);
  const body = await c.req.json<{
    name: string;
    address?: string;
    vatNumber?: string;
    phone?: string;
    contactEmail?: string;
    copyFromStoreId?: string;
  }>();

  if (!body.name?.trim()) {
    throw new HTTPException(400, { message: "Store name is required" });
  }

  const ref = await db.collection("stores").add({
    name: body.name.trim(),
    address: body.address ?? "",
    vatNumber: body.vatNumber ?? "",
    phone: body.phone ?? "",
    contactEmail: body.contactEmail ?? "",
    createdAt: new Date().toISOString(),
  });

  let copied: { suppliersCopied: number; productsCopied: number } | undefined;
  if (body.copyFromStoreId) {
    copied = await copyStoreSuppliers(body.copyFromStoreId, ref.id);
  }

  const doc = await ref.get();
  return c.json({ id: ref.id, ...doc.data(), copied }, 201);
});

// ─── PATCH /api/stores/:id — update store details (admin) ────────────────────
stores.patch("/:id", async (c) => {
  requireAdmin(c);
  const id = c.req.param("id");
  const body = await c.req.json<Partial<{
    name: string;
    address: string;
    vatNumber: string;
    phone: string;
    contactEmail: string;
  }>>();

  const allowed: (keyof typeof body)[] = ["name", "address", "vatNumber", "phone", "contactEmail"];
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }
  await db.collection("stores").doc(id).update(update);
  return c.json({ ok: true });
});

// ─── DELETE /api/stores/:id — delete store + its suppliers/products (admin) ───
stores.delete("/:id", async (c) => {
  requireAdmin(c);
  const id = c.req.param("id");

  const suppliersSnap = await db.collection("suppliers").where("storeId", "==", id).get();
  for (const supplierDoc of suppliersSnap.docs) {
    const productsSnap = await supplierDoc.ref.collection("products").get();
    const batch = db.batch();
    productsSnap.docs.forEach((p) => batch.delete(p.ref));
    batch.delete(supplierDoc.ref);
    await batch.commit();
  }

  await db.collection("stores").doc(id).delete();
  return c.json({ ok: true });
});

// ─── POST /api/stores/:id/copy-products — clone from another store (admin) ───
// OVERRIDES the target store's current suppliers + products.
stores.post("/:id/copy-products", async (c) => {
  requireAdmin(c);
  const targetStoreId = c.req.param("id");
  const { sourceStoreId } = await c.req.json<{ sourceStoreId: string }>();

  if (!sourceStoreId) throw new HTTPException(400, { message: "sourceStoreId is required" });
  if (sourceStoreId === targetStoreId) {
    throw new HTTPException(400, { message: "Source and target store must be different" });
  }

  const copied = await copyStoreSuppliers(sourceStoreId, targetStoreId);
  return c.json({ ok: true, ...copied });
});

// ─── POST /api/stores/migrate — one-time backfill (admin, idempotent) ────────
// Creates a default store, assigns all suppliers/orders without a storeId to it,
// and grants every existing user access to it.
stores.post("/migrate", async (c) => {
  requireAdmin(c);
  const { name } = await c.req.json<{ name?: string }>().catch(() => ({ name: undefined }));
  const storeName = name?.trim() || "Bella Pizza";

  // Reuse an existing default store if migration already ran
  const existing = await db.collection("stores").where("isDefault", "==", true).limit(1).get();
  let storeId: string;
  if (!existing.empty) {
    storeId = existing.docs[0].id;
  } else {
    const ref = await db.collection("stores").add({
      name: storeName,
      address: process.env.SHOP_ADDRESS ?? "",
      vatNumber: process.env.SHOP_VAT_NUMBER ?? "",
      phone: process.env.SHOP_PHONE ?? "",
      contactEmail: process.env.SHOP_EMAIL ?? "",
      isDefault: true,
      createdAt: new Date().toISOString(),
    });
    storeId = ref.id;
  }

  // Backfill suppliers
  let suppliersUpdated = 0;
  const suppliersSnap = await db.collection("suppliers").get();
  for (const doc of suppliersSnap.docs) {
    if (!doc.data().storeId) {
      await doc.ref.update({ storeId });
      suppliersUpdated++;
    }
  }

  // Backfill orders
  let ordersUpdated = 0;
  const ordersSnap = await db.collection("orders").get();
  for (const doc of ordersSnap.docs) {
    if (!doc.data().storeId) {
      await doc.ref.update({ storeId });
      ordersUpdated++;
    }
  }

  // Grant all users access to the default store
  let usersUpdated = 0;
  const usersSnap = await db.collection("users").get();
  for (const doc of usersSnap.docs) {
    const storeIds: string[] = doc.data().storeIds ?? [];
    if (!storeIds.includes(storeId)) {
      await doc.ref.update({ storeIds: [...storeIds, storeId] });
      usersUpdated++;
    }
  }

  return c.json({ ok: true, storeId, suppliersUpdated, ordersUpdated, usersUpdated });
});

export { stores as storesRouter };
