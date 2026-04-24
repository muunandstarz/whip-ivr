import { createConnection } from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await createConnection(process.env.DATABASE_URL);

const migrations = [
  // Rename callSid -> aircallCallId
  `ALTER TABLE intake_records CHANGE COLUMN callSid aircallCallId varchar(64) NULL`,
  // Rename organization -> callerOrg
  `ALTER TABLE intake_records CHANGE COLUMN organization callerOrg varchar(256) NULL`,
  // Rename callerReferenceNumber -> callerRefNumber
  `ALTER TABLE intake_records CHANGE COLUMN callerReferenceNumber callerRefNumber varchar(128) NULL`,
  // Rename assignedHandler -> handlerName (keep handlerName which already exists, drop assignedHandler)
  // First check if handlerName exists - if so just drop assignedHandler
  // Rename transcript -> rawTranscript
  `ALTER TABLE intake_records CHANGE COLUMN transcript rawTranscript text NULL`,
  // Add handlerId column if not exists
  `ALTER TABLE intake_records ADD COLUMN IF NOT EXISTS handlerId int NULL`,
  // Add callbackEmail if not exists
  `ALTER TABLE intake_records ADD COLUMN IF NOT EXISTS callbackEmail varchar(320) NULL`,
  // Add aircallRecordingUrl if not exists  
  `ALTER TABLE intake_records ADD COLUMN IF NOT EXISTS aircallRecordingUrl varchar(1024) NULL`,
  // Drop old columns that are now redundant
  `ALTER TABLE intake_records DROP COLUMN IF EXISTS notificationSent`,
  `ALTER TABLE intake_records DROP COLUMN IF EXISTS callPurpose`,
];

for (const sql of migrations) {
  try {
    await conn.execute(sql);
    console.log('OK:', sql.substring(0, 80));
  } catch (e) {
    if (e.message.includes('Duplicate column') || e.message.includes('already exists') || e.message.includes("Can't DROP")) {
      console.log('SKIP (already done):', sql.substring(0, 80));
    } else {
      console.error('ERR:', e.message, '|', sql.substring(0, 80));
    }
  }
}

// Verify final structure
const [rows] = await conn.execute('DESCRIBE intake_records');
console.log('\nFinal columns:');
rows.forEach(r => console.log(' -', r.Field, ':', r.Type));

await conn.end();
console.log('\nDone!');
