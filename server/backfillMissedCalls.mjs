/**
 * One-time backfill: fix call_history status for all May 2026 inbound calls.
 * Aircall uses status='done' for everything; missed_call_reason tells us if it was really missed.
 * This script UPDATEs existing rows with the correct status.
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
    return "missed"; // short_abandoned, out_of_opening_hours, agents_did_not_answer, etc.
  }
  if (status === "answered") return "answered";
  if (status === "voicemail") return "voicemail";
  if (status === "missed" || status === "abandoned") {
    if (missedReason === "voicemail") return "voicemail";
    return "missed";
  }
  return "missed";
}

// May 2026
const FROM_TS = Math.floor(new Date("2026-05-01T00:00:00Z").getTime() / 1000);
const TO_TS   = Math.floor(new Date("2026-05-31T23:59:59Z").getTime() / 1000);

const conn = await mysql.createConnection(DATABASE_URL);

let page = 1;
let updated = 0;
let alreadyCorrect = 0;

while (true) {
  const data = await aircallFetch(
    `/calls?from=${FROM_TS}&to=${TO_TS}&direction=inbound&order=asc&per_page=50&page=${page}`
  );
  const calls = data.calls ?? [];
  if (calls.length === 0) break;

  for (const call of calls) {
    const correctStatus = mapStatus(call.status, call.missed_call_reason);
    const callId = String(call.id);

    // Update the status in call_history for this aircallCallId
    const [result] = await conn.execute(
      `UPDATE call_history SET status = ?
       WHERE aircallCallId = ? AND status != ?`,
      [correctStatus, callId, correctStatus]
    );
    if (result.affectedRows > 0) {
      updated++;
      if (updated % 20 === 0) console.log(`[Backfill] Updated ${updated} records...`);
    } else {
      alreadyCorrect++;
    }
  }

  console.log(`[Backfill] Page ${page}: ${calls.length} calls processed (updated=${updated}, already_correct=${alreadyCorrect})`);
  if (calls.length < 50) break;
  page++;
  // Small delay to avoid rate limiting
  await new Promise(r => setTimeout(r, 200));
}

await conn.end();
console.log(`[Backfill] Done. Updated ${updated} records, ${alreadyCorrect} were already correct.`);

// Show final status breakdown
const conn2 = await mysql.createConnection(DATABASE_URL);
const [rows] = await conn2.query(
  "SELECT status, COUNT(*) as cnt FROM call_history WHERE DATE_FORMAT(startedAt,'%Y-%m')='2026-05' AND direction='inbound' GROUP BY status"
);
console.log("Final May 2026 inbound status breakdown:", rows);
await conn2.end();
