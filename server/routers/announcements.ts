import { TRPCError } from '@trpc/server';
import { and, desc, eq, gte, isNull, lte, or } from 'drizzle-orm';
import { z } from 'zod';
import { dashboardAnnouncements, userBirthdayPreferences, users } from '../../drizzle/schema.js';
import { getDb } from '../db.js';
import { adminProcedure, protectedProcedure, router } from '../_core/trpc.js';

const DAILY_MESSAGES = [
  'Start with the facts, document the decision, and keep the next step clear.',
  'Small, accurate follow-through is how a well-handled claim moves forward.',
  'Keep the file organized, the communication clear, and the momentum steady.',
  'Today’s advantage is a clear plan, a complete note, and one timely follow-up.',
  'Good claims handling is disciplined work made visible through strong documentation.',
  'Focus on the evidence, the timeline, and the action that keeps the claim moving.',
  'A thoughtful next step now prevents a difficult follow-up later.',
];

function dailyMessage(now: Date) {
  const day = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86_400_000);
  return DAILY_MESSAGES[Math.abs(day) % DAILY_MESSAGES.length];
}

const announcementInput = z.object({
  id: z.number().int().positive().optional(),
  title: z.string().trim().min(2).max(180),
  message: z.string().trim().min(2).max(4000),
  kind: z.enum(['feature', 'message']),
  actionLabel: z.string().trim().max(80).nullable().optional(),
  actionHref: z.string().trim().max(512).nullable().optional(),
  isActive: z.boolean().default(true),
  startsAt: z.date().nullable().optional(),
  endsAt: z.date().nullable().optional(),
});

export const announcementsRouter = router({
  getDashboardMessage: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });
    const now = new Date();
    const active = await db.select().from(dashboardAnnouncements).where(and(
      eq(dashboardAnnouncements.isActive, true),
      or(isNull(dashboardAnnouncements.startsAt), lte(dashboardAnnouncements.startsAt, now)),
      or(isNull(dashboardAnnouncements.endsAt), gte(dashboardAnnouncements.endsAt, now)),
    )).orderBy(desc(dashboardAnnouncements.updatedAt), desc(dashboardAnnouncements.id)).limit(1);
    const birthdays = await db.select({ name: users.name }).from(userBirthdayPreferences)
      .innerJoin(users, eq(userBirthdayPreferences.userId, users.id))
      .where(and(
        eq(userBirthdayPreferences.isOptedIn, true),
        eq(userBirthdayPreferences.birthMonth, now.getMonth() + 1),
        eq(userBirthdayPreferences.birthDay, now.getDate()),
      ));
    return {
      announcement: active[0] ?? null,
      fallback: { title: 'Good morning, team', message: dailyMessage(now) },
      birthdayNames: birthdays.map((person) => person.name).filter((name): name is string => Boolean(name)),
    };
  }),

  getBirthdayPreference: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });
    const rows = await db.select().from(userBirthdayPreferences).where(eq(userBirthdayPreferences.userId, ctx.user.id)).limit(1);
    return rows[0] ?? null;
  }),

  setBirthdayPreference: protectedProcedure.input(z.object({
    isOptedIn: z.boolean(),
    birthMonth: z.number().int().min(1).max(12).nullable().optional(),
    birthDay: z.number().int().min(1).max(31).nullable().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });
    if (input.isOptedIn && (!input.birthMonth || !input.birthDay)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Month and day are required when birthday recognition is enabled.' });
    }
    const values = {
      birthMonth: input.isOptedIn ? input.birthMonth ?? null : null,
      birthDay: input.isOptedIn ? input.birthDay ?? null : null,
      isOptedIn: input.isOptedIn,
    };
    const existing = await db.select({ id: userBirthdayPreferences.id }).from(userBirthdayPreferences)
      .where(eq(userBirthdayPreferences.userId, ctx.user.id)).limit(1);
    if (existing[0]) {
      await db.update(userBirthdayPreferences).set(values).where(eq(userBirthdayPreferences.id, existing[0].id));
    } else {
      await db.insert(userBirthdayPreferences).values({ userId: ctx.user.id, ...values });
    }
    return { ok: true };
  }),

  list: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });
    return db.select().from(dashboardAnnouncements).orderBy(desc(dashboardAnnouncements.updatedAt), desc(dashboardAnnouncements.id));
  }),

  save: adminProcedure.input(announcementInput).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });
    if (input.startsAt && input.endsAt && input.startsAt > input.endsAt) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'End date must be after the start date.' });
    }
    const values = {
      title: input.title,
      message: input.message,
      kind: input.kind,
      actionLabel: input.actionLabel || null,
      actionHref: input.actionHref || null,
      isActive: input.isActive,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
    };
    if (input.id) {
      await db.update(dashboardAnnouncements).set(values).where(eq(dashboardAnnouncements.id, input.id));
      return { id: input.id };
    }
    const result = await db.insert(dashboardAnnouncements).values({ ...values, createdByUserId: ctx.user.id });
    return { id: Number(result[0].insertId) };
  }),

  archive: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });
    await db.update(dashboardAnnouncements).set({ isActive: false }).where(eq(dashboardAnnouncements.id, input.id));
    return { ok: true };
  }),
});
