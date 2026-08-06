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
import { storageGetSignedUrl } from '../storage.js';

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
      source: z.enum(['email', 'mail']).optional(),
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
      source: z.enum(['email', 'mail']).optional(),
      overdue: z.boolean().optional(),
      needsReview: z.boolean().optional(),
      from: z.date().optional(),
      to: z.date().optional(),
      limit: z.number().max(500).optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [] };
      const filters: Parameters<typeof and>[0][] = [];
      if (input?.status) filters.push(eq(mailItems.status, input.status));
      if (input?.category) filters.push(eq(mailItems.category, input.category as any));
      if (input?.teamId) filters.push(eq(mailItems.assignedTeamId, input.teamId));
      if (input?.handlerId) filters.push(eq(mailItems.assignedHandlerId, input.handlerId));
      if (input?.source) filters.push(eq(mailItems.source, input.source));
      if (input?.overdue) filters.push(and(lt(mailItems.dueAt, new Date()), isNull(mailItems.resolvedAt))!);
      if (input?.needsReview) filters.push(eq(mailItems.needsReview, 1));
      if (input?.from) filters.push(gte(mailItems.receivedAt, input.from));
      if (input?.to) filters.push(lte(mailItems.receivedAt, input.to));

      const rows = await db.select().from(mailItems)
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(desc(mailItems.receivedAt))
        .limit(input?.limit ?? 200);
      return { items: rows };
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
});
