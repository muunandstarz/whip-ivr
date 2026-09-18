import { useEffect, useMemo, useState } from "react";
import WhipLayout from "@/components/WhipLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/_core/hooks/useAuth";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { AlertCircle, CalendarClock, CheckCircle2, ExternalLink, Phone, RefreshCw, ShieldCheck, UserCheck, Users } from "lucide-react";

type QueueItem = {
  id: number;
  memberName: string | null;
  customerId: string | null;
  market: string | null;
  vinLastSix: string | null;
  reportedVinLastSix: string | null;
  vinCorrectionEvidence: string | null;
  memberPhone: string | null;
  preferredLanguage: string | null;
  dateOfLoss: string | null;
  postedAt: Date | string;
  slackPermalink: string | null;
  sourceChannel: string;
  onSiteFlag: boolean;
  onSiteReason: string | null;
  inspectionScheduledAt: Date | string | null;
  inspectionScheduleSource: string | null;
  firstContactAt: Date | string | null;
  firstResponseBusinessMinutes: number | null;
  contactAttempts: number;
  completedAt: Date | string | null;
  templatePostedAt: Date | string | null;
  factsOfLoss: string | null;
  preliminaryLiability: string | null;
  rideshareStatus: string | null;
  claimedByHandlerId: number | null;
  claimedByName: string | null;
  claimedAt: Date | string | null;
  slaState: "within_sla" | "at_risk" | "breached";
  slaTargetBusinessMinutes: number | null;
};

const INTAKE_REPS = new Map<number, string>([[4, "Carlito Legarde Jr"], [6, "Ana Padilla"], [30003, "Bennet Carlos"]]);
const fmt = (value: Date | string | null | undefined, withTime = true) => value ? new Date(value).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}) }) : "—";
const businessTime = (value: number | null) => value === null ? "Not started" : value < 60 ? `${Math.round(value)} business min` : `${Math.floor(value / 60)}h ${Math.round(value % 60)}m`;
const todayEastern = (value: Date | string | null) => value ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(value)) === new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date()) : false;

function queuePriority(item: QueueItem) {
  if (item.completedAt) return 4;
  if (item.onSiteFlag) return 0;
  if (todayEastern(item.inspectionScheduledAt)) return 1;
  if (item.slaState === "breached") return 2;
  return 3;
}

function SourceHealth({ trackerConnected, slackError, trackerWarning, lastSuccess }: { trackerConnected: boolean; slackError: string | null; trackerWarning: string | null; lastSuccess: Date | string | null | undefined }) {
  const sources = [{ name: "#claims", ready: !slackError }, { name: "#claims-remotemarkets", ready: !slackError }, { name: "#escalations", ready: !slackError }, { name: "All Reported IncidentsStatus", ready: trackerConnected }, { name: "market inspection tabs", ready: trackerConnected }];
  return <Card className="border-slate-200 shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-sky-600" />Source health</CardTitle><CardDescription>Each scheduled refresh reads these sources before the shared queue is updated.</CardDescription></CardHeader><CardContent className="space-y-2">{sources.map(source => <div className="flex items-center justify-between text-sm" key={source.name}><span>{source.name}</span><Badge variant={source.ready ? "secondary" : "destructive"}>{source.ready ? "Read-ready" : "Needs access"}</Badge></div>)}<p className="pt-2 text-xs text-muted-foreground">Last successful Slack sync: {fmt(lastSuccess)} ET</p>{(slackError || trackerWarning) && <p className="rounded bg-amber-50 p-2 text-xs text-amber-800">{slackError ?? trackerWarning}</p>}</CardContent></Card>;
}

