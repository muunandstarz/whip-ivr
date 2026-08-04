import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import {
  mailBotConfig, mailBotAgents, mailBotPto, mailBotAssignments, mailBotRuns,
} from "../../drizzle/schema";
import { eq, desc, and, gte, lte } from "drizzle-orm";
import { runMailBot } from "../mailBot";

function adminOnly(role: string) {
  if (role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
}

export const mailBotRouter = router({
  // ── Config ──────────────────────────────────────────────────────────────────
  getConfig: protectedProcedure.query(async ({ ctx }) => {
    adminOnly(ctx.user.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const rows = await db.select().from(mailBotConfig).where(eq(mailBotConfig.id, 1)).limit(1);
    return rows[0] ?? null;
  }),

  updateConfig: protectedProcedure
    .input(z.object({
      batchSize: z.number().int().min(1).max(50).optional(),
      processMailChannel: z.boolean().optional(),
      processFax: z.boolean().optional(),
      lookbackHours: z.number().int().min(1).max(168).optional(),
      claimsMailChannelId: z.string().optional(),
      claimsHubChannelId: z.string().optional(),
      googleSheetId: z.string().optional(),
      appsScriptUrl: z.string().optional(),
      slackBotToken: z.string().optional(),
      scheduleEnabled: z.boolean().optional(),
      cronExpression: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      adminOnly(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(mailBotConfig).set(input).where(eq(mailBotConfig.id, 1));
      return { success: true };
    }),

  // ── Agents ───────────────────────────────────────────────────────────────────
  listAgents: protectedProcedure.query(async ({ ctx }) => {
    adminOnly(ctx.user.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(mailBotAgents).orderBy(mailBotAgents.role, mailBotAgents.roundRobinOrder);
  }),

  updateAgent: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      slackId: z.string().optional(),
      role: z.enum(["legal", "lor_roundrobin", "bi_injury", "pd", "general_roundrobin", "total_loss", "subro_docs"]).optional(),
      dailyCap: z.number().int().min(0).max(999).optional(),
      isActive: z.boolean().optional(),
      roundRobinOrder: z.number().int().optional(),
      isOverflowTarget: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      adminOnly(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...updates } = input;
      await db.update(mailBotAgents).set(updates).where(eq(mailBotAgents.id, id));
      return { success: true };
    }),

  addAgent: protectedProcedure
    .input(z.object({
      name: z.string(),
      slackId: z.string(),
      role: z.enum(["legal", "lor_roundrobin", "bi_injury", "pd", "general_roundrobin", "total_loss", "subro_docs"]),
      dailyCap: z.number().int().min(0).max(999).default(3),
      isActive: z.boolean().default(true),
      roundRobinOrder: z.number().int().default(0),
      isOverflowTarget: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      adminOnly(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(mailBotAgents).values(input);
      return { success: true };
    }),

  removeAgent: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      adminOnly(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(mailBotAgents).where(eq(mailBotAgents.id, input.id));
      return { success: true };
    }),

  // ── PTO ──────────────────────────────────────────────────────────────────────
  listPto: protectedProcedure.query(async ({ ctx }) => {
    adminOnly(ctx.user.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(mailBotPto).orderBy(desc(mailBotPto.startDate));
  }),

  addPto: protectedProcedure
    .input(z.object({
      agentId: z.number(),
      startDate: z.string(),
      endDate: z.string(),
      note: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      adminOnly(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(mailBotPto).values(input);
      return { success: true };
    }),

  removePto: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      adminOnly(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(mailBotPto).where(eq(mailBotPto.id, input.id));
      return { success: true };
    }),

  // ── Assignments ──────────────────────────────────────────────────────────────
  listAssignments: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(500).default(100),
      offset: z.number().int().min(0).default(0),
      status: z.enum(["open", "in_review", "actioned", "closed"]).optional(),
      assignedTo: z.string().optional(),
      mailType: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      adminOnly(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const conditions = [];
      if (input.status) conditions.push(eq(mailBotAssignments.status, input.status));
      if (input.assignedTo) conditions.push(eq(mailBotAssignments.assignedTo, input.assignedTo));
      if (input.mailType) conditions.push(eq(mailBotAssignments.mailType, input.mailType));
      if (input.dateFrom) conditions.push(gte(mailBotAssignments.processedAt, new Date(input.dateFrom)));
      if (input.dateTo) conditions.push(lte(mailBotAssignments.processedAt, new Date(input.dateTo)));
      const rows = await db.select().from(mailBotAssignments)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(mailBotAssignments.processedAt))
        .limit(input.limit)
        .offset(input.offset);
      return rows;
    }),

  updateAssignment: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["open", "in_review", "actioned", "closed"]).optional(),
      claimNumber: z.string().optional(),
      state: z.string().optional(),
      notes: z.string().optional(),
      actionTaken: z.string().optional(),
      reviewedBy: z.string().optional(),
      denialSent: z.boolean().optional(),
      denialType: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      adminOnly(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...updates } = input;
      await db.update(mailBotAssignments).set(updates).where(eq(mailBotAssignments.id, id));
      return { success: true };
    }),

  // ── Run History ───────────────────────────────────────────────────────────────
  listRuns: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(20) }))
    .query(async ({ ctx, input }) => {
      adminOnly(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select().from(mailBotRuns).orderBy(desc(mailBotRuns.startedAt)).limit(input.limit);
    }),

  // ── Bot Control ───────────────────────────────────────────────────────────────
  runNow: protectedProcedure
    .input(z.object({
      source: z.enum(["slack_mail", "gmail_fax", "both"]),
      batchSize: z.number().int().min(1).max(50).optional(),
      lookbackHours: z.number().int().min(1).max(168).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      adminOnly(ctx.user.role);
      const result = await runMailBot({
        trigger: input.source === "gmail_fax" ? "manual_fax" : "manual_mail",
        source: input.source,
        batchSize: input.batchSize,
        lookbackHours: input.lookbackHours,
      });
      return result;
    }),

  // ── Stats ─────────────────────────────────────────────────────────────────────
  getStats: protectedProcedure.query(async ({ ctx }) => {
    adminOnly(ctx.user.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const [total, todayRows, open, legal] = await Promise.all([
      db.select({ count: mailBotAssignments.id }).from(mailBotAssignments),
      db.select({ count: mailBotAssignments.id }).from(mailBotAssignments).where(gte(mailBotAssignments.processedAt, today)),
      db.select({ count: mailBotAssignments.id }).from(mailBotAssignments).where(eq(mailBotAssignments.status, "open")),
      db.select({ count: mailBotAssignments.id }).from(mailBotAssignments).where(eq(mailBotAssignments.isLegal, true)),
    ]);
    return {
      total: total.length,
      today: todayRows.length,
      open: open.length,
      legal: legal.length,
    };
  }),
});
