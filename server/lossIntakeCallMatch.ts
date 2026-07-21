/**
 * Loss Intake Call Matching Service
 *
 * Matches Aircall call_history records to loss_intake_claims by:
 *   1. Member name similarity (fuzzy match)
 *   2. Phone number match (when available)
 *   3. Date proximity (call within ±14 days of FNOL post date)
 *   4. Agent assignment (call agent matches claim's assignedAgent)
 *
 * Once matched, AI QA scoring evaluates the call against the Loss Intake rubric:
 *   - Greeting & identification (1-10)
 *   - Facts of Loss documented (1-10)
 *   - Rideshare status asked (1-10)
 *   - Professional close (1-10)
 *   - Empathy & member experience (1-10)
 *   - Overall score (weighted average)
 */

import { getDb } from "./db";
import { callHistory, lossIntakeClaims, lossIntakeCallQas } from "../drizzle/schema";
import { eq, and, gte, lte, isNull, or, like } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";
import { transcribeAudio } from "./_core/voiceTranscription";

function requireDb<T>(db: T | null): T {
  if (!db) throw new Error("Database not available");
  return db;
}

// ─── Name Similarity ──────────────────────────────────────────────────────────

/**
 * Normalize a name for comparison: lowercase, remove punctuation, sort tokens.
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .split(/\s+/)
    .sort()
    .join(" ");
}

/**
 * Simple token overlap similarity between two names.
 * Returns 0-1 score.
 */
function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const tokensA = new Set(normalizeName(a).split(" ").filter(Boolean));
  const tokensB = new Set(normalizeName(b).split(" ").filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let overlap = 0;
  for (const t of Array.from(tokensA)) {
    if (tokensB.has(t)) overlap++;
  }
  return overlap / Math.max(tokensA.size, tokensB.size);
}

/**
 * Normalize phone number to digits only for comparison.
 */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").replace(/^1/, ""); // strip country code
}

// ─── Match a single call to a loss intake claim ───────────────────────────────

export interface CallClaimMatch {
  claimId: number;
  callHistoryId: number;
  confidence: number; // 0-100
  matchReasons: string[];
}

/**
 * Find the best matching loss_intake_claim for a given call_history record.
 * Returns null if no match found above threshold.
 */
export async function matchCallToClaim(
  callId: number
): Promise<CallClaimMatch | null> {
  const db = requireDb(await getDb());

  // Get the call record
  const [call] = await db
    .select()
    .from(callHistory)
    .where(eq(callHistory.id, callId))
    .limit(1);

  if (!call) return null;
  if (!call.callerName && !call.callerPhone) return null;

  // Search window: ±14 days around call date
  const callDate = call.startedAt;
  const windowStart = new Date(callDate.getTime() - 14 * 24 * 60 * 60 * 1000);
  const windowEnd = new Date(callDate.getTime() + 14 * 24 * 60 * 60 * 1000);

  // Get candidate claims in the date window
  const candidates = await db
    .select()
    .from(lossIntakeClaims)
    .where(
      and(
        gte(lossIntakeClaims.postedAt, windowStart),
        lte(lossIntakeClaims.postedAt, windowEnd)
      )
    );

  if (candidates.length === 0) return null;

  let bestMatch: CallClaimMatch | null = null;

  for (const claim of candidates) {
    let score = 0;
    const reasons: string[] = [];

    // 1. Name similarity
    if (call.callerName && claim.memberName) {
      const sim = nameSimilarity(call.callerName, claim.memberName);
      if (sim >= 0.8) {
        score += 60;
        reasons.push(`Name match: "${call.callerName}" ≈ "${claim.memberName}" (${Math.round(sim * 100)}%)`);
      } else if (sim >= 0.5) {
        score += 30;
        reasons.push(`Partial name match: "${call.callerName}" ≈ "${claim.memberName}" (${Math.round(sim * 100)}%)`);
      }
    }

    // 2. Agent match (call agent = claim assigned agent)
    if (call.agentName && claim.assignedAgent) {
      const agentSim = nameSimilarity(call.agentName, claim.assignedAgent);
      if (agentSim >= 0.7) {
        score += 20;
        reasons.push(`Agent match: ${call.agentName} → ${claim.assignedAgent}`);
      }
    }

    // 3. Date proximity bonus (closer = higher score)
    const daysDiff = Math.abs(
      (callDate.getTime() - claim.postedAt.getTime()) / (24 * 60 * 60 * 1000)
    );
    if (daysDiff <= 1) {
      score += 20;
      reasons.push(`Same day as FNOL (${daysDiff.toFixed(1)} days)`);
    } else if (daysDiff <= 3) {
      score += 10;
      reasons.push(`Within 3 days of FNOL (${daysDiff.toFixed(1)} days)`);
    } else if (daysDiff <= 7) {
      score += 5;
      reasons.push(`Within 7 days of FNOL (${daysDiff.toFixed(1)} days)`);
    }

    // 4. Outbound call bonus (rep calling member = strong signal)
    if (call.direction === "outbound") {
      score += 5;
      reasons.push("Outbound call (rep → member)");
    }

    if (score >= 50 && reasons.length > 0) {
      if (!bestMatch || score > bestMatch.confidence) {
        bestMatch = {
          claimId: claim.id,
          callHistoryId: callId,
          confidence: Math.min(score, 100),
          matchReasons: reasons,
        };
      }
    }
  }

  return bestMatch;
}

