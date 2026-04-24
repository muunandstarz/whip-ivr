import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// ─── Priority rules ───────────────────────────────────────────────────────────
// high:   law_office caller type OR message mentions accident/crash/collision/hit
// urgent: member/claimant calling multiple times (repeat caller) OR police
// normal: everything else

// Only flag as high priority if the message indicates someone is REPORTING an accident,
// not just using insurance terminology (e.g. "collision coverage", "accident details" from adjuster)
// Flag high priority when someone is REPORTING or describing an accident they were in.
// Broad enough to catch member descriptions, narrow enough to avoid insurance jargon.
const ACCIDENT_KEYWORDS = /\b(reporting (a|an|the) (accident|loss|crash|collision)|just had an accident|was in an accident|got hit|rear.?ended|side.?swiped|totaled|total loss|vehicle was struck|car was hit|accident report|filing a claim for|backed into|made wrong turn|hit (the|my|our)|another driver|other driver|driver hit|driver made|driver ran)\b/i;

// ─── Handlers eligible for assignment (active handlers only, not managers) ───
// Managers (Lorraine, Daniel) supervise but don't take intake queue assignments
const ACTIVE_HANDLERS = [
  { id: 1,  name: "Natashia Edulan" },
  { id: 2,  name: "Jayla Bernard"   },
  { id: 3,  name: "MJ Badua"        },
  { id: 4,  name: "Carlito Legarde Jr" },
  { id: 5,  name: "Annie Ortiz"     },
  { id: 6,  name: "Ana Padilla"     },
  { id: 7,  name: "Catherine Cestina" },
  { id: 8,  name: "Elizabeth Avilla" },
];

// ─── Fetch all open records ───────────────────────────────────────────────────
const [records] = await conn.execute(
  `SELECT id, callerType, message, isRepeatCaller, priority FROM intake_records WHERE status = 'open' ORDER BY id`
);

console.log(`Found ${records.length} open records to redistribute`);

// ─── Assign priority and handler ─────────────────────────────────────────────
let handlerIdx = 0;

for (const rec of records) {
  // Determine priority
  let priority = "normal";

  if (rec.callerType === "law_office") {
    priority = "high";
  } else if (rec.callerType === "police") {
    priority = "urgent";
  } else if (rec.isRepeatCaller && (rec.callerType === "member" || rec.callerType === "claimant")) {
    priority = "urgent";
  } else if (ACCIDENT_KEYWORDS.test(rec.message || "")) {
    priority = "high";
  }

  // Round-robin handler assignment
  const handler = ACTIVE_HANDLERS[handlerIdx % ACTIVE_HANDLERS.length];
  handlerIdx++;

  await conn.execute(
    `UPDATE intake_records SET handlerId = ?, handlerName = ?, priority = ? WHERE id = ?`,
    [handler.id, handler.name, priority, rec.id]
  );

  console.log(`  #${rec.id} [${rec.callerType}] → ${handler.name} | priority: ${priority}`);
}

// ─── Summary ─────────────────────────────────────────────────────────────────
const [summary] = await conn.execute(
  `SELECT handlerName, priority, COUNT(*) as cnt 
   FROM intake_records 
   WHERE status = 'open' 
   GROUP BY handlerName, priority 
   ORDER BY handlerName, priority`
);

console.log("\n=== Handler Queue Summary ===");
const byHandler = {};
for (const row of summary) {
  if (!byHandler[row.handlerName]) byHandler[row.handlerName] = {};
  byHandler[row.handlerName][row.priority] = row.cnt;
}
for (const [name, counts] of Object.entries(byHandler)) {
  const parts = Object.entries(counts).map(([p, c]) => `${p}: ${c}`).join(", ");
  console.log(`  ${name}: ${parts}`);
}

await conn.end();
console.log("\nDone.");
