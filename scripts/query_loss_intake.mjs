import mysql from "mysql2/promise";
const conn = await mysql.createConnection(process.env.DATABASE_URL);
try {
  const [stages] = await conn.query("SELECT stage, COUNT(*) as cnt FROM loss_intake_claims GROUP BY stage");
  const [agents] = await conn.query("SELECT assignedAgent, COUNT(*) as cnt FROM loss_intake_claims GROUP BY assignedAgent ORDER BY cnt DESC LIMIT 10");
  const [channels] = await conn.query("SELECT channelName, COUNT(*) as cnt FROM loss_intake_claims GROUP BY channelName");
  const [recent] = await conn.query("SELECT memberName, market, stage, assignedAgent, firstContactMinutes, qualityScore, postedAt FROM loss_intake_claims ORDER BY postedAt DESC LIMIT 5");
  const [slaBreached] = await conn.query("SELECT COUNT(*) as cnt FROM loss_intake_claims WHERE firstContactMinutes IS NOT NULL AND firstContactMinutes > 10");
  const [slaWithin] = await conn.query("SELECT COUNT(*) as cnt FROM loss_intake_claims WHERE firstContactMinutes IS NOT NULL AND firstContactMinutes <= 10");
  const [noContact] = await conn.query("SELECT COUNT(*) as cnt FROM loss_intake_claims WHERE firstContactAt IS NULL");
  console.log("Stages:", JSON.stringify(stages, null, 2));
  console.log("By agent:", JSON.stringify(agents, null, 2));
  console.log("By channel:", JSON.stringify(channels, null, 2));
  console.log("SLA within 10min:", JSON.stringify(slaWithin));
  console.log("SLA breached:", JSON.stringify(slaBreached));
  console.log("No contact yet:", JSON.stringify(noContact));
  console.log("Recent 5:", JSON.stringify(recent, null, 2));
} finally {
  await conn.end();
}
