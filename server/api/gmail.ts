import { google } from "googleapis";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import crypto from "crypto";
import { adminAuth, db } from "../firebase-admin";

const gmail = new Hono();

function getOAuth2Client() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REDIRECT_URI) {
    throw new HTTPException(500, { message: "Gmail OAuth not configured on server" });
  }
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
}

async function requireAdmin(c: any) {
  const authorization = c.req.header("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }
  try {
    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const userDoc = await db.collection("users").doc(decoded.uid).get();
    const role = userDoc.data()?.role ?? "user";
    if (role !== "admin") throw new HTTPException(403, { message: "Forbidden" });
    return decoded.uid;
  } catch (e) {
    if (e instanceof HTTPException) throw e;
    throw new HTTPException(401, { message: "Invalid or expired token" });
  }
}

// GET /api/gmail/status
gmail.get("/status", async (c) => {
  await requireAdmin(c);

  const configured = !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REDIRECT_URI
  );
  if (!configured) return c.json({ configured: false, connected: false });

  const snap = await db.collection("settings").doc("gmail").get();
  if (!snap.exists) return c.json({ configured: true, connected: false });

  const data = snap.data()!;
  return c.json({ configured: true, connected: true, email: data.email, connectedAt: data.connectedAt });
});

// GET /api/gmail/auth-url
gmail.get("/auth-url", async (c) => {
  await requireAdmin(c);

  const oauth2Client = getOAuth2Client();

  const state = crypto.randomBytes(32).toString("hex");
  await db.collection("settings").doc("gmail_oauth_state").set({
    state,
    createdAt: new Date().toISOString(),
  });

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    prompt: "consent",
    state,
  });

  console.log("[gmail] GOOGLE_REDIRECT_URI env:", process.env.GOOGLE_REDIRECT_URI);
  console.log("[gmail] generated auth URL:", url);
  return c.json({ url });
});

// GET /api/gmail/callback  (no auth — called directly by Google redirect)
gmail.get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const error = c.req.query("error");

  const redirectBase = process.env.GOOGLE_REDIRECT_URI!.replace("/api/gmail/callback", "");

  if (error || !code || !state) {
    return c.redirect(`${redirectBase}/settings?gmail_error=1`);
  }

  const stateDoc = await db.collection("settings").doc("gmail_oauth_state").get();
  if (!stateDoc.exists || stateDoc.data()?.state !== state) {
    return c.redirect(`${redirectBase}/settings?gmail_error=1`);
  }
  await db.collection("settings").doc("gmail_oauth_state").delete();

  try {
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2Api = google.oauth2({ version: "v2", auth: oauth2Client });
    const userInfo = await oauth2Api.userinfo.get();
    const email = userInfo.data.email;

    await db.collection("settings").doc("gmail").set({
      email,
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      expiry_date: tokens.expiry_date,
      connectedAt: new Date().toISOString(),
    });

    return c.redirect(`${redirectBase}/settings?gmail_connected=1`);
  } catch (err) {
    console.error("Gmail OAuth callback error:", err);
    return c.redirect(`${redirectBase}/settings?gmail_error=1`);
  }
});

// DELETE /api/gmail/disconnect
gmail.delete("/disconnect", async (c) => {
  await requireAdmin(c);

  await db.collection("settings").doc("gmail").delete();
  return c.json({ ok: true });
});

export { gmail as gmailRouter };
