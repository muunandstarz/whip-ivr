import type { Connection } from 'mysql2/promise';
import { storageGetSignedUrl, storagePut } from '../storage.js';
import { buildRealGmailFetch, type GmailPart } from './ingestGmail.js';

export interface GmailAttachmentRecoveryResult {
  recovered: number;
  healthy: number;
  skipped: number;
  errors: number;
  total: number;
}

function isUsableFileResponse(response: Response): boolean {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  return response.ok && !contentType.includes('xml') && !contentType.includes('text/html');
}

function findAttachment(parts: GmailPart[] | undefined, filename: string): GmailPart | null {
  for (const part of parts ?? []) {
    if (part.filename === filename && part.body) return part;
    const nested = findAttachment(part.parts, filename);
    if (nested) return nested;
  }
  return null;
}

/**
 * Re-upload a bounded number of legacy Gmail attachments whose stored object is no
 * longer readable in the active deployment. The original email remains the source
 * of truth; no user mail is modified.
 */
export async function recoverStaleGmailAttachments(
  conn: Connection,
  limit = 30,
): Promise<GmailAttachmentRecoveryResult> {
  const batchLimit = Math.min(Math.max(Math.floor(limit), 1), 100);
  const [rows] = await conn.execute<any[]>(
    `SELECT mf.id, mf.storage_key, mf.filename, mf.content_type,
            mi.external_id
     FROM mail_item_files mf
     JOIN mail_items mi ON mi.id = mf.item_id
     WHERE mi.source = 'email'
       AND mf.filename IS NOT NULL
     ORDER BY mi.received_at DESC
     LIMIT ${batchLimit}`,
  );
  const result: GmailAttachmentRecoveryResult = { recovered: 0, healthy: 0, skipped: 0, errors: 0, total: rows.length };
  if (!rows.length) return result;

  const gmail = buildRealGmailFetch(conn);
  const token = await gmail.getAccessToken();
  const messages = new Map<string, Awaited<ReturnType<typeof gmail.getMessage>>>();

  for (const row of rows) {
    try {
      const signedUrl = await storageGetSignedUrl(row.storage_key);
      const current = await fetch(signedUrl);
      if (isUsableFileResponse(current)) {
        result.healthy++;
        continue;
      }

      let message = messages.get(row.external_id);
      if (!message) {
        message = await gmail.getMessage(token, row.external_id);
        messages.set(row.external_id, message);
      }
      const attachment = findAttachment(message.payload?.parts, row.filename);
      if (!attachment?.body?.attachmentId && !attachment?.body?.data) {
        result.skipped++;
        continue;
      }
      const encoded = attachment.body.attachmentId
        ? (await gmail.getAttachment(token, row.external_id, attachment.body.attachmentId)).data
        : attachment.body.data!;
      const buffer = Buffer.from(encoded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
      const { key } = await storagePut(
        `mail/email/recovered/${row.external_id}/${row.filename}`,
        buffer,
        row.content_type || attachment.mimeType || 'application/octet-stream',
      );
      await conn.execute('UPDATE mail_item_files SET storage_key=? WHERE id=?', [key, row.id]);
      result.recovered++;
    } catch (error) {
      console.error(`[gmailAttachmentRecovery] file ${row.id} failed:`, error);
      result.errors++;
    }
  }
  return result;
}
