/**
 * Backfill agentName in call_history for rows where agentId is set but agentName is null.
 * Fetches the full Aircall user list, builds an agentId→name map, then updates rows.
 */
import { getDb } from "../server/db";
import { sql } from "drizzle-orm";

const AIRCALL_API_BASE = "https://api.aircall.io/v1";

function getAuth(): string {
  const id = process.env.AIRCALL_API_ID;
  const token = process.env.AIRCALL_API_TOKEN;
  if (!id || !token) throw new Error("AIRCALL_API_ID and AIRCALL_API_TOKEN must be set");
  return "Basic " + Buffer.from(`${id}:${token}`).toString("base64");
}

async function fetchUsers(): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  let page = 1;
  while (true) {
    const res = await fetch(`${AIRCALL_API_BASE}/users?per_page=50&page=${page}`, {
      headers: { Authorization: getAuth() },
    });
    const data = await res.json() as any;
    const users: any[] = data.users ?? [];
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
  const agentMap = await fetchUsers();
  console.log(`Found ${agentMap.size} Aircall users`);
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
  console.log(`\nFound ${rows.length} distinct agentIds with null agentName:`);
  for (const row of rows) {
    const name = agentMap.get(Number(row.agentId));
    console.log(`  agentId ${row.agentId}: ${row.cnt} rows → resolved name: ${name ?? "NOT FOUND"}`);
  }

  // Update rows
  let updated = 0;
  for (const row of rows) {
    const name = agentMap.get(Number(row.agentId));
    if (!name) continue;
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
}

main().catch(console.error).finally(() => process.exit(0));
