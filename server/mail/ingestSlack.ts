/**
 * handleSlackFileEvent(conn, event, opts)
 *
 * Processes a Slack file_shared or message event from #claims-mail:
 *   1. Check parent message reactions for the reviewed_emoji
 *      → if present: insert pre_reviewed=1, status='resolved' row and stop
 *   2. Dedupe on (source='mail', external_id=fileId)
 *   3. Insert stub mail_items row (status='new', category=null)
 *   4. Download file bytes → storagePut → mail_item_files
 *   5. Optionally add bot_marker_emoji to the post
 *
 * All Slack HTTP calls are injected via `opts.slackFetch` for testability.
 */

import type { Connection } from 'mysql2/promise';
import { storagePut } from '../storage.js';

const SLACK_REQUEST_TIMEOUT_MS = 20_000;

async function slackRequest(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SLACK_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export interface SlackFileEvent {
  /** The Slack file ID */
  fileId: string;
  /** The message ts that contains the file */
  messageTs: string;
  /** Channel ID */
  channelId: string;
  /** Permalink to the message */
  permalink?: string;
  /** File name */
  filename?: string;
  /** MIME type */
  mimeType?: string;
  /** Private download URL */
  urlPrivateDownload?: string;
  /** Reactions already on the parent message */
  reactions?: Array<{ name: string }>;
  /** Original Slack file timestamp, preserved as the Mailroom received date */
  receivedAt?: Date;
}

export interface SlackFetchFn {
  /** Get reactions on a message */
  getReactions(channelId: string, messageTs: string): Promise<Array<{ name: string }>>;
  /** Download a file from url_private_download */
  downloadFile(url: string): Promise<{ buffer: Buffer; contentType: string }>;
  /** Add a reaction emoji to a message */
  addReaction(channelId: string, messageTs: string, emoji: string): Promise<void>;
  /** Get message permalink */
  getPermalink(channelId: string, messageTs: string): Promise<string | null>;
  /** Get complete file metadata when a file_shared webhook carries only an ID */
  getFileInfo(fileId: string): Promise<Partial<SlackFileEvent> | null>;
}

export interface IngestSlackResult {
  action: 'inserted' | 'skipped_dedupe' | 'pre_reviewed' | 'error';
  itemId?: number;
  error?: string;
}

export async function handleSlackFileEvent(
  conn: Connection,
  event: SlackFileEvent,
  slack: SlackFetchFn,
  opts: {
    reviewedEmoji: string;
    reviewedEmojis?: string[];
    botMarkerEmoji?: string;
    addBotMarker?: boolean;
  }
): Promise<IngestSlackResult> {
  let { fileId, messageTs, channelId, filename, mimeType, urlPrivateDownload } = event;
  let receivedAt = event.receivedAt;

  try {
    // 1. Check reactions on the parent message
    // file_shared webhooks carry an ID only; hydrate it before attempting a download.
    if (!urlPrivateDownload || !filename || !mimeType) {
      const fileInfo = await slack.getFileInfo(fileId);
      if (fileInfo) {
        filename = filename ?? fileInfo.filename;
        mimeType = mimeType ?? fileInfo.mimeType;
        urlPrivateDownload = urlPrivateDownload ?? fileInfo.urlPrivateDownload;
        messageTs = event.messageTs || fileInfo.messageTs || messageTs;
        receivedAt = receivedAt ?? fileInfo.receivedAt;
      }
    }

    const reactions = event.reactions ?? await slack.getReactions(channelId, messageTs);
    const reviewMarkers = new Set([opts.reviewedEmoji, ...(opts.reviewedEmojis ?? [])]);
    const alreadyReviewed = reactions.some(r => reviewMarkers.has(r.name));

    /**
     * Store the attachment, retrying with a newly issued files.info download URL when
     * the URL supplied by the webhook/files.list payload has expired or is incomplete.
     */
    const persistAttachment = async (itemId: number) => {
      let lastError: unknown;
      const attempt = async (downloadUrl?: string) => {
        if (!downloadUrl) throw new Error('Slack did not provide a private download URL');
        const { buffer, contentType } = await slack.downloadFile(downloadUrl);
        const key = `mail/slack/${channelId}/${messageTs}/${filename ?? fileId}`;
        const { key: storageKey } = await storagePut(key, buffer, contentType);
        await conn.execute(
          `INSERT INTO mail_item_files (item_id, storage_key, filename, content_type, size_bytes, slack_file_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [itemId, storageKey, filename ?? fileId, contentType, buffer.length, fileId]
        );
      };

      try {
        await attempt(urlPrivateDownload);
        return;
      } catch (error) {
        lastError = error;
      }

      // Slack's event/list URLs can expire; always obtain a fresh URL before declaring failure.
      const fresh = await slack.getFileInfo(fileId);
      if (fresh) {
        filename = fresh.filename ?? filename;
        mimeType = fresh.mimeType ?? mimeType;
        urlPrivateDownload = fresh.urlPrivateDownload ?? urlPrivateDownload;
        messageTs = fresh.messageTs ?? messageTs;
        receivedAt = fresh.receivedAt ?? receivedAt;
      }
      try {
        await attempt(urlPrivateDownload);
        return;
      } catch (error) {
        lastError = error;
      }
      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    };

    if (alreadyReviewed) {
      // Insert a pre_reviewed=1, status='resolved' row (for the log) but do not route
      const permalink = event.permalink ?? await slack.getPermalink(channelId, messageTs);
      const [existing] = await conn.execute<any[]>(
        "SELECT id FROM mail_items WHERE source = 'mail' AND external_id = ?",
        [fileId]
      );
      if (existing.length > 0) {
        return { action: 'skipped_dedupe', itemId: existing[0].id };
      }
      const [ins] = await conn.execute<any>(
        `INSERT INTO mail_items
           (source, external_id, received_at, status, pre_reviewed,
            slack_channel_id, slack_message_ts, slack_permalink)
         VALUES ('mail', ?, ?, 'resolved', 1, ?, ?, ?)`,
        [fileId, receivedAt ?? new Date(), channelId, messageTs, permalink ?? null]
      );
      // Add a system note
      await conn.execute(
        `INSERT INTO mail_item_notes (item_id, by_user_id, note)
         VALUES (?, NULL, 'Already reviewed in Slack before system pickup')`,
        [(ins as any).insertId]
      );
      return { action: 'pre_reviewed', itemId: (ins as any).insertId };
    }

    // 2. Dedupe check
    const [existing] = await conn.execute<any[]>(
      `SELECT mi.id, COUNT(mif.id) AS file_count
       FROM mail_items mi
       LEFT JOIN mail_item_files mif ON mif.item_id = mi.id
       WHERE mi.source = 'mail' AND mi.external_id = ?
       GROUP BY mi.id`,
      [fileId]
    );
    if (existing.length > 0) {
      // A prior run may have inserted the Mailroom row while a file download failed.
      // Rehydrate the attachment instead of preserving a permanently file-less record.
      if (Number(existing[0].file_count ?? 0) === 0) {
        try {
          await persistAttachment(existing[0].id);
        } catch (recoveryErr) {
          console.error(`[ingestSlack] attachment recovery failed for ${fileId}: ${recoveryErr}`);
        }
      }
      return { action: 'skipped_dedupe', itemId: existing[0].id };
    }

    // 3. Get permalink if not provided
    const permalink = event.permalink ?? await slack.getPermalink(channelId, messageTs);

    // 4. Insert stub row
    const [ins] = await conn.execute<any>(
      `INSERT INTO mail_items
         (source, external_id, received_at, status,
          slack_channel_id, slack_message_ts, slack_permalink, subject)
         VALUES ('mail', ?, ?, 'new', ?, ?, ?, ?)`,
      [fileId, receivedAt ?? new Date(), channelId, messageTs, permalink ?? null, filename ?? null]
    );
    const itemId = (ins as any).insertId;

    // 5. Download and persist file. A fresh files.info URL is retried on any failure.
    try {
      await persistAttachment(itemId);
    } catch (dlErr) {
      // Non-fatal: stub row is already inserted and a future dedupe pass will retry recovery.
      console.error(`[ingestSlack] file download failed after fresh-url retry for ${fileId}: ${dlErr}`);
    }

    // 6. Optionally add bot marker emoji
    if (opts.addBotMarker && opts.botMarkerEmoji) {
      try {
        await slack.addReaction(channelId, messageTs, opts.botMarkerEmoji);
      } catch {
        // Non-fatal
      }
    }

    return { action: 'inserted', itemId };
  } catch (e) {
    return { action: 'error', error: String(e) };
  }
}

/** Build a real SlackFetchFn using the SLACK_BOT_TOKEN env var */
export function buildRealSlackFetch(token: string): SlackFetchFn {
  return {
    async getReactions(channelId, messageTs) {
      const params = new URLSearchParams({ channel: channelId, timestamp: messageTs, full: 'true' });
      const res = await slackRequest(`https://slack.com/api/reactions.get?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json() as { ok: boolean; message?: { reactions?: Array<{ name: string }> } };
      return data.message?.reactions ?? [];
    },
    async downloadFile(url) {
      const res = await slackRequest(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Slack file download failed (${res.status})`);
      const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
      const buffer = Buffer.from(await res.arrayBuffer());
      return { buffer, contentType };
    },
    async addReaction(channelId, messageTs, emoji) {
      await slackRequest('https://slack.com/api/reactions.add', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: channelId, timestamp: messageTs, name: emoji }),
      });
    },
    async getPermalink(channelId, messageTs) {
      const params = new URLSearchParams({ channel: channelId, message_ts: messageTs });
      const res = await slackRequest(`https://slack.com/api/chat.getPermalink?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json() as { ok: boolean; permalink?: string };
      return data.permalink ?? null;
    },
    async getFileInfo(fileId) {
      const res = await slackRequest(`https://slack.com/api/files.info?file=${encodeURIComponent(fileId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json() as { ok: boolean; file?: any };
      if (!data.ok || !data.file) return null;
      const file = data.file;
      const shares = file.shares?.public ?? file.shares?.private ?? {};
      const firstShare = Object.values(shares).flat()[0] as { ts?: string } | undefined;
      return {
        filename: file.name ?? file.title,
        mimeType: file.mimetype,
        urlPrivateDownload: file.url_private_download ?? file.url_private,
        messageTs: firstShare?.ts,
        receivedAt: file.timestamp ? new Date(Number(file.timestamp) * 1000) : undefined,
      };
    },
  };
}
