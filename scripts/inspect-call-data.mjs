/**
 * Inspect raw Aircall call data to understand the structure
 * and find what distinguishes direct extension calls from ring group calls.
 */
import * as dotenv from "dotenv";
dotenv.config();

const AIRCALL_API_BASE = "https://api.aircall.io/v1";

function getAuth() {
  const id = process.env.AIRCALL_API_ID;
  const token = process.env.AIRCALL_API_TOKEN;
  return "Basic " + Buffer.from(`${id}:${token}`).toString("base64");
}

async function aircallFetch(path) {
  const res = await fetch(`${AIRCALL_API_BASE}${path}`, {
    headers: { Authorization: getAuth(), "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Aircall ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  const now = new Date();
  const todayMidnightUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from = Math.floor(todayMidnightUTC.getTime() / 1000);

  // Get today's inbound calls on the Claims Line
  const data = await aircallFetch(`/calls?from=${from}&order=asc&per_page=10`);
  const calls = data.calls ?? [];
  
  console.log(`Sample of today's calls (first ${calls.length}):\n`);
  for (const call of calls.slice(0, 5)) {
    console.log("---");
    console.log(JSON.stringify({
      id: call.id,
      direction: call.direction,
      status: call.status,
      missed_call_reason: call.missed_call_reason,
      duration: call.duration,
      raw_digits: call.raw_digits,
      number: call.number ? { id: call.number.id, name: call.number.name, digits: call.number.digits } : null,
      user: call.user ? { id: call.user.id, name: call.user.name, email: call.user.email } : null,
      // Check for any routing-related fields
      teams: call.teams,
      tags: call.tags,
      transferred_to: call.transferred_to,
      transferred_from: call.transferred_from,
      comments: call.comments,
      // Timing
      started_at: call.started_at ? new Date(call.started_at * 1000).toISOString() : null,
      ended_at: call.ended_at ? new Date(call.ended_at * 1000).toISOString() : null,
      answered_at: call.answered_at ? new Date(call.answered_at * 1000).toISOString() : null,
    }, null, 2));
  }

  // Check what's in call_history DB for today
  const mysql = await import("mysql2/promise");
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const [rows] = await conn.query(
    `SELECT callSource, COUNT(*) as cnt, 
            SUM(CASE WHEN status='answered' THEN 1 ELSE 0 END) as answered,
            SUM(CASE WHEN status='missed' THEN 1 ELSE 0 END) as missed,
            SUM(CASE WHEN status='voicemail' THEN 1 ELSE 0 END) as voicemail
     FROM call_history 
     WHERE startedAt >= ? 
     GROUP BY callSource`,
    [todayMidnightUTC]
  );
  console.log("\nToday's call_history breakdown by callSource:");
  console.table(rows);

  const [sample] = await conn.query(
    `SELECT id, aircallCallId, callSource, status, agentName, aircallNumberName, durationSeconds, startedAt
     FROM call_history 
     WHERE startedAt >= ? 
     ORDER BY startedAt DESC 
     LIMIT 10`,
    [todayMidnightUTC]
  );
  console.log("\nMost recent 10 calls today:");
  console.table(sample);

  await conn.end();
}

main().catch(err => { console.error(err); process.exit(1); });
