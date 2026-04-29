/**
 * Standalone backfill runner — processes all unprocessed voicemail recordings.
 * Uses raw SQL inserts to avoid Drizzle ORM column-order issues.
 * Run via: npx tsx server/runBackfill.ts
 */
import mysql from "mysql2/promise";
import { transcribeAudio } from "./_core/voiceTranscription";
import { invokeLLM } from "./_core/llm";

const AIRCALL_API_ID = process.env.AIRCALL_API_ID ?? "";
const AIRCALL_API_TOKEN = process.env.AIRCALL_API_TOKEN ?? "";
const DATABASE_URL = process.env.DATABASE_URL ?? "";

function addBizHours(start: Date, hours: number): Date {
  const BIZ_START = 8, BIZ_END = 18;
  const d = new Date(start.getTime());
  const snap = (dt: Date) => {
    const day = dt.getDay(), h = dt.getHours() + dt.getMinutes() / 60;
    if (day === 0) { dt.setDate(dt.getDate() + 1); dt.setHours(BIZ_START, 0, 0, 0); return; }
    if (day === 6) { dt.setDate(dt.getDate() + 2); dt.setHours(BIZ_START, 0, 0, 0); return; }
    if (h < BIZ_START) { dt.setHours(BIZ_START, 0, 0, 0); return; }
    if (h >= BIZ_END) { dt.setDate(dt.getDate() + (day === 5 ? 3 : 1)); dt.setHours(BIZ_START, 0, 0, 0); }
  };
  snap(d);
  let rem = hours;
  while (rem > 0) {
    const h = d.getHours() + d.getMinutes() / 60;
    const left = BIZ_END - h;
    if (rem <= left) { d.setTime(d.getTime() + rem * 3600_000); rem = 0; }
    else { rem -= left; const day = d.getDay(); d.setDate(d.getDate() + (day === 5 ? 3 : 1)); d.setHours(BIZ_START, 0, 0, 0); }
  }
  return d;
}

