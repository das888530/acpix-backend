import pg from "pg";

const { Pool } = pg;
const D1_ACCOUNT_ID = process.env.D1_ACCOUNT_ID;
const D1_DATABASE_NAME = process.env.D1_DATABASE_NAME;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;

const useD1 = Boolean(D1_ACCOUNT_ID && D1_DATABASE_NAME && CLOUDFLARE_API_TOKEN);

if (!useD1 && !DATABASE_URL) {
  throw new Error("DATABASE_URL is not set for backend service.");
}

const pool = !useD1 ? new Pool({ connectionString: DATABASE_URL }) : null;
const d1Endpoint = useD1
  ? `https://api.cloudflare.com/client/v4/accounts/${D1_ACCOUNT_ID}/d1/database/${D1_DATABASE_NAME}/query`
  : null;

function formatD1Sql(sql) {
  return sql.replace(/\$(\d+)/g, "?");
}

function normalizeParam(value) {
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
}

function normalizeParams(values) {
  return (values || []).map(normalizeParam);
}

async function d1Query(sql, values = []) {
  const body = {
    sql: formatD1Sql(sql),
    parameters: normalizeParams(values),
  };

  const response = await fetch(d1Endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json();
  if (!response.ok || payload?.success === false) {
    const message = payload?.errors?.[0]?.message || payload?.message || "D1 query failed.";
    throw new Error(message);
  }

  const rows = payload?.result?.results ?? payload?.results ?? [];
  return {
    rows,
    rowCount: Array.isArray(rows) ? rows.length : 0,
  };
}

export function isD1() {
  return useD1;
}

export async function query(text, values = []) {
  if (useD1) {
    return d1Query(text, values);
  }
  return pool.query(text, values);
}

export async function getClient() {
  if (!useD1) {
    return pool.connect();
  }

  return {
    query: async (text, values = []) => query(text, values),
    release: async () => {},
  };
}
