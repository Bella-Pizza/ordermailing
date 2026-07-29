import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { adminAuth, db } from "../firebase-admin";
import { resolveStoreId } from "../store-access";

const suppliers = new Hono();

/** Fetch a supplier and assert it belongs to the resolved store. */
async function getScopedSupplier(id: string, storeId: string) {
  const doc = await db.collection("suppliers").doc(id).get();
  if (!doc.exists || doc.data()?.storeId !== storeId) {
    throw new HTTPException(404, { message: "Supplier not found" });
  }
  return doc;
}

// ─── Auth middleware ──────────────────────────────────────────────────────────
suppliers.use("*", async (c, next) => {
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
  } catch {
    throw new HTTPException(401, { message: "Invalid or expired token" });
  }

  return next();
});

// ─── GET /api/suppliers ───────────────────────────────────────────────────────
suppliers.get("/", async (c) => {
  const storeId = await resolveStoreId(c);
  const snapshot = await db.collection("suppliers").where("storeId", "==", storeId).get();
  const list = await Promise.all(
    snapshot.docs.map(async (doc) => {
      const productsSnap = await db.collection("suppliers").doc(doc.id).collection("products").get();
      return { id: doc.id, ...doc.data(), productCount: productsSnap.size };
    }),
  );
  // Sort by name in-memory to avoid a composite (storeId + name) index
  list.sort((a: any, b: any) => (a.name ?? "").localeCompare(b.name ?? ""));
  return c.json(list);
});

// ─── POST /api/suppliers ──────────────────────────────────────────────────────
suppliers.post("/", async (c) => {
  const storeId = await resolveStoreId(c);
  const { name, email, isActive } = await c.req.json<{
    name: string;
    email: string;
    isActive?: boolean;
  }>();

  if (!name || !email) {
    throw new HTTPException(400, { message: "name and email are required" });
  }

  const ref = await db.collection("suppliers").add({
    name,
    email,
    isActive: isActive ?? true,
    storeId,
    createdAt: new Date().toISOString(),
  });

  const doc = await ref.get();
  return c.json({ id: ref.id, ...doc.data(), productCount: 0 }, 201);
});

// ─── PATCH /api/suppliers/:id ─────────────────────────────────────────────────
suppliers.patch("/:id", async (c) => {
  const storeId = await resolveStoreId(c);
  const id = c.req.param("id");
  await getScopedSupplier(id, storeId);
  const body = await c.req.json<Partial<{ name: string; email: string; isActive: boolean }>>();
  const allowed: (keyof typeof body)[] = ["name", "email", "isActive"];
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }
  await db.collection("suppliers").doc(id).update(update);
  return c.json({ ok: true });
});

// ─── DELETE /api/suppliers/:id ────────────────────────────────────────────────
suppliers.delete("/:id", async (c) => {
  const storeId = await resolveStoreId(c);
  const id = c.req.param("id");
  await getScopedSupplier(id, storeId);
  const productsSnap = await db.collection("suppliers").doc(id).collection("products").get();
  const batch = db.batch();
  productsSnap.docs.forEach((doc) => batch.delete(doc.ref));
  batch.delete(db.collection("suppliers").doc(id));
  await batch.commit();
  return c.json({ ok: true });
});

// ─── GET /api/suppliers/:id/products ─────────────────────────────────────────
suppliers.get("/:id/products", async (c) => {
  const storeId = await resolveStoreId(c);
  const id = c.req.param("id");
  await getScopedSupplier(id, storeId);
  const snapshot = await db.collection("suppliers").doc(id).collection("products").orderBy("displayOrder").get();
  const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  return c.json(list);
});

// ─── POST /api/suppliers/:id/products ────────────────────────────────────────
suppliers.post("/:id/products", async (c) => {
  const storeId = await resolveStoreId(c);
  const id = c.req.param("id");
  await getScopedSupplier(id, storeId);
  const { supplierName, internalName, manualOrder, isActive, idealStock, displayOrder } = await c.req.json<{
    supplierName: string;
    internalName: string;
    manualOrder?: boolean;
    isActive?: boolean;
    idealStock?: number;
    displayOrder?: number;
  }>();

  if (!supplierName || !internalName) {
    throw new HTTPException(400, { message: "supplierName and internalName are required" });
  }

  const ref = await db
    .collection("suppliers")
    .doc(id)
    .collection("products")
    .add({
      supplierName,
      internalName,
      manualOrder: manualOrder ?? false,
      isActive: isActive ?? true,
      idealStock: idealStock ?? 0,
      displayOrder: displayOrder ?? 0,
      createdAt: new Date().toISOString(),
    });

  const doc = await ref.get();
  return c.json({ id: ref.id, ...doc.data() }, 201);
});

