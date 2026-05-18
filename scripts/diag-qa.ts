import { getDb } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) { console.log("no db"); process.exit(1); }

  // 1. What does the weekly QA job query for?
  // It looks for call_history records in the past week with answered status
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  console.log("Week ago:", weekAgo.toISOString());

  const recentCalls = await db.execute(sql`
    SELECT 
      handlerId, agentName,
      COUNT(*) as total,
      SUM(CASE WHEN status = 'answered' THEN 1 ELSE 0 END) as answered,
      SUM(CASE WHEN rawTranscript IS NOT NULL AND rawTranscript != '' THEN 1 ELSE 0 END) as withTranscript,
      MIN(startedAt) as earliest,
      MAX(startedAt) as latest
    FROM call_history
    WHERE startedAt >= ${weekAgo}
    GROUP BY handlerId, agentName
    ORDER BY total DESC
    LIMIT 20
  `);
  console.log("\n=== RECENT CALLS (last 7 days) by handler ===");
  console.log(JSON.stringify((recentCalls as any)[0], null, 2));

  // 2. What calls exist at all?
  const allCalls = await db.execute(sql`
    SELECT 
      handlerId, agentName,
      COUNT(*) as total,
      SUM(CASE WHEN status = 'answered' THEN 1 ELSE 0 END) as answered,
      SUM(CASE WHEN rawTranscript IS NOT NULL AND rawTranscript != '' THEN 1 ELSE 0 END) as withTranscript,
      MAX(startedAt) as mostRecent
    FROM call_history
    GROUP BY handlerId, agentName
    ORDER BY mostRecent DESC
    LIMIT 20
  `);
  console.log("\n=== ALL CALLS by handler (most recent first) ===");
  console.log(JSON.stringify((allCalls as any)[0], null, 2));

  // 3. What qa_scores exist?
  const qaScores = await db.execute(sql`
    SELECT handlerId, agentName, weekOf, COUNT(*) as cnt, AVG(overallScore) as avgScore
    FROM qa_scores
    GROUP BY handlerId, agentName, weekOf
    ORDER BY weekOf DESC
    LIMIT 20
  `);
  console.log("\n=== QA SCORES by handler/week ===");
  console.log(JSON.stringify((qaScores as any)[0], null, 2));

  // 4. What does the weekly QA job actually query?
  // Check the periodic job logic
  const callsForQA = await db.execute(sql`
    SELECT ch.id, ch.handlerId, ch.agentName, ch.status, ch.startedAt,
      CASE WHEN ch.rawTranscript IS NOT NULL AND ch.rawTranscript != '' THEN 'yes' ELSE 'no' END as hasTranscript,
      CASE WHEN qs.id IS NOT NULL THEN 'scored' ELSE 'unscored' END as qaStatus
    FROM call_history ch
    LEFT JOIN qa_scores qs ON qs.callHistoryId = ch.id
    WHERE ch.startedAt >= ${weekAgo}
      AND ch.status = 'answered'
    ORDER BY ch.startedAt DESC
    LIMIT 20
  `);
  console.log("\n=== ANSWERED CALLS last 7 days (QA eligible) ===");
  console.log(JSON.stringify((callsForQA as any)[0], null, 2));
}

main().catch(console.error).finally(() => process.exit(0));
