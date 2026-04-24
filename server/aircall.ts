import express from "express";
import { getDb } from "./db";
import { intakeRecords, callHistory, callerProfiles, handlers } from "../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";
import { transcribeAudio } from "./_core/voiceTranscription";
import { notifyOwner } from "./_core/notification";
import { matchClaimNumber, resolveClaimFromSnapsheet } from "./claimMatch";

export const aircallRouter = express.Router();

// Handler routing rules — full names match the handlers table
// Nicknames: MJ = MJ Badua, Raine = Lorraine Tria, Jobs = Jovel Villa
const HANDLER_ROUTING: Record<string, { id: number; name: string; email: string }> = {
  natasha:    { id: 1,  name: "Natashia Edulan",   email: "natashiae@drivewhip.com" },
  natashia:   { id: 1,  name: "Natashia Edulan",   email: "natashiae@drivewhip.com" },
  jayla:      { id: 2,  name: "Jayla Bernard",      email: "jayla.bernard@drivewhip.com" },
  jela:       { id: 2,  name: "Jayla Bernard",      email: "jayla.bernard@drivewhip.com" },
  mj:         { id: 3,  name: "MJ Badua",           email: "mj.badua@drivewhip.com" },
  "mary joy": { id: 3,  name: "MJ Badua",           email: "mj.badua@drivewhip.com" },
  carlito:    { id: 4,  name: "Carlito Legarde Jr", email: "carlito.legarde@drivewhip.com" },
  annie:      { id: 5,  name: "Annie Ortiz",        email: "annie.ortiz@drivewhip.com" },
  ana:        { id: 6,  name: "Ana Padilla",        email: "anap@drivewhip.com" },
  mary:       { id: 6,  name: "Ana Padilla",        email: "anap@drivewhip.com" },  // Ana also goes by Mary
  catherine:  { id: 7,  name: "Catherine Cestina",  email: "catherine.cestina@drivewhip.com" },
  elizabeth:  { id: 8,  name: "Elizabeth Avilla",   email: "elizabeth.avilla@drivewhip.com" },
  lorraine:   { id: 9,  name: "Lorraine Tria",      email: "lorraine.tria@drivewhip.com" },
  raine:      { id: 9,  name: "Lorraine Tria",      email: "lorraine.tria@drivewhip.com" },
  daniel:     { id: 10, name: "Daniel Giono",       email: "daniel.giono@drivewhip.com" },
  jovel:      { id: 11, name: "Jovel Villa",         email: "jovel@drivewhip.com" },
  jobs:       { id: 11, name: "Jovel Villa",         email: "jovel@drivewhip.com" },
  daryl:      { id: 12, name: "Daryl Ochate",        email: "daryl@drivewhip.com" },
};

// Accident/new-loss detection — flag when a member is REPORTING an incident
const ACCIDENT_REPORT_REGEX = /\b(reporting (a|an|the) (accident|loss|crash|collision)|just had an accident|was in an accident|got hit|rear.?ended|side.?swiped|totaled|total loss|vehicle was struck|car was hit|accident report|filing a claim for|backed into|made wrong turn|another driver|other driver|driver hit|driver ran)\b/i;

// Determine handler from extracted data
function resolveHandler(handlerMentioned: string | null, callerType: string): { id: number; name: string } {
  if (handlerMentioned) {
    const key = handlerMentioned.toLowerCase().trim();
    for (const [k, v] of Object.entries(HANDLER_ROUTING)) {
      if (key.includes(k)) return v;
    }
  }
  // Default routing by caller type
  if (callerType === "law_office") return HANDLER_ROUTING.jayla;
  if (callerType === "carrier") return HANDLER_ROUTING.natasha;
  if (callerType === "medical_provider") return HANDLER_ROUTING.jayla;
  return HANDLER_ROUTING.natasha;
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
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

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
  const handler = resolveHandler(extracted.handlerMentioned, extracted.callerType);

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
      const snapsheetKey = process.env.SNAPSHEET_API_KEY || "whip_us_api";
      const snapsheetSecret = process.env.SNAPSHEET_API_SECRET || "966b25c04c9ae6ff38b6";
      const snapResult = await resolveClaimFromSnapsheet(
        matchResult.matchedClaimNumber ?? extracted.whipClaimNumber,
        snapsheetKey,
        snapsheetSecret
      );
      snapsheetClaimUrl = snapResult.claimUrl;
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
    aircallRecordingUrl: params.voicemailUrl,
    claimMatchType: claimMatchType ?? undefined,
    claimMatchConfidence: claimMatchConfidence ?? undefined,
    snapsheetClaimUrl: snapsheetClaimUrl ?? undefined,
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
          startedAt: call.started_at ? new Date(call.started_at * 1000) : new Date(),
        })
        .onDuplicateKeyUpdate({
          set: { callerName: call.contact?.name ?? undefined },
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
          agentName: call.user ? `${call.user.first_name} ${call.user.last_name}` : undefined,
          durationSeconds: call.duration ?? 0,
          recordingUrl: call.recording ?? undefined,
          voicemailUrl: call.voicemail ?? undefined,
          endedAt: call.ended_at ? new Date(call.ended_at * 1000) : new Date(),
        })
        .where(eq(callHistory.aircallCallId, String(call.id)));
    }

    if (event === "call.voicemail_left") {
      const call = data;
      if (!call?.id || !call?.voicemail) return;

      await processVoicemail({
        aircallCallId: String(call.id),
        callerPhone: call.raw_digits ?? call.number?.digits ?? "unknown",
        voicemailUrl: call.voicemail,
        startedAt: call.started_at ? new Date(call.started_at * 1000) : new Date(),
        endedAt: call.ended_at ? new Date(call.ended_at * 1000) : undefined,
        aircallNumberId: call.number?.id,
        aircallNumberName: call.number?.name,
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
