/**
 * Backfill agentName for all call_history rows that have agentId but null agentName.
 * Fetches the full Aircall user list once, builds an id→name map, then bulk-updates.
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

// Use env vars directly — they're injected by the platform, not from .env file
const AIRCALL_API_ID = process.env.AIRCALL_API_ID;
const AIRCALL_API_TOKEN = process.env.AIRCALL_API_TOKEN;
const DB_URL = process.env.DATABASE_URL;

if (!AIRCALL_API_ID || !AIRCALL_API_TOKEN || !DB_URL) {
  console.error("Missing AIRCALL_API_ID, AIRCALL_API_TOKEN, or DATABASE_URL");
  process.exit(1);
}

const auth = Buffer.from(`${AIRCALL_API_ID}:${AIRCALL_API_TOKEN}`).toString("base64");

async function aircallFetch(path) {
  const resp = await fetch(`https://api.aircall.io/v1${path}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!resp.ok) throw new Error(`Aircall ${path} → ${resp.status}`);
  return resp.json();
}

async function buildUserMap() {
  const map = new Map(); // aircallUserId → fullName
  let page = 1;
  while (true) {
    const data = await aircallFetch(`/users?per_page=50&page=${page}`);
    const users = data.users ?? [];
    if (users.length === 0) break;
    for (const u of users) {
      if (u.id) {
        const name = (u.name ?? `${u.first_name ?? ""} ${u.last_name ?? ""}`).trim();
        if (name) map.set(Number(u.id), name);
      }
    }
    if (users.length < 50) break;
    page++;
  }
  console.log(`Built user map: ${map.size} Aircall users`);
  return map;
}

async function main() {
  const userMap = await buildUserMap();

  const conn = await mysql.createConnection(DB_URL);

  // Get all rows with agentId but null agentName
  const [rows] = await conn.execute(
    "SELECT id, agentId FROM call_history WHERE agentId IS NOT NULL AND agentName IS NULL"
  );
  console.log(`Found ${rows.length} rows to backfill`);

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const name = userMap.get(row.agentId);
    if (!name) {
      skipped++;
      continue;
    }
    await conn.execute("UPDATE call_history SET agentName = ? WHERE id = ?", [name, row.id]);
    updated++;
  }

  await conn.end();
  console.log(`Done: ${updated} updated, ${skipped} skipped (unknown agentId)`);
}

main().catch(err => { console.error(err); process.exit(1); });
