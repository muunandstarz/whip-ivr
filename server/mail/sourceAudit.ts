import type { Connection } from 'mysql2/promise';
import { buildRealGmailFetch } from './ingestGmail.js';

const REVIEW_MARKERS = new Set(['white_check_mark', 'heavy_check_mark', 'eyes', 'ballot_box_with_check']);

export interface SourceAuditResult {
  scanned: number;
  gmailReadResolved: number;
  slackReviewedResolved: number;
  skipped: number;
  errors: string[];
}

async function resolveSourceItem(conn: Connection, itemId: number, reason: string): Promise<void> {
  await conn.execute(
    `UPDATE mail_items
     SET status='resolved', resolved_at=COALESCE(resolved_at, NOW())
     WHERE id=? AND status IN ('new', 'assigned', 'escalated')`,
    [itemId],
  );
  await conn.execute(
    `INSERT INTO mail_routing_history (item_id, action, reason)
     VALUES (?, 'resolved', ?)`,
    [itemId, reason],
  );
}

async function getUnreadGmailIds(token: string): Promise<Set<string>> {
  const ids = new Set<string>();
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ q: 'to:claims@drivewhip.com is:unread', maxResults: '500' });
    if (pageToken) params.set('pageToken', pageToken);
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Gmail unread audit list failed (${response.status})`);
    const data = await response.json() as { messages?: Array<{ id: string }>; nextPageToken?: string };
    for (const message of data.messages ?? []) ids.add(message.id);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return ids;
}

async function getReviewedSlackTimestamps(channel: string, token: string): Promise<Set<string>> {
  const reviewed = new Set<string>();
  let cursor: string | undefined;
  do {
    const params = new URLSearchParams({ channel, limit: '200' });
    if (cursor) params.set('cursor', cursor);
    const response = await fetch(`https://slack.com/api/conversations.history?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json().catch(() => null) as any;
    if (!data?.ok) throw new Error(`Slack source audit history failed: ${data?.error ?? response.status}`);
    for (const message of data.messages ?? []) {
      const isReviewed = (message.reactions ?? []).some((reaction: { name?: string }) =>
        reaction.name && REVIEW_MARKERS.has(reaction.name),
      );
      if (isReviewed && message.ts) reviewed.add(message.ts);
    }
    cursor = data.response_metadata?.next_cursor || undefined;
  } while (cursor);
  return reviewed;
}

/**
 * Resolves active source records that were already read in Gmail or manually
 * reviewed in Claims Mail. Records marked by a successful Mailroom assignment
 * are excluded because their source marker was applied by the system itself.
 */
export async function auditActiveMailSources(conn: Connection, limit = 1000): Promise<SourceAuditResult> {
  const batchLimit = Math.min(Math.max(Math.floor(limit), 1), 1500);
  const [items] = await conn.execute<any[]>(
    `SELECT id, source, external_id, slack_channel_id, slack_message_ts
     FROM mail_items
     WHERE status IN ('new', 'assigned', 'escalated')
       AND source IN ('email', 'mail', 'fax')
       AND source_handled_at IS NULL
     ORDER BY received_at ASC
     LIMIT ${batchLimit}`,
  );
  const result: SourceAuditResult = {
    scanned: items.length,
    gmailReadResolved: 0,
    slackReviewedResolved: 0,
    skipped: 0,
    errors: [],
  };

  const gmail = buildRealGmailFetch(conn);
  const gmailToken = await gmail.getAccessToken().catch((error) => {
    result.errors.push(`Gmail token: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  });
  const unreadGmailIds = gmailToken ? await getUnreadGmailIds(gmailToken).catch((error) => {
    result.errors.push(error instanceof Error ? error.message : String(error));
    return null;
  }) : null;

  const [[botConfig]] = await conn.execute<any[]>('SELECT slack_bot_token FROM mail_bot_config ORDER BY id ASC LIMIT 1');
  const slackToken = botConfig?.slack_bot_token || process.env.SLACK_BOT_TOKEN || '';
  const channels = Array.from(new Set(items.filter((item) => item.source === 'mail' && item.slack_channel_id).map((item) => item.slack_channel_id))) as string[];
  const reviewedByChannel = new Map<string, Set<string>>();
  if (slackToken) {
    for (const channel of channels) {
      try {
        reviewedByChannel.set(channel, await getReviewedSlackTimestamps(channel, slackToken));
      } catch (error) {
        result.errors.push(`Slack ${channel}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  for (const item of items) {
    try {
      if (item.source === 'email') {
        if (!unreadGmailIds) result.skipped++;
        else if (!unreadGmailIds.has(item.external_id)) {
          await resolveSourceItem(conn, item.id, 'Source audit: email is already read in Gmail');
          result.gmailReadResolved++;
        }
        continue;
      }
      if (item.source === 'mail') {
        if (!slackToken || !item.slack_channel_id || !item.slack_message_ts) result.skipped++;
        else if (reviewedByChannel.get(item.slack_channel_id)?.has(item.slack_message_ts)) {
          await resolveSourceItem(conn, item.id, 'Source audit: reviewed/checkmarked in #claims-mail');
          result.slackReviewedResolved++;
        }
        continue;
      }
      result.skipped++;
    } catch (error) {
      result.errors.push(`item ${item.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return result;
}
