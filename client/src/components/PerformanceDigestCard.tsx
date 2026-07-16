import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Phone,
  PhoneIncoming,
  Clock,
  PhoneCall,
  TrendingUp,
  TrendingDown,
  Minus,
  Star,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface DigestData {
  handlerName: string;
  today: { calls: number; answered: number; avgDurationMin: number };
  thisWeek: { calls: number; answered: number; callbacksCompleted: number; callbacksPending: number; avgDurationMin: number };
  thisMonth: { calls: number; answered: number; callbacksCompleted: number; avgDurationMin: number };
  teamAvgAnswerRate: number;
  teamAvgDurationMin: number;
  latestQaScore: number | null;
  latestQaWeek: string | null;
  coachingNote: string;
}

function StatBox({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{label}</span>
      <span className="text-xl font-bold text-foreground leading-none">{value}</span>
      {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
    </div>
  );
}

function TrendIcon({ myVal, teamVal }: { myVal: number; teamVal: number }) {
  if (myVal > teamVal + 2) return <TrendingUp className="w-3.5 h-3.5 text-green-500" />;
  if (myVal < teamVal - 2) return <TrendingDown className="w-3.5 h-3.5 text-red-400" />;
  return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
}

function QaBadge({ score }: { score: number }) {
  const color =
    score >= 8 ? "bg-green-100 text-green-700 border-green-200" :
    score >= 6 ? "bg-amber-100 text-amber-700 border-amber-200" :
    "bg-red-100 text-red-600 border-red-200";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${color}`}>
      <Star className="w-3 h-3" /> {score}/10
    </span>
  );
}

interface Props {
  handlerName: string;
  compact?: boolean;
}

export default function PerformanceDigestCard({ handlerName, compact = false }: Props) {
  const { data, isLoading, refetch, isFetching } = trpc.qa.handlerDigest.useQuery(
    { handlerName },
    { staleTime: 5 * 60 * 1000 } // cache 5 min — LLM call is expensive
  );

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardContent className="p-4 h-32 flex items-center justify-center text-sm text-muted-foreground">
          Loading performance digest…
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          No performance data available for {handlerName}.
        </CardContent>
      </Card>
    );
  }

  const d = data as DigestData;
  const weekAnswerRate = d.thisWeek.calls > 0 ? Math.round((d.thisWeek.answered / d.thisWeek.calls) * 100) : 0;
  const monthAnswerRate = d.thisMonth.calls > 0 ? Math.round((d.thisMonth.answered / d.thisMonth.calls) * 100) : 0;

  return (
    <Card className="border border-border/60">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Phone className="w-4 h-4 text-[#ff6221]" />
            {compact ? "My Performance" : `${d.handlerName} — Performance Digest`}
          </CardTitle>
          <div className="flex items-center gap-2">
            {d.latestQaScore !== null && <QaBadge score={d.latestQaScore} />}
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => refetch()}
              disabled={isFetching}
              title="Refresh digest"
            >
              <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-4">
        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-3">
          {/* Today */}
          <div className="col-span-3 grid grid-cols-3 gap-3 bg-muted/30 rounded-lg p-3">
            <div className="col-span-3 flex items-center gap-1.5 mb-1">
              <PhoneIncoming className="w-3.5 h-3.5 text-[#ff6221]" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Today</span>
            </div>
            <StatBox label="Calls" value={d.today.calls} />
            <StatBox label="Answered" value={d.today.answered} sub={d.today.calls > 0 ? `${Math.round((d.today.answered / d.today.calls) * 100)}%` : "—"} />
            <StatBox label="Avg Handle" value={d.today.avgDurationMin > 0 ? `${d.today.avgDurationMin}m` : "—"} />
          </div>

          {/* This Week */}
          <div className="col-span-3 grid grid-cols-4 gap-3 bg-muted/20 rounded-lg p-3">
            <div className="col-span-4 flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <PhoneCall className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">This Week</span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <TrendIcon myVal={weekAnswerRate} teamVal={d.teamAvgAnswerRate} />
                Team avg: {d.teamAvgAnswerRate}%
              </div>
            </div>
            <StatBox label="Calls" value={d.thisWeek.calls} />
            <StatBox
              label="Answer Rate"
              value={`${weekAnswerRate}%`}
              sub={weekAnswerRate >= d.teamAvgAnswerRate ? "↑ above avg" : "↓ below avg"}
            />
            <StatBox label="Callbacks Done" value={d.thisWeek.callbacksCompleted} />
            <StatBox
              label="Pending CBs"
              value={d.thisWeek.callbacksPending}
              sub={d.thisWeek.callbacksPending > 5 ? "⚠ high" : d.thisWeek.callbacksPending === 0 ? "✓ clear" : undefined}
            />
          </div>

          {/* This Month */}
          <div className="col-span-3 grid grid-cols-3 gap-3 rounded-lg p-3 border border-border/40">
            <div className="col-span-3 flex items-center gap-1.5 mb-1">
              <Clock className="w-3.5 h-3.5 text-purple-500" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">This Month</span>
            </div>
            <StatBox label="Calls" value={d.thisMonth.calls} />
            <StatBox label="Answer Rate" value={`${monthAnswerRate}%`} />
            <StatBox label="Callbacks Done" value={d.thisMonth.callbacksCompleted} />
          </div>
        </div>

        {/* AI Coaching Note */}
        {d.coachingNote && (
          <div className="bg-[#ff6221]/5 border border-[#ff6221]/20 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-[#ff6221]" />
              <span className="text-xs font-semibold text-[#ff6221]">Manager Note</span>
              {d.latestQaWeek && (
                <span className="text-[10px] text-muted-foreground ml-auto">QA: week of {d.latestQaWeek}</span>
              )}
            </div>
            <p className="text-xs text-foreground/80 leading-relaxed">{d.coachingNote}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
