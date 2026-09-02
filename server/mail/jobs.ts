/**
 * Claims Mail Triage — scheduled job handlers (Slice 5)
 *
 * All three jobs are registered as Express routes under /api/scheduled/.
 * Cron schedules are NOT registered here — jobs are manual-trigger only
 * until explicitly enabled.
 *
 * mailReminders  — DM handlers for overdue items + remindAt-due items
 * mailProcess    — Classify pending rows (category IS NULL, status='new')
 * mailQaWeekly   — Stub only (accuracy computation is phase-3)
 */

import type { Request, Response } from 'express';
import mysql from 'mysql2/promise';
import { classify } from './classify.js';
import { route } from './route.js';
import { ingestGmail, buildRealGmailFetch } from './ingestGmail.js';
import { buildAiSubject, buildMailSummary, createMailContentReader, parseMailContentFiles, refreshIncompleteMailContent } from './contentRefresh.js';
import { recoverStaleGmailAttachments } from './gmailAttachmentRecovery.js';
import { markAssignedMailSource } from './sourceMarking.js';
import { buildRealSlackFetch, handleSlackFileEvent } from './ingestSlack.js';

type SlackBatchCandidate = { id: string; timestamp?: number; [key: string]: unknown };

/**
 * Clears historical Claims Mail from both ends of the timeline so urgent recent
 * files do not wait behind a large archive while the oldest backlog also drains.
 */
export function selectBalancedSlackBatch<T extends SlackBatchCandidate>(candidates: T[], limit = 8): T[] {
  if (limit < 1 || candidates.length === 0) return [];
  const ordered = [...candidates].sort((a, b) => Number(a.timestamp ?? 0) - Number(b.timestamp ?? 0));
  if (ordered.length <= limit) return ordered;
  const oldestCount = Math.ceil(limit / 2);
  const newestCount = limit - oldestCount;
  const selected = [...ordered.slice(0, oldestCount), ...ordered.slice(-newestCount)];
  return Array.from(new Map(selected.map(item => [item.id, item])).values());
}

function sharesForClaimsChannel(file: any, channelId: string): any[] {
  return file.shares?.public?.[channelId] ?? file.shares?.private?.[channelId] ?? [];
}

function fileHasReviewedReaction(file: any, reviewedEmojis: string[]): boolean {
  return (file.reactions ?? []).some((reaction: { name?: string }) => Boolean(reaction.name && reviewedEmojis.includes(reaction.name)));
}

/**
 * Converts one document attached to a Slack thread reply into the same lightweight
 * file shape consumed by the bounded Claims Mail intake. Root-post review markers
 * deliberately travel with every reply attachment: marking the original mail post
 * reviewed means its supporting-thread documents are resolved history, not new work.
 */
export function buildThreadReplyFileCandidate(
  root: { ts?: string; thread_ts?: string; reactions?: Array<{ name?: string }> },
  reply: { ts?: string; reactions?: Array<{ name?: string }>; files?: any[] },
  file: any,
  channelId: string,
): any {
  const parentTs = root.thread_ts ?? root.ts;
  return {
    ...file,
    // `files.list` normally supplies shares. Reply payloads do not always do so.
    shares: file.shares ?? { public: { [channelId]: [{ ts: reply.ts ?? parentTs }] } },
    __mailroomMessageTs: reply.ts ?? parentTs,
    __mailroomRootReactions: root.reactions ?? [],
    __mailroomReplyReactions: reply.reactions ?? [],
  };
}

// ─── Shared Slack helpers ─────────────────────────────────────────────────────

export interface SlackDMFn {
  lookupByEmail(email: string): Promise<string | null>;
  sendDM(userId: string, text: string): Promise<void>;
}

