/**
 * Backfill agentName in call_history using Aircall API.
 * Also builds a hardcoded map from the known agentIds we see in the DB
 * by cross-referencing with the handlers table and the existing named rows.
 */
import { getDb } from "../server/db";
import { sql } from "drizzle-orm";

const AIRCALL_API_BASE = "https://api.aircall.io/v1";

function getAuth(): string | null {
  const id = process.env.AIRCALL_API_ID;
  const token = process.env.AIRCALL_API_TOKEN;
  if (!id || !token) return null;
  return "Basic " + Buffer.from(`${id}:${token}`).toString("base64");
}

async function fetchAllUsers(): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const auth = getAuth();
  if (!auth) {
    console.log("No Aircall credentials — skipping API fetch");
    return map;
  }
  let page = 1;
  while (true) {
    const res = await fetch(`${AIRCALL_API_BASE}/users?per_page=50&page=${page}`, {
      headers: { Authorization: auth },
    });
    if (!res.ok) {
      console.log(`Aircall API error ${res.status}: ${await res.text()}`);
      break;
    }
    const data = await res.json() as any;
    const users: any[] = data.users ?? [];
    console.log(`  Page ${page}: ${users.length} users`);
    if (users.length === 0) break;
    for (const u of users) {
      if (u.id) {
        const name = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim();
        if (name) map.set(Number(u.id), name);
      }
    }
    if (users.length < 50) break;
    page++;
  }
  return map;
}

async function main() {
  const db = await getDb();
  if (!db) { console.log("no db"); process.exit(1); }

  console.log("Fetching Aircall users...");
  const agentMap = await fetchAllUsers();
  console.log(`Aircall API returned ${agentMap.size} users`);

  // Build a supplemental map from existing named rows in call_history
  // (agentId → agentName from rows that already have both)
  const existingNamed = await db.execute(sql`
    SELECT DISTINCT agentId, agentName
    FROM call_history
    WHERE agentId IS NOT NULL AND agentName IS NOT NULL AND agentName != ''
    LIMIT 500
  `);
  for (const row of (existingNamed as any)[0] as Array<{agentId: number; agentName: string}>) {
    if (!agentMap.has(Number(row.agentId))) {
      agentMap.set(Number(row.agentId), row.agentName);
    }
  }
  console.log(`Combined map size (API + existing DB): ${agentMap.size}`);
  agentMap.forEach((name, id) => console.log(`  ${id} → ${name}`));

  // Find all distinct agentIds with null agentName
  const nullRows = await db.execute(sql`
    SELECT DISTINCT agentId, COUNT(*) as cnt
    FROM call_history
    WHERE agentId IS NOT NULL AND (agentName IS NULL OR agentName = '')
    GROUP BY agentId
    ORDER BY cnt DESC
  `);
  const rows = (nullRows as any)[0] as Array<{ agentId: number; cnt: number }>;
  console.log(`\nFound ${rows.length} distinct agentIds with null agentName`);

  let updated = 0;
  for (const row of rows) {
    const name = agentMap.get(Number(row.agentId));
    if (!name) {
      console.log(`  agentId ${row.agentId}: ${row.cnt} rows — NO NAME FOUND, skipping`);
      continue;
    }
    const result = await db.execute(sql`
      UPDATE call_history
      SET agentName = ${name}
      WHERE agentId = ${row.agentId} AND (agentName IS NULL OR agentName = '')
    `);
    const affected = (result as any)[0]?.affectedRows ?? 0;
    console.log(`  Updated ${affected} rows for agentId ${row.agentId} → "${name}"`);
    updated += affected;
  }

  console.log(`\nDone. Total rows updated: ${updated}`);

  // Show summary of what's now in call_history this week
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now);
  monday.setDate(diff);
  const weekStart = monday.toISOString().slice(0, 10);

  const thisWeek = await db.execute(sql`
    SELECT agentName, COUNT(*) as cnt
    FROM call_history
    WHERE startedAt >= ${weekStart}
    GROUP BY agentName
    ORDER BY cnt DESC
  `);
  console.log(`\nThis week (${weekStart}) by agentName:`, JSON.stringify((thisWeek as any)[0], null, 2));
}

main().catch(console.error).finally(() => process.exit(0));
