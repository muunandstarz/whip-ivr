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

export async function runMailReminders(
  conn: mysql.Connection,
  slack: SlackDMFn,
): Promise<MailRemindersResult> {
  const result: MailRemindersResult = { notified: 0, skipped: 0, errors: [] };
  const now = new Date();
  const throttleCutoff = new Date(now.getTime() - REMINDER_THROTTLE_HOURS * 3600 * 1000);

  // Select overdue items (dueAt < NOW()) OR remindAt-due items, unresolved, assigned
  const [items] = await conn.execute<any[]>(
    `SELECT mi.id, mi.assigned_handler_id, mi.due_at, mi.remind_at,
            mi.last_reminded_at, mi.subject, mi.category, mi.response_due_date,
            h.email AS handler_email, h.name AS handler_name
     FROM mail_items mi
     JOIN handlers h ON h.id = mi.assigned_handler_id
     WHERE mi.status IN ('assigned', 'escalated')
       AND mi.resolved_at IS NULL
       AND (
         (mi.due_at IS NOT NULL AND mi.due_at < ?)
         OR
         (mi.remind_at IS NOT NULL AND mi.remind_at <= ?)
       )
       AND (mi.last_reminded_at IS NULL OR mi.last_reminded_at < ?)
     ORDER BY mi.due_at ASC
     LIMIT 100`,
    [now, now, throttleCutoff]
  );

  for (const item of items) {
    try {
      const userId = await slack.lookupByEmail(item.handler_email);
      if (!userId) {
        result.errors.push(`No Slack user for ${item.handler_email}`);
        result.skipped++;
        continue;
      }

      const overdue = item.due_at && new Date(item.due_at) < now;
      const reminderDue = item.remind_at && new Date(item.remind_at) <= now;
      const due = item.response_due_date ? ` Response due: *${item.response_due_date}*` : '';
      const prefix = overdue ? '⏰ *Overdue mail item*' : '🔔 *Reminder: mail item due*';
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
    // Select unprocessed items (category IS NULL, status='new')
    const [items] = await conn.execute<any[]>(
      `SELECT mi.id, mi.subject, mi.body_text, mi.from_email, mi.source,
              mi.slack_channel_id, mi.slack_message_ts,
              GROUP_CONCAT(mif.filename SEPARATOR ', ') AS attachment_names
       FROM mail_items mi
       LEFT JOIN mail_item_files mif ON mif.item_id = mi.id
       WHERE mi.category IS NULL AND mi.status = 'new'
       GROUP BY mi.id
       ORDER BY mi.received_at ASC
       LIMIT 20`
    );

    let processed = 0, errors = 0;
    for (const item of items) {
      try {
        // Classify
        const classification = await classify({
          subject: item.subject ?? undefined,
          bodyText: item.body_text ?? undefined,
          attachmentNames: item.attachment_names
            ? item.attachment_names.split(', ').filter(Boolean)
            : undefined,
        });

        // Route
        const patch = await route(conn, classification);

        // Apply patch to mail_items
        await conn.execute(
          `UPDATE mail_items SET
             category = ?, confidence = ?, is_demand = ?, needs_review = ?,
             claim_number = ?, from_name = ?, sender_org = ?, adverse_carrier = ?,
             claimant_name = ?, date_of_loss = ?, requested_action = ?,
             urgency = ?, reason = ?, demand_date = ?, response_due_date = ?,
             assigned_team_id = ?, assigned_handler_id = ?, status = ?,
             assigned_at = ?, due_at = ?,
             initial_category = ?, initial_handler_id = ?, initial_confidence = ?
           WHERE id = ?`,
          [
            patch.category, patch.confidence, patch.isDemand, patch.needsReview,
            patch.claimNumber, patch.fromName, patch.senderOrg, patch.adverseCarrier,
            patch.claimantName, patch.dateOfLoss, patch.requestedAction,
            patch.urgency, patch.reason, patch.demandDate, patch.responseDueDate,
            patch.assignedTeamId, patch.assignedHandlerId, patch.status,
            patch.assignedAt, patch.dueAt,
            patch.initialCategory, patch.initialHandlerId, patch.initialConfidence,
            item.id,
          ]
        );

        // Append routing history
        for (const h of patch.historyActions) {
          await conn.execute(
            `INSERT INTO mail_routing_history (item_id, action, to_handler_id, reason)
             VALUES (?, ?, ?, ?)`,
            [item.id, h.action, h.toHandlerId ?? null, h.reason]
          );
        }

        // Send urgent DM if urgency='urgent' and handler is assigned
        if (patch.urgency === 'urgent' && patch.assignedHandlerId) {
          const [[handlerRow]] = await conn.execute<any[]>(
            'SELECT email FROM handlers WHERE id = ?', [patch.assignedHandlerId]
          );
          if (handlerRow?.email) {
            const token = process.env.SLACK_BOT_TOKEN ?? '';
            const slack = buildRealSlackDM(token);
            await sendUrgentAssignmentDM(handlerRow.email, {
              id: item.id,
              subject: item.subject,
              category: patch.category,
              responseDueDate: patch.responseDueDate,
            }, slack).catch(e => console.error('[mailProcess] urgent DM failed:', e));
          }
        }

        processed++;
      } catch (e) {
        console.error(`[mailProcess] item ${item.id} failed:`, e);
        errors++;
      }
    }

    res.json({ ok: true, processed, errors, total: items.length });
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
    const result = await ingestGmail(conn, gmail);
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('[mailIngestGmail] error:', e);
    res.status(500).json({ ok: false, error: String(e) });
  } finally {
    await conn.end();
  }
}
