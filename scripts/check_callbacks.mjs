import mysql from "mysql2/promise";
const conn = await mysql.createConnection(process.env.DATABASE_URL);
try {
  // Check callback_logs for Bennet
  const [cbLogs] = await conn.query(
    "SELECT handlerName, COUNT(*) as cnt FROM callback_logs GROUP BY handlerName ORDER BY cnt DESC LIMIT 10"
  );
  console.log("callback_logs by handler:", JSON.stringify(cbLogs, null, 2));

  // Check intake_records callbackAt for Bennet
  const [irCb] = await conn.query(
    "SELECT handlerName, COUNT(*) as total, SUM(CASE WHEN callbackAt IS NOT NULL THEN 1 ELSE 0 END) as withCallbackAt FROM intake_records GROUP BY handlerName ORDER BY total DESC LIMIT 10"
  );
  console.log("intake_records callbackAt by handler:", JSON.stringify(irCb, null, 2));

  // Check the week start calculation
  const now = new Date();
  const weekStart = new Date(now.getTime() - now.getDay() * 86400000);
  weekStart.setHours(0, 0, 0, 0);
  const weekStartStr = weekStart.toISOString().slice(0, 19).replace("T", " ");
  console.log("Week start:", weekStartStr);

  // Bennet callback_logs this week
  const [bennetCb] = await conn.query(
    "SELECT COUNT(*) as cnt FROM callback_logs WHERE handlerName LIKE ? AND calledAt >= ?",
    ["%Bennet%", weekStartStr]
  );
  console.log("Bennet callback_logs this week:", JSON.stringify(bennetCb[0]));

  // Bennet intake_records this week with callbackAt set
  const [bennetIr] = await conn.query(
    "SELECT COUNT(*) as cnt FROM intake_records WHERE handlerName LIKE ? AND createdAt >= ? AND callbackAt IS NOT NULL",
    ["%Bennet%", weekStartStr]
  );
  console.log("Bennet intake_records with callbackAt this week:", JSON.stringify(bennetIr[0]));
} finally {
  await conn.end();
}
