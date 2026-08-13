import type { Connection } from 'mysql2/promise';
import { storageGetSignedUrl } from '../storage.js';
import { buildRealGmailFetch } from './ingestGmail.js';

export interface ForwardableMailItem {
  id: number;
  subject: string | null;
  bodyText: string | null;
  fromName: string | null;
  fromEmail: string | null;
  claimNumber: string | null;
}

export interface ForwardableMailFile {
  filename: string | null;
  contentType: string | null;
  storageKey: string;
  sizeBytes: number | null;
}

const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_ATTACHMENTS = 10;

function encodeBase64Url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function headerValue(value: string | null | undefined, fallback: string): string {
  return (value ?? fallback).replace(/[\r\n]+/g, ' ').trim() || fallback;
}

function filenameValue(value: string | null, index: number): string {
  return headerValue(value, `mailroom-attachment-${index + 1}`).replace(/[^\w.() -]/g, '_');
}

export function buildForwardMessage(input: {
  recipient: string;
  item: ForwardableMailItem;
  attachments: Array<{ filename: string; contentType: string; bytes: Buffer }>;
  note?: string;
}): string {
  const boundary = `mailroom_${Math.random().toString(36).slice(2)}`;
  const subject = `FWD: ${headerValue(input.item.subject, 'Mailroom correspondence')}${input.item.claimNumber ? ` — Claim ${input.item.claimNumber}` : ''}`;
  const originalSender = input.item.fromName || input.item.fromEmail || 'Unknown sender';
  const body = [
    'Forwarded from Whip Claims Mailroom',
    input.item.claimNumber ? `Whip Claim #: ${input.item.claimNumber}` : null,
    `Original sender: ${originalSender}${input.item.fromEmail && input.item.fromName ? ` <${input.item.fromEmail}>` : ''}`,
    `Original subject: ${headerValue(input.item.subject, '(no subject)')}`,
    input.note?.trim() ? `Forwarding note: ${input.note.trim()}` : null,
    '',
    'Original message:',
    input.item.bodyText?.trim() || '(No email body was captured. See attached mail piece.)',
  ].filter((line): line is string => line !== null).join('\r\n');
  const lines = [
    `To: ${input.recipient}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    body,
  ];
  for (const attachment of input.attachments) {
    lines.push(
      `--${boundary}`,
      `Content-Type: ${attachment.contentType}; name="${attachment.filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${attachment.filename}"`,
      '',
      attachment.bytes.toString('base64'),
    );
  }
  lines.push(`--${boundary}--`, '');
  return lines.join('\r\n');
}

export async function forwardMailToClaim(input: {
  conn: Connection;
  recipient: string;
  item: ForwardableMailItem;
  files: ForwardableMailFile[];
  note?: string;
}): Promise<{ attachmentCount: number; skippedAttachments: string[] }> {
  const attachments: Array<{ filename: string; contentType: string; bytes: Buffer }> = [];
  const skippedAttachments: string[] = [];
  let usedBytes = 0;
  const eligibleFiles = input.files.slice(0, MAX_ATTACHMENTS);
  for (let index = 0; index < eligibleFiles.length; index++) {
    const file = eligibleFiles[index]!;
    const filename = filenameValue(file.filename, index);
    if (file.sizeBytes && usedBytes + file.sizeBytes > MAX_ATTACHMENT_BYTES) {
      skippedAttachments.push(`${filename} (exceeds forward size limit)`);
      continue;
    }
    try {
      const signedUrl = await storageGetSignedUrl(file.storageKey);
      const response = await fetch(signedUrl);
      const returnedType = response.headers.get('content-type')?.toLowerCase() ?? '';
      if (!response.ok || returnedType.includes('xml') || returnedType.includes('text/html')) throw new Error('attachment unavailable');
      const bytes = Buffer.from(await response.arrayBuffer());
      if (usedBytes + bytes.length > MAX_ATTACHMENT_BYTES) {
        skippedAttachments.push(`${filename} (exceeds forward size limit)`);
        continue;
      }
      attachments.push({ filename, contentType: file.contentType || response.headers.get('content-type') || 'application/octet-stream', bytes });
      usedBytes += bytes.length;
    } catch {
      skippedAttachments.push(`${filename} (unavailable)`);
    }
  }
  const gmail = buildRealGmailFetch(input.conn);
  const accessToken = await gmail.getAccessToken();
  const response = await fetch(GMAIL_SEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: encodeBase64Url(buildForwardMessage({ recipient: input.recipient, item: input.item, attachments, note: input.note })) }),
  });
  const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  if (!response.ok) {
    const message = payload?.error?.message || `Gmail send failed (${response.status})`;
    if (/insufficient.*scope|permission/i.test(message)) throw new Error('Gmail sending permission is required. Reconnect Gmail from Mailroom Setup to grant send access.');
    throw new Error(message);
  }
  return { attachmentCount: attachments.length, skippedAttachments };
}
