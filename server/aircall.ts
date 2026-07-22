import express from "express";
import { getDb, addBusinessHours, computeIntakeLabels } from "./db";
import { intakeRecords, callHistory, callerProfiles, handlers } from "../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";
import { transcribeAudio } from "./_core/voiceTranscription";
import { notifyOwner } from "./_core/notification";
import { matchClaimNumber, resolveClaimFromSnapsheet, reformatRunOnClaimNumber, matchRunOnClaimNumber } from "./claimMatch";
import { getHandlerByAircallUserId } from "./aircallSync";

export const aircallRouter = express.Router();

// Handler routing rules — full names match the handlers table
// Nicknames: MJ = Mary Joy Badua, Raine = Lorraine Tria, Jobs = Jovel Villa
const HANDLER_ROUTING: Record<string, { id: number; name: string; email: string }> = {
  natasha:    { id: 1,     name: "Natashia Edulan",   email: "natashiae@drivewhip.com" },
  natashia:   { id: 1,     name: "Natashia Edulan",   email: "natashiae@drivewhip.com" },
  jayla:      { id: 2,     name: "Jayla Bernard",      email: "jayla.bernard@drivewhip.com" },
  jela:       { id: 2,     name: "Jayla Bernard",      email: "jayla.bernard@drivewhip.com" },
  mj:         { id: 3,     name: "Mary Joy Badua",     email: "mj.badua@drivewhip.com" },
  "mary joy": { id: 3,     name: "Mary Joy Badua",     email: "mj.badua@drivewhip.com" },
  carlito:    { id: 4,     name: "Carlito Legarde Jr", email: "carlito.legarde@drivewhip.com" },
  annie:      { id: 5,     name: "Annie Ortiz",        email: "annie.ortiz@drivewhip.com" },
  ana:        { id: 6,     name: "Ana Padilla",        email: "anap@drivewhip.com" },
  mary:       { id: 6,     name: "Ana Padilla",        email: "anap@drivewhip.com" },
  catherine:  { id: 7,     name: "Catherine Cestina",  email: "catherine.cestina@drivewhip.com" },
  lorraine:   { id: 9,     name: "Lorraine Tria",      email: "lorraine.tria@drivewhip.com" },
  raine:      { id: 9,     name: "Lorraine Tria",      email: "lorraine.tria@drivewhip.com" },
  daniel:     { id: 10,    name: "Daniel Giono",       email: "daniel.giono@drivewhip.com" },
  tim:        { id: 90001, name: "Tim Chan",             email: "tim.chan@drivewhip.com" },
  "tim chan":  { id: 90001, name: "Tim Chan",             email: "tim.chan@drivewhip.com" },
  geovanni:   { id: 90002, name: "Geovanni Cabrera",     email: "geovanni.cabrera@drivewhip.com" },
  "geo":      { id: 90002, name: "Geovanni Cabrera",     email: "geovanni.cabrera@drivewhip.com" },
  jovel:      { id: 30001, name: "Jovel Villa",         email: "jovel.villa@drivewhip.com" },
  jobs:       { id: 30001, name: "Jovel Villa",         email: "jovel.villa@drivewhip.com" },
  daryl:      { id: 30002, name: "Daryl Ochate",        email: "daryl.ochate@drivewhip.com" },
  madeline:   { id: 30004, name: "Madeline Green",      email: "madeline.green@drivewhip.com" },
  demily:     { id: 30005, name: "Demily Flores",       email: "demily.flores@drivewhip.com" },
};

// Triage queue — for unknowns with no caller info; MJ and Daryl alternate
const TRIAGE_HANDLERS = [
  { id: 3,     name: "Mary Joy Badua", email: "mj.badua@drivewhip.com" },
  { id: 30002, name: "Daryl Ochate",   email: "daryl.ochate@drivewhip.com" },
];
let _triageIndex = 0;
function nextTriageHandler() {
  const h = TRIAGE_HANDLERS[_triageIndex % TRIAGE_HANDLERS.length];
  _triageIndex++;
  return h;
}

