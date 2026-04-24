/**
 * Batch call classification — transcribes Aircall recordings with Whisper,
 * then uses the LLM to extract caller type, name, org, claim number, and a
 * call summary.  Updates call_history in-place and also enriches caller_profiles.
 */
import { eq, isNull, or, sql } from "drizzle-orm";
import { getDb } from "./db";
import { callHistory, callerProfiles } from "../drizzle/schema";
import { invokeLLM } from "./_core/llm";
import { transcribeAudio } from "./_core/voiceTranscription";

export type CallerType =
  | "carrier"
  | "law_office"
  | "medical_provider"
  | "member"
  | "claimant"
  | "police"
  | "unknown";

export interface ClassificationResult {
  callId: number;
  aircallCallId: string;
  callerType: CallerType;
  callerName: string | null;
  callerOrg: string | null;
  whipClaimNumber: string | null;
  callSummary: string | null;
  rawTranscript: string | null;
  error?: string;
}

/** Extract structured info from a call transcript */
async function extractFromTranscript(transcript: string): Promise<{
  callerName: string | null;
  callerOrg: string | null;
  callerType: CallerType;
  whipClaimNumber: string | null;
  callSummary: string | null;
}> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are an AI assistant for Whip, a rideshare claims management company.
Analyze call recordings/transcripts and extract structured information.
Caller types:
- "carrier": insurance companies (State Farm, GEICO, Liberty Mutual, Farmers, Allstate, Progressive, USAA, etc.)
- "law_office": law firms, attorneys, legal offices, paralegals
- "medical_provider": hospitals, clinics, medical billing companies, chiropractors
- "member": Whip rideshare driver or member
- "claimant": third-party claimant in an accident
- "police": law enforcement
- "unknown": cannot determine from the recording
Return ONLY valid JSON. Use null for any field not found.`,
      },
      {
        role: "user",
        content: `Analyze this call transcript and extract information:\n\n${transcript}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "call_classification",
        strict: true,
        schema: {
          type: "object",
          properties: {
            callerName: { type: ["string", "null"], description: "Full name of the caller if mentioned" },
            callerOrg: { type: ["string", "null"], description: "Organization/company the caller is from" },
            callerType: {
              type: "string",
              enum: ["carrier", "law_office", "medical_provider", "member", "claimant", "police", "unknown"],
              description: "Type of caller based on context",
            },
            whipClaimNumber: { type: ["string", "null"], description: "Whip claim number mentioned (e.g. 031368, WC-12345)" },
            callSummary: { type: ["string", "null"], description: "1-2 sentence summary of the call purpose and outcome" },
          },
          required: ["callerName", "callerOrg", "callerType", "whipClaimNumber", "callSummary"],
          additionalProperties: false,
        },
      },
    },
  });
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No LLM response");
  return JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
}

/** Get count of unclassified calls with recordings */
export async function getUnclassifiedCount(): Promise<{ total: number; withRecording: number }> {
  const db = await getDb();
  if (!db) return { total: 0, withRecording: 0 };

  const [totalRows] = await db
    .select({ count: sql<number>`count(*)` })
    .from(callHistory)
    .where(isNull(callHistory.callerType));

  const [withRecRows] = await db
    .select({ count: sql<number>`count(*)` })
    .from(callHistory)
    .where(
      sql`callerType IS NULL AND (recordingUrl IS NOT NULL OR voicemailUrl IS NOT NULL)`
    );

  return {
    total: Number(totalRows.count),
    withRecording: Number(withRecRows.count),
  };
}

