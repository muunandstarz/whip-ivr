import 'dotenv/config';
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Step 1: Normalize call_history phones (strip dashes, spaces, keep + and digits)
const [r0] = await conn.execute(`
  UPDATE call_history
  SET callerPhone = CONCAT('+', REGEXP_REPLACE(SUBSTRING(callerPhone, 2), '[^0-9]', ''))
  WHERE callerPhone LIKE '+%' AND callerPhone REGEXP '[^+0-9]'
`);
console.log('Normalized call_history phones:', r0.affectedRows);

// Verify
const [sample] = await conn.execute('SELECT DISTINCT callerPhone FROM call_history LIMIT 5');
console.log('Sample after normalize:', sample.map(r => r.callerPhone));

// Step 2: Cross-reference with intake_records
const [r1] = await conn.execute(`
  UPDATE call_history ch
  JOIN intake_records ir ON ch.callerPhone = ir.callerPhone
  SET ch.callerType = ir.callerType
  WHERE ch.callerType IS NULL AND ir.callerType IS NOT NULL
`);
console.log('Updated from intake cross-ref:', r1.affectedRows);

// Step 3: Classify toll-free as carrier
const [r2] = await conn.execute(`
  UPDATE call_history
  SET callerType = 'carrier'
  WHERE callerType IS NULL
  AND callerPhone REGEXP '^\\+1(800|888|866|877|855|844|833)'
`);
console.log('Classified toll-free as carrier:', r2.affectedRows);

// Step 4: Breakdown
const [breakdown] = await conn.execute(`
  SELECT callerType, COUNT(*) as cnt,
    SUM(CASE WHEN status='answered' THEN 1 ELSE 0 END) as answered,
    SUM(CASE WHEN status='missed' THEN 1 ELSE 0 END) as missed,
    SUM(CASE WHEN status='voicemail' THEN 1 ELSE 0 END) as voicemail
  FROM call_history
  GROUP BY callerType
  ORDER BY cnt DESC
`);
console.log('Breakdown:', JSON.stringify(breakdown, null, 2));

// Step 5: Update caller_profiles too
const [r3] = await conn.execute(`
  UPDATE caller_profiles cp
  SET cp.phone = CONCAT('+', REGEXP_REPLACE(SUBSTRING(cp.phone, 2), '[^0-9]', ''))
  WHERE cp.phone LIKE '+%' AND cp.phone REGEXP '[^+0-9]'
`);
console.log('Normalized caller_profiles phones:', r3.affectedRows);

// Step 6: Update caller_profiles callerType from intake_records
const [r4] = await conn.execute(`
  UPDATE caller_profiles cp
  JOIN intake_records ir ON cp.phone = ir.callerPhone
  SET cp.callerType = ir.callerType
  WHERE cp.callerType IS NULL AND ir.callerType IS NOT NULL
`);
console.log('Updated caller_profiles from intake cross-ref:', r4.affectedRows);

// Step 7: Classify toll-free caller_profiles as carrier
const [r5] = await conn.execute(`
  UPDATE caller_profiles
  SET callerType = 'carrier'
  WHERE callerType IS NULL
  AND phone REGEXP '^\\+1(800|888|866|877|855|844|833)'
`);
console.log('Classified toll-free caller_profiles as carrier:', r5.affectedRows);

// Check repeat callers with their types
const [repeats] = await conn.execute(`
  SELECT cp.phone, cp.name, cp.organization, cp.totalCalls, cp.callerType,
    ir.claimNumber, ir.callerName
  FROM caller_profiles cp
  LEFT JOIN intake_records ir ON cp.phone = ir.callerPhone
  WHERE cp.totalCalls >= 2
  ORDER BY cp.totalCalls DESC
  LIMIT 20
`);
console.log('Top repeat callers:', JSON.stringify(repeats, null, 2));

await conn.end();
