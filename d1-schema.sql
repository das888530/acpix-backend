-- D1-compatible schema for the ACPIX backend.
-- Apply this using the Cloudflare D1 schema editor or deploy it with D1 migration tooling.

CREATE TABLE IF NOT EXISTS "User" (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  passwordHash TEXT,
  role TEXT NOT NULL DEFAULT 'USER',
  isSubscribed INTEGER NOT NULL DEFAULT 0,
  subscriptionStatus TEXT NOT NULL DEFAULT 'NONE',
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Video" (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  genres TEXT NOT NULL DEFAULT '[]',
  tags TEXT NOT NULL DEFAULT '[]',
  thumbnailUrl TEXT NOT NULL,
  videoUrl TEXT,
  type TEXT NOT NULL DEFAULT 'MOVIE',
  isFree INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  publishedAt TEXT,
  uploadedById TEXT,
  FOREIGN KEY (uploadedById) REFERENCES "User"(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "Video_type_idx" ON "Video" (type);
CREATE INDEX IF NOT EXISTS "Video_createdAt_idx" ON "Video" (createdAt);

CREATE TABLE IF NOT EXISTS "Episode" (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  videoUrl TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  videoId TEXT NOT NULL,
  FOREIGN KEY (videoId) REFERENCES "Video"(id) ON DELETE CASCADE,
  UNIQUE (videoId, "order")
);

CREATE INDEX IF NOT EXISTS "Episode_videoId_idx" ON "Episode" (videoId);

CREATE TABLE IF NOT EXISTS "Subscription" (
  id TEXT PRIMARY KEY,
  planName TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  startedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  endsAt TEXT,
  canceledAt TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  userId TEXT NOT NULL,
  FOREIGN KEY (userId) REFERENCES "User"(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "Subscription_userId_status_idx" ON "Subscription" (userId, status);