async function fetchFreshVoicemailUrl(aircallCallId: string): Promise<string | null> {
  try {
    const auth = Buffer.from(`${AIRCALL_API_ID}:${AIRCALL_API_TOKEN}`).toString("base64");
    const resp = await fetch(`https://api.aircall.io/v1/calls/${aircallCallId}`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    return data?.call?.voicemail ?? data?.call?.recording ?? null;
  } catch {
    return null;
  }
}

async function extractIntake(transcript: string) {
  const result = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are an intake specialist for Whip Claims, a vehicle insurance claims company. Extract structured information from voicemail transcripts. Return JSON only.`,
      },
      {
        role: "user",
        content: `Extract the following from this voicemail transcript and return as JSON:
- callerName: string | null (first name or full name of caller)
- callerOrg: string | null (company, law firm, or medical provider name)
- callerType: "carrier" | "law_office" | "medical_provider" | "member" | "claimant" | "police" | "unknown"
- whipClaimNumber: string | null (Whip claim number like WC-XXXXX or NFXXXXXX)
- callerRefNumber: string | null (caller's own reference number)
- callbackPhone: string | null (phone number to call back)
- callbackEmail: string | null
- message: string (brief 1-2 sentence summary of why they called)
- handlerMentioned: string | null (name of handler or adjuster mentioned)

Transcript: "${transcript}"`,
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
            callerType: { type: "string", enum: ["carrier", "law_office", "medical_provider", "member", "claimant", "police", "unknown"] },
            whipClaimNumber: { type: ["string", "null"] },
            callerRefNumber: { type: ["string", "null"] },
            callbackPhone: { type: ["string", "null"] },
            callbackEmail: { type: ["string", "null"] },
            message: { type: "string" },
            handlerMentioned: { type: ["string", "null"] },
          },
          required: ["callerName", "callerOrg", "callerType", "whipClaimNumber", "callerRefNumber", "callbackPhone", "callbackEmail", "message", "handlerMentioned"],
          additionalProperties: false,
        },
      },
    },
  });
  const content = (result as any)?.choices?.[0]?.message?.content ?? "{}";
  return JSON.parse(content);
}

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);
  
  // Find all unprocessed voicemails
  const [rows] = await conn.execute(`
    SELECT ch.id, ch.aircallCallId, ch.callerPhone, ch.startedAt, ch.endedAt, 
           ch.aircallNumberId, ch.aircallNumberName
    FROM call_history ch
    LEFT JOIN intake_records ir ON ir.aircallCallId = ch.aircallCallId
    WHERE ch.status = 'voicemail'
      AND ir.id IS NULL
    ORDER BY ch.startedAt DESC
  `) as any[];

  const voicemails = rows as any[];
  console.log(`[Backfill] Found ${voicemails.length} unprocessed voicemails`);

  // Get handlers for name matching
  const [handlerRows] = await conn.execute(`SELECT id, name FROM handlers WHERE active = 1`) as any[];
  const handlers = handlerRows as { id: number; name: string }[];

  let processed = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < voicemails.length; i++) {
    const vm = voicemails[i];
    console.log(`[Backfill] ${i + 1}/${voicemails.length} — Call ${vm.aircallCallId}`);

    // Always fetch fresh URL from Aircall API (stored URLs expire)
    const audioUrl = await fetchFreshVoicemailUrl(vm.aircallCallId);

    if (!audioUrl) {
      console.log(`[Backfill] No URL for ${vm.aircallCallId}, skipping`);
      skipped++;
      continue;
    }

    try {
      // 1. Transcribe
      let transcript = "";
      try {
        const result = await transcribeAudio({
          audioUrl,
          language: "en",
          prompt: "Voicemail for Whip Claims insurance. Caller may mention claim numbers, insurance companies, law offices, or medical providers.",
        });
        transcript = (result as any).text ?? "";
      } catch (err) {
        console.error(`[Backfill] Transcription failed for ${vm.aircallCallId}:`, err);
        transcript = "[Transcription unavailable]";
      }

      // 2. Extract intake data
      let extracted: any = { callerType: "unknown", message: transcript, callbackPhone: vm.callerPhone };
      try {
        extracted = await extractIntake(transcript);
      } catch (err) {
        console.error(`[Backfill] LLM extraction failed for ${vm.aircallCallId}:`, err);
      }

      // 3. Find handler
      let handlerId: number | null = null;
      let handlerName: string = "Unassigned";
      if (extracted.handlerMentioned) {
        const match = handlers.find(h => 
          h.name.toLowerCase().includes(extracted.handlerMentioned.toLowerCase()) ||
          extracted.handlerMentioned.toLowerCase().includes(h.name.split(" ")[0].toLowerCase())
        );
        if (match) { handlerId = match.id; handlerName = match.name; }
      }
      if (!handlerId) {
        // Default to first handler (Natashia)
        handlerId = handlers[0]?.id ?? 1;
        handlerName = handlers[0]?.name ?? "Natashia Edulan";
      }

      // 4. Check repeat caller
      const [repeatRows] = await conn.execute(
        `SELECT COUNT(*) as cnt FROM intake_records WHERE callerPhone = ? OR (callerOrg IS NOT NULL AND callerOrg = ?)`,
        [vm.callerPhone ?? "unknown", extracted.callerOrg ?? ""]
      ) as any[];
      const repeatCount = Number(repeatRows[0]?.cnt ?? 0);
      const isRepeat = repeatCount > 0;

      // 5. Determine priority
      const priority = isRepeat && repeatCount >= 3 ? "urgent" : isRepeat ? "high" : "normal";

      // 6. Callback SLA: due within 4 business hours of receipt
      const eob = addBizHours(new Date(), 4);

      // 7. Insert using raw SQL
      const [insertResult] = await conn.execute(`
        INSERT INTO intake_records 
        (aircallCallId, callerPhone, callerName, callerOrg, callerType, whipClaimNumber, callerRefNumber, 
         callbackPhone, callbackEmail, message, rawTranscript, handlerId, handlerName, status, 
         isRepeatCaller, repeatCallCount, priority, source, aircallRecordingUrl, callbackDueBy)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, 'voicemail', ?, ?)
      `, [
        vm.aircallCallId,
        vm.callerPhone ?? "unknown",
        extracted.callerName ?? null,
        extracted.callerOrg ?? null,
        extracted.callerType ?? "unknown",
        extracted.whipClaimNumber ?? null,
        extracted.callerRefNumber ?? null,
        extracted.callbackPhone ?? vm.callerPhone ?? "unknown",
        extracted.callbackEmail ?? null,
        extracted.message ?? transcript.substring(0, 500),
        transcript,
        handlerId,
        handlerName,
        isRepeat ? 1 : 0,
        repeatCount,
        priority,
        audioUrl,
        eob,
      ]) as any[];

      // 8. Update call_history
      await conn.execute(
        `UPDATE call_history SET hasIntakeRecord = 1, intakeRecordId = ? WHERE aircallCallId = ?`,
        [(insertResult as any).insertId, vm.aircallCallId]
      );

      processed++;
      console.log(`[Backfill] ✓ ${vm.aircallCallId} → ${extracted.callerType} / ${extracted.callerName ?? "unknown"} (${processed} done)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Backfill] ✗ Failed ${vm.aircallCallId}: ${msg}`);
      failed++;
    }

    // Rate limit: 1s between calls
    await new Promise((r) => setTimeout(r, 1000));
  }

  await conn.end();
  console.log(`\n[Backfill] Complete!`);
  console.log(`  Processed: ${processed}`);
  console.log(`  Failed:    ${failed}`);
  console.log(`  Skipped:   ${skipped}`);
  console.log(`  Total:     ${voicemails.length}`);
}

main().catch(console.error);
