/**
 * Slack attachment backfill script
 * Re-fetches all Slack mail files into the production S3 bucket and re-runs classification
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/whip-ivr/.env' });

const FORGE_URL = process.env.BUILT_IN_FORGE_API_URL;
const FORGE_KEY = process.env.BUILT_IN_FORGE_API_KEY;
const DB_URL = process.env.DATABASE_URL;

// Get Slack bot token from DB
const conn = await mysql.createConnection(DB_URL);
const [[cfgRow]] = await conn.execute('SELECT slack_bot_token FROM mail_bot_config LIMIT 1');
const SLACK_TOKEN = cfgRow?.slack_bot_token || process.env.SLACK_BOT_TOKEN;
console.log('Slack token present:', !!SLACK_TOKEN);

// storagePut helper
async function storagePut(relKey, buf, contentType) {
  const putUrl = new URL('v1/storage/presign/put', FORGE_URL + '/');
  putUrl.searchParams.set('path', relKey);
  const presignResp = await fetch(putUrl.toString(), {
    headers: { Authorization: 'Bearer ' + FORGE_KEY }
  });
  const { url: presignedUrl, key } = await presignResp.json();
  await fetch(presignedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: buf,
  });
  return key;
}

// storageGet helper - check if file exists
async function storageExists(storageKey) {
  const getUrl = new URL('v1/storage/presign/get', FORGE_URL + '/');
  getUrl.searchParams.set('path', storageKey);
  const presignResp = await fetch(getUrl.toString(), { headers: { Authorization: 'Bearer ' + FORGE_KEY } });
  const { url } = await presignResp.json();
  if (!url) return false;
  const resp = await fetch(url);
  return resp.ok;
}

// Get all Slack mail_item_files with their slack_file_id
const [files] = await conn.execute(`
  SELECT mf.id, mf.item_id, mf.storage_key, mf.filename, mf.content_type, mf.slack_file_id,
         mi.external_id
  FROM mail_item_files mf
  JOIN mail_items mi ON mi.id = mf.item_id
  WHERE mi.source = 'mail'
  ORDER BY mf.id
`);

console.log(`\nFound ${files.length} Slack mail files to check`);

let checked = 0, alreadyOk = 0, refetched = 0, failed = 0, noSlackId = 0;
const failures = [];

for (const file of files) {
  checked++;
  const slackFileId = file.slack_file_id || file.external_id;
  
  // Check if file already exists in production bucket
  const exists = await storageExists(file.storage_key);
  if (exists) {
    alreadyOk++;
    if (checked % 10 === 0) process.stdout.write(`\r  Checked ${checked}/${files.length} — ok:${alreadyOk} refetched:${refetched} failed:${failed}`);
    continue;
  }

  if (!slackFileId) {
    noSlackId++;
    failures.push({ id: file.id, reason: 'no slack_file_id', storageKey: file.storage_key });
    continue;
  }

  // Re-fetch from Slack
  try {
    const infoResp = await fetch(`https://slack.com/api/files.info?file=${slackFileId}`, {
      headers: { Authorization: `Bearer ${SLACK_TOKEN}` }
    });
    const infoData = await infoResp.json();
    if (!infoData.ok) {
      failures.push({ id: file.id, reason: `files.info error: ${infoData.error}`, slackFileId });
      failed++;
      continue;
    }
    const dlUrl = infoData.file?.url_private_download || infoData.file?.url_private;
    if (!dlUrl) {
      failures.push({ id: file.id, reason: 'no download URL in files.info', slackFileId });
      failed++;
      continue;
    }
    const dlResp = await fetch(dlUrl, { headers: { Authorization: `Bearer ${SLACK_TOKEN}` } });
    if (!dlResp.ok) {
      failures.push({ id: file.id, reason: `download HTTP ${dlResp.status}`, slackFileId });
      failed++;
      continue;
    }
    const buf = Buffer.from(await dlResp.arrayBuffer());
    const ct = file.content_type || dlResp.headers.get('content-type') || 'application/pdf';
    const fname = file.filename || `slack_${slackFileId}.pdf`;
    const newKey = await storagePut(`mail/slack/backfill/${fname}`, buf, ct);
    
    // Update DB
    await conn.execute('UPDATE mail_item_files SET storage_key = ?, slack_file_id = ? WHERE id = ?', 
      [newKey, slackFileId, file.id]);
    refetched++;
  } catch (e) {
    failures.push({ id: file.id, reason: e.message, slackFileId });
    failed++;
  }
  
  if (checked % 5 === 0) process.stdout.write(`\r  Checked ${checked}/${files.length} — ok:${alreadyOk} refetched:${refetched} failed:${failed}`);
}

console.log(`\n\n=== BACKFILL COMPLETE ===`);
console.log(`Total files checked: ${checked}`);
console.log(`Already in production bucket: ${alreadyOk}`);
console.log(`Re-fetched and stored: ${refetched}`);
console.log(`No slack_file_id: ${noSlackId}`);
console.log(`Failed: ${failed}`);
if (failures.length > 0) {
  console.log('\nFailures:');
  failures.slice(0, 10).forEach(f => console.log(`  - id:${f.id} slackId:${f.slackFileId} reason:${f.reason}`));
  if (failures.length > 10) console.log(`  ... and ${failures.length - 10} more`);
}

await conn.end();
