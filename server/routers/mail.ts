/**
 * mail tRPC router — Claims Mail Triage (Slice 4)
 *
 * handlerProcedure = protectedProcedure + ctx.user.handlerProfileId != null
 * adminProcedure   = protectedProcedure + ctx.user.role === 'admin'
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, adminProcedure, router } from '../_core/trpc.js';
import { getDb } from '../db.js';
import {
  mailItems, mailItemFiles, mailItemNotes, mailRoutingHistory,
} from '../../drizzle/schema.js';
import { eq, and, or, inArray, isNull, isNotNull, lt, desc, asc, sql, gte, lte } from 'drizzle-orm';
import { storageGetSignedUrl, storagePut } from '../storage.js';
import { createHeartbeatJob, listHeartbeatJobs } from '../_core/heartbeat.js';
import { parse as parseCookie } from 'cookie';
import { COOKIE_NAME } from '../../shared/const.js';
import mysql from 'mysql2/promise';
import { randomUUID } from 'crypto';
import { invokeLLM } from '../_core/llm.js';

// ─── Shared middleware ────────────────────────────────────────────────────────

const handlerProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (!ctx.user.handlerProfileId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Handler profile required' });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

// ─── Shared helpers ───────────────────────────────────────────────────────────

async function requireItem(db: Awaited<ReturnType<typeof getDb>>, itemId: number) {
  if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
  const rows = await db.select().from(mailItems).where(eq(mailItems.id, itemId)).limit(1);
  if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND', message: `Mail item ${itemId} not found` });
  return rows[0];
}

async function appendHistory(
  db: Awaited<ReturnType<typeof getDb>>,
  itemId: number,
  action: 'classified' | 'assigned' | 'rerouted' | 'escalated' | 'resolved',
  fromHandlerId: number | null,
  toHandlerId: number | null,
  byUserId: number | null,
  reason: string | null,
) {
  if (!db) return;
  await db.insert(mailRoutingHistory).values({
    itemId, action, fromHandlerId, toHandlerId, byUserId, reason,
  });
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const mailRouter = router({

  // ── Handler procedures ────────────────────────────────────────────────────

  /** Count of items assigned to the current handler that are not yet resolved */
  myPendingCount: handlerProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { count: 0 };
    const rows = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(mailItems)
      .where(
        and(
          eq(mailItems.assignedHandlerId, ctx.user.handlerProfileId!),
          inArray(mailItems.status, ['assigned', 'escalated']),
          isNull(mailItems.resolvedAt),
        )
      );
    return { count: Number(rows[0]?.count ?? 0) };
  }),

  /** Five stat-card counts for the handler's mailroom summary strip */
  myMailroomStats: handlerProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { overdue: 0, urgent: 0, legal: 0, demands: 0, allPending: 0 };
    const hid = ctx.user.handlerProfileId!;
    const now = new Date();
    const base = and(
      eq(mailItems.assignedHandlerId, hid),
      inArray(mailItems.status, ['new', 'assigned', 'escalated']),
      isNull(mailItems.resolvedAt),
    );
    const cnt = async (extra: Parameters<typeof and>[0]) => {
      const r = await db.select({ c: sql<number>`COUNT(*)` }).from(mailItems)
        .where(and(base, extra));
      return Number(r[0]?.c ?? 0);
    };
    const [overdue, urgent, legal, demands, allPending] = await Promise.all([
      cnt(lt(mailItems.dueAt, now)),
      cnt(eq(mailItems.urgency, 'urgent')),
      cnt(or(eq(mailItems.isDemand, 1), eq(mailItems.category, 'legal_or_high_risk'))!),
      cnt(eq(mailItems.isDemand, 1)),
      cnt(sql`1=1`),
    ]);
    return { overdue, urgent, legal, demands, allPending };
  }),


  /** Handler's mailroom queue with filters */
  myMailroom: handlerProcedure
    .input(z.object({
      status: z.enum(['assigned', 'escalated', 'resolved']).optional(),
      category: z.string().optional(),
      source: z.enum(['email', 'mail', 'fax', 'manual']).optional(),
      overdue: z.boolean().optional(),
      legalOnly: z.boolean().optional(),
      showResolved: z.boolean().optional(),
      sort: z.enum(['receivedAt', 'dueAt', 'urgency']).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { items: [] };
      const filters: Parameters<typeof and>[0][] = [
        eq(mailItems.assignedHandlerId, ctx.user.handlerProfileId!),
      ];
      if (!input?.showResolved) {
        filters.push(inArray(mailItems.status, ['assigned', 'escalated']));
      }
      if (input?.status) filters.push(eq(mailItems.status, input.status));
      if (input?.category) filters.push(eq(mailItems.category, input.category as any));
      if (input?.source) filters.push(eq(mailItems.source, input.source));
      if (input?.overdue) filters.push(and(lt(mailItems.dueAt, new Date()), isNull(mailItems.resolvedAt))!);
      if (input?.legalOnly) filters.push(or(eq(mailItems.isDemand, 1), eq(mailItems.category, 'legal_or_high_risk'))!);

      const rows = await db.select().from(mailItems)
        .where(and(...filters))
        .orderBy(input?.sort === 'dueAt' ? asc(mailItems.dueAt) : desc(mailItems.receivedAt))
        .limit(200);
      return { items: rows };
    }),

  /** Get a single item with presigned file URLs, notes, and history */
  getItem: handlerProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const item = await requireItem(db, input.id);

      const files = await db!.select().from(mailItemFiles)
        .where(eq(mailItemFiles.itemId, input.id));
      const signedFiles = await Promise.all(
        files.map(async f => ({
          ...f,
          signedUrl: await storageGetSignedUrl(f.storageKey).catch(() => null),
        }))
      );

      const notes = await db!.select().from(mailItemNotes)
        .where(eq(mailItemNotes.itemId, input.id))
        .orderBy(asc(mailItemNotes.createdAt));

      const history = await db!.select().from(mailRoutingHistory)
        .where(eq(mailRoutingHistory.itemId, input.id))
        .orderBy(asc(mailRoutingHistory.createdAt));

      return { item, files: signedFiles, notes, history };
    }),

  /** Reroute an item to a different handler */
  reroute: handlerProcedure
    .input(z.object({
      itemId: z.number(),
      toHandlerId: z.number(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const item = await requireItem(db, input.itemId);
      const fromHandlerId = item.assignedHandlerId;

      await db!.update(mailItems)
        .set({ assignedHandlerId: input.toHandlerId, assignedAt: new Date() })
        .where(eq(mailItems.id, input.itemId));

      await appendHistory(db, input.itemId, 'rerouted',
        fromHandlerId, input.toHandlerId, ctx.user.id, input.reason ?? null);

      return { success: true };
    }),

  /** Resolve an item */
  resolve: handlerProcedure
    .input(z.object({
      itemId: z.number(),
      note: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      await requireItem(db, input.itemId);

      await db!.update(mailItems)
        .set({
          status: 'resolved',
          resolvedAt: new Date(),
          resolvedByHandlerId: ctx.user.handlerProfileId ?? null,
        })
        .where(eq(mailItems.id, input.itemId));

      if (input.note) {
        await db!.insert(mailItemNotes).values({
          itemId: input.itemId,
          byUserId: ctx.user.id,
          note: input.note,
        });
      }

      await appendHistory(db, input.itemId, 'resolved',
        null, null, ctx.user.id, input.note ?? null);

      return { success: true };
    }),

  /** Escalate an item */
  escalate: handlerProcedure
    .input(z.object({
      itemId: z.number(),
      reason: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const item = await requireItem(db, input.itemId);

      await db!.update(mailItems)
        .set({ status: 'escalated', needsReview: 1 })
        .where(eq(mailItems.id, input.itemId));

      await appendHistory(db, input.itemId, 'escalated',
        item.assignedHandlerId, null, ctx.user.id, input.reason);

      return { success: true };
    }),

  /** Add a note to an item */
  addNote: handlerProcedure
    .input(z.object({
      itemId: z.number(),
      note: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      await requireItem(db, input.itemId);

      await db!.insert(mailItemNotes).values({
        itemId: input.itemId,
        byUserId: ctx.user.id,
        note: input.note,
      });

      return { success: true };
    }),

  /** Set a reminder datetime on an item */
  setReminder: handlerProcedure
    .input(z.object({
      itemId: z.number(),
      remindAt: z.date(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      await requireItem(db, input.itemId);

      await db!.update(mailItems)
        .set({ remindAt: input.remindAt })
        .where(eq(mailItems.id, input.itemId));

      return { success: true };
    }),

  // ── Admin procedures ──────────────────────────────────────────────────────

  /** Admin queue — all items with filters */
  adminQueue: adminProcedure
    .input(z.object({
      status: z.enum(['new', 'assigned', 'escalated', 'resolved']).optional(),
      category: z.string().optional(),
      teamId: z.number().optional(),
      handlerId: z.number().optional(),
      source: z.enum(['email', 'mail', 'fax', 'manual']).optional(),
      overdue: z.boolean().optional(),
      urgent: z.boolean().optional(),
      legalOnly: z.boolean().optional(),
      needsReview: z.boolean().optional(),
      search: z.string().optional(),
      from: z.date().optional(),
      to: z.date().optional(),
      limit: z.number().max(500).optional(),
      page: z.number().min(1).optional(),
      pageSize: z.number().min(1).max(100).optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      const filters: Parameters<typeof and>[0][] = [];
      if (input?.status) filters.push(eq(mailItems.status, input.status));
      if (input?.category) filters.push(eq(mailItems.category, input.category as any));
      if (input?.teamId) filters.push(eq(mailItems.assignedTeamId, input.teamId));
      if (input?.handlerId) filters.push(eq(mailItems.assignedHandlerId, input.handlerId));
      if (input?.source) filters.push(eq(mailItems.source, input.source));
      if (input?.overdue) filters.push(and(lt(mailItems.dueAt, new Date()), isNull(mailItems.resolvedAt))!);
      if (input?.urgent) filters.push(eq(mailItems.urgency, 'urgent'));
      if (input?.legalOnly) filters.push(or(eq(mailItems.category, 'legal_or_high_risk'), eq(mailItems.isDemand, 1))!);
      if (input?.needsReview) filters.push(eq(mailItems.needsReview, 1));
      if (input?.from) filters.push(gte(mailItems.receivedAt, input.from));
      if (input?.to) filters.push(lte(mailItems.receivedAt, input.to));
      const pageSize = input?.pageSize ?? 200;
      const page = input?.page ?? 1;
      const offset = (page - 1) * pageSize;
      const whereClause = filters.length ? and(...filters) : undefined;
      const [{ total }] = await db.select({ total: sql<number>`COUNT(*)` }).from(mailItems).where(whereClause);
      let rows = await db.select().from(mailItems)
        .where(whereClause)
        .orderBy(desc(mailItems.receivedAt))
        .limit(input?.limit ?? pageSize)
        .offset(offset);
      // Server-side search filter
      if (input?.search?.trim()) {
        const q = input.search.toLowerCase();
        rows = rows.filter(i =>
          (i.subject ?? '').toLowerCase().includes(q) ||
          (i.fromEmail ?? '').toLowerCase().includes(q) ||
          (i.fromName ?? '').toLowerCase().includes(q) ||
          (i.claimNumber ?? '').toLowerCase().includes(q)
        );
      }
      return { items: rows, total: Number(total ?? 0) };
    }),
  /** Official mail log — one row per piece with full metadata */
  log: adminProcedure
    .input(z.object({
      from: z.date().optional(),
      to: z.date().optional(),
      category: z.string().optional(),
      teamId: z.number().optional(),
      handlerId: z.number().optional(),
      status: z.string().optional(),
      source: z.enum(['email', 'mail']).optional(),
      overdue: z.boolean().optional(),
      legalOnly: z.boolean().optional(),
      limit: z.number().max(1000).optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [] };
      const filters: Parameters<typeof and>[0][] = [];
      if (input?.from) filters.push(gte(mailItems.receivedAt, input.from));
      if (input?.to) filters.push(lte(mailItems.receivedAt, input.to));
      if (input?.category) filters.push(eq(mailItems.category, input.category as any));
      if (input?.teamId) filters.push(eq(mailItems.assignedTeamId, input.teamId));
      if (input?.handlerId) filters.push(eq(mailItems.assignedHandlerId, input.handlerId));
      if (input?.status) filters.push(eq(mailItems.status, input.status as any));
      if (input?.source) filters.push(eq(mailItems.source, input.source));
      if (input?.overdue) filters.push(and(lt(mailItems.dueAt, new Date()), isNull(mailItems.resolvedAt))!);
      if (input?.legalOnly) filters.push(or(eq(mailItems.isDemand, 1), eq(mailItems.category, 'legal_or_high_risk'))!);

      const rows = await db.select().from(mailItems)
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(desc(mailItems.receivedAt))
        .limit(input?.limit ?? 500);
      return { items: rows };
    }),

  /** Legal queue — legal_or_high_risk or isDemand, sorted by responseDueDate */
  legalQueue: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { items: [] };
    const rows = await db.select().from(mailItems)
      .where(
        and(
          or(eq(mailItems.category, 'legal_or_high_risk'), eq(mailItems.isDemand, 1))!,
          inArray(mailItems.status, ['assigned', 'escalated']),
        )
      )
      .orderBy(asc(mailItems.responseDueDate), asc(mailItems.dueAt))
      .limit(200);
    return { items: rows };
  }),

  /** Reclassify an item (admin override) */
  reclassify: adminProcedure
    .input(z.object({
      itemId: z.number(),
      category: z.string(),
      toHandlerId: z.number().optional(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const item = await requireItem(db, input.itemId);

      const updates: Partial<typeof mailItems.$inferInsert> = {
        category: input.category as any,
      };
      if (input.toHandlerId !== undefined) {
        updates.assignedHandlerId = input.toHandlerId;
        updates.assignedAt = new Date();
      }
      await db!.update(mailItems).set(updates).where(eq(mailItems.id, input.itemId));

      await appendHistory(db, input.itemId, 'rerouted',
        item.assignedHandlerId,
        input.toHandlerId ?? item.assignedHandlerId,
        ctx.user.id,
        input.reason ?? 'manual reclassify');

      return { success: true };
    }),

  /** 6-card org-wide stats for the admin Mailroom header */
  adminStats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 86400000);

    const unresolved = and(
      inArray(mailItems.status, ['new', 'assigned', 'escalated']),
    );

    // All Pending
    const [allPending] = await db.select({ count: sql<number>`COUNT(*)` }).from(mailItems).where(unresolved!);
    const [allPendingYest] = await db.select({ count: sql<number>`COUNT(*)` }).from(mailItems)
      .where(and(inArray(mailItems.status, ['new', 'assigned', 'escalated']), lte(mailItems.createdAt, yesterdayStart)));

    // Overdue
    const [overdue] = await db.select({ count: sql<number>`COUNT(*)` }).from(mailItems)
      .where(and(unresolved!, lt(mailItems.dueAt, now)));
    const [overdueYest] = await db.select({ count: sql<number>`COUNT(*)` }).from(mailItems)
      .where(and(inArray(mailItems.status, ['new', 'assigned', 'escalated']), lt(mailItems.dueAt, yesterdayStart)));

    // Urgent
    const [urgent] = await db.select({ count: sql<number>`COUNT(*)` }).from(mailItems)
      .where(and(unresolved!, eq(mailItems.urgency, 'urgent')));
    const [urgentYest] = await db.select({ count: sql<number>`COUNT(*)` }).from(mailItems)
      .where(and(inArray(mailItems.status, ['new', 'assigned', 'escalated']), eq(mailItems.urgency, 'urgent'), lte(mailItems.createdAt, yesterdayStart)));

    // Legal & Demands
    const [legalDemands] = await db.select({ count: sql<number>`COUNT(*)` }).from(mailItems)
      .where(and(unresolved!, or(eq(mailItems.category, 'legal_or_high_risk'), eq(mailItems.isDemand, 1))!));
    const [legalDemYest] = await db.select({ count: sql<number>`COUNT(*)` }).from(mailItems)
      .where(and(inArray(mailItems.status, ['new', 'assigned', 'escalated']), or(eq(mailItems.category, 'legal_or_high_risk'), eq(mailItems.isDemand, 1))!, lte(mailItems.createdAt, yesterdayStart)));

    // Demands only
    const [demands] = await db.select({ count: sql<number>`COUNT(*)` }).from(mailItems)
      .where(and(unresolved!, eq(mailItems.isDemand, 1)));
    const [demandsYest] = await db.select({ count: sql<number>`COUNT(*)` }).from(mailItems)
      .where(and(inArray(mailItems.status, ['new', 'assigned', 'escalated']), eq(mailItems.isDemand, 1), lte(mailItems.createdAt, yesterdayStart)));

    // Resolved today
    const [resolvedToday] = await db.select({ count: sql<number>`COUNT(*)` }).from(mailItems)
      .where(and(eq(mailItems.status, 'resolved'), gte(mailItems.resolvedAt, todayStart)));
    const [resolvedYest] = await db.select({ count: sql<number>`COUNT(*)` }).from(mailItems)
      .where(and(eq(mailItems.status, 'resolved'), gte(mailItems.resolvedAt, yesterdayStart), lt(mailItems.resolvedAt, todayStart)));

    const delta = (today: number, yest: number) => today - yest;

    return {
      allPending: { count: Number(allPending?.count ?? 0), delta: delta(Number(allPending?.count ?? 0), Number(allPendingYest?.count ?? 0)) },
      overdue: { count: Number(overdue?.count ?? 0), delta: delta(Number(overdue?.count ?? 0), Number(overdueYest?.count ?? 0)) },
      urgent: { count: Number(urgent?.count ?? 0), delta: delta(Number(urgent?.count ?? 0), Number(urgentYest?.count ?? 0)) },
      legalDemands: { count: Number(legalDemands?.count ?? 0), delta: delta(Number(legalDemands?.count ?? 0), Number(legalDemYest?.count ?? 0)) },
      demands: { count: Number(demands?.count ?? 0), delta: delta(Number(demands?.count ?? 0), Number(demandsYest?.count ?? 0)) },
      resolvedToday: { count: Number(resolvedToday?.count ?? 0), delta: delta(Number(resolvedToday?.count ?? 0), Number(resolvedYest?.count ?? 0)) },
    };
  }),

  /** Aggregate stats for the admin dashboard */
  stats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;

    const [total] = await db.select({ count: sql<number>`COUNT(*)` }).from(mailItems);
    const [open] = await db.select({ count: sql<number>`COUNT(*)` }).from(mailItems)
      .where(inArray(mailItems.status, ['assigned', 'escalated']));
    const [resolved] = await db.select({ count: sql<number>`COUNT(*)` }).from(mailItems)
      .where(eq(mailItems.status, 'resolved'));
    const [overdue] = await db.select({ count: sql<number>`COUNT(*)` }).from(mailItems)
      .where(and(lt(mailItems.dueAt, new Date()), isNull(mailItems.resolvedAt)));
    const [legal] = await db.select({ count: sql<number>`COUNT(*)` }).from(mailItems)
      .where(or(eq(mailItems.category, 'legal_or_high_risk'), eq(mailItems.isDemand, 1))!);
    const [needsReview] = await db.select({ count: sql<number>`COUNT(*)` }).from(mailItems)
      .where(and(eq(mailItems.needsReview, 1), isNull(mailItems.resolvedAt)));

    return {
      total: Number(total?.count ?? 0),
      open: Number(open?.count ?? 0),
      resolved: Number(resolved?.count ?? 0),
      overdue: Number(overdue?.count ?? 0),
      legal: Number(legal?.count ?? 0),
      needsReview: Number(needsReview?.count ?? 0),
    };
  }),

  /** QA metrics for a date range */
  qa: adminProcedure
    .input(z.object({ from: z.date(), to: z.date() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      // Items auto-assigned in range
      const [autoAssigned] = await db.select({ count: sql<number>`COUNT(*)` }).from(mailItems)
        .where(and(
          isNotNull(mailItems.initialCategory),
          gte(mailItems.assignedAt, input.from),
          lte(mailItems.assignedAt, input.to),
        ));

      // Items where final category matches initial (no reclassify)
      const [accurate] = await db.select({ count: sql<number>`COUNT(*)` }).from(mailItems)
        .where(and(
          isNotNull(mailItems.initialCategory),
          sql`${mailItems.category} = ${mailItems.initialCategory}`,
          gte(mailItems.assignedAt, input.from),
          lte(mailItems.assignedAt, input.to),
        ));

      const autoCount = Number(autoAssigned?.count ?? 0);
      const accurateCount = Number(accurate?.count ?? 0);
      const routingAccuracy = autoCount > 0 ? Math.round((accurateCount / autoCount) * 100) : null;

      return {
        from: input.from,
        to: input.to,
        autoAssigned: autoCount,
        routingAccuracy,
      };
    }),

  /** QA snapshot trend rows */
  qaSnapshots: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { snapshots: [] };
    const { mailQaSnapshots } = await import('../../drizzle/schema.js');
    const rows = await db.select().from(mailQaSnapshots)
      .orderBy(desc(mailQaSnapshots.periodStart))
      .limit(52); // 1 year of weekly snapshots
    return { snapshots: rows };
  }),

  // ─── Cron management ───────────────────────────────────────────────────────

  /** Register all three mail Heartbeat crons (idempotent — safe to call again) */
  setupCrons: adminProcedure.mutation(async ({ ctx }) => {
    const sessionToken = parseCookie(ctx.req.headers.cookie ?? '')[COOKIE_NAME] ?? '';
    const results: Record<string, string> = {};
    const jobs = [
      { name: 'mail-ingest-gmail', cron: '0 */5 * * * *', path: '/api/scheduled/mailIngestGmail', description: 'Poll claims@ Gmail every 5 min' },
      { name: 'mail-process',      cron: '0 2/5 * * * *', path: '/api/scheduled/mailProcess',      description: 'Classify + assign new mail_items every 5 min' },
      { name: 'mail-reminders',    cron: '0 0 * * * *',   path: '/api/scheduled/mailReminders',    description: 'Send overdue/reminder DMs every hour' },
    ];
    for (const job of jobs) {
      try {
        const created = await createHeartbeatJob(job, sessionToken);
        results[job.name] = created.taskUid;
      } catch (e) {
        results[job.name] = `error: ${String(e)}`;
      }
    }
    return { ok: true, taskUids: results };
  }),

  /** List current mail cron jobs */
  listCrons: adminProcedure.query(async ({ ctx }) => {
    const sessionToken = parseCookie(ctx.req.headers.cookie ?? '')[COOKIE_NAME] ?? '';
    try {
      const jobs = await listHeartbeatJobs(sessionToken);
      const mailJobs = jobs.jobs.filter(j =>
        ['mail-ingest-gmail', 'mail-process', 'mail-reminders'].includes(j.name)
      );
      return { ok: true, jobs: mailJobs };
    } catch (e) {
      return { ok: false, jobs: [], error: String(e) };
    }
  }),

  /** Manual one-shot: ingest Gmail + process unclassified items immediately */
  triggerNow: adminProcedure.mutation(async () => {
    const conn = await mysql.createConnection(process.env.DATABASE_URL!);
    const results: Record<string, unknown> = {};
    try {
      // Step 1a: Ingest Gmail (OAuth — refresh_token from mail_settings)
      try {
        const { ingestGmail, buildRealGmailFetch } = await import('../mail/ingestGmail.js');
        const gmail = buildRealGmailFetch(conn);
        results.ingest = await ingestGmail(conn, gmail);
      } catch (ingestErr) {
        results.ingest = { skipped: true, reason: String(ingestErr) };
      }

      // Step 1b: Poll Slack #claims-mail for unreviewed file messages
      try {
        const slackToken = process.env.SLACK_BOT_TOKEN ?? '';
        const CLAIMS_MAIL_CHANNEL = 'C07R60KAC2C';
        const REVIEWED_EMOJIS = ['white_check_mark', 'eyes', 'heavy_check_mark'];
        
        if (!slackToken) {
          results.slackIngest = { skipped: true, reason: 'No SLACK_BOT_TOKEN' };
        } else {
          // Get mail_settings for reviewed_emoji
          const [[reviewedRow]] = await conn.execute<any[]>(
            "SELECT value FROM mail_settings WHERE `key` = 'reviewed_emoji'"
          );
          const reviewedEmoji = reviewedRow?.value ?? 'white_check_mark';
          const allReviewed = Array.from(new Set([...REVIEWED_EMOJIS, reviewedEmoji]));
          
          // Fetch last 200 messages from #claims-mail
          const histRes = await fetch(
            `https://slack.com/api/conversations.history?channel=${CLAIMS_MAIL_CHANNEL}&limit=200`,
            { headers: { Authorization: `Bearer ${slackToken}` } }
          );
          const histData = await histRes.json() as { ok: boolean; messages?: any[] };
          
          if (!histData.ok) {
            results.slackIngest = { skipped: true, reason: `Slack API error: ${JSON.stringify(histData)}` };
          } else {
            const messages = histData.messages ?? [];
            // Filter: has files, not already reviewed
            const unreviewed = messages.filter(m =>
              m.files && m.files.length > 0 &&
              !m.reactions?.some((r: any) => allReviewed.includes(r.name))
            );
            
            let inserted = 0, skipped = 0, errors: string[] = [];
            const { handleSlackFileEvent, buildRealSlackFetch } = await import('../mail/ingestSlack.js');
            const slackFetch = buildRealSlackFetch(slackToken);
            
            for (const msg of unreviewed) {
              for (const file of (msg.files ?? [])) {
                try {
                  const result = await handleSlackFileEvent(conn, {
                    fileId: file.id,
                    messageTs: msg.ts,
                    channelId: CLAIMS_MAIL_CHANNEL,
                    filename: file.name ?? file.title,
                    mimeType: file.mimetype,
                    urlPrivateDownload: file.url_private_download,
                    reactions: msg.reactions ?? [],
                  }, slackFetch, {
                    reviewedEmoji,
                    addBotMarker: false,
                  });
                  if (result.action === 'inserted') inserted++;
                  else skipped++;
                } catch (e) {
                  errors.push(String(e));
                }
              }
            }
            results.slackIngest = { inserted, skipped, errors, total: unreviewed.length };
          }
        }
      } catch (slackErr) {
        results.slackIngest = { skipped: true, reason: String(slackErr) };
      }
      // Step 2: Classify + assign pending items
      const { classify } = await import('../mail/classify.js');
      const { route } = await import('../mail/route.js');
      const [items] = await conn.execute<any[]>(
        `SELECT mi.id, mi.subject, mi.body_text, mi.from_email, mi.source,
                GROUP_CONCAT(mif.filename SEPARATOR ', ') AS attachment_names
         FROM mail_items mi
         LEFT JOIN mail_item_files mif ON mif.item_id = mi.id
         WHERE mi.category IS NULL AND mi.status = 'new'
         GROUP BY mi.id ORDER BY mi.received_at ASC LIMIT 20`
      );
      let processed = 0, errors = 0;
      for (const item of items) {
        try {
          const cl = await classify({ subject: item.subject ?? undefined, bodyText: item.body_text ?? undefined, attachmentNames: item.attachment_names ? item.attachment_names.split(', ').filter(Boolean) : undefined });
          const patch = await route(conn, cl);
          await conn.execute(
            `UPDATE mail_items SET category=?,confidence=?,is_demand=?,needs_review=?,claim_number=?,from_name=?,sender_org=?,adverse_carrier=?,claimant_name=?,date_of_loss=?,requested_action=?,urgency=?,reason=?,demand_date=?,response_due_date=?,assigned_team_id=?,assigned_handler_id=?,status=?,assigned_at=?,due_at=?,initial_category=?,initial_handler_id=?,initial_confidence=? WHERE id=?`,
            [patch.category,patch.confidence,patch.isDemand,patch.needsReview,patch.claimNumber,patch.fromName,patch.senderOrg,patch.adverseCarrier,patch.claimantName,patch.dateOfLoss,patch.requestedAction,patch.urgency,patch.reason,patch.demandDate,patch.responseDueDate,patch.assignedTeamId,patch.assignedHandlerId,patch.status,patch.assignedAt,patch.dueAt,patch.initialCategory,patch.initialHandlerId,patch.initialConfidence,item.id]
          );
          for (const h of patch.historyActions) {
            await conn.execute(`INSERT INTO mail_routing_history (item_id,action,to_handler_id,reason) VALUES (?,?,?,?)`, [item.id,h.action,h.toHandlerId??null,h.reason]);
          }
          processed++;
        } catch { errors++; }
      }
      results.process = { processed, errors, total: (items as any[]).length };
    } finally {
      await conn.end();
    }
    return { ok: true, results };
  }),
  // ── Feature A: attach a file to an existing item ──────────────────────────
  /** Get presigned upload URL for a mail item file — caller POSTs to /api/mail/:id/files */
  addFile: protectedProcedure
    .input(z.object({
      itemId: z.number(),
      storageKey: z.string(),
      filename: z.string(),
      contentType: z.string(),
      sizeBytes: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const item = await requireItem(db, input.itemId);
      // Permission: assigned handler or admin
      const isAdmin = ctx.user.role === 'admin';
      const isAssigned = ctx.user.handlerProfileId != null &&
        item.assignedHandlerId === ctx.user.handlerProfileId;
      if (!isAdmin && !isAssigned) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the assigned handler or an admin can attach files' });
      }
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
      const [inserted] = await db.insert(mailItemFiles).values({
        itemId: input.itemId,
        storageKey: input.storageKey,
        filename: input.filename,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
      });
      const fileId = (inserted as any).insertId;
      // Append note
      await db.insert(mailItemNotes).values({
        itemId: input.itemId,
        byUserId: ctx.user.id,
        note: `File added by ${ctx.user.name ?? ctx.user.email ?? 'user'}: ${input.filename}`,
      });
      // Append routing history
      await appendHistory(db, input.itemId, 'assigned', null, null, ctx.user.id, `File attached: ${input.filename}`);
      const signedUrl = await storageGetSignedUrl(input.storageKey).catch(() => null);
      return { ok: true, fileId, signedUrl };
    }),

  // ── Feature B: create a mail item manually ─────────────────────────────────
  /** Auto-classify a document body/filename using the existing classify() function */
  autoClassify: adminProcedure
    .input(z.object({
      subject: z.string().optional(),
      bodyText: z.string().optional(),
      attachmentNames: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      const { classify } = await import('../mail/classify.js');
      const result = await classify({
        subject: input.subject,
        bodyText: input.bodyText,
        attachmentNames: input.attachmentNames,
      });
      return result;
    }),

  /** Create a mail item manually (admin only) */
  createManualItem: adminProcedure
    .input(z.object({
      source: z.enum(['mail', 'fax', 'manual']),
      subject: z.string().min(1),
      fromName: z.string().optional(),
      fromEmail: z.string().optional(),
      claimNumber: z.string().optional(),
      category: z.enum(['injury_pip_bi', 'inbound_subro', 'existing_claim_followup', 'outbound_subro', 'total_loss', 'legal_or_high_risk', 'other_or_unclear']).optional(),
      assignedHandlerId: z.number().optional(),
      urgency: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
      receivedAt: z.string().optional(), // ISO date string
      dateOfLoss: z.string().optional(),
      responseDueDate: z.string().optional(),
      bodyText: z.string().optional(),
      // Files already uploaded via /api/mail/files/upload
      files: z.array(z.object({
        storageKey: z.string(),
        filename: z.string(),
        contentType: z.string(),
        sizeBytes: z.number(),
      })).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });

      const externalId = `manual-${randomUUID()}`;
      const receivedAt = input.receivedAt ? new Date(input.receivedAt) : new Date();
      const now = new Date();

      // Compute dueAt: if responseDueDate provided use it, else 48h from now
      let dueAt: Date | null = null;
      if (input.responseDueDate) {
        const parsed = new Date(input.responseDueDate);
        dueAt = isNaN(parsed.getTime()) ? null : parsed;
      }
      if (!dueAt && input.category === 'legal_or_high_risk') {
        dueAt = new Date(now.getTime() + 48 * 3600 * 1000);
      }

      const status = input.assignedHandlerId ? 'assigned' : 'new';

      const [inserted] = await db.insert(mailItems).values({
        source: input.source,
        externalId,
        receivedAt,
        status: status as any,
        category: input.category as any ?? null,
        fromName: input.fromName ?? null,
        fromEmail: input.fromEmail ?? null,
        claimNumber: input.claimNumber ?? null,
        urgency: input.urgency as any,
        dateOfLoss: input.dateOfLoss ?? null,
        responseDueDate: input.responseDueDate ?? null,
        bodyText: input.bodyText ?? null,
        subject: input.subject,
        assignedHandlerId: input.assignedHandlerId ?? null,
        assignedAt: input.assignedHandlerId ? now : null,
        dueAt,
      });
      const itemId = (inserted as any).insertId;

      // Insert files
      if (input.files?.length) {
        for (const f of input.files) {
          await db.insert(mailItemFiles).values({
            itemId,
            storageKey: f.storageKey,
            filename: f.filename,
            contentType: f.contentType,
            sizeBytes: f.sizeBytes,
          });
        }
      }

      // Write history
      if (input.category) {
        await appendHistory(db, itemId, 'classified', null, null, ctx.user.id, `Manually classified as ${input.category}`);
      }
      if (input.assignedHandlerId) {
        await appendHistory(db, itemId, 'assigned', null, input.assignedHandlerId, ctx.user.id, 'Manual intake assignment');
      }

      return { ok: true, itemId, externalId };
    }),
  /** Extract structured data from an uploaded mail document (PDF/image) using AI */
  extractMailDocument: adminProcedure
    .input(z.object({
      fileUrl: z.string(),
      mimeType: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const mimeType = input.mimeType ?? 'application/pdf';
      const isPdf = mimeType.includes('pdf');
      const isImage = mimeType.startsWith('image/');
      
      const systemPrompt = `You are a claims mail intake specialist. Extract structured information from the uploaded document and return it as JSON.
      
Extract the following fields (use null if not found):
- subject: brief description of what this document is about (e.g. "Demand Letter - CLM-2026-001" or "PIP Application - John Smith")
- fromName: sender's name or organization
- fromEmail: sender's email or fax number if present
- claimNumber: any claim number referenced (look for patterns like CLM-XXXX, CS-XXXX, MD-XXXX, etc.)
- category: one of: injury_pip_bi, inbound_subro, existing_claim_followup, outbound_subro, total_loss, legal_or_high_risk, other_or_unclear
- urgency: one of: low, normal, high, urgent (urgent = policy limit demand, legal deadline; high = demand letter, legal notice; normal = standard correspondence)
- dateOfLoss: date of the accident/loss in YYYY-MM-DD format
- responseDueDate: any response deadline in YYYY-MM-DD format
- bodyText: a concise summary of the document content (2-3 sentences max)
- isDemand: true if this is a demand letter or legal demand for payment

Return ONLY valid JSON with these exact keys. No markdown fences.`;

      const userContent: any[] = [
        { type: 'text', text: 'Please extract the structured information from this document.' }
      ];
      
      if (isPdf) {
        userContent.push({ type: 'file_url', file_url: { url: input.fileUrl, mime_type: 'application/pdf' } });
      } else if (isImage) {
        userContent.push({ type: 'image_url', image_url: { url: input.fileUrl, detail: 'high' } });
      } else {
        // Fallback for other types — just use the URL as text reference
        userContent.push({ type: 'text', text: `Document URL: ${input.fileUrl}` });
      }

      const result = await invokeLLM({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        maxTokens: 1000,
      });

      const msgContent = result.choices[0]?.message?.content ?? '';
      const raw = typeof msgContent === 'string' ? msgContent : JSON.stringify(msgContent);
      // Strip markdown fences if present
      const cleaned = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
      
      let extracted: any = {};
      try {
        extracted = JSON.parse(cleaned);
      } catch {
        // Best-effort parse failed — return empty
        console.error('[extractMailDocument] JSON parse failed:', cleaned.slice(0, 200));
      }

      return {
        subject: extracted.subject ?? null,
        fromName: extracted.fromName ?? null,
        fromEmail: extracted.fromEmail ?? null,
        claimNumber: extracted.claimNumber ?? null,
        category: extracted.category ?? null,
        urgency: extracted.urgency ?? 'normal',
        dateOfLoss: extracted.dateOfLoss ?? null,
        responseDueDate: extracted.responseDueDate ?? null,
        bodyText: extracted.bodyText ?? null,
        isDemand: extracted.isDemand === true,
      };
    }),


});
