import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, db } from "../firebase-admin";
import { supabase as _supabase } from "../supabase";

type Env = { Variables: { uid: string } };

// Safe to use after the Supabase availability guard middleware runs.
const supabase = _supabase!;
const designs = new Hono<Env>();

const BUCKET = "design-images";

// ─── Bucket bootstrap ─────────────────────────────────────────────────────────
// Create the bucket on first use if it doesn't exist yet.
let _bucketReady = false;
async function ensureBucket() {
  if (_bucketReady) return;
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some((b) => b.name === BUCKET);
  if (!exists) {
    const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
    if (error && !error.message.includes("already exists")) {
      throw new Error(`Failed to create storage bucket "${BUCKET}": ${error.message}`);
    }
  }
  _bucketReady = true;
}

// ─── Supabase availability guard ─────────────────────────────────────────────
designs.use("*", async (c, next) => {
  if (!supabase) {
    throw new HTTPException(503, { message: "Design storage is not configured (missing Supabase env keys)" });
  }
  return next();
});

// ─── Auth middleware ──────────────────────────────────────────────────────────
designs.use("*", async (c, next) => {
  const authorization = c.req.header("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new HTTPException(401, { message: "Missing or invalid Authorization header" });
  }
  try {
    const idToken = authorization.slice(7);
    const decoded = await adminAuth.verifyIdToken(idToken);
    c.set("uid", decoded.uid);
  } catch {
    throw new HTTPException(401, { message: "Invalid or expired token" });
  }
  return next();
});

// ─── Storage helpers ──────────────────────────────────────────────────────────

/**
 * Walk artboard elements, upload any data: URL images to Supabase Storage,
 * and replace src with the public CDN URL. Returns the patched artboard clone.
 */
async function uploadImages(projectId: string, artboard: any): Promise<any> {
  await ensureBucket();
  const clone = JSON.parse(JSON.stringify(artboard));
  for (const el of clone.elements ?? []) {
    if (el.type !== "image" || typeof el.src !== "string") continue;
    if (!el.src.startsWith("data:")) continue; // already a CDN URL — skip

    const [meta] = el.src.split(",");
    const mime = meta.match(/data:([^;]+)/)?.[1] ?? "";

    // Keep SVG data URLs inline — they're text-based, always instantly available,
    // and don't suffer CDN propagation delay. Only upload binary raster images.
    if (mime.includes("svg")) continue;

    const b64 = el.src.split(",")[1];
    const ext = mime.includes("png") ? "png" : mime.includes("gif") ? "gif" : mime.includes("webp") ? "webp" : "jpg";
    const path = `${projectId}/${el.id}.${ext}`;
    const buffer = Buffer.from(b64, "base64");

    // Delete any existing file for this element id with a DIFFERENT extension
    // (e.g. old .jpg when a background-removed .png is being saved), otherwise
    // Supabase ends up with duplicate files for the same element.
    const otherExts = ["jpg", "jpeg", "png", "gif", "webp"].filter((e) => e !== ext);
    for (const oldExt of otherExts) {
      await supabase.storage.from(BUCKET).remove([`${projectId}/${el.id}.${oldExt}`]);
    }

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: mime || "image/jpeg", upsert: true });

    if (!error) {
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      // Append cache-buster so the browser doesn't serve a stale cached
      // version when the same element is re-uploaded (e.g. after bg removal).
      el.src = `${data.publicUrl}?t=${Date.now()}`;
    }
  }
  return clone;
}

/**
 * Serialize an artboard object as a JSON file and store it in Supabase Storage.
 * Stored at {projectId}/_artboard.json — same folder as images so delete cleans both.
 * Returns the public CDN URL of the stored file.
 */
async function saveArtboardFile(projectId: string, artboard: any): Promise<string> {
  await ensureBucket();
  const path = `${projectId}/_artboard.json`;
  const buffer = Buffer.from(JSON.stringify(artboard), "utf-8");

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: "application/json", upsert: true });

  if (error) {
    // Log full detail server-side so the real cause is visible in terminal
    console.error("[designs] Supabase upload error:", JSON.stringify(error));
    throw new Error(`Failed to save artboard JSON: ${error.message} (${(error as any).statusCode ?? ""})`);
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Read and parse the artboard JSON file directly from the public bucket.
 * We use fetch with a cache buster (?t= timestamp) to guarantee we instantly
 * see the latest saved version, bypassing any Supabase CDN caching.
 */
async function loadArtboardFile(projectId: string): Promise<any> {
  const path = `${projectId}/_artboard.json`;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const url = `${data.publicUrl}?t=${Date.now()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load artboard JSON from CDN: status ${res.status}`);
  return await res.json();
}

/** Extract tiny display metadata for Firestore (no element data). */
function extractMeta(artboard: any) {
  return {
    width: artboard.width ?? 800,
    height: artboard.height ?? 600,
    background: artboard.background ?? "#ffffff",
    elementCount: (artboard.elements ?? []).length,
  };
}

