import type { Connection } from 'mysql2/promise';
import { buildRealGmailFetch } from './ingestGmail.js';

interface AssignedSourceItem {
  id: number;
  source: string;
  externalId: string;
  slackChannelId?: string | null;
  slackMessageTs?: string | null;
}

export interface SourceMarkingResult {
  gmailMarkedRead: number;
  slackChecked: number;
  skipped: number;
  errors: string[];
}

async function addSlackCheckMarker(token: string, channel: string, timestamp: string, emoji: string) {
  const response = await fetch('https://slack.com/api/reactions.add', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, timestamp, name: emoji }),
  });
  const data = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
  return { ok: Boolean(data?.ok || data?.error === 'already_reacted'), error: data?.error };
}

async function findSlackFileShareTimestamp(token: string, fileId: string, channel: string): Promise<string | null> {
  const response = await fetch(`https://slack.com/api/files.info?file=${encodeURIComponent(fileId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json().catch(() => null) as any;
  if (!data?.ok) return null;
  const shares = [
    ...(data.file?.shares?.public?.[channel] ?? []),
    ...(data.file?.shares?.private?.[channel] ?? []),
  ];
  return shares.find((share: { ts?: string }) => share.ts)?.ts ?? null;
}

/**
 * Marks a source item handled only after its internal Mailroom assignment is saved.
 * It does not post assignments or notifications to Slack.
 */
export async function markAssignedMailSource(
  conn: Connection,
  item: AssignedSourceItem,
): Promise<SourceMarkingResult> {
  const result: SourceMarkingResult = { gmailMarkedRead: 0, slackChecked: 0, skipped: 0, errors: [] };
  try {
    if (item.source === 'email') {
      const gmail = buildRealGmailFetch(conn);
      const token = await gmail.getAccessToken();
      await gmail.markRead(token, item.externalId);
      await conn.execute('UPDATE mail_items SET source_handled_at=NOW() WHERE id=?', [item.id]);
      result.gmailMarkedRead++;
      return result;
    }

    if (item.source === 'mail') {
      const [[config]] = await conn.execute<any[]>('SELECT slack_bot_token FROM mail_bot_config ORDER BY id ASC LIMIT 1');
      const token = config?.slack_bot_token || process.env.SLACK_BOT_TOKEN || '';
      if (!token || !item.slackChannelId || !item.slackMessageTs) {
        result.skipped++;
        return result;
      }
      const [[markerSetting]] = await conn.execute<any[]>("SELECT value FROM mail_settings WHERE `key`='reviewed_emoji' LIMIT 1");
      const emoji = markerSetting?.value || 'white_check_mark';
      let timestamp = item.slackMessageTs;
      let marker = await addSlackCheckMarker(token, item.slackChannelId, timestamp, emoji);
      if (!marker.ok && marker.error === 'message_not_found') {
        const shareTimestamp = await findSlackFileShareTimestamp(token, item.externalId, item.slackChannelId);
        if (shareTimestamp) {
          timestamp = shareTimestamp;
          marker = await addSlackCheckMarker(token, item.slackChannelId, timestamp, emoji);
        }
      }
      if (!marker.ok) throw new Error(`Slack check marker failed: ${marker.error ?? 'unknown error'}`);
      await conn.execute('UPDATE mail_items SET source_handled_at=NOW(), slack_message_ts=? WHERE id=?', [timestamp, item.id]);
      result.slackChecked++;
      return result;
    }

    result.skipped++;
    return result;
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
    return result;
  }
}
