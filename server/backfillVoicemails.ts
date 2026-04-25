/**
 * Backfill voicemail intake records.
 * Finds all call_history rows with callType='voicemail' that have a recordingUrl
 * but no corresponding intake_record, then runs them through processVoicemail.
 */
import { eq, isNull, and, ne, isNotNull } from "drizzle-orm";
import { callHistory, intakeRecords } from "../drizzle/schema";
import { getDb } from "./db";
import { processVoicemail } from "./aircall";

export interface BackfillStatus {
  total: number;
  processed: number;
  failed: number;
  skipped: number;
  errors: string[];
}

let backfillRunning = false;
let backfillStatus: BackfillStatus = { total: 0, processed: 0, failed: 0, skipped: 0, errors: [] };

export function getBackfillStatus() {
  return { ...backfillStatus, running: backfillRunning };
}

export async function runVoicemailBackfill(): Promise<void> {
  if (backfillRunning) {
    console.log("[Backfill] Already running, skipping");
    return;
  }

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  backfillRunning = true;
  backfillStatus = { total: 0, processed: 0, failed: 0, skipped: 0, errors: [] };

  try {
    // Find all voicemails with recordings not yet in intake_records
    // Use a raw query via drizzle
    const allVoicemails = await db
      .select({
        id: callHistory.id,
        aircallCallId: callHistory.aircallCallId,
        callerPhone: callHistory.callerPhone,
        recordingUrl: callHistory.recordingUrl,
        startedAt: callHistory.startedAt,
        endedAt: callHistory.endedAt,
        aircallNumberId: callHistory.aircallNumberId,
        aircallNumberName: callHistory.aircallNumberName,
      })
      .from(callHistory)
      .where(
        and(
          eq(callHistory.status, "voicemail"),
          isNotNull(callHistory.recordingUrl),
          ne(callHistory.recordingUrl, "")
        )
      );

    // Filter out ones already in intake_records
    const existingIntake = await db
      .select({ aircallCallId: intakeRecords.aircallCallId })
      .from(intakeRecords)
      .where(isNotNull(intakeRecords.aircallCallId));

    const processedIds = new Set(existingIntake.map((r) => r.aircallCallId).filter(Boolean));

    const toProcess = allVoicemails.filter(
      (v: typeof allVoicemails[0]) => v.aircallCallId && !processedIds.has(v.aircallCallId)
    );

    backfillStatus.total = toProcess.length;
    console.log(`[Backfill] Found ${toProcess.length} unprocessed voicemails to backfill`);

    for (const voicemail of toProcess) {
      if (!voicemail.aircallCallId || !voicemail.recordingUrl) {
        backfillStatus.skipped++;
        continue;
      }

      try {
        console.log(`[Backfill] Processing ${voicemail.aircallCallId} (${backfillStatus.processed + 1}/${backfillStatus.total})`);
        await processVoicemail({
          aircallCallId: voicemail.aircallCallId,
          callerPhone: voicemail.callerPhone ?? "unknown",
          voicemailUrl: voicemail.recordingUrl,
          startedAt: voicemail.startedAt ? new Date(voicemail.startedAt) : new Date(),
          endedAt: voicemail.endedAt ? new Date(voicemail.endedAt) : undefined,
          aircallNumberId: voicemail.aircallNumberId ?? undefined,
          aircallNumberName: voicemail.aircallNumberName ?? undefined,
        });
        backfillStatus.processed++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[Backfill] Failed for ${voicemail.aircallCallId}: ${msg}`);
        backfillStatus.failed++;
        backfillStatus.errors.push(`${voicemail.aircallCallId}: ${msg}`);
      }

      // Small delay to avoid hammering the transcription API
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    console.log(`[Backfill] Complete. Processed: ${backfillStatus.processed}, Failed: ${backfillStatus.failed}, Skipped: ${backfillStatus.skipped}`);
  } finally {
    backfillRunning = false;
  }
}
