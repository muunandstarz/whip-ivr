import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  ExternalLink,
  FileWarning,
  Loader2,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import { useState } from "react";

export type ProcessorQueueItem = {
  id: number;
  memberName: string | null;
  customerId: string | null;
  market: string | null;
  vinLastSix: string | null;
  dateOfLoss: string | null;
  postedAt: Date;
  slackPermalink: string | null;
  sourceChannel: string;
  daysUnfiled: number;
  status: "not_started" | "filing" | "filed" | "not_a_claim";
  claimNumber: string | null;
  takenByName: string | null;
  takenAt: Date | null;
  statusUpdatedAt: Date | null;
  filedVisibleUntil: Date | null;
  details: {
    factsOfLoss: string | null;
    thirdParty: string | null;
    policeReport: string | null;
    tow: string | null;
    rideshare: string | null;
    photosOrFootage: string | null;
    preliminaryLiability: string | null;
    missing: string[];
  };
};

type StatusUpdate = {
  claimId: number;
  status: ProcessorQueueItem["status"];
  claimNumber?: string | null;
  notAClaimReason?: string | null;
};

function sourceLabel(source: string) {
  return source === "remote-markets" ? "#claims-remotemarkets" : `#${source}`;
}

function dateLabel(value: Date | string | null | undefined) {
  if (!value) return "Not captured";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function statusStyle(status: ProcessorQueueItem["status"]) {
  return {
    not_started: "border-slate-200 bg-slate-50 text-slate-700",
    filing: "border-amber-200 bg-amber-50 text-amber-800",
    filed: "border-emerald-200 bg-emerald-50 text-emerald-800",
    not_a_claim: "border-slate-200 bg-slate-50 text-slate-600",
  }[status];
}

function statusLabel(status: ProcessorQueueItem["status"]) {
  return {
    not_started: "Not started",
    filing: "Filing",
    filed: "Filed",
    not_a_claim: "Not a claim",
  }[status];
}

function CapturedField({ label, value }: { label: string; value: string | null }) {
  return <div className="rounded-lg border bg-background p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</p><p className="mt-1 text-sm leading-5 text-foreground">{value ?? "Not captured in the source thread."}</p></div>;
}

function ProcessorRow({ item, canAct, pending, onUpdate }: { item: ProcessorQueueItem; canAct: boolean; pending: boolean; onUpdate: (update: StatusUpdate) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [showFiled, setShowFiled] = useState(false);
  const [showNotAClaim, setShowNotAClaim] = useState(false);
  const [claimNumber, setClaimNumber] = useState(item.claimNumber ?? "");
  const [reason, setReason] = useState("");
  const isFiling = item.status === "filing";
  const isFiled = item.status === "filed";

  return <Card className={isFiled ? "border-slate-200 bg-slate-50/70 opacity-70" : "border-[#151d44]/10 bg-background"}>
    <CardContent className="p-0">
      <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-foreground">{item.memberName ?? "Unidentified member"}</p><Badge variant="outline" className={statusStyle(item.status)}>{statusLabel(item.status)}</Badge>{isFiling && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800"><UserRound className="mr-1 h-3 w-3" />{item.takenByName ?? "Processor"} has it</Badge>}</div>
          <p className="mt-1 text-sm text-muted-foreground">{item.market ?? "Market unknown"} · VIN {item.vinLastSix ?? "not captured"} · {item.customerId ? `Customer ${item.customerId}` : "No customer ID"}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-md bg-muted px-2 py-1">DOL: {dateLabel(item.dateOfLoss)}</span><span className="rounded-md bg-muted px-2 py-1">{item.daysUnfiled} day{item.daysUnfiled === 1 ? "" : "s"} unfiled</span><span className="rounded-md bg-muted px-2 py-1">{sourceLabel(item.sourceChannel)}</span>{item.claimNumber && <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-800">Snapsheet {item.claimNumber}</span>}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:max-w-[29rem] lg:justify-end">
          {canAct && item.status === "not_started" && <Button size="sm" className="bg-[#151d44] hover:bg-[#202b5d]" disabled={pending} onClick={() => onUpdate({ claimId: item.id, status: "filing" })}>Take filing</Button>}
          {canAct && isFiling && <><Button size="sm" variant="outline" disabled={pending} onClick={() => setShowFiled(current => !current)}>Mark filed</Button><Button size="sm" variant="ghost" disabled={pending} onClick={() => onUpdate({ claimId: item.id, status: "not_started" })}>Release</Button></>}
          {canAct && !isFiled && !isFiling && <Button size="sm" variant="ghost" disabled={pending} onClick={() => setShowNotAClaim(current => !current)}>Not a claim</Button>}
          {item.slackPermalink && <Button size="sm" variant="outline" asChild><a href={item.slackPermalink} target="_blank" rel="noreferrer">Slack <ExternalLink className="ml-1 h-3.5 w-3.5" /></a></Button>}
          <Button size="sm" variant="ghost" onClick={() => setExpanded(current => !current)}>{expanded ? "Hide details" : "Show details"}{expanded ? <ChevronUp className="ml-1 h-3.5 w-3.5" /> : <ChevronDown className="ml-1 h-3.5 w-3.5" />}</Button>
        </div>
      </div>
      {showFiled && <div className="border-t bg-emerald-50/50 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-end"><div className="min-w-0 flex-1 space-y-1"><Label htmlFor={`claim-${item.id}`}>Snapsheet claim number <span className="text-red-600">required</span></Label><Input id={`claim-${item.id}`} value={claimNumber} onChange={event => setClaimNumber(event.target.value)} placeholder="e.g., ATL-10211-650094-000001" /></div><Button disabled={pending || !claimNumber.trim()} className="bg-emerald-700 hover:bg-emerald-800" onClick={() => onUpdate({ claimId: item.id, status: "filed", claimNumber })}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm filed"}</Button></div><p className="mt-2 text-xs text-emerald-900/75">Filed items remain here, greyed out, through today so other processors can see the work before the next refresh.</p></div>}
      {showNotAClaim && <div className="border-t bg-slate-50 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-end"><div className="min-w-0 flex-1 space-y-1"><Label htmlFor={`reason-${item.id}`}>Why is this not a claim? <span className="text-red-600">required</span></Label><Input id={`reason-${item.id}`} value={reason} onChange={event => setReason(event.target.value)} placeholder="e.g., duplicate of existing file" maxLength={500} /></div><Button disabled={pending || !reason.trim()} variant="outline" onClick={() => onUpdate({ claimId: item.id, status: "not_a_claim", notAClaimReason: reason })}>Exclude from future sweeps</Button></div><p className="mt-2 text-xs text-muted-foreground">The VIN fragment and reason are retained in the processor audit record; this does not delete the source notice.</p></div>}
      {expanded && <div className="border-t bg-muted/20 p-4"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"><CapturedField label="Facts of loss" value={item.details.factsOfLoss} /><CapturedField label="Third party" value={item.details.thirdParty} /><CapturedField label="Police report" value={item.details.policeReport} /><CapturedField label="Tow" value={item.details.tow} /><CapturedField label="Rideshare status / period" value={item.details.rideshare} /><CapturedField label="Photos / footage" value={item.details.photosOrFootage} /><CapturedField label="Preliminary liability" value={item.details.preliminaryLiability} /></div><div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/50 p-3"><p className="flex items-center gap-2 text-sm font-semibold text-amber-950"><AlertTriangle className="h-4 w-4 text-amber-700" />Missing or not documented</p><p className="mt-1 text-sm leading-6 text-amber-900/80">{item.details.missing.length ? item.details.missing.join(" · ") : "No baseline fields are missing from the source record."}</p></div></div>}
    </CardContent>
  </Card>;
}

export function LossIntakeProcessorQueue({ data, isLoading, canAct, pendingClaimId, onUpdate }: { data: { available: boolean; warning: string | null; items: ProcessorQueueItem[] } | undefined; isLoading: boolean; canAct: boolean; pendingClaimId: number | null; onUpdate: (update: StatusUpdate) => void }) {
  if (isLoading) return <div className="flex min-h-72 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Building Processor queue from All Reported IncidentsStatus…</div>;
  if (!data?.available) return <Card className="border-amber-200 bg-amber-50/40"><CardContent className="flex gap-3 p-5"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div><p className="font-semibold text-amber-950">Processor queue is waiting for its filed-claim source</p><p className="mt-1 text-sm leading-6 text-amber-900/80">{data?.warning ?? "The read-only All Reported IncidentsStatus source could not be reached."} No unreported list is shown while the filed test cannot be verified.</p></div></CardContent></Card>;
  return <section className="space-y-4"><Card className="border-[#151d44]/10 bg-[#151d44] text-white"><CardContent className="flex flex-col gap-3 p-5 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/65">Processors / unreported claims</p><h2 className="mt-1 text-xl font-semibold">{data.items.length} loss{data.items.length === 1 ? "" : "es"} need a filing decision</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-white/80"><strong>File with the information available. Do not call the member.</strong> Member contact belongs to the intake reps. Where a field is unavailable, file with what exists and note the gap.</p></div><FileWarning className="h-9 w-9 shrink-0 text-[#ffb08a]" /></CardContent></Card>{data.items.length === 0 ? <Card><CardContent className="flex min-h-64 flex-col items-center justify-center text-center"><CheckCircle2 className="mb-3 h-9 w-9 text-emerald-500" /><p className="font-semibold">No unreported claims are waiting</p><p className="mt-1 max-w-md text-sm text-muted-foreground">Every eligible Slack notice currently has a matching row on All Reported IncidentsStatus, is excluded with an auditable reason, or was filed today.</p></CardContent></Card> : <div className="space-y-3">{data.items.map(item => <ProcessorRow key={item.id} item={item} canAct={canAct} pending={pendingClaimId === item.id} onUpdate={onUpdate} />)}</div>}</section>;
}
