import WhipLayout from "@/components/WhipLayout";
import { trpc } from "@/lib/trpc";
import { DispatchQaClaim, LossIntakeQaDashboard } from "@/components/LossIntakeQaDashboard";
import { LossIntakeProcessorQueue, type ProcessorQueueItem } from "@/components/LossIntakeProcessorQueue";
import { useAuth } from "@/_core/hooks/useAuth";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  CircleDot,
  Clock3,
  ExternalLink,
  FileQuestion,
  Filter,
  LayoutDashboard,
  Loader2,
  MapPin,
  MessageSquareText,
  RefreshCw,
  Search,
  ShieldAlert,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type ClaimStage = "awaiting_outreach" | "outreach_started" | "contact_attempts" | "complete";
type ClaimSlaState = "within_sla" | "at_risk" | "breached";

const stageLabel: Record<ClaimStage, string> = {
  awaiting_outreach: "Awaiting outreach",
  outreach_started: "Outreach started",
  contact_attempts: "Attempts underway",
  complete: "Intake complete",
};

function formatDate(value: Date | string | number | null | undefined, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-US", options);
}

function formatMinutes(value: number | null | undefined) {
  if (value === null || value === undefined) return "Not started";
  if (value < 60) return `${Math.round(value)} min`;
  return `${Math.floor(value / 60)}h ${Math.round(value % 60)}m`;
}

function dispatchTargetLabel(claim: { slaTargetBusinessMinutes?: number | null; channelName: string }) {
  const target = claim.slaTargetBusinessMinutes ?? (claim.channelName === "remote-markets" ? 240 : 10);
  return `${target}-min business target`;
}

function isTodayEastern(value: Date | string | null | undefined) {
  if (!value) return false;
  const candidate = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(candidate.getTime())) return false;
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
  return formatter.format(candidate) === formatter.format(new Date());
}

function priorityFor(claim: {
  onSiteFlag: boolean;
  firstContactAt: Date | null;
  slaState: ClaimSlaState;
  completedAt: Date | null;
  channelName: string;
  inspectionScheduledAt?: Date | null;
}) {
  if (claim.completedAt) return { label: "Complete", tone: "bg-emerald-50 text-emerald-700 border-emerald-200", order: 4 };
  if (claim.onSiteFlag && !claim.firstContactAt) return { label: "In office · act now", tone: "bg-red-50 text-red-700 border-red-200", order: 0 };
  if (isTodayEastern(claim.inspectionScheduledAt) && !claim.firstContactAt) return { label: "Inspection today", tone: "bg-violet-50 text-violet-700 border-violet-200", order: 1 };
  if (claim.slaState === "breached") return { label: "SLA breached", tone: "bg-red-50 text-red-700 border-red-200", order: 2 };
  if (claim.slaState === "at_risk") return { label: "At risk", tone: "bg-amber-50 text-amber-700 border-amber-200", order: 3 };
  return { label: claim.channelName === "remote-markets" ? "Remote market" : "New report", tone: "bg-blue-50 text-blue-700 border-blue-200", order: 4 };
}

