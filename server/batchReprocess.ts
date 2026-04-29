/**
 * batchReprocess.ts
 * Admin-only batch jobs for data cleanup and re-processing.
 */
import { getDb } from "./db";
import { intakeRecords } from "../drizzle/schema";
import { eq, isNull, isNotNull, and, or, sql } from "drizzle-orm";
import { transcribeAudio } from "./_core/voiceTranscription";
import { invokeLLM } from "./_core/llm";
import { matchClaimNumber, resolveClaimFromSnapsheet, reformatRunOnClaimNumber, matchRunOnClaimNumber } from "./claimMatch";

// ─── Routing helpers (mirrors aircall.ts) ────────────────────────────────────
const HANDLER_ROUTING: Record<string, { id: number; name: string }> = {
  natasha:    { id: 1,     name: "Natashia Edulan" },
  natashia:   { id: 1,     name: "Natashia Edulan" },
  jayla:      { id: 2,     name: "Jayla Bernard" },
  mj:         { id: 3,     name: "Mary Joy Badua" },
  "mary joy": { id: 3,     name: "Mary Joy Badua" },
  carlito:    { id: 4,     name: "Carlito Legarde Jr" },
  annie:      { id: 5,     name: "Annie Ortiz" },
  ana:        { id: 6,     name: "Ana Padilla" },
  catherine:  { id: 7,     name: "Catherine Cestina" },
  lorraine:   { id: 9,     name: "Lorraine Tria" },
  raine:      { id: 9,     name: "Lorraine Tria" },
  daniel:     { id: 10,    name: "Daniel Giono" },
  jovel:      { id: 30001, name: "Jovel Villa" },
  jobs:       { id: 30001, name: "Jovel Villa" },
  daryl:      { id: 30002, name: "Daryl Ochate" },
  madeline:   { id: 30004, name: "Madeline Green" },
  demily:     { id: 30005, name: "Demily Flores" },
};
const TRIAGE_HANDLERS = [
  { id: 3,     name: "Mary Joy Badua" },
  { id: 30002, name: "Daryl Ochate" },
];
const FIRST_PARTY_TEAM = [
  { id: 1,     name: "Natashia Edulan" },
  { id: 9,     name: "Lorraine Tria" },
  { id: 30001, name: "Jovel Villa" },
  { id: 5,     name: "Annie Ortiz" },
];
let _triageIdx = 0;
let _fpIdx = 0;
function nextTriage() { const h = TRIAGE_HANDLERS[_triageIdx % TRIAGE_HANDLERS.length]; _triageIdx++; return h; }
function nextFP()     { const h = FIRST_PARTY_TEAM[_fpIdx % FIRST_PARTY_TEAM.length]; _fpIdx++; return h; }

const SUBRO_REGEX    = /\b(subro(gation)?|demand( letter| package)?|settlement|lien|reimbursement|recovery package)\b/i;
const INJURY_REGEX   = /\b(pip|personal injury|bodily injury|bi claim|injury claim|medical treatment|pain and suffering|attorney|represented|lawsuit|litigation)\b/i;
const PD_REGEX       = /\b(property damage|pd claim|third.?party|3rd party|vehicle damage|repair estimate|damage claim|collision damage)\b/i;
const TOTAL_LOSS_REGEX = /\b(total loss|totaled|write.?off|salvage|ACV|actual cash value|total.?loss claim)\b/i;
const REPAIRS_REGEX  = /\b(repair(s|ing)?|body shop|rental|claim status|status update|supplement|estimate|parts|shop)\b/i;

