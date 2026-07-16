import { useMemo, useState } from "react";
import WhipLayout from "@/components/WhipLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  ExternalLink,
  FileSearch,
  Gauge,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  TimerReset,
  UserRoundCheck,
  Users,
  Workflow,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

const STAGE_LABELS: Record<string, string> = {
  awaiting_outreach: "Awaiting outreach",
  outreach_started: "Outreach started",
  contact_attempts: "Contact attempts",
  complete: "Complete",
};

const SLA_LABELS: Record<string, string> = {
  within_sla: "Within SLA",
  at_risk: "At risk",
  breached: "Breached",
};

const EVENT_LABELS: Record<string, string> = {
  posted: "FNOL posted",
  acknowledgment: "Acknowledged",
  contact_attempt: "Outreach attempt",
  completion: "Good to go",
  other: "Thread update",
};

const CRITERION_LABELS: Record<string, string> = {
  acknowledgment: "Acknowledgment",
  first_contact: "First contact",
  facts_of_loss: "Facts of loss",
  liability: "Preliminary liability",
  rideshare_status: "Rideshare status",
  tesla_footage: "Tesla footage",
  completion: "Completion",
};

function formatDateTime(value: Date | number | string | null | undefined) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function formatMinutes(value: number | null | undefined) {
  if (value == null) return "—";
  if (value < 60) return `${Math.round(value)}m`;
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return `${hours}h ${minutes}m`;
}

function parseStringList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function slaBadge(state: string) {
  if (state === "breached") return "border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300";
  if (state === "at_risk") return "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300";
  return "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300";
}

function stageBadge(stage: string) {
  if (stage === "complete") return "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300";
  if (stage === "contact_attempts") return "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300";
  if (stage === "outreach_started") return "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300";
  return "border-border bg-muted text-muted-foreground";
}

