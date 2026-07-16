import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is unavailable");

const connection = await mysql.createConnection(url);
try {
  const [handlers] = await connection.query(
    "SELECT id, name, email, active FROM handlers ORDER BY name ASC",
  );
  const [settings] = await connection.query(
    "SELECT id, configKey, claimsChannelId, remoteMarketsChannelId, firstContactSlaMinutes, atRiskMinutes, qaDueHours, agentAssignments, scheduleCronTaskUid, lastSuccessfulSyncAt, lastSyncError FROM loss_intake_settings ORDER BY id ASC LIMIT 5",
  );
  console.log(JSON.stringify({ handlers, settings }, null, 2));
} finally {
  await connection.end();
}