function resolveHandlerFromContent(
  handlerMentioned: string | null,
  callerType: string | null,
  message: string | null,
  transcript: string | null
): { id: number; name: string } {
  if (handlerMentioned) {
    const key = handlerMentioned.toLowerCase().trim();
    for (const [k, v] of Object.entries(HANDLER_ROUTING)) {
      if (key.includes(k)) return v;
    }
  }
  const text = ((message ?? "") + " " + (transcript ?? "")).toLowerCase();
  if (callerType === "law_office") {
    if (PD_REGEX.test(text)) return HANDLER_ROUTING.carlito;
    return HANDLER_ROUTING.jayla;
  }
  if (callerType === "medical_provider") return HANDLER_ROUTING.jayla;
  if (SUBRO_REGEX.test(text))    return HANDLER_ROUTING.madeline;
  if (INJURY_REGEX.test(text))   return HANDLER_ROUTING.jayla;
  if (TOTAL_LOSS_REGEX.test(text)) return HANDLER_ROUTING.demily;
  if (REPAIRS_REGEX.test(text))  return nextFP();
  if (PD_REGEX.test(text))       return HANDLER_ROUTING.carlito;
  if (callerType === "carrier" || callerType === "member" || callerType === "claimant") return nextFP();
  return nextTriage();
}

