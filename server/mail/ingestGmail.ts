/**
 * ingestGmail(conn, opts?)
 *
 * Queries the claims@ mailbox for unread messages via the Gmail API
 * (service account with domain-wide delegation). For each message:
 *   1. Dedupe on (source='email', external_id=messageId)
 *   2. Parse body, thread id, sender, subject, date
 *   3. storagePut attachments → mail_item_files
 *   4. Insert mail_items row (status='new', category=null)
 *   5. Remove UNREAD label so it is never pulled again
 *
 * The Gmail HTTP calls are injected via `opts.gmailFetch` so tests can
 * mock them without touching the real API.
 */

import type { Connection } from 'mysql2/promise';
import { storagePut } from '../storage.js';

export interface GmailMessage {
  id: string;
  threadId: string;
  internalDate?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
    body?: { data?: string; size?: number };
    parts?: GmailPart[];
    mimeType?: string;
  };
  labelIds?: string[];
}

export interface GmailPart {
  mimeType: string;
  filename?: string;
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: GmailPart[];
}

export interface GmailFetchFn {
  /** GET https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread */
  listMessages(token: string): Promise<{ messages?: Array<{ id: string }> }>;
  /** GET .../messages/{id}?format=full */
  getMessage(token: string, messageId: string): Promise<GmailMessage>;
  /** GET .../messages/{id}/attachments/{attachmentId} */
  getAttachment(token: string, messageId: string, attachmentId: string): Promise<{ data: string }>;
  /** POST .../messages/{id}/modify — remove UNREAD label */
  markRead(token: string, messageId: string): Promise<void>;
  /** Get a short-lived OAuth2 access token from the service account */
  getAccessToken(): Promise<string>;
}

export interface IngestGmailResult {
  inserted: number;
  skipped: number;
  errors: string[];
}

