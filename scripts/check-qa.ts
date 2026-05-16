import { getDb } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) { console.log("no db"); process.exit(1); }

  const handlers = await db.execute(sql`SELECT id, name FROM handlers ORDER BY id`);
  console.log("HANDLERS:", JSON.stringify((handlers as any)[0], null, 2));

  const qa = await db.execute(sql`SELECT handlerName, week, COUNT(*) as cnt FROM qa_scorecards GROUP BY handlerName, week ORDER BY week DESC LIMIT 30`);
  console.log("QA BY HANDLER/WEEK:", JSON.stringify((qa as any)[0], null, 2));

  // Check intake_records with rawTranscript for non-Tim handlers
  const intakeByHandler = await db.execute(sql`
    SELECT handlerName, COUNT(*) as total, SUM(CASE WHEN rawTranscript IS NOT NULL AND rawTranscript != '' THEN 1 ELSE 0 END) as withTranscript
    FROM intake_records
    GROUP BY handlerName
    ORDER BY total DESC
    LIMIT 20
  `);
  console.log("INTAKE BY HANDLER (with transcript):", JSON.stringify((intakeByHandler as any)[0], null, 2));

  // Check what weeks exist in intake_records
  const weeks = await db.execute(sql`
    SELECT 
      DATE_FORMAT(DATE_SUB(createdAt, INTERVAL WEEKDAY(createdAt) DAY), '%Y-%m-%d') as week,
      handlerName,
      COUNT(*) as cnt
    FROM intake_records
    WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 60 DAY)
    GROUP BY week, handlerName
    ORDER BY week DESC, cnt DESC
    LIMIT 30
  `);
  console.log("INTAKE WEEKS BY HANDLER:", JSON.stringify((weeks as any)[0], null, 2));
}

main().catch(console.error).finally(() => process.exit(0));
