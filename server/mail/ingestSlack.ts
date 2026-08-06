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
    botMarkerEmoji?: string;
    addBotMarker?: boolean;
  }
): Promise<IngestSlackResult> {
  const { fileId, messageTs, channelId, filename, mimeType, urlPrivateDownload } = event;

  try {
    // 1. Check reactions on the parent message
    const reactions = event.reactions ?? await slack.getReactions(channelId, messageTs);
    const alreadyReviewed = reactions.some(r => r.name === opts.reviewedEmoji);

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
         VALUES ('mail', ?, NOW(), 'resolved', 1, ?, ?, ?)`,
        [fileId, channelId, messageTs, permalink ?? null]
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
      "SELECT id FROM mail_items WHERE source = 'mail' AND external_id = ?",
      [fileId]
    );
    if (existing.length > 0) {
      return { action: 'skipped_dedupe', itemId: existing[0].id };
    }

    // 3. Get permalink if not provided
    const permalink = event.permalink ?? await slack.getPermalink(channelId, messageTs);

    // 4. Insert stub row
    const [ins] = await conn.execute<any>(
      `INSERT INTO mail_items
         (source, external_id, received_at, status,
          slack_channel_id, slack_message_ts, slack_permalink, subject)
       VALUES ('mail', ?, NOW(), 'new', ?, ?, ?, ?)`,
      [fileId, channelId, messageTs, permalink ?? null, filename ?? null]
    );
    const itemId = (ins as any).insertId;

    // 5. Download file and store
    if (urlPrivateDownload) {
      try {
        const { buffer, contentType } = await slack.downloadFile(urlPrivateDownload);
        const key = `mail/slack/${channelId}/${messageTs}/${filename ?? fileId}`;
        const { key: storageKey } = await storagePut(key, buffer, contentType);
        await conn.execute(
          `INSERT INTO mail_item_files (item_id, storage_key, filename, content_type, size_bytes)
           VALUES (?, ?, ?, ?, ?)`,
          [itemId, storageKey, filename ?? fileId, contentType, buffer.length]
        );
      } catch (dlErr) {
        // Non-fatal: stub row is already inserted, file can be re-fetched later
        console.error(`[ingestSlack] file download failed for ${fileId}: ${dlErr}`);
      }
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
      const res = await fetch(`https://slack.com/api/reactions.get?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json() as { ok: boolean; message?: { reactions?: Array<{ name: string }> } };
      return data.message?.reactions ?? [];
    },
    async downloadFile(url) {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
      const buffer = Buffer.from(await res.arrayBuffer());
      return { buffer, contentType };
    },
    async addReaction(channelId, messageTs, emoji) {
      await fetch('https://slack.com/api/reactions.add', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: channelId, timestamp: messageTs, name: emoji }),
      });
    },
    async getPermalink(channelId, messageTs) {
      const params = new URLSearchParams({ channel: channelId, message_ts: messageTs });
      const res = await fetch(`https://slack.com/api/chat.getPermalink?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json() as { ok: boolean; permalink?: string };
      return data.permalink ?? null;
    },
  };
}
