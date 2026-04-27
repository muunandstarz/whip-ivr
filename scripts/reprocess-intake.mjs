/**
 * reprocess-intake.mjs
 *
 * Re-processes all intake records:
 * 1. Records with empty transcripts → fetch fresh voicemail URL from Aircall API,
 *    transcribe with Whisper, extract caller info via LLM, re-route.
 * 2. Records with existing transcripts → re-apply new routing rules.
 *
 * Run: node scripts/reprocess-intake.mjs
 */

import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const AIRCALL_AUTH = Buffer.from(
  `${process.env.AIRCALL_API_ID}:${process.env.AIRCALL_API_TOKEN}`
).toString("base64");

const FORGE_URL = process.env.BUILT_IN_FORGE_API_URL;
const FORGE_KEY = process.env.BUILT_IN_FORGE_API_KEY;

// ─── Routing rules (mirror of server/aircall.ts) ──────────────────────────────
const HANDLER_ROUTING = {
  natasha:    { id: 1,     name: "Natashia Edulan",   email: "natashiae@drivewhip.com" },
  natashia:   { id: 1,     name: "Natashia Edulan",   email: "natashiae@drivewhip.com" },
  jayla:      { id: 2,     name: "Jayla Bernard",      email: "jayla.bernard@drivewhip.com" },
  jela:       { id: 2,     name: "Jayla Bernard",      email: "jayla.bernard@drivewhip.com" },
  mj:         { id: 3,     name: "Mary Joy Badua",     email: "mj.badua@drivewhip.com" },
  "mary joy": { id: 3,     name: "Mary Joy Badua",     email: "mj.badua@drivewhip.com" },
  carlito:    { id: 4,     name: "Carlito Legarde Jr", email: "carlito.legarde@drivewhip.com" },
  annie:      { id: 5,     name: "Annie Ortiz",        email: "annie.ortiz@drivewhip.com" },
  ana:        { id: 6,     name: "Ana Padilla",        email: "anap@drivewhip.com" },
  lorraine:   { id: 9,     name: "Lorraine Tria",      email: "lorraine.tria@drivewhip.com" },
  raine:      { id: 9,     name: "Lorraine Tria",      email: "lorraine.tria@drivewhip.com" },
  jovel:      { id: 30001, name: "Jovel Villa",         email: "jovel.villa@drivewhip.com" },
  jobs:       { id: 30001, name: "Jovel Villa",         email: "jovel.villa@drivewhip.com" },
  daryl:      { id: 30002, name: "Daryl Ochate",        email: "daryl.ochate@drivewhip.com" },
  madeline:   { id: 30004, name: "Madeline Green",      email: "madeline.green@drivewhip.com" },
  demily:     { id: 30005, name: "Demily Flores",       email: "demily.flores@drivewhip.com" },
};

const TRIAGE_HANDLERS = [
  { id: 3,     name: "Mary Joy Badua", email: "mj.badua@drivewhip.com" },
  { id: 30002, name: "Daryl Ochate",   email: "daryl.ochate@drivewhip.com" },
];
const FIRST_PARTY_TEAM = [
  { id: 1,     name: "Natashia Edulan", email: "natashiae@drivewhip.com" },
  { id: 9,     name: "Lorraine Tria",   email: "lorraine.tria@drivewhip.com" },
  { id: 30001, name: "Jovel Villa",      email: "jovel.villa@drivewhip.com" },
  { id: 5,     name: "Annie Ortiz",     email: "annie.ortiz@drivewhip.com" },
];

let _triageIdx = 0;
let _fpIdx = 0;

