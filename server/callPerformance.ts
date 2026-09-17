import { sql } from 'drizzle-orm';
import { getDb } from './db.js';

export type PerformancePeriod = '30d' | '90d' | 'all' | 'month';

type TeamDefinition = { name: string; members: string[]; aliases: string[] };

/**
 * The operating roster deliberately contains only the team the user asked to
 * manage in Call Performance. Raw Aircall records are retained elsewhere, but
 * they are never credited to this view's claims-team metrics.
 */
export const PERFORMANCE_TEAMS: TeamDefinition[] = [
  { name: 'Processors', members: ['Daryl Ochate', 'MJ Badua'], aliases: ['daryl ochate', 'mj badua', 'mary joy badua'] },
  { name: 'Subrogation', members: ['Tim Chan', 'Daniel Giono'], aliases: ['tim chan', 'daniel giono'] },
  { name: 'Intake', members: ['Ana Padilla', 'Bennet Carlos', 'Carlito Legarde'], aliases: ['ana padilla', 'bennet carlos', 'carlito legarde', 'carlito legarde jr'] },
  { name: 'First Party', members: ['Jovel Villa', 'Annie Ortiz', 'Natashia Edulan', 'Lorraine Tria'], aliases: ['jovel villa', 'annie ortiz', 'natashia edulan', 'lorraine tria'] },
  { name: 'Liability', members: ['Giovanni Cabrera', 'Jayla Bernard'], aliases: ['giovanni cabrera', 'geovanni cabrera', 'jayla bernard'] },
];

const DISPLAY_ALIASES: Record<string, string> = {
  'mary joy badua': 'MJ Badua',
  'mj badua': 'MJ Badua',
  'carlito legarde jr': 'Carlito Legarde',
  'carlito legarde': 'Carlito Legarde',
  'geovanni cabrera': 'Giovanni Cabrera',
  'giovanni cabrera': 'Giovanni Cabrera',
};

const TRACKED_ROSTER = new Set(PERFORMANCE_TEAMS.flatMap((team) => team.members));

export function normalizePerformanceAgent(name: string | null | undefined) {
  const normalized = (name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  if (!normalized) return 'Unassigned';
  return DISPLAY_ALIASES[normalized] ?? (name ?? '').trim();
}

export function teamForAgent(name: string) {
  const normalized = name.trim().toLowerCase();
  return PERFORMANCE_TEAMS.find((team) => team.aliases.includes(normalized))?.name ?? 'Other';
}

export function isTrackedPerformanceAgent(name: string | null | undefined) {
  return TRACKED_ROSTER.has(normalizePerformanceAgent(name));
}

export function percentage(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
}

export function change(current: number, previous: number) {
  return current - previous;
}

type AggregateRow = {
  agent: string | null;
  total: number | string;
  inbound: number | string;
  outbound: number | string;
  answered: number | string;
  missed: number | string;
  voicemail: number | string;
  averageDuration: number | string | null;
};

type AgentMetrics = {
  agent: string;
  team: string;
  total: number;
  inbound: number;
  outbound: number;
  answered: number;
  missed: number;
  voicemail: number;
  answerRate: number;
  averageDurationSeconds: number;
  previousTotal: number;
  totalChange: number;
  previousAnswerRate: number;
  answerRateChange: number;
};

type DateWindow = {
  currentStart: Date | null;
  currentEnd: Date | null;
  previousStart: Date | null;
  previousEnd: Date | null;
  label: string;
  previousLabel: string;
};

function rollupRows(rows: AggregateRow[]) {
  const map = new Map<string, Omit<AgentMetrics, 'team' | 'answerRate' | 'previousTotal' | 'totalChange' | 'previousAnswerRate' | 'answerRateChange'>>();
  for (const row of rows) {
    const agent = normalizePerformanceAgent(row.agent);
    const existing = map.get(agent) ?? { agent, total: 0, inbound: 0, outbound: 0, answered: 0, missed: 0, voicemail: 0, averageDurationSeconds: 0 };
    const total = Number(row.total ?? 0);
    const previousWeight = existing.total;
    existing.total += total;
    existing.inbound += Number(row.inbound ?? 0);
    existing.outbound += Number(row.outbound ?? 0);
    existing.answered += Number(row.answered ?? 0);
    existing.missed += Number(row.missed ?? 0);
    existing.voicemail += Number(row.voicemail ?? 0);
    const duration = Number(row.averageDuration ?? 0);
    existing.averageDurationSeconds = existing.total > 0
      ? Math.round(((existing.averageDurationSeconds * previousWeight) + (duration * total)) / existing.total)
      : 0;
    map.set(agent, existing);
  }
  return map;
}

function calendarMonthStart(month: string): Date | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const [year, monthIndex] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthIndex - 1, 1));
}

