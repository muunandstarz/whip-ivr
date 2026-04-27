/**
 * Full sweep of all closed intake records:
 * 1. Fetch fresh Aircall voicemail URL for each
 * 2. Download audio and check size (>1000 bytes = real audio)
 * 3. Save real audio to /tmp for transcription
 * 4. Report which ones have real audio
 */
import mysql from 'mysql2/promise';
import fs from 'fs';

const AIRCALL_API_ID = process.env.AIRCALL_API_ID;
const AIRCALL_API_TOKEN = process.env.AIRCALL_API_TOKEN;
const auth = Buffer.from(AIRCALL_API_ID + ':' + AIRCALL_API_TOKEN).toString('base64');

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Get all closed records that have an aircallCallId
const [closedRecords] = await conn.query(`
  SELECT id, aircallCallId, callerPhone, callerName, callerOrg, rawTranscript, notes
  FROM intake_records
  WHERE status = 'closed' AND aircallCallId IS NOT NULL
  ORDER BY createdAt DESC
`);

console.log(`Found ${closedRecords.length} closed records with Aircall IDs\n`);

const withRealAudio = [];
const noAudio = [];

for (const record of closedRecords) {
  try {
    const res = await fetch(`https://api.aircall.io/v1/calls/${record.aircallCallId}`, {
      headers: { Authorization: 'Basic ' + auth }
    });
    
    if (!res.ok) {
      noAudio.push({ ...record, reason: `Aircall API ${res.status}` });
      continue;
    }
    
    const data = await res.json();
    const vmUrl = data.call?.voicemail;
    
    if (!vmUrl) {
      noAudio.push({ ...record, reason: 'No voicemail URL in Aircall' });
      continue;
    }
    
    const audioRes = await fetch(vmUrl);
    const buf = Buffer.from(await audioRes.arrayBuffer());
    
    if (buf.length > 1000) {
      const path = `/tmp/sweep-vm-${record.aircallCallId}.mp3`;
      fs.writeFileSync(path, buf);
      withRealAudio.push({ ...record, audioPath: path, audioSize: buf.length });
      console.log(`✓ ${record.aircallCallId} | ${record.callerPhone} | ${buf.length} bytes → ${path}`);
    } else {
      noAudio.push({ ...record, reason: `Tiny audio (${buf.length} bytes)` });
    }
    
    // Rate limit: 50ms between calls
    await new Promise(r => setTimeout(r, 50));
  } catch (err) {
    noAudio.push({ ...record, reason: String(err) });
  }
}

await conn.end();

console.log(`\n=== SUMMARY ===`);
console.log(`Records with real audio: ${withRealAudio.length}`);
console.log(`Records with no audio: ${noAudio.length}`);

// Save results for the transcription script
fs.writeFileSync('/tmp/sweep-results.json', JSON.stringify({
  withRealAudio,
  noAudio
}, null, 2));

console.log('\nResults saved to /tmp/sweep-results.json');