// Outbound subro team — 1P vehicle recovery (Madeline, Daniel, Tim Chan); round-robin
const OUTBOUND_SUBRO_TEAM = [
  { id: 30004, name: "Madeline Green", email: "madeline.green@drivewhip.com" },
  { id: 10,    name: "Daniel Giono",  email: "daniel.giono@drivewhip.com" },
  { id: 90001, name: "Tim Chan",       email: "tim.chan@drivewhip.com" },
];
let _outboundSubroIndex = 0;
function nextOutboundSubroHandler() {
  const h = OUTBOUND_SUBRO_TEAM[_outboundSubroIndex % OUTBOUND_SUBRO_TEAM.length];
  _outboundSubroIndex++;
  return h;
}

// Inbound subro team — 3P vehicle / property damage (Carlito, Catherine); round-robin
const INBOUND_SUBRO_TEAM = [
  { id: 4, name: "Carlito Legarde Jr", email: "carlito.legarde@drivewhip.com" },
  { id: 7, name: "Catherine Cestina",  email: "catherine.cestina@drivewhip.com" },
];
let _inboundSubroIndex = 0;
function nextInboundSubroHandler() {
  const h = INBOUND_SUBRO_TEAM[_inboundSubroIndex % INBOUND_SUBRO_TEAM.length];
  _inboundSubroIndex++;
  return h;
}

// First-party team — for repairs/claim status/total loss; round-robin
const FIRST_PARTY_TEAM = [
  { id: 1,     name: "Natashia Edulan", email: "natashiae@drivewhip.com" },
  { id: 9,     name: "Lorraine Tria",   email: "lorraine.tria@drivewhip.com" },
  { id: 30001, name: "Jovel Villa",      email: "jovel.villa@drivewhip.com" },
  { id: 5,     name: "Annie Ortiz",     email: "annie.ortiz@drivewhip.com" },
];
let _firstPartyIndex = 0;
function nextFirstPartyHandler() {
  const h = FIRST_PARTY_TEAM[_firstPartyIndex % FIRST_PARTY_TEAM.length];
  _firstPartyIndex++;
  return h;
}