const SUBRO_RE    = /\b(subro(gation)?|demand( letter| package)?|payment|settlement|lien|reimbursement|recovery package)\b/i;
const INJURY_RE   = /\b(pip|personal injury|bodily injury|bi claim|injury claim|medical treatment|pain and suffering|attorney|represented|lawsuit|litigation)\b/i;
const PD_RE       = /\b(property damage|pd claim|third.?party|3rd party|vehicle damage|repair estimate|damage claim|collision damage)\b/i;
const TOTAL_RE    = /\b(total loss|totaled|write.?off|salvage|ACV|actual cash value|total.?loss claim)\b/i;
const REPAIRS_RE  = /\b(repair(s|ing)?|body shop|rental|claim status|status update|supplement|estimate|parts|shop)\b/i;
const SPAM_RE     = /\b(fema\.gov|irs|car warranty|vehicle warranty|amazon account|social security|medicare|press 1 to speak|this is a final notice|your account has been|congratulations you('ve| have) been selected)\b/i;

function resolveHandler(handlerMentioned, callerType, message, transcript) {
  if (handlerMentioned) {
    const key = handlerMentioned.toLowerCase().trim();
    for (const [k, v] of Object.entries(HANDLER_ROUTING)) {
      if (key.includes(k)) return v;
    }
  }
  const text = ((message ?? "") + " " + (transcript ?? "")).toLowerCase();
  if (SUBRO_RE.test(text))   return HANDLER_ROUTING.madeline;
  if (INJURY_RE.test(text))  return HANDLER_ROUTING.jayla;
  if (TOTAL_RE.test(text))   return HANDLER_ROUTING.demily;
  if (REPAIRS_RE.test(text)) return FIRST_PARTY_TEAM[_fpIdx++ % FIRST_PARTY_TEAM.length];
  if (PD_RE.test(text))      return HANDLER_ROUTING.carlito;
  if (callerType === "law_office")       return HANDLER_ROUTING.jayla;
  if (callerType === "medical_provider") return HANDLER_ROUTING.jayla;
  if (callerType === "carrier" || callerType === "member" || callerType === "claimant")
    return FIRST_PARTY_TEAM[_fpIdx++ % FIRST_PARTY_TEAM.length];
  return TRIAGE_HANDLERS[_triageIdx++ % TRIAGE_HANDLERS.length];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function fetchFreshVoicemailUrl(aircallCallId) {
  const resp = await fetch(`https://api.aircall.io/v1/calls/${aircallCallId}`, {
    headers: { Authorization: `Basic ${AIRCALL_AUTH}` },
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  return data.call?.voicemail ?? null;
}

async function transcribeUrl(audioUrl) {
  // Download audio to temp file
  const audioResp = await fetch(audioUrl);
  if (!audioResp.ok) return null;
  const buf = Buffer.from(await audioResp.arrayBuffer());
  const tmpPath = `/tmp/vm_${Date.now()}.mp3`;
  fs.writeFileSync(tmpPath, buf);

  // Upload to Manus storage for Whisper
  const { execSync } = await import("child_process");
  let uploadedUrl;
  try {
    const out = execSync(`manus-upload-file ${tmpPath}`, { encoding: "utf8" });
    uploadedUrl = out.trim().split("\n").pop();
  } catch (e) {
    fs.unlinkSync(tmpPath);
    return null;
  }
  fs.unlinkSync(tmpPath);

  // Whisper transcription via Forge API
  const whisperResp = await fetch(`${FORGE_URL}/v1/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FORGE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url: uploadedUrl, language: "en" }),
  });
  if (!whisperResp.ok) return null;
  const whisperData = await whisperResp.json();
  return whisperData.text ?? null;
}

async function extractFromTranscript(transcript, callerPhone) {
  const prompt = `You are a claims intake assistant for Whip Claims, an auto insurance claims company.
Extract structured information from this voicemail transcript.

Transcript: "${transcript}"
Caller phone: ${callerPhone}

Return JSON with these fields (use null if not found):
{
  "callerName": string|null,
  "callerOrg": string|null,
  "callerType": "carrier"|"law_office"|"medical_provider"|"member"|"claimant"|"unknown",
  "whipClaimNumber": string|null,
  "callerRefNumber": string|null,
  "callbackPhone": string|null,
  "callbackEmail": string|null,
  "message": string|null,
  "handlerMentioned": string|null
}`;

  const llmResp = await fetch(`${FORGE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FORGE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0,
    }),
  });
  if (!llmResp.ok) return null;
  const llmData = await llmResp.json();
  try {
    return JSON.parse(llmData.choices[0].message.content);
  } catch {
    return null;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  // Fetch all intake records
  const [records] = await conn.query(`
    SELECT id, aircallCallId, callerPhone, callerName, callerOrg, callerType,
           rawTranscript, message, handlerName, handlerId, aircallRecordingUrl
    FROM intake_records
    ORDER BY id ASC
  `);

  console.log(`Processing ${records.length} intake records...`);

  let reRouted = 0;
  let reTranscribed = 0;
  let skipped = 0;
  let failed = 0;

  for (const rec of records) {
    let transcript = rec.rawTranscript ?? "";
    let extracted = null;
    let needsFullReprocess = !transcript || transcript.trim().length < 10;

    // ── Step 1: Re-transcribe if empty ────────────────────────────────────────
    if (needsFullReprocess && rec.aircallCallId) {
      process.stdout.write(`[${rec.id}] Fetching fresh URL... `);
      const freshUrl = await fetchFreshVoicemailUrl(rec.aircallCallId);
      if (!freshUrl) {
        console.log("no URL from API, skipping");
        skipped++;
        continue;
      }

      // Check for spam before transcribing
      process.stdout.write("transcribing... ");
      transcript = await transcribeUrl(freshUrl);
      if (!transcript) {
        console.log("transcription failed");
        failed++;
        continue;
      }

      if (SPAM_RE.test(transcript) || transcript.trim().length < 10) {
        console.log(`spam/empty (${transcript.slice(0, 50)}), marking done`);
        await conn.query(
          `UPDATE intake_records SET rawTranscript = ?, handlerName = 'SPAM/EMPTY', handlerId = NULL WHERE id = ?`,
          [transcript, rec.id]
        );
        skipped++;
        continue;
      }

      // Extract info from fresh transcript
      process.stdout.write("extracting... ");
      extracted = await extractFromTranscript(transcript, rec.callerPhone);
      reTranscribed++;
    }

    // ── Step 2: Re-route using new rules ──────────────────────────────────────
    const callerType = extracted?.callerType ?? rec.callerType ?? "unknown";
    const message = extracted?.message ?? rec.message ?? null;
    const handlerMentioned = extracted?.handlerMentioned ?? null;
    const handler = resolveHandler(handlerMentioned, callerType, message, transcript);

    // Build update fields
    const updates = {
      handlerId: handler.id,
      handlerName: handler.name,
    };
    if (extracted) {
      if (extracted.callerName)     updates.callerName = extracted.callerName;
      if (extracted.callerOrg)      updates.callerOrg = extracted.callerOrg;
      if (extracted.callerType)     updates.callerType = extracted.callerType;
      if (extracted.whipClaimNumber) updates.whipClaimNumber = extracted.whipClaimNumber;
      if (extracted.callerRefNumber) updates.callerRefNumber = extracted.callerRefNumber;
      if (extracted.callbackPhone)  updates.callbackPhone = extracted.callbackPhone;
      if (extracted.callbackEmail)  updates.callbackEmail = extracted.callbackEmail;
      if (extracted.message)        updates.message = extracted.message;
      updates.rawTranscript = transcript;
    }

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(", ");
    const values = [...Object.values(updates), rec.id];
    await conn.query(`UPDATE intake_records SET ${setClauses} WHERE id = ?`, values);

    console.log(`[${rec.id}] → ${handler.name} (${callerType})${extracted ? " [re-extracted]" : " [re-routed]"}`);
    reRouted++;

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, needsFullReprocess ? 500 : 50));
  }

  await conn.end();

  console.log("\n=== DONE ===");
  console.log(`Re-routed:      ${reRouted}`);
  console.log(`Re-transcribed: ${reTranscribed}`);
  console.log(`Skipped/spam:   ${skipped}`);
  console.log(`Failed:         ${failed}`);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
