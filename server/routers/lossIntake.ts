import { TRPCError } from "@trpc/server";
import { parse as parseCookie } from "cookie";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { createHeartbeatJob, updateHeartbeatJob } from "../_core/heartbeat";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createLossIntakeQa,
  getLatestLossIntakeSyncRun,
  getLossIntakeClaimDetail,
  getLossIntakeOverview,
  getLossIntakeSettings,
  getRepComparisonMetrics,
  getHandlerLossIntakeStats,
  getTodayRepActivity,
  getAwaitingOutreachClaims,
  reassignClaims,
  listLossIntakeClaims,
  listLossIntakeHandlers,
  listLossIntakeQas,
  updateLossIntakeQa,
  updateLossIntakeSettings,
  type RepComparisonPeriod,
} from "../lossIntakeDb";
import { runLossIntakeSlackSync } from "../lossIntakeSlackSync";

const stageSchema = z.enum([
  "awaiting_outreach",
  "outreach_started",
  "contact_attempts",
  "complete",
]);
const slaSchema = z.enum(["within_sla", "at_risk", "breached"]);
const vehicleSchema = z.enum(["gas", "ev_tesla", "unknown"]);
const qaStatusSchema = z.enum([
  "draft",
  "reviewed",
  "sent",
  "opened",
  "acknowledged",
  "resolved",
]);

function requireAdmin(user: { role: string }) {
  if (user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Supervisor access required" });
  }
}

// Handler IDs authorized to access Loss Intake (Carlito=4, Ana=6, Bennet=30003)
const LOSS_INTAKE_HANDLER_IDS = new Set([4, 6, 30003]);

function requireLossIntakeAccess(user: { role: string; handlerProfileId?: number | null }) {
  if (user.role === "admin") return;
  if (user.handlerProfileId && LOSS_INTAKE_HANDLER_IDS.has(user.handlerProfileId)) return;
  throw new TRPCError({ code: "FORBIDDEN", message: "Loss Intake access is restricted." });
}

function scopeHandlerId(
  user: { role: string; handlerProfileId?: number | null },
  requested?: number,
): number | undefined {
  if (user.role === "admin") return requested;
  if (!user.handlerProfileId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Your user account is not linked to a handler profile.",
    });
  }
  return user.handlerProfileId;
}

function optionalDate(value?: number) {
  return value === undefined ? undefined : new Date(value);
}

const dateScopeInput = z.object({
  dateFromMs: z.number().int().optional(),
  dateToMs: z.number().int().optional(),
  handlerId: z.number().int().positive().optional(),
});