function Metric({ label, value, detail, icon: Icon, tone = "orange" }: { label: string; value: string; detail: string; icon: typeof Clock3; tone?: "orange" | "red" | "green" | "blue" }) {
  const tones = {
    orange: "bg-[#ff6221]/10 text-[#dd571d]",
    red: "bg-red-500/10 text-red-600",
    green: "bg-emerald-500/10 text-emerald-600",
    blue: "bg-sky-500/10 text-sky-600",
  };
  return (
    <Card className="border-border/70 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
          </div>
          <span className={`rounded-xl p-2.5 ${tones[tone]}`}><Icon className="h-5 w-5" /></span>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyDispatch({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-6 text-center">
      <CheckCircle2 className="mb-3 h-9 w-9 text-emerald-500" />
      <p className="font-semibold text-foreground">{title}</p>
      <p className="mt-1 max-w-lg text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

export default function LossIntakeDispatch() {
  const { user } = useAuth();
  const { impersonating, isImpersonating } = useImpersonation();
  const isAdmin = user?.role === "admin";
  const scopedHandlerId = isAdmin && impersonating ? impersonating.id : undefined;
  const [activeTab, setActiveTab] = useState("dispatch");
  const selectionStorageKey = `loss-intake-board-view:${user?.id ?? user?.email ?? "viewer"}`;
  const [queueView, setQueueView] = useState<"intake" | "processors">("intake");
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState("all");
  const [status, setStatus] = useState("open");
  const [selectedClaimId, setSelectedClaimId] = useState<number | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(selectionStorageKey);
    if (saved === "intake" || saved === "processors") setQueueView(saved);
  }, [selectionStorageKey]);

  const setPersistedQueueView = (next: "intake" | "processors") => {
    setQueueView(next);
    window.localStorage.setItem(selectionStorageKey, next);
  };

  const filters = useMemo(() => ({
    ...(scopedHandlerId ? { handlerId: scopedHandlerId } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
    limit: 200,
    offset: 0,
  }), [scopedHandlerId, search]);

  const overview = trpc.lossIntake.overview.useQuery(scopedHandlerId ? { handlerId: scopedHandlerId } : {});
  const claimsQuery = trpc.lossIntake.claims.list.useQuery(filters, { refetchInterval: 60_000 });
  const processorQueue = trpc.lossIntake.processors.queue.useQuery(undefined, {
    refetchInterval: 15_000,
    enabled: isAdmin || user?.handlerProfileId === 3 || user?.handlerProfileId === 30002,
  });
  const syncHealth = trpc.lossIntake.syncHealth.useQuery(undefined, { enabled: isAdmin && !isImpersonating });
  const claimsTracker = trpc.lossIntake.claimsTrackerStatus.useQuery(undefined, { enabled: isAdmin && !isImpersonating });
  const dispatchStatus = trpc.lossIntake.dispatch.scheduleStatus.useQuery(undefined, { enabled: isAdmin && !isImpersonating });
  const utils = trpc.useUtils();
  const runNow = trpc.lossIntake.sync.runNow.useMutation({
    onSuccess: async result => {
      await Promise.all([utils.lossIntake.overview.invalidate(), utils.lossIntake.claims.list.invalidate(), utils.lossIntake.syncHealth.invalidate()]);
      toast.success(`Dispatch refreshed: ${result.claimsUpdated} intake notice${result.claimsUpdated === 1 ? "" : "s"} reviewed.`);
    },
    onError: error => toast.error(error.message),
  });
  const publishDispatch = trpc.lossIntake.dispatch.publishNow.useMutation({
    onSuccess: result => toast.success(`Dispatch updated: ${result.unfiled.length} unfiled and ${result.intake.length} intake follow-up item${result.intake.length === 1 ? "" : "s"}.`),
    onError: error => toast.error(error.message),
  });
  const enableDispatchSchedule = trpc.lossIntake.dispatch.enableSchedule.useMutation({
    onSuccess: async () => {
      await dispatchStatus.refetch();
      toast.success("Loss Intake Dispatch schedule enabled.");
    },
    onError: error => toast.error(error.message),
  });
  const pauseDispatchSchedule = trpc.lossIntake.dispatch.pauseSchedule.useMutation({
    onSuccess: async () => {
      await dispatchStatus.refetch();
      toast.success("Loss Intake Dispatch schedule paused.");
    },
    onError: error => toast.error(error.message),
  });
  const updateProcessorStatus = trpc.lossIntake.processors.setStatus.useMutation({
    onSuccess: async () => {
      await processorQueue.refetch();
      toast.success("Processor queue updated for all viewers.");
    },
    onError: error => toast.error(error.message),
  });

  const claims = (claimsQuery.data?.claims ?? []) as DispatchQaClaim[];
  const filteredClaims = useMemo(() => claims
    .filter(claim => channel === "all" || claim.channelName === channel)
    .filter(claim => status === "all" || (status === "open" ? !claim.completedAt : claim.stage === status))
    .sort((left, right) => {
      const leftPriority = priorityFor(left).order;
      const rightPriority = priorityFor(right).order;
      return leftPriority - rightPriority || right.postedAt.getTime() - left.postedAt.getTime();
    }), [claims, channel, status]);

  const active = claims.filter(claim => !claim.completedAt);
  const inOffice = active.filter(claim => claim.onSiteFlag && !claim.firstContactAt);
  const attention = active.filter(claim => claim.slaState === "breached" || claim.slaState === "at_risk");
  const processorQueueItems = (processorQueue.data?.items ?? []) as ProcessorQueueItem[];
  const canWorkProcessorQueue = isAdmin || user?.handlerProfileId === 3 || user?.handlerProfileId === 30002;
  const selectedClaim = claims.find(claim => claim.id === selectedClaimId) ?? null;
  const currentView = isImpersonating ? impersonating?.name ?? "Representative" : isAdmin ? "Team" : user?.name ?? "My";

  return (
    <WhipLayout>
      <main className="min-h-full bg-muted/20">
        <section className="border-b border-[#1b2449]/10 bg-background">
          <div className="px-4 py-5 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#151d44] text-white shadow-sm"><LayoutDashboard className="h-4 w-4" /></div>
                  <h1 className="text-2xl font-bold tracking-tight text-foreground">Loss Intake Dispatch</h1>
                  <Badge variant="outline" className="border-[#ff6221]/30 bg-[#ff6221]/10 text-[#c94d16]">{currentView} view</Badge>
                </div>
                <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Separate Intake and Processor workspaces: Slack controls arrival and response evidence; All Reported IncidentsStatus is the binary filed-claim record.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="gap-1.5 bg-background text-muted-foreground"><CircleDot className="h-3 w-3 text-[#ff6221]" /> #claims</Badge>
                <Badge variant="outline" className="gap-1.5 bg-background text-muted-foreground"><CircleDot className="h-3 w-3 text-sky-500" /> #claims-remotemarkets</Badge>
                <Badge variant="outline" className="gap-1.5 bg-background text-muted-foreground"><CircleDot className="h-3 w-3 text-violet-500" /> #escalations</Badge>
                <Badge variant="outline" className="gap-1.5 bg-background text-muted-foreground"><CircleDot className="h-3 w-3 text-emerald-500" /> #claims-processing</Badge>
                {isAdmin && !isImpersonating && <Button variant="outline" size="sm" className="gap-2" onClick={() => runNow.mutate()} disabled={runNow.isPending}><RefreshCw className={`h-3.5 w-3.5 ${runNow.isPending ? "animate-spin" : ""}`} /> Refresh sources</Button>}
              </div>
            </div>
          </div>
        </section>

        <div className="space-y-6 p-4 sm:p-6 lg:p-8">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#151d44]/10 bg-background p-2 shadow-sm" role="tablist" aria-label="Loss Intake board views">
            <button role="tab" aria-selected={queueView === "intake"} onClick={() => setPersistedQueueView("intake")} className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${queueView === "intake" ? "bg-[#151d44] text-white shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>Intake <Badge className={queueView === "intake" ? "bg-white/15 text-white hover:bg-white/15" : "bg-muted text-foreground hover:bg-muted"}>{active.length}</Badge></button>
            <button role="tab" aria-selected={queueView === "processors"} onClick={() => setPersistedQueueView("processors")} className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${queueView === "processors" ? "bg-[#151d44] text-white shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>Processors <Badge className={queueView === "processors" ? "bg-white/15 text-white hover:bg-white/15" : "bg-muted text-foreground hover:bg-muted"}>{processorQueueItems.length}</Badge></button>
            <p className="ml-1 text-xs text-muted-foreground">Two independent queues. Your selection is remembered.</p>
          </div>

          {queueView === "processors" ? <LossIntakeProcessorQueue data={processorQueue.data as { available: boolean; warning: string | null; items: ProcessorQueueItem[] } | undefined} isLoading={processorQueue.isLoading} canAct={canWorkProcessorQueue} pendingClaimId={updateProcessorStatus.isPending ? updateProcessorStatus.variables?.claimId ?? null : null} onUpdate={update => updateProcessorStatus.mutate(update)} /> : <>
          <LossIntakeQaDashboard claims={claims} viewerName={currentView} isAdmin={isAdmin && !isImpersonating} onOpenClaim={setSelectedClaimId} />

          <section className="border-t border-[#151d44]/10 pt-6">
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#dd571d]">Live operations</p><h2 className="mt-1 text-xl font-bold tracking-tight">Dispatch work queues</h2><p className="mt-1 text-sm text-muted-foreground">Use these operational queues to work, verify filing, and inspect source health.</p></div></div>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Open intake work" value={String(active.length)} detail="New notices awaiting documented completion" icon={Users} tone="orange" />
            <Metric label="In-office now" value={String(inOffice.length)} detail="Store Operations-confirmed arrivals with a 10-minute attempt target" icon={MapPin} tone={inOffice.length ? "red" : "green"} />
            <Metric label="Needs attention" value={String(attention.length)} detail="At-risk or breached response windows" icon={ShieldAlert} tone={attention.length ? "red" : "green"} />
            <Metric label="Average first action" value={overview.data?.averageFirstContactMinutes == null ? "—" : formatMinutes(overview.data.averageFirstContactMinutes)} detail={`${overview.data?.onTimeRate == null ? "No" : `${Math.round(overview.data.onTimeRate)}%`} within the current direct-response target`} icon={Clock3} tone="blue" />
          </section>

          <Card className="border-[#151d44]/10 shadow-sm">
            <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Dispatch rules in view</p>
                <p className="mt-1 text-sm text-muted-foreground">Only a Store Operations Slack post or source-thread photos from that counter marks a driver in office and starts the 10-minute attempt target. Market tabs are scheduling only; all other reports use the weekday 9 AM–6 PM business-hour completion window.</p>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground"><Filter className="h-3.5 w-3.5" /> Scheduled inspection dates order today’s plan; they never imply arrival.</div>
            </CardContent>
          </Card>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="h-auto flex-wrap justify-start bg-background p-1 shadow-sm">
              <TabsTrigger value="dispatch" className="gap-2"><LayoutDashboard className="h-4 w-4" /> Intake follow-up</TabsTrigger>
              <TabsTrigger value="qa" className="gap-2"><UserRoundCheck className="h-4 w-4" /> SLA & data quality</TabsTrigger>
              {isAdmin && !isImpersonating && <TabsTrigger value="health" className="gap-2"><MessageSquareText className="h-4 w-4" /> Source health</TabsTrigger>}
            </TabsList>

            <TabsContent value="dispatch" className="mt-5 space-y-4">
              <div className="flex flex-col gap-3 rounded-xl border bg-background p-3 lg:flex-row lg:items-end">
                <div className="min-w-0 flex-1 space-y-1"><Label className="text-xs text-muted-foreground">Search member, customer ID, market, or VIN</Label><div className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={event => setSearch(event.target.value)} className="pl-9" placeholder="Search dispatch queue" /></div></div>
                <div className="w-full space-y-1 lg:w-48"><Label className="text-xs text-muted-foreground">Source channel</Label><Select value={channel} onValueChange={setChannel}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All channels</SelectItem><SelectItem value="claims">#claims</SelectItem><SelectItem value="remote-markets">#claims-remotemarkets</SelectItem><SelectItem value="escalations">#escalations</SelectItem><SelectItem value="claims-processing">#claims-processing</SelectItem></SelectContent></Select></div>
                <div className="w-full space-y-1 lg:w-52"><Label className="text-xs text-muted-foreground">Work state</Label><Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="open">Open work</SelectItem><SelectItem value="all">All records</SelectItem><SelectItem value="awaiting_outreach">Awaiting outreach</SelectItem><SelectItem value="outreach_started">Outreach started</SelectItem><SelectItem value="contact_attempts">Attempts underway</SelectItem><SelectItem value="complete">Complete</SelectItem></SelectContent></Select></div>
              </div>

              {claimsQuery.isLoading ? <div className="flex min-h-72 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading dispatch records…</div> : filteredClaims.length === 0 ? <EmptyDispatch title="No records match the current dispatch filters" detail="New reports from the configured claims channels will appear here after source synchronization." /> : (
                <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[960px] text-left text-sm">
                      <thead className="bg-muted/50 text-[11px] uppercase tracking-[0.1em] text-muted-foreground"><tr><th className="px-4 py-3 font-semibold">Priority</th><th className="px-4 py-3 font-semibold">Member / report</th><th className="px-4 py-3 font-semibold">Market</th><th className="px-4 py-3 font-semibold">Source</th><th className="px-4 py-3 font-semibold">Owner</th><th className="px-4 py-3 font-semibold">First action</th><th className="px-4 py-3 font-semibold">Work state</th><th className="px-4 py-3 font-semibold" /></tr></thead>
                      <tbody className="divide-y">
                        {filteredClaims.map(claim => {
                          const priority = priorityFor(claim);
                          return <tr key={claim.id} className="transition-colors hover:bg-muted/30"><td className="px-4 py-3"><Badge variant="outline" className={priority.tone}>{priority.label}</Badge></td><td className="px-4 py-3"><button onClick={() => setSelectedClaimId(claim.id)} className="text-left font-semibold text-foreground hover:text-[#dd571d] hover:underline">{claim.memberName ?? "Unidentified member"}</button><p className="mt-0.5 text-xs text-muted-foreground">{claim.customerId ? `Customer ${claim.customerId}` : "No customer ID"} · Reported {formatDate(claim.postedAt)}</p></td><td className="px-4 py-3 text-muted-foreground">{claim.market ?? "—"}</td><td className="px-4 py-3"><span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">#{claim.channelName === "remote-markets" ? "claims-remotemarkets" : claim.channelName}</span></td><td className="px-4 py-3">{claim.assignedAgent ?? <span className="text-muted-foreground">Shared pull queue</span>}</td><td className="px-4 py-3"><p className="font-medium text-foreground">{formatMinutes(claim.firstResponseBusinessMinutes)}</p><p className="text-xs text-muted-foreground">{claim.firstContactAt ? dispatchTargetLabel(claim) : claim.onSiteFlag ? "In-office clock active" : "Awaiting documented action"}</p></td><td className="px-4 py-3"><Badge variant="outline" className={claim.completedAt ? "border-emerald-200 bg-emerald-50 text-emerald-700" : claim.slaState === "breached" ? "border-red-200 bg-red-50 text-red-700" : claim.slaState === "at_risk" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-blue-200 bg-blue-50 text-blue-700"}>{stageLabel[claim.stage]}</Badge></td><td className="px-4 py-3 text-right"><Button variant="ghost" size="icon" onClick={() => setSelectedClaimId(claim.id)} aria-label={`Open ${claim.memberName ?? "claim"} dispatch detail`}><ArrowUpRight className="h-4 w-4" /></Button></td></tr>;
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="qa" className="mt-5 space-y-4">
              <div className="grid gap-3 lg:grid-cols-3"><Card><CardHeader className="pb-2"><CardTitle className="text-sm">Response windows</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{attention.length}</p><p className="mt-1 text-sm text-muted-foreground">Active records at risk or beyond the target.</p></CardContent></Card><Card><CardHeader className="pb-2"><CardTitle className="text-sm">Missing intake evidence</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{claims.filter(claim => !claim.factsOfLoss || !claim.preliminaryLiability).length}</p><p className="mt-1 text-sm text-muted-foreground">Records missing key loss or liability notes.</p></CardContent></Card><Card><CardHeader className="pb-2"><CardTitle className="text-sm">Quality average</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{overview.data?.averageQualityScore == null ? "—" : `${Math.round(overview.data.averageQualityScore)}%`}</p><p className="mt-1 text-sm text-muted-foreground">From documented source-thread QA evidence.</p></CardContent></Card></div>
              <div className="overflow-hidden rounded-xl border bg-background"><div className="border-b px-4 py-3"><h2 className="font-semibold">Evidence exceptions</h2><p className="mt-1 text-sm text-muted-foreground">Use this list to identify documentation gaps before a quality review is issued.</p></div><div className="divide-y">{claims.filter(claim => !claim.completedAt && (!claim.factsOfLoss || !claim.preliminaryLiability || claim.contactAttempts === 0)).slice(0, 20).map(claim => <button key={claim.id} onClick={() => setSelectedClaimId(claim.id)} className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/30"><div><p className="font-medium">{claim.memberName ?? "Unidentified member"} <span className="font-normal text-muted-foreground">· {claim.market ?? "Market unknown"}</span></p><p className="mt-1 text-sm text-muted-foreground">{!claim.factsOfLoss ? "Facts of loss missing" : ""}{!claim.factsOfLoss && !claim.preliminaryLiability ? " · " : ""}{!claim.preliminaryLiability ? "Preliminary liability missing" : ""}{(!claim.factsOfLoss || !claim.preliminaryLiability) && claim.contactAttempts === 0 ? " · " : ""}{claim.contactAttempts === 0 ? "No documented contact attempt" : ""}</p></div><AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" /></button>)}{claims.filter(claim => !claim.completedAt && (!claim.factsOfLoss || !claim.preliminaryLiability || claim.contactAttempts === 0)).length === 0 && <EmptyDispatch title="No active evidence exceptions" detail="Open reports currently include the baseline intake evidence required for review." />}</div></div>
            </TabsContent>

            <TabsContent value="health" className="mt-5"><div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle className="text-base">Source sync status</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><div className="flex justify-between gap-4"><span className="text-muted-foreground">Last successful source review</span><span className="font-medium">{formatDate(syncHealth.data?.settings.lastSuccessfulSyncAt)}</span></div><div className="flex justify-between gap-4"><span className="text-muted-foreground">Latest run</span><span className="font-medium">{syncHealth.data?.latestRun?.status ?? "No recorded run"}</span></div><div className="flex justify-between gap-4"><span className="text-muted-foreground">Last sync issue</span><span className="max-w-[60%] text-right font-medium text-red-600">{syncHealth.data?.settings.lastSyncError ?? "None"}</span></div></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Dispatch controls</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Slack source ingestion configured for the four Dispatch source channels</div><div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> All Reported IncidentsStatus is the read-only, binary filed-claim source</div><div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Duplicate source posts remain linked but excluded from queue counts</div><div className={`rounded-lg border p-3 ${claimsTracker.data?.connected ? "border-emerald-200 bg-emerald-50/40" : "border-amber-200 bg-amber-50/40"}`}><p className={claimsTracker.data?.connected ? "font-medium text-emerald-950" : "font-medium text-amber-950"}>Claims Tracker filed-record source</p>{claimsTracker.isLoading ? <p className="mt-1 text-xs text-muted-foreground">Checking read-only connection…</p> : claimsTracker.data?.connected ? <p className="mt-1 text-xs text-emerald-900/80">Connected read-only · {claimsTracker.data.filedVinCount} VIN fragments found on All Reported IncidentsStatus. A blank Claim File link does not change filed status.</p> : <><p className="mt-1 text-xs text-amber-900/80">{claimsTracker.data?.warning ?? "Connect the Claims Tracker once. The Processor queue stays unavailable until the filed source can be read."}</p><Button size="sm" variant="outline" className="mt-3" onClick={() => window.location.assign("/api/loss-intake/claims-tracker-oauth-start")}>Connect read-only Claims Tracker</Button></>}</div><div className="mt-4 rounded-lg border bg-muted/30 p-3"><p className="font-medium text-foreground">Slack worklist schedule</p><p className="mt-1 text-xs text-muted-foreground">The Processor digest is only an update of an existing post and is separate from this board. Dispatch publishing remains protected and disabled until explicitly activated.</p><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={publishDispatch.isPending} onClick={() => publishDispatch.mutate({ processors: false, intake: true })}>{publishDispatch.isPending ? "Publishing…" : "Publish intake queue now"}</Button>{dispatchStatus.data?.configured ? <Button size="sm" variant="outline" disabled={pauseDispatchSchedule.isPending} onClick={() => pauseDispatchSchedule.mutate()}>Pause schedule</Button> : <Button size="sm" className="bg-[#151d44] hover:bg-[#202b5d]" disabled={enableDispatchSchedule.isPending} onClick={() => enableDispatchSchedule.mutate()}>Enable schedule</Button>}</div><p className="mt-2 text-xs text-muted-foreground">{dispatchStatus.data?.configured ? `Scheduled task ${dispatchStatus.data.taskUid ?? "configured"} is active.` : "Schedule is not active; source synchronization remains independent."}</p></div></CardContent></Card></div></TabsContent>
          </Tabs>
          </section>
          </>}
        </div>
      </main>

      <Sheet open={selectedClaim !== null} onOpenChange={open => !open && setSelectedClaimId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {!selectedClaim ? null : <><SheetHeader><div className="flex flex-wrap gap-2"><Badge variant="outline" className={priorityFor(selectedClaim).tone}>{priorityFor(selectedClaim).label}</Badge><Badge variant="outline">{stageLabel[selectedClaim.stage]}</Badge></div><SheetTitle>{selectedClaim.memberName ?? "Unidentified member"}</SheetTitle><SheetDescription>{selectedClaim.customerId ? `Customer ${selectedClaim.customerId}` : "No customer ID extracted"} · {selectedClaim.market ?? "Market unknown"}</SheetDescription></SheetHeader><div className="mt-6 space-y-5"><div className="grid grid-cols-2 gap-3 rounded-xl border bg-muted/20 p-4 text-sm"><div><p className="text-xs text-muted-foreground">Source</p><p className="mt-1 font-medium">#{selectedClaim.channelName === "remote-markets" ? "claims-remotemarkets" : selectedClaim.channelName}</p></div><div><p className="text-xs text-muted-foreground">Reported</p><p className="mt-1 font-medium">{formatDate(selectedClaim.postedAt)}</p></div><div><p className="text-xs text-muted-foreground">On-site evidence</p><p className="mt-1 font-medium">{selectedClaim.hasPhotos ? "Vehicle photos present" : "No photos in source post"}</p></div><div><p className="text-xs text-muted-foreground">First action</p><p className="mt-1 font-medium">{formatMinutes(selectedClaim.firstContactMinutes)}</p></div><div><p className="text-xs text-muted-foreground">Assigned to</p><p className="mt-1 font-medium">{selectedClaim.assignedAgent ?? "Unassigned"}</p></div><div><p className="text-xs text-muted-foreground">Contact attempts</p><p className="mt-1 font-medium">{selectedClaim.contactAttempts}</p></div></div><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Facts of loss</p><p className="mt-2 rounded-lg border bg-background p-3 text-sm leading-6">{selectedClaim.factsOfLoss ?? "Not documented in the source thread."}</p></div><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preliminary liability</p><p className="mt-2 rounded-lg border bg-background p-3 text-sm leading-6">{selectedClaim.preliminaryLiability ?? "Not documented in the source thread."}</p></div>{selectedClaim.slackPermalink && <a href={selectedClaim.slackPermalink} target="_blank" rel="noreferrer" className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#151d44] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#202b5d]">Open original Slack report <ExternalLink className="h-4 w-4" /></a>}</div></>}
        </SheetContent>
      </Sheet>
    </WhipLayout>
  );
}
