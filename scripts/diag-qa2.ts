import { getDb } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) { console.log("no db"); process.exit(1); }

  // What weekStart would the job use today?
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now);
  monday.setDate(diff);
  const weekStart = monday.toISOString().slice(0, 10);
  console.log("weekStart used by job:", weekStart, "| today day:", day);

  // What agentName values exist in call_history for this week?
  const thisWeek = await db.execute(sql`
    SELECT agentName, COUNT(*) as cnt
    FROM call_history
    WHERE startedAt >= ${weekStart}
    GROUP BY agentName
    ORDER BY cnt DESC
    LIMIT 20
  `);
  console.log("\nagentName this week:", JSON.stringify((thisWeek as any)[0], null, 2));

  // What agentName values exist at all (most recent)?
  const allAgents = await db.execute(sql`
    SELECT agentName, COUNT(*) as cnt, MAX(startedAt) as latest
    FROM call_history
    GROUP BY agentName
    ORDER BY latest DESC
    LIMIT 20
  `);
  console.log("\nAll agentNames (most recent):", JSON.stringify((allAgents as any)[0], null, 2));

  // Sample of recent calls with NULL agentName
  const nullAgents = await db.execute(sql`
    SELECT id, agentName, agentId, aircallNumberName, status, startedAt
    FROM call_history
    WHERE startedAt >= ${weekStart}
    ORDER BY startedAt DESC
    LIMIT 10
  `);
  console.log("\nRecent calls this week (sample):", JSON.stringify((nullAgents as any)[0], null, 2));
}

main().catch(console.error).finally(() => process.exit(0));
