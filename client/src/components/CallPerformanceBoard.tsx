import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, BarChart3, Clock3, PhoneCall, PhoneMissed, RefreshCw, Users } from 'lucide-react';
import { format } from 'date-fns';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Period = '30d' | '90d' | 'all';

function formatSeconds(seconds: number) {
  if (!seconds) return '—';
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}m ${String(remainder).padStart(2, '0')}s` : `${remainder}s`;
}

function Change({ value, suffix = '' }: { value: number; suffix?: string }) {
  if (value === 0) return <span className="text-xs text-muted-foreground">No change</span>;
  const positive = value > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${positive ? 'text-emerald-600' : 'text-rose-600'}`}>
      {positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
      {positive ? '+' : ''}{value}{suffix} vs prior
    </span>
  );
}

export default function CallPerformanceBoard() {
  const [period, setPeriod] = useState<Period>('90d');
  const { data, isLoading, isFetching, refetch } = trpc.calls.performanceDashboard.useQuery({ period }, { staleTime: 60_000, refetchInterval: 60_000 });
  const maxVolume = useMemo(() => Math.max(...(data?.monthlyTrend ?? []).map((row) => row.total), 1), [data?.monthlyTrend]);

  if (isLoading) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading call performance…</CardContent></Card>;
  }
  if (!data) return null;

  return (
    <section className="space-y-4" aria-label="Call performance">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-[#ff6221]" />
            <h2 className="text-lg font-bold text-foreground">Performance overview</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Live Aircall history, grouped by operating team and handler. Trends begin {data.earliestMonth ? format(new Date(`${data.earliestMonth}-01T12:00:00`), 'MMMM yyyy') : 'when tracking began'}.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={(value) => setPeriod(value as Period)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="all">Since tracking began</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching} aria-label="Refresh call performance">
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-[#ff6221]/30"><CardContent className="p-4"><div className="flex items-center justify-between"><span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Calls recorded</span><PhoneCall className="h-4 w-4 text-[#ff6221]" /></div><p className="mt-2 text-2xl font-bold">{data.totals.total.toLocaleString()}</p><Change value={data.totals.volumeChange} suffix=" calls" /></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center justify-between"><span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recorded answer rate</span><Users className="h-4 w-4 text-emerald-600" /></div><p className="mt-2 text-2xl font-bold text-emerald-700">{data.totals.answerRate}%</p><p className="text-xs text-muted-foreground">{data.totals.answered.toLocaleString()} answered outcomes</p></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center justify-between"><span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Missed / voicemail</span><PhoneMissed className="h-4 w-4 text-rose-600" /></div><p className="mt-2 text-2xl font-bold text-rose-700">{(data.totals.missed + data.totals.voicemail).toLocaleString()}</p><p className="text-xs text-muted-foreground">{data.totals.missed.toLocaleString()} missed · {data.totals.voicemail.toLocaleString()} voicemail</p></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center justify-between"><span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Unassigned queue calls</span><Clock3 className="h-4 w-4 text-amber-600" /></div><p className="mt-2 text-2xl font-bold text-amber-700">{data.unassigned.total.toLocaleString()}</p><p className="text-xs text-muted-foreground">{data.unassigned.missed.toLocaleString()} recorded missed; kept separate from handler performance</p></CardContent></Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Progress since tracking began</CardTitle><p className="text-xs font-normal text-muted-foreground">Monthly call volume and recorded answer rate</p></CardHeader>
          <CardContent className="pt-1">
            <div className="flex h-44 items-end gap-2 border-b px-1 pb-5">
              {data.monthlyTrend.map((row) => (
                <div key={row.month} className="group flex h-full min-w-0 flex-1 flex-col justify-end" title={`${row.month}: ${row.total} calls, ${row.answerRate}% answer rate`}>
                  <div className="relative flex flex-1 items-end justify-center">
                    <div className="w-full max-w-10 rounded-t bg-[#ff6221]/80 transition-opacity group-hover:bg-[#ff6221]" style={{ height: `${Math.max(6, (row.total / maxVolume) * 100)}%` }} />
                    <span className="absolute bottom-1 rounded bg-foreground px-1.5 py-0.5 text-[10px] font-semibold text-background opacity-0 shadow transition-opacity group-hover:opacity-100">{row.answerRate}%</span>
                  </div>
                  <span className="mt-1 text-center text-[10px] text-muted-foreground">{format(new Date(`${row.month}-01T12:00:00`), 'MMM')}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-[#ff6221]" />Call volume</span><span>Hover a month for its recorded answer rate.</span></div>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/40">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-amber-900">What the numbers can tell us</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-amber-950/80">
            <p><strong>{data.unassigned.total.toLocaleString()} calls</strong> in this view have no named Aircall agent. Their outcomes are shown separately so ring/queue coverage is not attributed to a handler.</p>
            <p>Team and handler comparisons use the <strong>immediately preceding matching period</strong>; a change means volume moved, not that a specific process caused it.</p>
            <p className="text-xs leading-relaxed text-amber-900/70">{data.methodology}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {data.teams.map((team) => (
          <Card key={team.name} className={team.name === 'Processors' ? 'border-[#ff6221]/40 shadow-sm' : ''}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2"><h3 className="font-semibold text-foreground">{team.name}</h3>{team.name === 'Processors' && <Badge className="border-0 bg-[#ff6221]/15 text-[#c74614]">Priority focus</Badge>}</div>
              <p className="mt-1 min-h-8 text-xs text-muted-foreground">{team.members.join(' · ')}</p>
              <div className="mt-3 grid grid-cols-2 gap-3"><div><p className="text-xl font-bold">{team.total.toLocaleString()}</p><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Handled calls</p></div><div><p className="text-xl font-bold text-emerald-700">{team.answerRate}%</p><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Answer rate</p></div></div>
              <div className="mt-3 flex items-center justify-between border-t pt-3"><Change value={team.volumeChange} suffix=" calls" /><span className="text-xs text-muted-foreground">{team.inbound} in · {team.outbound} out</span></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Individual call performance</CardTitle><p className="text-xs font-normal text-muted-foreground">Recorded calls by handler; sorted by requested operating team.</p></CardHeader>
        <CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-y bg-muted/30 text-left text-xs text-muted-foreground"><th className="px-4 py-2.5 font-medium">Handler</th><th className="px-3 py-2.5 font-medium">Team</th><th className="px-3 py-2.5 text-right font-medium">Calls</th><th className="px-3 py-2.5 text-right font-medium">In / Out</th><th className="px-3 py-2.5 text-right font-medium">Answer rate</th><th className="px-3 py-2.5 text-right font-medium">Avg handle</th><th className="px-4 py-2.5 text-right font-medium">Change</th></tr></thead><tbody className="divide-y">{data.agents.map((agent) => (<tr key={agent.agent} className="hover:bg-muted/20"><td className="px-4 py-3 font-medium">{agent.agent}</td><td className="px-3 py-3"><Badge variant="outline" className="font-normal">{agent.team}</Badge></td><td className="px-3 py-3 text-right tabular-nums">{agent.total.toLocaleString()}</td><td className="px-3 py-3 text-right text-muted-foreground tabular-nums">{agent.inbound} / {agent.outbound}</td><td className="px-3 py-3 text-right font-medium text-emerald-700">{agent.answerRate}%</td><td className="px-3 py-3 text-right text-muted-foreground">{formatSeconds(agent.averageDurationSeconds)}</td><td className="px-4 py-3 text-right"><Change value={agent.totalChange} suffix=" calls" /></td></tr>))}</tbody></table></div></CardContent>
      </Card>
    </section>
  );
}
