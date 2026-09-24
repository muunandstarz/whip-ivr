import { getDb } from './db';
import { notifyOwner } from './_core/notification';

export type TicketType = 'bug' | 'issue' | 'suggestion' | 'other';
export type TicketStatus = 'new' | 'triaged' | 'in_progress' | 'ready_for_approval' | 'approved_for_production' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

export type TicketViewer = {
  userId: number;
  name: string;
  email?: string | null;
  handlerId?: number | null;
  isAdmin: boolean;
};

type SqlClient = {
  query: (query: string, params?: unknown[]) => Promise<[any[], any]>;
};

async function dbClient(): Promise<SqlClient> {
  const db = await getDb();
  if (!db) throw new Error('Database unavailable');
  return (db as any).$client.promise() as SqlClient;
}

function compactText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
}

async function recordOwnerNotice(input: { ticketId: number; kind: 'new' | 'ready' | 'approved'; title: string; content: string }) {
  const client = await dbClient();
  const fields = input.kind === 'new'
    ? { delivered: 'owner_notified_at', error: 'owner_notification_error' }
    : input.kind === 'ready'
      ? { delivered: 'production_ready_notified_at', error: 'production_ready_notification_error' }
      : { delivered: 'production_approved_notified_at', error: 'production_approved_notification_error' };
  try {
    const delivered = await notifyOwner({ title: input.title, content: input.content });
    if (!delivered) {
      await client.query(`UPDATE internal_tickets SET ${fields.error}=?, updated_at=NOW() WHERE id=?`, ['Notification service did not accept the request.', input.ticketId]);
      return false;
    }
    await client.query(`UPDATE internal_tickets SET ${fields.delivered}=NOW(), ${fields.error}=NULL, updated_at=NOW() WHERE id=?`, [input.ticketId]);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await client.query(`UPDATE internal_tickets SET ${fields.error}=?, updated_at=NOW() WHERE id=?`, [compactText(message, 4_000), input.ticketId]);
    return false;
  }
}

function easternParts(value = new Date()) {
  const entries = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
    weekday: 'short',
  }).formatToParts(value);
  const part = (type: string) => entries.find((entry) => entry.type === type)?.value ?? '';
  return {
    year: Number(part('year')),
    month: Number(part('month')),
    day: Number(part('day')),
    hour: Number(part('hour')),
    minute: Number(part('minute')),
    weekday: part('weekday'),
  };
}

function easternDateKey(value = new Date()) {
  const parts = easternParts(value);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

/** Converts an Eastern calendar date to its UTC midnight boundary without a date library. */
function easternMidnightUtc(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  // 06:00 UTC always lands on the intended Eastern calendar date, including DST
  // transition dates. Its local wall-clock offset is then applied to midnight.
  const probe = new Date(Date.UTC(year, month - 1, day, 6, 0, 0));
  const local = easternParts(probe);
  const localAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, 0);
  const offset = localAsUtc - probe.getTime();
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - offset);
}

function nextEasternDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

export async function submitInternalTicket(input: {
  viewer: TicketViewer;
  ticketType: TicketType;
  title: string;
  body: string;
}) {
  const client = await dbClient();
  const [insert] = await client.query(
    `INSERT INTO internal_tickets
      (ticket_type, title, body, reporter_user_id, reporter_name, reporter_email, reporter_handler_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      input.ticketType,
      input.title.trim(),
      input.body.trim(),
      input.viewer.userId,
      input.viewer.name,
      input.viewer.email ?? null,
      input.viewer.handlerId ?? null,
    ],
  );
  const id = (insert as any).insertId as number;
  const delivered = await recordOwnerNotice({
    ticketId: id,
    kind: 'new',
    title: `New dashboard ticket #${id}: ${compactText(input.title, 100)}`,
    content: [
      `${input.ticketType.toUpperCase()} submitted by ${input.viewer.name}.`,
      compactText(input.body, 1_000),
      '',
      `Open Tickets in the Whip IVR Dashboard to triage ticket #${id}.`,
    ].join('\n'),
  });
  return { id, ownerNotified: delivered };
}

