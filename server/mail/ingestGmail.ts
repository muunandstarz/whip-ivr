/**
 * ingestGmail(conn, gmail)
 *
 * Queries the owner's Gmail inbox for messages addressed to claims@drivewhip.com
 * that have NOT yet been labeled "mailroom-done". For each message:
 *   1. Dedupe on (source='email', external_id=messageId)  ← safety net
 *   2. Parse body, thread id, sender (Reply-To > From), subject, date
 *   3. storagePut attachments → mail_item_files
 *   4. Insert mail_items row (status='new', category=null)
 *   5. Add "mailroom-done" label → drops out of next poll
 *
 * Query: `to:claims@drivewhip.com -label:mailroom-done`
 * Never marks messages read. Never touches non-claims@ mail.
 *
 * OAuth token refresh: reads gmail_refresh_token from mail_settings,
 * exchanges it for a fresh access_token on every run.
 *
 * The Gmail HTTP calls are injected via the GmailFetchFn interface so tests
 * can mock them without hitting the real API.
 */
import type { Connection } from 'mysql2/promise';
import { storagePut } from '../storage.js';

// ─── Types ────────────────────────────────────────────────────────────────────

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
  /** Exchange refresh_token for a fresh access_token */
  getAccessToken(): Promise<string>;
  /** List messages matching the claims@ query */
  listMessages(token: string): Promise<{ messages?: Array<{ id: string }> }>;
  /** Fetch full message */
  getMessage(token: string, messageId: string): Promise<GmailMessage>;
  /** Download an attachment */
  getAttachment(token: string, messageId: string, attachmentId: string): Promise<{ data: string }>;
  /** Add a label to a message (used to mark "mailroom-done") */
  addLabel(token: string, messageId: string, labelId: string): Promise<void>;
  /** Get or create a label by name, returning its ID */
  getOrCreateLabel(token: string, labelName: string): Promise<string>;
  /** @deprecated kept for test compatibility — no-op in production */
  markRead(token: string, messageId: string): Promise<void>;
}

export interface IngestGmailResult {
  inserted: number;
  skipped: number;
  errors: string[];
}

// ─── MIME helpers ─────────────────────────────────────────────────────────────

function b64urlToString(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function b64urlToBuffer(data: string): Buffer {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

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

/** Parse "Name <email>" or bare "email" → { name, email } */
function parseAddress(raw: string): { name: string | null; email: string } {
  const m = raw.match(/^(.*?)\s*<([^>]+)>$/);
  if (m) {
    return { name: m[1].replace(/^"|"$/g, '').trim() || null, email: m[2].trim() };
  }
  return { name: null, email: raw.trim() };
}

// ─── Core ingest function ─────────────────────────────────────────────────────

export async function ingestGmail(
  conn: Connection,
  gmail: GmailFetchFn,
  claimEmail = 'claims@drivewhip.com',
): Promise<IngestGmailResult> {
  const result: IngestGmailResult = { inserted: 0, skipped: 0, errors: [] };

  // 0. Get access token
  let token: string;
  try {
    token = await gmail.getAccessToken();
  } catch (e) {
    result.errors.push(`getAccessToken failed: ${String(e)}`);
    return result;
  }

  // 0b. Ensure the "mailroom-done" label exists (idempotent)
  let mailroomDoneLabelId: string;
  try {
    mailroomDoneLabelId = await gmail.getOrCreateLabel(token, 'mailroom-done');
  } catch (e) {
    result.errors.push(`getOrCreateLabel failed: ${String(e)}`);
    return result;
  }

  // 1. List messages: to:claims@drivewhip.com -label:mailroom-done
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
      // 2. Dedupe safety net
      const [existing] = await conn.execute<any[]>(
        "SELECT id FROM mail_items WHERE source = 'email' AND external_id = ?",
        [messageId]
      );
      if (existing.length > 0) {
        // Already in DB — still add the label so it drops out of next poll
        try { await gmail.addLabel(token, messageId, mailroomDoneLabelId); } catch {}
        result.skipped++;
        continue;
      }

      // 3. Fetch full message
      const msg = await gmail.getMessage(token, messageId);
      const headers = msg.payload?.headers ?? [];
      const getHeader = (name: string) =>
        headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;

      const subject = getHeader('Subject');
      const dateRaw = getHeader('Date');
      const receivedAt = dateRaw ? new Date(dateRaw) : new Date(Number(msg.internalDate));

      // Sender extraction: Reply-To > From (carrier sends to claims@, owner inbox is just a copy)
      const replyToRaw = getHeader('Reply-To');
      const fromRaw = getHeader('From') ?? '';
      const senderRaw = replyToRaw || fromRaw;
      const { name: fromName, email: fromEmail } = parseAddress(senderRaw);

      // 4. Extract body text
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

      // 5. Insert mail_items row
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

      // 6. Save attachments
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
          const { key: storageKey } = await storagePut(key, buffer, att.mimeType);
          await conn.execute(
            `INSERT INTO mail_item_files (item_id, storage_key, filename, content_type, size_bytes)
             VALUES (?, ?, ?, ?, ?)`,
            [itemId, storageKey, att.filename, att.mimeType, buffer.length]
          );
        } catch (attErr) {
          result.errors.push(`attachment ${att.filename}: ${String(attErr)}`);
        }
      }

      // 7. Add "mailroom-done" label — drops message from next poll
      try {
        await gmail.addLabel(token, messageId, mailroomDoneLabelId);
      } catch (labelErr) {
        result.errors.push(`addLabel ${messageId}: ${String(labelErr)}`);
      }

      result.inserted++;
    } catch (e) {
      result.errors.push(`message ${messageId}: ${String(e)}`);
    }
  }
  return result;
}

