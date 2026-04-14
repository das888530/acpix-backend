import "dotenv/config";

import cors from "cors";
import express from "express";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import pg from "pg";
import { fileURLToPath } from "node:url";

const { Pool } = pg;
const app = express();
const port = Number(process.env.BACKEND_PORT || 4000);
const frontendOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:9002";
const backendDir = dirname(fileURLToPath(import.meta.url));
const uploadsDir = join(backendDir, "uploads");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set for backend service.");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.use(cors({ origin: frontendOrigin, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use("/uploads", express.static(uploadsDir));

function sanitizeFileName(fileName, fallbackExtension = "") {
  const originalExtension = extname(String(fileName || "")).toLowerCase();
  const safeExtension = (originalExtension || fallbackExtension || "").replace(/[^a-z0-9.]/g, "");
  const baseName = String(fileName || "upload")
    .replace(originalExtension, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "upload";

  return `${baseName}${safeExtension}`;
}

function mapUser(row) {
  return {
    id: row.id,
    email: row.email,
    role: row.role === "ADMIN" ? "admin" : "user",
    isSubscribed: row.isSubscribed,
  };
}

function mapEpisode(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    videoUrl: row.videoUrl,
    order: row.order,
  };
}

function mapVideo(row, episodes = []) {
  return {
    id: row.id,
    type: row.type === "SERIES" ? "series" : "movie",
    title: row.title,
    description: row.description,
    genres: row.genres || [],
    tags: row.tags || [],
    thumbnailUrl: row.thumbnailUrl,
    videoUrl: row.videoUrl || undefined,
    isFree: row.isFree,
    createdAt: new Date(row.createdAt).toISOString(),
    episodes: episodes.length > 0 ? episodes.map(mapEpisode) : undefined,
  };
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, originalHash] = String(storedHash || "").split(":");
  if (!salt || !originalHash) return false;
  const candidate = scryptSync(password, salt, 64);
  const original = Buffer.from(originalHash, "hex");
  return candidate.length === original.length && timingSafeEqual(candidate, original);
}

function validateCredentials(email, password) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail || !password) return "Email and password are required.";
  if (!normalizedEmail.includes("@")) return "Enter a valid email address.";
  if (String(password).length < 8) return "Password must be at least 8 characters long.";
  return null;
}

async function fetchEpisodes(videoId) {
  const result = await pool.query(
    'SELECT "id", "title", "description", "videoUrl", "order" FROM "Episode" WHERE "videoId" = $1 ORDER BY "order" ASC',
    [videoId],
  );
  return result.rows;
}

async function fetchVideoById(videoId) {
  const result = await pool.query('SELECT * FROM "Video" WHERE "id" = $1', [videoId]);
  if (result.rowCount === 0) return null;
  const episodes = await fetchEpisodes(videoId);
  return mapVideo(result.rows[0], episodes);
}

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, port, frontendOrigin });
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.post("/api/auth/signup", async (req, res) => {
  const { email, password } = req.body ?? {};
  const validationError = validateCredentials(email, password);
  if (validationError) return res.status(400).json({ error: validationError });

  const normalizedEmail = String(email).trim().toLowerCase();

  try {
    const existing = await pool.query('SELECT "id" FROM "User" WHERE "email" = $1', [normalizedEmail]);
    if (existing.rowCount > 0) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    const insert = await pool.query(
      `INSERT INTO "User" ("id", "email", "passwordHash", "role", "isSubscribed", "subscriptionStatus", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'USER', false, 'NONE', NOW(), NOW())
       RETURNING "id", "email", "role", "isSubscribed"`,
      [randomUUID(), normalizedEmail, hashPassword(password)],
    );

    return res.status(201).json({ user: mapUser(insert.rows[0]) });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create user." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  const validationError = validateCredentials(email, password);
  if (validationError) return res.status(400).json({ error: validationError });

  try {
    const result = await pool.query(
      'SELECT "id", "email", "passwordHash", "role", "isSubscribed" FROM "User" WHERE "email" = $1',
      [String(email).trim().toLowerCase()],
    );

    const row = result.rows[0];
    if (!row || !verifyPassword(password, row.passwordHash)) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    return res.json({ user: mapUser(row) });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to log in." });
  }
});

app.get("/api/users/:id", async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT "id", "email", "role", "isSubscribed" FROM "User" WHERE "id" = $1',
      [req.params.id],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    return res.json({ user: mapUser(result.rows[0]) });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load user." });
  }
});

