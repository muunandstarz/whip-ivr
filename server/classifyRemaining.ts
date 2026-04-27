/**
 * One-shot script: classify the remaining 38 unclassified recorded calls.
 * Run with: npx tsx server/classifyRemaining.ts
 */
import { classifyCallBatch } from "./classifyCalls";

async function main() {
  console.log("[ClassifyRemaining] Starting — processing remaining unclassified calls in batches of 10...");
  let totalProcessed = 0;
  let totalSucceeded = 0;
  let remaining = 38;

  while (remaining > 0) {
    const result = await classifyCallBatch(10);
    totalProcessed += result.processed;
    totalSucceeded += result.succeeded;
    remaining = result.remaining;
    console.log(
      `[ClassifyRemaining] Batch done: ${result.processed} processed, ${result.succeeded} succeeded, ${result.failed} failed — ${remaining} remaining`
    );
    if (result.processed === 0) break; // nothing left
    await new Promise((r) => setTimeout(r, 1000)); // brief pause between batches
  }

  // After classification, update ivrEligible for newly classified calls
  const { default: mysql } = await import("mysql2/promise");
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const [updated] = await conn.execute(`
    UPDATE call_history 
    SET ivrEligible = CASE 
      WHEN callerType IN ('carrier', 'law_office', 'medical_provider') THEN 1
      WHEN callerType IN ('member', 'claimant', 'police', 'unknown') THEN 0
      ELSE NULL
    END
    WHERE ivrEligible IS NULL AND callerType IS NOT NULL
  `);
  console.log(`[ClassifyRemaining] Updated ivrEligible for ${(updated as any).affectedRows} newly classified calls`);

  // Final summary
  const [summary] = await conn.execute(`
    SELECT 
      SUM(CASE WHEN ivrEligible = 1 THEN 1 ELSE 0 END) as eligible,
      SUM(CASE WHEN ivrEligible = 0 THEN 1 ELSE 0 END) as notEligible,
      SUM(CASE WHEN ivrEligible IS NULL THEN 1 ELSE 0 END) as unknown,
      COUNT(*) as total
    FROM call_history
  `) as any[];
  const s = summary[0];
  console.log(`\n[ClassifyRemaining] FINAL IVR ELIGIBILITY SUMMARY:`);
  console.log(`  IVR-eligible (carrier/law/medical): ${s.eligible} (${Math.round(s.eligible/s.total*100)}%)`);
  console.log(`  Needs live agent: ${s.notEligible} (${Math.round(s.notEligible/s.total*100)}%)`);
  console.log(`  Unclassified (no recording): ${s.unknown}`);
  console.log(`  Total calls: ${s.total}`);
  console.log(`\n[ClassifyRemaining] Done! ${totalSucceeded}/${totalProcessed} calls classified.`);
  await conn.end();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
