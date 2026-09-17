import { sql } from 'drizzle-orm';
import { getDb } from './db.js';

export type PerformancePeriod = '30d' | '90d' | 'all';

type TeamDefinition = { name: string; members: string[]; aliases: string[] };

export const PERFORMANCE_TEAMS: TeamDefinition[] = [
  { name: 'Processors', members: ['Daryl Ochate', 'MJ Badua'], aliases: ['daryl ochate', 'mj badua', 'mary joy badua'] },
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

export function normalizePerformanceAgent(name: string | null | undefined) {
  const normalized = (name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  if (!normalized) return 'Unassigned';
  return DISPLAY_ALIASES[normalized] ?? (name ?? '').trim();
}

export function teamForAgent(name: string) {
  const normalized = name.toLowerCase();
  return PERFORMANCE_TEAMS.find((team) => team.aliases.includes(normalized))?.name ?? 'Other';
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

function dateWindow(period: PerformancePeriod, now: Date) {
  if (period === 'all') return { currentStart: null as Date | null, previousStart: null as Date | null, previousEnd: null as Date | null, label: 'Since tracking began' };
  const days = period === '30d' ? 30 : 90;
  const currentStart = new Date(now.getTime() - days * 86_400_000);
  const previousStart = new Date(now.getTime() - days * 2 * 86_400_000);
  return { currentStart, previousStart, previousEnd: currentStart, label: period === '30d' ? 'Last 30 days' : 'Last 90 days' };
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
  const results = await db.execute<{ month: string; total: number | string; answered: number | string; missed: number | string }>(sql`
    SELECT DATE_FORMAT(startedAt, '%Y-%m') AS month,
      CAST(COUNT(*) AS SIGNED) AS total,
      CAST(SUM(CASE WHEN status = 'answered' THEN 1 ELSE 0 END) AS SIGNED) AS answered,
      CAST(SUM(CASE WHEN status = 'missed' THEN 1 ELSE 0 END) AS SIGNED) AS missed
    FROM call_history
    GROUP BY DATE_FORMAT(startedAt, '%Y-%m')
    ORDER BY month ASC
  `);
  return ((results as unknown as Array<Array<{ month: string; total: number | string; answered: number | string; missed: number | string }>>)[0] ?? []).map((row) => {
    const total = Number(row.total);
    const answered = Number(row.answered);
    return { month: row.month, total, answered, missed: Number(row.missed), answerRate: percentage(answered, total) };
  });
}

export async function getCallPerformanceDashboard(period: PerformancePeriod = '90d', now = new Date()) {
  const window = dateWindow(period, now);
  const [currentRows, previousRows, trend] = await Promise.all([
    aggregateForWindow(window.currentStart, null),
    window.previousStart && window.previousEnd ? aggregateForWindow(window.previousStart, window.previousEnd) : Promise.resolve([]),
    monthlyTrend(),
  ]);
  const current = rollupRows(currentRows);
  const previous = rollupRows(previousRows);
  const roster = new Set(PERFORMANCE_TEAMS.flatMap((team) => team.members));
  const agentNames = Array.from(new Set([...Array.from(roster), ...Array.from(current.keys())]));
  const agents: AgentMetrics[] = agentNames
    .map((agent) => {
      const metrics = current.get(agent) ?? { agent, total: 0, inbound: 0, outbound: 0, answered: 0, missed: 0, voicemail: 0, averageDurationSeconds: 0 };
      const prior = previous.get(agent);
      const previousTotal = prior?.total ?? 0;
      const previousAnswerRate = prior ? percentage(prior.answered, prior.total) : 0;
      return {
        ...metrics,
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
  const unassigned = agents.find((agent) => agent.agent === 'Unassigned') ?? null;

  return {
    period,
    periodLabel: window.label,
    generatedAt: now,
    earliestMonth: trend[0]?.month ?? null,
    totals: {
      ...allCurrent,
      answerRate: percentage(allCurrent.answered, allCurrent.total),
      volumeChange: change(allCurrent.total, allCurrent.previousTotal),
    },
    unassigned: unassigned ? {
      total: unassigned.total,
      missed: unassigned.missed,
      inbound: unassigned.inbound,
      answerRate: unassigned.answerRate,
    } : { total: 0, missed: 0, inbound: 0, answerRate: 0 },
    teams: teamSummaries,
    agents: agents.filter((agent) => agent.agent !== 'Unassigned'),
    monthlyTrend: trend,
    methodology: 'Answer rate is based on recorded Aircall outcomes. Calls without a named Aircall agent remain separately visible as unassigned queue coverage; comparison figures use the immediately preceding period when available.',
  };
}
