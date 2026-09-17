import { TRPCError } from '@trpc/server';
import { and, desc, eq, gte, isNull, lte, or } from 'drizzle-orm';
import { z } from 'zod';
import { dashboardAnnouncementAutomation, dashboardAnnouncements, userBirthdayPreferences, users } from '../../drizzle/schema.js';
import { getDb } from '../db.js';
import { adminProcedure, protectedProcedure, router } from '../_core/trpc.js';
import { featureAnnouncementWindow, dailyMessage, summarizeBirthdays } from '../announcementsAutomation.js';

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
    )).orderBy(desc(dashboardAnnouncements.updatedAt), desc(dashboardAnnouncements.id));
    // New-feature messages take precedence over the automated daily message. A manual
    // non-feature message is next; the persisted daily entry is the final fallback.
    const announcement = active.find((item) => item.kind === 'feature')
      ?? active.find((item) => !item.isAutomated)
      ?? active[0]
      ?? null;
    const preferences = await db.select({
      name: users.name,
      birthMonth: userBirthdayPreferences.birthMonth,
      birthDay: userBirthdayPreferences.birthDay,
      isOptedIn: userBirthdayPreferences.isOptedIn,
    }).from(userBirthdayPreferences)
      .innerJoin(users, eq(userBirthdayPreferences.userId, users.id));
    const birthdays = summarizeBirthdays(preferences, now);
    return {
      announcement,
      fallback: { title: 'Good morning, team', message: dailyMessage(now) },
      birthdayNames: birthdays.todayBirthdays,
      upcomingBirthdays: birthdays.upcomingBirthdays,
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

  automationStatus: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });
    const rows = await db.select().from(dashboardAnnouncementAutomation).limit(1);
    return rows[0] ?? null;
  }),

  list: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });
    return db.select().from(dashboardAnnouncements).orderBy(desc(dashboardAnnouncements.updatedAt), desc(dashboardAnnouncements.id));
  }),

  save: adminProcedure.input(announcementInput).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });
    const now = new Date();
    // MySQL DATETIME may discard milliseconds. Starting one second in the past
    // keeps a newly published feature visible in the same request everywhere.
    const immediateStart = new Date(now.getTime() - 1_000);
    const featureWindow = input.kind === 'feature' ? featureAnnouncementWindow(input.startsAt ?? immediateStart) : null;
    const startsAt = featureWindow?.startsAt ?? input.startsAt ?? null;
    const endsAt = featureWindow?.endsAt ?? input.endsAt ?? null;
    if (startsAt && endsAt && startsAt > endsAt) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'End date must be after the start date.' });
    }
    const values = {
      title: input.title,
      message: input.message,
      kind: input.kind,
      actionLabel: input.actionLabel || null,
      actionHref: input.actionHref || null,
      isActive: input.isActive,
      startsAt,
      endsAt,
      isAutomated: false,
      automatedForDate: null,
    };
    if (input.id) {
      await db.update(dashboardAnnouncements).set(values).where(eq(dashboardAnnouncements.id, input.id));
      return { id: input.id, endsAt };
    }
    const result = await db.insert(dashboardAnnouncements).values({ ...values, createdByUserId: ctx.user.id });
    return { id: Number(result[0].insertId), endsAt };
  }),

  archive: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });
    await db.update(dashboardAnnouncements).set({ isActive: false }).where(eq(dashboardAnnouncements.id, input.id));
    return { ok: true };
  }),
});