export async function listMyInternalTickets(viewer: TicketViewer, filters?: { status?: TicketStatus; ticketType?: TicketType; limit?: number; offset?: number }) {
  const client = await dbClient();
  const where = ['reporter_user_id = ?'];
  const params: unknown[] = [viewer.userId];
  if (filters?.status) { where.push('status = ?'); params.push(filters.status); }
  if (filters?.ticketType) { where.push('ticket_type = ?'); params.push(filters.ticketType); }
  const limit = Math.min(Math.max(filters?.limit ?? 100, 1), 250);
  const offset = Math.max(filters?.offset ?? 0, 0);
  const [rows] = await client.query(
    `SELECT * FROM internal_tickets WHERE ${where.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  return rows as any[];
}

export async function getInternalTicket(viewer: TicketViewer, id: number) {
  const client = await dbClient();
  const [rows] = await client.query('SELECT * FROM internal_tickets WHERE id = ? LIMIT 1', [id]);
  const ticket = (rows as any[])[0];
  if (!ticket) throw new Error('Ticket not found.');
  if (!viewer.isAdmin && ticket.reporter_user_id !== viewer.userId) throw new Error('This ticket is not available to the current user.');
  return ticket;
}

export async function listInternalTickets(viewer: TicketViewer, filters?: { status?: TicketStatus; priority?: TicketPriority; ticketType?: TicketType; search?: string; limit?: number; offset?: number }) {
  if (!viewer.isAdmin) throw new Error('Administrator access is required.');
  const client = await dbClient();
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters?.status) { where.push('status = ?'); params.push(filters.status); }
  if (filters?.priority) { where.push('priority = ?'); params.push(filters.priority); }
  if (filters?.ticketType) { where.push('ticket_type = ?'); params.push(filters.ticketType); }
  if (filters?.search?.trim()) {
    where.push('(title LIKE ? OR reporter_name LIKE ? OR reporter_email LIKE ?)');
    const like = `%${filters.search.trim()}%`;
    params.push(like, like, like);
  }
  const limit = Math.min(Math.max(filters?.limit ?? 250, 1), 500);
  const offset = Math.max(filters?.offset ?? 0, 0);
  const [rows] = await client.query(
    `SELECT * FROM internal_tickets ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY FIELD(status, 'new', 'triaged', 'in_progress', 'resolved', 'closed'), created_at DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  return rows as any[];
}

export async function triageInternalTicket(input: {
  viewer: TicketViewer;
  id: number;
  status: TicketStatus;
  priority: TicketPriority;
  triageNote?: string | null;
}) {
  if (!input.viewer.isAdmin) throw new Error('Administrator access is required.');
  const ticket = await getInternalTicket(input.viewer, input.id);
  if (input.status === 'approved_for_production') {
    throw new Error('Use the dedicated production approval action after a ticket is ready for approval.');
  }
  if (input.status === 'ready_for_approval' && !input.triageNote?.trim()) {
    throw new Error('Add a concise implementation summary before requesting production approval.');
  }
  const client = await dbClient();
  const isClosed = input.status === 'resolved' || input.status === 'closed';
  const newlyReady = input.status === 'ready_for_approval' && ticket.status !== 'ready_for_approval';
  await client.query(
    `UPDATE internal_tickets
        SET status=?, priority=?, triage_note=?, triaged_by_user_id=?, triaged_by_name=?, triaged_at=NOW(),
            production_ready_at=CASE WHEN ? THEN NOW() ELSE production_ready_at END,
            production_ready_by_user_id=CASE WHEN ? THEN ? ELSE production_ready_by_user_id END,
            production_ready_by_name=CASE WHEN ? THEN ? ELSE production_ready_by_name END,
            resolved_at=CASE WHEN ? THEN COALESCE(resolved_at, NOW()) ELSE NULL END,
            updated_at=NOW()
      WHERE id=?`,
    [input.status, input.priority, input.triageNote?.trim() || null, input.viewer.userId, input.viewer.name,
      newlyReady, newlyReady, input.viewer.userId, newlyReady, input.viewer.name, isClosed, ticket.id],
  );
  if (newlyReady) {
    await recordOwnerNotice({
      ticketId: ticket.id,
      kind: 'ready',
      title: `Production approval requested: ticket #${ticket.id}`,
      content: [
        compactText(ticket.title, 160),
        input.triageNote!.trim(),
        '',
        'Review the ticket in the Whip IVR Dashboard and use Approve for production when it is ready to proceed.',
      ].join('\n'),
    });
  }
  return getInternalTicket(input.viewer, input.id);
}

export async function approveInternalTicketForProduction(input: { viewer: TicketViewer; id: number }) {
  if (!input.viewer.isAdmin) throw new Error('Administrator access is required.');
  const ticket = await getInternalTicket(input.viewer, input.id);
  if (ticket.status !== 'ready_for_approval') throw new Error('Only tickets marked ready for approval can be approved for production.');
  const client = await dbClient();
  await client.query(
    `UPDATE internal_tickets
        SET status='approved_for_production', production_approved_at=NOW(), production_approved_by_user_id=?, production_approved_by_name=?, updated_at=NOW()
      WHERE id=? AND status='ready_for_approval'`,
    [input.viewer.userId, input.viewer.name, ticket.id],
  );
  await recordOwnerNotice({
    ticketId: ticket.id,
    kind: 'approved',
    title: `Production approved: ticket #${ticket.id}`,
    content: [
      compactText(ticket.title, 160),
      'The production decision is recorded. The ticket remains visible until implementation is completed and resolved.',
    ].join('\n'),
  });
  return getInternalTicket(input.viewer, input.id);
}

export async function getTicketDigestStatus(viewer: TicketViewer) {
  if (!viewer.isAdmin) throw new Error('Administrator access is required.');
  const client = await dbClient();
  const [rows] = await client.query('SELECT * FROM ticket_digest_automation ORDER BY id ASC LIMIT 1');
  return (rows as any[])[0] ?? null;
}

export async function buildTicketDigestForEasternDate(dateKey = easternDateKey()) {
  const client = await dbClient();
  const startsAt = easternMidnightUtc(dateKey);
  const endsAt = easternMidnightUtc(nextEasternDateKey(dateKey));
  const [rows] = await client.query(
    `SELECT id, ticket_type, title, reporter_name, created_at
       FROM internal_tickets
      WHERE created_at >= ? AND created_at < ?
      ORDER BY created_at ASC, id ASC`,
    [startsAt, endsAt],
  );
  const tickets = rows as any[];
  const byType = tickets.reduce((counts: Record<string, number>, ticket) => {
    counts[ticket.ticket_type] = (counts[ticket.ticket_type] ?? 0) + 1;
    return counts;
  }, {});
  const heading = `${tickets.length} new internal ticket${tickets.length === 1 ? '' : 's'} for ${dateKey}`;
  const typeSummary = Object.entries(byType).map(([type, count]) => `${count} ${type}`).join(' · ') || 'No submissions';
  const lines = tickets.slice(0, 40).map((ticket) =>
    `#${ticket.id} · ${ticket.ticket_type} · ${compactText(ticket.title, 110)} — ${ticket.reporter_name || 'Whip team member'}`,
  );
  return {
    dateKey,
    startsAt,
    endsAt,
    tickets,
    title: `Whip dashboard tickets: ${heading}`,
    content: [`${typeSummary}.`, '', ...lines, tickets.length > 40 ? `…and ${tickets.length - 40} additional ticket(s) in the Tickets dashboard.` : '', '', 'Open Tickets in the Whip IVR Dashboard to review and triage.'].filter(Boolean).join('\n'),
  };
}

export async function publishDailyTicketDigest(input?: { now?: Date; expectedTaskUid?: string | null }) {
  const now = input?.now ?? new Date();
  const local = easternParts(now);
  const dateKey = easternDateKey(now);
  const client = await dbClient();
  const [rows] = await client.query('SELECT * FROM ticket_digest_automation ORDER BY id ASC LIMIT 1');
  const automation = (rows as any[])[0];
  if (!automation || !automation.is_enabled) return { ok: true, skipped: 'disabled-or-orphaned', dateKey };
  if (input?.expectedTaskUid && automation.schedule_cron_task_uid !== input.expectedTaskUid) return { ok: true, skipped: 'task-mismatch', dateKey };
  // The Heartbeat fires hourly at :30. This guard keeps the feature DST-safe
  // while delivering at exactly 5:30 PM in America/New_York.
  if (!['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(local.weekday) || local.hour !== 17 || local.minute !== 30) {
    return { ok: true, skipped: 'outside-eastern-digest-window', dateKey };
  }
  if (automation.last_digest_for_date === dateKey) return { ok: true, skipped: 'already-delivered', dateKey };

  const digest = await buildTicketDigestForEasternDate(dateKey);
  try {
    const delivered = await notifyOwner({ title: digest.title, content: digest.content });
    if (!delivered) throw new Error('Owner notification service did not accept the ticket digest.');
    await client.query(
      'UPDATE ticket_digest_automation SET last_digest_for_date=?, last_run_at=NOW(), last_run_error=NULL, updated_at=NOW() WHERE id=?',
      [dateKey, automation.id],
    );
    return { ok: true, delivered: true, dateKey, ticketCount: digest.tickets.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await client.query('UPDATE ticket_digest_automation SET last_run_at=NOW(), last_run_error=?, updated_at=NOW() WHERE id=?', [message, automation.id]);
    throw error;
  }
}

export const ticketDigestTestUtils = { easternDateKey, easternMidnightUtc, easternParts, nextEasternDateKey };