function KpiCard({
  label,
  value,
  note,
  icon: Icon,
  tone = "orange",
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof BarChart3;
  tone?: "orange" | "green" | "blue" | "red";
}) {
  const tones = {
    orange: "bg-orange-500/10 text-[#ff6221]",
    green: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    red: "bg-red-500/10 text-red-600 dark:text-red-400",
  };
  return (
    <Card className="border-border/70 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{note}</p>
          </div>
          <div className={`rounded-xl p-2.5 ${tones[tone]}`}><Icon className="h-5 w-5" /></div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-6 text-center">
      <FileSearch className="mb-3 h-8 w-8 text-muted-foreground/60" />
      <p className="font-semibold text-foreground">{title}</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function ClaimDetailSheet({ claimId, onClose }: { claimId: number | null; onClose: () => void }) {
  const { data, isLoading } = trpc.lossIntake.claims.get.useQuery(
    { id: claimId ?? 1 },
    { enabled: claimId !== null },
  );

  return (
    <Sheet open={claimId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        {isLoading || !data ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading claim evidence…
          </div>
        ) : (
          <div className="space-y-6 pb-8">
            <SheetHeader>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={slaBadge(data.claim.slaState)}>{SLA_LABELS[data.claim.slaState]}</Badge>
                <Badge variant="outline" className={stageBadge(data.claim.stage)}>{STAGE_LABELS[data.claim.stage]}</Badge>
              </div>
              <SheetTitle className="text-xl">{data.claim.memberName ?? "Unidentified member"}</SheetTitle>
              <SheetDescription>
                {data.claim.customerId ? `Customer ${data.claim.customerId}` : "No customer ID extracted"} · {data.claim.market ?? "Market unknown"}
              </SheetDescription>
            </SheetHeader>

            <div className="grid grid-cols-2 gap-3 rounded-xl border bg-muted/20 p-4 text-sm">
              <div><p className="text-xs text-muted-foreground">Assigned representative</p><p className="mt-1 font-medium">{data.claim.assignedAgent ?? "Unassigned"}</p></div>
              <div><p className="text-xs text-muted-foreground">Vehicle</p><p className="mt-1 font-medium">{data.claim.vehicleType === "ev_tesla" ? "Tesla / EV" : data.claim.vehicleType === "gas" ? "Gas" : "Unknown"}</p></div>
              <div><p className="text-xs text-muted-foreground">First contact</p><p className="mt-1 font-medium">{formatMinutes(data.claim.firstContactMinutes)}</p></div>
              <div><p className="text-xs text-muted-foreground">Intake cycle</p><p className="mt-1 font-medium">{formatMinutes(data.claim.intakeCycleMinutes)}</p></div>
              <div><p className="text-xs text-muted-foreground">No-answer attempts</p><p className="mt-1 font-medium">{data.claim.noAnswerAttempts}</p></div>
              <div><p className="text-xs text-muted-foreground">Quality score</p><p className="mt-1 font-medium">{data.claim.qualityScore == null ? "Not scored" : `${data.claim.qualityScore}/100`}</p></div>
            </div>

            <section>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold text-foreground">Slack evidence timeline</h3>
                {data.claim.slackPermalink && (
                  <a href={data.claim.slackPermalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-[#ff6221] hover:underline">
                    Open thread <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <div className="space-y-0">
                {data.events.map((event, index) => (
                  <div key={event.id} className="relative flex gap-3 pb-5">
                    {index < data.events.length - 1 && <div className="absolute left-[9px] top-5 h-full w-px bg-border" />}
                    <div className="z-10 mt-1 h-[19px] w-[19px] flex-shrink-0 rounded-full border-4 border-background bg-[#ff6221]" />
                    <div className="min-w-0 flex-1 rounded-lg border bg-card p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{EVENT_LABELS[event.eventType] ?? event.eventType}</p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(event.occurredAt)}</p>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{event.actorName ?? "Slack workflow"}</p>
                      {event.body && <p className="mt-2 rounded-md bg-muted/60 p-2 text-sm leading-relaxed">“{event.body}”</p>}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h3 className="mb-3 font-semibold text-foreground">Quality criteria</h3>
              <div className="space-y-2">
                {data.qualityItems.map((item) => (
                  <div key={item.id} className="flex items-start gap-3 rounded-lg border p-3">
                    {item.result === "pass" ? <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" /> : <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">{CRITERION_LABELS[item.criterion] ?? item.criterion}</p>
                        <span className="text-xs font-semibold text-muted-foreground">{item.points}/{item.maxPoints}</span>
                      </div>
                      {item.evidence && <p className="mt-1 text-xs text-muted-foreground">{item.evidence}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function LossIntake() {
  const { user } = useAuth();
  const { impersonating, isImpersonating } = useImpersonation();
  const isAdmin = user?.role === "admin";
  const representativeView = !isAdmin || isImpersonating;
  const scopedHandlerId = isAdmin && impersonating ? impersonating.id : undefined;
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedClaimId, setSelectedClaimId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("all");
  const [slaState, setSlaState] = useState("all");
  const [vehicleType, setVehicleType] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [qaResponses, setQaResponses] = useState<Record<number, string>>({});

  const dateScope = useMemo(() => ({
    ...(dateFrom ? { dateFromMs: new Date(`${dateFrom}T00:00:00`).getTime() } : {}),
    ...(dateTo ? { dateToMs: new Date(`${dateTo}T23:59:59.999`).getTime() } : {}),
    ...(scopedHandlerId ? { handlerId: scopedHandlerId } : {}),
  }), [dateFrom, dateTo, scopedHandlerId]);

  const claimInput = useMemo(() => ({
    ...dateScope,
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(stage !== "all" ? { stage: stage as "awaiting_outreach" | "outreach_started" | "contact_attempts" | "complete" } : {}),
    ...(slaState !== "all" ? { slaState: slaState as "within_sla" | "at_risk" | "breached" } : {}),
    ...(vehicleType !== "all" ? { vehicleType: vehicleType as "gas" | "ev_tesla" | "unknown" } : {}),
    limit: 100,
    offset: 0,
  }), [dateScope, search, stage, slaState, vehicleType]);

  const overview = trpc.lossIntake.overview.useQuery(dateScope);
  const claims = trpc.lossIntake.claims.list.useQuery(claimInput);
  const qa = trpc.lossIntake.qa.list.useQuery();
  const settings = trpc.lossIntake.settings.get.useQuery(undefined, { enabled: !!isAdmin && !isImpersonating });
  const handlers = trpc.lossIntake.handlers.useQuery(undefined, { enabled: !!isAdmin && !isImpersonating });
  const syncHealth = trpc.lossIntake.syncHealth.useQuery(undefined, { enabled: !!isAdmin && !isImpersonating });
  const utils = trpc.useUtils();

  const runNow = trpc.lossIntake.sync.runNow.useMutation({
    onSuccess: async result => {
      await Promise.all([utils.lossIntake.overview.invalidate(), utils.lossIntake.claims.list.invalidate(), utils.lossIntake.syncHealth.invalidate()]);
      toast.success(`Sync complete: ${result.claimsDiscovered} claims discovered, ${result.claimsUpdated} updated.`);
    },
    onError: error => toast.error(error.message),
  });
  const enableSchedule = trpc.lossIntake.sync.enableFiveMinuteSchedule.useMutation({
    onSuccess: async () => { await utils.lossIntake.syncHealth.invalidate(); toast.success("Five-minute Slack polling enabled."); },
    onError: error => toast.error(error.message),
  });
  const pauseSchedule = trpc.lossIntake.sync.pauseSchedule.useMutation({
    onSuccess: async () => { await utils.lossIntake.syncHealth.invalidate(); toast.success("Scheduled polling paused."); },
    onError: error => toast.error(error.message),
  });
  const respondToQa = trpc.lossIntake.qa.respond.useMutation({
    onSuccess: async () => { await utils.lossIntake.qa.list.invalidate(); toast.success("QA response recorded."); },
    onError: error => toast.error(error.message),
  });
  const updateQa = trpc.lossIntake.qa.managerUpdate.useMutation({
    onSuccess: async () => { await utils.lossIntake.qa.list.invalidate(); toast.success("QA status updated."); },
    onError: error => toast.error(error.message),
  });
  const updateSettings = trpc.lossIntake.settings.update.useMutation({
    onSuccess: async () => { await Promise.all([utils.lossIntake.settings.get.invalidate(), utils.lossIntake.syncHealth.invalidate()]); toast.success("Loss Intake settings saved."); },
    onError: error => toast.error(error.message),
  });

  const stats = overview.data;
  const isPageLoading = overview.isLoading || claims.isLoading;
  const currentViewLabel = representativeView ? (impersonating?.name ?? user?.name ?? "My") : "Team";

  return (
    <WhipLayout>
      <div className="min-h-full bg-muted/20">
        <div className="border-b bg-background">
          <div className="px-4 py-5 sm:px-6 lg:px-8">
            <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-foreground">Loss Intake Monitor</h1>
                  <Badge variant="outline" className="border-[#ff6221]/30 bg-[#ff6221]/10 text-[#d94d12] dark:text-orange-300">
                    <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-[#ff6221]" /> {currentViewLabel} view
                  </Badge>
                </div>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">First-contact SLA, intake completion, and structured QA evidence from approved Slack FNOL threads.</p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1"><Label className="text-[11px] text-muted-foreground">From</Label><Input type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} className="h-9 w-36" /></div>
                <div className="space-y-1"><Label className="text-[11px] text-muted-foreground">To</Label><Input type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} className="h-9 w-36" /></div>
                {(dateFrom || dateTo) && <Button variant="ghost" size="sm" onClick={() => { setDateFrom(""); setDateTo(""); }}>Clear</Button>}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6 p-4 sm:p-6 lg:p-8">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="h-auto flex-wrap justify-start bg-background p-1 shadow-sm">
              <TabsTrigger value="overview" className="gap-2"><BarChart3 className="h-4 w-4" /> Overview</TabsTrigger>
              <TabsTrigger value="claims" className="gap-2"><Workflow className="h-4 w-4" /> Claims</TabsTrigger>
              <TabsTrigger value="qa" className="gap-2"><ClipboardCheck className="h-4 w-4" /> {representativeView ? "My QA" : "QA inbox"}</TabsTrigger>
              {isAdmin && !isImpersonating && <TabsTrigger value="settings" className="gap-2"><Settings2 className="h-4 w-4" /> Sync & settings</TabsTrigger>}
            </TabsList>

            <TabsContent value="overview" className="mt-6 space-y-6">
              {isPageLoading ? (
                <div className="flex min-h-72 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading Loss Intake metrics…</div>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                    <KpiCard label="FNOL volume" value={String(stats?.totalClaims ?? 0)} note={`${stats?.pendingClaims ?? 0} still open`} icon={Workflow} />
                    <KpiCard label="On-time contact" value={stats?.onTimeRate == null ? "—" : `${stats.onTimeRate.toFixed(0)}%`} note="10-minute target" icon={ShieldCheck} tone="green" />
                    <KpiCard label="Avg. first contact" value={formatMinutes(stats?.averageFirstContactMinutes)} note="Assigned rep only" icon={Clock3} tone="blue" />
                    <KpiCard label="Avg. intake cycle" value={formatMinutes(stats?.averageIntakeCycleMinutes)} note="Post to good-to-go" icon={TimerReset} tone="blue" />
                    <KpiCard label="Avg. quality" value={stats?.averageQualityScore == null ? "—" : `${stats.averageQualityScore.toFixed(0)}/100`} note="Evidence-weighted rubric" icon={Gauge} tone="green" />
                    <KpiCard label="SLA breaches" value={String(stats?.breachedCount ?? 0)} note="Needs supervisor review" icon={AlertTriangle} tone="red" />
                  </div>

                  <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                    <Card className="shadow-sm">
                      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4 text-[#ff6221]" /> {representativeView ? `${currentViewLabel} performance` : "Team performance"}</CardTitle></CardHeader>
                      <CardContent>
                        {!stats?.byHandler.length ? <EmptyState title="No representative metrics yet" description="Metrics will appear after the first authorized Slack sync processes FNOL threads." /> : (
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[680px] text-sm">
                              <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="pb-3 font-medium">Representative</th><th className="pb-3 font-medium">Volume</th><th className="pb-3 font-medium">Completed</th><th className="pb-3 font-medium">Breached</th><th className="pb-3 font-medium">Quality</th></tr></thead>
                              <tbody>{stats.byHandler.map(handler => {
                                const completion = handler.total ? (handler.completed / handler.total) * 100 : 0;
                                return <tr key={handler.handlerName} className="border-b last:border-0">
                                  <td className="py-3 font-medium">{handler.handlerName}</td>
                                  <td className="py-3">{handler.total}</td>
                                  <td className="py-3"><div className="flex items-center gap-2"><Progress value={completion} className="h-1.5 w-20" /><span className="text-xs text-muted-foreground">{completion.toFixed(0)}%</span></div></td>
                                  <td className="py-3"><span className={handler.breached ? "font-semibold text-red-600 dark:text-red-400" : "text-muted-foreground"}>{handler.breached}</span></td>
                                  <td className="py-3 font-semibold">{handler.averageScore == null ? "—" : `${handler.averageScore.toFixed(0)}/100`}</td>
                                </tr>;
                              })}</tbody>
                            </table>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="shadow-sm">
                      <CardHeader><CardTitle className="text-base">Work in progress</CardTitle></CardHeader>
                      <CardContent className="space-y-4">
                        {Object.entries(stats?.byStage ?? {}).map(([key, value]) => {
                          const total = stats?.totalClaims || 1;
                          const percent = (value / total) * 100;
                          return <div key={key}>
                            <div className="mb-1.5 flex items-center justify-between text-sm"><span>{STAGE_LABELS[key]}</span><span className="font-semibold">{value}</span></div>
                            <Progress value={percent} className="h-2" />
                          </div>;
                        })}
                      </CardContent>
                    </Card>
                  </div>

                  <Card className="shadow-sm">
                    <CardHeader><CardTitle className="text-base">Recent FNOL activity</CardTitle></CardHeader>
                    <CardContent>
                      {!claims.data?.claims.length ? <EmptyState title="No FNOL claims found" description="Adjust the date range or run the first Slack synchronization from Sync & settings." /> : (
                        <div className="divide-y rounded-xl border">
                          {claims.data.claims.slice(0, 8).map(claim => (
                            <button key={claim.id} onClick={() => setSelectedClaimId(claim.id)} className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/50">
                              <div className={`h-9 w-1 rounded-full ${claim.slaState === "breached" ? "bg-red-500" : claim.slaState === "at_risk" ? "bg-amber-500" : "bg-emerald-500"}`} />
                              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{claim.memberName ?? "Unidentified member"}</p><p className="truncate text-xs text-muted-foreground">{claim.customerId ?? "No customer ID"} · {claim.assignedAgent ?? "Unassigned"} · {formatDateTime(claim.postedAt)}</p></div>
                              <Badge variant="outline" className={slaBadge(claim.slaState)}>{SLA_LABELS[claim.slaState]}</Badge>
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </button>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>

            <TabsContent value="claims" className="mt-6 space-y-4">
              <Card className="shadow-sm">
                <CardContent className="p-4">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_180px_160px_160px]">
                    <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search member, customer ID, market…" className="pl-9" /></div>
                    <Select value={stage} onValueChange={setStage}><SelectTrigger><SelectValue placeholder="All stages" /></SelectTrigger><SelectContent><SelectItem value="all">All stages</SelectItem>{Object.entries(STAGE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
                    <Select value={slaState} onValueChange={setSlaState}><SelectTrigger><SelectValue placeholder="All SLA states" /></SelectTrigger><SelectContent><SelectItem value="all">All SLA states</SelectItem>{Object.entries(SLA_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
                    <Select value={vehicleType} onValueChange={setVehicleType}><SelectTrigger><SelectValue placeholder="All vehicles" /></SelectTrigger><SelectContent><SelectItem value="all">All vehicles</SelectItem><SelectItem value="gas">Gas</SelectItem><SelectItem value="ev_tesla">Tesla / EV</SelectItem><SelectItem value="unknown">Unknown</SelectItem></SelectContent></Select>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader className="flex-row items-center justify-between"><CardTitle className="text-base">Claims <span className="ml-1 font-normal text-muted-foreground">({claims.data?.total ?? 0})</span></CardTitle>{claims.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}</CardHeader>
                <CardContent>
                  {!claims.data?.claims.length ? <EmptyState title="No matching claims" description="Try clearing a filter or broadening the selected date range." /> : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[960px] text-sm">
                        <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="pb-3 font-medium">FNOL</th><th className="pb-3 font-medium">Representative</th><th className="pb-3 font-medium">Stage</th><th className="pb-3 font-medium">First contact</th><th className="pb-3 font-medium">Cycle</th><th className="pb-3 font-medium">Quality</th><th className="pb-3 font-medium">SLA</th><th /></tr></thead>
                        <tbody>{claims.data.claims.map(claim => <tr key={claim.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-3"><p className="font-semibold">{claim.memberName ?? "Unidentified member"}</p><p className="text-xs text-muted-foreground">{claim.customerId ?? "No customer ID"} · {claim.market ?? "Unknown market"}</p></td>
                          <td className="py-3">{claim.assignedAgent ?? "Unassigned"}</td>
                          <td className="py-3"><Badge variant="outline" className={stageBadge(claim.stage)}>{STAGE_LABELS[claim.stage]}</Badge></td>
                          <td className="py-3">{formatMinutes(claim.firstContactMinutes)}</td>
                          <td className="py-3">{formatMinutes(claim.intakeCycleMinutes)}</td>
                          <td className="py-3 font-semibold">{claim.qualityScore == null ? "—" : `${claim.qualityScore}/100`}</td>
                          <td className="py-3"><Badge variant="outline" className={slaBadge(claim.slaState)}>{SLA_LABELS[claim.slaState]}</Badge></td>
                          <td className="py-3 text-right"><Button size="sm" variant="ghost" onClick={() => setSelectedClaimId(claim.id)}>Evidence <ChevronRight className="ml-1 h-3.5 w-3.5" /></Button></td>
                        </tr>)}</tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="qa" className="mt-6">
              <Card className="shadow-sm">
                <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="h-4 w-4 text-[#ff6221]" /> {representativeView ? "My QA feedback" : "Supervisor QA inbox"}</CardTitle></CardHeader>
                <CardContent>
                  {!qa.data?.length ? <EmptyState title="No QA items yet" description={representativeView ? "Your sent QA reviews and coaching notes will appear here." : "Create QA drafts from scored FNOL claims after the first synchronization."} /> : (
                    <div className="space-y-4">
                      {qa.data.map(({ qa: item, claim }) => {
                        const strengths = parseStringList(item.strengths);
                        const opportunities = parseStringList(item.coachingOpportunities);
                        const response = qaResponses[item.id] ?? "";
                        return <div key={item.id} className="rounded-xl border bg-card p-4">
                          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                            <div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{item.handlerName}</p><Badge variant="outline">{item.status}</Badge><Badge variant="outline" className="border-[#ff6221]/30 bg-[#ff6221]/10 text-[#d94d12]">{item.overallScore}/100</Badge></div><p className="mt-1 text-xs text-muted-foreground">{claim.memberName ?? "FNOL claim"} · drafted {formatDateTime(item.draftedAt)}</p></div>
                            <Button size="sm" variant="outline" onClick={() => setSelectedClaimId(claim.id)}>View evidence</Button>
                          </div>
                          <div className="mt-4 grid gap-4 lg:grid-cols-2">
                            <div className="rounded-lg bg-emerald-500/5 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Strengths</p>{strengths.length ? <ul className="mt-2 space-y-1 text-sm">{strengths.map(text => <li key={text}>• {text}</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No strengths recorded.</p>}</div>
                            <div className="rounded-lg bg-amber-500/5 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">Coaching opportunities</p>{opportunities.length ? <ul className="mt-2 space-y-1 text-sm">{opportunities.map(text => <li key={text}>• {text}</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No coaching points recorded.</p>}</div>
                          </div>
                          {item.managerComments && <div className="mt-4 rounded-lg border-l-4 border-blue-400 bg-blue-500/5 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400">Supervisor note</p><p className="mt-1 text-sm">{item.managerComments}</p></div>}
                          {representativeView ? (
                            <div className="mt-4 flex flex-col gap-2 sm:flex-row"><Textarea value={response} onChange={event => setQaResponses(current => ({ ...current, [item.id]: event.target.value }))} placeholder="Acknowledge the feedback or add context…" className="min-h-20 flex-1" /><Button disabled={!response.trim() || respondToQa.isPending} onClick={() => respondToQa.mutate({ id: item.id, response: response.trim() })} className="gap-2 bg-[#ff6221] text-white hover:bg-[#e5541a]"><Send className="h-4 w-4" /> Respond</Button></div>
                          ) : (
                            <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => updateQa.mutate({ id: item.id, status: "reviewed" })}>Mark reviewed</Button><Button size="sm" className="bg-[#ff6221] text-white hover:bg-[#e5541a]" onClick={() => updateQa.mutate({ id: item.id, status: "sent" })}>Send to representative</Button><Button size="sm" variant="outline" onClick={() => updateQa.mutate({ id: item.id, status: "resolved" })}>Resolve</Button></div>
                          )}
                        </div>;
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {isAdmin && !isImpersonating && (
              <TabsContent value="settings" className="mt-6 space-y-6">
                <div className="grid gap-6 xl:grid-cols-2">
                  <Card className="shadow-sm">
                    <CardHeader><CardTitle className="flex items-center gap-2 text-base"><RefreshCw className="h-4 w-4 text-[#ff6221]" /> Slack synchronization</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                      <div className="rounded-xl border bg-muted/20 p-4">
                        <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">Whip Loss Intake Monitor</p><p className="mt-1 text-xs text-muted-foreground">#claims and #claims-remotemarkets · every five minutes</p></div><Badge variant="outline" className={syncHealth.data?.settings.scheduleCronTaskUid ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-amber-300 bg-amber-50 text-amber-700"}>{syncHealth.data?.settings.scheduleCronTaskUid ? "Configured" : "Not scheduled"}</Badge></div>
                        <div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-muted-foreground">Last successful sync</p><p className="mt-1 font-medium">{formatDateTime(syncHealth.data?.settings.lastSuccessfulSyncAt)}</p></div><div><p className="text-xs text-muted-foreground">Latest run</p><p className="mt-1 font-medium capitalize">{syncHealth.data?.latestRun?.status ?? "No runs"}</p></div></div>
                        {syncHealth.data?.settings.lastSyncError && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">{syncHealth.data.settings.lastSyncError}</div>}
                      </div>
                      <div className="flex flex-wrap gap-2"><Button className="gap-2 bg-[#ff6221] text-white hover:bg-[#e5541a]" disabled={runNow.isPending} onClick={() => runNow.mutate()}>{runNow.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Sync now</Button><Button variant="outline" disabled={enableSchedule.isPending} onClick={() => enableSchedule.mutate()}>Enable 5-minute schedule</Button><Button variant="ghost" disabled={pauseSchedule.isPending} onClick={() => pauseSchedule.mutate()}>Pause schedule</Button></div>
                    </CardContent>
                  </Card>

                  <Card className="shadow-sm">
                    <CardHeader><CardTitle className="flex items-center gap-2 text-base"><TimerReset className="h-4 w-4 text-[#ff6221]" /> SLA and QA policy</CardTitle></CardHeader>
                    <CardContent>
                      {settings.data ? <PolicyForm settings={settings.data} saving={updateSettings.isPending} onSave={values => updateSettings.mutate(values)} /> : <div className="flex min-h-40 items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>}
                    </CardContent>
                  </Card>
                </div>

                <Card className="shadow-sm">
                  <CardHeader><CardTitle className="flex items-center gap-2 text-base"><UserRoundCheck className="h-4 w-4 text-[#ff6221]" /> Representative identity mapping</CardTitle></CardHeader>
                  <CardContent><AssignmentForm settings={settings.data} handlers={handlers.data ?? []} saving={updateSettings.isPending} onSave={agentAssignments => updateSettings.mutate({ agentAssignments })} /></CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>
      <ClaimDetailSheet claimId={selectedClaimId} onClose={() => setSelectedClaimId(null)} />
    </WhipLayout>
  );
}

function PolicyForm({
  settings,
  saving,
  onSave,
}: {
  settings: { firstContactSlaMinutes: number; atRiskMinutes: number; qaDueHours: number };
  saving: boolean;
  onSave: (values: { firstContactSlaMinutes: number; atRiskMinutes: number; qaDueHours: number }) => void;
}) {
  const [sla, setSla] = useState(String(settings.firstContactSlaMinutes));
  const [risk, setRisk] = useState(String(settings.atRiskMinutes));
  const [qaHours, setQaHours] = useState(String(settings.qaDueHours));
  return <div className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="space-y-1.5"><Label className="text-xs">First-contact SLA</Label><div className="relative"><Input type="number" min={1} max={120} value={sla} onChange={event => setSla(event.target.value)} className="pr-14" /><span className="absolute right-3 top-2.5 text-xs text-muted-foreground">minutes</span></div></div>
      <div className="space-y-1.5"><Label className="text-xs">At-risk threshold</Label><div className="relative"><Input type="number" min={1} max={119} value={risk} onChange={event => setRisk(event.target.value)} className="pr-14" /><span className="absolute right-3 top-2.5 text-xs text-muted-foreground">minutes</span></div></div>
      <div className="space-y-1.5"><Label className="text-xs">QA due</Label><div className="relative"><Input type="number" min={1} max={168} value={qaHours} onChange={event => setQaHours(event.target.value)} className="pr-12" /><span className="absolute right-3 top-2.5 text-xs text-muted-foreground">hours</span></div></div>
    </div>
    <p className="text-xs leading-relaxed text-muted-foreground">First contact is measured only from a configured representative’s first valid thread reply. At-risk must remain below the SLA threshold.</p>
    <Button disabled={saving || !sla || !risk || !qaHours} onClick={() => onSave({ firstContactSlaMinutes: Number(sla), atRiskMinutes: Number(risk), qaDueHours: Number(qaHours) })} className="bg-[#ff6221] text-white hover:bg-[#e5541a]">Save policy</Button>
  </div>;
}

function AssignmentForm({
  settings,
  handlers,
  saving,
  onSave,
}: {
  settings: { agentAssignments: unknown } | undefined;
  handlers: Array<{ id: number; name: string; email: string | null; active: boolean }>;
  saving: boolean;
  onSave: (assignments: Array<{ slackUserId: string; handlerId: number; handlerName: string }>) => void;
}) {
  const initial = useMemo(() => {
    if (!settings?.agentAssignments) return [];
    if (Array.isArray(settings.agentAssignments)) return settings.agentAssignments as Array<{ slackUserId: string; handlerId: number; handlerName: string }>;
    if (typeof settings.agentAssignments === "string") {
      try { const parsed = JSON.parse(settings.agentAssignments); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
    }
    return [];
  }, [settings?.agentAssignments]);
  const [rows, setRows] = useState<Array<{ slackUserId: string; handlerId: number; handlerName: string }>>(initial);
  const [slackUserId, setSlackUserId] = useState("");
  const [handlerId, setHandlerId] = useState("");
  const add = () => {
    const handler = handlers.find(item => String(item.id) === handlerId);
    if (!handler || !slackUserId.trim()) return;
    setRows(current => [...current.filter(item => item.slackUserId !== slackUserId.trim()), { slackUserId: slackUserId.trim(), handlerId: handler.id, handlerName: handler.name }]);
    setSlackUserId("");
    setHandlerId("");
  };
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">Only mapped Slack users can start the SLA clock or satisfy workflow milestones. This prevents non-representative thread activity from affecting performance metrics.</p>
    <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]"><Input value={slackUserId} onChange={event => setSlackUserId(event.target.value)} placeholder="Slack member ID (for example U012ABC…)" /><Select value={handlerId} onValueChange={setHandlerId}><SelectTrigger><SelectValue placeholder="Choose handler profile" /></SelectTrigger><SelectContent>{handlers.map(handler => <SelectItem key={handler.id} value={String(handler.id)}>{handler.name}</SelectItem>)}</SelectContent></Select><Button variant="outline" disabled={!slackUserId.trim() || !handlerId} onClick={add}>Add mapping</Button></div>
    {!rows.length ? <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">No representative identities mapped yet.</div> : <div className="divide-y rounded-lg border">{rows.map(row => <div key={row.slackUserId} className="flex items-center gap-3 p-3"><div className="flex-1"><p className="text-sm font-medium">{row.handlerName}</p><p className="text-xs text-muted-foreground">{row.slackUserId}</p></div><Button variant="ghost" size="sm" onClick={() => setRows(current => current.filter(item => item.slackUserId !== row.slackUserId))}>Remove</Button></div>)}</div>}
    <Button disabled={saving} onClick={() => onSave(rows)} className="bg-[#ff6221] text-white hover:bg-[#e5541a]">Save identity mappings</Button>
  </div>;
}
