import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { adminAuth, db } from "../firebase-admin";
import nodemailer from "nodemailer";

const RECIPIENT_EMAIL = "belfriet@gmail.com";

const sollicitaties = new Hono();

const authMiddleware = async (c: any, next: any) => {
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
};

const mailTransporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// ─── POST /api/sollicitaties (Public) ─────────────────────────────────────────
sollicitaties.post("/", async (c) => {
  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    throw new HTTPException(400, { message: "Invalid multipart form data" });
  }

  const voornaam = (formData.get("voornaam") as string | null) ?? "";
  const naam = (formData.get("naam") as string | null) ?? "";
  const geboortedatum = (formData.get("geboortedatum") as string | null) ?? "";
  const geboorteplaats = (formData.get("geboorteplaats") as string | null) ?? "";
  const adres = (formData.get("adres") as string | null) ?? "";
  const gsm = (formData.get("gsm") as string | null) ?? "";
  const email = (formData.get("email") as string | null) ?? "";
  const burgerlijkeStaat = (formData.get("burgerlijkeStaat") as string | null) ?? "";
  const rijksregister = (formData.get("rijksregister") as string | null) ?? "";
  const bankrekening = (formData.get("bankrekening") as string | null) ?? "";
  const kennisNederlands = (formData.get("kennisNederlands") as string | null) ?? "";
  const kennisFrans = (formData.get("kennisFrans") as string | null) ?? "";
  const hobbys = (formData.get("hobbys") as string | null) ?? "";
  const motivatie = (formData.get("motivatie") as string | null) ?? "";
  const cvFile = formData.get("cv") as File | null;

  if (!voornaam || !naam || !geboortedatum || !adres || !gsm || !motivatie) {
    throw new HTTPException(400, { message: "Required fields are missing" });
  }

  const application = {
    voornaam,
    naam,
    geboortedatum,
    geboorteplaats,
    adres,
    gsm,
    email,
    burgerlijkeStaat,
    rijksregister,
    bankrekening,
    kennisNederlands,
    kennisFrans,
    hobbys,
    motivatie,
    createdAt: new Date().toISOString(),
    status: "nieuw",
  };

  const docRef = await db.collection("sollicitaties").add(application);

  const shopName = process.env.SHOP_NAME || "Bellegems Friethuisje";
  const shopEmail = process.env.SHOP_EMAIL || process.env.SMTP_USER;

  const restaurantHtml = `
    <h2 style="color:#f97316;">Nieuwe sollicitatie</h2>

    <h3>Persoonlijke gegevens</h3>
    <p><strong>Naam:</strong> ${voornaam} ${naam}</p>
    <p><strong>Geboortedatum:</strong> ${geboortedatum}</p>
    <p><strong>Geboorteplaats:</strong> ${geboorteplaats}</p>
    <p><strong>Adres:</strong> ${adres}</p>
    <p><strong>GSM:</strong> ${gsm}</p>
    <p><strong>E-mail:</strong> ${email || "/"}</p>
    <p><strong>Burgerlijke staat:</strong> ${burgerlijkeStaat}</p>

    <h3>Administratieve gegevens</h3>
    <p><strong>Rijksregisternummer:</strong> ${rijksregister}</p>
    <p><strong>Bankrekeningnummer:</strong> ${bankrekening}</p>

    <h3>Taalkennis</h3>
    <p><strong>Nederlands:</strong> ${kennisNederlands}</p>
    <p><strong>Frans:</strong> ${kennisFrans}</p>

    <h3>Hobby's</h3>
    <p>${hobbys || "/"}</p>

    <h3>Motivatie</h3>
    <p>${motivatie.replace(/\n/g, "<br/>")}</p>

    <hr/>
    <p style="color:#999;font-size:12px;">Bekijk alle sollicitaties in het Ordermailing dashboard.</p>
  `;

  const mailOptions: nodemailer.SendMailOptions = {
    from: `"${shopName}" <${shopEmail}>`,
    to: RECIPIENT_EMAIL,
    subject: `Nieuwe sollicitatie: ${voornaam} ${naam}`,
    html: restaurantHtml,
    attachments: [],
  };

  if (cvFile && cvFile.size > 0) {
    const buffer = Buffer.from(await cvFile.arrayBuffer());
    (mailOptions.attachments as nodemailer.Attachment[]).push({
      filename: cvFile.name,
      content: buffer,
    });
  }

  try {
    await mailTransporter.sendMail(mailOptions);
  } catch (err) {
    console.error("Failed to send sollicitatie email:", err);
  }

  // Confirmation to applicant
  if (email) {
    const confirmHtml = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;border:1px solid #eee;padding:20px;border-radius:10px;">
        <h1 style="color:#f97316;">Bedankt voor je sollicitatie!</h1>
        <p>Beste ${voornaam},</p>
        <p>We hebben je sollicitatie goed ontvangen bij <strong>${shopName}</strong> en nemen zo snel mogelijk contact met je op.</p>
        <hr style="border:0;border-top:1px solid #eee;margin:20px 0;"/>
        <p style="font-size:12px;color:#999;">${shopName} &mdash; Ambachtelijke frietjes &amp; gezelligheid</p>
      </div>
    `;
    mailTransporter
      .sendMail({
        from: `"${shopName}" <${shopEmail}>`,
        to: email,
        subject: `Bevestiging sollicitatie – ${shopName}`,
        html: confirmHtml,
      })
      .catch((err) => console.error("Failed to send applicant confirmation:", err));
  }

  return c.json({ id: docRef.id, ...application });
});

// ─── GET /api/sollicitaties (Protected) ───────────────────────────────────────
sollicitaties.get("/", authMiddleware, async (c) => {
  const snapshot = await db.collection("sollicitaties").orderBy("createdAt", "desc").get();
  const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  return c.json(list);
});

// ─── PATCH /api/sollicitaties/:id/status (Protected) ──────────────────────────
sollicitaties.patch("/:id/status", authMiddleware, async (c) => {
  const id = c.req.param("id");
  const { status } = await c.req.json<{ status: string }>();
  await db.collection("sollicitaties").doc(id).update({ status });
  return c.json({ ok: true });
});

// ─── DELETE /api/sollicitaties/:id (Protected) ────────────────────────────────
sollicitaties.delete("/:id", authMiddleware, async (c) => {
  const id = c.req.param("id");
  await db.collection("sollicitaties").doc(id).delete();
  return c.json({ ok: true });
});

export { sollicitaties as sollicitatiesRouter };
