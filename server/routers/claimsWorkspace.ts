import { TRPCError } from '@trpc/server';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import {
  claimsWorkspaceNotes,
  claimsWorkspaceQuickNotes,
  claimsWorkspaceScenes,
  claimsWorkspaceTasks,
} from '../../drizzle/schema.js';
import { getDb } from '../db.js';
import { protectedProcedure, router } from '../_core/trpc.js';

const taskPriority = z.enum(['normal', 'high', 'urgent']);
const taskStatus = z.enum(['active', 'completed', 'archived']);
const quickNoteStatus = z.enum(['active', 'archived', 'converted']);

async function workspaceDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Claims Workspace is unavailable. Please try again.' });
  return db;
}

async function assertOwned<T extends { id: number; userId: number }>(rows: T[], userId: number, label: string): Promise<T> {
  const record = rows[0];
  if (!record) throw new TRPCError({ code: 'NOT_FOUND', message: `${label} not found` });
  if (record.userId !== userId) throw new TRPCError({ code: 'FORBIDDEN', message: `You do not have access to this ${label.toLowerCase()}` });
  return record;
}

export const claimsWorkspaceRouter = router({
  dashboard: protectedProcedure.query(async ({ ctx }) => {
    const db = await workspaceDb();
    const [notes, quickNotes, tasks, completedTasks, scenes] = await Promise.all([
      db.select().from(claimsWorkspaceNotes)
        .where(and(eq(claimsWorkspaceNotes.userId, ctx.user.id), isNull(claimsWorkspaceNotes.archivedAt)))
        .orderBy(desc(claimsWorkspaceNotes.isPinned), desc(claimsWorkspaceNotes.updatedAt)).limit(50),
      db.select().from(claimsWorkspaceQuickNotes)
        .where(and(eq(claimsWorkspaceQuickNotes.userId, ctx.user.id), eq(claimsWorkspaceQuickNotes.status, 'active')))
        .orderBy(desc(claimsWorkspaceQuickNotes.updatedAt)).limit(20),
      db.select().from(claimsWorkspaceTasks)
        .where(and(eq(claimsWorkspaceTasks.userId, ctx.user.id), eq(claimsWorkspaceTasks.status, 'active')))
        .orderBy(desc(claimsWorkspaceTasks.priority), desc(claimsWorkspaceTasks.dueAt)).limit(100),
      db.select().from(claimsWorkspaceTasks)
        .where(and(eq(claimsWorkspaceTasks.userId, ctx.user.id), eq(claimsWorkspaceTasks.status, 'completed')))
        .orderBy(desc(claimsWorkspaceTasks.completedAt)).limit(50),
      db.select().from(claimsWorkspaceScenes)
        .where(eq(claimsWorkspaceScenes.userId, ctx.user.id))
        .orderBy(desc(claimsWorkspaceScenes.updatedAt)).limit(30),
    ]);
    return { notes, quickNotes, tasks, completedTasks, scenes };
  }),

  saveNote: protectedProcedure.input(z.object({
    id: z.number().int().positive().optional(),
    title: z.string().trim().min(1).max(256),
    content: z.string().max(100_000),
    tags: z.array(z.string().trim().min(1).max(32)).max(12).default([]),
  })).mutation(async ({ ctx, input }) => {
    const db = await workspaceDb();
    if (input.id) {
      await assertOwned(await db.select().from(claimsWorkspaceNotes).where(eq(claimsWorkspaceNotes.id, input.id)).limit(1), ctx.user.id, 'Note');
      await db.update(claimsWorkspaceNotes).set({ title: input.title, content: input.content, tags: input.tags }).where(eq(claimsWorkspaceNotes.id, input.id));
      return { id: input.id, created: false };
    }
    const result = await db.insert(claimsWorkspaceNotes).values({ userId: ctx.user.id, title: input.title, content: input.content, tags: input.tags });
    return { id: Number(result[0].insertId), created: true };
  }),

  setNotePinned: protectedProcedure.input(z.object({ id: z.number().int().positive(), isPinned: z.boolean() })).mutation(async ({ ctx, input }) => {
    const db = await workspaceDb();
    await assertOwned(await db.select().from(claimsWorkspaceNotes).where(eq(claimsWorkspaceNotes.id, input.id)).limit(1), ctx.user.id, 'Note');
    await db.update(claimsWorkspaceNotes).set({ isPinned: input.isPinned }).where(eq(claimsWorkspaceNotes.id, input.id));
    return { success: true };
  }),

  archiveNote: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await workspaceDb();
    await assertOwned(await db.select().from(claimsWorkspaceNotes).where(eq(claimsWorkspaceNotes.id, input.id)).limit(1), ctx.user.id, 'Note');
    await db.update(claimsWorkspaceNotes).set({ archivedAt: new Date() }).where(eq(claimsWorkspaceNotes.id, input.id));
    return { success: true };
  }),

  saveQuickNote: protectedProcedure.input(z.object({ id: z.number().int().positive().optional(), content: z.string().trim().min(1).max(1000) })).mutation(async ({ ctx, input }) => {
    const db = await workspaceDb();
    if (input.id) {
      await assertOwned(await db.select().from(claimsWorkspaceQuickNotes).where(eq(claimsWorkspaceQuickNotes.id, input.id)).limit(1), ctx.user.id, 'Quick note');
      await db.update(claimsWorkspaceQuickNotes).set({ content: input.content }).where(eq(claimsWorkspaceQuickNotes.id, input.id));
      return { id: input.id, created: false };
    }
    const result = await db.insert(claimsWorkspaceQuickNotes).values({ userId: ctx.user.id, content: input.content });
    return { id: Number(result[0].insertId), created: true };
  }),

  archiveQuickNote: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await workspaceDb();
    await assertOwned(await db.select().from(claimsWorkspaceQuickNotes).where(eq(claimsWorkspaceQuickNotes.id, input.id)).limit(1), ctx.user.id, 'Quick note');
    await db.update(claimsWorkspaceQuickNotes).set({ status: 'archived' }).where(eq(claimsWorkspaceQuickNotes.id, input.id));
    return { success: true };
  }),

  saveTask: protectedProcedure.input(z.object({
    id: z.number().int().positive().optional(),
    title: z.string().trim().min(1).max(256),
    details: z.string().max(10_000).nullable().optional(),
    priority: taskPriority.default('normal'),
    dueAt: z.date().nullable().optional(),
    remindAt: z.date().nullable().optional(),
    repeatRule: z.enum(['none', 'daily', 'weekdays', 'weekly', 'monthly']).default('none'),
    sourceNoteId: z.number().int().positive().nullable().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await workspaceDb();
    const values = {
      title: input.title, details: input.details ?? null, priority: input.priority,
      dueAt: input.dueAt ?? null, remindAt: input.remindAt ?? null,
      repeatRule: input.repeatRule, sourceNoteId: input.sourceNoteId ?? null,
    };
    if (input.id) {
      await assertOwned(await db.select().from(claimsWorkspaceTasks).where(eq(claimsWorkspaceTasks.id, input.id)).limit(1), ctx.user.id, 'Task');
      await db.update(claimsWorkspaceTasks).set(values).where(eq(claimsWorkspaceTasks.id, input.id));
      return { id: input.id, created: false };
    }
    const result = await db.insert(claimsWorkspaceTasks).values({ userId: ctx.user.id, ...values });
    return { id: Number(result[0].insertId), created: true };
  }),

  setTaskStatus: protectedProcedure.input(z.object({ id: z.number().int().positive(), status: taskStatus })).mutation(async ({ ctx, input }) => {
    const db = await workspaceDb();
    await assertOwned(await db.select().from(claimsWorkspaceTasks).where(eq(claimsWorkspaceTasks.id, input.id)).limit(1), ctx.user.id, 'Task');
    await db.update(claimsWorkspaceTasks).set({ status: input.status, completedAt: input.status === 'completed' ? new Date() : null }).where(eq(claimsWorkspaceTasks.id, input.id));
    return { success: true };
  }),

  snoozeTask: protectedProcedure.input(z.object({ id: z.number().int().positive(), remindAt: z.date() })).mutation(async ({ ctx, input }) => {
    const db = await workspaceDb();
    await assertOwned(await db.select().from(claimsWorkspaceTasks).where(eq(claimsWorkspaceTasks.id, input.id)).limit(1), ctx.user.id, 'Task');
    await db.update(claimsWorkspaceTasks).set({ remindAt: input.remindAt }).where(eq(claimsWorkspaceTasks.id, input.id));
    return { success: true };
  }),

  convertQuickNoteToTask: protectedProcedure.input(z.object({ id: z.number().int().positive(), dueAt: z.date().nullable().optional(), priority: taskPriority.default('normal') })).mutation(async ({ ctx, input }) => {
    const db = await workspaceDb();
    const quickNote = await assertOwned(await db.select().from(claimsWorkspaceQuickNotes).where(eq(claimsWorkspaceQuickNotes.id, input.id)).limit(1), ctx.user.id, 'Quick note');
    const result = await db.insert(claimsWorkspaceTasks).values({ userId: ctx.user.id, title: quickNote.content, priority: input.priority, dueAt: input.dueAt ?? null });
    await db.update(claimsWorkspaceQuickNotes).set({ status: 'converted' }).where(eq(claimsWorkspaceQuickNotes.id, input.id));
    return { id: Number(result[0].insertId) };
  }),

  saveScene: protectedProcedure.input(z.object({
    id: z.number().int().positive().optional(),
    title: z.string().trim().min(1).max(256),
    versionLabel: z.string().trim().min(1).max(128).default('My Analysis'),
    state: z.string().trim().max(8).nullable().optional(),
    lossLocation: z.string().trim().max(512).nullable().optional(),
    roadLayout: z.enum(['straight', 'three_way', 'four_way', 'parking_lot', 'highway', 'roundabout']).default('four_way'),
    sceneData: z.any(),
    analysisNotes: z.string().max(25_000).nullable().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await workspaceDb();
    const values = {
      title: input.title, versionLabel: input.versionLabel, state: input.state ?? null,
      lossLocation: input.lossLocation ?? null, roadLayout: input.roadLayout,
      sceneData: input.sceneData, analysisNotes: input.analysisNotes ?? null,
    };
    if (input.id) {
      await assertOwned(await db.select().from(claimsWorkspaceScenes).where(eq(claimsWorkspaceScenes.id, input.id)).limit(1), ctx.user.id, 'Accident workspace');
      await db.update(claimsWorkspaceScenes).set(values).where(eq(claimsWorkspaceScenes.id, input.id));
      return { id: input.id, created: false };
    }
    const result = await db.insert(claimsWorkspaceScenes).values({ userId: ctx.user.id, ...values });
    return { id: Number(result[0].insertId), created: true };
  }),
});
