/**
 * Comprehensive intake record reprocessor.
 * 
 * Pass 1: Records with no transcript → fetch fresh Aircall URL → transcribe → extract → re-route
 * Pass 2: Records with transcript but missing name/org → re-extract via LLM → re-route
 * Pass 3: ALL records → re-apply routing rules using new logic
 */

import mysql from "mysql2/promise";
import { config } from "dotenv";
config();

const AIRCALL_API_ID = process.env.AIRCALL_API_ID;
const AIRCALL_API_TOKEN = process.env.AIRCALL_API_TOKEN;
const FORGE_API_URL = process.env.BUILT_IN_FORGE_API_URL;
const FORGE_API_KEY = process.env.BUILT_IN_FORGE_API_KEY;
const DB_URL = process.env.DATABASE_URL;

// ─── Routing rules (mirrors server/aircall.ts) ────────────────────────────────
const HANDLER_ROUTING = {
  natasha:    { id: 1,     name: "Natashia Edulan",   email: "natashiae@drivewhip.com" },
  natashia:   { id: 1,     name: "Natashia Edulan",   email: "natashiae@drivewhip.com" },
  jayla:      { id: 2,     name: "Jayla Bernard",     email: "jayla.bernard@drivewhip.com" },
  jela:       { id: 2,     name: "Jayla Bernard",     email: "jayla.bernard@drivewhip.com" },
  mj:         { id: 3,     name: "Mary Joy Badua",    email: "mj.badua@drivewhip.com" },
  "mary joy": { id: 3,     name: "Mary Joy Badua",    email: "mj.badua@drivewhip.com" },
  carlito:    { id: 4,     name: "Carlito Legarde Jr",email: "carlito.legarde@drivewhip.com" },
  annie:      { id: 5,     name: "Annie Ortiz",       email: "annie.ortiz@drivewhip.com" },
  lorraine:   { id: 9,     name: "Lorraine Tria",     email: "lorraine.tria@drivewhip.com" },
  raine:      { id: 9,     name: "Lorraine Tria",     email: "lorraine.tria@drivewhip.com" },
  jovel:      { id: 30001, name: "Jovel Villa",       email: "jovel.villa@drivewhip.com" },
  jobs:       { id: 30001, name: "Jovel Villa",       email: "jovel.villa@drivewhip.com" },
  daryl:      { id: 30002, name: "Daryl Ochate",      email: "daryl.ochate@drivewhip.com" },
  madeline:   { id: 30004, name: "Madeline Green",    email: "madeline.green@drivewhip.com" },
  demily:     { id: 30005, name: "Demily Flores",     email: "demily.flores@drivewhip.com" },
};

const TRIAGE = [
  { id: 3,     name: "Mary Joy Badua",  email: "mj.badua@drivewhip.com" },
  { id: 30002, name: "Daryl Ochate",    email: "daryl.ochate@drivewhip.com" },
];
const FIRST_PARTY = [
  { id: 1,     name: "Natashia Edulan", email: "natashiae@drivewhip.com" },
  { id: 9,     name: "Lorraine Tria",   email: "lorraine.tria@drivewhip.com" },
  { id: 30001, name: "Jovel Villa",     email: "jovel.villa@drivewhip.com" },
  { id: 5,     name: "Annie Ortiz",     email: "annie.ortiz@drivewhip.com" },
];

let _triageIdx = 0;
let _fpIdx = 0;
function nextTriage() { return TRIAGE[_triageIdx++ % TRIAGE.length]; }
function nextFP()     { return FIRST_PARTY[_fpIdx++ % FIRST_PARTY.length]; }