export function buildRealSlackDM(token: string): SlackDMFn {
  return {
    async lookupByEmail(email) {
      const res = await fetch(
        `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json() as { ok: boolean; user?: { id: string } };
      return data.ok ? (data.user?.id ?? null) : null;
    },
    async sendDM(userId, text) {
      // Open a DM channel then post
      const openRes = await fetch('https://slack.com/api/conversations.open', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ users: userId }),
      });
      const openData = await openRes.json() as { ok: boolean; channel?: { id: string } };
      if (!openData.ok || !openData.channel?.id) return;
      await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: openData.channel.id, text }),
      });
    },
  };
}

/** Send an urgent-assignment DM immediately when an item is assigned with urgency='urgent' */
export async function sendUrgentAssignmentDM(
  handlerEmail: string,
  item: { id: number; subject?: string | null; category?: string | null; responseDueDate?: string | null },
  slack: SlackDMFn,
): Promise<void> {
  const userId = await slack.lookupByEmail(handlerEmail);
  if (!userId) return;
  const due = item.responseDueDate ? ` Response due: *${item.responseDueDate}*` : '';
  const text = [
    `🚨 *Urgent mail item assigned to you*`,
    `*Item #${item.id}* — ${item.subject ?? '(no subject)'}`,
    `Category: ${item.category ?? 'unknown'}${due}`,
    `View it in the Mailroom.`,
  ].join('\n');
  await slack.sendDM(userId, text);
}

// ─── THROTTLE: don't re-notify within this many hours ────────────────────────
const REMINDER_THROTTLE_HOURS = 24;

// ─── mailReminders ────────────────────────────────────────────────────────────

export interface MailRemindersResult {
  notified: number;
  skipped: number;
  errors: string[];
}

export interface MailReminderRunOptions {
  /** Restricts a run to known items for deterministic tests; production leaves this unset. */
  itemIds?: number[];
}

export async function resolveReminderSlackUserId(
  item: { mailbot_slack_id?: string | null; handler_email?: string | null },
  slack: SlackDMFn,
): Promise<string | null> {
  if (item.mailbot_slack_id?.trim()) return item.mailbot_slack_id;
  return item.handler_email ? slack.lookupByEmail(item.handler_email) : null;
}

export async function runMailReminders(
  conn: mysql.Connection,
  slack: SlackDMFn,
  options: MailReminderRunOptions = {},
): Promise<MailRemindersResult> {
  const result: MailRemindersResult = { notified: 0, skipped: 0, errors: [] };
  const now = new Date();
  const throttleCutoff = new Date(now.getTime() - REMINDER_THROTTLE_HOURS * 3600 * 1000);
  const itemIds = options.itemIds?.filter(Number.isInteger) ?? [];
  const itemIdFilter = itemIds.length > 0
    ? ` AND mi.id IN (${itemIds.map(() => '?').join(', ')})`
    : '';

  // Select missed review deadlines, explicit reminders, or demand deadlines.
  const [items] = await conn.execute<any[]>(
    `SELECT mi.id, mi.assigned_handler_id, mi.due_at, mi.remind_at,
            mi.last_reminded_at, mi.subject, mi.category, mi.response_due_date, mi.is_demand, mi.urgency,
            mi.resolution_outcome,
            h.email AS handler_email, h.name AS handler_name,
            (
              SELECT mba.slack_id
              FROM mail_bot_agents mba
              WHERE mba.is_active = 1
                AND LOWER(REPLACE(SUBSTRING_INDEX(mba.name, ' ', 1), 'giovanni', 'geovanni')) =
                    LOWER(SUBSTRING_INDEX(h.name, ' ', 1))
              ORDER BY mba.id ASC
              LIMIT 1
            ) AS mailbot_slack_id
     FROM mail_items mi
     JOIN handlers h ON h.id = mi.assigned_handler_id
     WHERE mi.status IN ('assigned', 'escalated')
       AND mi.resolved_at IS NULL
       AND (
         (mi.due_at IS NOT NULL AND mi.due_at < ?)
         OR
         (mi.remind_at IS NOT NULL AND mi.remind_at <= ?)
         OR
         (mi.is_demand = 1 AND mi.response_due_date IS NOT NULL AND DATE(mi.response_due_date) <= DATE(?))
         OR
         mi.urgency = 'urgent'
       )
       AND (mi.last_reminded_at IS NULL OR mi.last_reminded_at < ?)
       ${itemIdFilter}
     ORDER BY mi.due_at ASC
     LIMIT 100`,
    [now, now, now, throttleCutoff, ...itemIds]
  );

  for (const item of items) {
    try {
      const userId = await resolveReminderSlackUserId(item, slack);
      if (!userId) {
        result.errors.push(`No Slack user for ${item.handler_email}`);
        result.skipped++;
        continue;
      }

      const overdue = item.due_at && new Date(item.due_at) < now;
      const reminderDue = item.remind_at && new Date(item.remind_at) <= now;
      const demandDue = item.is_demand === 1 && item.response_due_date && new Date(`${item.response_due_date}T23:59:59`) <= now;
      const urgentAlarm = item.urgency === 'urgent';
      const due = item.response_due_date ? ` Demand deadline: *${item.response_due_date}*` : '';
      const prefix = demandDue
        ? '🚨 *Demand deadline reached — record settled or denied outcome*'
        : urgentAlarm ? '🚨 *Urgent Mailroom alarm — immediate review required*'
        : overdue ? '⏰ *Mail review overdue*' : '🔔 *Mailroom reminder*';
      const text = [
        prefix,
        `*Item #${item.id}* — ${item.subject ?? '(no subject)'}`,
        `Category: ${item.category ?? 'unknown'}${due}`,
        `View it in the Mailroom.`,
      ].join('\n');

      await slack.sendDM(userId, text);
      await conn.execute(
        'UPDATE mail_items SET last_reminded_at = ? WHERE id = ?',
        [now, item.id]
      );
      result.notified++;
    } catch (e) {
      result.errors.push(`item ${item.id}: ${String(e)}`);
    }
  }

  return result;
}

export async function mailRemindersHandler(req: Request, res: Response): Promise<void> {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  try {
    const token = process.env.SLACK_BOT_TOKEN ?? '';
    const slack = buildRealSlackDM(token);
    const result = await runMailReminders(conn, slack);
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  } finally {
    await conn.end();
  }
}

// ─── mailProcess ──────────────────────────────────────────────────────────────

export async function mailProcessHandler(req: Request, res: Response): Promise<void> {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  try {
    // This scheduled callback is established and healthy. Keep one small source
    // intake pass here as a reliable fallback when a source-specific Heartbeat is
    // delayed by the platform. Every operation is intentionally capped at one
    // source record so the combined request remains well within the deadline.
    const sourceRecovery: Record<string, unknown> = {};
    try {
      const gmail = buildRealGmailFetch(conn);
      sourceRecovery.gmailIngest = await ingestGmail(conn, gmail, 'claims@drivewhip.com', 1);
      sourceRecovery.gmailAttachmentRecovery = await recoverStaleGmailAttachments(conn, 1);
      sourceRecovery.slackIngest = await runBoundedSlackIngest(conn, 1);
    } catch (sourceRecoveryError) {
      sourceRecovery.error = sourceRecoveryError instanceof Error
        ? sourceRecoveryError.message
        : String(sourceRecoveryError);
    }

    // Select unprocessed items (category IS NULL, status='new')
    const [items] = await conn.execute<any[]>(
      `SELECT mi.id, mi.external_id, mi.subject, mi.body_text, mi.from_email, mi.source, mi.received_at,
              mi.slack_channel_id, mi.slack_message_ts,
              GROUP_CONCAT(mif.filename SEPARATOR ', ') AS attachment_names,
              GROUP_CONCAT(CONCAT(COALESCE(mif.content_type, ''), ':::', mif.storage_key, ':::', COALESCE(mif.slack_file_id, ''), ':::', COALESCE(mif.filename, '')) SEPARATOR '|||') AS file_entries
       FROM mail_items mi
       LEFT JOIN mail_item_files mif ON mif.item_id = mi.id
       WHERE mi.category IS NULL AND mi.status = 'new'
       GROUP BY mi.id
       ORDER BY mi.received_at ASC
       LIMIT 2`
    );

    const readMailContent = await createMailContentReader(conn);
    let processed = 0, errors = 0;
    for (const item of items) {
      try {
        const content = await readMailContent(
          item.source,
          item.external_id,
          item.body_text,
          parseMailContentFiles(item.file_entries),
        );
        if (!content.hasReadableContent) {
          await conn.execute(
            `UPDATE mail_items
             SET needs_review=1,
                 reason=COALESCE(NULLIF(reason, ''), 'Awaiting readable email body or attachment content before assignment')
             WHERE id=?`,
            [item.id],
          );
          continue;
        }
        const classification = await classify({
          subject: item.subject ?? undefined,
          bodyText: content.indexedBody,
          receivedAt: item.received_at,
          attachmentNames: item.attachment_names
            ? item.attachment_names.split(', ').filter(Boolean)
            : undefined,
        });

        // Route
        const patch = await route(conn, classification, { sourceText: content.indexedBody });

        // Apply patch to mail_items
        await conn.execute(
          `UPDATE mail_items SET
             category = ?, confidence = ?, is_demand = ?, is_medical_bill = ?, needs_review = ?,
             claim_number = ?, from_name = ?, sender_org = ?, adverse_carrier = ?,
             claimant_name = ?, date_of_loss = ?, requested_action = ?,
             urgency = ?, reason = ?, demand_date = ?, response_due_date = ?,
             assigned_team_id = ?, assigned_handler_id = ?, status = ?,
             assigned_at = ?, due_at = ?,
             initial_category = ?, initial_handler_id = ?, initial_confidence = ?,
             summary_note = ?, subject = ?, body_text = ?
           WHERE id = ?`,
          [
            patch.category, patch.confidence, patch.isDemand, patch.isMedicalBill, patch.needsReview,
            patch.claimNumber, patch.fromName, patch.senderOrg, patch.adverseCarrier,
            patch.claimantName, patch.dateOfLoss, patch.requestedAction,
            patch.urgency, patch.reason, patch.demandDate, patch.responseDueDate,
            patch.assignedTeamId, patch.assignedHandlerId, patch.status,
            patch.assignedAt, patch.dueAt,
            patch.initialCategory, patch.initialHandlerId, patch.initialConfidence,
            buildMailSummary(classification), buildAiSubject(classification, item.subject ?? null), content.indexedBody,
            item.id,
          ]
        );
        if (patch.assignedHandlerId) {
          const sourceResult = await markAssignedMailSource(conn, {
            id: item.id,
            source: item.source,
            externalId: item.external_id,
            slackChannelId: item.slack_channel_id,
            slackMessageTs: item.slack_message_ts,
          });
          if (sourceResult.errors.length) {
            console.warn(`[mailProcess] source marking failed for ${item.id}: ${sourceResult.errors.join('; ')}`);
          }
        }

        // Append routing history
        for (const h of patch.historyActions) {
          await conn.execute(
            `INSERT INTO mail_routing_history (item_id, action, to_handler_id, reason)
             VALUES (?, ?, ?, ?)`,
            [item.id, h.action, h.toHandlerId ?? null, h.reason]
          );
        }

        // Mailroom routing is intentionally internal-only. Slack is reserved for
        // user-initiated Mail Bot operations and overdue reminders, not assignments.

        processed++;
      } catch (e) {
        console.error(`[mailProcess] item ${item.id} failed:`, e);
        errors++;
      }
    }

    const contentRefresh = await refreshIncompleteMailContent(conn, 2);
    res.json({ ok: true, processed, errors, total: items.length, contentRefresh, sourceRecovery });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  } finally {
    await conn.end();
  }
}

// ─── mailQaWeekly (stub — accuracy computation is phase-3) ───────────────────

export async function mailQaWeeklyHandler(req: Request, res: Response): Promise<void> {
  // Stub: will compute routing accuracy, SLA %, backlog, overdue buckets in phase-3
  res.json({ ok: true, message: 'mailQaWeekly stub — not yet implemented (phase-3)' });
}

// ─── mailIngestGmail ──────────────────────────────────────────────────────────
export async function mailIngestGmailHandler(req: Request, res: Response): Promise<void> {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  try {
    const gmail = buildRealGmailFetch(conn);
    const result = await ingestGmail(conn, gmail, 'claims@drivewhip.com', 1);
    const attachmentRecovery = await recoverStaleGmailAttachments(conn, 1);
    // This callback has an established, healthy Heartbeat delivery path. Pair a
    // small Slack batch with it so Claims Mail recovery continues even if a newly
    // created standalone callback is temporarily unavailable at the platform edge.
    const slackIngest = await runBoundedSlackIngest(conn, 1);
    res.json({ ok: true, ...result, attachmentRecovery, slackIngest });
  } catch (e) {
    console.error('[mailIngestGmail] error:', e);
    res.status(500).json({ ok: false, error: String(e) });
  } finally {
    await conn.end();
  }
}

// ─── mailIngestSlack ──────────────────────────────────────────────────────────

/**
 * Bounded Claims Mail pull for the scheduled worker. It enumerates the channel
 * inventory, then downloads at most eight files (four oldest and four newest)
 * that are new, pre-reviewed, or still missing their stored attachment. This
 * prevents a browser-triggered request from being held open by historical files.
 */
export interface MailIngestSlackResult {
  inserted: number;
  skipped: number;
  resolved: number;
  totalFiles: number;
  selected: number;
  errors: string[];
}

export async function runBoundedSlackIngest(
  conn: mysql.Connection,
  limit = 8,
): Promise<MailIngestSlackResult> {
  const result: MailIngestSlackResult = { inserted: 0, skipped: 0, resolved: 0, totalFiles: 0, selected: 0, errors: [] };
  try {
    let slackToken = process.env.SLACK_BOT_TOKEN ?? '';
    let channelId = 'C07R60KAC2C';
    const [[botConfig]] = await conn.execute<any[]>(
      'SELECT slack_bot_token, claims_mail_channel_id FROM mail_bot_config LIMIT 1',
    );
    if (botConfig?.slack_bot_token) slackToken = botConfig.slack_bot_token;
    if (botConfig?.claims_mail_channel_id) channelId = botConfig.claims_mail_channel_id;
    if (!slackToken) {
      result.errors.push('Slack bot token is not configured');
      return result;
    }

    const [[reviewedSetting]] = await conn.execute<any[]>(
      "SELECT value FROM mail_settings WHERE `key`='reviewed_emoji'",
    );
    const reviewedEmojis = Array.from(new Set(['white_check_mark', 'eyes', 'heavy_check_mark', reviewedSetting?.value ?? 'white_check_mark']));
    const [knownRows] = await conn.execute<any[]>(
      `SELECT mi.id, mi.external_id, mi.status, COUNT(mif.id) AS file_count
       FROM mail_items mi
       LEFT JOIN mail_item_files mif ON mif.item_id=mi.id
       WHERE mi.source='mail'
       GROUP BY mi.id, mi.external_id, mi.status`,
    );
    const knownByFileId = new Map(knownRows.map(row => [String(row.external_id), row]));

    // Keep every run well inside Heartbeat’s two-minute request ceiling. The first
    // page clears newest unreviewed mail while the final page clears the oldest
    // backlog, matching the required split strategy without re-listing all history.
    const allFiles: any[] = [];
    const pagesToFetch = [1];
    for (let pageIndex = 0; pageIndex < pagesToFetch.length; pageIndex++) {
      const page = pagesToFetch[pageIndex];
      const params = new URLSearchParams({ channel: channelId, count: '100', page: String(page), types: 'all' });
      const response = await fetch(`https://slack.com/api/files.list?${params}`, { headers: { Authorization: `Bearer ${slackToken}` } });
      const raw = await response.text();
      let payload: { ok?: boolean; files?: any[]; paging?: { pages?: number } };
      try {
        payload = JSON.parse(raw);
      } catch {
        result.errors.push(`files.list page ${page} returned non-JSON HTTP ${response.status}`);
        break;
      }
      if (!payload.ok) {
        result.errors.push(`files.list page ${page} failed: ${raw.slice(0, 220)}`);
        break;
      }
      allFiles.push(...(payload.files ?? []));
      const lastPage = payload.paging?.pages ?? 1;
      if (page === 1 && lastPage > 1) pagesToFetch.push(lastPage);
    }

    // Claims Mail frequently starts with one mail/fax post and adds supporting
    // estimates, photographs, or correspondence in its reply thread. Inspect a
    // small, newest-first set of active threads on each pass; this adds coverage
    // without reverting to an unbounded channel-history scan.
    try {
      const historyParams = new URLSearchParams({ channel: channelId, limit: '100' });
      const historyResponse = await fetch(`https://slack.com/api/conversations.history?${historyParams}`, {
        headers: { Authorization: `Bearer ${slackToken}` },
      });
      const historyText = await historyResponse.text();
      const history = JSON.parse(historyText) as { ok?: boolean; messages?: any[] };
      if (!history.ok) {
        result.errors.push(`conversations.history failed: ${historyText.slice(0, 220)}`);
      } else {
        const roots = (history.messages ?? [])
          .filter((message: any) => Number(message.reply_count ?? 0) > 0 && message.ts)
          .slice(0, Math.max(1, Math.min(4, limit)));
        for (const root of roots) {
          const replyParams = new URLSearchParams({ channel: channelId, ts: String(root.ts), limit: '100' });
          const replyResponse = await fetch(`https://slack.com/api/conversations.replies?${replyParams}`, {
            headers: { Authorization: `Bearer ${slackToken}` },
          });
          const replyText = await replyResponse.text();
          let thread: { ok?: boolean; messages?: any[] };
          try {
            thread = JSON.parse(replyText) as { ok?: boolean; messages?: any[] };
          } catch {
            result.errors.push(`conversations.replies ${root.ts} returned non-JSON HTTP ${replyResponse.status}`);
            continue;
          }
          if (!thread.ok) {
            result.errors.push(`conversations.replies ${root.ts} failed: ${replyText.slice(0, 220)}`);
            continue;
          }
          for (const reply of (thread.messages ?? []).filter((message: any) => message.ts !== root.ts)) {
            for (const file of reply.files ?? []) {
              if (file?.id) allFiles.push(buildThreadReplyFileCandidate(root, reply, file, channelId));
            }
          }
        }
      }
    } catch (threadError) {
      result.errors.push(`thread attachment discovery failed: ${String(threadError)}`);
    }
    result.totalFiles = allFiles.length;

    const candidates = allFiles.filter(file => {
      if (!file?.id) return false;
      const known = knownByFileId.get(String(file.id));
      return !known || Number(known.file_count ?? 0) === 0 || fileHasReviewedReaction(file, reviewedEmojis);
    });
    const slack = buildRealSlackFetch(slackToken);
    const directRecovery = knownRows
      .filter(row => Number(row.file_count ?? 0) === 0)
      .sort((a, b) => Number(a.id) - Number(b.id))
      .slice(0, Math.max(1, Math.floor(limit / 2)));
    const recoveredFiles = await Promise.all(directRecovery.map(async row => {
      const file = await slack.getFileInfo(String(row.external_id));
      return file ? {
        id: String(row.external_id),
        name: file.filename,
        mimetype: file.mimeType,
        url_private_download: file.urlPrivateDownload,
        timestamp: file.receivedAt ? Math.floor(file.receivedAt.getTime() / 1000) : undefined,
        shares: { public: { [channelId]: [{ ts: file.messageTs }] } },
      } : null;
    }));
    const listedWork = selectBalancedSlackBatch(candidates, Math.max(1, limit - recoveredFiles.filter(Boolean).length));
    const work = Array.from(new Map(
      [...recoveredFiles.filter(Boolean), ...listedWork].map(file => [String((file as any).id), file])
    ).values()) as any[];
    result.selected = work.length;
    for (const file of work) {
      const shares = sharesForClaimsChannel(file, channelId);
      const messageTs = file.__mailroomMessageTs ?? shares[0]?.ts ?? String(file.timestamp ?? file.id);
      const combinedReactions = [
        ...(file.reactions ?? []),
        ...(file.__mailroomReplyReactions ?? []),
        ...(file.__mailroomRootReactions ?? []),
      ];
      const outcome = await handleSlackFileEvent(conn, {
        fileId: String(file.id),
        channelId,
        messageTs,
        filename: file.name ?? file.title,
        mimeType: file.mimetype,
        urlPrivateDownload: file.url_private_download,
        reactions: combinedReactions,
        receivedAt: file.timestamp ? new Date(Number(file.timestamp) * 1000) : undefined,
      }, slack, { reviewedEmoji: reviewedSetting?.value ?? 'white_check_mark', reviewedEmojis, addBotMarker: false });
      if (outcome.action === 'inserted') result.inserted++;
      else if (outcome.action === 'pre_reviewed') result.resolved++;
      else if (outcome.action === 'error') result.errors.push(outcome.error ?? `Unknown Slack ingest error for ${file.id}`);
      else result.skipped++;
    }
    return result;
  } catch (error) {
    result.errors.push(String(error));
    return result;
  }
}

export async function mailIngestSlackHandler(req: Request, res: Response): Promise<void> {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  try {
    const result = await runBoundedSlackIngest(conn);
    res.status(result.errors.length ? 207 : 200).json({ ok: result.errors.length === 0, ...result });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) });
  } finally {
    await conn.end();
  }
}
