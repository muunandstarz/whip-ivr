import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/whip-ivr/.env' });

const FORGE_URL = (process.env.BUILT_IN_FORGE_API_URL || '').replace(/\/+$/, '');
const FORGE_KEY = process.env.BUILT_IN_FORGE_API_KEY;
const DB_URL = process.env.DATABASE_URL;
const BATCH = 3;

const pool = mysql.createPool({
  uri: DB_URL,
  connectionLimit: 5,
  connectTimeout: 30000,
  waitForConnections: true,
});

const [[cfgRow]] = await pool.execute('SELECT slack_bot_token FROM mail_bot_config LIMIT 1');
const SLACK_TOKEN = cfgRow?.slack_bot_token || process.env.SLACK_BOT_TOKEN;
console.log('Token prefix:', SLACK_TOKEN?.substring(0, 20));
console.log('Forge URL:', FORGE_URL);

function appendHash(relKey) {
  const hash = Math.random().toString(36).slice(2, 10);
  const lastDot = relKey.lastIndexOf('.');
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

async function storagePut(relKey, buf, contentType) {
  const key = appendHash(relKey.replace(/^\/+/, ''));
  const presignUrl = `${FORGE_URL}/v1/storage/presign/put?path=${encodeURIComponent(key)}`;
  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${FORGE_KEY}` }
  });
  if (!presignResp.ok) {
    const txt = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`presign failed (${presignResp.status}): ${txt.substring(0, 100)}`);
  }
  const { url: s3Url } = await presignResp.json();
  if (!s3Url) throw new Error('Forge returned empty presign URL');
  const uploadResp = await fetch(s3Url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: buf
  });
  if (!uploadResp.ok) throw new Error(`S3 upload failed (${uploadResp.status})`);
  return key;
}

async function processFile(file) {
  const slackFileId = file.slack_file_id || file.external_id;
  if (!slackFileId) return { id: file.id, ok: false, reason: 'no_slack_file_id' };
  try {
    const infoResp = await fetch(`https://slack.com/api/files.info?file=${slackFileId}`, {
      headers: { Authorization: `Bearer ${SLACK_TOKEN}` }
    });
    const infoData = await infoResp.json();
    if (!infoData.ok) return { id: file.id, ok: false, reason: `files.info:${infoData.error}` };
    const dlUrl = infoData.file?.url_private_download || infoData.file?.url_private;
    if (!dlUrl) return { id: file.id, ok: false, reason: 'no_dl_url' };
    const dlResp = await fetch(dlUrl, { headers: { Authorization: `Bearer ${SLACK_TOKEN}` } });
    if (!dlResp.ok) return { id: file.id, ok: false, reason: `dl_http_${dlResp.status}` };
    const buf = Buffer.from(await dlResp.arrayBuffer());
    const ct = file.content_type || 'application/pdf';
    const fname = file.filename || `slack_${slackFileId}.pdf`;
    const newKey = await storagePut(`mail/slack/backfill/${fname}`, buf, ct);
    const dbConn = await pool.getConnection();
    try {
      await dbConn.execute(
        'UPDATE mail_item_files SET storage_key = ?, slack_file_id = ? WHERE id = ?',
        [newKey, slackFileId, file.id]
      );
    } finally {
      dbConn.release();
    }
    return { id: file.id, ok: true, newKey };
  } catch (e) {
    return { id: file.id, ok: false, reason: e.message.substring(0, 120) };
  }
}

const [files] = await pool.execute(`
  SELECT mf.id, mf.item_id, mf.storage_key, mf.filename, mf.content_type, mf.slack_file_id,
         mi.external_id
  FROM mail_item_files mf
  JOIN mail_items mi ON mi.id = mf.item_id
  WHERE mi.source = 'mail'
  ORDER BY mf.id
`);

console.log(`Found ${files.length} Slack files. Processing in batches of ${BATCH}...`);
let ok = 0, failed = 0;
const failures = [];

for (let i = 0; i < files.length; i += BATCH) {
  const batch = files.slice(i, i + BATCH);
  const results = await Promise.all(batch.map(processFile));
  for (const r of results) {
    if (r.ok) ok++;
    else { failed++; failures.push(r); }
  }
  console.log(`  ${i + batch.length}/${files.length} — ok:${ok} failed:${failed}`);
}

console.log(`\n=== BACKFILL COMPLETE ===`);
console.log(`Re-fetched and stored: ${ok}`);
console.log(`Failed: ${failed}`);
if (failures.length > 0) {
  console.log('\nFailures (first 20):');
  failures.slice(0, 20).forEach(f => console.log(`  id:${f.id} reason:${f.reason}`));
}
await pool.end();
