import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const queries = {
  dateRange: `
    SELECT DATE_FORMAT(MIN(startedAt), '%Y-%m-%d') AS first_call,
           DATE_FORMAT(MAX(startedAt), '%Y-%m-%d') AS last_call,
           COUNT(*) AS total_calls
    FROM call_history`,
  byAgent90Days: `
    SELECT COALESCE(agentName, 'Unassigned') AS agent,
           COUNT(*) AS total_calls,
           SUM(status = 'answered') AS answered,
           SUM(status = 'missed') AS missed,
           SUM(status = 'voicemail') AS voicemail,
           ROUND(AVG(CASE WHEN status = 'answered' THEN durationSeconds END), 0) AS answered_avg_seconds
    FROM call_history
    WHERE startedAt >= DATE_SUB(NOW(), INTERVAL 90 DAY)
    GROUP BY agentName
    ORDER BY total_calls DESC`,
  byMonth: `
    SELECT DATE_FORMAT(startedAt, '%Y-%m') AS month,
           COUNT(*) AS total_calls,
           SUM(status = 'answered') AS answered,
           SUM(status = 'missed') AS missed,
           SUM(status = 'voicemail') AS voicemail,
           ROUND(SUM(status = 'answered') / COUNT(*) * 100, 1) AS answer_rate
    FROM call_history
    GROUP BY DATE_FORMAT(startedAt, '%Y-%m')
    ORDER BY month`,
};

for (const [name, sql] of Object.entries(queries)) {
  const [rows] = await conn.query(sql);
  console.log(`\n--- ${name} ---`);
  console.table(rows);
}

await conn.end();
