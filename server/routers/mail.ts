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
import type { ClassificationResult } from '../mail/classify.js';
import { addMailBusinessDays, addMailBusinessHours, isLetterOfRepresentation } from '../mail/businessTime.js';
import { forwardMailToClaim } from '../mail/forwardToClaim.js';

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

async function parseExternalJson(response: Response, stage: string): Promise<any> {
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`${stage} HTTP ${response.status}: ${raw.slice(0, 240).replace(/\s+/g, ' ')}`);
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${stage} returned non-JSON: ${raw.slice(0, 240).replace(/\s+/g, ' ')}`);
  }
}

const CATEGORY_TITLE_MAP: Record<string, string> = {
  injury_pip_bi: 'Injury / PIP / BI Mail',
  inbound_subro: 'Inbound Subrogation',
  existing_claim_followup: 'Claim Follow-up',
  outbound_subro: 'Outbound Subrogation',
  total_loss: 'Total Loss Document',
  legal_or_high_risk: 'Legal / High Risk',
  other_or_unclear: 'Claims Correspondence',
};

function buildMailSummary(classification: ClassificationResult): string | null {
  const workType = classification.is_medical_bill
    ? 'Medical Bill — Provider invoice attached'
    : classification.is_demand
      ? 'Demand attached'
      : (CATEGORY_TITLE_MAP[classification.category] ?? 'Claims Correspondence');
  return [
    workType,
    classification.claim_number ? `Claim: ${classification.claim_number}` : null,
    classification.claimant_or_member_name ? `Person: ${classification.claimant_or_member_name}` : null,
    classification.adverse_carrier ? `Carrier: ${classification.adverse_carrier}` : null,
    classification.requested_action ?? null,
    classification.reason ? classification.reason.slice(0, 120) : null,
  ].filter(Boolean).join(' · ').slice(0, 255) || null;
}

function buildAiSubject(classification: ClassificationResult, currentSubject: string | null): string {
  const genericCurrentTitle = !currentSubject
    || currentSubject === '(no subject)'
    || /^Claims Mail[_\s]/i.test(currentSubject);
  if (!genericCurrentTitle) return currentSubject;
  const parts = [classification.is_medical_bill
    ? 'Medical Bill'
    : (CATEGORY_TITLE_MAP[classification.category] ?? 'Claims Correspondence')];
  if (classification.adverse_carrier) parts.push(classification.adverse_carrier);
  else if (classification.sender_organization) parts.push(classification.sender_organization);
  if (classification.claimant_or_member_name) parts.push(classification.claimant_or_member_name);
  if (classification.claim_number) parts.push(classification.claim_number);
  return parts.join(' — ').slice(0, 255);
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
    if (!db) return { overdue: 0, urgent: 0, legal: 0, demands: 0, bills: 0, allPending: 0 };
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
    const [overdue, urgent, legal, demands, bills, allPending] = await Promise.all([
      cnt(lt(mailItems.dueAt, now)),
      cnt(eq(mailItems.urgency, 'urgent')),
      cnt(or(eq(mailItems.isDemand, 1), eq(mailItems.category, 'legal_or_high_risk'))!),
      cnt(eq(mailItems.isDemand, 1)),
      cnt(eq(mailItems.isMedicalBill, 1)),
      cnt(sql`1=1`),
    ]);
    return { overdue, urgent, legal, demands, bills, allPending };
  }),


  /** Handler's mailroom queue with filters */
  myMailroom: handlerProcedure
    .input(z.object({
      status: z.enum(['assigned', 'escalated', 'resolved']).optional(),
      category: z.string().optional(),
      source: z.enum(['email', 'mail', 'fax', 'manual']).optional(),
      overdue: z.boolean().optional(),
      legalOnly: z.boolean().optional(),
      medicalBills: z.boolean().optional(),
      showResolved: z.boolean().optional(),
      sort: z.enum(['receivedAt', 'dueAt', 'urgency']).optional(),
      includeArchived: z.boolean().optional(),
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
      // Exclude archived items by default unless explicitly requested
      if (!input?.includeArchived) filters.push(eq(mailItems.isArchived, 0));
      if (input?.legalOnly) filters.push(or(eq(mailItems.isDemand, 1), eq(mailItems.category, 'legal_or_high_risk'))!);
      if (input?.medicalBills) filters.push(eq(mailItems.isMedicalBill, 1));

      const rows = await db.select().from(mailItems)
        .where(and(...filters))
        .orderBy(input?.sort === 'dueAt' ? asc(mailItems.dueAt) : desc(mailItems.receivedAt))
        .limit(200);
      return { items: rows };
    }),

  /** Get a single item with presigned file URLs, notes, and history */
  getItem: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const item = await requireItem(db, input.id);

      const files = await db!.select().from(mailItemFiles)
        .where(eq(mailItemFiles.itemId, input.id));
      // Only return proxyUrl — never expose raw S3 presigned URLs to the frontend
      // The proxy handles lazy re-download from Slack when S3 key is stale
      const signedFiles = files.map(f => ({
        ...f,
        proxyUrl: `/api/mail/file-proxy?fileId=${f.id}`,
        downloadUrl: `/api/mail/file-proxy?fileId=${f.id}&download=1`,
      }));

      const notes = await db!.select().from(mailItemNotes)
        .where(eq(mailItemNotes.itemId, input.id))
        .orderBy(asc(mailItemNotes.createdAt));

      const history = await db!.select().from(mailRoutingHistory)
        .where(eq(mailRoutingHistory.itemId, input.id))
        .orderBy(asc(mailRoutingHistory.createdAt));

      return { item, files: signedFiles, notes, history };
    }),

  /** Forward the original Mailroom email/body and recoverable attachments to a confirmed claim recipient. */
  forwardToClaim: protectedProcedure
    .input(z.object({
      itemId: z.number(),
      recipient: z.string().trim().email(),
      note: z.string().trim().max(1000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const item = await requireItem(db, input.itemId);
      const isAdmin = ctx.user.role === 'admin';
      const isAssignedHandler = Boolean(ctx.user.handlerProfileId)
        && item.assignedHandlerId === ctx.user.handlerProfileId;
      if (!isAdmin && !isAssignedHandler) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only the assigned handler or an administrator can forward this Mailroom item.',
        });
      }
      const files = await db!.select().from(mailItemFiles).where(eq(mailItemFiles.itemId, input.itemId));
      const conn = await mysql.createConnection(process.env.DATABASE_URL!);
      try {
        const result = await forwardMailToClaim({
          conn,
          recipient: input.recipient,
          note: input.note,
          item: {
            id: item.id,
            source: item.source,
            externalId: item.externalId,
            subject: item.subject,
            bodyText: item.bodyText,
            fromName: item.fromName,
            fromEmail: item.fromEmail,
            claimNumber: item.claimNumber,
          },
          files: files.map((file) => ({
            filename: file.filename,
            contentType: file.contentType,
            storageKey: file.storageKey,
            sizeBytes: file.sizeBytes,
            slackFileId: file.slackFileId,
          })),
        });
        const skipped = result.skippedAttachments.length
          ? ` Skipped: ${result.skippedAttachments.join(', ')}.`
          : '';
        await db!.insert(mailItemNotes).values({
          itemId: item.id,
          byUserId: ctx.user.id,
          note: `Forwarded to claim recipient ${input.recipient}. Attached ${result.attachmentCount} file${result.attachmentCount === 1 ? '' : 's'}.${skipped}`,
        });
        return result;
      } finally {
        await conn.end();
      }
    }),

  /** Reroute an item to a different handler */
  reroute: protectedProcedure
    .input(z.object({
      itemId: z.number(),
      toHandlerId: z.number(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const item = await requireItem(db, input.itemId);
      const fromHandlerId = item.assignedHandlerId;
      const assignedAt = new Date();
      const dueAt = isLetterOfRepresentation(item.requestedAction, item.reason)
        ? addMailBusinessDays(assignedAt, 1)
        : addMailBusinessHours(assignedAt, 4);

      await db!.update(mailItems)
        .set({ assignedHandlerId: input.toHandlerId, assignedAt, dueAt, status: 'assigned' })
        .where(eq(mailItems.id, input.itemId));

      if (!item.sourceHandledAt && (item.source === 'email' || item.source === 'mail')) {
        const conn = await mysql.createConnection(process.env.DATABASE_URL!);
        try {
          const { markAssignedMailSource } = await import('../mail/sourceMarking.js');
          const marked = await markAssignedMailSource(conn, {
            id: item.id,
            source: item.source,
            externalId: item.externalId,
            slackChannelId: item.slackChannelId,
            slackMessageTs: item.slackMessageTs,
          });
          if (marked.errors.length) console.warn(`[mail.reroute] source marking failed for ${item.id}: ${marked.errors.join('; ')}`);
        } finally {
          await conn.end();
        }
      }

      await appendHistory(db, input.itemId, 'rerouted',
        fromHandlerId, input.toHandlerId, ctx.user.id, input.reason ?? null);

      return { success: true };
    }),

  /** Resolve an item */
  resolve: protectedProcedure
    .input(z.object({
      itemId: z.number(),
      note: z.string().optional(),
      outcome: z.enum(['settled', 'denied', 'other']).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const item = await requireItem(db, input.itemId);
      if (item.isDemand === 1 && !['settled', 'denied'].includes(input.outcome ?? '')) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Demand items must be resolved as settled or denied.' });
      }

      await db!.update(mailItems)
        .set({
          status: 'resolved',
          resolvedAt: new Date(),
          resolvedByHandlerId: ctx.user.handlerProfileId ?? null,
          resolutionOutcome: input.outcome ?? 'other',
          remindAt: null,
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
        null, null, ctx.user.id, [input.outcome ? `Outcome: ${input.outcome}` : null, input.note].filter(Boolean).join(' — ') || null);

      return { success: true };
    }),

  /** Escalate an item */
  escalate: protectedProcedure
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

  /** Mark a record litigated and place it in the administrator's urgent escalation queue. */
  litigate: protectedProcedure
    .input(z.object({ itemId: z.number(), note: z.string().max(1000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const item = await requireItem(db, input.itemId);
      const reason = ['Litigated claim — escalated to administrator', input.note].filter(Boolean).join(' — ');
      await db!.update(mailItems)
        .set({
          status: 'escalated',
          urgency: 'urgent',
          needsReview: 1,
          assignedHandlerId: null,
          assignedTeamId: null,
          dueAt: new Date(),
        })
        .where(eq(mailItems.id, input.itemId));
      await appendHistory(db, input.itemId, 'escalated', item.assignedHandlerId, null, ctx.user.id, reason);
      await db!.insert(mailItemNotes).values({ itemId: input.itemId, byUserId: ctx.user.id, note: reason });
      return { success: true };
    }),

  /** Add a note to an item */
  addNote: protectedProcedure
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
  setReminder: protectedProcedure
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
      isDemand: z.boolean().optional(),
      medicalBills: z.boolean().optional(),
      needsReview: z.boolean().optional(),
      search: z.string().optional(),
      from: z.date().optional(),
      to: z.date().optional(),
      limit: z.number().max(500).optional(),
      page: z.number().min(1).optional(),
      pageSize: z.number().min(1).max(100).optional(),
      sort: z.enum(['receivedAt_desc', 'receivedAt_asc', 'dueAt_asc', 'dueAt_desc']).optional(),
      includeArchived: z.boolean().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      const filters: Parameters<typeof and>[0][] = [];
      if (input?.status) {
        filters.push(eq(mailItems.status, input.status));
        if (input.status === 'assigned') filters.push(isNotNull(mailItems.assignedHandlerId));
      } else {
        // The operational queue is unresolved work only. Historical items are
        // intentionally visible only when the admin selects the Resolved filter.
        filters.push(isNull(mailItems.resolvedAt));
        filters.push(sql`${mailItems.status} <> 'resolved'`);
      }
      if (input?.category) filters.push(eq(mailItems.category, input.category as any));
      if (input?.teamId) filters.push(eq(mailItems.assignedTeamId, input.teamId));
      if (input?.handlerId) filters.push(eq(mailItems.assignedHandlerId, input.handlerId));
      if (input?.source) filters.push(eq(mailItems.source, input.source));
      if (input?.overdue) filters.push(and(
        inArray(mailItems.status, ['assigned', 'escalated']),
        isNotNull(mailItems.assignedHandlerId),
        isNotNull(mailItems.dueAt),
        lt(mailItems.dueAt, new Date()),
        isNull(mailItems.resolvedAt),
      )!);
      // Exclude archived items by default unless explicitly requested
      if (!input?.includeArchived) filters.push(eq(mailItems.isArchived, 0));
      if (input?.urgent) filters.push(eq(mailItems.urgency, 'urgent'));
      if (input?.legalOnly) filters.push(sql`(
        ${mailItems.isDemand} = 0
        AND ${mailItems.isMedicalBill} = 0
        AND LOWER(CONCAT_WS(' ', COALESCE(${mailItems.subject}, ''), COALESCE(${mailItems.bodyText}, ''), COALESCE(${mailItems.summaryNote}, ''), COALESCE(${mailItems.reason}, '')))
          REGEXP 'summons|complaint|warrant|subpoena|court[[:space:]-]|lawsuit|legal service|service of process|notice of hearing'
      )`);
      if (input?.isDemand) filters.push(and(eq(mailItems.isDemand, 1), eq(mailItems.isMedicalBill, 0))!);
      if (input?.medicalBills) filters.push(and(eq(mailItems.isMedicalBill, 1), eq(mailItems.isDemand, 0))!);
      if (input?.needsReview) filters.push(eq(mailItems.needsReview, 1));
      if (input?.from) filters.push(gte(mailItems.receivedAt, input.from));
      if (input?.to) filters.push(lte(mailItems.receivedAt, input.to));
      if (input?.search?.trim()) {
        const searchTerm = `%${input.search.trim().toLowerCase()}%`;
        filters.push(sql`(
          LOWER(COALESCE(${mailItems.subject}, '')) LIKE ${searchTerm}
          OR LOWER(COALESCE(${mailItems.summaryNote}, '')) LIKE ${searchTerm}
          OR LOWER(COALESCE(${mailItems.bodyText}, '')) LIKE ${searchTerm}
          OR LOWER(COALESCE(${mailItems.reason}, '')) LIKE ${searchTerm}
          OR LOWER(COALESCE(${mailItems.claimantName}, '')) LIKE ${searchTerm}
          OR LOWER(COALESCE(${mailItems.requestedAction}, '')) LIKE ${searchTerm}
          OR LOWER(COALESCE(${mailItems.fromName}, '')) LIKE ${searchTerm}
          OR LOWER(COALESCE(${mailItems.fromEmail}, '')) LIKE ${searchTerm}
          OR LOWER(COALESCE(${mailItems.claimNumber}, '')) LIKE ${searchTerm}
        )`);
      }
      const pageSize = input?.pageSize ?? 200;
      const page = input?.page ?? 1;
      const offset = (page - 1) * pageSize;
      const whereClause = filters.length ? and(...filters) : undefined;
      const [{ total }] = await db.select({ total: sql<number>`COUNT(*)` }).from(mailItems).where(whereClause);
      const sortOrder = input?.sort ?? 'receivedAt_desc';
      const orderByClause = sortOrder === 'receivedAt_asc' ? asc(mailItems.receivedAt)
        : sortOrder === 'dueAt_asc' ? asc(mailItems.dueAt)
        : sortOrder === 'dueAt_desc' ? desc(mailItems.dueAt)
        : desc(mailItems.receivedAt);  // default: newest first
      let rows = await db.select().from(mailItems)
        .where(whereClause)
        .orderBy(orderByClause)
        .limit(input?.limit ?? pageSize)
        .offset(offset);
      // Add fileCount for each item via a batch query
      if (rows.length > 0) {
        const ids = rows.map(r => r.id);
        const fileCounts = await db
          .select({ itemId: mailItemFiles.itemId, cnt: sql<number>`COUNT(*)` })
          .from(mailItemFiles)
          .where(inArray(mailItemFiles.itemId, ids))
          .groupBy(mailItemFiles.itemId);
        const fileCountMap = new Map(fileCounts.map(f => [f.itemId, Number(f.cnt)]));
        const itemsWithFiles = rows.map(r => ({ ...r, fileCount: fileCountMap.get(r.id) ?? 0 }));
        return { items: itemsWithFiles, total: Number(total ?? 0) };
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
      includeArchived: z.boolean().optional(),
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
      if (input?.status) {
        filters.push(eq(mailItems.status, input.status as any));
        if (input.status === 'assigned') filters.push(isNotNull(mailItems.assignedHandlerId));
      }
      if (input?.source) filters.push(eq(mailItems.source, input.source));
      if (input?.overdue) filters.push(and(
        inArray(mailItems.status, ['assigned', 'escalated']),
        isNotNull(mailItems.assignedHandlerId),
        isNotNull(mailItems.dueAt),
        lt(mailItems.dueAt, new Date()),
        isNull(mailItems.resolvedAt),
      )!);
      // Exclude archived items by default unless explicitly requested
      if (!input?.includeArchived) filters.push(eq(mailItems.isArchived, 0));
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

    // Overdue means an assigned handler missed the internal review deadline.
    const overdueFilter = and(
      inArray(mailItems.status, ['assigned', 'escalated']),
      isNotNull(mailItems.assignedHandlerId),
      isNotNull(mailItems.dueAt),
      lt(mailItems.dueAt, now),
      isNull(mailItems.resolvedAt),
    );
    const [overdue] = await db.select({ count: sql<number>`COUNT(*)` }).from(mailItems)
      .where(overdueFilter);
    const [overdueYest] = await db.select({ count: sql<number>`COUNT(*)` }).from(mailItems)
      .where(and(inArray(mailItems.status, ['assigned', 'escalated']), isNotNull(mailItems.assignedHandlerId), isNotNull(mailItems.dueAt), lt(mailItems.dueAt, yesterdayStart), isNull(mailItems.resolvedAt)));

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

    // Medical bills only
    const [bills] = await db.select({ count: sql<number>`COUNT(*)` }).from(mailItems)
      .where(and(unresolved!, eq(mailItems.isMedicalBill, 1)));
    const [billsYest] = await db.select({ count: sql<number>`COUNT(*)` }).from(mailItems)
      .where(and(inArray(mailItems.status, ['new', 'assigned', 'escalated']), eq(mailItems.isMedicalBill, 1), lte(mailItems.createdAt, yesterdayStart)));

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
      bills: { count: Number(bills?.count ?? 0), delta: delta(Number(bills?.count ?? 0), Number(billsYest?.count ?? 0)) },
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

  /** Bulk archive mail items */
  bulkArchive: adminProcedure
    .input(z.object({ ids: z.array(z.number()).min(1).max(200) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      await db.update(mailItems)
        .set({ isArchived: 1 })
        .where(inArray(mailItems.id, input.ids));
      return { archived: input.ids.length };
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
        const { recoverStaleGmailAttachments } = await import('../mail/gmailAttachmentRecovery.js');
        results.gmailAttachmentRecovery = await recoverStaleGmailAttachments(conn, 30);
      } catch (ingestErr) {
        results.ingest = { skipped: true, reason: String(ingestErr) };
      }

      // Step 1b: Poll Slack #claims-mail using files.list API (paginated, all files)
      try {
        // Read token from mail_bot_config (same token the mail bot uses) — fall back to env
        let slackToken = process.env.SLACK_BOT_TOKEN ?? '';
        let CLAIMS_MAIL_CHANNEL = 'C07R60KAC2C';
        try {
          const [[botCfg]] = await conn.execute<any[]>(
            'SELECT slack_bot_token, claims_mail_channel_id FROM mail_bot_config LIMIT 1'
          );
          if (botCfg?.slack_bot_token) slackToken = botCfg.slack_bot_token;
          if (botCfg?.claims_mail_channel_id) CLAIMS_MAIL_CHANNEL = botCfg.claims_mail_channel_id;
        } catch { /* mail_bot_config may not exist */ }
        const REVIEWED_EMOJIS = ['white_check_mark', 'eyes', 'heavy_check_mark'];
        if (!slackToken) {
          results.slackIngest = { skipped: true, reason: 'No SLACK_BOT_TOKEN' };
        } else {
          const [[reviewedRow]] = await conn.execute<any[]>(
            "SELECT value FROM mail_settings WHERE `key` = 'reviewed_emoji'"
          );
          const reviewedEmoji = reviewedRow?.value ?? 'white_check_mark';
          const allReviewed = Array.from(new Set([...REVIEWED_EMOJIS, reviewedEmoji]));
          const { handleSlackFileEvent, buildRealSlackFetch } = await import('../mail/ingestSlack.js');
          const slackFetch = buildRealSlackFetch(slackToken);
          let inserted = 0, skipped = 0, errors: string[] = [];
          let totalFiles = 0;
          // Use files.list API with pagination to get ALL files in the channel
          let page = 1;
          let hasMore = true;
          while (hasMore) {
            const params = new URLSearchParams({
              channel: CLAIMS_MAIL_CHANNEL,
              count: '100',
              page: String(page),
              types: 'all',
            });
            const filesRes = await fetch(
              `https://slack.com/api/files.list?${params}`,
              { headers: { Authorization: `Bearer ${slackToken}` } }
            );
            const filesData = await parseExternalJson(filesRes, `Slack files.list page ${page}`) as { ok: boolean; files?: any[]; paging?: { pages: number } };
            if (!filesData.ok) {
              errors.push(`files.list page ${page}: ${JSON.stringify(filesData)}`);
              break;
            }
            const files = filesData.files ?? [];
            totalFiles += files.length;
            hasMore = page < (filesData.paging?.pages ?? 1);
            page++;
            for (const file of files) {
              // Get message ts from file shares
              const shares = (file.shares?.public?.[CLAIMS_MAIL_CHANNEL] ?? file.shares?.private?.[CLAIMS_MAIL_CHANNEL] ?? []) as any[];
              const messageTs = shares[0]?.ts ?? String(file.timestamp ?? file.id);
              // Check reactions on the message
              let reactions: Array<{ name: string }> = [];
              if (messageTs) {
                try {
                  const reactParams = new URLSearchParams({ channel: CLAIMS_MAIL_CHANNEL, timestamp: messageTs, full: 'true' });
                  const reactRes = await fetch(`https://slack.com/api/reactions.get?${reactParams}`, {
                    headers: { Authorization: `Bearer ${slackToken}` },
                  });
                  const reactData = await parseExternalJson(reactRes, `Slack reactions.get ${file.id}`) as { ok: boolean; message?: { reactions?: Array<{ name: string }> } };
                  reactions = reactData.message?.reactions ?? [];
                } catch { /* non-fatal */ }
              }
              const alreadyReviewed = reactions.some(r => allReviewed.includes(r.name));
              // Existing files remain deduped. If a prior item has since been marked reviewed,
              // preserve it in history as resolved instead of leaving a stale pending item.
              const [existing] = await conn.execute<any[]>(
                `SELECT mi.id, mi.status,
                        (SELECT COUNT(*) FROM mail_item_files mif WHERE mif.item_id = mi.id) AS file_count
                 FROM mail_items mi WHERE mi.source = 'mail' AND mi.external_id = ?`,
                [file.id]
              );
              if (existing.length > 0) {
                if (alreadyReviewed && existing[0].status !== 'resolved') {
                  await conn.execute(
                    "UPDATE mail_items SET pre_reviewed=1, status='resolved', resolved_at=COALESCE(resolved_at, NOW()) WHERE id=?",
                    [existing[0].id]
                  );
                }
                if (!alreadyReviewed && Number(existing[0].file_count ?? 0) === 0) {
                  try {
                    const hydrated = await slackFetch.getFileInfo(file.id);
                    const downloadUrl = file.url_private_download ?? hydrated?.urlPrivateDownload;
                    if (!downloadUrl) throw new Error('Slack did not provide a download URL');
                    const downloaded = await slackFetch.downloadFile(downloadUrl);
                    const storageName = file.name ?? file.title ?? hydrated?.filename ?? `${file.id}.bin`;
                    const { key: storageKey } = await storagePut(
                      `mail/slack/${CLAIMS_MAIL_CHANNEL}/${messageTs}/${storageName}`,
                      downloaded.buffer,
                      downloaded.contentType,
                    );
                    await conn.execute(
                      `INSERT INTO mail_item_files (item_id, storage_key, filename, content_type, size_bytes, slack_file_id)
                       VALUES (?, ?, ?, ?, ?, ?)`,
                      [existing[0].id, storageKey, storageName, downloaded.contentType, downloaded.buffer.length, file.id]
                    );
                  } catch (recoveryError) {
                    errors.push(`attachment recovery ${file.id}: ${String(recoveryError)}`);
                  }
                }
                skipped++;
                continue;
              }
              // Pre-2025 filter: only ingest legal/injury-related mail from before 2025
              // (post-2025 mail is ingested regardless of category)
              const PRE_2025_CUTOFF = 1735689600; // 2025-01-01 00:00:00 UTC
              const fileTimestamp = Number(file.timestamp ?? 0);
              if (!alreadyReviewed && fileTimestamp > 0 && fileTimestamp < PRE_2025_CUTOFF) {
                // Pre-2025 mail: only ingest if filename suggests legal/injury content
                const fname = (file.name ?? file.title ?? '').toLowerCase();
                const isLegalOrInjury = /demand|lawsuit|complaint|summons|legal|attorney|counsel|injury|medical|pip|bodily|claim|subrog|lien|arbitration|litigation|settlement|release|judgment/.test(fname);
                if (!isLegalOrInjury) { skipped++; continue; }
              }
              try {
                const result = await handleSlackFileEvent(conn, {
                  fileId: file.id,
                  messageTs,
                  channelId: CLAIMS_MAIL_CHANNEL,
                  filename: file.name ?? file.title,
                  mimeType: file.mimetype,
                  urlPrivateDownload: file.url_private_download,
                  reactions,
                  receivedAt: fileTimestamp > 0 ? new Date(fileTimestamp * 1000) : new Date(),
                }, slackFetch, {
                  reviewedEmoji,
                  reviewedEmojis: allReviewed,
                  addBotMarker: false,
                });
                if (result.action === 'inserted') inserted++;
                else if (result.action === 'pre_reviewed') {
                  const current = results.slackIngest as { resolved?: number } | undefined;
                  results.slackIngest = { ...(current ?? {}), resolved: (current?.resolved ?? 0) + 1 };
                } else skipped++;
              } catch (e) {
                errors.push(String(e));
              }
            }
          }
          const prior = results.slackIngest as { resolved?: number } | undefined;
          results.slackIngest = { inserted, skipped, resolved: prior?.resolved ?? 0, errors: errors.slice(0, 5), total: totalFiles };
        }
      } catch (slackErr) {
        results.slackIngest = { skipped: true, reason: String(slackErr) };
      }
      // Step 2: Classify + assign pending items
      // Cadence: 3 items per handler per run, Tue-Fri only (matches mail bot schedule)
      // Manual triggers (from admin UI) bypass the day-of-week gate
      const { classify } = await import('../mail/classify.js');
      const { route } = await import('../mail/route.js');
      const { createMailContentReader, parseMailContentFiles } = await import('../mail/contentRefresh.js');
      const { markAssignedMailSource } = await import('../mail/sourceMarking.js');
      const readMailContent = await createMailContentReader(conn);

      // Day-of-week gate: 2=Tue, 3=Wed, 4=Thu, 5=Fri (ET)
      const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const dayOfWeek = nowET.getDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
      const isScheduledDay = dayOfWeek >= 2 && dayOfWeek <= 5;
      const isManualTrigger = true; // triggerNow is always manual — bypass day gate

      const BATCH_PER_HANDLER = 3;

      // Get all unprocessed items (no limit — we'll apply per-handler limit below)
      const [allItems] = await conn.execute<any[]>(
        `SELECT mi.id, mi.external_id, mi.subject, mi.body_text, mi.from_email, mi.source, mi.received_at,
                mi.slack_message_ts, mi.slack_channel_id,
                GROUP_CONCAT(mif.filename SEPARATOR ', ') AS attachment_names,
                GROUP_CONCAT(CONCAT(COALESCE(mif.content_type, ''), ':::', mif.storage_key, ':::', COALESCE(mif.slack_file_id, ''), ':::', COALESCE(mif.filename, '')) SEPARATOR '|||') AS file_entries
         FROM mail_items mi
         LEFT JOIN mail_item_files mif ON mif.item_id = mi.id
         WHERE mi.category IS NULL AND mi.status = 'new'
         GROUP BY mi.id ORDER BY mi.received_at ASC LIMIT 200`
      );

      let processed = 0, errors = 0, skippedDayGate = 0;
      const handlerAssignedCount: Record<number, number> = {};

      for (const item of allItems) {
        try {
          let fileEntries = item.file_entries;
          if (!fileEntries && item.slack_message_ts && item.slack_channel_id) {
            // No files stored yet — try to backfill from Slack
            try {
              let slackToken = process.env.SLACK_BOT_TOKEN ?? '';
              try {
                const [[botCfg]] = await conn.execute<any[]>('SELECT slack_bot_token FROM mail_bot_config LIMIT 1');
                if (botCfg?.slack_bot_token) slackToken = botCfg.slack_bot_token;
              } catch {}
              if (slackToken) {
                const msgRes = await fetch(`https://slack.com/api/conversations.replies?channel=${item.slack_channel_id}&ts=${item.slack_message_ts}&limit=1`, {
                  headers: { Authorization: `Bearer ${slackToken}` }
                });
                const msgData = await msgRes.json() as { ok: boolean; messages?: any[] };
                const msg = msgData.messages?.[0];
                const fileObj = msg?.files?.[0];
                if (fileObj?.url_private_download) {
                  const { handleSlackFileEvent, buildRealSlackFetch } = await import('../mail/ingestSlack.js');
                  const slackFetch = buildRealSlackFetch(slackToken);
                  await handleSlackFileEvent(conn, {
                    fileId: fileObj.id,
                    messageTs: item.slack_message_ts,
                    channelId: item.slack_channel_id,
                    filename: fileObj.name ?? fileObj.title,
                    mimeType: fileObj.mimetype,
                    urlPrivateDownload: fileObj.url_private_download,
                    reactions: [],
                  }, slackFetch, { reviewedEmoji: 'white_check_mark', addBotMarker: false });
                  // Re-fetch complete file metadata after recovery.
                  const [newFiles] = await conn.execute<any[]>(
                    `SELECT content_type, storage_key, slack_file_id, filename
                     FROM mail_item_files WHERE item_id=?`,
                    [item.id],
                  );
                  fileEntries = newFiles.map((f: any) =>
                    `${f.content_type ?? ''}:::${f.storage_key}:::${f.slack_file_id ?? ''}:::${f.filename ?? ''}`,
                  ).join('|||');
                }
              }
            } catch { /* non-fatal — classify without file content */ }
          }
          const content = await readMailContent(
            item.source,
            item.external_id,
            item.body_text,
            parseMailContentFiles(fileEntries),
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
          const cl = await classify({
            subject: item.subject ?? undefined,
            bodyText: content.indexedBody,
            receivedAt: item.received_at,
            attachmentNames: item.attachment_names ? item.attachment_names.split(', ').filter(Boolean) : undefined,
          });
          const patch = await route(conn, cl, { sourceText: content.indexedBody });

          // Apply per-handler batch limit (3 per handler per run)
          if (patch.assignedHandlerId && !patch.priorityAssignment) {
            const currentCount = handlerAssignedCount[patch.assignedHandlerId] ?? 0;
            if (currentCount >= BATCH_PER_HANDLER) {
              // Classify but don't assign yet — mark as classified/needs_review
              await conn.execute(
                `UPDATE mail_items SET category=?,confidence=?,is_demand=?,is_medical_bill=?,needs_review=1,urgency=?,reason=? WHERE id=?`,
                [patch.category, patch.confidence, patch.isDemand, patch.isMedicalBill, patch.urgency, 'Batch limit reached — pending assignment', item.id]
              );
              continue;
            }
            handlerAssignedCount[patch.assignedHandlerId] = currentCount + 1;
          }

          const summaryNote = buildMailSummary(cl);
          const newSubject = buildAiSubject(cl, item.subject ?? null);
          await conn.execute(
            `UPDATE mail_items SET category=?,confidence=?,is_demand=?,is_medical_bill=?,needs_review=?,claim_number=?,from_name=?,sender_org=?,adverse_carrier=?,claimant_name=?,date_of_loss=?,requested_action=?,urgency=?,reason=?,demand_date=?,response_due_date=?,assigned_team_id=?,assigned_handler_id=?,status=?,assigned_at=?,due_at=?,initial_category=?,initial_handler_id=?,initial_confidence=?,summary_note=?,subject=?,body_text=? WHERE id=?`,
            [patch.category,patch.confidence,patch.isDemand,patch.isMedicalBill,patch.needsReview,patch.claimNumber,patch.fromName,patch.senderOrg,patch.adverseCarrier,patch.claimantName,patch.dateOfLoss,patch.requestedAction,patch.urgency,patch.reason,patch.demandDate,patch.responseDueDate,patch.assignedTeamId,patch.assignedHandlerId,patch.status,patch.assignedAt,patch.dueAt,patch.initialCategory,patch.initialHandlerId,patch.initialConfidence,summaryNote,newSubject,content.indexedBody,item.id]
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
              console.warn(`[mail.triggerNow] source marking failed for ${item.id}: ${sourceResult.errors.join('; ')}`);
            }
          }
          for (const h of patch.historyActions) {
            await conn.execute(`INSERT INTO mail_routing_history (item_id,action,to_handler_id,reason) VALUES (?,?,?,?)`, [item.id,h.action,h.toHandlerId??null,h.reason]);
          }
          processed++;
        } catch { errors++; }
      }
      results.process = { processed, errors, total: allItems.length, skippedDayGate, handlerCounts: handlerAssignedCount };
      // Existing items may pre-date content summaries or have recovered attachments.
      // Enrich a bounded batch without changing their existing routing decisions.
      const { refreshIncompleteMailContent } = await import('../mail/contentRefresh.js');
      results.contentRefresh = await refreshIncompleteMailContent(conn, 50);
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
        // Download PDF and send as base64 data URL — supports scanned/image-based PDFs
        try {
          const dlRes = await fetch(input.fileUrl);
          if (dlRes.ok) {
            const buf = Buffer.from(await dlRes.arrayBuffer());
            const b64 = buf.toString('base64');
            userContent.push({ type: 'file_url', file_url: { url: `data:application/pdf;base64,${b64}`, mime_type: 'application/pdf' } });
          } else {
            userContent.push({ type: 'file_url', file_url: { url: input.fileUrl, mime_type: 'application/pdf' } });
          }
        } catch {
          userContent.push({ type: 'file_url', file_url: { url: input.fileUrl, mime_type: 'application/pdf' } });
        }
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
        maxTokens: 1500,
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
        console.error('[extractMailDocument] JSON parse failed. Raw response:', cleaned.slice(0, 500));
        // If we got something back but it's not JSON, try to use it as bodyText
        if (cleaned.length > 10) {
          extracted = { bodyText: cleaned.slice(0, 500) };
        }
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
