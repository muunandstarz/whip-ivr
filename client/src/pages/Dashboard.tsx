import { useState, useMemo } from "react";
import WhipLayout from "@/components/WhipLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
} from "recharts";
import {
  PhoneIncoming,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Building2,
  Scale,
  Stethoscope,
  User,
  HelpCircle,
  Info,
  Phone,
  PhoneCall,
  PhoneMissed,
  TrendingUp,
  TrendingDown,
  Flame,
  CalendarDays,
  CheckCheck,
  Archive,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Moon,
  Sun,
  ArrowUp,
  ArrowDown,
  Minus,
} from "lucide-react";
import { formatDistanceToNow, format, parseISO } from "date-fns";

const CALLER_TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; chartColor: string }> = {
  carrier:          { label: "Carrier",    icon: Building2,   color: "bg-blue-500/15 text-blue-700 dark:text-blue-400",    chartColor: "#3b82f6" },
  law_office:       { label: "Law Office", icon: Scale,       color: "bg-purple-500/15 text-purple-700 dark:text-purple-400", chartColor: "#a855f7" },
  medical_provider: { label: "Medical",    icon: Stethoscope, color: "bg-green-500/15 text-green-700 dark:text-green-400",  chartColor: "#22c55e" },
  member:           { label: "Member",     icon: User,        color: "bg-orange-500/15 text-orange-700 dark:text-orange-400", chartColor: "#f97316" },
  claimant:         { label: "Claimant",   icon: User,        color: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400", chartColor: "#eab308" },
  police:           { label: "Police",     icon: User,        color: "bg-red-500/15 text-red-700 dark:text-red-400",        chartColor: "#ef4444" },
  wrong_department: { label: "Wrong Dept", icon: HelpCircle,  color: "bg-muted text-muted-foreground",                      chartColor: "#94a3b8" },
  unknown:          { label: "Unknown",    icon: HelpCircle,  color: "bg-muted text-muted-foreground",                      chartColor: "#94a3b8" },
};

function InfoTooltip({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="w-3.5 h-3.5 text-muted-foreground/60 cursor-help flex-shrink-0" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function StatCardSkeleton() {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-muted animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-6 w-16 bg-muted rounded animate-pulse" />
            <div className="h-3 w-24 bg-muted rounded animate-pulse" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ChartSkeleton({ height = 120 }: { height?: number }) {
  return <div className="bg-muted rounded animate-pulse w-full" style={{ height }} />;
}

export default function Dashboard() {
  // ── Data queries ──────────────────────────────────────────────────────────
  const { data: openData }   = trpc.intake.list.useQuery({ status: "open",   limit: 1, offset: 0 });
  const { data: urgentData } = trpc.intake.list.useQuery({ status: "open", priority: "urgent", limit: 1, offset: 0 });
  const { data: closedData } = trpc.intake.list.useQuery({ status: "closed", limit: 1, offset: 0 });
  const { data: analyticsData } = trpc.intake.analytics.useQuery();
  const { data: teamSLA }       = trpc.handlerMetrics.callbackSLA.useQuery({});
  const { data: overdueDetails } = trpc.handlerMetrics.overdueDetails.useQuery();
  const { data: trend7d, isLoading: trendLoading } = trpc.dashboard.intakeTrend7d.useQuery();
  const { data: handlerSummary } = trpc.handlerMetrics.intakeSummary.useQuery();

  // ── Month selector ────────────────────────────────────────────────────────
  const currentYearMonth = format(new Date(), "yyyy-MM");
  const [selectedMonth, setSelectedMonth] = useState(currentYearMonth);
  const { data: monthCallData, isLoading: monthLoading } = trpc.dashboard.callsByMonth.useQuery({ yearMonth: selectedMonth });

  // ── Derived KPIs ──────────────────────────────────────────────────────────
  const totalRecords  = openData?.total ?? 0; // total open intakes (recentData removed)
  const openCount     = openData?.total ?? 0;
  const closedCount   = closedData?.total ?? 0;
  const urgentCount   = urgentData?.total ?? 0;
  const callerTypeBreakdown  = analyticsData?.byCallerType ?? [];
  const dispositionBreakdown = analyticsData?.byCallbackDisposition ?? [];
  const carrierCount  = callerTypeBreakdown.find((c) => c.callerType === "carrier")?.count ?? 0;
  const todayStr      = format(new Date(), "yyyy-MM-dd");
  const todayCount    = analyticsData?.byDay?.find((d) => d.day === todayStr)?.count ?? 0;

  // Month call KPIs — safe null-coalescing prevents NaN
  const totalsArr      = monthCallData?.totals ?? [];
  const answeredCalls  = Number(totalsArr.find((r) => r.status === "answered")?.count ?? 0);
  const missedCalls    = Number(totalsArr.find((r) => r.status === "missed")?.count ?? 0);
  const voicemailCalls = Number(totalsArr.find((r) => r.status === "voicemail")?.count ?? 0);
  const inboundCalls   = Number(monthCallData?.byDirection?.find((r) => r.direction === "inbound")?.count ?? 0);
  const outboundCalls  = Number(monthCallData?.byDirection?.find((r) => r.direction === "outbound")?.count ?? 0);
  // Total calls = all call_history rows (answered + missed + voicemail from call_history only, NOT intake-derived voicemail)
  // We show inbound + outbound as the headline number
  const totalCalls     = inboundCalls + outboundCalls;
  // Answer rate = answered inbound / total inbound (outbound calls are always "answered" by definition)
  // Use inboundAnswered from the DB (direction='inbound' AND status='answered'), NOT Math.min(all-answered, inbound)
  // because answeredCalls includes outbound-answered which inflates the count.
  const inboundAnswered = monthCallData?.inboundAnswered ?? Math.min(answeredCalls, inboundCalls);
  const answerRate      = inboundCalls > 0 ? Math.round((inboundAnswered / inboundCalls) * 100) : 0;

  // After-hours & business-hours breakdown
  const afterHoursCount   = monthCallData?.afterHours ?? 0;
  const weekendCount      = monthCallData?.weekend ?? 0;
  const bhAnswered        = monthCallData?.businessHoursAnswered ?? 0;
  const bhTotal           = monthCallData?.businessHoursTotal ?? 0;
  const bhAnswerRate      = bhTotal > 0 ? Math.round((bhAnswered / bhTotal) * 100) : 0;
  // afterHours comes from inbound-only SQL, so denominator must be inboundCalls
  const afterHoursPct     = inboundCalls > 0 ? Math.round((afterHoursCount / inboundCalls) * 100) : 0;

  // Month-over-month comparison
  const prevMonth              = monthCallData?.prevMonth;
  const prevTotal              = prevMonth?.total ?? 0;
  const prevAnswerRate         = prevMonth?.answerRate ?? 0;
  const prevInboundAnswerRate  = prevMonth?.inboundAnswerRate ?? 0;
  const prevBizHoursAnswerRate = prevMonth?.bizHoursAnswerRate ?? 0;
  const momVolumeDelta         = prevTotal > 0 ? Math.round(((totalCalls - prevTotal) / prevTotal) * 100) : null;
  const momAnswerDelta         = prevTotal > 0 ? answerRate - prevAnswerRate : null;
  const momInboundAnswerDelta  = (prevMonth?.inboundTotal ?? 0) > 0 ? answerRate - prevInboundAnswerRate : null;
  const momBizAnswerDelta      = (prevMonth?.bizHoursTotal ?? 0) > 0 ? bhAnswerRate - prevBizHoursAnswerRate : null;

  // Trend blurbs from byCallerType comparison
  const callCallerTypes   = monthCallData?.byCallerType ?? [];
  const trendBlurbs = useMemo(() => {
    const blurbs: { text: string; direction: 'up' | 'down' | 'neutral'; color: string }[] = [];
    if (momVolumeDelta !== null) {
      if (momVolumeDelta >= 10) blurbs.push({ text: `Call volume is up ${momVolumeDelta}% vs last month`, direction: 'up', color: 'text-amber-600 dark:text-amber-400' });
      else if (momVolumeDelta <= -10) blurbs.push({ text: `Call volume is down ${Math.abs(momVolumeDelta)}% vs last month`, direction: 'down', color: 'text-green-600 dark:text-green-400' });
    }
    if (momAnswerDelta !== null) {
      if (momAnswerDelta >= 5) blurbs.push({ text: `Answer rate improved +${momAnswerDelta}pp vs last month`, direction: 'up', color: 'text-green-600 dark:text-green-400' });
      else if (momAnswerDelta <= -5) blurbs.push({ text: `Answer rate dropped ${momAnswerDelta}pp vs last month`, direction: 'down', color: 'text-red-600 dark:text-red-400' });
    }
    const carrierCallCount = Number(callCallerTypes.find((c) => c.callerType === 'carrier')?.count ?? 0);
    const attyCallCount    = Number(callCallerTypes.find((c) => c.callerType === 'law_office')?.count ?? 0);
    if (carrierCallCount === 0 && totalCalls > 100) blurbs.push({ text: 'No carrier calls classified yet this month — check AI classification', direction: 'neutral', color: 'text-muted-foreground' });
    if (attyCallCount > 50) blurbs.push({ text: `${attyCallCount} attorney calls this month — law office volume elevated`, direction: 'neutral', color: 'text-purple-600 dark:text-purple-400' });
    return blurbs;
  }, [momVolumeDelta, momAnswerDelta, callCallerTypes, totalCalls]);

  // Available months for selector (sorted newest-first)
  const availableMonths: string[] = useMemo(() => {
    const raw = monthCallData?.availableMonths ?? [];
    return raw.length > 0 ? [...raw].sort().reverse() : [currentYearMonth];
  }, [monthCallData, currentYearMonth]);
  const monthIndex = availableMonths.indexOf(selectedMonth);

  // 7-day sparkline: pivot by caller type
  const sparklineData = useMemo(() => {
    if (!trend7d || trend7d.length === 0) return [];
    const dayMap: Record<string, { day: string; [callerType: string]: string | number }> = {};
    for (const row of trend7d) {
      if (!dayMap[row.day]) dayMap[row.day] = { day: row.day };
      dayMap[row.day][row.callerType] = row.count;
    }
    return Object.values(dayMap)
      .sort((a, b) => a.day.localeCompare(b.day))
      .map((d) => {
        try { return { ...d, label: format(parseISO(d.day), "EEE") }; }
        catch { return { ...d, label: d.day.slice(5) }; }
      });
  }, [trend7d]);

  const trendCallerTypes = useMemo(() => {
    if (!trend7d) return [];
    const types = new Set(trend7d.map((r) => r.callerType));
    return Array.from(types).filter((t) => t !== "unknown" && t !== "wrong_department");
  }, [trend7d]);

  // Disposition headline
  const totalDispositions = dispositionBreakdown.reduce((s, d) => s + Number(d.count), 0);
  const reachedCount = Number(dispositionBreakdown.find((d) => d.disposition === "reached")?.count ?? 0);
  const reachedPct   = totalDispositions > 0 ? Math.round((reachedCount / totalDispositions) * 100) : null;

  // Handler workload
  const handlerWorkload = useMemo(() => {
    if (!handlerSummary) return [];
    return [...handlerSummary]
      .filter((h) => h.handlerName && h.handlerName !== "Unassigned")
      .sort((a, b) => b.open - a.open)
      .slice(0, 8);
  }, [handlerSummary]);

  // Context-aware quick actions
  const quickActions = useMemo(() => {
    const actions: { href: string; icon: React.ElementType; label: string; urgent?: boolean }[] = [];
    if (overdueDetails && overdueDetails.length > 0)
      actions.push({ href: "/callback-log", icon: AlertTriangle, label: `${overdueDetails.length} Overdue Callback${overdueDetails.length !== 1 ? "s" : ""}`, urgent: true });
    if (urgentCount > 0)
      actions.push({ href: "/intake?status=open&priority=urgent", icon: Flame, label: `${urgentCount} Urgent Record${urgentCount !== 1 ? "s" : ""}`, urgent: true });
    actions.push(
      { href: "/handler-queue", icon: Phone,     label: "Handler Queue" },
      { href: "/analytics",     icon: TrendingUp, label: "Full Analytics" },
      { href: "/call-tracking", icon: PhoneCall,  label: "Call Tracking" },
      { href: "/callback-log",  icon: CheckCheck, label: "Callback Log" },
    );
    const seen = new Set<string>();
    return actions.filter((a) => { const k = a.href + a.label; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 5);
  }, [overdueDetails, urgentCount]);

  const monthLabel = useMemo(() => {
    try { return format(parseISO(selectedMonth + "-01"), "MMMM yyyy"); } catch { return selectedMonth; }
  }, [selectedMonth]);

  return (
    <WhipLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Claims IVR Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-0.5">AI-powered call intake management for Whip Claims</p>
        </div>

        {/* ── Top Banner: Today tiles + 7-day Sparkline ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Today tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-3">
            <Link href={`/intake?dateFrom=${todayStr}&dateTo=${todayStr}`}>
              <div className="flex items-center gap-4 bg-card border border-border rounded-xl px-4 py-3.5 cursor-pointer hover:shadow-md hover:border-primary/40 transition-all group">
                <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
                  <CalendarDays className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-2xl font-bold text-foreground">{Number(todayCount)}</div>
                  <div className="text-xs text-muted-foreground">New intakes today</div>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
              </div>
            </Link>
            <Link href="/intake?status=open&priority=urgent">
              <div className={`flex items-center gap-4 bg-card border rounded-xl px-4 py-3.5 cursor-pointer hover:shadow-md transition-all group ${urgentCount > 0 ? "border-red-300 hover:border-red-400" : "border-border"}`}>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${urgentCount > 0 ? "bg-red-100 dark:bg-red-500/15" : "bg-muted"}`}>
                  <Flame className={`w-5 h-5 ${urgentCount > 0 ? "text-red-500" : "text-muted-foreground"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-2xl font-bold ${urgentCount > 0 ? "text-red-600 dark:text-red-400" : "text-foreground"}`}>{urgentCount}</div>
                  <div className="text-xs text-muted-foreground">Urgent open records</div>
                </div>
                <ArrowRight className={`w-4 h-4 flex-shrink-0 transition-colors ${urgentCount > 0 ? "text-red-400 group-hover:text-red-600" : "text-muted-foreground"}`} />
              </div>
            </Link>
            <Link href="/intake?status=closed">
              <div className="flex items-center gap-4 bg-card border border-border rounded-xl px-4 py-3.5 cursor-pointer hover:shadow-md hover:border-border/80 transition-all group">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                  <Archive className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-2xl font-bold text-foreground">{closedCount}</div>
                  <div className="text-xs text-muted-foreground">Closed / no message</div>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
              </div>
            </Link>
          </div>

          {/* 7-Day Sparkline */}
          <div className="lg:col-span-2">
            <Card className="h-full">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base font-semibold">7-Day Intake Trend</CardTitle>
                    <InfoTooltip text="Daily intake volume over the last 7 days, stacked by caller type. Helps spot patterns and busy days at a glance." />
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {trendCallerTypes.slice(0, 5).map((t) => {
                      const cfg = CALLER_TYPE_CONFIG[t];
                      return cfg ? (
                        <div key={t} className="flex items-center gap-1">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cfg.chartColor }} />
                          <span className="text-[10px] text-muted-foreground">{cfg.label}</span>
                        </div>
                      ) : null;
                    })}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {trendLoading ? (
                  <ChartSkeleton height={180} />
                ) : sparklineData.length === 0 ? (
                  <div className="flex items-center justify-center h-[180px] text-sm text-muted-foreground">No data for the last 7 days</div>
                ) : (
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={sparklineData} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} axisLine={false} tickLine={false} width={28} />
                      <ReTooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                        cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
                        formatter={(value, name) => [value, CALLER_TYPE_CONFIG[name as string]?.label ?? name]}
                        labelStyle={{ fontWeight: 600, marginBottom: 4 }}
                      />
                      {trendCallerTypes.map((t) => {
                        const cfg = CALLER_TYPE_CONFIG[t];
                        return cfg ? (
                          <Line
                            key={t}
                            type="monotone"
                            dataKey={t}
                            stroke={cfg.chartColor}
                            strokeWidth={2}
                            dot={{ r: 3, fill: cfg.chartColor, strokeWidth: 0 }}
                            activeDot={{ r: 5, strokeWidth: 0 }}
                            connectNulls
                          />
                        ) : null;
                      })}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── Intake KPI Row (merged, no duplication) ── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Intake Records</p>
            <InfoTooltip text="AI-processed voicemail intake records from the Whip Claims line." />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {([
                  { key: "total",   href: "/intake",                  hoverBorder: "hover:border-primary/40",    iconBg: "bg-primary/10",      Icon: PhoneIncoming, iconColor: "text-primary",                              value: totalRecords,      valueColor: "text-primary",                              tooltip: "Total AI-processed intake records since the IVR went live.",                                                                                                     label: "Total Intakes" },
                  { key: "open",    href: "/intake?status=open",       hoverBorder: "hover:border-amber-300",     iconBg: "bg-amber-500/15",    Icon: Clock,         iconColor: "text-amber-500 dark:text-amber-400",        value: openCount,         valueColor: "text-amber-600 dark:text-amber-400",        tooltip: "Open intake records that still need a callback. Handlers should call these back within the same business day.",                                                   label: "Open / Pending Callback" },
                  { key: "closed",  href: "/intake?status=closed",     hoverBorder: "hover:border-green-300",     iconBg: "bg-green-500/15",    Icon: CheckCircle2,  iconColor: "text-green-600 dark:text-green-400",        value: closedCount,       valueColor: "text-green-600 dark:text-green-400",        tooltip: "Intake records that have been resolved.",                                                                                                                         label: "Closed / Resolved" },
                  { key: "carrier", href: "/intake?callerType=carrier", hoverBorder: "hover:border-[#ff6221]/40", iconBg: "bg-[#ff6221]/10",    Icon: AlertCircle,   iconColor: "text-[#ff6221]",                            value: Number(carrierCount), valueColor: "text-[#ff6221]",                           tooltip: "Intake records from insurance carriers. IVR-eligible — carriers can self-serve via Press 1 once the IVR is live.",                                                label: "Carrier Intakes · IVR Eligible" },
                ] as const).map(({ key, href, hoverBorder, iconBg, Icon, iconColor, value, valueColor, tooltip, label }) => (
                  <Link key={key} href={href}>
                    <Card className={`cursor-pointer hover:shadow-sm transition-all ${hoverBorder}`}>
                      <CardContent className="pt-5">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${iconBg}`}>
                            <Icon className={`w-5 h-5 ${iconColor}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <div className={`text-2xl font-bold ${valueColor}`}>{value}</div>
                              <InfoTooltip text={tooltip} />
                            </div>
                            <div className="text-xs text-muted-foreground">{label}</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))
            }
          </div>
        </div>

        {/* ── Call Volume with Month Selector ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Call Volume — {monthLabel}</p>
              <InfoTooltip text="Live call statistics from Aircall for the Whip Claims line. Includes ALL calls (business hours, after hours, and weekends). Use the arrows to browse previous months." />
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                disabled={monthIndex >= availableMonths.length - 1}
                onClick={() => { const next = availableMonths[monthIndex + 1]; if (next) setSelectedMonth(next); }}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-xs text-muted-foreground px-1 min-w-[90px] text-center">{monthLabel}</span>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                disabled={monthIndex <= 0}
                onClick={() => { const prev = availableMonths[monthIndex - 1]; if (prev) setSelectedMonth(prev); }}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {monthLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[0,1,2,3].map((i) => <StatCardSkeleton key={i} />)}</div>
          ) : totalCalls === 0 && !monthLoading ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No call data for {monthLabel}</CardContent></Card>
          ) : (
            <>
              {/* KPI Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {([
                  {
                    key: "total",
                    Icon: Phone,
                    color: "blue",
                    value: totalCalls,
                    label: "Total Calls",
                    sub: inboundCalls > 0 ? `${inboundCalls} in${outboundCalls > 0 ? ` · ${outboundCalls} out` : ""}` : undefined,
                    tooltip: `All calls on the Whip Claims line in ${monthLabel} — includes business hours, after hours, and weekends.`,
                    mom: momVolumeDelta,
                    momLabel: prevTotal > 0 ? `${prevTotal.toLocaleString()} last month` : undefined,
                  },
                  {
                    key: "answered",
                    Icon: PhoneCall,
                    color: "green",
                    value: `${answerRate}%`,
                    label: "Answer Rate (Overall)",
                    sub: bhTotal > 0 ? `${bhAnswerRate}% during biz hrs` : undefined,
                    tooltip: `Overall inbound answer rate: ${answerRate}% — ${inboundAnswered} of ${inboundCalls} inbound calls answered by a live agent. Business-hours rate (Mon–Fri 8am–6pm): ${bhAnswerRate}% (${bhAnswered} of ${bhTotal}). After-hours and weekend calls are included in the overall rate.`,
                    mom: momInboundAnswerDelta !== null ? (momInboundAnswerDelta >= 0 ? `+${momInboundAnswerDelta}pp` : `${momInboundAnswerDelta}pp`) : undefined,
                    momLabel: (prevMonth?.inboundTotal ?? 0) > 0 ? `${prevInboundAnswerRate}% last month` : undefined,
                  },
                  {
                    key: "missed",
                    Icon: PhoneMissed,
                    color: "red",
                    value: missedCalls,
                    label: "Missed",
                    sub: missedCalls > 0 ? `inbound calls not answered` : undefined,
                    tooltip: `Inbound calls that rang but were not answered this month. Includes calls during business hours and after-hours that went unanswered. Voicemail calls are counted separately.`,
                    mom: undefined,
                    momLabel: undefined,
                  },
                  {
                    key: "voicemail",
                    Icon: PhoneIncoming,
                    color: "amber",
                    value: voicemailCalls,
                    label: "Voicemail",
                    sub: `${voicemailCalls} intake records`,
                    tooltip: `Voicemail messages received this month — each generates an intake record. Includes voicemails left on the main Claims line and on individual handler extensions.`,
                    mom: undefined,
                    momLabel: undefined,
                  },
                ] as const).map(({ key, Icon, color, value, label, sub, tooltip, mom, momLabel }) => {
                  const colorMap: Record<string, { iconBg: string; iconColor: string; valueColor: string; hoverBorder: string; subColor: string }> = {
                    blue:  { iconBg: "bg-blue-500/15",  iconColor: "text-blue-600 dark:text-blue-400",  valueColor: "text-blue-600 dark:text-blue-400",  hoverBorder: "hover:border-blue-300",  subColor: "text-blue-600 dark:text-blue-400" },
                    green: { iconBg: "bg-green-500/15", iconColor: "text-green-600 dark:text-green-400", valueColor: "text-green-600 dark:text-green-400", hoverBorder: "hover:border-green-300", subColor: "text-green-600 dark:text-green-400" },
                    red:   { iconBg: "bg-red-500/15",   iconColor: "text-red-600 dark:text-red-400",   valueColor: "text-red-600 dark:text-red-400",   hoverBorder: "hover:border-red-300",   subColor: "text-muted-foreground" },
                    amber: { iconBg: "bg-amber-500/15", iconColor: "text-amber-600 dark:text-amber-400", valueColor: "text-amber-600 dark:text-amber-400", hoverBorder: "hover:border-amber-300", subColor: "text-muted-foreground" },
                  };
                  const c = colorMap[color];
                  const momNum = typeof mom === 'number' ? mom : null;
                  return (
                    <Link key={key} href="/analytics">
                      <Card className={`cursor-pointer hover:shadow-sm transition-all ${c.hoverBorder}`}>
                        <CardContent className="pt-5">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${c.iconBg}`}>
                              <Icon className={`w-5 h-5 ${c.iconColor}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <div className={`text-2xl font-bold ${c.valueColor}`}>{typeof value === 'string' ? value : Number(value).toLocaleString()}</div>
                                <InfoTooltip text={tooltip} />
                              </div>
                              <div className="text-xs text-muted-foreground">{label}</div>
                              {sub && <div className={`text-[10px] mt-0.5 font-medium ${c.subColor}`}>{sub}</div>}
                              {momNum !== null && (
                                <div className={`text-[10px] mt-0.5 flex items-center gap-0.5 font-medium ${
                                  momNum > 0 ? (key === 'total' ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400')
                                  : momNum < 0 ? (key === 'total' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')
                                  : 'text-muted-foreground'
                                }`}>
                                  {momNum > 0 ? <ArrowUp className="w-2.5 h-2.5" /> : momNum < 0 ? <ArrowDown className="w-2.5 h-2.5" /> : <Minus className="w-2.5 h-2.5" />}
                                  {momNum > 0 ? `+${momNum}%` : `${momNum}%`} vs last mo
                                </div>
                              )}
                              {typeof mom === 'string' && (
                                <div className={`text-[10px] mt-0.5 flex items-center gap-0.5 font-medium ${
                                  mom.startsWith('+') ? 'text-green-600 dark:text-green-400' : mom.startsWith('-') ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'
                                }`}>
                                  {mom.startsWith('+') ? <ArrowUp className="w-2.5 h-2.5" /> : mom.startsWith('-') ? <ArrowDown className="w-2.5 h-2.5" /> : <Minus className="w-2.5 h-2.5" />}
                                  {mom} vs last mo
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>

              {/* After-hours + Trend Blurbs row */}
              <div className="mt-3 flex flex-wrap gap-2 items-center">
                {/* After-hours pill */}
                {totalCalls > 0 && (
                  <div className="flex items-center gap-1.5 bg-muted/50 border border-border rounded-full px-3 py-1">
                    <Moon className="w-3 h-3 text-indigo-500" />
                    <span className="text-[11px] text-muted-foreground">
                      <span className="font-semibold text-foreground">{afterHoursCount.toLocaleString()}</span> of {inboundCalls.toLocaleString()} inbound calls arrived after-hours ({afterHoursPct}%)
                    </span>
                    <InfoTooltip text={`${afterHoursCount} calls arrived outside business hours (before 8am or after 6pm Mon–Fri). ${weekendCount} of those were on weekends. After-hours calls that went unanswered are included in the Missed count.`} />
                  </div>
                )}
                {/* Business-hours answer rate pill */}
                {bhTotal > 0 && (
                  <div className="flex items-center gap-1.5 bg-muted/50 border border-border rounded-full px-3 py-1">
                    <Sun className="w-3 h-3 text-yellow-500" />
                    <span className="text-[11px] text-muted-foreground">
                      <span className="font-semibold text-foreground">{bhAnswerRate}%</span> biz hrs answer rate
                      {momBizAnswerDelta !== null && (
                        <span className={`ml-1 font-semibold ${momBizAnswerDelta >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                          ({momBizAnswerDelta >= 0 ? '+' : ''}{momBizAnswerDelta}pp vs last mo)
                        </span>
                      )}
                    </span>
                    <InfoTooltip text={`Business-hours inbound answer rate (Mon–Fri, 8am–6pm): ${bhAnswered} answered out of ${bhTotal} inbound calls. Last month: ${prevBizHoursAnswerRate}% (${prevMonth?.bizHoursAnswered ?? 0} of ${prevMonth?.bizHoursTotal ?? 0}). The overall inbound answer rate of ${answerRate}% includes after-hours and weekend calls.`} />
                  </div>
                )}
                {/* Trend blurbs */}
                {trendBlurbs.map((blurb, i) => (
                  <div key={`blurb-${i}`} className="flex items-center gap-1.5 bg-muted/50 border border-border rounded-full px-3 py-1">
                    {blurb.direction === 'up' ? <TrendingUp className="w-3 h-3 text-amber-500" /> : blurb.direction === 'down' ? <TrendingDown className="w-3 h-3 text-green-500" /> : <Info className="w-3 h-3 text-muted-foreground" />}
                    <span className={`text-[11px] font-medium ${blurb.color}`}>{blurb.text}</span>
                  </div>
                ))}
              </div>

              {/* Daily bar chart */}
              {monthCallData && monthCallData.byDay.length > 0 && (
                <Card className="mt-3">
                  <CardContent className="pt-4 pb-2">
                    <ResponsiveContainer width="100%" height={110}>
                      <BarChart
                        data={monthCallData.byDay.map((d) => {
                          let label = d.day.slice(8) || d.day;
                          try { label = format(parseISO(d.day), "d"); } catch { /* keep slice fallback */ }
                          return { ...d, label };
                        })}
                        margin={{ top: 0, right: 4, left: -28, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                        <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                        <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
                        <ReTooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} labelFormatter={(l) => `Day ${l}`} />
                        <Bar dataKey="answered" stackId="a" fill="#22c55e" name="Answered" />
                        <Bar dataKey="voicemail" stackId="a" fill="#f59e0b" name="Voicemail" />
                        <Bar dataKey="missed" stackId="a" fill="#ef4444" name="Missed" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>

        {/* ── Main Content Grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Handler Workload */}
          <div className="lg:col-span-2 space-y-4">
            {/* Handler Workload */}
            {handlerWorkload.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base font-semibold">Handler Workload</CardTitle>
                    <InfoTooltip text="Open intake records per handler. Green = manageable (0–3), amber = busy (4–7), red = overloaded (8+). Click a handler name to view their queue." />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2.5">
                    {handlerWorkload.map((h, hi) => {
                      const maxOpen = Math.max(...handlerWorkload.map((x) => x.open), 1);
                      const pct  = Math.round((h.open / maxOpen) * 100);
                      const dot  = h.open === 0 ? "bg-green-500" : h.open <= 3 ? "bg-green-500" : h.open <= 7 ? "bg-amber-500" : "bg-red-500";
                      return (
                        <div key={h.handlerName ?? `handler-${hi}`} className="flex items-center gap-3">
                          <div className="flex items-center gap-2 w-36 flex-shrink-0">
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
                            <span className="text-sm truncate">{h.handlerName}</span>
                          </div>
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${dot}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground w-20 text-right">
                            {h.open} open{h.closed > 0 ? ` · ${h.closed} closed` : ""}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            {/* Caller Type Breakdown */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base font-semibold">Caller Type Breakdown</CardTitle>
                  <InfoTooltip text="Distribution of intake records by who called. IVR-eligible types (carriers, law offices, medical) can self-serve via Press 1 once the IVR is live." />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {callerTypeBreakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No data yet</p>
                ) : (
                  <div className="space-y-3">
                    {callerTypeBreakdown.map((item, cti) => {
                      const cfg = CALLER_TYPE_CONFIG[item.callerType ?? "unknown"] ?? CALLER_TYPE_CONFIG.unknown;
                      const Icon = cfg.icon;
                      const total = callerTypeBreakdown.reduce((s, c) => s + Number(c.count), 0);
                      const pct   = total > 0 ? Math.round((Number(item.count) / total) * 100) : 0;
                      return (
                        <div key={item.callerType ?? `caller-${cti}`}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1.5">
                              <div className={`w-5 h-5 rounded flex items-center justify-center ${cfg.color}`}>
                                <Icon className="w-3 h-3" />
                              </div>
                              <span className="text-xs font-medium">{cfg.label}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">{Number(item.count)}</span>
                              <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
                            </div>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-primary/60" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Callback Outcomes with headline % */}
            {dispositionBreakdown.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base font-semibold">Callback Outcomes</CardTitle>
                      <InfoTooltip text="How callbacks resolved. 'Reached' means the handler spoke with the caller." />
                    </div>
                    {reachedPct !== null && (
                      <span className={`text-sm font-bold ${reachedPct >= 60 ? "text-green-600 dark:text-green-400" : reachedPct >= 40 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                        {reachedPct}% reached
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {dispositionBreakdown.map((item) => {
                    const d     = item.disposition ?? "unknown";
                    const count = Number(item.count);
                    const pct   = totalDispositions > 0 ? Math.round((count / totalDispositions) * 100) : 0;
                    const cfg: Record<string, { bar: string; label: string; text: string }> = {
                      reached:        { bar: "bg-green-500",  label: "text-green-700 dark:text-green-400",  text: "Reached" },
                      left_voicemail: { bar: "bg-blue-400",   label: "text-blue-700 dark:text-blue-400",   text: "Left Voicemail" },
                      no_answer:      { bar: "bg-amber-400",  label: "text-amber-700 dark:text-amber-400",  text: "No Answer" },
                      busy:           { bar: "bg-orange-400", label: "text-orange-700 dark:text-orange-400", text: "Busy" },
                      wrong_number:   { bar: "bg-red-400",    label: "text-red-700 dark:text-red-400",    text: "Wrong Number" },
                    };
                    const c = cfg[d];
                    if (!c || count === 0) return null;
                    return (
                      <div key={d}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className={`font-medium ${c.label}`}>{c.text}</span>
                          <span className="text-muted-foreground">{count} ({pct}%)</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* Callback SLA */}
            {teamSLA && (teamSLA.onTime > 0 || teamSLA.overdue > 0) && (
              <Card className={teamSLA.overdue > 0 ? "border-red-200 dark:border-red-500/30" : "border-green-200 dark:border-green-500/30"}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base font-semibold">Callback SLA</CardTitle>
                    <InfoTooltip text="Team-wide callback compliance rate. Voicemail callbacks must be returned within 4 business hours of receipt." />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className={`text-2xl font-bold ${teamSLA.complianceRate >= 90 ? "text-green-600 dark:text-green-400" : teamSLA.complianceRate >= 70 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                      {teamSLA.complianceRate}%
                    </span>
                    {teamSLA.overdue > 0 && (
                      <span className="text-xs bg-red-500/15 text-red-700 dark:text-red-400 px-2 py-0.5 rounded-full font-medium">{teamSLA.overdue} overdue</span>
                    )}
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${teamSLA.complianceRate >= 90 ? "bg-green-500" : teamSLA.complianceRate >= 70 ? "bg-amber-500" : "bg-red-500"}`}
                      style={{ width: `${teamSLA.complianceRate}%` }} />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{teamSLA.onTime} on time</span>
                    <span>{teamSLA.pending} pending</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Context-aware Quick Actions */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {quickActions.map(({ href, icon: Icon, label, urgent }) => (
                  <Link key={href + label} href={href}>
                    <Button variant="outline" size="sm"
                      className={`w-full justify-start gap-2 text-xs ${urgent ? "border-red-300 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10" : ""}`}>
                      <Icon className={`w-3.5 h-3.5 ${urgent ? "text-red-500" : ""}`} />
                      {label}
                    </Button>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </WhipLayout>
  );
}