/** Delete all stored files (images + artboard JSON) for a project folder. */
async function deleteProjectFiles(projectId: string) {
  const { data: files } = await supabase.storage.from(BUCKET).list(projectId);
  if (files?.length) {
    await supabase.storage.from(BUCKET).remove(files.map((f) => `${projectId}/${f.name}`));
  }
}

// ─── GET /api/designs ─────────────────────────────────────────────────────────
// Returns project list. The artboard field is synthesised from the stored meta
// so that the list-page UI (thumbnails, dimensions, element count) works as-is.
designs.get("/", async (c) => {
  const uid = c.get("uid");
  const snap = await db.collection("designs").where("userId", "==", uid).orderBy("createdAt", "desc").get();

  return c.json(
    snap.docs.map((d) => {
      const data = d.data();
      // New format: meta field. Old format fallback: inline artboard.
      const meta = data.meta;
      const inlineArtboard = data.artboard;
      const w = meta?.width ?? inlineArtboard?.width ?? 800;
      const h = meta?.height ?? inlineArtboard?.height ?? 600;
      const bg = meta?.background ?? inlineArtboard?.background ?? "#ffffff";
      const count = meta?.elementCount ?? inlineArtboard?.elements?.length ?? 0;
      return {
        id: d.id,
        name: data.name,
        userId: data.userId,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        // Reconstruct the minimal artboard shape the list UI expects
        artboard: { width: w, height: h, background: bg, elements: new Array(count) },
      };
    }),
  );
});

// ─── GET /api/designs/:id ─────────────────────────────────────────────────────
// Fetches the full artboard JSON from Supabase Storage.
designs.get("/:id", async (c) => {
  const uid = c.get("uid");
  const id = c.req.param("id");
  const doc = await db.collection("designs").doc(id).get();
  if (!doc.exists) throw new HTTPException(404, { message: "Not found" });
  const data = doc.data()!;
  if (data.userId !== uid) throw new HTTPException(403, { message: "Forbidden" });
  // Try loading from Supabase Storage first (new format), fall back to legacy inline artboard
  let artboard: any;
  if (data.artboardUrl || data.artboardPath) {
    // Path is always deterministic — use doc id directly so we bypass CDN
    artboard = await loadArtboardFile(doc.id);
  } else if (data.artboard) {
    artboard = data.artboard; // legacy inline Firestore doc
  } else {
    throw new HTTPException(500, { message: "Artboard data missing" });
  }

  return c.json({
    id: doc.id,
    name: data.name,
    userId: data.userId,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    artboard,
  });
});

// ─── POST /api/designs ────────────────────────────────────────────────────────
designs.post("/", async (c) => {
  const uid = c.get("uid");
  const body = await c.req.json<{ id?: string; name: string; createdAt?: string; artboard: any }>();
  if (!body.name || !body.artboard) {
    throw new HTTPException(400, { message: "name and artboard are required" });
  }
  const docId = body.id ?? db.collection("designs").doc().id;

  // 1. Upload embedded images → CDN URLs
  const artboard = await uploadImages(docId, body.artboard);
  // 2. Save full artboard as a JSON file in Supabase Storage
  const artboardUrl = await saveArtboardFile(docId, artboard);
  // 3. Write tiny metadata doc to Firestore (no image data, no artboard payload)
  await db
    .collection("designs")
    .doc(docId)
    .set({
      userId: uid,
      name: body.name,
      createdAt: body.createdAt ?? new Date().toISOString(),
      artboardUrl,
      meta: extractMeta(artboard),
    });

  return c.json({ ok: true, id: docId }, 201);
});

// ─── PUT /api/designs/:id ─────────────────────────────────────────────────────
designs.put("/:id", async (c) => {
  const uid = c.get("uid");
  const id = c.req.param("id");
  const body = await c.req.json<{ name?: string; createdAt?: string; artboard?: any }>();

  const docRef = db.collection("designs").doc(id);
  const snap = await docRef.get();

  let artboardUrl: string | undefined;
  let meta: ReturnType<typeof extractMeta> | undefined;

  if (body.artboard) {
    const artboard = await uploadImages(id, body.artboard);
    artboardUrl = await saveArtboardFile(id, artboard);
    meta = extractMeta(artboard);
  }

  if (!snap.exists) {
    if (!artboardUrl || !meta) throw new HTTPException(400, { message: "artboard is required" });
    await docRef.set({
      userId: uid,
      name: body.name ?? "Untitled",
      createdAt: body.createdAt ?? new Date().toISOString(),
      artboardUrl,
      meta,
    });
    return c.json({ ok: true });
  }

  if (snap.data()?.userId !== uid) throw new HTTPException(403, { message: "Forbidden" });

  const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (body.name !== undefined) update.name = body.name;
  if (artboardUrl) update.artboardUrl = artboardUrl;
  if (meta) update.meta = meta;
  // Remove legacy inline artboard field if present (old format that caused the 1MB error)
  if (snap.data()?.artboard !== undefined) update.artboard = FieldValue.delete();
  await docRef.update(update);
  return c.json({ ok: true });
});

