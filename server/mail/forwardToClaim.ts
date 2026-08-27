import type { Connection } from 'mysql2/promise';
import { storageGetSignedUrl } from '../storage.js';
import { buildRealGmailFetch } from './ingestGmail.js';

export interface ForwardableMailItem {
  id: number;
  source: 'email' | 'mail' | 'fax' | 'manual';
  externalId: string;
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
  slackFileId: string | null;
}

const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_ATTACHMENTS = 10;

function isUsableFileResponse(response: Response): boolean {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  return response.ok && !contentType.includes('xml') && !contentType.includes('text/html');
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 15_000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function sourceBody(item: ForwardableMailItem): string {
  const raw = item.bodyText?.trim() ?? '';
  const onlyPageMarkers = raw.length > 0 && raw.replace(/--\s*\d+\s+of\s+\d+\s*--/gi, '').trim().length === 0;
  if (raw && !onlyPageMarkers) return raw;
  if (item.source === 'mail' || item.source === 'fax') {
    return 'This correspondence was received through the Claims Mail channel. The original fax/document is attached.';
  }
  return '(No email body was captured. See attached mail piece.)';
}

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
    sourceBody(input.item),
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
  let slackToken = '';
  if (input.item.source === 'mail' || input.item.source === 'fax') {
    const [[config]] = await input.conn.execute<any[]>(
      'SELECT slack_bot_token FROM mail_bot_config ORDER BY id ASC LIMIT 1',
    );
    slackToken = config?.slack_bot_token || process.env.SLACK_BOT_TOKEN || '';
  }
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
      const response = await fetchWithTimeout(signedUrl, {});
      let bytes: Buffer | null = isUsableFileResponse(response) ? Buffer.from(await response.arrayBuffer()) : null;
      if (!bytes && slackToken && file.slackFileId) {
        const infoResponse = await fetchWithTimeout(
          `https://slack.com/api/files.info?file=${encodeURIComponent(file.slackFileId)}`,
          { headers: { Authorization: `Bearer ${slackToken}` } },
        );
        const info = await infoResponse.json().catch(() => null) as any;
        const downloadUrl = info?.file?.url_private_download || info?.file?.url_private;
        if (info?.ok && downloadUrl) {
          const downloadResponse = await fetchWithTimeout(downloadUrl, { headers: { Authorization: `Bearer ${slackToken}` } });
          if (isUsableFileResponse(downloadResponse)) bytes = Buffer.from(await downloadResponse.arrayBuffer());
        }
      }
      if (!bytes) throw new Error('attachment unavailable');
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
