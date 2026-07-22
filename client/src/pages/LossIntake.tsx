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
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ClipboardCheck,
  Clock3,
  ExternalLink,
  FileSearch,
  Gauge,
  GitCompare,
  Loader2,
  MessageSquareText,
  Mic,
  Phone,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Star,
  TimerReset,
  TrendingUp,
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
  completion: "Template posted / complete",
  other: "Thread update",
};

const CRITERION_LABELS: Record<string, string> = {
  first_contact_sla: "First contact SLA",
  facts_of_loss: "Facts of loss documented",
  fol_quality: "Quality of facts of loss",
  preliminary_liability: "Preliminary liability",
  rideshare_status: "Rideshare status notated",
  photo_evidence: "Photo / video evidence",
  attempt_documentation: "Contact attempt documented",
  store_team_tagged: "Store team tagged",
  tesla_footage_request: "Tesla footage requested",
  // legacy
  acknowledgment: "Acknowledgment",
  first_contact: "First contact",
  liability: "Preliminary liability",
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
  const claimCalls = trpc.lossIntake.claimCalls.useQuery(
    { claimId: claimId ?? 0 },
    { enabled: claimId !== null },
  );
  const claimCallQas = trpc.lossIntake.claimCallQas.useQuery(
    { claimId: claimId ?? 0 },
    { enabled: claimId !== null },
  );
  const sheetUtils = trpc.useUtils();
  const scoreCallMutation = trpc.lossIntake.scoreCall.useMutation({
    onSuccess: () => {
      toast.success("Call scored successfully");
      void sheetUtils.lossIntake.claimCallQas.invalidate({ claimId: claimId ?? 0 });
    },
    onError: (err) => toast.error(`Scoring failed: ${err.message}`),
  });
  const runMatchMutation = trpc.lossIntake.runCallMatching.useMutation({
    onSuccess: (res) => {
      toast.success(`Matched ${res.matched} call${res.matched !== 1 ? "s" : ""}`);
      void sheetUtils.lossIntake.claimCalls.invalidate({ claimId: claimId ?? 0 });
    },
    onError: (err) => toast.error(`Matching failed: ${err.message}`),
  });

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
              <div><p className="text-xs text-muted-foreground">Date of loss</p><p className="mt-1 font-medium">{(data.claim as Record<string, unknown>).dateOfLoss as string ?? "—"}</p></div>
              <div><p className="text-xs text-muted-foreground">Date reported</p><p className="mt-1 font-medium">{formatDateTime(data.claim.postedAt)}</p></div>
              <div><p className="text-xs text-muted-foreground">VIN (last 6)</p><p className="mt-1 font-medium">{data.claim.vinLastSix ?? "—"}</p></div>
              <div><p className="text-xs text-muted-foreground">Market</p><p className="mt-1 font-medium">{data.claim.market ?? "—"}</p></div>
              <div><p className="text-xs text-muted-foreground">SLA type</p><p className="mt-1 font-medium">{(data.claim as Record<string, unknown>).slaType === "after_hours" ? "After-hours (4 biz hrs)" : "Immediate (10 min)"}</p></div>
              <div><p className="text-xs text-muted-foreground">SLA deadline</p><p className="mt-1 font-medium">{formatDateTime((data.claim as Record<string, unknown>).slaDeadlineAt as string)}</p></div>
              {Boolean((data.claim as Record<string, unknown>).claimsIntakeTaggedAt) && (
                <>
                  <div className="col-span-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2">
                    <p className="text-xs font-medium text-orange-700">@claims-intake tagged</p>
                    <p className="mt-0.5 text-sm font-semibold text-orange-900">{formatDateTime(new Date(Number((data.claim as Record<string, unknown>).claimsIntakeTaggedAt)).toISOString())}</p>
                    <p className="mt-0.5 text-xs text-orange-600">
                      {(data.claim as Record<string, unknown>).claimsIntakeSlaType === "business_hours" ? "10-min SLA (business hours)" : "4-hr SLA (after hours)"}
                      {" · Due: "}{formatDateTime(new Date(Number((data.claim as Record<string, unknown>).claimsIntakeSlaDeadlineAt)).toISOString())}
                    </p>
                  </div>
                </>
              )}
              <div><p className="text-xs text-muted-foreground">First contact</p><p className="mt-1 font-medium">{formatMinutes(data.claim.firstContactMinutes)}</p></div>
              <div><p className="text-xs text-muted-foreground">Intake cycle</p><p className="mt-1 font-medium">{formatMinutes(data.claim.intakeCycleMinutes)}</p></div>
              {Boolean((data.claim as Record<string, unknown>).templatePostedAt) && (
                <>
                  <div><p className="text-xs text-muted-foreground">Template posted</p><p className="mt-1 font-medium">{formatDateTime(String((data.claim as Record<string, unknown>).templatePostedAt ?? ""))}</p></div>
                  <div><p className="text-xs text-muted-foreground">Template → from first contact</p><p className="mt-1 font-medium">{formatMinutes((data.claim as Record<string, unknown>).templatePostMinutesFromContact as number)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Template → from report</p><p className="mt-1 font-medium">{formatMinutes((data.claim as Record<string, unknown>).templatePostMinutesFromReport as number)}</p></div>
                </>
              )}
              <div><p className="text-xs text-muted-foreground">Contact attempts</p><p className="mt-1 font-medium">{(data.claim as Record<string, unknown>).contactAttempts as number ?? 0}</p></div>
              <div><p className="text-xs text-muted-foreground">No-answer attempts</p><p className="mt-1 font-medium">{data.claim.noAnswerAttempts}</p></div>
              <div><p className="text-xs text-muted-foreground">Store team tagged</p><p className="mt-1 font-medium">{(data.claim as Record<string, unknown>).storeTeamTagged ? "Yes" : "No"}</p></div>
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
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold text-foreground flex items-center gap-2"><Phone className="h-4 w-4 text-[#ff6221]" /> Calls &amp; AI QA</h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => runMatchMutation.mutate()}
                  disabled={runMatchMutation.isPending}
                  className="h-7 text-xs"
                >
                  {runMatchMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  <span className="ml-1">Match calls</span>
                </Button>
              </div>
              {claimCalls.data && claimCalls.data.length > 0 ? (
                <div className="space-y-3">
                  {claimCalls.data.map((call) => {
                    const qa = claimCallQas.data?.find((q) => q.callHistoryId === call.id);
                    const scoreColor = qa?.overallScore == null ? "" : qa.overallScore >= 80 ? "text-emerald-600" : qa.overallScore >= 60 ? "text-amber-600" : "text-red-600";
                    return (
                      <div key={call.id} className="rounded-lg border bg-card p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm font-medium">{call.agentName ?? "Unknown agent"}</span>
                            <Badge variant="outline" className="text-xs">{call.direction === "inbound" ? "Inbound" : "Outbound"}</Badge>
                            {call.matchConfidence != null && (
                              <Badge variant="outline" className="text-xs text-muted-foreground">{Math.round((call.matchConfidence as number) * 100)}% match</Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">{formatDateTime(call.startedAt)}</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>{call.durationSeconds ? `${Math.floor(call.durationSeconds / 60)}m ${call.durationSeconds % 60}s` : "—"}</span>
                          {call.callerPhone && <span>{call.callerPhone}</span>}
                        </div>
                        {qa ? (
                          <div className="rounded-md bg-muted/40 p-2 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold flex items-center gap-1"><Star className="h-3 w-3" /> AI QA Score</span>
                              <span className={`text-sm font-bold ${scoreColor}`}>{qa.overallScore}/100</span>
                            </div>
                            <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                              {qa.greetingScore != null && <span>Greeting: {qa.greetingScore}/10</span>}
                              {qa.folDocumentedScore != null && <span>FOL documented: {qa.folDocumentedScore}/10</span>}
                              {qa.rideshareAskedScore != null && <span>Rideshare asked: {qa.rideshareAskedScore}/10</span>}
                              {qa.professionalCloseScore != null && <span>Professional close: {qa.professionalCloseScore}/10</span>}
                              {qa.empathyScore != null && <span>Empathy: {qa.empathyScore}/10</span>}
                            </div>
                            {qa.strengths && (
                              <div className="text-xs">
                                <span className="font-medium text-emerald-600">Strengths: </span>
                                <span className="text-muted-foreground">{qa.strengths}</span>
                              </div>
                            )}
                            {qa.improvements && (
                              <div className="text-xs">
                                <span className="font-medium text-amber-600">Coaching: </span>
                                <span className="text-muted-foreground">{qa.improvements}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 w-full text-xs"
                            onClick={() => scoreCallMutation.mutate({ callHistoryId: call.id, lossIntakeClaimId: claimId! })}
                            disabled={scoreCallMutation.isPending || !call.recordingUrl}
                          >
                            {scoreCallMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mic className="h-3 w-3" />}
                            <span className="ml-1">{call.recordingUrl ? "Transcribe & AI Score" : "No recording available"}</span>
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-center text-sm text-muted-foreground">
                  No Aircall recordings matched to this claim yet. Click "Match calls" to run the matching algorithm.
                </div>
              )}
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
  const [activeTab, setActiveTab] = useState("today");
  const [expandedHandlers, setExpandedHandlers] = useState<Record<string, boolean>>({});
  const [selectedClaimId, setSelectedClaimId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("all");
  const [slaState, setSlaState] = useState("all");
  const [vehicleType, setVehicleType] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [qaResponses, setQaResponses] = useState<Record<number, string>>({});
  const [comparisonPeriod, setComparisonPeriod] = useState<"today" | "week" | "month" | "ytd">("month");
  const [awaitingDrillAgent, setAwaitingDrillAgent] = useState<string | null>(null);
  const [selectedAwaitingIds, setSelectedAwaitingIds] = useState<Set<number>>(new Set());
  const [bulkReassignTarget, setBulkReassignTarget] = useState<string>("");

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
    ...(agentFilter !== "all" ? { agentName: agentFilter } : {}),
    limit: 100,
    offset: 0,
  }), [dateScope, search, stage, slaState, vehicleType, agentFilter]);

  const overview = trpc.lossIntake.overview.useQuery(dateScope);
  const claims = trpc.lossIntake.claims.list.useQuery(claimInput);
  const qa = trpc.lossIntake.qa.list.useQuery();
  const settings = trpc.lossIntake.settings.get.useQuery(undefined, { enabled: !!isAdmin && !isImpersonating });
  const handlers = trpc.lossIntake.handlers.useQuery(undefined, { enabled: !!isAdmin && !isImpersonating });
  const syncHealth = trpc.lossIntake.syncHealth.useQuery(undefined, { enabled: !!isAdmin && !isImpersonating });
  const todayActivity = trpc.lossIntake.todayActivity.useQuery(undefined, { refetchInterval: 5 * 60 * 1000 });
  const repComparison = trpc.lossIntake.repComparison.useQuery(
    { period: comparisonPeriod },
    { refetchInterval: 5 * 60 * 1000 },
  );
  const awaitingOutreach = trpc.lossIntake.awaitingOutreach.useQuery(
    { agentName: awaitingDrillAgent ?? undefined },
    { enabled: awaitingDrillAgent !== null },
  );
  const utils = trpc.useUtils();
  const reassignMutation = trpc.lossIntake.reassignClaims.useMutation({
    onSuccess: async (result) => {
      toast.success(`${result.reassigned} claim${result.reassigned !== 1 ? "s" : ""} reassigned to ${bulkReassignTarget}`);
      setSelectedAwaitingIds(new Set());
      setBulkReassignTarget("");
      await Promise.all([
        utils.lossIntake.awaitingOutreach.invalidate(),
        utils.lossIntake.repComparison.invalidate(),
      ]);
    },
    onError: (err) => toast.error(err.message),
  });

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
              <TabsTrigger value="today" className="gap-2"><CalendarClock className="h-4 w-4" /> Today</TabsTrigger>
              <TabsTrigger value="team" className="gap-2"><GitCompare className="h-4 w-4" /> Team</TabsTrigger>
              <TabsTrigger value="overview" className="gap-2"><BarChart3 className="h-4 w-4" /> Overview</TabsTrigger>
              <TabsTrigger value="claims" className="gap-2"><Workflow className="h-4 w-4" /> Claims</TabsTrigger>
              <TabsTrigger value="qa" className="gap-2"><ClipboardCheck className="h-4 w-4" /> {representativeView ? "My QA" : "QA inbox"}</TabsTrigger>

              {isAdmin && !isImpersonating && <TabsTrigger value="settings" className="gap-2"><Settings2 className="h-4 w-4" /> Sync & settings</TabsTrigger>}
            </TabsList>

            <TabsContent value="today" className="mt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Today's Intake Activity</h2>
                  <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })} · Refreshes every 5 minutes</p>
                </div>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => utils.lossIntake.todayActivity.invalidate()}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refresh
                </Button>
              </div>
              {todayActivity.isLoading ? (
                <div className="flex min-h-72 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading today's activity…</div>
              ) : !todayActivity.data?.length ? (
                <EmptyState title="No FNOL threads today" description="No claims have been posted or touched by the intake team today. Check back after the next sync." />
              ) : (
                <div className="space-y-4">
                  {/* Summary row */}
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Card className="border-border/70 shadow-sm">
                      <CardContent className="p-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total FNOL threads</p>
                        <p className="mt-2 text-3xl font-bold">{todayActivity.data.reduce((s, h) => s + h.claims.length, 0)}</p>
                      </CardContent>
                    </Card>
                    <Card className="border-border/70 shadow-sm">
                      <CardContent className="p-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Completed (template posted)</p>
                        <p className="mt-2 text-3xl font-bold text-emerald-600 dark:text-emerald-400">{todayActivity.data.reduce((s, h) => s + h.completedCount, 0)}</p>
                      </CardContent>
                    </Card>
                    <Card className="border-border/70 shadow-sm">
                      <CardContent className="p-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">In outreach / attempts</p>
                        <p className="mt-2 text-3xl font-bold text-amber-600 dark:text-amber-400">{todayActivity.data.reduce((s, h) => s + h.contactAttemptedCount, 0)}</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Per-rep cards */}
                  {todayActivity.data.map(handler => {
                    const isExpanded = expandedHandlers[handler.handlerName] !== false; // default expanded
                    return (
                      <Card key={handler.handlerName} className="shadow-sm">
                        <CardHeader
                          className="cursor-pointer select-none"
                          onClick={() => setExpandedHandlers(prev => ({ ...prev, [handler.handlerName]: !isExpanded }))}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#ff6221]/10 text-sm font-bold text-[#ff6221]">
                                {handler.handlerName.charAt(0)}
                              </div>
                              <div>
                                <CardTitle className="text-base">{handler.handlerName}</CardTitle>
                                <p className="text-xs text-muted-foreground">{handler.claims.length} thread{handler.claims.length !== 1 ? "s" : ""} · {handler.completedCount} completed · {handler.contactAttemptedCount} in outreach</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                                {handler.completedCount} done
                              </Badge>
                              {handler.awaitingCount > 0 && (
                                <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
                                  {handler.awaitingCount} pending
                                </Badge>
                              )}
                              {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                            </div>
                          </div>
                        </CardHeader>
                        {isExpanded && (
                          <CardContent className="pt-0">
                            <div className="divide-y rounded-xl border">
                              {handler.claims.map(claim => {
                                const stageColor = claim.stage === "complete"
                                  ? "bg-emerald-500"
                                  : claim.stage === "outreach_started" || claim.stage === "contact_attempts"
                                  ? "bg-amber-500"
                                  : "bg-muted-foreground/30";
                                const contactMin = claim.firstContactMinutes;
                                const templateMin = claim.templatePostMinutesFromReport;
                                return (
                                  <div key={claim.claimId} className="flex items-start gap-3 p-3 hover:bg-muted/30">
                                    <div className={`mt-1.5 h-8 w-1 flex-shrink-0 rounded-full ${stageColor}`} />
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div>
                                          <p className="font-semibold text-sm">
                                            {claim.memberName ?? "Unidentified member"}
                                            {claim.customerId ? <span className="ml-1.5 font-normal text-muted-foreground">#{claim.customerId}</span> : null}
                                          </p>
                                          <p className="text-xs text-muted-foreground">
                                            {claim.market ?? "Market unknown"}
                                            {claim.vinLastSix ? ` · VIN …${claim.vinLastSix}` : ""}
                                            {claim.channelName === "claims" ? " · #claims" : " · #claims-remotemarkets"}
                                          </p>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          <Badge variant="outline" className={stageBadge(claim.stage)}>{STAGE_LABELS[claim.stage]}</Badge>
                                          {claim.slaState === "breached" && <Badge variant="outline" className={slaBadge(claim.slaState)}>SLA breached</Badge>}
                                        </div>
                                      </div>
                                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                        <span><span className="font-medium text-foreground">FNOL posted:</span> {new Date(claim.postedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })} ET</span>
                                        {contactMin != null && <span><span className="font-medium text-foreground">First contact:</span> {contactMin < 60 ? `${Math.round(contactMin)}m` : `${Math.floor(contactMin / 60)}h ${Math.round(contactMin % 60)}m`} after posting</span>}
                                        {templateMin != null && <span><span className="font-medium text-foreground">Template posted:</span> {templateMin < 60 ? `${Math.round(templateMin)}m` : `${Math.floor(templateMin / 60)}h ${Math.round(templateMin % 60)}m`} after posting</span>}
                                        {claim.contactAttempts > 0 && <span><span className="font-medium text-foreground">Attempts:</span> {claim.contactAttempts}</span>}
                                      </div>
                                      {claim.factsOfLoss && (
                                        <p className="mt-2 rounded-lg bg-muted/40 px-3 py-2 text-xs leading-relaxed">
                                          <span className="font-medium">FOL: </span>{claim.factsOfLoss.length > 180 ? claim.factsOfLoss.slice(0, 180) + "…" : claim.factsOfLoss}
                                        </p>
                                      )}
                                      {/* Today's events for this claim */}
                                      {claim.events.length > 0 && (
                                        <div className="mt-2 space-y-1">
                                          {claim.events.map((event, idx) => (
                                            <div key={idx} className="flex items-center gap-2 text-xs">
                                              <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                                                event.eventType === "completion" ? "bg-emerald-500" :
                                                event.eventType === "contact_attempt" ? "bg-amber-500" :
                                                event.eventType === "acknowledgment" ? "bg-blue-500" :
                                                "bg-muted-foreground/50"
                                              }`} />
                                              <span className="text-muted-foreground">{new Date(event.occurredAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })}</span>
                                              <span className="font-medium">{EVENT_LABELS[event.eventType] ?? event.eventType}</span>
                                              {event.actorName && <span className="text-muted-foreground">by {event.actorName}</span>}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                    <Button size="sm" variant="ghost" className="flex-shrink-0" onClick={() => setSelectedClaimId(claim.claimId)}>
                                      <ChevronRight className="h-4 w-4" />
                                    </Button>
                                  </div>
                                );
                              })}
                            </div>
                          </CardContent>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* ─── Team Comparison Tab ─── */}
            <TabsContent value="team" className="mt-6 space-y-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Team Comparison</h2>
                  <p className="text-sm text-muted-foreground">Side-by-side Loss Intake metrics per rep, based on actual Slack thread data. Assignments per the team guide.</p>
                </div>
                <div className="flex gap-1 rounded-lg border bg-background p-1">
                  {(["today", "week", "month", "ytd"] as const).map(p => (
                    <button
                      key={p}
                      onClick={() => setComparisonPeriod(p)}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                        comparisonPeriod === p
                          ? "bg-[#171b31] text-white dark:bg-[#ff6221]"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {p === "today" ? "Today" : p === "week" ? "This Week" : p === "month" ? "This Month" : "YTD"}
                    </button>
                  ))}
                </div>
              </div>

              {repComparison.isLoading ? (
                <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading team metrics…
                </div>
              ) : !repComparison.data || repComparison.data.length === 0 ? (
                <div className="flex min-h-64 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
                  No data for this period yet.
                </div>
              ) : (
                <>
                  {/* Rep cards grid */}
                  <div className="grid gap-5 lg:grid-cols-3">
                    {repComparison.data.map(rep => {
                      const completionColor = rep.completionPct >= 70 ? "text-emerald-600 dark:text-emerald-400" : rep.completionPct >= 40 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
                      const slaColor = rep.slaBreaches === 0 ? "text-emerald-600 dark:text-emerald-400" : rep.slaBreaches <= 5 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
                      return (
                        <Card key={rep.agentName} className="overflow-hidden border-2 border-border/50 shadow-sm">
                          <div className="border-b bg-[#171b31] px-5 py-4 dark:bg-[#1e2340]">
                            <div className="flex items-center justify-between">
                              <div>
                                <h3 className="font-semibold text-white">{rep.agentName}</h3>
                                <p className="mt-0.5 text-xs text-slate-300">{rep.assignment}</p>
                              </div>
                              <div className="text-right">
                                <div className={`text-2xl font-bold ${completionColor.replace("text-", "text-")}`} style={{ color: rep.completionPct >= 70 ? "#34d399" : rep.completionPct >= 40 ? "#fbbf24" : "#f87171" }}>
                                  {rep.completionPct}%
                                </div>
                                <div className="text-xs text-slate-300">completion</div>
                              </div>
                            </div>
                            <Progress
                              value={rep.completionPct}
                              className="mt-3 h-1.5 bg-slate-600"
                            />
                          </div>
                          <CardContent className="p-5">
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-0.5">
                                <div className="text-xs text-muted-foreground">Total FNOLs</div>
                                <div className="text-xl font-bold">{rep.total}</div>
                                <div className="text-[11px] text-muted-foreground">
                                  {rep.instoreTotal > 0 && <span>{rep.instoreTotal} in-store</span>}
                                  {rep.instoreTotal > 0 && rep.remoteTotal > 0 && <span> · </span>}
                                  {rep.remoteTotal > 0 && <span>{rep.remoteTotal} remote</span>}
                                </div>
                              </div>
                              <div className="space-y-0.5">
                                <div className="text-xs text-muted-foreground">Completed</div>
                                <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{rep.completed}</div>
                                <div className="text-[11px] text-muted-foreground">templates posted</div>
                              </div>
                              <div className="space-y-0.5">
                                <div className="text-xs text-muted-foreground">Awaiting outreach</div>
                                <button
                                  onClick={() => { setAwaitingDrillAgent(rep.agentName); setSelectedAwaitingIds(new Set()); }}
                                  className="text-xl font-bold text-[#ff6221] underline-offset-2 hover:underline focus:outline-none"
                                  title={`View ${rep.awaiting} awaiting outreach claims for ${rep.agentName}`}
                                >
                                  {rep.awaiting}
                                </button>
                                <div className="text-[11px] text-muted-foreground">click to view</div>
                              </div>
                              <div className="space-y-0.5">
                                <div className="text-xs text-muted-foreground">In outreach</div>
                                <div className="text-xl font-bold">{rep.inOutreach}</div>
                                <div className="text-[11px] text-muted-foreground">active attempts</div>
                              </div>
                              <div className="space-y-0.5">
                                <div className="text-xs text-muted-foreground">SLA breaches</div>
                                <div className={`text-xl font-bold ${slaColor}`}>{rep.slaBreaches}</div>
                                <div className="text-[11px] text-muted-foreground">10-min target missed</div>
                              </div>
                              <div className="space-y-0.5">
                                <div className="text-xs text-muted-foreground">Avg first contact</div>
                                <div className="text-xl font-bold">
                                  {rep.avgFirstContactMin == null ? "—" : rep.avgFirstContactMin < 60 ? `${Number(rep.avgFirstContactMin.toFixed(1))}m` : `${Math.floor(rep.avgFirstContactMin / 60)}h ${Number((rep.avgFirstContactMin % 60).toFixed(1))}m`}
                                </div>
                                <div className="text-[11px] text-muted-foreground">from FNOL posted</div>
                              </div>
                              <div className="col-span-2 space-y-0.5">
                                <div className="text-xs text-muted-foreground">Total contact attempts</div>
                                <div className="text-xl font-bold">{rep.totalAttempts}</div>
                                <div className="text-[11px] text-muted-foreground">calls + SMS logged</div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>

                  {/* Comparison table */}
                  <Card className="overflow-hidden">
                    <CardHeader className="border-b pb-3 pt-4">
                      <CardTitle className="flex items-center gap-2 text-sm font-semibold"><TrendingUp className="h-4 w-4 text-[#ff6221]" /> Side-by-side breakdown</CardTitle>
                    </CardHeader>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/40">
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Metric</th>
                            {repComparison.data.map(rep => (
                              <th key={rep.agentName} className="px-4 py-2.5 text-center font-medium">{rep.agentName.split(" ")[0]}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {[
                            { label: "FNOLs assigned", key: "total" as const, fmt: (v: number) => String(v) },
                            { label: "Completed (template)", key: "completed" as const, fmt: (v: number) => String(v) },
                            { label: "Completion rate", key: "completionPct" as const, fmt: (v: number) => `${v}%` },
                            { label: "Awaiting outreach", key: "awaiting" as const, fmt: (v: number) => String(v) },
                            { label: "In outreach", key: "inOutreach" as const, fmt: (v: number) => String(v) },
                            { label: "SLA breaches", key: "slaBreaches" as const, fmt: (v: number) => String(v) },
                            { label: "Total attempts", key: "totalAttempts" as const, fmt: (v: number) => String(v) },
                          ].map(row => (
                            <tr key={row.label} className="hover:bg-muted/20">
                              <td className="px-4 py-2.5 font-medium text-muted-foreground">{row.label}</td>
                              {repComparison.data!.map(rep => (
                                <td key={rep.agentName} className="px-4 py-2.5 text-center font-semibold">
                                  {row.fmt(rep[row.key] as number)}
                                </td>
                              ))}
                            </tr>
                          ))}
                          <tr className="hover:bg-muted/20">
                            <td className="px-4 py-2.5 font-medium text-muted-foreground">Avg first contact</td>
                            {repComparison.data.map(rep => (
                              <td key={rep.agentName} className="px-4 py-2.5 text-center font-semibold">
                                {rep.avgFirstContactMin == null ? "—" : rep.avgFirstContactMin < 60 ? `${Number(rep.avgFirstContactMin.toFixed(1))}m` : `${Math.floor(rep.avgFirstContactMin / 60)}h ${Number((rep.avgFirstContactMin % 60).toFixed(1))}m`}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </Card>

                  <p className="text-[11px] text-muted-foreground">
                    All figures sourced directly from Slack FNOL thread events stored in the Loss Intake database. Refreshes every 5 minutes.
                    Ana handles Remote Markets (#claims-remotemarkets) as primary assignment plus in-store overflow from #claims.
                  </p>
                </>
              )}

              {/* ─── Awaiting Outreach Drill-Down Sheet ─── */}
              <Sheet open={awaitingDrillAgent !== null} onOpenChange={(open) => { if (!open) { setAwaitingDrillAgent(null); setSelectedAwaitingIds(new Set()); setBulkReassignTarget(""); } }}>
                <SheetContent side="right" className="w-full max-w-2xl overflow-y-auto p-0 sm:max-w-2xl">
                  <SheetHeader className="border-b px-6 py-4">
                    <SheetTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      Awaiting Outreach — {awaitingDrillAgent?.split(" ")[0]}
                    </SheetTitle>
                    <SheetDescription>
                      Claims not yet contacted. Click a Slack link to open the thread. Select claims to bulk reassign.
                    </SheetDescription>
                  </SheetHeader>

                  {/* Bulk reassign bar */}
                  {selectedAwaitingIds.size > 0 && (
                    <div className="flex items-center gap-3 border-b bg-amber-50 px-6 py-3 dark:bg-amber-950/20">
                      <span className="text-sm font-medium">{selectedAwaitingIds.size} selected</span>
                      <Select value={bulkReassignTarget} onValueChange={setBulkReassignTarget}>
                        <SelectTrigger className="h-8 w-48 text-xs">
                          <SelectValue placeholder="Reassign to…" />
                        </SelectTrigger>
                        <SelectContent>
                          {["Ana Padilla", "Bennet Carlos", "Carlito Legarde Jr"].map(name => (
                            <SelectItem key={name} value={name}>{name.split(" ")[0]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        disabled={!bulkReassignTarget || reassignMutation.isPending}
                        onClick={() => {
                          if (!bulkReassignTarget) return;
                          reassignMutation.mutate({
                            claimIds: Array.from(selectedAwaitingIds),
                            newAgentName: bulkReassignTarget,
                            newHandlerId: null,
                          });
                        }}
                      >
                        {reassignMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Reassign"}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedAwaitingIds(new Set())}>Clear</Button>
                    </div>
                  )}

                  <div className="divide-y">
                    {awaitingOutreach.isLoading ? (
                      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                      </div>
                    ) : !awaitingOutreach.data || awaitingOutreach.data.length === 0 ? (
                      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                        No claims awaiting outreach.
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-3 bg-muted/30 px-6 py-2 text-xs font-medium text-muted-foreground">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 rounded"
                            checked={selectedAwaitingIds.size === awaitingOutreach.data.length}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedAwaitingIds(new Set(awaitingOutreach.data!.map(c => c.id)));
                              else setSelectedAwaitingIds(new Set());
                            }}
                          />
                          <span>Select all ({awaitingOutreach.data.length})</span>
                        </div>
                        {awaitingOutreach.data.map(claim => {
                          const isSelected = selectedAwaitingIds.has(claim.id);
                          const postedDate = new Date(claim.postedAt);
                          const ageHours = Math.round((Date.now() - postedDate.getTime()) / 3_600_000 * 10) / 10;
                          const slaColor = claim.slaState === "breached" ? "text-red-600 dark:text-red-400" : claim.slaState === "at_risk" ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400";
                          return (
                            <div
                              key={claim.id}
                              className={`flex items-start gap-3 px-6 py-4 transition-colors ${
                                isSelected ? "bg-[#171b31]/5 dark:bg-[#171b31]/20" : "hover:bg-muted/30"
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="mt-1 h-3.5 w-3.5 rounded"
                                checked={isSelected}
                                onChange={(e) => {
                                  const next = new Set(selectedAwaitingIds);
                                  if (e.target.checked) next.add(claim.id);
                                  else next.delete(claim.id);
                                  setSelectedAwaitingIds(next);
                                }}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold">{claim.memberName ?? "Unknown member"}</span>
                                  {claim.market && <Badge variant="outline" className="text-[10px]">{claim.market}</Badge>}
                                  <Badge className={`text-[10px] ${slaColor}`} variant="outline">{SLA_LABELS[claim.slaState] ?? claim.slaState}</Badge>
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                                  {claim.vinLastSix && <span>VIN …{claim.vinLastSix}</span>}
                                  {claim.customerId && <span>ID: {claim.customerId}</span>}
                                  <span>Posted {ageHours}h ago</span>
                                  <span className="capitalize">{claim.channelName}</span>
                                </div>
                              </div>
                              {claim.slackPermalink && (
                                <a
                                  href={claim.slackPermalink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex shrink-0 items-center gap-1 rounded border px-2 py-1 text-xs font-medium text-[#ff6221] hover:bg-[#ff6221]/10"
                                >
                                  <ExternalLink className="h-3 w-3" /> Slack
                                </a>
                              )}
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                </SheetContent>
              </Sheet>
            </TabsContent>

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
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_180px_160px_160px_160px]">
                    <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search member, customer ID, market…" className="pl-9" /></div>
                    <Select value={stage} onValueChange={setStage}><SelectTrigger><SelectValue placeholder="All stages" /></SelectTrigger><SelectContent><SelectItem value="all">All stages</SelectItem>{Object.entries(STAGE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
                    <Select value={slaState} onValueChange={setSlaState}><SelectTrigger><SelectValue placeholder="All SLA states" /></SelectTrigger><SelectContent><SelectItem value="all">All SLA states</SelectItem>{Object.entries(SLA_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
                    <Select value={vehicleType} onValueChange={setVehicleType}><SelectTrigger><SelectValue placeholder="All vehicles" /></SelectTrigger><SelectContent><SelectItem value="all">All vehicles</SelectItem><SelectItem value="gas">Gas</SelectItem><SelectItem value="ev_tesla">Tesla / EV</SelectItem><SelectItem value="unknown">Unknown</SelectItem></SelectContent></Select>
                    <Select value={agentFilter} onValueChange={setAgentFilter}><SelectTrigger><SelectValue placeholder="All agents" /></SelectTrigger><SelectContent><SelectItem value="all">All agents</SelectItem><SelectItem value="Ana Padilla">Ana Padilla</SelectItem><SelectItem value="Bennet Carlos">Bennet Carlos</SelectItem><SelectItem value="Carlito Legarde Jr">Carlito Legarde Jr</SelectItem></SelectContent></Select>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader className="flex-row items-center justify-between"><CardTitle className="text-base">Claims <span className="ml-1 font-normal text-muted-foreground">({claims.data?.total ?? 0})</span></CardTitle>{claims.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}</CardHeader>
                <CardContent>
                  {!claims.data?.claims.length ? <EmptyState title="No matching claims" description="Try clearing a filter or broadening the selected date range." /> : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1100px] text-sm">
                        <thead><tr className="border-b text-left text-xs text-muted-foreground">
                          <th className="pb-3 font-medium">Member</th>
                          <th className="pb-3 font-medium">DOL</th>
                          <th className="pb-3 font-medium">Reported</th>
                          <th className="pb-3 font-medium">VIN (last 6)</th>
                          <th className="pb-3 font-medium">Rep</th>
                          <th className="pb-3 font-medium">Stage</th>
                          <th className="pb-3 font-medium">Template posted</th>
                          <th className="pb-3 font-medium">Attempts</th>
                          <th className="pb-3 font-medium">Quality</th>
                          <th className="pb-3 font-medium">SLA</th>
                          <th />
                        </tr></thead>
                        <tbody>{claims.data.claims.map(claim => {
                          const c = claim as typeof claim & { dateOfLoss?: string; templatePostedAt?: string | Date | null; contactAttempts?: number; storeTeamTagged?: boolean };
                          return <tr key={claim.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-3"><p className="font-semibold">{claim.memberName ?? "Unidentified member"}</p><p className="text-xs text-muted-foreground">{claim.customerId ?? "—"} · {claim.market ?? "—"}</p></td>
                          <td className="py-3 text-xs">{c.dateOfLoss ?? "—"}</td>
                          <td className="py-3 text-xs">{formatDateTime(claim.postedAt)}</td>
                          <td className="py-3 font-mono text-xs">{claim.vinLastSix ?? "—"}</td>
                          <td className="py-3">{claim.assignedAgent ?? "—"}</td>
                          <td className="py-3"><Badge variant="outline" className={stageBadge(claim.stage)}>{STAGE_LABELS[claim.stage]}</Badge></td>
                          <td className="py-3 text-xs">{c.templatePostedAt ? formatDateTime(c.templatePostedAt) : "—"}</td>
                          <td className="py-3 text-center">{c.contactAttempts ?? 0}</td>
                          <td className="py-3 font-semibold">{claim.qualityScore == null ? "—" : `${claim.qualityScore}/100`}</td>
                          <td className="py-3"><Badge variant="outline" className={slaBadge(claim.slaState)}>{SLA_LABELS[claim.slaState]}</Badge></td>
                          <td className="py-3 text-right"><Button size="sm" variant="ghost" onClick={() => setSelectedClaimId(claim.id)}>Detail <ChevronRight className="ml-1 h-3.5 w-3.5" /></Button></td>
                        </tr>;
                        })}</tbody>
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
