import { getDb } from "../server/db.js";
import { intakeRecords } from "../drizzle/schema.js";
import { isNotNull } from "drizzle-orm";

const db = await getDb();
const rows = await db
  .select({ aircallCallId: intakeRecords.aircallCallId, aircallRecordingUrl: intakeRecords.aircallRecordingUrl })
  .from(intakeRecords)
  .where(isNotNull(intakeRecords.aircallRecordingUrl))
  .limit(3);

console.log("Sample rows:");
rows.forEach(r => {
  console.log("  callId:", r.aircallCallId);
  console.log("  recordingUrl (first 100):", r.aircallRecordingUrl?.substring(0, 100));
});

// Test the Aircall API with the first call ID
const first = rows[0];
if (first?.aircallCallId) {
  const apiId = process.env.AIRCALL_API_ID;
  const apiToken = process.env.AIRCALL_API_TOKEN;
  if (!apiId || !apiToken) {
    console.log("No Aircall credentials in env");
    process.exit(0);
  }
  const auth = Buffer.from(`${apiId}:${apiToken}`).toString("base64");
  console.log("\nTesting Aircall API for callId:", first.aircallCallId);
  const res = await fetch(`https://api.aircall.io/v1/calls/${first.aircallCallId}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  console.log("Aircall API status:", res.status);
  if (res.ok) {
    const data = await res.json() as { call?: { voicemail?: string; recording?: string } };
    console.log("voicemail URL:", data?.call?.voicemail?.substring(0, 120) ?? "null");
    console.log("recording URL:", data?.call?.recording?.substring(0, 120) ?? "null");
  } else {
    const text = await res.text();
    console.log("Error:", text.substring(0, 300));
  }
}
process.exit(0);
