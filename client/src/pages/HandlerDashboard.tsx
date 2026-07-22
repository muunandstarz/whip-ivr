import { useState } from "react";
import { Link } from "wouter";
import WhipLayout from "@/components/WhipLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Phone,
  PhoneIncoming,
  PhoneOff,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  TrendingUp,
  Star,
  MessageSquare,
  PhoneCall,
  Bell,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

// Handler IDs authorized for Loss Intake (Carlito=4, Ana=6, Bennet=30003)
const LOSS_INTAKE_HANDLER_IDS_DASH = new Set([4, 6, 30003]);

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDur(min: number | null | undefined) {
  if (min == null || min === 0) return "—";
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

function answerRate(answered: number, total: number) {
  if (!total) return "—";
  return `${Math.round((answered / total) * 100)}%`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatBox({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{label}</span>
      <span className={`text-xl font-bold leading-none ${accent ?? "text-foreground"}`}>{value}</span>
      {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
    </div>
  );
}

function QaBadge({ score }: { score: number }) {
  const color =
    score >= 8
      ? "bg-green-100 text-green-700 border-green-200"
      : score >= 6
      ? "bg-amber-100 text-amber-700 border-amber-200"
      : "bg-red-100 text-red-600 border-red-200";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${color}`}>
      <Star className="w-3 h-3" /> {score}/10
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, string> = {
    urgent: "bg-red-100 text-red-700 border-red-200",
    high: "bg-orange-100 text-orange-700 border-orange-200",
    normal: "bg-blue-100 text-blue-700 border-blue-200",
    low: "bg-gray-100 text-gray-600 border-gray-200",
  };
  return (
    <Badge className={`text-[10px] px-1.5 py-0 ${map[priority] ?? map.normal}`}>
      {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </Badge>
  );
}

function DueBadge({ dueBy }: { dueBy: string | Date | null | undefined }) {
  if (!dueBy) return null;
  const due = new Date(dueBy);
  const now = new Date();
  const isOverdue = due < now;
  const isToday = due.toDateString() === now.toDateString();
  const label = isToday
    ? `Due ${format(due, "h:mm a")}`
    : `Due ${format(due, "M/d h:mm a")}`;
  return (
    <span
      className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded ${
        isOverdue
          ? "bg-red-100 text-red-700"
          : isToday
          ? "bg-amber-100 text-amber-700"
          : "bg-gray-100 text-gray-600"
      }`}
    >
      {label}
    </span>
  );
}

function CalledBackButton({
  intakeId,
  handlerName,
  onSuccess,
}: {
  intakeId: number;
  handlerName: string;
  onSuccess: () => void;
}) {
  const utils = trpc.useUtils();
  const calledBack = trpc.handlerActions.calledBack.useMutation({
    onSuccess: () => {
      toast.success("Callback logged successfully");
      utils.intake.list.invalidate();
      onSuccess();
    },
    onError: () => toast.error("Failed to log callback"),
  });

  return (
    <Button
      size="sm"
      variant="outline"
      className="text-xs h-7 border-green-300 text-green-700 hover:bg-green-500/10 gap-1"
      disabled={calledBack.isPending}
      onClick={() => calledBack.mutate({ intakeId, handlerName })}
    >
      <CheckCircle2 className="w-3 h-3" />
      {calledBack.isPending ? "Logging…" : "Mark Called Back"}
    </Button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function HandlerDashboard() {
  const { user: authUser } = useAuth();
  const { impersonating, isImpersonating } = useImpersonation();
  const [refreshKey, setRefreshKey] = useState(0);
  const [liPeriod, setLiPeriod] = useState<"week" | "month" | "ytd">("month");

  // Resolve handler
  const { data: handlersList } = trpc.handlers.list.useQuery();
  const linkedHandler = authUser?.handlerProfileId
    ? handlersList?.find((h) => h.id === authUser.handlerProfileId)
    : null;
  const effectiveName = isImpersonating
    ? impersonating!.name
    : linkedHandler?.name ?? authUser?.name ?? "";
  const handlerRecord = isImpersonating
    ? handlersList?.find((h) => h.name.toLowerCase() === impersonating!.name.toLowerCase())
    : linkedHandler ?? handlersList?.find((h) => h.name.toLowerCase() === effectiveName.toLowerCase());
  const handlerId = handlerRecord?.id ?? null;

  // Data queries
  const { data: intakeData, isLoading: intakeLoading } = trpc.intake.list.useQuery(
    { handlerName: effectiveName, status: "open", limit: 50, offset: 0 },
    { enabled: !!effectiveName }
  );
  const { data: metricsData } = trpc.handlerMetrics.byName.useQuery(
    { handlerName: effectiveName },
    { enabled: !!effectiveName }
  );
  const { data: slaData } = trpc.handlerMetrics.callbackSLA.useQuery(
    { handlerName: effectiveName },
    { enabled: !!effectiveName }
  );
  const { data: cbStats } = trpc.handlerMetrics.callbackStats.useQuery(
    { handlerName: effectiveName },
    { enabled: !!effectiveName }
  );
  const { data: digestData, refetch: refetchDigest, isFetching: digestFetching } =
    trpc.qa.handlerDigest.useQuery(
      { handlerName: effectiveName },
      { enabled: !!effectiveName, staleTime: 5 * 60 * 1000 }
    );
  const { data: scorecards } = trpc.qa.handlerScorecards.useQuery(
    { handlerId: handlerId! },
    { enabled: !!handlerId }
  );

  const canSeeLossIntake =
    authUser?.role === "admin" ||
    (authUser?.handlerProfileId != null && LOSS_INTAKE_HANDLER_IDS_DASH.has(authUser.handlerProfileId));
  const { data: handlerLiStats } = trpc.lossIntake.handlerStats.useQuery(
    { agentName: effectiveName },
    { enabled: canSeeLossIntake && !!effectiveName }
  );

  const openRecords = intakeData?.records ?? [];
  const metrics = metricsData?.stats ?? null;
  const voicemailCallbacks = openRecords.filter((r) => r.source === "voicemail" && !r.callbackAt);
  const overdueCount = voicemailCallbacks.filter(
    (r) => r.callbackDueBy && new Date(r.callbackDueBy) < new Date()
  ).length;
  const top5 = voicemailCallbacks.slice(0, 5);

  const avgScore =
    scorecards && scorecards.length > 0
      ? Math.round(scorecards.reduce((sum, s) => sum + (s.overallScore ?? 0), 0) / scorecards.length)
      : null;

  const d = digestData as {
    today: { calls: number; answered: number; avgDurationMin: number };
    thisWeek: { calls: number; answered: number; callbacksCompleted: number; callbacksPending: number; avgDurationMin: number };
    thisMonth: { calls: number; answered: number; callbacksCompleted: number; avgDurationMin: number };
    teamAvgAnswerRate: number;
    latestQaScore: number | null;
    latestQaWeek: string | null;
    coachingNote: string;
  } | null;

  const weekAnswerRate = d && d.thisWeek.calls > 0 ? Math.round((d.thisWeek.answered / d.thisWeek.calls) * 100) : 0;
  const monthAnswerRate = d && d.thisMonth.calls > 0 ? Math.round((d.thisMonth.answered / d.thisMonth.calls) * 100) : 0;

  const liStats = handlerLiStats?.[liPeriod];

  return (
    <WhipLayout>
      {/* Full-height no-scroll container */}
      <div className="h-full flex flex-col overflow-hidden">
        {/* ── Top bar ── */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border/50 flex-shrink-0">
          <div>
            <h1 className="text-lg font-bold text-foreground leading-tight">
              {isImpersonating ? (
                <>
                  Viewing as{" "}
                  <span className="text-[#ff6221]">{impersonating!.name}</span>
                </>
              ) : (
                "Dashboard Overview"
              )}
            </h1>
            <p className="text-xs text-muted-foreground">
              {isImpersonating
                ? `Admin view — handler perspective for ${impersonating!.name}`
                : "Real-time performance and callback management"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {overdueCount > 0 && (
              <Badge className="bg-red-100 text-red-700 border-red-200 gap-1 text-xs">
                <Bell className="w-3 h-3" />
                {overdueCount} overdue callback{overdueCount !== 1 ? "s" : ""}
              </Badge>
            )}
            <Link href="/softphone">
              <Button size="sm" className="bg-[#ff6221] hover:bg-[#e5541a] text-white gap-1.5 h-8">
                <Phone className="w-3.5 h-3.5" />
                Open Softphone
              </Button>
            </Link>
          </div>
        </div>

        {/* ── Main two-column grid ── */}
        <div className="flex-1 overflow-hidden grid grid-cols-2 gap-0 min-h-0">
          {/* LEFT: My Performance + lower stats */}
          <div className="flex flex-col overflow-hidden border-r border-border/40">
            {/* My Performance card */}
            <div className="flex-shrink-0 px-5 py-4 border-b border-border/40">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <PhoneIncoming className="w-4 h-4 text-[#ff6221]" />
                  <span className="text-sm font-semibold text-foreground">My Performance</span>
                  <span className="flex items-center gap-1 text-[10px] text-green-600 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                    Live
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {(d?.latestQaScore != null) && <QaBadge score={d.latestQaScore} />}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => refetchDigest()}
                    disabled={digestFetching}
                    title="Refresh"
                  >
                    <RefreshCw className={`w-3 h-3 ${digestFetching ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </div>

              {/* TODAY */}
              <div className="bg-muted/30 rounded-lg p-3 mb-2">
                <div className="flex items-center gap-1.5 mb-2">
                  <PhoneIncoming className="w-3 h-3 text-[#ff6221]" />
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Today</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <StatBox label="Calls" value={d?.today.calls ?? 0} />
                  <StatBox label="Answered" value={d?.today.answered ?? 0} />
                  <StatBox label="Avg Handle" value={fmtDur(d?.today.avgDurationMin)} />
                </div>
              </div>

              {/* THIS WEEK */}
              <div className="bg-muted/20 rounded-lg p-3 mb-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <PhoneCall className="w-3 h-3 text-blue-500" />
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">This Week</span>
                  </div>
                  {d && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <TrendingUp className="w-3 h-3 text-green-500" />
                      Team avg: {d.teamAvgAnswerRate}%
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <StatBox label="Calls" value={d?.thisWeek.calls ?? 0} />
                  <StatBox
                    label="Answer Rate"
                    value={`${weekAnswerRate}%`}
                    sub={d && weekAnswerRate >= d.teamAvgAnswerRate ? "↑ above avg" : "↓ below avg"}
                    accent={d && weekAnswerRate >= d.teamAvgAnswerRate ? "text-green-600" : "text-red-500"}
                  />
                  <StatBox label="Callbacks Done" value={d?.thisWeek.callbacksCompleted ?? 0} />
                  <StatBox
                    label="Pending CBs"
                    value={d?.thisWeek.callbacksPending ?? 0}
                    sub={
                      (d?.thisWeek.callbacksPending ?? 0) > 5
                        ? "⚠ high"
                        : (d?.thisWeek.callbacksPending ?? 0) === 0
                        ? "✓ clear"
                        : undefined
                    }
                  />
                </div>
              </div>

              {/* THIS MONTH */}
              <div className="rounded-lg p-3 border border-border/40 mb-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Clock className="w-3 h-3 text-purple-500" />
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">This Month</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <StatBox label="Calls" value={d?.thisMonth.calls ?? 0} />
                  <StatBox label="Answer Rate" value={`${monthAnswerRate}%`} />
                  <StatBox label="Callbacks Done" value={d?.thisMonth.callbacksCompleted ?? 0} />
                </div>
              </div>

              {/* AI Performance Note */}
              {d?.coachingNote && (
                <div className="bg-[#ff6221]/5 border border-[#ff6221]/20 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <MessageSquare className="w-3 h-3 text-[#ff6221]" />
                    <span className="text-[10px] font-semibold text-[#ff6221] uppercase tracking-wide">Performance Note</span>
                    {d.latestQaWeek && (
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        Updated {d.latestQaWeek}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-foreground/80 leading-relaxed line-clamp-3">{d.coachingNote}</p>
                </div>
              )}
            </div>

            {/* ── Lower 4-stat row ── */}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3 min-h-0">
              {/* Loss Intake */}
              {canSeeLossIntake && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-foreground">Loss Intake</span>
                    <div className="flex items-center gap-1">
                      <div className="flex gap-0.5 rounded border bg-background p-0.5">
                        {(["week", "month", "ytd"] as const).map((p) => (
                          <button
                            key={p}
                            onClick={() => setLiPeriod(p)}
                            className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                              liPeriod === p ? "bg-[#171b31] text-white" : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {p === "week" ? "Week" : p === "month" ? "Month" : "YTD"}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: "FNOLs", value: liStats?.total ?? 0, sub: liStats ? `${liStats.instoreTotal ?? 0} in-store` : undefined, color: "text-[#ff6221]" },
                      { label: "Completed", value: liStats?.completed ?? 0, sub: liStats ? `${liStats.completionPct}% rate` : undefined, color: liStats && liStats.completionPct >= 70 ? "text-green-600" : "text-amber-600" },
                      { label: "SLA Breaches", value: liStats?.slaBreaches ?? 0, sub: "10-min target", color: (liStats?.slaBreaches ?? 0) > 0 ? "text-red-600" : "text-green-600" },
                      { label: "Avg 1st Contact", value: liStats ? fmtDur(liStats.avgFirstContactMin) : "—", sub: liStats ? `${liStats.totalAttempts} attempts` : undefined, color: "text-purple-600" },
                    ].map(({ label, value, sub, color }) => (
                      <div key={label} className="bg-muted/20 rounded-lg p-2.5">
                        <div className="text-[10px] text-muted-foreground font-medium mb-1">{label}</div>
                        <div className={`text-lg font-bold ${color}`}>{value}</div>
                        {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Callback SLA */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-foreground">Callback SLA — 4 Business Hours</span>
                </div>
                <div className="bg-muted/20 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">{slaData?.complianceRate ?? 0}% compliance</span>
                      {(slaData?.overdue ?? 0) > 0 && (
                        <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px] px-1.5 py-0">At risk</Badge>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {slaData?.onTime ?? 0} on time · {slaData?.pending ?? 0} pending
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        (slaData?.complianceRate ?? 0) >= 90
                          ? "bg-green-500"
                          : (slaData?.complianceRate ?? 0) >= 70
                          ? "bg-amber-500"
                          : "bg-red-500"
                      }`}
                      style={{ width: `${slaData?.complianceRate ?? 0}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    Voicemails must be returned within 4 business hours of receipt.
                  </p>
                </div>
              </div>

              {/* Callbacks Completed + Call Performance side by side */}
              <div className="grid grid-cols-2 gap-3">
                {/* Callbacks Completed */}
                <div>
                  <span className="text-xs font-semibold text-foreground block mb-2">Callbacks Completed</span>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "Today", value: cbStats?.today ?? 0, sub: "callbacks" },
                      { label: "This Week", value: cbStats?.thisWeek ?? 0, sub: "last 7 days" },
                      { label: "This Month", value: cbStats?.thisMonth ?? 0, sub: "last 30 days" },
                      { label: "Reached", value: cbStats?.byDisposition?.reached ?? 0, sub: `of ${cbStats?.allTime ?? 0} attempts` },
                    ].map(({ label, value, sub }) => (
                      <div key={label} className="bg-muted/20 rounded-lg p-2">
                        <div className="text-[10px] text-muted-foreground font-medium">{label}</div>
                        <div className="text-base font-bold text-foreground">{value}</div>
                        <div className="text-[10px] text-muted-foreground">{sub}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Call Performance */}
                <div>
                  <span className="text-xs font-semibold text-foreground block mb-2">Call Performance — This Month</span>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      {
                        label: "Total Calls",
                        value: metrics?.total ?? 0,
                        sub: metrics ? `${metrics.inbound ?? 0} in · ${metrics.outbound ?? 0} out` : "—",
                      },
                      {
                        label: "Answered",
                        value: metrics?.answered ?? 0,
                        sub: answerRate(metrics?.answered ?? 0, metrics?.total ?? 0) + " rate",
                      },
                      {
                        label: "Missed",
                        value: metrics?.missed ?? 0,
                        sub: answerRate(metrics?.missed ?? 0, metrics?.total ?? 0) + " miss",
                      },
                      {
                        label: "Avg Handle",
                        value: fmtDur(metrics?.avgDurationMin),
                        sub: "per answered call",
                      },
                    ].map(({ label, value, sub }) => (
                      <div key={label} className="bg-muted/20 rounded-lg p-2">
                        <div className="text-[10px] text-muted-foreground font-medium">{label}</div>
                        <div className="text-base font-bold text-foreground">{value}</div>
                        <div className="text-[10px] text-muted-foreground">{sub}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* QA Score mini-card */}
              {scorecards && scorecards.length > 0 && avgScore !== null && (
                <div className="bg-muted/20 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-foreground">QA Score</span>
                    <Link href={`/handlers/${scorecards[0]?.handlerId ?? ""}`}>
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-0.5 px-2">
                        Full Profile <ChevronRight className="w-3 h-3" />
                      </Button>
                    </Link>
                  </div>
                  <div className="flex items-center gap-3">
                    <div
                      className={`text-3xl font-bold ${
                        avgScore >= 90 ? "text-green-600" : avgScore >= 75 ? "text-amber-600" : "text-red-600"
                      }`}
                    >
                      {avgScore}
                    </div>
                    <div className="flex-1">
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden mb-1">
                        <div
                          className={`h-full rounded-full ${
                            avgScore >= 90 ? "bg-green-500" : avgScore >= 75 ? "bg-amber-500" : "bg-red-500"
                          }`}
                          style={{ width: `${avgScore}%` }}
                        />
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        Based on {scorecards.length} scorecard{scorecards.length !== 1 ? "s" : ""}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Callback Queue */}
          <div className="flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/40 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#ff6221]" />
                <span className="text-sm font-semibold text-foreground">Callback Queue</span>
              </div>
              <Badge variant="outline" className="text-xs">
                {voicemailCallbacks.length} pending
              </Badge>
            </div>

            {/* Queue list */}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2 min-h-0">
              {intakeLoading ? (
                [...Array(4)].map((_, i) => (
                  <div key={i} className="h-20 bg-muted/30 rounded-lg animate-pulse" />
                ))
              ) : voicemailCallbacks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-sm">
                  <CheckCircle2 className="w-8 h-8 mb-2 text-green-500 opacity-60" />
                  All voicemail callbacks are complete. Great work!
                </div>
              ) : (
                top5.map((record) => {
                  const isOverdue = record.callbackDueBy && new Date(record.callbackDueBy) < new Date();
                  return (
                    <div
                      key={String(record.id)}
                      className={`rounded-lg border p-3 transition-colors ${
                        isOverdue
                          ? "border-red-200 bg-red-50/40 dark:bg-red-950/20"
                          : "border-amber-200/60 bg-amber-50/20 dark:bg-amber-950/10"
                      }`}
                    >
                      {/* Row 1: name, company, due badge, priority */}
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-semibold text-sm text-foreground">
                          {record.callerName || record.callerPhone || "Unknown Caller"}
                        </span>
                        {record.callerOrg && (
                          <span className="text-xs text-muted-foreground">· {record.callerOrg}</span>
                        )}
                        <DueBadge dueBy={record.callbackDueBy} />
                        <PriorityBadge priority={record.priority ?? "normal"} />
                      </div>

                      {/* Row 2: phone + voicemail time */}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-1.5">
                        {record.callbackPhone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {record.callbackPhone}
                          </span>
                        )}
                        {record.createdAt && (
                          <span>Voicemail {format(new Date(record.createdAt), "h:mm a")}</span>
                        )}
                        {record.whipClaimNumber && (
                          <span className="text-[#ff6221] font-medium">#{record.whipClaimNumber}</span>
                        )}
                      </div>

                      {/* Row 3: AI summary */}
                      {record.message && (
                        <p className="text-xs text-muted-foreground italic line-clamp-2 mb-2">
                          "{record.message}"
                        </p>
                      )}

                      {/* Row 4: actions */}
                      <div className="flex items-center gap-2">
                        <CalledBackButton
                          intakeId={record.id}
                          handlerName={effectiveName}
                          onSuccess={() => setRefreshKey((k) => k + 1)}
                        />
                        <Link href={`/intake/${record.id}`}>
                          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground">
                            View <ChevronRight className="w-3 h-3" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* View all link */}
            {voicemailCallbacks.length > 5 && (
              <div className="px-5 py-3 border-t border-border/40 flex-shrink-0">
                <Link href="/intake">
                  <Button variant="ghost" size="sm" className="text-[#ff6221] hover:text-[#e5541a] text-xs gap-1 h-7">
                    View all {voicemailCallbacks.length} callbacks <ChevronRight className="w-3 h-3" />
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </WhipLayout>
  );
}
