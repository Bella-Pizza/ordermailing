import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { db } from "../firebase-admin";
import { verifyAuthWithProfile } from "../auth";
import { getMessaging } from "firebase-admin/messaging";

const MIN_PERSONS = 10;
const RECIPIENT_EMAIL = "belfriet@gmail.com";
const PHONE_NUMBER = process.env.SHOP_PHONE || "+32 470 00 00 00";

const reservations = new Hono();

type ReservationPayload = {
  name: string;
  email?: string;
  date: string;
  quantity: number;
  notes?: string;
};

// Built on first send so `nodemailer` stays out of the cold-start path.
let transporter: import("nodemailer").Transporter | null = null;
async function mailer() {
  if (!transporter) {
    const { default: nodemailer } = await import("nodemailer");
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

async function sendPushNotification(title: string, body: string) {
  try {
    const tokensSnapshot = await db.collection("push_tokens").where("role", "==", "kassa").get();

    const tokens = tokensSnapshot.docs.map((doc) => doc.data().token);

    if (tokens.length === 0) return;

    const message = {
      notification: { title, body },
      tokens,
    };

    const response = await getMessaging().sendEachForMulticast(message);
    console.log(`Successfully sent ${response.successCount} push notifications to kassa devices`);

    // Cleanup invalid tokens
    if (response.failureCount > 0) {
      const batch = db.batch();
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          batch.delete(db.collection("push_tokens").doc(tokens[idx]));
        }
      });
      await batch.commit();
    }
  } catch (err) {
    console.error("Failed to send push notifications:", err);
  }
}

const authMiddleware = verifyAuthWithProfile;

// ─── POST /api/reservations (Public) ──────────────────────────────────────────
reservations.post("/", async (c) => {
  const { name, email, date, quantity, notes } = await c.req.json<{
    name: string;
    email?: string;
    date: string;
    quantity: number;
    notes?: string;
  }>();

  if (!name || !date || !quantity) {
    throw new HTTPException(400, { message: "Name, date and quantity are required" });
  }

  if (quantity < MIN_PERSONS) {
    throw new HTTPException(400, { message: `Minimum ${MIN_PERSONS} persons required` });
  }

  const reservation = {
    name,
    email: email || "",
    date,
    quantity,
    notes: notes || "",
    createdAt: new Date().toISOString(),
    status: "pending",
  };

  const docRef = await db.collection("reservations").add(reservation);

  const formattedDate = new Date(date).toLocaleString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const shopName = process.env.SHOP_NAME || "Bellegems Friethuisje";
  const shopEmail = process.env.SHOP_EMAIL || process.env.SMTP_USER;

  // 1. Email to Restaurant
  const restaurantHtml = `
    <h2>Nieuwe reservatie</h2>
    <p><strong>Naam:</strong> ${name}</p>
    <p><strong>Email:</strong> ${email || "Niet opgegeven"}</p>
    <p><strong>Datum:</strong> ${formattedDate}</p>
    <p><strong>Aantal personen:</strong> ${quantity}</p>
    <p><strong>Notities:</strong> ${notes || "/"}</p>
    <br/>
    <hr/>
    <p>Beheer deze reservatie in het Ordermailing dashboard.</p>
  `;

  const restaurantMailOptions = {
    from: `"${shopName}" <${shopEmail}>`,
    to: RECIPIENT_EMAIL,
    subject: `Nieuwe reservatie: ${name} (${quantity} pers.)`,
    html: restaurantHtml,
  };

  // 2. Confirmation Email to Customer
  if (email) {
    const customerHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
        <h1 style="color: #f97316;">Bedankt voor je reservatie!</h1>
        <p>Beste ${name},</p>
        <p>We hebben je aanvraag voor een tafelreservatie goed ontvangen bij <strong>${shopName}</strong>. Hier zijn de details:</p>
        <div style="background: #fff7ed; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Datum:</strong> ${formattedDate}</p>
          <p style="margin: 5px 0;"><strong>Personen:</strong> ${quantity}</p>
          <p style="margin: 5px 0;"><strong>Notities:</strong> ${notes || "/"}</p>
        </div>
        <p style="color: #666;">Heb je nog vragen of wil je je reservatie wijzigen? Neem dan telefonisch contact met ons op via <a href="tel:${PHONE_NUMBER}" style="color: #f97316; font-weight: bold;">${PHONE_NUMBER}</a>.</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #999;">${shopName} - Ambachtelijke frietjes & gezelligheid</p>
      </div>
    `;

    const customerMailOptions = {
      from: `"${shopName}" <${shopEmail}>`,
      to: email,
      subject: `Bevestiging reservatie: ${shopName}`,
      html: customerHtml,
    };

    mailer()
      .then((m) => m.sendMail(customerMailOptions))
      .catch((err) => console.error("Failed to send customer confirmation:", err));
  }

  try {
    await (await mailer()).sendMail(restaurantMailOptions);
  } catch (err) {
    console.error("Failed to send reservation email:", err);
  }

  // 3. Push Notification to Staff
  sendPushNotification("Nieuwe Reservatie!", `${name} voor ${quantity} personen op ${formattedDate}`);

  return c.json({ id: docRef.id, ...reservation });
});

// ─── GET /api/reservations (Protected) ────────────────────────────────────────
reservations.get("/", authMiddleware, async (c) => {
  const snapshot = await db.collection("reservations").orderBy("date", "desc").get();
  const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  return c.json(list);
});

// ─── DELETE /api/reservations/:id (Protected) ─────────────────────────────────
reservations.delete("/:id", authMiddleware, async (c) => {
  const id = c.req.param("id");
  await db.collection("reservations").doc(id).delete();
  return c.json({ ok: true });
});

// ─── PATCH /api/reservations/:id/status (Protected) ───────────────────────────
reservations.patch("/:id/status", authMiddleware, async (c) => {
  const id = c.req.param("id");
  const { status } = await c.req.json<{ status: string }>();
  await db.collection("reservations").doc(id).update({ status });
  return c.json({ ok: true });
});

// ─── PATCH /api/reservations/:id (Protected) ──────────────────────────────────
reservations.patch("/:id", authMiddleware, async (c) => {
  const id = c.req.param("id");
  const { name, email, date, quantity, notes } = await c.req.json<ReservationPayload>();

  if (!name || !date || !quantity) {
    throw new HTTPException(400, { message: "Name, date and quantity are required" });
  }

  if (quantity < 1) {
    throw new HTTPException(400, { message: "Quantity must be at least 1" });
  }

  const update = {
    name,
    email: email || "",
    date,
    quantity,
    notes: notes || "",
    updatedAt: new Date().toISOString(),
  };

  await db.collection("reservations").doc(id).update(update);

  return c.json({ id, ...update });
});

// ─── POST /api/reservations/subscribe (Protected) ────────────────────────────
reservations.post("/subscribe", authMiddleware, async (c) => {
  const { token } = await c.req.json<{ token: string }>();
  const uid = (c as any).get("uid");
  const role = (c as any).get("role");

  if (!token) {
    throw new HTTPException(400, { message: "Token is required" });
  }

  await db.collection("push_tokens").doc(token).set({
    token,
    uid,
    role, // Store role to enable targeted notifications for 'kassa'
    updatedAt: new Date().toISOString(),
  });

  return c.json({ ok: true });
});

export { reservations as reservationsRouter };