function IntakeItemCard({ item, canClaim, effectiveHandlerId, effectiveHandlerName, onClaim, onRelease, working }: { item: QueueItem; canClaim: boolean; effectiveHandlerId: number | null; effectiveHandlerName: string | null; onClaim: (item: QueueItem) => void; onRelease: (item: QueueItem) => void; working: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const takenByViewer = effectiveHandlerId !== null && item.claimedByHandlerId === effectiveHandlerId;
  const isCompleted = Boolean(item.completedAt);
  return <Card className={`border-l-4 ${item.onSiteFlag ? "border-l-orange-500" : item.slaState === "breached" ? "border-l-rose-500" : "border-l-sky-500"} ${isCompleted ? "opacity-65" : ""}`}>
    <CardContent className="p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{item.memberName ?? "Unidentified member"}</h3>{item.customerId && <span className="text-sm text-muted-foreground">Customer {item.customerId}</span>}{item.onSiteFlag && <Badge className="bg-orange-600">This driver appears to be in office</Badge>}{todayEastern(item.inspectionScheduledAt) && <Badge variant="secondary">Inspection today</Badge>}{item.slaState === "breached" && !isCompleted && <Badge variant="destructive">Past SLA</Badge>}</div>
          <p className="text-sm text-muted-foreground">{item.market ?? "Market unknown"} · VIN {item.vinLastSix ?? "not captured"}{item.dateOfLoss ? ` · Loss ${item.dateOfLoss}` : ""}</p>
          <p className="text-sm">{item.claimedByName ? <>Claimed by <b>{item.claimedByName}</b> · {fmt(item.claimedAt)}</> : <span className="text-orange-700">Unclaimed</span>} · First contact: {businessTime(item.firstResponseBusinessMinutes)}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {canClaim && !isCompleted && !item.claimedByHandlerId && <Button onClick={() => onClaim(item)} disabled={working}><UserCheck className="mr-1 h-4 w-4" />Claim item</Button>}
          {canClaim && takenByViewer && !isCompleted && <Button variant="outline" onClick={() => onRelease(item)} disabled={working}>Release</Button>}
          <Button variant="ghost" onClick={() => setExpanded(value => !value)}>{expanded ? "Hide details" : "Details"}</Button>
          {item.slackPermalink && <Button variant="outline" asChild><a href={item.slackPermalink} target="_blank" rel="noreferrer">Slack <ExternalLink className="ml-1 h-3.5 w-3.5" /></a></Button>}
        </div>
      </div>
      {expanded && <div className="mt-4 grid gap-3 border-t pt-4 text-sm md:grid-cols-2">
        <div><b>Phone:</b> {item.memberPhone ?? "Not captured"}<br/><b>Preferred language:</b> {item.preferredLanguage ?? "Not captured"}<br/><b>Attempts:</b> {item.contactAttempts}<br/><b>Arrival:</b> {item.onSiteReason ?? "No verified in-office Slack signal"}</div>
        <div><b>Inspection:</b> {item.inspectionScheduledAt ? `${fmt(item.inspectionScheduledAt)} ET (${item.inspectionScheduleSource})` : "None scheduled today"}<br/><b>Rideshare:</b> {item.rideshareStatus ?? "Not captured"}<br/><b>Template:</b> {item.templatePostedAt ? fmt(item.templatePostedAt) : "Not posted"}<br/><b>Statement:</b> {item.completedAt ? `Completed ${fmt(item.completedAt)}` : "Not obtained"}</div>
        {item.vinCorrectionEvidence && <p className="rounded bg-sky-50 p-2 text-sky-900 md:col-span-2"><b>VIN correction:</b> {item.vinCorrectionEvidence}</p>}
        <div className="rounded bg-slate-50 p-3 md:col-span-2"><b>Facts of loss</b><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{item.factsOfLoss ?? "Not captured yet."}</p><b className="mt-2 block">Preliminary liability</b><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{item.preliminaryLiability ?? "Not captured yet."}</p></div>
      </div>}
    </CardContent>
  </Card>;
}

export default function LossIntakeDispatch() {
  const { user } = useAuth();
  const { impersonating } = useImpersonation();
  const utils = trpc.useUtils();
  const isAdmin = user?.role === "admin";
  const effectiveHandlerId = impersonating?.id ?? user?.handlerProfileId ?? null;
  const effectiveHandlerName = impersonating?.name ?? (effectiveHandlerId ? INTAKE_REPS.get(effectiveHandlerId) ?? user?.name ?? null : null);
  const canClaim = effectiveHandlerId !== null && INTAKE_REPS.has(effectiveHandlerId);
  const queue = trpc.lossIntake.workQueue.list.useQuery(undefined, { refetchInterval: 30_000 });
  const health = trpc.lossIntake.syncHealth.useQuery(undefined, { enabled: isAdmin, refetchInterval: 30_000 });
  const tracker = trpc.lossIntake.claimsTrackerStatus.useQuery(undefined, { enabled: isAdmin, refetchInterval: 60_000 });
  const metrics = trpc.lossIntake.workQueue.dailyMetrics.useQuery(undefined, { refetchInterval: 30_000 });
  const claim = trpc.lossIntake.workQueue.claim.useMutation({ onSuccess: () => { void utils.lossIntake.workQueue.list.invalidate(); void utils.lossIntake.workQueue.dailyMetrics.invalidate(); toast.success("Item claimed"); }, onError: error => toast.error(`Could not claim item: ${error.message}`) });
  const release = trpc.lossIntake.workQueue.release.useMutation({ onSuccess: () => { void utils.lossIntake.workQueue.list.invalidate(); toast.success("Item released"); }, onError: error => toast.error(`Could not release item: ${error.message}`) });
  const refresh = trpc.lossIntake.sync.runNow.useMutation({ onSuccess: result => { void utils.lossIntake.workQueue.list.invalidate(); void utils.lossIntake.syncHealth.invalidate(); void utils.lossIntake.claimsTrackerStatus.invalidate(); if (result.ok) toast.success("Sources refreshed"); else toast.error(`Refresh needs attention: ${result.slackError ?? result.tracker.error ?? "Review source health."}`); }, onError: error => toast.error(`Refresh failed: ${error.message}`) });
  const updateSettings = trpc.lossIntake.settings.update.useMutation({ onSuccess: () => { void utils.lossIntake.syncHealth.invalidate(); toast.success("Intake Slack destination saved"); }, onError: error => toast.error(`Could not save destination: ${error.message}`) });
  const [destination, setDestination] = useState("");
  const [publishingEnabled, setPublishingEnabled] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const items = useMemo(() => [...(queue.data?.items ?? []) as QueueItem[]].sort((a, b) => queuePriority(a) - queuePriority(b) || new Date(a.postedAt).getTime() - new Date(b.postedAt).getTime()), [queue.data?.items]);
  const depth = queue.data?.depth;
  const setting = health.data?.settings;
  useEffect(() => {
    if (!setting || settingsLoaded) return;
    setDestination(setting.intakeSlackDestinationChannelId ?? "");
    setPublishingEnabled(setting.intakeSlackPublishingEnabled ?? false);
    setSettingsLoaded(true);
  }, [setting, settingsLoaded]);
  const saveDestination = () => updateSettings.mutate({ intakeSlackDestinationChannelId: destination.trim() || null, intakeSlackPublishingEnabled: publishingEnabled });

  return <WhipLayout><main className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
    <header className="flex flex-col gap-4 rounded-xl bg-slate-950 p-5 text-white md:flex-row md:items-center md:justify-between"><div><p className="text-sm text-sky-200">Shared intake workspace</p><h1 className="text-2xl font-semibold">Loss Intake Dispatch</h1><p className="mt-1 max-w-2xl text-sm text-slate-300">One live queue for Ana, Bennet, and Carlito. Arrival evidence comes from Slack; scheduled inspections only shape the call plan.</p></div><div className="flex gap-2">{isAdmin && <Button variant="secondary" onClick={() => refresh.mutate()} disabled={refresh.isPending}><RefreshCw className={`mr-2 h-4 w-4 ${refresh.isPending ? "animate-spin" : ""}`} />Refresh sources</Button>}<Badge className="self-center bg-sky-600">{items.filter(item => !item.completedAt).length} open</Badge></div></header>

    {isAdmin && health.data?.settings.lastSyncError && <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><b>Source refresh needs access.</b> The queue is displaying stored Intake records, not a verified fresh Slack sweep, until the three authorized Slack channels can be read. Details: {health.data.settings.lastSyncError}</div>}

    <section className="grid gap-4 md:grid-cols-3"><Card><CardHeader className="pb-2"><CardDescription>Store queue · Ana pulls when this is heavy</CardDescription><CardTitle className="text-3xl">{depth?.store ?? 0}</CardTitle></CardHeader></Card><Card><CardHeader className="pb-2"><CardDescription>Remote queue · Ana’s primary coverage</CardDescription><CardTitle className="text-3xl">{depth?.remote ?? 0}</CardTitle></CardHeader></Card><Card><CardHeader className="pb-2"><CardDescription>Escalations awaiting intake</CardDescription><CardTitle className="text-3xl">{depth?.escalations ?? 0}</CardTitle></CardHeader></Card></section>

    {isAdmin && <section className="grid gap-4 lg:grid-cols-2"><SourceHealth trackerConnected={tracker.data?.connected ?? false} slackError={health.data?.settings.lastSyncError ?? null} trackerWarning={tracker.data?.warning ?? null} lastSuccess={health.data?.settings.lastSuccessfulSyncAt}/><Card><CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4 text-sky-600" />Daily Slack copy</CardTitle><CardDescription>One daily message is created or updated in place from this same queue. Destination is not hardcoded.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="grid gap-2"><Label htmlFor="intake-channel">Destination channel ID</Label><Input id="intake-channel" placeholder="Set the #claims-intake-reps channel ID" value={destination} onChange={event => setDestination(event.target.value)} /></div><div className="flex items-center justify-between rounded border p-3"><div><p className="text-sm font-medium">Publish after complete refresh</p><p className="text-xs text-muted-foreground">Updates the same day’s message; does not post a second queue.</p></div><Switch checked={publishingEnabled} onCheckedChange={setPublishingEnabled}/></div><Button onClick={saveDestination} disabled={updateSettings.isPending}>Save publishing configuration</Button></CardContent></Card></section>}

    <section className="space-y-3"><div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold">Live call plan</h2><p className="text-sm text-muted-foreground">Order: confirmed in-office arrivals, today’s inspections, past-SLA no-statement items, then oldest. Queue refreshes every 30 seconds.</p></div>{impersonating && <Badge variant="secondary">Viewing as {impersonating.name}</Badge>}</div>{queue.isLoading ? <Card><CardContent className="p-6 text-muted-foreground">Loading current Intake items…</CardContent></Card> : items.length === 0 ? <Card><CardContent className="p-6 text-muted-foreground">No active Intake records are available from the configured sources.</CardContent></Card> : <div className="space-y-3">{items.map(item => <IntakeItemCard key={item.id} item={item} canClaim={canClaim} effectiveHandlerId={effectiveHandlerId} effectiveHandlerName={effectiveHandlerName} onClaim={row => claim.mutate({ claimId: row.id, effectiveHandlerId: effectiveHandlerId ?? undefined, effectiveHandlerName: effectiveHandlerName ?? undefined })} onRelease={row => release.mutate({ claimId: row.id, effectiveHandlerId: effectiveHandlerId ?? undefined })} working={claim.isPending || release.isPending}/>)}</div>}</section>

    <section><div className="mb-3 flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-600"/><h2 className="text-xl font-semibold">Today’s Intake productivity</h2></div><div className="grid gap-3 md:grid-cols-3">{metrics.data?.map(metric => <Card key={metric.handlerId}><CardHeader className="pb-2"><CardTitle className="text-base">{metric.handlerName}</CardTitle><CardDescription>{metric.itemsClaimed} claimed · {metric.openAtClose} still open</CardDescription></CardHeader><CardContent className="grid grid-cols-2 gap-2 text-sm"><span>First contacts <b>{metric.firstContacts}</b></span><span>Statements <b>{metric.statementsObtained}</b></span><span>Templates <b>{metric.templatesPosted}</b></span><span>Median <b>{businessTime(metric.medianBusinessMinutes)}</b></span></CardContent></Card>) ?? <Card><CardContent className="p-5 text-sm text-muted-foreground">Metrics populate as Intake work is claimed and updated.</CardContent></Card>}</div></section>

    <aside className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><div className="flex gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/><p><b>Operating rule:</b> Slack store-operations posts or branch photos establish an in-office arrival. Market tabs only document inspection scheduling. Business time is Monday–Friday, 9 AM–6 PM Eastern: 10 business minutes for confirmed in-office arrivals and 240 for other Intake follow-up.</p></div></aside>
  </main></WhipLayout>;
}