export const lossIntakeRouter = router({
  overview: protectedProcedure
    .input(dateScopeInput)
    .query(async ({ ctx, input }) => {
      requireLossIntakeAccess(ctx.user);
      const handlerId = scopeHandlerId(ctx.user, input.handlerId);
      return getLossIntakeOverview({
        handlerId,
        dateFrom: optionalDate(input.dateFromMs),
        dateTo: optionalDate(input.dateToMs),
      });
    }),

  claims: router({
    list: protectedProcedure
      .input(
        dateScopeInput.extend({
          search: z.string().max(120).optional(),
          stage: stageSchema.optional(),
          slaState: slaSchema.optional(),
          vehicleType: vehicleSchema.optional(),
          agentName: z.string().max(120).optional(),
          limit: z.number().int().min(1).max(200).default(50),
          offset: z.number().int().min(0).default(0),
        }),
      )
      .query(async ({ ctx, input }) => {
        requireLossIntakeAccess(ctx.user);
        const handlerId = scopeHandlerId(ctx.user, input.handlerId);
        return listLossIntakeClaims({
          search: input.search,
          stage: input.stage,
          slaState: input.slaState,
          vehicleType: input.vehicleType,
          agentName: input.agentName,
          handlerId,
          dateFrom: optionalDate(input.dateFromMs),
          dateTo: optionalDate(input.dateToMs),
          limit: input.limit,
          offset: input.offset,
        });
      }),

    get: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        requireLossIntakeAccess(ctx.user);
        const handlerId = scopeHandlerId(ctx.user);
        const detail = await getLossIntakeClaimDetail(input.id, handlerId);
        if (!detail) throw new TRPCError({ code: "NOT_FOUND" });
        return detail;
      }),
  }),

  qa: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const handlerId = scopeHandlerId(ctx.user);
      return listLossIntakeQas(handlerId);
    }),

    createDraft: protectedProcedure
      .input(
        z.object({
          claimId: z.number().int().positive(),
          handlerId: z.number().int().positive(),
          handlerName: z.string().min(1).max(128),
          dueAtMs: z.number().int(),
          score: z.number().int().min(0).max(100),
          strengths: z.array(z.string().max(500)).max(20).optional(),
          coachingPoints: z.array(z.string().max(500)).max(20).optional(),
          managerComments: z.string().max(4000).optional(),
          issueNow: z.boolean().default(false),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        requireAdmin(ctx.user);
        const id = await createLossIntakeQa({
          claimId: input.claimId,
          handlerId: input.handlerId,
          handlerName: input.handlerName,
          overallScore: input.score,
          strengths: JSON.stringify(input.strengths ?? []),
          coachingOpportunities: JSON.stringify(input.coachingPoints ?? []),
          managerComments: input.managerComments ?? null,
          createdBy: ctx.user.name ?? ctx.user.email ?? "Supervisor",
          status: input.issueNow ? "sent" : "draft",
          sentAt: input.issueNow ? new Date() : null,
        });
        return { id };
      }),

    managerUpdate: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          status: qaStatusSchema.optional(),
          managerComments: z.string().max(4000).nullable().optional(),
          coachingPoints: z.array(z.string().max(500)).max(20).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        requireAdmin(ctx.user);
        const { id, coachingPoints, ...patch } = input;
        await updateLossIntakeQa(id, {
          ...patch,
          coachingOpportunities:
            coachingPoints === undefined ? undefined : JSON.stringify(coachingPoints),
          sentAt: patch.status === "sent" ? new Date() : undefined,
          reviewedAt: patch.status === "reviewed" ? new Date() : undefined,
          resolvedAt: patch.status === "resolved" ? new Date() : undefined,
        });
        return { success: true };
      }),

    respond: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          response: z.string().min(1).max(4000),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const handlerId = scopeHandlerId(ctx.user);
        if (handlerId === undefined) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Supervisor View As is required to respond for a representative.",
          });
        }
        await updateLossIntakeQa(
          input.id,
          {
            repResponse: input.response,
            acknowledgedAt: new Date(),
            status: "acknowledged",
          },
          handlerId,
        );
        return { success: true };
      }),
  }),

  settings: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      requireAdmin(ctx.user);
      return getLossIntakeSettings();
    }),

    update: protectedProcedure
      .input(
        z.object({
          firstContactSlaMinutes: z.number().int().min(1).max(120).optional(),
          atRiskMinutes: z.number().int().min(1).max(119).optional(),
          qaDueHours: z.number().int().min(1).max(168).optional(),
          agentAssignments: z
            .array(
              z.object({
                slackUserId: z.string().min(1),
                handlerId: z.number().int().positive(),
                handlerName: z.string().min(1),
              }),
            )
            .max(100)
            .optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        requireAdmin(ctx.user);
        if (
          input.firstContactSlaMinutes !== undefined &&
          input.atRiskMinutes !== undefined &&
          input.atRiskMinutes >= input.firstContactSlaMinutes
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "At-risk threshold must be lower than the SLA threshold.",
          });
        }
        return updateLossIntakeSettings(
          input,
          ctx.user.name ?? ctx.user.email ?? "Supervisor",
        );
      }),
  }),

  handlers: protectedProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx.user);
    return listLossIntakeHandlers();
  }),

  todayActivity: protectedProcedure
    .input(z.object({ dateMs: z.number().int().optional() }).optional())
    .query(async ({ ctx, input }) => {
      requireLossIntakeAccess(ctx.user);
      return getTodayRepActivity(input?.dateMs);
    }),

  syncHealth: protectedProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx.user);
    const [settings, latestRun] = await Promise.all([
      getLossIntakeSettings(),
      getLatestLossIntakeSyncRun(),
    ]);
    return { settings, latestRun };
  }),

  sync: router({
    runNow: protectedProcedure.mutation(async ({ ctx }) => {
      requireAdmin(ctx.user);
      return runLossIntakeSlackSync();
    }),

    enableFiveMinuteSchedule: protectedProcedure.mutation(async ({ ctx }) => {
      requireAdmin(ctx.user);
      const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
      if (!sessionToken) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in again to enable scheduling." });
      }
      const settings = await getLossIntakeSettings();
      const schedule = {
        cron: "0 */5 * * * *",
        path: "/api/scheduled/loss-intake-sync",
        method: "POST" as const,
        payload: {},
        description: "Poll approved Slack claims channels every five minutes for Loss Intake SLA and QA monitoring.",
      };
      if (settings.scheduleCronTaskUid) {
        const result = await updateHeartbeatJob(
          settings.scheduleCronTaskUid,
          { ...schedule, enable: true },
          sessionToken,
        );
        return { taskUid: settings.scheduleCronTaskUid, ...result };
      }
      const result = await createHeartbeatJob(
        { name: "loss-intake-slack-sync", ...schedule },
        sessionToken,
      );
      await updateLossIntakeSettings(
        { scheduleCronTaskUid: result.taskUid },
        ctx.user.name ?? ctx.user.email ?? "Supervisor",
      );
      return result;
    }),

    pauseSchedule: protectedProcedure.mutation(async ({ ctx }) => {
      requireAdmin(ctx.user);
      const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
      const settings = await getLossIntakeSettings();
      if (!settings.scheduleCronTaskUid) return { success: true, skipped: "not_configured" as const };
      await updateHeartbeatJob(
        settings.scheduleCronTaskUid,
        { enable: false },
        sessionToken,
      );
      return { success: true };
    }),
  }),

  /** Side-by-side comparison metrics for all 3 loss intake reps */
  repComparison: protectedProcedure
    .input(z.object({ period: z.enum(["today", "week", "month", "ytd"]).default("month") }))
    .query(async ({ ctx, input }) => {
      requireLossIntakeAccess(ctx.user);
      return getRepComparisonMetrics(input.period as RepComparisonPeriod);
    }),

  /** Per-handler stats across week / month / YTD — used by individual handler dashboards */
  handlerStats: protectedProcedure
    .input(z.object({ agentName: z.string() }))
    .query(async ({ ctx, input }) => {
      requireLossIntakeAccess(ctx.user);
      return getHandlerLossIntakeStats(input.agentName);
    }),
  /** All claims in awaiting_outreach stage, optionally filtered by agent */
  awaitingOutreach: protectedProcedure
    .input(z.object({ agentName: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      requireLossIntakeAccess(ctx.user);
      return getAwaitingOutreachClaims(input.agentName);
    }),
  /** Bulk reassign a list of claims to a new agent */
  reassignClaims: protectedProcedure
    .input(z.object({
      claimIds: z.array(z.number()).min(1),
      newAgentName: z.string(),
      newHandlerId: z.number().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireLossIntakeAccess(ctx.user);
      await reassignClaims(input.claimIds, input.newAgentName, input.newHandlerId ?? null);
      return { success: true, reassigned: input.claimIds.length };
    }),

  /** Get all Aircall calls matched to a loss intake claim */
  claimCalls: protectedProcedure
    .input(z.object({ claimId: z.number() }))
    .query(async ({ ctx, input }) => {
      requireLossIntakeAccess(ctx.user);
      const { getCallsForClaim } = await import("../lossIntakeCallMatch");
      return getCallsForClaim(input.claimId);
    }),

  /** Get all AI QA scores for calls linked to a loss intake claim */
  claimCallQas: protectedProcedure
    .input(z.object({ claimId: z.number() }))
    .query(async ({ ctx, input }) => {
      requireLossIntakeAccess(ctx.user);
      const { getCallQasForClaim } = await import("../lossIntakeCallMatch");
      return getCallQasForClaim(input.claimId);
    }),

  /** Run call-to-claim matching for all unmatched calls */
  runCallMatching: protectedProcedure
    .mutation(async ({ ctx }) => {
      requireLossIntakeAccess(ctx.user);
      const { matchAllUnmatchedCalls } = await import("../lossIntakeCallMatch");
      return matchAllUnmatchedCalls();
    }),

  /** Transcribe and AI-score a specific call for a claim */
  scoreCall: protectedProcedure
    .input(z.object({
      callHistoryId: z.number(),
      lossIntakeClaimId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireLossIntakeAccess(ctx.user);
      const { transcribeAndScoreCall } = await import("../lossIntakeCallMatch");
      return transcribeAndScoreCall(input.callHistoryId, input.lossIntakeClaimId);
    }),
});
