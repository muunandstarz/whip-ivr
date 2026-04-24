/**
 * Seed call_history table from April Aircall data
 * Run: node seed_call_history.mjs
 */
import { createConnection } from "mysql2/promise";
import { readFileSync } from "fs";
import dotenv from "dotenv";
dotenv.config();

const calls = JSON.parse(readFileSync("/home/ubuntu/whip_voicemails/april_claims_calls_raw.json", "utf-8"));

const conn = await createConnection(process.env.DATABASE_URL);

// Map Aircall status to our enum
function mapStatus(call) {
  if (call.voicemail) return "voicemail";
  if (call.status === "done" && call.answered_at) return "answered";
  if (call.status === "done" && !call.answered_at) return "missed";
  if (call.missed_call_reason) return "missed";
  return "missed";
}

// Extract agent name from user object
function getAgentName(call) {
  if (!call.user) return null;
  return `${call.user.first_name || ""} ${call.user.last_name || ""}`.trim() || null;
}

let inserted = 0;
let skipped = 0;

// Process in batches of 100
const BATCH_SIZE = 100;
for (let i = 0; i < calls.length; i += BATCH_SIZE) {
  const batch = calls.slice(i, i + BATCH_SIZE);
  
  for (const call of batch) {
    try {
      const status = mapStatus(call);
      const agentName = getAgentName(call);
      const callerPhone = call.raw_digits?.replace(/\s/g, "") || null;
      const startedAt = call.started_at ? new Date(call.started_at * 1000) : new Date();
      const endedAt = call.ended_at ? new Date(call.ended_at * 1000) : null;
      const durationSeconds = call.duration || 0;
      
      await conn.execute(
        `INSERT IGNORE INTO call_history 
         (aircallCallId, direction, status, callerPhone, callerName, 
          aircallNumberId, aircallNumberName, agentId, agentName,
          durationSeconds, recordingUrl, voicemailUrl, 
          hasIntakeRecord, startedAt, endedAt, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          String(call.id),
          call.direction || "inbound",
          status,
          callerPhone,
          call.contact?.name || null,
          call.number?.id || null,
          call.number?.name || null,
          call.user?.id || null,
          agentName,
          durationSeconds,
          call.recording || null,
          call.voicemail || null,
          false,
          startedAt,
          endedAt,
        ]
      );
      inserted++;
    } catch (err) {
      if (!err.message.includes("Duplicate")) {
        console.error(`Error on call ${call.id}:`, err.message);
      }
      skipped++;
    }
  }
  
  if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= calls.length) {
    console.log(`Progress: ${Math.min(i + BATCH_SIZE, calls.length)}/${calls.length} processed, ${inserted} inserted, ${skipped} skipped`);
  }
}

await conn.end();
console.log(`\nDone! Inserted ${inserted} records, skipped ${skipped}.`);
