import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { adminAuth, db } from "../firebase-admin";
import { randomUUID } from "crypto";

const users = new Hono();

type UserListItem = {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  storeIds: string[];
};

async function listAllAuthUsers() {
  const allUsers = [];
  let pageToken: string | undefined;

  do {
    const page = await adminAuth.listUsers(1000, pageToken);
    allUsers.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);

  return allUsers;
}

// ─── Auth middleware ──────────────────────────────────────────────────────────
users.use("*", async (c, next) => {
  // Public routes: validate invite token + register
  const path = c.req.path;
  const method = c.req.method;
  if ((method === "GET" && path.includes("/invite/")) || (method === "POST" && path.endsWith("/register"))) {
    return next();
  }

  const authorization = c.req.header("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new HTTPException(401, { message: "Missing or invalid Authorization header" });
  }

  try {
    const idToken = authorization.slice(7);
    const decoded = await adminAuth.verifyIdToken(idToken);
    c.set("uid", decoded.uid);
    c.set("email", decoded.email ?? "");

    // Fetch role from Firestore and attach to context
    const userDoc = await db.collection("users").doc(decoded.uid).get();
    c.set("role", userDoc.exists ? (userDoc.data()?.role ?? "user") : "user");
  } catch {
    throw new HTTPException(401, { message: "Invalid or expired token" });
  }

  return next();
});

// ─── GET /api/users ───────────────────────────────────────────────────────────
users.get("/", async (c) => {
  const [snapshot, authUsers] = await Promise.all([db.collection("users").get(), listAllAuthUsers()]);

  const usersById = new Map<string, UserListItem>();

  for (const authUser of authUsers) {
    usersById.set(authUser.uid, {
      id: authUser.uid,
      name: authUser.displayName ?? authUser.email ?? "Unknown user",
      email: authUser.email ?? "",
      role: "user",
      createdAt: authUser.metadata.creationTime ? new Date(authUser.metadata.creationTime).toISOString() : "",
      storeIds: [],
    });
  }

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const existing = usersById.get(doc.id);

    usersById.set(doc.id, {
      id: doc.id,
      name: typeof data.name === "string" && data.name ? data.name : (existing?.name ?? data.email ?? "Unknown user"),
      email: typeof data.email === "string" ? data.email : (existing?.email ?? ""),
      role: typeof data.role === "string" && data.role ? data.role : (existing?.role ?? "user"),
      createdAt:
        typeof data.createdAt === "string" && data.createdAt
          ? data.createdAt
          : (existing?.createdAt ?? new Date(0).toISOString()),
      storeIds: Array.isArray(data.storeIds) ? (data.storeIds as string[]) : (existing?.storeIds ?? []),
    });
  }

  const list = [...usersById.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return c.json(list);
});

// ─── POST /api/users/invite ───────────────────────────────────────────────────
users.post("/invite", async (c) => {
  if (c.get("role") !== "admin") {
    throw new HTTPException(403, { message: "Only admins can invite new users" });
  }

  const token = randomUUID();
  await db.collection("inviteTokens").doc(token).set({
    createdAt: new Date().toISOString(),
    used: false,
  });

  return c.json({ token });
});

// ─── GET /api/users/invite/:token ─────────────────────────────────────────────
users.get("/invite/:token", async (c) => {
  const token = c.req.param("token");
  const doc = await db.collection("inviteTokens").doc(token).get();

  if (!doc.exists) {
    throw new HTTPException(404, { message: "Invalid registration token" });
  }

  const data = doc.data()!;
  if (data.used) {
    throw new HTTPException(410, { message: "This registration link has already been used" });
  }

  return c.json({ valid: true });
});

// ─── POST /api/users/register ─────────────────────────────────────────────────
users.post("/register", async (c) => {
  const { token, name, email, password } = await c.req.json<{
    token: string;
    name: string;
    email: string;
    password: string;
  }>();

  if (!token || !name || !email || !password) {
    throw new HTTPException(400, { message: "token, name, email and password are required" });
  }

  // Check if a Firebase Auth user already exists with this email
  try {
    await adminAuth.getUserByEmail(email);
    throw new HTTPException(409, { message: "A user with this email already exists" });
  } catch (err: any) {
    if (err?.errorInfo?.code !== "auth/user-not-found") throw err;
  }

  const tokenRef = db.collection("inviteTokens").doc(token);
  const tokenDoc = await tokenRef.get();

  if (!tokenDoc.exists) {
    throw new HTTPException(404, { message: "Invalid registration token" });
  }

  const tokenData = tokenDoc.data()!;
  if (tokenData.used) {
    throw new HTTPException(410, { message: "This registration link has already been used" });
  }

  // Create the Firebase Auth user
  const userRecord = await adminAuth.createUser({ email, password, displayName: name });

  // Store user profile in Firestore
  await db.collection("users").doc(userRecord.uid).set({
    name,
    email,
    role: "user",
    createdAt: new Date().toISOString(),
  });

  // Mark token as used
  await tokenRef.update({ used: true, usedBy: userRecord.uid, usedAt: new Date().toISOString() });

  // Return a custom token so the client can sign in immediately
  const customToken = await adminAuth.createCustomToken(userRecord.uid);
  return c.json({ customToken });
});

// ─── GET /api/users/me ────────────────────────────────────────────────────────
users.get("/me", async (c) => {
  const uid = c.get("uid") as string;
  const snap = await db.collection("users").doc(uid).get();
  return c.json(snap.exists ? snap.data() : {});
});

// ─── PATCH /api/users/me/settings ────────────────────────────────────────────
users.patch("/me/settings", async (c) => {
  const uid = c.get("uid") as string;
  const body = await c.req.json<Record<string, unknown>>();
  await db.collection("users").doc(uid).set({ settings: body }, { merge: true });
  return c.json({ ok: true });
});

// ─── PATCH /api/users/:id/role ───────────────────────────────────────────────
users.patch("/:id/role", async (c) => {
  if (c.get("role") !== "admin") {
    throw new HTTPException(403, { message: "Only admins can change roles" });
  }

  const id = c.req.param("id");
  const { role } = await c.req.json<{ role: string }>();

  if (role !== "admin" && role !== "user" && role !== "kassa") {
    throw new HTTPException(400, { message: "Role must be 'admin', 'user' or 'kassa'" });
  }

  await db.collection("users").doc(id).update({ role });

  return c.json({ ok: true });
});

// ─── PATCH /api/users/:id/stores ─────────────────────────────────────────────
users.patch("/:id/stores", async (c) => {
  if (c.get("role") !== "admin") {
    throw new HTTPException(403, { message: "Only admins can assign stores" });
  }

  const id = c.req.param("id");
  const { storeIds } = await c.req.json<{ storeIds: string[] }>();

  if (!Array.isArray(storeIds) || storeIds.some((s) => typeof s !== "string")) {
    throw new HTTPException(400, { message: "storeIds must be an array of store ids" });
  }

  await db.collection("users").doc(id).set({ storeIds }, { merge: true });

  return c.json({ ok: true });
});

// ─── DELETE /api/users/:id ────────────────────────────────────────────────────
users.delete("/:id", async (c) => {
  const id = c.req.param("id");

  // Prevent self-deletion
  const requestingUid = c.get("uid") as string;
  if (id === requestingUid) {
    throw new HTTPException(400, { message: "You cannot delete your own account" });
  }

  await Promise.all([adminAuth.deleteUser(id), db.collection("users").doc(id).delete()]);

  return c.json({ ok: true });
});

export { users as usersRouter };