app.post("/api/users/:id/subscription/toggle", async (req, res) => {
  try {
    const current = await pool.query('SELECT "isSubscribed" FROM "User" WHERE "id" = $1', [req.params.id]);
    if (current.rowCount === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    const nextIsSubscribed = !current.rows[0].isSubscribed;

    const update = await pool.query(
      `UPDATE "User"
       SET "isSubscribed" = $2,
           "subscriptionStatus" = $3,
           "updatedAt" = NOW()
       WHERE "id" = $1
       RETURNING "id", "email", "role", "isSubscribed"`,
      [req.params.id, nextIsSubscribed, nextIsSubscribed ? "ACTIVE" : "NONE"],
    );

    if (nextIsSubscribed) {
      await pool.query(
        `INSERT INTO "Subscription" ("id", "planName", "status", "startedAt", "createdAt", "updatedAt", "userId")
         VALUES ($1, 'Ultra Premium', 'ACTIVE', NOW(), NOW(), NOW(), $2)`,
        [randomUUID(), req.params.id],
      );
    }

    return res.json({ user: mapUser(update.rows[0]) });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to update subscription." });
  }
});

app.get("/api/videos", async (_req, res) => {
  try {
    const videos = await pool.query('SELECT * FROM "Video" ORDER BY "createdAt" DESC');
    const episodes = await pool.query('SELECT "id", "title", "description", "videoUrl", "order", "videoId" FROM "Episode" ORDER BY "order" ASC');
    const episodesByVideoId = new Map();

    for (const episode of episodes.rows) {
      const list = episodesByVideoId.get(episode.videoId) || [];
      list.push(episode);
      episodesByVideoId.set(episode.videoId, list);
    }

    return res.json({
      videos: videos.rows.map((video) => mapVideo(video, episodesByVideoId.get(video.id) || [])),
    });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load videos." });
  }
});

app.get("/api/videos/:id", async (req, res) => {
  try {
    const video = await fetchVideoById(req.params.id);
    if (!video) {
      return res.status(404).json({ error: "Video not found." });
    }
    return res.json({ video });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load video." });
  }
});

app.post("/api/videos", async (req, res) => {
  const { userId, title, description, genres, tags, thumbnailUrl, videoUrl, type, isFree, episodes } = req.body ?? {};
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  if (!title || !description || !thumbnailUrl || !type) return res.status(400).json({ error: "Missing required fields." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const insertedVideo = await client.query(
      `INSERT INTO "Video" (
        "id", "title", "description", "genres", "tags", "thumbnailUrl", "videoUrl", "type", "isFree", "createdAt", "updatedAt", "uploadedById"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW(), $10)
      RETURNING *`,
      [randomUUID(), title, description, genres || [], tags || [], thumbnailUrl, videoUrl || null, String(type).toUpperCase(), Boolean(isFree), userId],
    );

    const video = insertedVideo.rows[0];
    const createdEpisodes = [];

    if (Array.isArray(episodes) && episodes.length > 0) {
      for (const episode of episodes) {
        const insertedEpisode = await client.query(
          `INSERT INTO "Episode" ("id", "title", "description", "videoUrl", "order", "createdAt", "updatedAt", "videoId")
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), $6)
           RETURNING "id", "title", "description", "videoUrl", "order"`,
          [randomUUID(), episode.title, episode.description, episode.videoUrl, episode.order, video.id],
        );
        createdEpisodes.push(insertedEpisode.rows[0]);
      }
    }

    await client.query("COMMIT");
    return res.status(201).json({ video: mapVideo(video, createdEpisodes) });
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create video." });
  } finally {
    client.release();
  }
});

app.post("/api/uploads", express.raw({ type: "*/*", limit: "250mb" }), async (req, res) => {
  const providedName = req.header("x-file-name");
  if (!providedName) {
    return res.status(400).json({ error: "Missing x-file-name header." });
  }

  if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: "Empty upload body." });
  }

  try {
    await mkdir(uploadsDir, { recursive: true });

    const fallbackExtension =
      req.header("content-type")?.startsWith("image/") ? ".jpg" :
      req.header("content-type")?.startsWith("video/") ? ".mp4" :
      "";

    const safeName = sanitizeFileName(providedName, fallbackExtension);
    const fileName = `${Date.now()}-${safeName}`;
    const filePath = join(uploadsDir, fileName);

    await writeFile(filePath, req.body);

    return res.status(201).json({
      url: `/uploads/${fileName}`,
      absoluteUrl: `${req.protocol}://${req.get("host")}/uploads/${fileName}`,
    });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to save upload." });
  }
});

app.delete("/api/videos/:id", async (req, res) => {
  const userId = req.header("x-user-id");
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    await pool.query('DELETE FROM "Video" WHERE "id" = $1', [req.params.id]);
    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to delete video." });
  }
});

app.listen(port, () => {
  console.log(`Backend API listening on http://localhost:${port}`);
});
