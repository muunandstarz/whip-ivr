import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import {
  getIntakeRecords,
  getIntakeRecordById,
  updateIntakeRecord,
  createIntakeRecord,
  getIntakeAnalytics,
  getCallHistory,
  getCallHistoryAnalytics,
  getQaScores,
  getQaAgentSummary,
  getHandlers,
  getRepeatCallers,
} from "./db";

const callerTypeEnum = z.enum([
  "carrier",
  "law_office",
  "medical_provider",
  "member",
  "claimant",
  "police",
  "unknown",
]);

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Intake Records ────────────────────────────────────────────────────
  intake: router({
    list: protectedProcedure
      .input(
        z.object({
          search: z.string().optional(),
          status: z.enum(["open", "closed", "escalated"]).optional(),
          callerType: z.string().optional(),
          handlerName: z.string().optional(),
          priority: z.string().optional(),
          limit: z.number().min(1).max(500).default(50),
          offset: z.number().min(0).default(0),
        })
      )
      .query(async ({ input }) => {
        return getIntakeRecords(input);
      }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return getIntakeRecordById(input.id);
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum(["open", "closed", "escalated"]).optional(),
          handlerName: z.string().optional(),
          handlerId: z.number().optional(),
          callerName: z.string().optional(),
          callerOrg: z.string().optional(),
          whipClaimNumber: z.string().optional(),
          callerRefNumber: z.string().optional(),
          message: z.string().optional(),
          callbackPhone: z.string().optional(),
          callbackEmail: z.string().optional(),
          priority: z.enum(["normal", "high", "urgent"]).optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateIntakeRecord(id, data);
        return { success: true };
      }),

    create: protectedProcedure
      .input(
        z.object({
          callerPhone: z.string().optional(),
          callerType: callerTypeEnum.default("unknown"),
          callerName: z.string().optional(),
          callerOrg: z.string().optional(),
          whipClaimNumber: z.string().optional(),
          callerRefNumber: z.string().optional(),
          message: z.string().optional(),
          callbackPhone: z.string().optional(),
          callbackEmail: z.string().optional(),
          handlerName: z.string().optional(),
          handlerId: z.number().optional(),
          priority: z.enum(["normal", "high", "urgent"]).default("normal"),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const id = await createIntakeRecord({
          ...input,
          source: "manual",
          status: "open",
        });
        return { id };
      }),

    analytics: protectedProcedure.query(async () => {
      return getIntakeAnalytics();
    }),
  }),

  // ─── Call History ──────────────────────────────────────────────────────
  calls: router({
    list: protectedProcedure
      .input(
        z.object({
          status: z.string().optional(),
          agentName: z.string().optional(),
          limit: z.number().min(1).max(200).default(100),
          offset: z.number().min(0).default(0),
        })
      )
      .query(async ({ input }) => {
        return getCallHistory(input);
      }),

    analytics: protectedProcedure.query(async () => {
      return getCallHistoryAnalytics();
    }),
  }),

  // ─── QA Scores ─────────────────────────────────────────────────────────
  qa: router({
    scores: protectedProcedure
      .input(
        z.object({
          agentName: z.string().optional(),
          limit: z.number().default(50),
        })
      )
      .query(async ({ input }) => {
        return getQaScores(input);
      }),

    agentSummary: protectedProcedure.query(async () => {
      return getQaAgentSummary();
    }),
  }),

  // ─── Handlers ──────────────────────────────────────────────────────────
  handlers: router({
    list: protectedProcedure.query(async () => {
      return getHandlers();
    }),
  }),

  // ─── Repeat Callers ────────────────────────────────────────────────────
  callers: router({
    repeats: protectedProcedure.query(async () => {
      return getRepeatCallers();
    }),
  }),
});

export type AppRouter = typeof appRouter;
