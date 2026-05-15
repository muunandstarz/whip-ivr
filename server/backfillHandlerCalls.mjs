/**
 * Backfill call history for Tim Chan (Aircall ID 1940186) and
 * Geovanni Cabrera (Aircall ID 1947062) for the last 90 days.
 * Run with: node server/backfillHandlerCalls.mjs
 */
import mysql from "mysql2/promise";
import { config } from "dotenv";
config({ path: ".env" });

const AIRCALL_API_ID = process.env.AIRCALL_API_ID;
const AIRCALL_API_TOKEN = process.env.AIRCALL_API_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;

const auth = Buffer.from(`${AIRCALL_API_ID}:${AIRCALL_API_TOKEN}`).toString("base64");

async function aircallFetch(path) {
  const res = await fetch(`https://api.aircall.io/v1${path}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error(`Aircall ${res.status}: ${await res.text()}`);
  return res.json();
}

function mapStatus(status, missedReason) {
  if (status === "done") {
    if (!missedReason) return "answered";
    if (missedReason === "voicemail") return "voicemail";
    return "missed";
  }
  if (status === "answered") return "answered";
  if (status === "voicemail") return "voicemail";
  if (status === "missed" || status === "abandoned") {
    if (missedReason === "voicemail") return "voicemail";
    return "missed";
  }
  return "missed";
}

// Last 90 days
const FROM_TS = Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000);

const HANDLERS = [
  { aircallUserId: 1940186, dbId: 90001, name: "Tim Chan" },
  { aircallUserId: 1947062, dbId: 90002, name: "Geovanni Cabrera" },
];

const conn = await mysql.createConnection(DATABASE_URL);

// Get existing aircallCallIds
const [existingRows] = await conn.query(
  "SELECT aircallCallId FROM call_history WHERE aircallCallId IS NOT NULL"
);
const existingIds = new Set(existingRows.map(r => String(r.aircallCallId)));
console.log(`[Backfill] ${existingIds.size} existing call_history records`);

let totalInserted = 0;

for (const handler of HANDLERS) {
  console.log(`\n[Backfill] Processing ${handler.name} (Aircall ID: ${handler.aircallUserId})...`);
  let page = 1;
  let inserted = 0;
  let skipped = 0;

  while (true) {
    const data = await aircallFetch(
      `/calls/search?user_id=${handler.aircallUserId}&from=${FROM_TS}&order=asc&per_page=50&page=${page}`
    );
    const calls = data.calls ?? [];
    if (calls.length === 0) break;

    for (const call of calls) {
      const callId = String(call.id);
      if (existingIds.has(callId)) { skipped++; continue; }

      const status = mapStatus(call.status, call.missed_call_reason);
      const direction = call.direction === "outbound" ? "outbound" : "inbound";

      await conn.execute(
        `INSERT INTO call_history
          (aircallCallId, callerPhone, status, agentId, agentName, handlerId, durationSeconds,
           recordingUrl, voicemailUrl, startedAt, endedAt, direction,
           aircallNumberName, aircallNumberId, hasIntakeRecord, createdAt)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,NOW())
         ON DUPLICATE KEY UPDATE agentName=VALUES(agentName), handlerId=VALUES(handlerId)`,
        [
          callId,
          call.raw_digits ?? null,
          status,
          handler.aircallUserId,
          handler.name,
          handler.dbId,
          call.duration ?? 0,
          call.recording ?? null,
          call.voicemail ?? null,
          call.started_at ? new Date(call.started_at * 1000) : new Date(),
          call.ended_at ? new Date(call.ended_at * 1000) : null,
          direction,
          call.number?.name ?? null,
          call.number?.id ? Number(call.number.id) : null,
        ]
      );
      existingIds.add(callId);
      inserted++;
    }

    console.log(`[Backfill] ${handler.name} page ${page}: ${calls.length} calls, inserted=${inserted}, skipped=${skipped}`);
    if (calls.length < 50) break;
    page++;
    await new Promise(r => setTimeout(r, 150));
  }

  console.log(`[Backfill] ${handler.name}: inserted ${inserted} calls total`);
  totalInserted += inserted;
}

await conn.end();
console.log(`\n[Backfill] Complete. Total inserted: ${totalInserted}`);

// Show summary
const conn2 = await mysql.createConnection(DATABASE_URL);
const [rows] = await conn2.query(
  "SELECT agentName, COUNT(*) as total, SUM(direction='inbound') as inbound, SUM(direction='outbound') as outbound FROM call_history WHERE agentName IN ('Tim Chan','Geovanni Cabrera') GROUP BY agentName"
);
console.log("Final call counts:", JSON.stringify(rows, null, 2));
await conn2.end();
