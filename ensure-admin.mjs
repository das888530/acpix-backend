import "dotenv/config";

import { randomBytes, scryptSync } from "node:crypto";
import { query } from "./db.mjs";

const ADMIN_EMAIL = "admin@streamvault.com";
const ADMIN_PASSWORD = "Admin@123";

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function createId() {
  return randomBytes(12).toString("hex");
}

async function ensureAdmin() {
  const passwordHash = hashPassword(ADMIN_PASSWORD);

  const result = await query(
    `
      INSERT INTO "User" (
        "id",
        "email",
        "passwordHash",
        "role",
        "isSubscribed",
        "subscriptionStatus",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        $1,
        $2,
        $3,
        'ADMIN',
        true,
        'ACTIVE',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ("email")
      DO UPDATE SET
        "passwordHash" = EXCLUDED."passwordHash",
        "role" = 'ADMIN',
        "isSubscribed" = true,
        "subscriptionStatus" = 'ACTIVE',
        "updatedAt" = CURRENT_TIMESTAMP
      RETURNING "id", "email", "role";
    `,
    [createId(), ADMIN_EMAIL, passwordHash],
  );

  const row = result.rows[0];
  console.log(`Admin ready: ${row.email} (${row.role})`);
}

ensureAdmin().catch((error) => {
  console.error("Failed to ensure admin:", error);
  process.exit(1);
});