function monthLabel(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function dateWindow(period: PerformancePeriod, now: Date, selectedMonth?: string): DateWindow {
  if (period === 'month') {
    const currentStart = calendarMonthStart(selectedMonth ?? '') ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const currentEnd = new Date(Date.UTC(currentStart.getUTCFullYear(), currentStart.getUTCMonth() + 1, 1));
    const previousStart = new Date(Date.UTC(currentStart.getUTCFullYear(), currentStart.getUTCMonth() - 1, 1));
    return {
      currentStart,
      currentEnd,
      previousStart,
      previousEnd: currentStart,
      label: monthLabel(currentStart),
      previousLabel: monthLabel(previousStart),
    };
  }
  if (period === 'all') {
    return { currentStart: null, currentEnd: null, previousStart: null, previousEnd: null, label: 'Since tracking began', previousLabel: 'No prior comparison' };
  }
  const days = period === '30d' ? 30 : 90;
  const currentStart = new Date(now.getTime() - days * 86_400_000);
  const previousStart = new Date(now.getTime() - days * 2 * 86_400_000);
  return {
    currentStart,
    currentEnd: null,
    previousStart,
    previousEnd: currentStart,
    label: period === '30d' ? 'Last 30 days' : 'Last 90 days',
    previousLabel: `Previous ${days} days`,
  };
}

async function aggregateForWindow(start: Date | null, end: Date | null) {
  const db = await getDb();
  if (!db) throw new Error('Database unavailable');
  const lower = start ? sql`AND startedAt >= ${start}` : sql``;
  const upper = end ? sql`AND startedAt < ${end}` : sql``;
  const results = await db.execute<AggregateRow>(sql`
    SELECT
      COALESCE(agentName, 'Unassigned') AS agent,
      CAST(COUNT(*) AS SIGNED) AS total,
      CAST(SUM(CASE WHEN direction = 'inbound' THEN 1 ELSE 0 END) AS SIGNED) AS inbound,
      CAST(SUM(CASE WHEN direction = 'outbound' THEN 1 ELSE 0 END) AS SIGNED) AS outbound,
      CAST(SUM(CASE WHEN status = 'answered' THEN 1 ELSE 0 END) AS SIGNED) AS answered,
      CAST(SUM(CASE WHEN status = 'missed' THEN 1 ELSE 0 END) AS SIGNED) AS missed,
      CAST(SUM(CASE WHEN status = 'voicemail' THEN 1 ELSE 0 END) AS SIGNED) AS voicemail,
      ROUND(AVG(COALESCE(durationSeconds, 0))) AS averageDuration
    FROM call_history
    WHERE 1 = 1 ${lower} ${upper}
    GROUP BY agentName
  `);
  return ((results as unknown as AggregateRow[][])[0] ?? []);
}

async function monthlyTrend() {
  const db = await getDb();
  if (!db) throw new Error('Database unavailable');
  const results = await db.execute<AggregateRow & { month: string }>(sql`
    SELECT DATE_FORMAT(startedAt, '%Y-%m') AS month,
      COALESCE(agentName, 'Unassigned') AS agent,
      CAST(COUNT(*) AS SIGNED) AS total,
      CAST(SUM(CASE WHEN direction = 'inbound' THEN 1 ELSE 0 END) AS SIGNED) AS inbound,
      CAST(SUM(CASE WHEN direction = 'outbound' THEN 1 ELSE 0 END) AS SIGNED) AS outbound,
      CAST(SUM(CASE WHEN status = 'answered' THEN 1 ELSE 0 END) AS SIGNED) AS answered,
      CAST(SUM(CASE WHEN status = 'missed' THEN 1 ELSE 0 END) AS SIGNED) AS missed,
      CAST(SUM(CASE WHEN status = 'voicemail' THEN 1 ELSE 0 END) AS SIGNED) AS voicemail,
      ROUND(AVG(COALESCE(durationSeconds, 0))) AS averageDuration
    FROM call_history
    GROUP BY DATE_FORMAT(startedAt, '%Y-%m'), agentName
    ORDER BY month ASC
  `);
  const raw = (results as unknown as Array<Array<AggregateRow & { month: string }>>)[0] ?? [];
  const byMonth = new Map<string, AggregateRow[]>();
  for (const row of raw) {
    if (!isTrackedPerformanceAgent(row.agent)) continue;
    const bucket = byMonth.get(row.month) ?? [];
    bucket.push(row);
    byMonth.set(row.month, bucket);
  }
  return Array.from(byMonth.entries()).map(([month, rows]) => {
    const agents = Array.from(rollupRows(rows).values()).map((agent) => ({
      ...agent,
      team: teamForAgent(agent.agent),
      answerRate: percentage(agent.answered, agent.total),
    }));
    const total = agents.reduce((sum, agent) => sum + agent.total, 0);
    const answered = agents.reduce((sum, agent) => sum + agent.answered, 0);
    const missed = agents.reduce((sum, agent) => sum + agent.missed, 0);
    return { month, total, answered, missed, answerRate: percentage(answered, total), agentTotals: agents };
  });
}

export async function getCallPerformanceDashboard(period: PerformancePeriod = '90d', selectedMonth?: string, now = new Date()) {
  const window = dateWindow(period, now, selectedMonth);
  const [currentRows, previousRows, trend] = await Promise.all([
    aggregateForWindow(window.currentStart, window.currentEnd),
    window.previousStart && window.previousEnd ? aggregateForWindow(window.previousStart, window.previousEnd) : Promise.resolve([]),
    monthlyTrend(),
  ]);
  const current = rollupRows(currentRows);
  const previous = rollupRows(previousRows);
  const agents: AgentMetrics[] = Array.from(TRACKED_ROSTER)
    .map((agent) => {
      const metrics = current.get(agent) ?? { agent, total: 0, inbound: 0, outbound: 0, answered: 0, missed: 0, voicemail: 0, averageDurationSeconds: 0 };
      const prior = previous.get(agent);
      const previousTotal = prior?.total ?? 0;
      const previousAnswerRate = prior ? percentage(prior.answered, prior.total) : 0;
      return {
        ...metrics,
        agent,
        team: teamForAgent(agent),
        answerRate: percentage(metrics.answered, metrics.total),
        previousTotal,
        totalChange: change(metrics.total, previousTotal),
        previousAnswerRate,
        answerRateChange: change(percentage(metrics.answered, metrics.total), previousAnswerRate),
      };
    })
    .sort((a, b) => {
      const teamA = PERFORMANCE_TEAMS.findIndex((team) => team.name === a.team);
      const teamB = PERFORMANCE_TEAMS.findIndex((team) => team.name === b.team);
      return (teamA === -1 ? 99 : teamA) - (teamB === -1 ? 99 : teamB) || b.total - a.total || a.agent.localeCompare(b.agent);
    });

  const teamSummaries = PERFORMANCE_TEAMS.map((team) => {
    const members = agents.filter((agent) => agent.team === team.name);
    const totals = members.reduce((sum, agent) => ({
      total: sum.total + agent.total,
      inbound: sum.inbound + agent.inbound,
      outbound: sum.outbound + agent.outbound,
      answered: sum.answered + agent.answered,
      missed: sum.missed + agent.missed,
      voicemail: sum.voicemail + agent.voicemail,
      previousTotal: sum.previousTotal + agent.previousTotal,
    }), { total: 0, inbound: 0, outbound: 0, answered: 0, missed: 0, voicemail: 0, previousTotal: 0 });
    return {
      name: team.name,
      members: team.members,
      ...totals,
      answerRate: percentage(totals.answered, totals.total),
      volumeChange: change(totals.total, totals.previousTotal),
    };
  });

  const allCurrent = agents.reduce((sum, agent) => ({ total: sum.total + agent.total, answered: sum.answered + agent.answered, missed: sum.missed + agent.missed, voicemail: sum.voicemail + agent.voicemail, inbound: sum.inbound + agent.inbound, outbound: sum.outbound + agent.outbound, previousTotal: sum.previousTotal + agent.previousTotal }), { total: 0, answered: 0, missed: 0, voicemail: 0, inbound: 0, outbound: 0, previousTotal: 0 });
  const rawUnassigned = current.get('Unassigned');
  const unassigned = rawUnassigned ? {
    total: rawUnassigned.total,
    missed: rawUnassigned.missed,
    inbound: rawUnassigned.inbound,
    answerRate: percentage(rawUnassigned.answered, rawUnassigned.total),
  } : { total: 0, missed: 0, inbound: 0, answerRate: 0 };

  return {
    period,
    selectedMonth: period === 'month' ? `${window.currentStart!.getUTCFullYear()}-${String(window.currentStart!.getUTCMonth() + 1).padStart(2, '0')}` : null,
    periodLabel: window.label,
    previousPeriodLabel: window.previousLabel,
    generatedAt: now,
    earliestMonth: trend[0]?.month ?? null,
    availableMonths: trend.map((row) => row.month),
    totals: {
      ...allCurrent,
      answerRate: percentage(allCurrent.answered, allCurrent.total),
      volumeChange: change(allCurrent.total, allCurrent.previousTotal),
    },
    unassigned,
    teams: teamSummaries,
    agents,
    monthlyTrend: trend,
    methodology: 'Claims-team performance includes only the named Processors, Intake, First Party, and Liability roster. Queue calls without a named Aircall agent remain separate. Changes compare the immediately preceding matching period and describe recorded movement, not proof of a specific cause.',
  };
}