// ─── Run matching for all unmatched calls ─────────────────────────────────────

export async function matchAllUnmatchedCalls(): Promise<{
  matched: number;
  skipped: number;
  errors: number;
}> {
  const db = requireDb(await getDb());

  // Get calls that don't have a lossIntakeClaimId yet and have a caller name
  const unmatchedCalls = await db
    .select({ id: callHistory.id })
    .from(callHistory)
    .where(
      and(
        isNull(callHistory.lossIntakeClaimId),
        or(
          like(callHistory.callerName, "%"),
          like(callHistory.callerPhone, "%")
        )
      )
    )
    .limit(200);

  let matched = 0;
  let skipped = 0;
  let errors = 0;

  for (const { id } of unmatchedCalls) {
    try {
      const match = await matchCallToClaim(id);
      if (match && match.confidence >= 60) {
        await db
          .update(callHistory)
          .set({
            lossIntakeClaimId: match.claimId,
            matchConfidence: match.confidence,
          })
          .where(eq(callHistory.id, id));
        matched++;
      } else {
        skipped++;
      }
    } catch (err) {
      console.error(`[CallMatch] Error matching call ${id}:`, err);
      errors++;
    }
  }

  return { matched, skipped, errors };
}

// ─── AI QA Scoring ────────────────────────────────────────────────────────────

export interface CallQaResult {
  greetingScore: number;
  folDocumentedScore: number;
  rideshareAskedScore: number;
  professionalCloseScore: number;
  empathyScore: number;
  overallScore: number;
  strengths: string;
  improvements: string;
  rawAiResponse: string;
}

const QA_RUBRIC = `You are a Quality Assurance evaluator for Whip Claims, a rideshare accident claims company.

Evaluate this call transcript between a Whip Claims intake agent and a member (rideshare driver) who was involved in an accident.

Score each criterion from 1-10 (10 = excellent, 1 = very poor):

1. **Greeting & Identification** (greetingScore): Did the agent greet the member professionally, identify themselves and Whip Claims, and confirm they're speaking with the right person?

2. **Facts of Loss Documented** (folDocumentedScore): Did the agent capture the key facts of loss — what happened, when, where, who was involved, and how the accident occurred? Did they ask clarifying questions?

3. **Rideshare Status Asked** (rideshareAskedScore): Did the agent ask about the rideshare status at the time of the accident (on trip, waiting for ride, offline, etc.)?

4. **Professional Close** (professionalCloseScore): Did the agent summarize next steps, set expectations for the member, and close the call professionally?

5. **Empathy & Member Experience** (empathyScore): Did the agent show empathy for the member's situation, listen actively, and make the member feel supported?

Return a JSON object with these exact fields:
{
  "greetingScore": <1-10>,
  "folDocumentedScore": <1-10>,
  "rideshareAskedScore": <1-10>,
  "professionalCloseScore": <1-10>,
  "empathyScore": <1-10>,
  "overallScore": <1-10 weighted average>,
  "strengths": "<2-3 sentences on what the agent did well>",
  "improvements": "<2-3 sentences on specific areas to improve>"
}`;

/**
 * Score a call transcript using AI QA rubric.
 */
