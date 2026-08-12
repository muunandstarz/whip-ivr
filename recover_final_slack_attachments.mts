import mysql from 'mysql2/promise';
import { storagePut } from './server/storage.js';

const conn = await mysql.createConnection(process.env.DATABASE_URL!);
try {
  const [[config]] = await conn.execute<any[]>('SELECT slack_bot_token FROM mail_bot_config LIMIT 1');
  const token = config?.slack_bot_token || process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error('No Slack bot token configured');
  const [rows] = await conn.execute<any[]>(`
    SELECT mi.id, mi.external_id, mi.slack_channel_id, mi.slack_message_ts
    FROM mail_items mi
    WHERE mi.source='mail' AND mi.status<>'resolved' AND COALESCE(mi.is_archived,0)=0
      AND NOT EXISTS (SELECT 1 FROM mail_item_files mif WHERE mif.item_id=mi.id)
  `);
  const results: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    try {
      const infoRes = await fetch(`https://slack.com/api/files.info?file=${encodeURIComponent(row.external_id)}`, { headers: { Authorization: `Bearer ${token}` } });
      const info = await infoRes.json() as any;
      if (!info.ok || !info.file?.url_private_download) throw new Error(info.error || 'Slack file unavailable');
      const file = info.file;
      const download = await fetch(file.url_private_download, { headers: { Authorization: `Bearer ${token}` } });
      if (!download.ok) throw new Error(`download ${download.status}`);
      const buffer = Buffer.from(await download.arrayBuffer());
      const contentType = download.headers.get('content-type') || file.mimetype || 'application/octet-stream';
      const { key } = await storagePut(`mail/slack/recovered/${row.external_id}/${file.name || row.external_id}`, buffer, contentType);
      await conn.execute(
        `INSERT INTO mail_item_files (item_id, storage_key, filename, content_type, size_bytes, slack_file_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [row.id, key, file.name || row.external_id, contentType, buffer.length, row.external_id],
      );
      results.push({ itemId: row.id, fileId: row.external_id, recovered: true, bytes: buffer.length });
    } catch (error) {
      results.push({ itemId: row.id, fileId: row.external_id, recovered: false, error: String(error) });
    }
  }
  console.log(JSON.stringify(results, null, 2));
} finally {
  await conn.end();
}