// ─── PATCH /api/designs/:id/rename ───────────────────────────────────────────
designs.patch("/:id/rename", async (c) => {
  const uid = c.get("uid");
  const id = c.req.param("id");
  const body = await c.req.json<{ name: string }>();
  if (!body.name) throw new HTTPException(400, { message: "name is required" });
  const docRef = db.collection("designs").doc(id);
  const snap = await docRef.get();
  if (!snap.exists) throw new HTTPException(404, { message: "Not found" });
  if (snap.data()?.userId !== uid) throw new HTTPException(403, { message: "Forbidden" });
  await docRef.update({ name: body.name, updatedAt: new Date().toISOString() });
  return c.json({ ok: true });
});

// ─── DELETE /api/designs/:id ──────────────────────────────────────────────────
designs.delete("/:id", async (c) => {
  const uid = c.get("uid");
  const id = c.req.param("id");
  const docRef = db.collection("designs").doc(id);
  const snap = await docRef.get();
  if (!snap.exists) throw new HTTPException(404, { message: "Not found" });
  if (snap.data()?.userId !== uid) throw new HTTPException(403, { message: "Forbidden" });
  await Promise.all([docRef.delete(), deleteProjectFiles(id)]);
  return c.json({ ok: true });
});

// ─── POST /api/designs/generate (AI Image Generation) ─────────────────────────
designs.post("/generate", async (c) => {
  const formData = await c.req.parseBody();
  const prompt = formData["prompt"]?.toString() || "";
  const imageFile = formData["image"] as File | undefined;

  if (!prompt) {
    throw new HTTPException(400, { message: "Prompt is required" });
  }

  // Use Pollinations.ai API with the 'flux' model, which has the best free-tier rate.
  const enhancedPrompt = `A high quality, ultra-realistic, photographic modern digital advertisement design graphic. strictly no flat art, no illustrations, no drawings, photorealistic: ${prompt}`;
  const encodedPrompt = encodeURIComponent(enhancedPrompt);
  const seed = Math.floor(Math.random() * 1000000);
  let aiImageUrl = `https://gen.pollinations.ai/image/${encodedPrompt}?width=1280&height=720&nologo=true&seed=${seed}&model=flux`;

  // If a reference image is provided, upload to Supabase and pass its public URL to the AI
  if (imageFile && imageFile instanceof File) {
    await ensureBucket();
    const ext = imageFile.name.split(".").pop() || "png";
    const filePath = `ai-references/${Date.now()}-${Math.floor(Math.random() * 10000)}.${ext}`;

    const arrayBuffer = await imageFile.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, arrayBuffer, { contentType: imageFile.type || "image/png" });

    if (!uploadError) {
      const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
      if (publicData?.publicUrl) {
        // According to Pollinations.ai docs, passing an image URL can be done this way:
        aiImageUrl = `https://gen.pollinations.ai/image/${encodedPrompt}?width=1280&height=720&nologo=true&seed=${seed}&model=imagen-4&image=${encodeURIComponent(publicData.publicUrl)}`;
      }
    } else {
      console.warn("Failed to upload reference image to Supabase:", uploadError);
    }
  }

  // Log final computed URL (including &image= if appended)
  console.log("FINAL AI URL:", aiImageUrl);

  // If you register at enter.pollinations.ai, add your key to .env so you skip the queue!
  const apiKey = process.env.POLLINATIONS_API_KEY || "";
  const headers: Record<string, string> = { "User-Agent": "OrderMailing-App" };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  try {
    let aiRes: Response | null = null;
    let success = false;

    // The completely free API often returns 500 or 429 when its GPU queue is full.
    // We add a retry loop (up to 3 times) to gracefully wait and slip into the queue!
    for (let attempts = 0; attempts < 3; attempts++) {
      aiRes = await fetch(aiImageUrl, { headers });
      if (aiRes.ok) {
        success = true;
        break;
      }
      // Wait 2 seconds before retrying if server is busy
      console.log(`Pollinations busy (Status: ${aiRes.status}). Retrying...`);
      await new Promise((r) => setTimeout(r, 2000));
    }

    if (!success || !aiRes) {
      throw new Error(`Failed to generate Image from AI after 3 attempts: ${aiRes?.status}`);
    }

    // We fetch the buffer and return base64.
    const arrayBuffer = await aiRes.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const imageUrl = `data:image/jpeg;base64,${base64}`;

    return c.json({ imageUrl });
  } catch (error) {
    console.error("Pollinations Error:", error);
    throw new HTTPException(500, { message: "Failed to generate AI Image" });
  }
});

export { designs as designsRouter };
