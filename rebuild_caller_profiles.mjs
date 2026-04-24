/**
 * Rebuilds caller_profiles from the full call_history table.
 * Groups all calls by callerPhone, counts them, and upserts into caller_profiles.
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Get all unique callers from call_history with their call counts and last call time
const [rows] = await conn.execute(`
  SELECT
    ch.callerPhone AS phone,
    COUNT(*) AS totalCalls,
    MAX(ch.startedAt) AS lastCallAt,
    (
      SELECT ch2.callerName FROM call_history ch2
      WHERE ch2.callerPhone = ch.callerPhone
        AND ch2.callerName IS NOT NULL AND ch2.callerName != ''
      GROUP BY ch2.callerName ORDER BY COUNT(*) DESC LIMIT 1
    ) AS name,
    (
      SELECT ir.callerType FROM intake_records ir
      WHERE ir.callerPhone = ch.callerPhone
      ORDER BY ir.createdAt DESC LIMIT 1
    ) AS callerType
  FROM call_history ch
  WHERE ch.callerPhone IS NOT NULL AND ch.callerPhone != ''
  GROUP BY ch.callerPhone
  ORDER BY totalCalls DESC
`);

console.log(`Found ${rows.length} unique callers in call_history`);
console.log(`Top 10 repeat callers:`);
rows.slice(0, 10).forEach(r => {
  console.log(`  ${r.phone} — ${r.totalCalls} calls, name: ${r.name || 'unknown'}`);
});

// Clear existing caller_profiles and rebuild from scratch
await conn.execute('DELETE FROM caller_profiles');

let inserted = 0;
for (const row of rows) {
  await conn.execute(`
    INSERT INTO caller_profiles (phone, name, org, callerType, totalCalls, lastCallAt, createdAt, updatedAt)
    VALUES (?, ?, NULL, ?, ?, ?, NOW(), NOW())
    ON DUPLICATE KEY UPDATE
      totalCalls = VALUES(totalCalls),
      lastCallAt = VALUES(lastCallAt),
      name = COALESCE(VALUES(name), name),
      callerType = COALESCE(VALUES(callerType), callerType),
      updatedAt = NOW()
  `, [
    row.phone,
    row.name || null,
    row.callerType || null,
    Number(row.totalCalls),
    row.lastCallAt
  ]);
  inserted++;
}

console.log(`\nInserted/updated ${inserted} caller profiles`);

// Show repeat callers (2+ calls)
const [repeats] = await conn.execute(`
  SELECT phone, name, callerType, totalCalls
  FROM caller_profiles
  WHERE totalCalls >= 2
  ORDER BY totalCalls DESC
  LIMIT 20
`);
console.log(`\nRepeat callers (2+ calls): ${repeats.length}`);
repeats.forEach(r => {
  console.log(`  ${r.phone} (${r.name || 'unknown'}) — ${r.totalCalls} calls, type: ${r.callerType}`);
});

await conn.end();
console.log('\nDone.');