const SUBRO_RE    = /\b(subro(gation)?|demand( letter| package)?|payment|settlement|lien|reimbursement|recovery package)\b/i;
const INJURY_RE   = /\b(pip|personal injury|bodily injury|bi claim|injury claim|medical treatment|pain and suffering|attorney|represented|lawsuit|litigation)\b/i;
const PD_RE       = /\b(property damage|pd claim|third.?party|3rd party|vehicle damage|repair estimate|damage claim|collision damage)\b/i;
const TOTAL_RE    = /\b(total loss|totaled|write.?off|salvage|ACV|actual cash value|total.?loss claim)\b/i;
const REPAIRS_RE  = /\b(repair(s|ing)?|body shop|rental|claim status|status update|supplement|estimate|parts|shop)\b/i;
const SPAM_RE     = /\b(fema\.gov|irs|car warranty|amazon account|social security|medicare|press 1 to speak|your vehicle warranty|student loan)\b/i;

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
  if (REPAIRS_RE.test(text)) return nextFP();
  if (PD_RE.test(text))      return HANDLER_ROUTING.carlito;
  if (callerType === "law_office" || callerType === "medical_provider") return HANDLER_ROUTING.jayla;
  if (callerType === "carrier" || callerType === "member" || callerType === "claimant") return nextFP();
  return nextTriage();
}

