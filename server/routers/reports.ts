/**
 * Reports Router — flexible report builder backend
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { savedReports } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

const ReportConfigSchema = z.object({
  reportType: z.enum([
    "call_volume",
    "caller_type",
    "handler_performance",
    "intake_status",
    "callback_outcomes",
    "member_billing",
  ]),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  groupBy: z.enum(["day", "week", "month"]).optional().default("month"),
  callerType: z.string().optional(),
  handlerName: z.string().optional(),
  direction: z.enum(["inbound", "outbound", "both"]).optional().default("both"),
});

type ReportConfig = z.infer<typeof ReportConfigSchema>;

function dateFormat(col: string, groupBy: string) {
  if (groupBy === "day") return `DATE_FORMAT(CONVERT_TZ(${col}, '+00:00', '-04:00'), '%Y-%m-%d')`;
  if (groupBy === "week") return `DATE_FORMAT(CONVERT_TZ(${col}, '+00:00', '-04:00'), '%Y-W%u')`;
  return `DATE_FORMAT(CONVERT_TZ(${col}, '+00:00', '-04:00'), '%Y-%m')`;
}

function buildDateFilter(col: string, dateFrom?: string, dateTo?: string): string {
  const parts: string[] = [];
  if (dateFrom) parts.push(`${col} >= '${dateFrom}'`);
  if (dateTo) parts.push(`${col} <= '${dateTo} 23:59:59'`);
  return parts.length ? "AND " + parts.join(" AND ") : "";
}

async function getClient() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  return (db as any).$client;
}

async function runCallVolumeReport(config: ReportConfig) {
  const client = await getClient();
  const fmt = dateFormat("startedAt", config.groupBy ?? "month");
  const dateFilter = buildDateFilter("startedAt", config.dateFrom, config.dateTo);
  const dirFilter = config.direction === "inbound" ? "AND direction='inbound'" : config.direction === "outbound" ? "AND direction='outbound'" : "";
  const callerFilter = config.callerType ? `AND callerType='${config.callerType}'` : "";
  const [rows] = await client.execute(`
    SELECT ${fmt} as period,
      COUNT(*) as total,
      SUM(CASE WHEN direction='inbound' THEN 1 ELSE 0 END) as inbound,
      SUM(CASE WHEN direction='outbound' THEN 1 ELSE 0 END) as outbound,
      SUM(CASE WHEN status='answered' THEN 1 ELSE 0 END) as answered,
      SUM(CASE WHEN status='missed' THEN 1 ELSE 0 END) as missed,
      SUM(CASE WHEN status='voicemail' THEN 1 ELSE 0 END) as voicemail,
      ROUND(AVG(durationSeconds)/60,1) as avg_duration_min,
      ROUND(SUM(CASE WHEN status='answered' AND direction='inbound' THEN 1 ELSE 0 END)*100.0/NULLIF(SUM(CASE WHEN direction='inbound' THEN 1 ELSE 0 END),0),1) as answer_rate_pct
    FROM call_history WHERE 1=1 ${dateFilter} ${dirFilter} ${callerFilter}
    GROUP BY period ORDER BY period`);
  return {
    rows,
    summary: {
      totalCalls: rows.reduce((s: number, r: any) => s + Number(r.total), 0),
      totalInbound: rows.reduce((s: number, r: any) => s + Number(r.inbound), 0),
      totalOutbound: rows.reduce((s: number, r: any) => s + Number(r.outbound), 0),
      totalAnswered: rows.reduce((s: number, r: any) => s + Number(r.answered), 0),
      totalMissed: rows.reduce((s: number, r: any) => s + Number(r.missed), 0),
    },
    columns: ["period","total","inbound","outbound","answered","missed","voicemail","avg_duration_min","answer_rate_pct"],
  };
}

async function runCallerTypeReport(config: ReportConfig) {
  const client = await getClient();
  const dateFilter = buildDateFilter("startedAt", config.dateFrom, config.dateTo);
  const dirFilter = config.direction === "inbound" ? "AND direction='inbound'" : config.direction === "outbound" ? "AND direction='outbound'" : "";
  const [rows] = await client.execute(`
    SELECT COALESCE(callerType,'unknown') as caller_type,
      COUNT(*) as total,
      SUM(CASE WHEN direction='inbound' THEN 1 ELSE 0 END) as inbound,
      SUM(CASE WHEN direction='outbound' THEN 1 ELSE 0 END) as outbound,
      SUM(CASE WHEN status='answered' THEN 1 ELSE 0 END) as answered,
      ROUND(AVG(durationSeconds)/60,1) as avg_duration_min,
      ROUND(COUNT(*)*100.0/SUM(COUNT(*)) OVER(),1) as pct_of_total
    FROM call_history WHERE 1=1 ${dateFilter} ${dirFilter}
    GROUP BY caller_type ORDER BY total DESC`);
  return { rows, summary: { totalCalls: rows.reduce((s: number, r: any) => s + Number(r.total), 0) }, columns: ["caller_type","total","inbound","outbound","answered","avg_duration_min","pct_of_total"] };
}

async function runHandlerPerformanceReport(config: ReportConfig) {
  const client = await getClient();
  const dateFilter = buildDateFilter("startedAt", config.dateFrom, config.dateTo);
  const handlerFilter = config.handlerName ? `AND agentName='${config.handlerName}'` : "";
  const [rows] = await client.execute(`
    SELECT COALESCE(agentName,'Unassigned') as handler,
      COUNT(*) as total_calls,
      SUM(CASE WHEN direction='inbound' THEN 1 ELSE 0 END) as inbound,
      SUM(CASE WHEN direction='outbound' THEN 1 ELSE 0 END) as outbound,
      SUM(CASE WHEN status='answered' AND direction='inbound' THEN 1 ELSE 0 END) as inbound_answered,
      ROUND(AVG(durationSeconds)/60,1) as avg_duration_min,
      ROUND(SUM(CASE WHEN status='answered' AND direction='inbound' THEN 1 ELSE 0 END)*100.0/NULLIF(SUM(CASE WHEN direction='inbound' THEN 1 ELSE 0 END),0),1) as answer_rate_pct
    FROM call_history WHERE agentName IS NOT NULL ${dateFilter} ${handlerFilter}
    GROUP BY handler ORDER BY total_calls DESC`);
  return { rows, summary: { handlerCount: rows.length }, columns: ["handler","total_calls","inbound","outbound","inbound_answered","avg_duration_min","answer_rate_pct"] };
}

async function runIntakeStatusReport(config: ReportConfig) {
  const client = await getClient();
  const dateFilter = buildDateFilter("createdAt", config.dateFrom, config.dateTo);
  const callerFilter = config.callerType ? `AND callerType='${config.callerType}'` : "";
  const handlerFilter = config.handlerName ? `AND handlerName='${config.handlerName}'` : "";
  const fmt = dateFormat("createdAt", config.groupBy ?? "month");
  const [rows] = await client.execute(`
    SELECT ${fmt} as period,
      COALESCE(callerType,'unknown') as caller_type,
      COALESCE(handlerName,'Unassigned') as handler,
      COUNT(*) as total,
      SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) as open_count,
      SUM(CASE WHEN status='closed' THEN 1 ELSE 0 END) as closed_count,
      SUM(CASE WHEN status='escalated' THEN 1 ELSE 0 END) as escalated_count,
      SUM(CASE WHEN priority='urgent' THEN 1 ELSE 0 END) as urgent_count
    FROM intake_records WHERE 1=1 ${dateFilter} ${callerFilter} ${handlerFilter}
    GROUP BY period, caller_type, handler ORDER BY period DESC, total DESC`);
  return {
    rows,
    summary: {
      totalIntakes: rows.reduce((s: number, r: any) => s + Number(r.total), 0),
      totalOpen: rows.reduce((s: number, r: any) => s + Number(r.open_count), 0),
      totalClosed: rows.reduce((s: number, r: any) => s + Number(r.closed_count), 0),
    },
    columns: ["period","caller_type","handler","total","open_count","closed_count","escalated_count","urgent_count"],
  };
}

async function runCallbackOutcomesReport(config: ReportConfig) {
  const client = await getClient();
  const dateFilter = buildDateFilter("cl.calledAt", config.dateFrom, config.dateTo);
  const handlerFilter = config.handlerName ? `AND cl.handlerName='${config.handlerName}'` : "";
  const [rows] = await client.execute(`
    SELECT cl.disposition,
      COALESCE(cl.handlerName,'Unassigned') as handler,
      COUNT(*) as count,
      ROUND(COUNT(*)*100.0/SUM(COUNT(*)) OVER(),1) as pct
    FROM callback_logs cl WHERE 1=1 ${dateFilter} ${handlerFilter}
    GROUP BY cl.disposition, handler ORDER BY count DESC`);
  const total = rows.reduce((s: number, r: any) => s + Number(r.count), 0);
  const reached = rows.filter((r: any) => r.disposition === "reached").reduce((s: number, r: any) => s + Number(r.count), 0);
  return { rows, summary: { total, reached, reachRate: total ? Math.round(reached * 100 / total) : 0 }, columns: ["disposition","handler","count","pct"] };
}

async function runMemberBillingReport(config: ReportConfig) {
  const client = await getClient();
  const fmt = dateFormat("createdAt", config.groupBy ?? "month");
  const dateFilter = buildDateFilter("createdAt", config.dateFrom, config.dateTo);
  const billingKw = `LOWER(COALESCE(message,'')) LIKE '%billing%' OR LOWER(COALESCE(message,'')) LIKE '%deductible%' OR LOWER(COALESCE(message,'')) LIKE '%payment%' OR LOWER(COALESCE(message,'')) LIKE '%invoice%' OR LOWER(COALESCE(message,'')) LIKE '%premium%' OR LOWER(COALESCE(rawTranscript,'')) LIKE '%billing%' OR LOWER(COALESCE(rawTranscript,'')) LIKE '%deductible%' OR LOWER(COALESCE(rawTranscript,'')) LIKE '%payment%'`;
  const [rows] = await client.execute(`
    SELECT ${fmt} as period,
      COUNT(*) as total_member_intakes,
      SUM(CASE WHEN ${billingKw} THEN 1 ELSE 0 END) as billing_related,
      ROUND(SUM(CASE WHEN ${billingKw} THEN 1 ELSE 0 END)*100.0/NULLIF(COUNT(*),0),1) as billing_pct
    FROM intake_records WHERE callerType='member' ${dateFilter}
    GROUP BY period ORDER BY period`);
  const [ibRows] = await client.execute(`
    SELECT ${dateFormat("startedAt", config.groupBy ?? "month")} as period,
      COUNT(*) as total_inbound,
      SUM(CASE WHEN callerType='member' THEN 1 ELSE 0 END) as member_inbound
    FROM call_history WHERE direction='inbound' ${buildDateFilter("startedAt", config.dateFrom, config.dateTo)}
    GROUP BY period ORDER BY period`);
  const merged = rows.map((r: any) => {
    const ib = ibRows.find((i: any) => i.period === r.period) || {};
    return { ...r, total_inbound: ib.total_inbound ?? null, member_inbound_calls: ib.member_inbound ?? null,
      member_pct_of_inbound: ib.total_inbound ? Math.round(Number(ib.member_inbound)*100/Number(ib.total_inbound)) : null };
  });
  const totalBilling = merged.reduce((s: number, r: any) => s + Number(r.billing_related), 0);
  const totalMember = merged.reduce((s: number, r: any) => s + Number(r.total_member_intakes), 0);
  return {
    rows: merged,
    summary: { totalMemberIntakes: totalMember, totalBillingRelated: totalBilling, overallBillingPct: totalMember ? Math.round(totalBilling*100/totalMember) : 0 },
    columns: ["period","total_inbound","member_inbound_calls","member_pct_of_inbound","total_member_intakes","billing_related","billing_pct"],
  };
}

export const reportsRouter = router({
  run: protectedProcedure
    .input(ReportConfigSchema)
    .query(async ({ input }) => {
      switch (input.reportType) {
        case "call_volume": return runCallVolumeReport(input);
        case "caller_type": return runCallerTypeReport(input);
        case "handler_performance": return runHandlerPerformanceReport(input);
        case "intake_status": return runIntakeStatusReport(input);
        case "callback_outcomes": return runCallbackOutcomesReport(input);
        case "member_billing": return runMemberBillingReport(input);
        default: throw new TRPCError({ code: "BAD_REQUEST" });
      }
    }),

  listSaved: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(savedReports).orderBy(savedReports.updatedAt);
  }),

  savePreset: protectedProcedure
    .input(z.object({
      id: z.number().optional(),
      name: z.string().min(1).max(255),
      description: z.string().max(512).optional(),
      config: ReportConfigSchema,
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      if (input.id) {
        await db.update(savedReports).set({ name: input.name, description: input.description, config: input.config, updatedAt: new Date() }).where(eq(savedReports.id, input.id));
        return { id: input.id };
      }
      const [result] = await db.insert(savedReports).values({ name: input.name, description: input.description, config: input.config, createdBy: ctx.user.name ?? ctx.user.email ?? undefined });
      return { id: (result as any).insertId };
    }),

  deletePreset: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(savedReports).where(eq(savedReports.id, input.id));
      return { success: true };
    }),
});