/** Decode base64url → string */
function b64urlToString(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

/** Decode base64url → Buffer */
function b64urlToBuffer(data: string): Buffer {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/** Recursively extract text/plain body from a MIME tree */
function extractTextBody(part: GmailPart): string {
  if (part.mimeType === 'text/plain' && part.body?.data) {
    return b64urlToString(part.body.data);
  }
  if (part.parts) {
    for (const child of part.parts) {
      const text = extractTextBody(child);
      if (text) return text;
    }
  }
  return '';
}

/** Collect all attachment parts (has filename + attachmentId or inline data) */
function collectAttachments(part: GmailPart): Array<{ filename: string; mimeType: string; attachmentId?: string; data?: string }> {
  const result: Array<{ filename: string; mimeType: string; attachmentId?: string; data?: string }> = [];
  if (part.filename && part.body) {
    result.push({
      filename: part.filename,
      mimeType: part.mimeType,
      attachmentId: part.body.attachmentId,
      data: part.body.data,
    });
  }
  if (part.parts) {
    for (const child of part.parts) {
      result.push(...collectAttachments(child));
    }
  }
  return result;
}

export async function ingestGmail(
  conn: Connection,
  gmail: GmailFetchFn,
  claimEmail = 'claims@drivewhip.com',
): Promise<IngestGmailResult> {
  const result: IngestGmailResult = { inserted: 0, skipped: 0, errors: [] };

  let token: string;
  try {
    token = await gmail.getAccessToken();
  } catch (e) {
    result.errors.push(`getAccessToken failed: ${String(e)}`);
    return result;
  }

  let messageList: { messages?: Array<{ id: string }> };
  try {
    messageList = await gmail.listMessages(token);
  } catch (e) {
    result.errors.push(`listMessages failed: ${String(e)}`);
    return result;
  }

  const ids = messageList.messages ?? [];

  for (const { id: messageId } of ids) {
    try {
      // 1. Dedupe check
      const [existing] = await conn.execute<any[]>(
        "SELECT id FROM mail_items WHERE source = 'email' AND external_id = ?",
        [messageId]
      );
      if (existing.length > 0) {
        result.skipped++;
        continue;
      }

      // 2. Fetch full message
      const msg = await gmail.getMessage(token, messageId);
      const headers = msg.payload?.headers ?? [];
      const getHeader = (name: string) =>
        headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;

      const subject = getHeader('Subject');
      const fromRaw = getHeader('From') ?? '';
      const dateRaw = getHeader('Date');
      const receivedAt = dateRaw ? new Date(dateRaw) : new Date(Number(msg.internalDate));

      // Parse from: "Name <email>" or just "email"
      const fromMatch = fromRaw.match(/^(.*?)\s*<([^>]+)>$/) ?? null;
      const fromName = fromMatch ? fromMatch[1].replace(/^"|"$/g, '').trim() : null;
      const fromEmail = fromMatch ? fromMatch[2] : fromRaw.trim();

      // 3. Extract body
      let bodyText = '';
      if (msg.payload) {
        if (msg.payload.mimeType === 'text/plain' && msg.payload.body?.data) {
          bodyText = b64urlToString(msg.payload.body.data);
        } else if (msg.payload.parts) {
          for (const part of msg.payload.parts) {
            const text = extractTextBody(part);
            if (text) { bodyText = text; break; }
          }
        }
      }

      // 4. Insert mail_items row
      const [insertResult] = await conn.execute<any>(
        `INSERT INTO mail_items
           (source, external_id, received_at, status, subject, body_text,
            from_name, from_email, gmail_thread_id, claim_email)
         VALUES ('email', ?, ?, 'new', ?, ?, ?, ?, ?, ?)`,
        [
          messageId,
          receivedAt,
          subject,
          bodyText.slice(0, 65535),
          fromName,
          fromEmail,
          msg.threadId ?? null,
          claimEmail,
        ]
      );
      const itemId = (insertResult as any).insertId;

      // 5. Save attachments
      const attachments = msg.payload?.parts
        ? collectAttachments({ mimeType: 'multipart/mixed', parts: msg.payload.parts })
        : [];

      for (const att of attachments) {
        try {
          let buffer: Buffer;
          if (att.attachmentId) {
            const attData = await gmail.getAttachment(token, messageId, att.attachmentId);
            buffer = b64urlToBuffer(attData.data);
          } else if (att.data) {
            buffer = b64urlToBuffer(att.data);
          } else {
            continue;
          }
          const key = `mail/email/${messageId}/${att.filename}`;
          const { key: storageKey, url } = await storagePut(key, buffer, att.mimeType);
          await conn.execute(
            `INSERT INTO mail_item_files (item_id, storage_key, filename, content_type, size_bytes)
             VALUES (?, ?, ?, ?, ?)`,
            [itemId, storageKey, att.filename, att.mimeType, buffer.length]
          );
        } catch (attErr) {
          result.errors.push(`attachment ${att.filename}: ${String(attErr)}`);
        }
      }

      // 6. Mark as read (remove UNREAD label)
      try {
        await gmail.markRead(token, messageId);
      } catch (markErr) {
        result.errors.push(`markRead ${messageId}: ${String(markErr)}`);
      }

      result.inserted++;
    } catch (e) {
      result.errors.push(`message ${messageId}: ${String(e)}`);
    }
  }

  return result;
}

/** Build a real GmailFetchFn using the service account credentials from env */
export function buildRealGmailFetch(): GmailFetchFn {
  const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

  async function getAccessToken(): Promise<string> {
    const credsJson = process.env.GMAIL_SERVICE_ACCOUNT_JSON;
    if (!credsJson) throw new Error('GMAIL_SERVICE_ACCOUNT_JSON env var not set');
    const creds = JSON.parse(credsJson);
    // Build JWT for service account impersonation
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      iss: creds.client_email,
      sub: 'claims@drivewhip.com',
      scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })).toString('base64url');
    const { createSign } = await import('crypto');
    const sign = createSign('RSA-SHA256');
    sign.update(`${header}.${payload}`);
    const sig = sign.sign(creds.private_key, 'base64url');
    const jwt = `${header}.${payload}.${sig}`;
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });
    const tokenData = await tokenResp.json() as { access_token?: string; error?: string };
    if (!tokenData.access_token) throw new Error(`Gmail token error: ${tokenData.error}`);
    return tokenData.access_token;
  }

  return {
    getAccessToken,
    async listMessages(token) {
      const res = await fetch(`${GMAIL_BASE}/messages?q=is%3Aunread&maxResults=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.json();
    },
    async getMessage(token, messageId) {
      const res = await fetch(`${GMAIL_BASE}/messages/${messageId}?format=full`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.json();
    },
    async getAttachment(token, messageId, attachmentId) {
      const res = await fetch(`${GMAIL_BASE}/messages/${messageId}/attachments/${attachmentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.json();
    },
    async markRead(token, messageId) {
      await fetch(`${GMAIL_BASE}/messages/${messageId}/modify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
      });
    },
  };
}