export async function scoreCallTranscript(transcript: string): Promise<CallQaResult | null> {
  if (!transcript || transcript.trim().length < 50) return null;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: QA_RUBRIC },
        { role: "user", content: `CALL TRANSCRIPT:\n\n${transcript}` },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "call_qa_result",
          strict: true,
          schema: {
            type: "object",
            properties: {
              greetingScore: { type: "number" },
              folDocumentedScore: { type: "number" },
              rideshareAskedScore: { type: "number" },
              professionalCloseScore: { type: "number" },
              empathyScore: { type: "number" },
              overallScore: { type: "number" },
              strengths: { type: "string" },
              improvements: { type: "string" },
            },
            required: [
              "greetingScore",
              "folDocumentedScore",
              "rideshareAskedScore",
              "professionalCloseScore",
              "empathyScore",
              "overallScore",
              "strengths",
              "improvements",
            ],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = typeof content === "string" ? JSON.parse(content) : content;
    return {
      ...parsed,
      rawAiResponse: typeof content === "string" ? content : JSON.stringify(content),
    };
  } catch (err) {
    console.error("[CallQA] Scoring error:", err);
    return null;
  }
}

/**
 * Transcribe and score a call recording, then store the result.
 * Creates or updates a loss_intake_call_qas record.
 */
export async function transcribeAndScoreCall(
  callHistoryId: number,
  lossIntakeClaimId: number
): Promise<{ success: boolean; qaId?: number; error?: string }> {
  const db = requireDb(await getDb());

  // Get the call record
  const [call] = await db
    .select()
    .from(callHistory)
    .where(eq(callHistory.id, callHistoryId))
    .limit(1);

  if (!call) return { success: false, error: "Call not found" };

  const recordingUrl = call.recordingUrl || call.voicemailUrl;
  if (!recordingUrl) return { success: false, error: "No recording URL" };

  // Check if already scored
  const existing = await db
    .select({ id: lossIntakeCallQas.id })
    .from(lossIntakeCallQas)
    .where(eq(lossIntakeCallQas.callHistoryId, callHistoryId))
    .limit(1);

  let transcript = call.rawTranscript ?? "";

  // Transcribe if not already done
  if (!transcript || transcript.length < 50) {
    try {
      const result = await transcribeAudio({ audioUrl: recordingUrl });
      transcript = (result as any).text ?? "";
    } catch (err) {
      console.error("[CallQA] Transcription error:", err);
      return { success: false, error: "Transcription failed" };
    }
  }

  // Score the transcript
  const qaResult = await scoreCallTranscript(transcript);
  if (!qaResult) return { success: false, error: "AI scoring failed" };

  const now = new Date();

  if (existing.length > 0) {
    // Update existing record
    await db
      .update(lossIntakeCallQas)
      .set({
        transcript,
        greetingScore: qaResult.greetingScore,
        folDocumentedScore: qaResult.folDocumentedScore,
        rideshareAskedScore: qaResult.rideshareAskedScore,
        professionalCloseScore: qaResult.professionalCloseScore,
        empathyScore: qaResult.empathyScore,
        overallScore: qaResult.overallScore,
        strengths: qaResult.strengths,
        improvements: qaResult.improvements,
        rawAiResponse: qaResult.rawAiResponse,
        scoredAt: now,
      })
      .where(eq(lossIntakeCallQas.id, existing[0].id));

    return { success: true, qaId: existing[0].id };
  } else {
    // Insert new record
    const [inserted] = await db
      .insert(lossIntakeCallQas)
      .values({
        lossIntakeClaimId,
        callHistoryId,
        aircallCallId: call.aircallCallId,
        agentName: call.agentName ?? undefined,
        callDirection: call.direction,
        callStatus: call.status,
        durationSeconds: call.durationSeconds ?? 0,
        recordingUrl,
        transcript,
        greetingScore: qaResult.greetingScore,
        folDocumentedScore: qaResult.folDocumentedScore,
        rideshareAskedScore: qaResult.rideshareAskedScore,
        professionalCloseScore: qaResult.professionalCloseScore,
        empathyScore: qaResult.empathyScore,
        overallScore: qaResult.overallScore,
        strengths: qaResult.strengths,
        improvements: qaResult.improvements,
        rawAiResponse: qaResult.rawAiResponse,
        scoredAt: now,
      });

    return { success: true, qaId: (inserted as any).insertId };
  }
}

/**
 * Get all call QA records for a loss intake claim.
 */
export async function getCallQasForClaim(lossIntakeClaimId: number) {
  const db = requireDb(await getDb());
  return db
    .select()
    .from(lossIntakeCallQas)
    .where(eq(lossIntakeCallQas.lossIntakeClaimId, lossIntakeClaimId))
    .orderBy(lossIntakeCallQas.createdAt);
}

/**
 * Get all call_history records matched to a loss intake claim.
 */
export async function getCallsForClaim(lossIntakeClaimId: number) {
  const db = requireDb(await getDb());
  return db
    .select()
    .from(callHistory)
    .where(eq(callHistory.lossIntakeClaimId, lossIntakeClaimId))
    .orderBy(callHistory.startedAt);
}