/** Process a single batch of N calls — returns results */
export async function classifyCallBatch(batchSize = 10): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  remaining: number;
  results: ClassificationResult[];
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Fetch next batch of unclassified calls with recordings
  const calls = await db
    .select({
      id: callHistory.id,
      aircallCallId: callHistory.aircallCallId,
      callerPhone: callHistory.callerPhone,
      recordingUrl: callHistory.recordingUrl,
      voicemailUrl: callHistory.voicemailUrl,
      status: callHistory.status,
      durationSeconds: callHistory.durationSeconds,
    })
    .from(callHistory)
    .where(
      sql`callerType IS NULL AND (recordingUrl IS NOT NULL OR voicemailUrl IS NOT NULL) AND classifiedByAI = FALSE`
    )
    .limit(batchSize);

  const results: ClassificationResult[] = [];

  for (const call of calls) {
    const audioUrl = call.recordingUrl ?? call.voicemailUrl;
    if (!audioUrl) continue;

    try {
      // Transcribe
      let transcript = "";
      try {
        const txResult = await transcribeAudio({
          audioUrl,
          language: "en",
          prompt: "Whip Claims call. May mention claim numbers, insurance companies, law offices, medical providers, members, or claimants.",
        });
        transcript = (txResult as any).text ?? "";
      } catch (txErr: any) {
        // If transcription fails (e.g. empty audio, format issue), mark as classified with unknown
        await db
          .update(callHistory)
          .set({ classifiedByAI: true, callerType: "unknown", callSummary: "Transcription failed: " + txErr.message })
          .where(eq(callHistory.id, call.id));
        results.push({
          callId: call.id,
          aircallCallId: call.aircallCallId,
          callerType: "unknown",
          callerName: null,
          callerOrg: null,
          whipClaimNumber: null,
          callSummary: null,
          rawTranscript: null,
          error: "Transcription failed: " + txErr.message,
        });
        continue;
      }

      // Skip very short transcripts (silence, hold music, etc.)
      if (transcript.trim().length < 10) {
        await db
          .update(callHistory)
          .set({ classifiedByAI: true, callerType: "unknown", rawTranscript: transcript, callSummary: "No speech detected" })
          .where(eq(callHistory.id, call.id));
        results.push({
          callId: call.id,
          aircallCallId: call.aircallCallId,
          callerType: "unknown",
          callerName: null,
          callerOrg: null,
          whipClaimNumber: null,
          callSummary: "No speech detected",
          rawTranscript: transcript,
        });
        continue;
      }

      // Extract structured info
      const extracted = await extractFromTranscript(transcript);

      // Update call_history
      await db
        .update(callHistory)
        .set({
          callerType: extracted.callerType,
          callerName: extracted.callerName ?? undefined,
          callerOrg: extracted.callerOrg ?? undefined,
          whipClaimNumber: extracted.whipClaimNumber ?? undefined,
          rawTranscript: transcript,
          callSummary: extracted.callSummary ?? undefined,
          classifiedByAI: true,
        })
        .where(eq(callHistory.id, call.id));

      // Also update caller_profiles if we learned something new
      if (call.callerPhone && extracted.callerType !== "unknown") {
        const existing = await db
          .select()
          .from(callerProfiles)
          .where(eq(callerProfiles.phone, call.callerPhone))
          .limit(1);

        if (existing.length > 0) {
          const profile = existing[0];
          await db
            .update(callerProfiles)
            .set({
              callerType: extracted.callerType as any,
              name: extracted.callerName ?? profile.name ?? undefined,
              org: extracted.callerOrg ?? profile.org ?? undefined,
            })
            .where(eq(callerProfiles.phone, call.callerPhone));
        }
      }

      results.push({
        callId: call.id,
        aircallCallId: call.aircallCallId,
        callerType: extracted.callerType,
        callerName: extracted.callerName,
        callerOrg: extracted.callerOrg,
        whipClaimNumber: extracted.whipClaimNumber,
        callSummary: extracted.callSummary,
        rawTranscript: transcript,
      });
    } catch (err: any) {
      console.error(`[ClassifyCalls] Failed call ${call.id}:`, err.message);
      // Mark as attempted so we don't retry forever
      await db
        .update(callHistory)
        .set({ classifiedByAI: true, callerType: "unknown", callSummary: "Classification error: " + err.message })
        .where(eq(callHistory.id, call.id));
      results.push({
        callId: call.id,
        aircallCallId: call.aircallCallId,
        callerType: "unknown",
        callerName: null,
        callerOrg: null,
        whipClaimNumber: null,
        callSummary: null,
        rawTranscript: null,
        error: err.message,
      });
    }
  }

  // Get remaining count
  const [remainingRows] = await db
    .select({ count: sql<number>`count(*)` })
    .from(callHistory)
    .where(sql`callerType IS NULL AND (recordingUrl IS NOT NULL OR voicemailUrl IS NOT NULL) AND classifiedByAI = FALSE`);

  const succeeded = results.filter((r) => !r.error).length;
  return {
    processed: results.length,
    succeeded,
    failed: results.length - succeeded,
    remaining: Number(remainingRows.count),
    results,
  };
}
