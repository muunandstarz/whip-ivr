/**
 * Update call_history table with real agent names from Aircall user data.
 * Maps user IDs from the raw call data to actual names.
 */
import { createConnection } from "mysql2/promise";
import { readFileSync } from "fs";
import dotenv from "dotenv";
dotenv.config();

const calls = JSON.parse(readFileSync("/home/ubuntu/whip_voicemails/april_claims_calls_raw.json", "utf-8"));
const users = JSON.parse(readFileSync("/home/ubuntu/whip_voicemails/aircall_users.json", "utf-8"));

// Build user ID -> name map
const userMap = {};
for (const u of users) {
  userMap[u.id] = u.name || `${u.first_name || ""} ${u.last_name || ""}`.trim();
}

// Build aircall call ID -> agent name map
const callAgentMap = {};
for (const call of calls) {
  if (call.user && call.id) {
    const name = userMap[call.user.id] || `${call.user.first_name || ""} ${call.user.last_name || ""}`.trim() || null;
    if (name) callAgentMap[String(call.id)] = name;
  }
}

console.log(`Built agent map for ${Object.keys(callAgentMap).length} calls`);
console.log("Sample mappings:", Object.entries(callAgentMap).slice(0, 5));

const conn = await createConnection(process.env.DATABASE_URL);

// Update in batches
const entries = Object.entries(callAgentMap);
let updated = 0;
const BATCH = 200;

for (let i = 0; i < entries.length; i += BATCH) {
  const batch = entries.slice(i, i + BATCH);
  for (const [aircallId, agentName] of batch) {
    await conn.execute(
      "UPDATE call_history SET agentName = ? WHERE aircallCallId = ?",
      [agentName, aircallId]
    );
    updated++;
  }
  process.stdout.write(`\rUpdated ${updated}/${entries.length}...`);
}

console.log(`\nDone! Updated ${updated} call records with real agent names.`);

// Verify
const [rows] = await conn.execute(
  "SELECT agentName, COUNT(*) as cnt FROM call_history WHERE agentName IS NOT NULL GROUP BY agentName ORDER BY cnt DESC LIMIT 20"
);
console.log("\nAgent breakdown in DB:");
for (const row of rows) {
  console.log(`  ${row.agentName}: ${row.cnt}`);
}

const [nullRows] = await conn.execute(
  "SELECT COUNT(*) as cnt FROM call_history WHERE agentName IS NULL"
);
console.log(`\nCalls with no agent: ${nullRows[0].cnt}`);

await conn.end();