// ─── OAuth helpers ────────────────────────────────────────────────────────────

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.labels',
  'https://www.googleapis.com/auth/gmail.modify',
].join(' ');

/** Build the Google OAuth consent URL for the admin to visit */
export function buildGmailOAuthUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GMAIL_CLIENT_ID ?? '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GMAIL_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/** Exchange an auth code for tokens */
export async function exchangeGmailCode(
  code: string,
  redirectUri: string,
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GMAIL_CLIENT_ID ?? '',
      client_secret: process.env.GMAIL_CLIENT_SECRET ?? '',
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const data = await resp.json() as any;
  if (!data.access_token) throw new Error(`Gmail token exchange failed: ${data.error} — ${data.error_description}`);
  return data;
}

/** Use a refresh_token to get a fresh access_token */
export async function refreshGmailToken(refreshToken: string): Promise<string> {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GMAIL_CLIENT_ID ?? '',
      client_secret: process.env.GMAIL_CLIENT_SECRET ?? '',
      grant_type: 'refresh_token',
    }),
  });
  const data = await resp.json() as any;
  if (!data.access_token) throw new Error(`Gmail refresh failed: ${data.error} — ${data.error_description}`);
  return data.access_token;
}

// ─── Real GmailFetchFn (OAuth, reads refresh_token from mail_settings) ────────

/**
 * Build a real GmailFetchFn that:
 * - Reads the refresh_token from mail_settings (key='gmail_refresh_token')
 * - Exchanges it for a fresh access_token on each cron run
 * - Queries to:claims@drivewhip.com -label:mailroom-done
 * - Adds the "mailroom-done" label after processing (never marks read)
 */
export function buildRealGmailFetch(conn: Connection): GmailFetchFn {
  const CLAIMS_QUERY = 'to:claims@drivewhip.com -label:mailroom-done';

  return {
    async getAccessToken() {
      const [[row]] = await conn.execute<any[]>(
        "SELECT value FROM mail_settings WHERE `key` = 'gmail_refresh_token'"
      );
      if (!row?.value) {
        throw new Error('Gmail not connected — no refresh_token in mail_settings. Visit the admin panel to connect Gmail.');
      }
      return refreshGmailToken(row.value);
    },

    async listMessages(token) {
      const q = encodeURIComponent(CLAIMS_QUERY);
      const res = await fetch(`${GMAIL_BASE}/messages?q=${q}&maxResults=50`, {
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

    async addLabel(token, messageId, labelId) {
      await fetch(`${GMAIL_BASE}/messages/${messageId}/modify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ addLabelIds: [labelId] }),
      });
    },

    async getOrCreateLabel(token, labelName) {
      const listRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const listData = await listRes.json() as { labels?: Array<{ id: string; name: string }> };
      const existing = listData.labels?.find(l => l.name === labelName);
      if (existing) return existing.id;
      const createRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: labelName, labelListVisibility: 'labelHide', messageListVisibility: 'hide' }),
      });
      const created = await createRes.json() as { id: string };
      return created.id;
    },

    /** No-op — kept for test compatibility */
    async markRead(_token, _messageId) {},
  };
}