// ─── PATCH /api/suppliers/:id/products/:productId ────────────────────────────
suppliers.patch("/:id/products/:productId", async (c) => {
  const storeId = await resolveStoreId(c);
  const id = c.req.param("id");
  await getScopedSupplier(id, storeId);
  const productId = c.req.param("productId");
  const body = await c.req.json<
    Partial<{
      supplierName: string;
      internalName: string;
      manualOrder: boolean;
      isActive: boolean;
      idealStock: number;
      displayOrder: number;
    }>
  >();
  const allowed: (keyof typeof body)[] = [
    "supplierName",
    "internalName",
    "manualOrder",
    "isActive",
    "idealStock",
    "displayOrder",
  ];
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }
  await db.collection("suppliers").doc(id).collection("products").doc(productId).update(update);
  return c.json({ ok: true });
});

// ─── DELETE /api/suppliers/:id/products/:productId ───────────────────────────
suppliers.delete("/:id/products/:productId", async (c) => {
  const storeId = await resolveStoreId(c);
  const id = c.req.param("id");
  await getScopedSupplier(id, storeId);
  const productId = c.req.param("productId");
  await db.collection("suppliers").doc(id).collection("products").doc(productId).delete();
  return c.json({ ok: true });
});

// ─── POST /api/suppliers/import ───────────────────────────────────────────────
// Wipes all existing suppliers+products and replaces with imported data.
// Accepts: root array, { suppliers: [...] }, or { data: [...] }
// Product fields: orderName/supplierName → supplierName, displayName/internalName → internalName
suppliers.post("/import", async (c) => {
  if (c.get("role") !== "admin") {
    throw new HTTPException(403, { message: "Only admins can import supplier data" });
  }
  const storeId = await resolveStoreId(c);

  const body = await c.req.json<unknown>();

  // Normalise to array regardless of wrapper key
  let incoming: unknown[];
  if (Array.isArray(body)) {
    incoming = body;
  } else if (Array.isArray((body as Record<string, unknown>)?.suppliers)) {
    incoming = (body as Record<string, unknown>).suppliers as unknown[];
  } else if (Array.isArray((body as Record<string, unknown>)?.data)) {
    incoming = (body as Record<string, unknown>).data as unknown[];
  } else {
    throw new HTTPException(400, { message: "Expected an array, { suppliers: [...] }, or { data: [...] }" });
  }

  if (incoming.length === 0) {
    throw new HTTPException(400, { message: "Supplier list is empty" });
  }

  // 1. Delete this store's existing suppliers and their products
  const existingSnap = await db.collection("suppliers").where("storeId", "==", storeId).get();
  for (const existingDoc of existingSnap.docs) {
    const productsSnap = await db.collection("suppliers").doc(existingDoc.id).collection("products").get();
    const batch = db.batch();
    productsSnap.docs.forEach((p) => batch.delete(p.ref));
    batch.delete(existingDoc.ref);
    await batch.commit();
  }

  // 2. Insert new suppliers and their products
  let suppliersCreated = 0;
  let productsCreated = 0;

  for (const raw of incoming) {
    const s = raw as Record<string, unknown>;
    if (!s.name) continue;
    const supplierRef = await db.collection("suppliers").add({
      name: s.name,
      email: s.email ?? "",
      description: s.description ?? "",
      isActive: s.isActive ?? true,
      storeId,
      createdAt: new Date().toISOString(),
    });

    suppliersCreated++;

    for (const rawP of (s.products as unknown[] | undefined) ?? []) {
      const p = rawP as Record<string, unknown>;
      // Accept orderName/displayName (new format) or supplierName/internalName (old format)
      const supplierName = (p.orderName ?? p.supplierName ?? "") as string;
      const internalName = (p.displayName ?? p.internalName ?? supplierName) as string;
      if (!supplierName) continue;
      await db
        .collection("suppliers")
        .doc(supplierRef.id)
        .collection("products")
        .add({
          supplierName,
          internalName,
          description: p.description ?? "",
          manualOrder: p.manualOrder ?? false,
          isActive: p.isActive ?? true,
          idealStock: (p.defaultStock ?? p.idealStock ?? 0) as number,
          displayOrder: (p.displayOrder ?? 0) as number,
          createdAt: new Date().toISOString(),
        });
      productsCreated++;
    }
  }

  return c.json({ ok: true, suppliersCreated, productsCreated });
});

export { suppliers as suppliersRouter };