// ─── Job 1: Re-transcribe records with URL but empty transcript ───────────────
export async function reprocessEmptyTranscripts(batchSize = 20): Promise<{
  processed: number; succeeded: number; failed: number; skipped: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const rows = await db
    .select()
    .from(intakeRecords)
    .where(
      and(
        isNotNull(intakeRecords.aircallRecordingUrl),
        or(
          isNull(intakeRecords.rawTranscript),
          eq(intakeRecords.rawTranscript, ""),
          eq(intakeRecords.rawTranscript, "[Transcription unavailable]")
        )
      )
    )
    .limit(batchSize);

  let succeeded = 0, failed = 0, skipped = 0;

  for (const row of rows) {
    if (!row.aircallRecordingUrl) { skipped++; continue; }
    try {
      const result = await transcribeAudio({
        audioUrl: row.aircallRecordingUrl,
        language: "en",
        prompt: "Voicemail for Whip Claims. Caller may mention claim numbers, insurance companies, law offices, or medical providers.",
      });
      const transcript = (result as any).text ?? "";
      if (!transcript || transcript.trim().length < 10) { skipped++; continue; }

      // Re-extract structured data
      let extracted: any = {};
      try {
        const llmResp = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are an intake assistant for Whip Claims, an auto insurance company. Extract structured information from voicemail transcripts. Return JSON only.`,
            },
            {
              role: "user",
              content: `Extract from this voicemail transcript:\n\n"${transcript}"\n\nReturn JSON with keys: callerName (string|null), callerOrg (string|null), callerType (one of: carrier|law_office|medical_provider|member|claimant|police|wrong_department|unknown), whipClaimNumber (string|null, format XX-NNNN-NNNNNN-NNNNNN), callbackPhone (string|null), callbackEmail (string|null), message (string, 1-2 sentence summary), handlerMentioned (string|null, first name only if caller asks for specific person).`,
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
                  callerName: { type: ["string", "null"] },
                  callerOrg: { type: ["string", "null"] },
                  callerType: { type: "string" },
                  whipClaimNumber: { type: ["string", "null"] },
                  callbackPhone: { type: ["string", "null"] },
                  callbackEmail: { type: ["string", "null"] },
                  message: { type: "string" },
                  handlerMentioned: { type: ["string", "null"] },
                },
                required: ["callerName", "callerOrg", "callerType", "whipClaimNumber", "callbackPhone", "callbackEmail", "message", "handlerMentioned"],
                additionalProperties: false,
              },
            },
          } as any,
        });
        extracted = JSON.parse((llmResp as any).choices?.[0]?.message?.content ?? "{}");
      } catch { /* keep existing extraction */ }

      // Re-resolve handler
      const handler = resolveHandlerFromContent(
        extracted.handlerMentioned ?? null,
        extracted.callerType ?? row.callerType,
        extracted.message ?? row.message,
        transcript
      );

      await db.update(intakeRecords).set({
        rawTranscript: transcript,
        callerName: extracted.callerName ?? row.callerName ?? undefined,
        callerOrg: extracted.callerOrg ?? row.callerOrg ?? undefined,
        callerType: (extracted.callerType ?? row.callerType) as any,
        whipClaimNumber: extracted.whipClaimNumber ?? row.whipClaimNumber ?? undefined,
        callbackPhone: extracted.callbackPhone ?? row.callbackPhone ?? undefined,
        callbackEmail: extracted.callbackEmail ?? row.callbackEmail ?? undefined,
        message: extracted.message ?? row.message ?? undefined,
        handlerName: handler.name,
        handlerId: handler.id,
      }).where(eq(intakeRecords.id, row.id));

      succeeded++;
    } catch (err) {
      console.error(`[Reprocess] Failed for record ${row.id}:`, err);
      failed++;
    }
  }

  return { processed: rows.length, succeeded, failed, skipped };
}

// ─── Job 2: Re-apply routing rules to Natashia-defaulted records ──────────────
export async function reapplyRoutingRules(batchSize = 100): Promise<{
  processed: number; rerouted: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // Get all open records assigned to Natashia that have a transcript or message
  const rows = await db
    .select()
    .from(intakeRecords)
    .where(
      and(
        eq(intakeRecords.handlerName, "Natashia Edulan"),
        eq(intakeRecords.status, "open"),
        isNotNull(intakeRecords.rawTranscript)
      )
    )
    .limit(batchSize);

  let rerouted = 0;
  for (const row of rows) {
    // Only re-route if the caller didn't explicitly ask for Natashia
    const transcript = row.rawTranscript ?? "";
    const askedForNatashia = /\b(natash(a|ia)|natashia)\b/i.test(transcript);
    if (askedForNatashia) continue;

    const handler = resolveHandlerFromContent(
      null, // don't use handlerMentioned — re-route based on content only
      row.callerType,
      row.message,
      row.rawTranscript
    );

    // Only update if the new handler is different
    if (handler.name !== "Natashia Edulan") {
      await db.update(intakeRecords).set({
        handlerName: handler.name,
        handlerId: handler.id,
      }).where(eq(intakeRecords.id, row.id));
      rerouted++;
    }
  }

  return { processed: rows.length, rerouted };
}

// ─── Job 3: Re-run claim matching on all records ──────────────────────────────
export async function rerunClaimMatching(batchSize = 50): Promise<{
  processed: number; matched: number; unmatched: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // Get records with a claim number but no match result yet (or low confidence)
  const rows = await db
    .select()
    .from(intakeRecords)
    .where(
      and(
        isNotNull(intakeRecords.whipClaimNumber),
        or(
          isNull(intakeRecords.claimMatchType),
          eq(intakeRecords.claimMatchType, "none")
        )
      )
    )
    .limit(batchSize);

  // Get all known claim numbers from DB for matching
  const allRecords = await db
    .select({ whipClaimNumber: intakeRecords.whipClaimNumber })
    .from(intakeRecords)
    .where(isNotNull(intakeRecords.whipClaimNumber));
  const knownClaimNumbers = Array.from(new Set(allRecords.map(r => r.whipClaimNumber).filter((n): n is string => !!n)));

  const snapsheetKey = process.env.SNAPSHEET_API_KEY;
  const snapsheetSecret = process.env.SNAPSHEET_API_SECRET;

  let matched = 0, unmatched = 0;
  for (const row of rows) {
    if (!row.whipClaimNumber) { unmatched++; continue; }
    try {
      // Try to reformat run-on claim numbers
      let claimNum = row.whipClaimNumber;
      const reformatted = reformatRunOnClaimNumber(claimNum);
      if (reformatted) claimNum = reformatted;

      const matchResult = matchClaimNumber(claimNum, knownClaimNumbers);

      let snapsheetClaimUrl: string | null = null;
      if (snapsheetKey && snapsheetSecret && matchResult.matchedClaimNumber) {
        try {
          const snapResult = await resolveClaimFromSnapsheet(
            matchResult.matchedClaimNumber,
            snapsheetKey,
            snapsheetSecret
          );
          snapsheetClaimUrl = snapResult.claimUrl;
        } catch { /* ignore Snapsheet errors */ }
      }

      await db.update(intakeRecords).set({
        whipClaimNumber: claimNum,
        claimMatchType: matchResult.matchType as any,
        claimMatchConfidence: matchResult.confidence,
        snapsheetClaimUrl: snapsheetClaimUrl ?? undefined,
      }).where(eq(intakeRecords.id, row.id));

      if (matchResult.matchType !== "none") matched++;
      else unmatched++;
    } catch (err) {
      console.error(`[ClaimMatch] Failed for record ${row.id}:`, err);
      unmatched++;
    }
  }

  return { processed: rows.length, matched, unmatched };
}

// ─── Job 4: Delete truly empty records (no URL, no transcript, no message) ────
export async function deleteEmptyRecords(): Promise<{ deleted: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // Find records with no voicemail URL, no transcript, and no message
  const rows = await db
    .select({ id: intakeRecords.id })
    .from(intakeRecords)
    .where(
      and(
        isNull(intakeRecords.aircallRecordingUrl),
        or(isNull(intakeRecords.rawTranscript), eq(intakeRecords.rawTranscript, "")),
        or(isNull(intakeRecords.message), eq(intakeRecords.message, ""))
      )
    );

  if (rows.length === 0) return { deleted: 0 };

  const ids = rows.map(r => r.id);
  // Delete in batches of 100
  let deleted = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    await db.delete(intakeRecords).where(
      sql`id IN (${sql.join(batch.map(id => sql`${id}`), sql`, `)})`
    );
    deleted += batch.length;
  }

  return { deleted };
}

// ─── Job 5: Re-run extraction on records with transcript but no callerName ────
export async function enrichNullCallerRecords(batchSize = 20): Promise<{
  processed: number; enriched: number; failed: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const rows = await db
    .select()
    .from(intakeRecords)
    .where(
      and(
        isNull(intakeRecords.callerName),
        isNotNull(intakeRecords.rawTranscript),
        sql`LENGTH(raw_transcript) > 20`
      )
    )
    .limit(batchSize);

  let enriched = 0, failed = 0;
  for (const row of rows) {
    try {
      const llmResp = await invokeLLM({
        messages: [
          { role: "system", content: "Extract caller info from voicemail transcript. Return JSON only." },
          {
            role: "user",
            content: `Transcript: "${row.rawTranscript}"\n\nReturn JSON: { callerName: string|null, callerOrg: string|null, callerType: string, callbackPhone: string|null, message: string }`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "enrich",
            strict: true,
            schema: {
              type: "object",
              properties: {
                callerName: { type: ["string", "null"] },
                callerOrg: { type: ["string", "null"] },
                callerType: { type: "string" },
                callbackPhone: { type: ["string", "null"] },
                message: { type: "string" },
              },
              required: ["callerName", "callerOrg", "callerType", "callbackPhone", "message"],
              additionalProperties: false,
            },
          },
        } as any,
      });
      const extracted = JSON.parse((llmResp as any).choices?.[0]?.message?.content ?? "{}");
      if (extracted.callerName || extracted.callerOrg) {
        await db.update(intakeRecords).set({
          callerName: extracted.callerName ?? undefined,
          callerOrg: extracted.callerOrg ?? undefined,
          callerType: extracted.callerType ?? undefined,
          callbackPhone: extracted.callbackPhone ?? row.callbackPhone ?? undefined,
          message: extracted.message ?? row.message ?? undefined,
        }).where(eq(intakeRecords.id, row.id));
        enriched++;
      }
    } catch (err) {
      console.error(`[Enrich] Failed for record ${row.id}:`, err);
      failed++;
    }
  }

  return { processed: rows.length, enriched, failed };
}
