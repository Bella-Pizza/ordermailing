import { GoogleGenAI } from "@google/genai";
import { Hono } from "hono";
import nodemailer from "nodemailer";
import * as XLSX from "xlsx";

const mailTransporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  connectionTimeout: 8000,
  greetingTimeout: 8000,
  socketTimeout: 8000,
});

async function sendOrderEmail(orderId: string, orderData: any) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS || !orderData.supplierEmail) {
    return;
  }

  const shopName = process.env.SHOP_NAME || "Our Shop";
  const shopEmail = process.env.SHOP_EMAIL || process.env.SMTP_USER;
  const shopPhone = process.env.SHOP_PHONE || "";
  const shopAddress = process.env.SHOP_ADDRESS || "";
  const shopVatNumber = process.env.SHOP_VAT_NUMBER || "";

  const tableRows = (orderData.lines || [])
    .filter((l: any) => l.quantity > 0)
    .map(
      (l: any) => `
      <tr>
        <td style="border: 1px solid #ddd; padding: 8px;">${l.supplierName || l.internalName}</td>
        <td style="border: 1px solid #ddd; padding: 8px;">${l.quantity}</td>
      </tr>
    `,
    )
    .join("");

  const notesSection = orderData.notes
    ? `<br/><p><strong>Additional notes:</strong><br/>${orderData.notes.replace(/\n/g, "<br/>")}</p>`
    : "";

  const html = `
    <p>Please find our order details below:</p>
    <table style="border-collapse: collapse; width: 100%; max-width: 600px; text-align: left;">
      <thead>
        <tr>
          <th style="border: 1px solid #ddd; padding: 8px;">Article</th>
          <th style="border: 1px solid #ddd; padding: 8px;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
    ${notesSection}
    <br/>
    <hr/>
    <p>
      <strong>${shopName}</strong><br/>
      ${shopAddress ? shopAddress + "<br/>" : ""}
      ${shopEmail ? "Email: " + shopEmail + "<br/>" : ""}
      ${shopPhone ? "Phone: " + shopPhone + "<br/>" : ""}
      ${shopVatNumber ? "BTW: " + shopVatNumber + "<br/>" : ""}
    </p>
  `;

  const excelData = (orderData.lines || [])
    .filter((l: any) => l.quantity > 0)
    .map((l: any) => ({
      Article: l.supplierName || l.internalName,
      Amount: l.quantity,
    }));

  const worksheet = XLSX.utils.json_to_sheet(excelData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Order");
  const excelBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const mailOptions = {
    from: `"${shopName}" <${process.env.SMTP_USER}>`,
    to: orderData.supplierEmail,
    cc: process.env.SHOP_EMAIL || process.env.SMTP_USER,
    subject: `Bestelling ${shopName}`,
    html,
    attachments: [
      {
        filename: `Order_Bestelling_${orderId}.xlsx`,
        content: excelBuffer,
      },
    ],
  };

  try {
    await mailTransporter.sendMail(mailOptions);
  } catch (err) {
    console.error("Failed to send order email:", err);
  }
}
import { HTTPException } from "hono/http-exception";
import { adminAuth, db } from "../firebase-admin";
import type { Query } from "firebase-admin/firestore";

type ProductInfo = { id: string; internalName: string; supplierName: string; idealStock: number; manualOrder: boolean };
type PastOrder = { date: string; lines: Array<{ productId: string; name: string; quantity: number }> };

function buildGeminiPrompt(pastOrders: PastOrder[], products: ProductInfo[]): string {
  const productLines = products
    .map((p) => `  "${p.id}" (${p.internalName}): max ${p.manualOrder ? "unlimited" : p.idealStock}`)
    .join("\n");

  const orderHistory =
    pastOrders.length === 0
      ? "  No previous orders."
      : pastOrders
          .map((o, i) => {
            const lines =
              o.lines.length === 0
                ? "    (empty)"
                : o.lines.map((l) => `    "${l.productId}": ${l.quantity}`).join("\n");
            return `  Order ${i + 1} (${o.date}):\n${lines}`;
          })
          .join("\n");

  return `
  You are and expert inventory assistant for a shop. Based on the following product information and past order history, suggest order quantities for each product to restock up to the ideal stock level. Consider trends in the order history, but do not suggest more than the max quantity for each product. If a product is marked as manualOrder, you can suggest any quantity.
  It is better to order less than too much
Products (id → max qty):
${productLines}

Past orders (oldest → newest):
${orderHistory}

If the suggested quantity for a product is significantly different from its typical past order quantity (more than ~30% above or below the average), add a short "note" field explaining why. Write the note in Dutch (e.g. "Stijgende trend over de laatste 3 bestellingen" or "Ongewoon hoog — controleer voor verzending").

Return ONLY JSON:
{"suggestions": [{"productId": "<id>", "quantity": <positive integer>, "note": "<optional, only when notable>"}]}
Only include products where quantity > 0. Never exceed each product's max.
Keep the products in the same order as the input list.
`;
}

const orders = new Hono();