// Keyword patterns for content-based routing (checked against message + transcript)
// 1P subro: caller is seeking recovery FOR our vehicle / our insured (outbound subro team)
const SUBRO_1P_REGEX = /\b(subro(gation)?|demand( letter| package)?|recovery package|reimbursement)\b/i;
const SUBRO_1P_VEHICLE_REGEX = /\b(your (vehicle|insured|client|driver|member)|our vehicle|1p|first.?party|your claim|your insured'?s? vehicle|whip vehicle|whip driver)\b/i;
// 3P subro: caller is asserting a claim AGAINST us for their vehicle (inbound subro / Carlito+Catherine)
const SUBRO_3P_REGEX = /\b(subro(gation)?|demand( letter| package)?|settlement|lien|reimbursement|recovery package)\b/i;
const SUBRO_3P_VEHICLE_REGEX = /\b(my (vehicle|car|truck)|our (vehicle|car)|their vehicle|third.?party|3rd.?party|property damage|pd claim)\b/i;
const INJURY_REGEX   = /\b(pip|personal injury|bodily injury|bi claim|injury claim|medical treatment|pain and suffering|attorney|represented|lawsuit|litigation)\b/i;
const PD_REGEX       = /\b(property damage|pd claim|third.?party|3rd party|vehicle damage|repair estimate|damage claim|collision damage)\b/i;
const TOTAL_LOSS_REGEX = /\b(total loss|totaled|write.?off|salvage|ACV|actual cash value|total.?loss claim)\b/i;
const REPAIRS_REGEX  = /\b(repair(s|ing)?|body shop|rental|claim status|status update|supplement|estimate|parts|shop)\b/i;
const SPAM_REGEX     = /\b(fema\.gov|irs\.gov|social security|medicare|press 1 to speak|reduce your (debt|interest)|car warranty|vehicle warranty|student loan|robocall|this call may be recorded for quality|your (amazon|apple|google|microsoft) account|suspicious activity on your account)\b/i;

// Accident/new-loss detection — flag when a member is REPORTING an incident
const ACCIDENT_REPORT_REGEX = /\b(reporting (a|an|the) (accident|loss|crash|collision)|just had an accident|was in an accident|got hit|rear.?ended|side.?swiped|totaled|total loss|vehicle was struck|car was hit|accident report|filing a claim for|backed into|made wrong turn|another driver|other driver|driver hit|driver ran)\b/i;

/**
 * Determine handler assignment using this priority order:
 * 1. Handler explicitly named by caller → route to that person
 * 2. Content keywords in message/transcript → route by topic
 * 3. Caller type → route by role
 * 4. No info at all → triage queue (MJ / Daryl round-robin)
 */
function resolveHandler(
  handlerMentioned: string | null,
  callerType: string,
  message: string | null,
  transcript: string
): { id: number; name: string } {
  // 1. Caller named a specific handler
  if (handlerMentioned) {
    const key = handlerMentioned.toLowerCase().trim();
    for (const [k, v] of Object.entries(HANDLER_ROUTING)) {
      if (key.includes(k)) return v;
    }
  }

    const text = ((message ?? "") + " " + transcript).toLowerCase();

  // Law offices ALWAYS go to Jayla — no exceptions.
  // Madeline/Daniel/Tim Chan handle outbound subro; they do NOT take attorney calls.
  // PD law offices also go to Jayla (she coordinates with Carlito as needed).
  if (callerType === "law_office") {
    return HANDLER_ROUTING.jayla;
  }

  // Medical providers always go to Jayla regardless of any other keywords
  if (callerType === "medical_provider") return HANDLER_ROUTING.jayla;

  // 2. Content-based routing (topic takes priority over caller type)
  // Subro routing — split by direction:
  //   1P outbound subro (recovery for our vehicle) → Madeline / Daniel / Tim Chan
  //   3P inbound subro (claim against us for their vehicle) → Carlito / Catherine
  if (SUBRO_1P_REGEX.test(text) && SUBRO_1P_VEHICLE_REGEX.test(text)) return nextOutboundSubroHandler();
  if (SUBRO_3P_REGEX.test(text) && SUBRO_3P_VEHICLE_REGEX.test(text)) return nextInboundSubroHandler();
  // Generic subro keyword without clear direction → outbound subro team (safer default)
  if (SUBRO_1P_REGEX.test(text)) return nextOutboundSubroHandler();
  // Injury (PIP / BI) → Jayla
  if (INJURY_REGEX.test(text)) return HANDLER_ROUTING.jayla;
  // Total loss → Demily
  if (TOTAL_LOSS_REGEX.test(text)) return HANDLER_ROUTING.demily;
  // Active repairs / claim status → First Party team (round-robin)
  if (REPAIRS_REGEX.test(text)) return nextFirstPartyHandler();
  // PD / 3rd-party property damage → Carlito / Catherine (inbound subro team)
  if (PD_REGEX.test(text)) return nextInboundSubroHandler();
  if (callerType === "carrier")          return nextFirstPartyHandler(); // carriers default to first-party team
  if (callerType === "member" || callerType === "claimant") return nextFirstPartyHandler();

  // 4. Unknown / no info → triage
  return nextTriageHandler();
}

// Extract structured intake data from voicemail transcript using LLM
async function extractIntakeFromTranscript(transcript: string): Promise<{
  callerName: string | null;
  callerOrg: string | null;
  callerType: "carrier" | "law_office" | "medical_provider" | "member" | "claimant" | "police" | "unknown";
  whipClaimNumber: string | null;
  callerRefNumber: string | null;
  callbackPhone: string | null;
  callbackEmail: string | null;
  message: string | null;
  handlerMentioned: string | null;
}> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are an AI assistant for Whip, a rideshare claims management company. 
Extract structured intake information from voicemail transcripts left by callers on the Whip Claims Line.
Caller types:
- "carrier": insurance companies (State Farm, GEICO, Liberty Mutual, Farmers, etc.)
- "law_office": law firms, attorneys, legal offices
- "medical_provider": hospitals, clinics, medical billing companies
- "member": Whip rideshare driver/member
- "claimant": third-party claimant in an accident
- "police": law enforcement
- "unknown": cannot determine

Whip claim number formats — there are TWO valid formats:
1. NEW format: STATE-NNNN-VVVVVV-CCCCCC (2-letter state + 4 digits + 6 digits + 6 digits)
   Examples: MD-9562-020976-523574, GA-4899-430247-470636, TX-1234-567890-123456
2. OLD format: 6 to 8 digit number (last 6-8 digits of the vehicle VIN)
   Examples: 501732, 2031368, 70608400, AU0000203231

Key phrases that indicate a Whip claim number:
- "your reference number is", "Whip ref", "your ref", "reference number", "claim number is", "file number", "Whip claim"
- When a caller says "your reference number is 501732" — that 501732 IS the Whip claim number
- When a caller says "Whip ref AU0000203231" — that AU0000203231 IS the Whip claim number

Distinguish carefully:
- whipClaimNumber = the number that belongs to WHIP (what the caller refers to as "your" number, "Whip's" number)
- callerRefNumber = the caller's OWN reference/file/claim number (their internal number, e.g. "our claim number is 268-002825")

IMPORTANT: Whisper often transcribes NEW-format claim numbers as run-on strings without dashes (e.g. "MD984579089815372"). You MUST detect these and reformat them into STATE-NNNN-VVVVVV-CCCCCC format.

Return ONLY valid JSON with these exact fields. Use null for any field not found.`,
      },
      {
        role: "user",
        content: `Extract intake information from this voicemail transcript:\n\n${transcript}`,
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
            callerName: { type: ["string", "null"], description: "Full name of the caller" },
            callerOrg: { type: ["string", "null"], description: "Organization/company the caller is from" },
            callerType: {
              type: "string",
              enum: ["carrier", "law_office", "medical_provider", "member", "claimant", "police", "unknown"],
              description: "Type of caller",
            },
            whipClaimNumber: { type: ["string", "null"], description: "Whip claim number mentioned (e.g. 031368, WC-12345)" },
            callerRefNumber: { type: ["string", "null"], description: "Caller's own reference/file/claim number" },
            callbackPhone: { type: ["string", "null"], description: "Phone number for callback" },
            callbackEmail: { type: ["string", "null"], description: "Email address for callback" },
            message: { type: ["string", "null"], description: "Summary of the caller's message/purpose" },
            handlerMentioned: { type: ["string", "null"], description: "Name of Whip handler/person they asked for" },
          },
          required: ["callerName", "callerOrg", "callerType", "whipClaimNumber", "callerRefNumber", "callbackPhone", "callbackEmail", "message", "handlerMentioned"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No LLM response");
  return JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
}

// Check for repeat callers and update caller profile
async function checkRepeatCaller(
  db: ReturnType<typeof import("drizzle-orm/mysql2").drizzle>,
  phone: string,
  name: string | null,
  org: string | null,
  callerType: string,
  claimNumber: string | null
): Promise<{ isRepeat: boolean; callCount: number }> {
  const existing = await db
    .select()
    .from(callerProfiles)
    .where(eq(callerProfiles.phone, phone))
    .limit(1);

  if (existing.length === 0) {
    // New caller — create profile
    await db.insert(callerProfiles).values({
      phone,
      name: name ?? undefined,
      org: org ?? undefined,
      callerType: callerType as any,
      totalCalls: 1,
      lastCallAt: new Date(),
      claimNumbers: claimNumber ? JSON.stringify([claimNumber]) : null,
    });
    return { isRepeat: false, callCount: 1 };
  }

  // Existing caller — update
  const profile = existing[0];
  const newCount = (profile.totalCalls ?? 1) + 1;
  let claimNumbers: string[] = [];
  try {
    claimNumbers = profile.claimNumbers ? JSON.parse(profile.claimNumbers) : [];
  } catch {}
  if (claimNumber && !claimNumbers.includes(claimNumber)) {
    claimNumbers.push(claimNumber);
  }

  await db
    .update(callerProfiles)
    .set({
      totalCalls: newCount,
      lastCallAt: new Date(),
      name: name ?? profile.name ?? undefined,
      org: org ?? profile.org ?? undefined,
      claimNumbers: JSON.stringify(claimNumbers),
    })
    .where(eq(callerProfiles.phone, phone));

  return { isRepeat: newCount > 1, callCount: newCount };
}

// Main voicemail processing function
export async function processVoicemail(params: {
  aircallCallId: string;
  callerPhone: string;
  voicemailUrl: string;
  startedAt: Date;
  endedAt?: Date;
  aircallNumberId?: number;
  aircallNumberName?: string;
  aircallAgentId?: number;  // Aircall user ID of the agent whose mailbox received the call
  routingMethod?: "ivr" | "extension" | "manual"; // How this voicemail was routed to this handler
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Guard: skip if an intake record already exists for this call ID (prevents duplicates from race conditions)
  const existing = await db
    .select({ id: intakeRecords.id, status: intakeRecords.status })
    .from(intakeRecords)
    .where(eq(intakeRecords.aircallCallId, params.aircallCallId))
    .limit(1);
  if (existing.length > 0) {
    console.log(`[Aircall] Intake already exists for call ${params.aircallCallId} (id=${existing[0].id}, status=${existing[0].status}) — skipping`);
    return { skipped: true, intakeId: existing[0].id };
  }
  console.log(`[Aircall] Processing voicemail for call ${params.aircallCallId}`);
  // 1. Transcribe the voicemail
  let transcript = "";
  try {
    const result = await transcribeAudio({
      audioUrl: params.voicemailUrl,
      language: "en",
      prompt: "Voicemail for Whip Claims. Caller may mention claim numbers, insurance companies, law offices, or medical providers.",
    });
    transcript = (result as any).text ?? "";
  } catch (err) {
    console.error("[Aircall] Transcription failed:", err);
    transcript = "[Transcription unavailable]";
  }

  // 2. Extract structured intake data
  let extracted: Awaited<ReturnType<typeof extractIntakeFromTranscript>>;
  try {
    extracted = await extractIntakeFromTranscript(transcript);
  } catch (err) {
    console.error("[Aircall] LLM extraction failed:", err);
    extracted = {
      callerName: null,
      callerOrg: null,
      callerType: "unknown",
      whipClaimNumber: null,
      callerRefNumber: null,
      callbackPhone: params.callerPhone,
      callbackEmail: null,
      message: transcript,
      handlerMentioned: null,
    };
  }

  // 2b. Spam / robocall detection — skip intake creation for junk calls
  if (SPAM_REGEX.test(transcript)) {
    console.log(`[Aircall] Skipping intake for call ${params.aircallCallId} — detected as spam/robocall`);
    // Mark in call_history so backfill doesn’t retry
    await db.update(callHistory).set({ hasIntakeRecord: true }).where(eq(callHistory.aircallCallId, params.aircallCallId));
    return { success: false, skipped: true, reason: "spam" };
  }
  // Also skip if transcript is blank or a single short word (empty voicemail)
  if (!transcript || transcript.trim().length < 10) {
    console.log(`[Aircall] Skipping intake for call ${params.aircallCallId} — empty/blank voicemail`);
    await db.update(callHistory).set({ hasIntakeRecord: true }).where(eq(callHistory.aircallCallId, params.aircallCallId));
    return { success: false, skipped: true, reason: "empty" };
  }

  // 2c. Phone history cross-reference — pre-populate caller info from prior calls if LLM found nothing
  if (!extracted.callerName && !extracted.callerOrg && params.callerPhone) {
    try {
      const mysql = await import("mysql2/promise");
      const client = await mysql.createConnection(process.env.DATABASE_URL!);
      const [priorRows] = await client.query(
        `SELECT callerName, callerOrg, callerType FROM intake_records
         WHERE callerPhone = ? AND (callerName IS NOT NULL OR callerOrg IS NOT NULL)
         ORDER BY createdAt DESC LIMIT 1`,
        [params.callerPhone]
      ) as any[];
      await client.end();
      if (priorRows.length > 0) {
        const prior = priorRows[0];
        extracted.callerName = extracted.callerName ?? prior.callerName ?? null;
        extracted.callerOrg  = extracted.callerOrg  ?? prior.callerOrg  ?? null;
        if (extracted.callerType === "unknown" && prior.callerType) {
          extracted.callerType = prior.callerType;
        }
        console.log(`[Aircall] Pre-populated caller info from history for ${params.callerPhone}: ${prior.callerName} / ${prior.callerOrg}`);
      }
    } catch (err) {
      console.warn("[Aircall] Phone history lookup failed:", err);
    }
  }

  // 3. Check for repeat caller
  const { isRepeat, callCount } = await checkRepeatCaller(
    db,
    params.callerPhone,
    extracted.callerName,
    extracted.callerOrg,
    extracted.callerType,
    extracted.whipClaimNumber
  );

  // 4. Resolve handler assignment
  // Priority: (a) extension owner (Aircall user ID match) → (b) caller named someone → (c) content/type routing
  const extensionHandler = getHandlerByAircallUserId(params.aircallAgentId ?? null);
  const handler = extensionHandler
    ? extensionHandler
    : resolveHandler(extracted.handlerMentioned, extracted.callerType, extracted.message, transcript);
  if (extensionHandler) {
    console.log(`[Aircall] Extension routing: call ${params.aircallCallId} assigned to ${extensionHandler.name} (Aircall user ${params.aircallAgentId})`);
  }

  // 5. Determine priority
  let priority: "normal" | "high" | "urgent" = "normal";
  if (isRepeat && callCount >= 3) priority = "urgent";
  else if (isRepeat) priority = "high";
  // Law office calls are always high priority
  if (extracted.callerType === "law_office" && priority === "normal") priority = "high";
  // Members/claimants reporting an accident are high priority
  if (
    (extracted.callerType === "member" || extracted.callerType === "claimant") &&
    priority === "normal" &&
    ACCIDENT_REPORT_REGEX.test(extracted.message || "")
  ) priority = "high";

  // 5b. Claim number matching
  let claimMatchType: string | null = null;
  let claimMatchConfidence: number | null = null;
  let snapsheetClaimUrl: string | null = null;

  // 2d. Normalize run-on claim numbers from Whisper (e.g. "GA4899430247470636" → "GA-4899-430247-470636")
  if (extracted.whipClaimNumber) {
    // First try unambiguous 18-char reformat
    const reformatted = reformatRunOnClaimNumber(extracted.whipClaimNumber);
    if (reformatted) {
      console.log(`[Aircall] Reformatted run-on claim number: ${extracted.whipClaimNumber} → ${reformatted}`);
      extracted.whipClaimNumber = reformatted;
    } else {
      // Ambiguous length (e.g. 17 chars) — try matching against known claims by stripping dashes
      try {
        const existingForMatch = await db
          .select({ whipClaimNumber: intakeRecords.whipClaimNumber })
          .from(intakeRecords);
        const knownNums = existingForMatch.map(r => r.whipClaimNumber).filter((n): n is string => !!n);
        const matched = matchRunOnClaimNumber(extracted.whipClaimNumber, knownNums);
        if (matched) {
          console.log(`[Aircall] Matched ambiguous run-on claim number: ${extracted.whipClaimNumber} → ${matched}`);
          extracted.whipClaimNumber = matched;
        }
      } catch (err) {
        console.warn("[Aircall] Run-on claim match lookup failed:", err);
      }
    }
  }

  if (extracted.whipClaimNumber) {
    try {
      // Fetch all known claim numbers from DB
      const existingRecords = await db
        .select({ whipClaimNumber: intakeRecords.whipClaimNumber })
        .from(intakeRecords)
        .where(eq(intakeRecords.status, "open"));
      const knownClaimNumbers = existingRecords
        .map((r) => r.whipClaimNumber)
        .filter((n): n is string => !!n);

      const matchResult = matchClaimNumber(extracted.whipClaimNumber, knownClaimNumbers);
      claimMatchType = matchResult.matchType;
      claimMatchConfidence = matchResult.confidence;

      // Attempt Snapsheet lookup
      const snapsheetKey = process.env.SNAPSHEET_API_KEY;
      const snapsheetSecret = process.env.SNAPSHEET_API_SECRET;
      if (snapsheetKey && snapsheetSecret) {
        const snapResult = await resolveClaimFromSnapsheet(
          matchResult.matchedClaimNumber ?? extracted.whipClaimNumber,
          snapsheetKey,
          snapsheetSecret
        );
        snapsheetClaimUrl = snapResult.claimUrl;
      } else {
        console.warn("[Aircall] Snapsheet credentials not configured — skipping claim lookup");
      }
    } catch (err) {
      console.warn("[Aircall] Claim matching failed:", err);
    }
  }

  // 6. Save intake record
  const [insertResult] = await db.insert(intakeRecords).values({
    aircallCallId: params.aircallCallId,
    callerPhone: params.callerPhone,
    callerName: extracted.callerName ?? undefined,
    callerOrg: extracted.callerOrg ?? undefined,
    callerType: extracted.callerType,
    whipClaimNumber: extracted.whipClaimNumber ?? undefined,
    callerRefNumber: extracted.callerRefNumber ?? undefined,
    callbackPhone: extracted.callbackPhone ?? params.callerPhone,
    callbackEmail: extracted.callbackEmail ?? undefined,
    message: extracted.message ?? undefined,
    rawTranscript: transcript,
    handlerId: handler.id,
    handlerName: handler.name,
    status: "open",
    isRepeatCaller: isRepeat,
    repeatCallCount: callCount,
    priority,
    source: "voicemail",
    routingMethod: params.routingMethod ?? (extensionHandler ? "extension" : "ivr"),
    aircallRecordingUrl: params.voicemailUrl,
    claimMatchType: claimMatchType ?? undefined,
    claimMatchConfidence: claimMatchConfidence ?? undefined,
    snapsheetClaimUrl: snapsheetClaimUrl ?? undefined,
    // Callback SLA: due within 4 business hours of receipt
    callbackDueBy: addBusinessHours(new Date(), 4),
    // Auto-compute labels: after_hours, weekend, direct_voicemail
    labels: JSON.stringify(computeIntakeLabels({
      createdAt: new Date(),
      routingMethod: params.routingMethod ?? (extensionHandler ? 'extension' : 'ivr'),
    })),
  });

  // 7. Update call_history record
  await db
    .update(callHistory)
    .set({
      hasIntakeRecord: true,
      intakeRecordId: (insertResult as any).insertId,
    })
    .where(eq(callHistory.aircallCallId, params.aircallCallId));

  // 8. Send notification to handler
  const repeatNote = isRepeat
    ? `\n\n⚠️ REPEAT CALLER: This number has contacted Whip ${callCount} times. Priority: ${priority.toUpperCase()}.`
    : "";

  await notifyOwner({
    title: `${isRepeat ? "🔴 REPEAT " : ""}New Intake: ${extracted.callerOrg ?? extracted.callerName ?? params.callerPhone}`,
    content: `**Assigned to:** ${handler.name}
**Caller:** ${extracted.callerName ?? "Unknown"} — ${extracted.callerOrg ?? "Unknown org"}
**Type:** ${extracted.callerType}
**Whip Claim #:** ${extracted.whipClaimNumber ?? "Not provided"}
**Their Ref #:** ${extracted.callerRefNumber ?? "Not provided"}
**Callback:** ${extracted.callbackPhone ?? params.callerPhone}
**Email:** ${extracted.callbackEmail ?? "Not provided"}
**Message:** ${extracted.message ?? "See transcript"}${repeatNote}`,
  });

  console.log(`[Aircall] Intake record created for call ${params.aircallCallId}, assigned to ${handler.name}`);
  return { success: true, handlerName: handler.name, isRepeat, priority };
}

// Process calls from the Whip Claims Line OR any call where a claims-team agent
// (drivewhip.com email) is the answering/assigned user — this captures extension transfers.
const WHIP_CLAIMS_NUMBER_ID = 1125090;
const WHIP_CLAIMS_NUMBER_NAME = "Whip Claims Line";

// All known claims-team Aircall user IDs (from /v1/users)
const CLAIMS_AGENT_USER_IDS = new Set([
  1794311, // Ana Padilla
  1774596, // Bennet Carlos
  1756923, // Carlito Legarde
  1756924, // Natashia Edulan
  1763684, // Demily Flores
  1827146, // Daryl Ochate
  1836484, // Jovel Villa
  1836944, // Annie Ortiz
  1871743, // Lorraine Tria
  1874373, // MJ Badua
  1881559, // Jayla Bernard
  1924606, // Daniel Giono
  1940186, // Tim Chan
  1947062, // Giovanni Cabrera
]);

// Extension map: Aircall user ID → extension number
const AGENT_EXTENSIONS: Record<number, string> = {
  1794311: '012', // Ana Padilla
  1774596: '175', // Bennet Carlos
  1756923: '325', // Carlito Legarde
  1756924: '326', // Natashia Edulan
  1763684: '011', // Demily Flores
  1827146: '017', // Daryl Ochate
  1836484: '018', // Jovel Villa
  1836944: '019', // Annie Ortiz
  1871743: '040', // Lorraine Tria
  1874373: '041', // MJ Badua
  1881559: '309', // Jayla Bernard
  1924606: '048', // Daniel Giono
  1940186: '028', // Tim Chan
  1947062: '996', // Giovanni Cabrera
};

function isClaimsTeamCall(call: any): boolean {
  const numberId = call?.number?.id ? Number(call.number.id) : null;
  const numberName: string = call?.number?.name ?? "";
  const agentId = call?.user?.id ? Number(call.user.id) : null;
  // Include if it's on the main Claims Line
  if (numberId === WHIP_CLAIMS_NUMBER_ID || numberName === WHIP_CLAIMS_NUMBER_NAME) return true;
  // Include if a known claims-team agent answered/was assigned
  if (agentId && CLAIMS_AGENT_USER_IDS.has(agentId)) return true;
  // Allow calls with no number info (legacy/manual) to pass through
  if (!numberId && !numberName) return true;
  return false;
}

function getCallSource(call: any): 'ring_group' | 'extension' | 'outbound' {
  if (call?.direction === 'outbound') return 'outbound';
  const numberId = call?.number?.id ? Number(call.number.id) : null;
  const numberName: string = call?.number?.name ?? '';
  // If it came through the main ring group line
  if (numberId === WHIP_CLAIMS_NUMBER_ID || numberName === WHIP_CLAIMS_NUMBER_NAME) return 'ring_group';
  // Otherwise it was routed to an agent extension directly
  return 'extension';
}

// Aircall webhook endpoint
aircallRouter.post("/webhook", express.json(), async (req, res) => {
  const { event, data } = req.body ?? {};

  // Always respond quickly to Aircall
  res.status(200).json({ received: true });

  const db = await getDb();
  if (!db) return;

  try {
    if (event === "call.created" || event === "call.ringing_on_agent") {
      // Log the call start
      const call = data;
      if (!call?.id) return;
      // Skip calls not involving the claims team
      if (!isClaimsTeamCall(call)) return;

      const src = getCallSource(call);
      await db
        .insert(callHistory)
        .values({
          aircallCallId: String(call.id),
          direction: call.direction ?? "inbound",
          status: "missed", // will be updated on call.ended
          callerPhone: call.raw_digits ?? call.number?.digits,
          callerName: call.contact?.name ?? undefined,
          aircallNumberId: call.number?.id,
          aircallNumberName: call.number?.name,
          callSource: src,
          startedAt: call.started_at ? new Date(call.started_at * 1000) : new Date(),
        })
        .onDuplicateKeyUpdate({
          set: { callerName: call.contact?.name ?? undefined, callSource: src },
        });
    }

    if (event === "call.ended") {
      const call = data;
      if (!call?.id) return;

      const status =
        call.status === "done"
          ? "answered"
          : call.status === "missed"
          ? "missed"
          : call.status === "voicemail"
          ? "voicemail"
          : "missed";

      await db
        .update(callHistory)
        .set({
          status,
          agentId: call.user?.id,
          agentName: call.user?.first_name || call.user?.last_name
            ? `${call.user.first_name ?? ""} ${call.user.last_name ?? ""}`.trim() || undefined
            : undefined,
          durationSeconds: call.duration ?? 0,
          recordingUrl: call.recording ?? undefined,
          voicemailUrl: call.voicemail ?? undefined,
          endedAt: call.ended_at ? new Date(call.ended_at * 1000) : new Date(),
          callSource: getCallSource(call),
        })
        .where(eq(callHistory.aircallCallId, String(call.id)));
    }

    if (event === "call.voicemail_left") {
      const call = data;
      if (!call?.id || !call?.voicemail) return;
      // Skip voicemails not involving the claims team
      if (!isClaimsTeamCall(call)) return;

      await processVoicemail({
        aircallCallId: String(call.id),
        callerPhone: call.raw_digits ?? call.number?.digits ?? "unknown",
        voicemailUrl: call.voicemail,
        startedAt: call.started_at ? new Date(call.started_at * 1000) : new Date(),
        endedAt: call.ended_at ? new Date(call.ended_at * 1000) : undefined,
        aircallNumberId: call.number?.id,
        aircallNumberName: call.number?.name,
        aircallAgentId: call.user?.id ? Number(call.user.id) : undefined,
      });
    }
  } catch (err) {
    console.error("[Aircall] Webhook processing error:", err);
  }
});

// Manual trigger endpoint for testing / seeding
aircallRouter.post("/process-voicemail", express.json(), async (req, res) => {
  try {
    const result = await processVoicemail(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
