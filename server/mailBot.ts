import { getDb } from "./db";
import {
  mailBotAgents, mailBotAssignments, mailBotConfig, mailBotPto, mailBotRuns,
} from "../drizzle/schema";
import type { MailBotAgent } from "../drizzle/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

// ─── Classification ────────────────────────────────────────────────────────────

export type MailType =
  | "Lawsuit / Complaint"
  | "Summons / Service of Process"
  | "Subpoena"
  | "Warrant"
  | "Police Inquiry"
  | "Government Request"
  | "Attorney General / Regulatory"
  | "HR / Workers Comp / UI Mail"
  | "LOR / Letter of Representation"
  | "BI Injury Demand"
  | "Medical Bills / PIP Demand"
  | "Demand Letter"
  | "PD Demand"
  | "Total Loss Document"
  | "Subrogation Document"
  | "General / Other";

const LEGAL_TYPES = new Set<MailType>([
  "Lawsuit / Complaint",
  "Summons / Service of Process",
  "Subpoena",
  "Warrant",
  "Police Inquiry",
  "Government Request",
  "Attorney General / Regulatory",
  "HR / Workers Comp / UI Mail",
]);

interface ClassificationRule {
  type: MailType;
  patterns: RegExp[];
}

const CLASSIFICATION_RULES: ClassificationRule[] = [
  { type: "Lawsuit / Complaint",          patterns: [/lawsuit|complaint|notice of filing|filing suit|\bjudgment\b/i] },
  { type: "Summons / Service of Process", patterns: [/summons|service of process/i] },
  { type: "Subpoena",                     patterns: [/subpoena/i] },
  { type: "Warrant",                      patterns: [/\bwarrant\b(?!y)/i] },
  { type: "Police Inquiry",               patterns: [/police inquiry/i] },
  { type: "Government Request",           patterns: [/government request/i] },
  { type: "Attorney General / Regulatory",patterns: [/attorney general|regulatory notice/i] },
  { type: "HR / Workers Comp / UI Mail",  patterns: [/workers comp|unemployment|\bhr\b|ui mail/i] },
  { type: "LOR / Letter of Representation", patterns: [/\blor\b|letter of rep/i] },
  { type: "BI Injury Demand",             patterns: [/bi demand|bodily injury demand/i] },
  { type: "Medical Bills / PIP Demand",   patterns: [/medical bill|pip demand/i] },
  { type: "Demand Letter",               patterns: [/demand letter/i] },
  { type: "PD Demand",                   patterns: [/pd demand|property damage demand/i] },
  { type: "Total Loss Document",          patterns: [/total loss|salvage|diminished value|tl settlement|tl letter/i] },
  { type: "Subrogation Document",         patterns: [/subrogation|subro demand|recovery letter|adverse carrier|subro packet/i] },
];

export function classifyMailItem(fileName: string, messageText: string): { mailType: MailType; isLegal: boolean } {
  const combined = `${fileName} ${messageText}`.toLowerCase();
  for (const rule of CLASSIFICATION_RULES) {
    if (rule.patterns.some(p => p.test(combined))) {
      return { mailType: rule.type, isLegal: LEGAL_TYPES.has(rule.type) };
    }
  }
  return { mailType: "General / Other", isLegal: false };
}

// ─── Assignment Engine ─────────────────────────────────────────────────────────

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

async function isAgentOnPto(agentId: number): Promise<boolean> {
  const today = todayUTC();
  const db = await getDb();
  if (!db) return false;
  const rows = await db.select().from(mailBotPto)
    .where(and(eq(mailBotPto.agentId, agentId), sql`${mailBotPto.startDate} <= ${today} AND ${mailBotPto.endDate} >= ${today}`))
    .limit(1);
  return rows.length > 0;
}

async function countTodayAssignments(slackId: string): Promise<number> {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const db = await getDb();
  if (!db) return 0;
  const rows = await db.select({ count: sql<number>`COUNT(*)` })
    .from(mailBotAssignments)
    .where(and(eq(mailBotAssignments.assignedSlackId, slackId), gte(mailBotAssignments.processedAt, todayStart)));
  return rows[0]?.count ?? 0;
}