// ─── Aircall API ──────────────────────────────────────────────────────────────
async function fetchFreshVoicemailUrl(aircallCallId) {
  const auth = Buffer.from(`${AIRCALL_API_ID}:${AIRCALL_API_TOKEN}`).toString("base64");
  const res = await fetch(`https://api.aircall.io/v1/calls/${aircallCallId}`, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.call?.voicemail || data.call?.recording || null;
}

// ─── Whisper transcription via Forge API ─────────────────────────────────────
async function transcribe(audioUrl) {
  const res = await fetch(`${FORGE_API_URL}/v1/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FORGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url: audioUrl, language: "en" }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Transcription failed ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.text ?? "";
}

// ─── LLM extraction ───────────────────────────────────────────────────────────
async function extractFromTranscript(transcript) {
  const res = await fetch(`${FORGE_API_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FORGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an intake assistant for Whip Claims, a vehicle claims management company.
Extract structured information from voicemail transcripts. 

Whip claim numbers follow the format: STATE-NNNN-NNNNNN-NNNNNN (e.g. MD-9562-020976-523574, GA-4899-430247-470636).
If you see a run-on number like "GA4899430247470636" or "MD984579089815372", reformat it with dashes.
The caller may also mention THEIR OWN reference number (different from the Whip claim number).

callerType must be one of: carrier, law_office, medical_provider, member, claimant, unknown
handlerMentioned: the Whip team member's name if the caller specifically asks for someone (e.g. "calling for Jovel", "for Carlito")`,
        },
        {
          role: "user",
          content: `Extract intake information from this voicemail:\n\n"${transcript}"`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "intake_extraction",
          strict: true,
          schema: {
            type: "object",
            properties: {
              callerName:      { type: ["string", "null"], description: "Full name of the caller" },
              callerOrg:       { type: ["string", "null"], description: "Company/organization the caller represents" },
              callerType:      { type: "string", description: "carrier|law_office|medical_provider|member|claimant|unknown" },
              whipClaimNumber: { type: ["string", "null"], description: "Whip claim number in STATE-NNNN-NNNNNN-NNNNNN format" },
              callerRefNumber: { type: ["string", "null"], description: "Caller's own reference/claim number" },
              callbackPhone:   { type: ["string", "null"], description: "Phone number to call back" },
              callbackEmail:   { type: ["string", "null"], description: "Email address if provided" },
              message:         { type: ["string", "null"], description: "1-2 sentence summary of why they called" },
              handlerMentioned:{ type: ["string", "null"], description: "Whip team member name if specifically requested" },
            },
            required: ["callerName","callerOrg","callerType","whipClaimNumber","callerRefNumber","callbackPhone","callbackEmail","message","handlerMentioned"],
            additionalProperties: false,
          },
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`LLM failed ${res.status}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  return JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const conn = await mysql.createConnection(DB_URL);

const [records] = await conn.query(`
  SELECT id, aircallCallId, callerPhone, callerName, callerOrg, callerType,
         rawTranscript, message, handlerName, handlerId
  FROM intake_records
  ORDER BY id ASC
`);

console.log(`Processing ${records.length} records...`);

let reTranscribed = 0, reExtracted = 0, reRouted = 0, skipped = 0, errors = 0;

for (const rec of records) {
  try {
    let transcript = rec.rawTranscript || "";
    let extracted = null;
    let needsExtraction = false;

    // ── Pass 1: No transcript → fetch fresh URL and transcribe ──────────────
    const noTranscript = !transcript || transcript.trim().length < 10 || transcript === "[Transcription unavailable]";
    if (noTranscript && rec.aircallCallId) {
      process.stdout.write(`[${rec.id}] Fetching fresh URL for call ${rec.aircallCallId}... `);
      const freshUrl = await fetchFreshVoicemailUrl(rec.aircallCallId);
      if (!freshUrl) {
        console.log("No URL available — skipping");
        skipped++;
        continue;
      }
      try {
        transcript = await transcribe(freshUrl);
        if (!transcript || transcript.trim().length < 10) {
          console.log("Empty audio — skipping");
          skipped++;
          continue;
        }
        // Check for spam
        if (SPAM_RE.test(transcript)) {
          console.log("Spam detected — skipping");
          skipped++;
          continue;
        }
        console.log(`Transcribed: "${transcript.slice(0, 80)}..."`);
        reTranscribed++;
        needsExtraction = true;
        // Save transcript immediately
        await conn.query(`UPDATE intake_records SET rawTranscript = ? WHERE id = ?`, [transcript, rec.id]);
      } catch (err) {
        console.log(`Transcription error: ${err.message}`);
        errors++;
        continue;
      }
    }

    // ── Pass 2: Has transcript but missing name/org → re-extract ────────────
    const missingInfo = !rec.callerName && !rec.callerOrg;
    if ((needsExtraction || missingInfo) && transcript && transcript.trim().length >= 10) {
      try {
        process.stdout.write(`[${rec.id}] Re-extracting... `);
        extracted = await extractFromTranscript(transcript);
        console.log(`Name: ${extracted.callerName || "-"}, Org: ${extracted.callerOrg || "-"}, Type: ${extracted.callerType}`);
        reExtracted++;
      } catch (err) {
        console.log(`Extraction error: ${err.message}`);
        errors++;
        // Still re-route even if extraction failed
      }
    }

    // ── Pass 3: Re-route ALL records using new rules ─────────────────────────
    const callerType = extracted?.callerType || rec.callerType || "unknown";
    const message = extracted?.message || rec.message || "";
    const handlerMentioned = extracted?.handlerMentioned || null;
    const handler = resolveHandler(handlerMentioned, callerType, message, transcript);

    // Build update payload
    const updates = { handlerId: handler.id, handlerName: handler.name };
    if (extracted) {
      if (extracted.callerName)      updates.callerName = extracted.callerName;
      if (extracted.callerOrg)       updates.callerOrg = extracted.callerOrg;
      if (extracted.callerType)      updates.callerType = extracted.callerType;
      if (extracted.whipClaimNumber) updates.whipClaimNumber = extracted.whipClaimNumber;
      if (extracted.callerRefNumber) updates.callerRefNumber = extracted.callerRefNumber;
      if (extracted.callbackPhone)   updates.callbackPhone = extracted.callbackPhone;
      if (extracted.callbackEmail)   updates.callbackEmail = extracted.callbackEmail;
      if (extracted.message)         updates.message = extracted.message;
      if (extracted.handlerMentioned) updates.handlerMentioned = extracted.handlerMentioned;
    }

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(", ");
    const values = [...Object.values(updates), rec.id];
    await conn.query(`UPDATE intake_records SET ${setClauses} WHERE id = ?`, values);

    if (handler.name !== rec.handlerName) {
      console.log(`[${rec.id}] Re-routed: ${rec.handlerName} → ${handler.name}`);
      reRouted++;
    }

    // Small delay to avoid rate limiting on LLM/transcription APIs
    if (needsExtraction || missingInfo) {
      await new Promise(r => setTimeout(r, 300));
    }

  } catch (err) {
    console.error(`[${rec.id}] Unexpected error:`, err.message);
    errors++;
  }
}

await conn.end();

console.log(`\n=== DONE ===`);
console.log(`Re-transcribed: ${reTranscribed}`);
console.log(`Re-extracted:   ${reExtracted}`);
console.log(`Re-routed:      ${reRouted}`);
console.log(`Skipped:        ${skipped}`);
console.log(`Errors:         ${errors}`);