// ─── Auth middleware ──────────────────────────────────────────────────────────
orders.use("*", async (c, next) => {
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

// ─── POST /api/orders/generate-template ──────────────────────────────────────
orders.post("/generate-template", async (c) => {
  const body = await c.req.json<{ supplierId: string; products: ProductInfo[] }>();
  if (!body.supplierId || !Array.isArray(body.products)) {
    throw new HTTPException(400, { message: "supplierId and products are required" });
  }

  const snap = await db
    .collection("orders")
    .where("supplierId", "==", body.supplierId)
    .where("status", "==", "sent")
    .orderBy("createdAt", "asc")
    .limit(5)
    .get();

  const pastOrders: PastOrder[] = snap.docs.map((doc) => {
    const data = doc.data();
    return {
      date: (data.createdAt as string).split("T")[0],
      lines: ((data.lines ?? []) as any[]).map((l) => ({
        productId: l.productId as string,
        name: (l.internalName || l.supplierName) as string,
        quantity: l.quantity as number,
      })),
    };
  });

  const prompt = buildGeminiPrompt(pastOrders, body.products);

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) throw new HTTPException(500, { message: "Gemini API key not configured" });

  const ai = new GoogleGenAI({ apiKey: geminiKey });
  let rawText = "{}";
  try {
    const result = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: prompt,
      config: { responseMimeType: "application/json" },
    });
    rawText = result.text ?? "{}";
  } catch (err) {
    console.error("Gemini SDK error:", err);
    throw new HTTPException(502, { message: "AI service error" });
  }

  let suggestions: Array<{ productId: string; quantity: number }> = [];
  try {
    const parsed = JSON.parse(rawText);
    suggestions = ((parsed.suggestions ?? []) as any[]).filter(
      (s) => typeof s.productId === "string" && typeof s.quantity === "number" && s.quantity > 0,
    );
  } catch {
    throw new HTTPException(502, { message: "Failed to parse AI response" });
  }

  return c.json({ suggestions });
});

// ─── POST /api/orders ─────────────────────────────────────────────────────────
orders.post("/", async (c) => {
  const body = await c.req.json<{
    supplierId: string;
    supplierName: string;
    supplierEmail: string;
    status?: string;
    notes?: string;
    fromAiTemplate?: boolean;
    lines: Array<{
      productId: string;
      supplierName: string;
      internalName: string;
      quantity: number;
    }>;
  }>();

  if (!body.supplierId || !Array.isArray(body.lines)) {
    throw new HTTPException(400, { message: "supplierId and lines are required" });
  }

  const uid = c.get("uid");
  const userDoc = await db.collection("users").doc(uid).get();
  const userName = userDoc.data()?.displayName ?? userDoc.data()?.email ?? uid;

  const ref = await db.collection("orders").add({
    supplierId: body.supplierId,
    supplierName: body.supplierName,
    supplierEmail: body.supplierEmail,
    lines: body.lines,
    notes: body.notes ?? "",
    createdBy: uid,
    createdByName: userName,
    createdAt: new Date().toISOString(),
    status: body.status ?? "sent",
    ...(body.fromAiTemplate && { fromAiTemplate: true }),
  });

  if ((body.status ?? "sent") === "sent") {
    await sendOrderEmail(ref.id, { supplierEmail: body.supplierEmail, lines: body.lines, notes: body.notes ?? "" });
  }

  return c.json({ ok: true, id: ref.id }, 201);
});

// ─── PATCH /api/orders/:id ────────────────────────────────────────────────────
orders.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{
    lines?: Array<{ productId: string; supplierName: string; internalName: string; quantity: number }>;
    status?: string;
    notes?: string;
    fromAiTemplate?: boolean;
  }>();

  const docRef = db.collection("orders").doc(id);
  const snap = await docRef.get();
  if (!snap.exists) throw new HTTPException(404, { message: "Order not found" });

  const uid = c.get("uid");
  if (snap.data()?.createdBy !== uid) throw new HTTPException(403, { message: "Forbidden" });

  const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (body.lines !== undefined) update.lines = body.lines;
  if (body.status !== undefined) update.status = body.status;
  if (body.notes !== undefined) update.notes = body.notes;
  if (body.fromAiTemplate) update.fromAiTemplate = true;

  await docRef.update(update);

  if (body.status === "sent" && snap.data()?.status !== "sent") {
    const orderData = {
      ...snap.data(),
      ...(body.lines !== undefined && { lines: body.lines }),
      ...(body.notes !== undefined && { notes: body.notes }),
    };
    await sendOrderEmail(id, orderData);
  }

  return c.json({ ok: true });
});
// ─── DELETE /api/orders/:id ────────────────────────────────────────────────────
orders.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const docRef = db.collection("orders").doc(id);
  const snap = await docRef.get();
  if (!snap.exists) return c.json({ ok: true }); // already gone

  const uid = c.get("uid");
  if (snap.data()?.createdBy !== uid) throw new HTTPException(403, { message: "Forbidden" });

  await docRef.delete();
  return c.json({ ok: true });
});
// ─── GET /api/orders ──────────────────────────────────────────────────────────
orders.get("/", async (c) => {
  const PAGE_SIZE = 10;
  const status = c.req.query("status") || null;
  const after = c.req.query("after") || null; // createdAt cursor value

  let q: Query = db.collection("orders");
  if (status) q = q.where("status", "==", status);
  q = q.orderBy("createdAt", "desc");
  if (after) q = q.startAfter(after);
  q = q.limit(PAGE_SIZE + 1);

  const snap = await q.get();
  const hasMore = snap.docs.length > PAGE_SIZE;
  const docs = snap.docs.slice(0, PAGE_SIZE);
  const items = docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const last = docs[docs.length - 1];

  return c.json({
    items,
    hasMore,
    nextCursor: hasMore && last ? (last.data().createdAt as string) : null,
  });
});

export { orders as ordersRouter };