export async function resolveAssignee(mailType: MailType, isLegal: boolean): Promise<{ name: string; slackId: string } | null> {
  const db = await getDb();
  if (!db) return null;
  const agents = await db.select().from(mailBotAgents).where(eq(mailBotAgents.isActive, true));

  if (isLegal) {
    const jasmine = agents.find(a => a.role === "legal");
    return jasmine ? { name: jasmine.name, slackId: jasmine.slackId } : null;
  }

  if (mailType === "BI Injury Demand" || mailType === "Medical Bills / PIP Demand" || mailType === "Demand Letter") {
    const jayla = agents.find(a => a.role === "bi_injury");
    return jayla ? { name: jayla.name, slackId: jayla.slackId } : null;
  }

  if (mailType === "PD Demand") {
    const gio = agents.find(a => a.role === "pd");
    return gio ? { name: gio.name, slackId: gio.slackId } : null;
  }

  // Total Loss Documents: total_loss pool (priority) → subro_docs pool (secondary) → general_roundrobin (third)
  if (mailType === "Total Loss Document") {
    const tlPool = agents.filter((a: MailBotAgent) => a.role === "total_loss").sort((a: MailBotAgent, b: MailBotAgent) => a.roundRobinOrder - b.roundRobinOrder);
    for (const agent of tlPool) {
      if (await isAgentOnPto(agent.id)) continue;
      const count = await countTodayAssignments(agent.slackId);
      if (count < agent.dailyCap) return { name: agent.name, slackId: agent.slackId };
    }
    const subroPool2 = agents.filter((a: MailBotAgent) => a.role === "subro_docs").sort((a: MailBotAgent, b: MailBotAgent) => a.roundRobinOrder - b.roundRobinOrder);
    for (const agent of subroPool2) {
      if (await isAgentOnPto(agent.id)) continue;
      const count = await countTodayAssignments(agent.slackId);
      if (count < agent.dailyCap) return { name: agent.name, slackId: agent.slackId };
    }
    const genPool2 = agents.filter((a: MailBotAgent) => a.role === "general_roundrobin").sort((a: MailBotAgent, b: MailBotAgent) => a.roundRobinOrder - b.roundRobinOrder);
    for (const agent of genPool2) {
      if (await isAgentOnPto(agent.id)) continue;
      const count = await countTodayAssignments(agent.slackId);
      if (count < agent.dailyCap) return { name: agent.name, slackId: agent.slackId };
    }
    const overflow2 = genPool2.find((a: MailBotAgent) => a.isOverflowTarget);
    return overflow2 ? { name: overflow2.name, slackId: overflow2.slackId } : null;
  }

  // Subrogation Documents: subro_docs pool (primary) → general_roundrobin (secondary)
  if (mailType === "Subrogation Document") {
    const subroPool = agents.filter((a: MailBotAgent) => a.role === "subro_docs").sort((a: MailBotAgent, b: MailBotAgent) => a.roundRobinOrder - b.roundRobinOrder);
    for (const agent of subroPool) {
      if (await isAgentOnPto(agent.id)) continue;
      const count = await countTodayAssignments(agent.slackId);
      if (count < agent.dailyCap) return { name: agent.name, slackId: agent.slackId };
    }
    const genPool3 = agents.filter((a: MailBotAgent) => a.role === "general_roundrobin").sort((a: MailBotAgent, b: MailBotAgent) => a.roundRobinOrder - b.roundRobinOrder);
    for (const agent of genPool3) {
      if (await isAgentOnPto(agent.id)) continue;
      const count = await countTodayAssignments(agent.slackId);
      if (count < agent.dailyCap) return { name: agent.name, slackId: agent.slackId };
    }
    const overflow3 = genPool3.find((a: MailBotAgent) => a.isOverflowTarget);
    return overflow3 ? { name: overflow3.name, slackId: overflow3.slackId } : null;
  }

  // Round-robin roles
  const role = mailType === "LOR / Letter of Representation" ? "lor_roundrobin" : "general_roundrobin";
  const pool = agents.filter((a: MailBotAgent) => a.role === role).sort((a: MailBotAgent, b: MailBotAgent) => a.roundRobinOrder - b.roundRobinOrder);

  for (const agent of pool) {
    if (await isAgentOnPto(agent.id)) continue;
    const count = await countTodayAssignments(agent.slackId);
    if (count < agent.dailyCap) {
      return { name: agent.name, slackId: agent.slackId };
    }
  }

  // Overflow to first overflow target
  const overflow = pool.find((a: MailBotAgent) => a.isOverflowTarget);
  return overflow ? { name: overflow.name, slackId: overflow.slackId } : null;
}

// ─── Slack API ─────────────────────────────────────────────────────────────────

