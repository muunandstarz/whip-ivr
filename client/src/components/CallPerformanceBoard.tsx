import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, BarChart3, CheckCircle2, Clock3, PhoneCall, PhoneMissed, RefreshCw, Users } from 'lucide-react';
import { format } from 'date-fns';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Period = '30d' | '90d' | 'all' | 'month';

type Agent = {
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

type WorkingTotals = {
  total: number;
  inbound: number;
  outbound: number;
  answered: number;
  missed: number;
  voicemail: number;
  previousTotal: number;
  averageDurationSeconds: number;
  averageDurationWeight: number;
};

function formatSeconds(seconds: number) {
  if (!seconds) return '—';
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}m ${String(remainder).padStart(2, '0')}s` : `${remainder}s`;
}

function Change({ value, suffix = '', label }: { value: number; suffix?: string; label?: string }) {
  if (value === 0) return <span className="text-xs text-muted-foreground">No change{label ? ` vs ${label}` : ''}</span>;
  const positive = value > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${positive ? 'text-emerald-600' : 'text-rose-600'}`}>
      {positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
      {positive ? '+' : ''}{value}{suffix}{label ? ` vs ${label}` : ' vs prior'}
    </span>
  );
}

function percentage(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function monthLabel(month: string) {
  return format(new Date(`${month}-01T12:00:00`), 'MMMM yyyy');
}

export default function CallPerformanceBoard() {
  const [period, setPeriod] = useState<Period>('month');
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [teamFilter, setTeamFilter] = useState('all');
  const [agentFilter, setAgentFilter] = useState('all');
  const queryInput = useMemo(() => ({ period, ...(period === 'month' ? { month: selectedMonth } : {}) }), [period, selectedMonth]);
  const { data, isLoading, isFetching, refetch } = trpc.calls.performanceDashboard.useQuery(queryInput, { staleTime: 60_000, refetchInterval: 60_000 });

  useEffect(() => {
    if (period !== 'month' || !data?.availableMonths.length) return;
    if (!data.availableMonths.includes(selectedMonth)) setSelectedMonth(data.availableMonths.at(-1) ?? selectedMonth);
  }, [data?.availableMonths, period, selectedMonth]);

  const matchingAgents = useMemo(() => (data?.agents ?? []).filter((agent: Agent) => (teamFilter === 'all' || agent.team === teamFilter) && (agentFilter === 'all' || agent.agent === agentFilter)), [data?.agents, teamFilter, agentFilter]);
  const trendForScope = useMemo(() => (data?.monthlyTrend ?? []).map((row) => {
    const scoped = row.agentTotals.filter((agent) => (teamFilter === 'all' || agent.team === teamFilter) && (agentFilter === 'all' || agent.agent === agentFilter));
    const total = scoped.reduce((sum, agent) => sum + agent.total, 0);
    const answered = scoped.reduce((sum, agent) => sum + agent.answered, 0);
    const missed = scoped.reduce((sum, agent) => sum + agent.missed, 0);
    return { ...row, total, answered, missed, answerRate: percentage(answered, total) };
  }), [data?.monthlyTrend, teamFilter, agentFilter]);
  const maxVolume = useMemo(() => Math.max(...trendForScope.map((row) => row.total), 1), [trendForScope]);
  const matchingTotals = useMemo(() => matchingAgents.reduce<WorkingTotals>((sum, agent: Agent) => ({
    total: sum.total + agent.total,
    inbound: sum.inbound + agent.inbound,
    outbound: sum.outbound + agent.outbound,
    answered: sum.answered + agent.answered,
    missed: sum.missed + agent.missed,
    voicemail: sum.voicemail + agent.voicemail,
    previousTotal: sum.previousTotal + agent.previousTotal,
    averageDurationSeconds: sum.averageDurationSeconds + (agent.averageDurationSeconds * agent.total),
    averageDurationWeight: sum.averageDurationWeight + agent.total,
  }), { total: 0, inbound: 0, outbound: 0, answered: 0, missed: 0, voicemail: 0, previousTotal: 0, averageDurationSeconds: 0, averageDurationWeight: 0 }), [matchingAgents]);
  const appliedAnswerRate = percentage(matchingTotals.answered, matchingTotals.total);
  const appliedAverageDuration = matchingTotals.averageDurationWeight ? Math.round(matchingTotals.averageDurationSeconds / matchingTotals.averageDurationWeight) : 0;
  const currentScope = agentFilter !== 'all' ? agentFilter : teamFilter !== 'all' ? teamFilter : 'Claims team';

  if (isLoading) return <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading call performance…</CardContent></Card>;
  if (!data) return null;

  return (
    <section className="space-y-4" aria-label="Call performance">
      <div className="flex flex-col justify-between gap-3 xl:flex-row xl:items-end">
        <div>
          <div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-[#ff6221]" /><h2 className="text-lg font-bold text-foreground">Performance overview</h2></div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Claims-team Aircall performance only. Choose a calendar month, team, or handler to see progress in the working view; historical trend begins {data.earliestMonth ? monthLabel(data.earliestMonth) : 'when tracking began'}.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <Select value={period} onValueChange={(value) => setPeriod(value as Period)}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="month">Calendar month</SelectItem><SelectItem value="30d">Last 30 days</SelectItem><SelectItem value="90d">Last 90 days</SelectItem><SelectItem value="all">Since tracking began</SelectItem></SelectContent>
          </Select>
          {period === 'month' && <Select value={selectedMonth} onValueChange={setSelectedMonth}><SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Select a month" /></SelectTrigger><SelectContent>{[...data.availableMonths].reverse().map((month) => <SelectItem key={month} value={month}>{monthLabel(month)}</SelectItem>)}</SelectContent></Select>}
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching} aria-label="Refresh call performance"><RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /></Button>
        </div>
      </div>

      <Card className="border-[#171b31]/15 bg-muted/20">
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-end">
          <div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Working view</p><p className="mt-1 text-base font-semibold text-foreground">{currentScope} · {data.periodLabel}</p><p className="mt-0.5 text-xs text-muted-foreground">Filter the same period by operating team or a single handler; volume comparisons use {data.previousPeriodLabel.toLowerCase()}.</p></div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Select value={teamFilter} onValueChange={(value) => { setTeamFilter(value); setAgentFilter('all'); }}><SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="All claims teams" /></SelectTrigger><SelectContent><SelectItem value="all">All claims teams</SelectItem>{data.teams.map((team) => <SelectItem key={team.name} value={team.name}>{team.name}</SelectItem>)}</SelectContent></Select>
            <Select value={agentFilter} onValueChange={setAgentFilter}><SelectTrigger className="w-full sm:w-52"><SelectValue placeholder="All handlers" /></SelectTrigger><SelectContent><SelectItem value="all">All handlers</SelectItem>{data.agents.filter((agent: Agent) => teamFilter === 'all' || agent.team === teamFilter).map((agent: Agent) => <SelectItem key={agent.agent} value={agent.agent}>{agent.agent}</SelectItem>)}</SelectContent></Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-[#ff6221]/30"><CardContent className="p-4"><div className="flex items-center justify-between"><span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recorded calls</span><PhoneCall className="h-4 w-4 text-[#ff6221]" /></div><p className="mt-2 text-2xl font-bold">{matchingTotals.total.toLocaleString()}</p><Change value={matchingTotals.total - matchingTotals.previousTotal} suffix=" calls" label={data.previousPeriodLabel} /></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center justify-between"><span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recorded answer rate</span><Users className="h-4 w-4 text-emerald-600" /></div><p className="mt-2 text-2xl font-bold text-emerald-700">{appliedAnswerRate}%</p><p className="text-xs text-muted-foreground">{matchingTotals.answered.toLocaleString()} answered outcomes</p></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center justify-between"><span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Missed / voicemail</span><PhoneMissed className="h-4 w-4 text-rose-600" /></div><p className="mt-2 text-2xl font-bold text-rose-700">{(matchingTotals.missed + matchingTotals.voicemail).toLocaleString()}</p><p className="text-xs text-muted-foreground">{matchingTotals.missed.toLocaleString()} missed · {matchingTotals.voicemail.toLocaleString()} voicemail</p></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center justify-between"><span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Average handle</span><Clock3 className="h-4 w-4 text-sky-600" /></div><p className="mt-2 text-2xl font-bold text-sky-700">{formatSeconds(appliedAverageDuration)}</p><p className="text-xs text-muted-foreground">For the current roster-filtered view</p></CardContent></Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Progress since tracking began</CardTitle><p className="text-xs font-normal text-muted-foreground">{currentScope} monthly call volume and recorded answer rate</p></CardHeader><CardContent className="pt-1"><div className="flex h-44 items-end gap-2 border-b px-1 pb-5">{trendForScope.map((row) => <div key={row.month} className={`group flex h-full min-w-0 flex-1 flex-col justify-end ${period === 'month' && row.month === selectedMonth ? 'opacity-100' : ''}`} title={`${monthLabel(row.month)}: ${row.total} calls, ${row.answerRate}% answer rate`}><div className="relative flex flex-1 items-end justify-center"><div className={`w-full max-w-10 rounded-t transition-opacity ${period === 'month' && row.month === selectedMonth ? 'bg-[#171b31]' : 'bg-[#ff6221]/80 group-hover:bg-[#ff6221]'}`} style={{ height: `${Math.max(6, (row.total / maxVolume) * 100)}%` }} /><span className="absolute bottom-1 rounded bg-foreground px-1.5 py-0.5 text-[10px] font-semibold text-background opacity-0 shadow transition-opacity group-hover:opacity-100">{row.answerRate}%</span></div><span className="mt-1 text-center text-[10px] text-muted-foreground">{format(new Date(`${row.month}-01T12:00:00`), 'MMM')}</span></div>)}</div><div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-[#ff6221]" />Call volume</span><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-[#171b31]" />Selected month</span><span>Hover a month for its recorded answer rate.</span></div></CardContent></Card>
        <Card className="border-amber-200 bg-amber-50/40"><CardHeader className="pb-2"><CardTitle className="text-sm text-amber-900">Clean attribution</CardTitle></CardHeader><CardContent className="space-y-3 text-sm text-amber-950/80"><p><strong>{data.unassigned.total.toLocaleString()} queue calls</strong> in this period have no named Aircall agent. They are intentionally excluded from named-handler metrics.</p><p><strong>Only the configured Claims roster appears below.</strong> Catherine, Madeline, and users from other departments are excluded from this operational view; their historical records remain intact.</p><p className="text-xs leading-relaxed text-amber-900/70">{data.methodology}</p></CardContent></Card>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {data.teams.map((team) => <button key={team.name} type="button" onClick={() => { setTeamFilter(team.name); setAgentFilter('all'); }} className="text-left"><Card className={`h-full transition-shadow hover:shadow-md ${teamFilter === team.name ? 'border-[#ff6221] ring-1 ring-[#ff6221]/25' : team.name === 'Processors' ? 'border-[#ff6221]/40 shadow-sm' : ''}`}><CardContent className="p-4"><div className="flex items-center justify-between gap-2"><h3 className="font-semibold text-foreground">{team.name}</h3>{team.name === 'Processors' && <Badge className="border-0 bg-[#ff6221]/15 text-[#c74614]">Priority focus</Badge>}</div><p className="mt-1 min-h-8 text-xs text-muted-foreground">{team.members.join(' · ')}</p><div className="mt-3 grid grid-cols-2 gap-3"><div><p className="text-xl font-bold">{team.total.toLocaleString()}</p><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Handled calls</p></div><div><p className="text-xl font-bold text-emerald-700">{team.answerRate}%</p><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Answer rate</p></div></div><div className="mt-3 flex items-center justify-between border-t pt-3"><Change value={team.volumeChange} suffix=" calls" label={data.previousPeriodLabel} /><span className="text-xs text-muted-foreground">{team.inbound} in · {team.outbound} out</span></div></CardContent></Card></button>)}
      </div>

      <Card><CardHeader className="pb-2"><CardTitle className="text-sm">{agentFilter !== 'all' ? `${agentFilter} — performance` : teamFilter !== 'all' ? `${teamFilter} — handler performance` : 'Individual call performance'}</CardTitle><p className="text-xs font-normal text-muted-foreground">{matchingAgents.length === 1 ? 'Single-handler view for the selected period.' : 'Roster-scoped handlers only; select a team card or handler above to narrow this table.'}</p></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-y bg-muted/30 text-left text-xs text-muted-foreground"><th className="px-4 py-2.5 font-medium">Handler</th><th className="px-3 py-2.5 font-medium">Team</th><th className="px-3 py-2.5 text-right font-medium">Calls</th><th className="px-3 py-2.5 text-right font-medium">In / Out</th><th className="px-3 py-2.5 text-right font-medium">Answer rate</th><th className="px-3 py-2.5 text-right font-medium">Avg handle</th><th className="px-4 py-2.5 text-right font-medium">Change</th></tr></thead><tbody className="divide-y">{matchingAgents.map((agent: Agent) => <tr key={agent.agent} className="hover:bg-muted/20"><td className="px-4 py-3 font-medium">{agent.agent}</td><td className="px-3 py-3"><Badge variant="outline" className="font-normal">{agent.team}</Badge></td><td className="px-3 py-3 text-right tabular-nums">{agent.total.toLocaleString()}</td><td className="px-3 py-3 text-right text-muted-foreground tabular-nums">{agent.inbound} / {agent.outbound}</td><td className="px-3 py-3 text-right font-medium text-emerald-700">{agent.answerRate}%</td><td className="px-3 py-3 text-right text-muted-foreground">{formatSeconds(agent.averageDurationSeconds)}</td><td className="px-4 py-3 text-right"><Change value={agent.totalChange} suffix=" calls" label={data.previousPeriodLabel} /></td></tr>)}{matchingAgents.length === 0 && <tr><td colSpan={7} className="px-4 py-9 text-center text-sm text-muted-foreground"><CheckCircle2 className="mx-auto mb-2 h-5 w-5 text-muted-foreground/60" />No calls recorded for the selected roster view.</td></tr>}</tbody></table></div></CardContent></Card>
    </section>
  );
}
