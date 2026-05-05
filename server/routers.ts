import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { classifyCallBatch, getUnclassifiedCount } from "./classifyCalls";
import { TRPCError } from "@trpc/server";
import {
  getIntakeRecords,
  getIntakeRecordById,
  updateIntakeRecord,
  createIntakeRecord,
  getIntakeAnalytics,
  getCallHistory,
  getCallHistoryAnalytics,
  getFullCallAnalytics,
  getCallerHistory,
  markCalledBack,
  getQaScores,
  getQaAgentSummary,
  getHandlers,
  getRepeatCallers,
  getHandlerScorecards,
  getAllScorecards,
  saveHandlerScorecard,
  getHandlerCallMetrics,
  listAllUsers,
  updateUserRole,
  deleteUser,
  linkUserToHandler,
  listPreAuthorizations,
  addPreAuthorization,
  removePreAuthorization,
  logCallback,
  getCallbackLogs,
  resolveHandlerName,
  getCallScripts,
  updateCallScript,
  getCallbackSLAMetrics,
  getCallbackCompletionStats,
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
    markOnboardingSeen: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await import("./db").then((m) => m.getDb());
      if (db) {
        const { eq } = await import("drizzle-orm");
        const { users } = await import("../drizzle/schema");
        await db.update(users).set({ onboardingSeenAt: new Date() }).where(eq(users.id, ctx.user.id));
      }
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
          dateFrom: z.string().optional(),
          dateTo: z.string().optional(),
          limit: z.number().min(1).max(500).default(50),
          offset: z.number().min(0).default(0),
          sortBy: z.enum(["createdAt", "handlerName", "priority", "status"]).optional(),
          sortDir: z.enum(["asc", "desc"]).optional(),
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
        // Normalize partial handler names (e.g. "Jayla" → "Jayla Bernard")
        if (data.handlerName) {
          data.handlerName = await resolveHandlerName(data.handlerName);
        }
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
        // Normalize partial handler names (e.g. "Jayla" → "Jayla Bernard")
        const resolvedHandlerName = await resolveHandlerName(input.handlerName);
        const id = await createIntakeRecord({
          ...input,
          handlerName: resolvedHandlerName,
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

    fullAnalytics: protectedProcedure.query(async () => {
      return getFullCallAnalytics();
    }),

    callerHistory: protectedProcedure
      .input(z.object({ phone: z.string() }))
      .query(async ({ input }) => {
        return getCallerHistory(input.phone);
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

    // ── Scorecard push to handler profiles ──
    allScorecards: protectedProcedure.query(async () => {
      return getAllScorecards();
    }),

    handlerScorecards: protectedProcedure
      .input(z.object({ handlerId: z.number() }))
      .query(async ({ input }) => {
        return getHandlerScorecards(input.handlerId);
      }),

    saveScorecard: protectedProcedure
      .input(
        z.object({
          handlerId: z.number(),
          handlerName: z.string(),
          weekOf: z.string(), // "YYYY-MM-DD" (Monday of the week)
          greetingScore: z.number().min(1).max(10).optional(),
          holdManagementScore: z.number().min(1).max(10).optional(),
          resolutionScore: z.number().min(1).max(10).optional(),
          empathyScore: z.number().min(1).max(10).optional(),
          callControlScore: z.number().min(1).max(10).optional(),
          overallScore: z.number().min(1).max(10).optional(),
          strengths: z.string().optional(),
          improvements: z.string().optional(),
          managerComments: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const id = await saveHandlerScorecard({
          ...input,
          submittedBy: ctx.user?.name ?? "Manager",
        });
        return { id, success: true };
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
    history: protectedProcedure
      .input(z.object({ phone: z.string() }))
      .query(async ({ input }) => {
        return getCallerHistory(input.phone);
      }),
  }),

  // ─── Handler Metrics ──────────────────────────────────────────────────
  handlerMetrics: router({
    byName: protectedProcedure
      .input(z.object({ handlerName: z.string() }))
      .query(async ({ input }) => {
        return getHandlerCallMetrics(input.handlerName);
      }),
    callbackSLA: protectedProcedure
      .input(z.object({ handlerName: z.string().optional() }))
      .query(async ({ input }) => {
        return getCallbackSLAMetrics(input.handlerName);
      }),
    callbackStats: protectedProcedure
      .input(z.object({ handlerName: z.string().optional() }))
      .query(async ({ input }) => {
        return getCallbackCompletionStats(input.handlerName);
      }),
  }),

  // ─── Batch Call Classification ────────────────────────────────────────
  classify: router({
    status: protectedProcedure.query(async () => {
      return getUnclassifiedCount();
    }),
    runBatch: protectedProcedure
      .input(z.object({ batchSize: z.number().min(1).max(50).default(10) }))
      .mutation(async ({ input }) => {
        return classifyCallBatch(input.batchSize);
      }),
  }),

  // ─── User Management (admin only) ──────────────────────────────────
  userManagement: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      return listAllUsers();
    }),
    updateRole: protectedProcedure
      .input(z.object({ userId: z.number(), role: z.enum(["user", "admin"]) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        await updateUserRole(input.userId, input.role);
        return { success: true };
      }),
    remove: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        await deleteUser(input.userId);
        return { success: true };
      }),
    linkToHandler: protectedProcedure
      .input(z.object({ userId: z.number(), handlerProfileId: z.number().nullable() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        await linkUserToHandler(input.userId, input.handlerProfileId);
        return { success: true };
      }),
    // Pre-authorizations
    listPreAuths: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      return listPreAuthorizations();
    }),
    addPreAuth: protectedProcedure
      .input(z.object({
        email: z.string().email(),
        role: z.enum(["admin", "user"]),
        handlerProfileId: z.number().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        await addPreAuthorization(
          input.email,
          input.role,
          input.handlerProfileId ?? null,
          ctx.user.name ?? ctx.user.email ?? "admin"
        );
        return { success: true };
      }),
    removePreAuth: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        await removePreAuthorization(input.id);
        return { success: true };
      }),
  }),  // ─── Handler Actions ───────────────────────────────────────────────────────
  handlerActions: router({
    calledBack: protectedProcedure
      .input(z.object({ intakeId: z.number(), handlerName: z.string().optional() }))
      .mutation(async ({ input }) => {
        await markCalledBack(input.intakeId, input.handlerName);
        return { success: true };
      }),
  }),

  // ─── Callback Logs ───────────────────────────────────────────────────────
  callbacks: router({
    log: protectedProcedure
      .input(z.object({
        intakeId: z.number(),
        disposition: z.enum(["reached", "no_answer", "left_voicemail", "wrong_number", "busy"]),
        notes: z.string().optional(),
        outcome: z.enum(["resolved", "escalated", "follow_up", "closed"]).optional(),
        closeRecord: z.boolean().optional(),
        newNotes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const handlerName = ctx.user?.name ?? undefined;
        const logId = await logCallback({
          intakeId: input.intakeId,
          handlerName,
          disposition: input.disposition,
          notes: input.notes,
          outcome: input.outcome ?? "follow_up",
        });
        // Update the intake record
        const updates: Record<string, unknown> = {
          callbackAt: new Date(),
          callbackHandlerName: handlerName,
        };
        if (input.closeRecord || input.outcome === "resolved" || input.outcome === "closed") {
          updates.status = "closed";
        }
        if (input.newNotes) {
          updates.notes = input.newNotes;
        }
        await updateIntakeRecord(input.intakeId, updates as any);
        return { success: true, logId };
      }),
    history: protectedProcedure
      .input(z.object({ intakeId: z.number() }))
      .query(async ({ input }) => {
        return getCallbackLogs(input.intakeId);
      }),
  }),

  // ─── Settings (admin only) ────────────────────────────────────────────────
  settings: router({
    getCallScripts: protectedProcedure.query(async () => {
      return getCallScripts();
    }),
    updateCallScript: protectedProcedure
      .input(z.object({
        callerType: z.string(),
        script: z.string().min(1),
        label: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        await updateCallScript(input.callerType, input.script, ctx.user.name ?? undefined, input.label);
        return { success: true };
      }),
  }),
});
export type AppRouter = typeof appRouter;