async function slackPost(token: string, channel: string, blocks: object[], text: string): Promise<{ ts?: string; ok: boolean }> {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ channel, blocks, text }),
  });
  return res.json() as Promise<{ ts?: string; ok: boolean }>;
}

async function slackReact(token: string, channel: string, ts: string, emoji: string): Promise<void> {
  await fetch("https://slack.com/api/reactions.add", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ channel, timestamp: ts, name: emoji }),
  });
}

async function slackReply(token: string, channel: string, ts: string, text: string): Promise<void> {
  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ channel, thread_ts: ts, text }),
  });
}

async function slackGetMessages(token: string, channelId: string, oldest?: string): Promise<SlackMessage[]> {
  const params = new URLSearchParams({ channel: channelId, limit: "200" });
  if (oldest) params.set("oldest", oldest);
  const res = await fetch(`https://slack.com/api/conversations.history?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json() as { ok: boolean; messages?: SlackMessage[] };
  return data.messages ?? [];
}

interface SlackMessage {
  ts: string;
  text?: string;
  files?: Array<{ name?: string; title?: string; permalink?: string }>;
  reactions?: Array<{ name: string }>;
}

// ─── Google Sheet Logging ──────────────────────────────────────────────────────

async function logToGoogleSheet(appsScriptUrl: string, row: {
  date: string; claimNumber: string; state: string; vehicleType: string;
  mailType: string; team: string; assignedHandler: string; notes: string;
}): Promise<void> {
  try {
    await fetch(appsScriptUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "appendRow", ...row }),
    });
  } catch {
    // Non-fatal: sheet logging failure should not block assignment
  }
}

// ─── Main Bot Runner ───────────────────────────────────────────────────────────

export interface BotRunOptions {
  trigger: "scheduled" | "manual_mail" | "manual_fax";
  source: "slack_mail" | "gmail_fax" | "both";
  batchSize?: number;
  lookbackHours?: number;
  scanMode?: "hours" | "all_time";
}

export async function runMailBot(options: BotRunOptions): Promise<{ runId: string; assigned: number; skipped: number; errors: string[] }> {
  const runId = randomUUID();
  const startedAt = new Date();
  const errors: string[] = [];
  let itemsFound = 0, itemsAssigned = 0, itemsSkipped = 0;

  // Load config
  const db = await getDb();
  if (!db) return { runId, assigned: 0, skipped: 0, errors: ["Database unavailable"] };
  const configRows = await db.select().from(mailBotConfig).where(eq(mailBotConfig.id, 1)).limit(1);
  const config = configRows[0];
  if (!config) throw new Error("Mail bot config not found");

  const token = config.slackBotToken ?? process.env.SLACK_BOT_TOKEN ?? "";
  const batchSize = options.batchSize ?? config.batchSize;
  const lookbackHours = options.lookbackHours ?? config.lookbackHours;
  // scanMode: options.scanMode overrides DB config (used for manual runs)
  const scanMode = options.scanMode ?? config.scanMode ?? "hours";
  const mailChannelId = config.claimsMailChannelId;
  const hubChannelId = config.claimsHubChannelId;

  if (!token) {
    errors.push("No Slack bot token configured");
    await db.insert(mailBotRuns).values({ runId, trigger: options.trigger, source: options.source, itemsFound: 0, itemsAssigned: 0, itemsSkipped: 0, errors: errors.join("\n"), startedAt, completedAt: new Date(), durationMs: 0 });
    return { runId, assigned: 0, skipped: 0, errors };
  }

  try {
    if (options.source === "slack_mail" || options.source === "both") {
      const oldest = scanMode === "all_time"
        ? undefined
        : String(Math.floor((Date.now() - lookbackHours * 3600 * 1000) / 1000));
      const messages = await slackGetMessages(token, mailChannelId, oldest);

      // Determine which reactions count as "reviewed"
      const reviewedMarkers = (config.backlogReviewedMarkers ?? "white_check_mark,eyes,heavy_check_mark")
        .split(",").map((s: string) => s.trim()).filter(Boolean);
      // Filter: has file attachment, not already reviewed
      const unprocessed = messages.filter(m =>
        m.files && m.files.length > 0 &&
        !m.reactions?.some(r => reviewedMarkers.includes(r.name))
      );

      itemsFound += unprocessed.length;

      // ── Backlog Clearance Mode ────────────────────────────────────────────────
      const today = new Date().toISOString().slice(0, 10);
      const backlogActive = config.backlogModeEnabled &&
        (!config.backlogModeEndDate || today <= config.backlogModeEndDate);
      let batch: typeof unprocessed;
      if (backlogActive) {
        const effectiveBatch = config.backlogBatchSize ?? 22;
        const splitRatio = Number(config.backlogSplitRatio ?? 0.5);
        const oldCount = Math.round(effectiveBatch * splitRatio);
        const newCount = effectiveBatch - oldCount;
        // oldest first: Slack returns newest-first, so sort ascending for oldest
        const sortedOldest = [...unprocessed].sort((a, b) => Number(a.ts) - Number(b.ts));
        const sortedNewest = [...unprocessed].sort((a, b) => Number(b.ts) - Number(a.ts));
        const oldBatch = sortedOldest.slice(0, oldCount);
        const oldTsSet = new Set(oldBatch.map(m => m.ts));
        const newBatch = sortedNewest.filter(m => !oldTsSet.has(m.ts)).slice(0, newCount);
        // Deduplicate
        const seen = new Set<string>();
        batch = [...oldBatch, ...newBatch].filter(m => {
          if (seen.has(m.ts)) return false;
          seen.add(m.ts);
          return true;
        });
      } else {
        batch = unprocessed.slice(0, batchSize);
      }

      for (const msg of batch) {
        try {
          const file = msg.files![0];
          const fileName = file.name ?? file.title ?? "";
          const msgText = msg.text ?? "";
          const { mailType, isLegal } = classifyMailItem(fileName, msgText);
          const assignee = await resolveAssignee(mailType, isLegal);

          if (!assignee) {
            itemsSkipped++;
            continue;
          }

          const isLegalMsg = isLegal;
          const emoji = isLegalMsg ? "🚨" : "📬";
          const label = isLegalMsg ? `LEGAL — URGENT` : `MAIL TRIAGE — ${mailType.toUpperCase()}`;
          const permalink = file.permalink ?? `https://slack.com/archives/${mailChannelId}/p${msg.ts.replace(".", "")}`;

          // 1. Post to #claims-hub
          await slackPost(token, hubChannelId, [
            { type: "section", text: { type: "mrkdwn", text: `${emoji} *${label}*\nAssigned to: <@${assignee.slackId}>\nFile: \`${fileName}\`\n<${permalink}|View in #claims-mail>` } }
          ], `${emoji} ${label} → ${assignee.name}`);

          // 2. React ✅ on original
          await slackReact(token, mailChannelId, msg.ts, "white_check_mark");

          // 3. Thread reply on original
          const replyText = isLegalMsg
            ? `🚨 LEGAL — Assigned to <@${assignee.slackId}> — ${mailType}`
            : `✅ Assigned to <@${assignee.slackId}> — ${mailType}`;
          await slackReply(token, mailChannelId, msg.ts, replyText);

          // 4. Log to DB
          await db.insert(mailBotAssignments).values({
            source: "slack_mail",
            slackMessageTs: msg.ts,
            slackChannelId: mailChannelId,
            fileName,
            messageText: msgText.slice(0, 500),
            mailType,
            isLegal: isLegalMsg,
            assignedTo: assignee.name,
            assignedSlackId: assignee.slackId,
            status: "open",
            runId,
          });

          // 5. Log to Google Sheet (non-fatal)
          if (config.appsScriptUrl) {
            await logToGoogleSheet(config.appsScriptUrl, {
              date: new Date().toLocaleDateString("en-US"),
              claimNumber: "", state: "", vehicleType: "",
              mailType, team: isLegalMsg ? "Legal" : "Claims",
              assignedHandler: assignee.name, notes: fileName,
            });
          }

          itemsAssigned++;
        } catch (err) {
          errors.push(`Message ${msg.ts}: ${err instanceof Error ? err.message : String(err)}`);
          itemsSkipped++;
        }
      }

      itemsSkipped += unprocessed.length - batch.length; // remaining beyond batch
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  const completedAt = new Date();
  const durationMs = completedAt.getTime() - startedAt.getTime();

  await db.insert(mailBotRuns).values({
    runId, trigger: options.trigger, source: options.source,
    itemsFound, itemsAssigned, itemsSkipped,
    errors: errors.length ? errors.join("\n") : null,
    startedAt, completedAt, durationMs,
  });

  return { runId, assigned: itemsAssigned, skipped: itemsSkipped, errors };
}
