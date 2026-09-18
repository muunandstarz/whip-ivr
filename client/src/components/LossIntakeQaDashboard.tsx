import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertTriangle,
  ArrowRight,
  Award,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  Gauge,
  MessageSquareText,
  ShieldCheck,
  Target,
  UsersRound,
} from "lucide-react";
import { useMemo, useState } from "react";

type QaPage = "brief" | "team" | "actions" | "reports" | "methodology" | "my-results" | "my-actions" | "feedback";

export type DispatchQaClaim = {
  id: number;
  assignedAgent: string | null;
  channelName: string;
  completedAt: Date | null;
  contactAttempts: number;
  customerId: string | null;
  factsOfLoss: string | null;
  firstContactAt: Date | null;
  firstContactMinutes: number | null;
  firstResponseBusinessMinutes: number | null;
  filingState: "filed" | "unfiled" | "unverified";
  hasPhotos: boolean;
  market: string | null;
  memberName: string | null;
  onSiteFlag: boolean;
  inspectionScheduledAt?: Date | null;
  postedAt: Date;
  preliminaryLiability: string | null;
  slaState: "within_sla" | "at_risk" | "breached";
  slaTargetBusinessMinutes: number | null;
  slackPermalink: string | null;
  stage: "awaiting_outreach" | "outreach_started" | "contact_attempts" | "complete";
};

type Representative = {
  name: string;
  total: number;
  onTime: number;
  completed: number;
  documented: number;
  exceptions: DispatchQaClaim[];
};

function percent(numerator: number, denominator: number) {
  return denominator ? Math.round((numerator / denominator) * 100) : null;
}

function Metric({ label, value, detail, tone = "navy" }: { label: string; value: string; detail: string; tone?: "navy" | "teal" | "blue" | "coral" }) {
  const accent = { navy: "border-[#151d44]/10", teal: "border-emerald-200", blue: "border-sky-200", coral: "border-orange-200" }[tone];
  return <Card className={`${accent} shadow-sm`}><CardContent className="p-4"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{value}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p></CardContent></Card>;
}

function Progress({ value, tone = "bg-[#151d44]" }: { value: number | null; tone?: string }) {
  return <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${tone}`} style={{ width: `${value ?? 0}%` }} /></div>;
}

function Status({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "good" | "watch" | "risk" | "neutral" }) {
  const styles = {
    good: "border-emerald-200 bg-emerald-50 text-emerald-700",
    watch: "border-amber-200 bg-amber-50 text-amber-800",
    risk: "border-red-200 bg-red-50 text-red-700",
    neutral: "border-slate-200 bg-slate-50 text-slate-700",
  };
  return <Badge variant="outline" className={styles[tone]}>{children}</Badge>;
}

function pageLabel(page: QaPage) {
  return ({ brief: "Weekly brief", team: "Team performance", actions: "Action queue", reports: "Reports & trends", methodology: "Methodology", "my-results": "My results", "my-actions": "What I need to fix", feedback: "My feedback" })[page];
}

export function LossIntakeQaDashboard({ claims, viewerName, isAdmin, onOpenClaim }: { claims: DispatchQaClaim[]; viewerName: string; isAdmin: boolean; onOpenClaim: (id: number) => void }) {
  const [audience, setAudience] = useState<"leadership" | "team">(isAdmin ? "leadership" : "team");
  const [page, setPage] = useState<QaPage>(isAdmin ? "brief" : "my-results");
  const [actionFilter, setActionFilter] = useState<"all" | "fix" | "review">("all");

  const active = useMemo(() => claims.filter(claim => !claim.completedAt), [claims]);
  const onTime = useMemo(() => claims.filter(claim => claim.firstContactAt && claim.slaState === "within_sla").length, [claims]);
  const responseEligible = useMemo(() => claims.filter(claim => claim.firstContactAt || claim.slaState === "at_risk" || claim.slaState === "breached").length, [claims]);
  const documented = useMemo(() => claims.filter(claim => claim.factsOfLoss && claim.preliminaryLiability).length, [claims]);
  const office = useMemo(() => claims.filter(claim => claim.onSiteFlag), [claims]);
  const remote = useMemo(() => claims.filter(claim => claim.channelName === "remote-markets"), [claims]);
  const officeOnTime = percent(office.filter(claim => claim.firstContactAt && claim.slaState === "within_sla").length, office.length);
  const remoteOnTime = percent(remote.filter(claim => claim.firstContactAt && claim.slaState === "within_sla").length, remote.length);

  const representatives = useMemo<Representative[]>(() => {
    const groups = new Map<string, DispatchQaClaim[]>();
    for (const claim of claims) {
      const name = claim.assignedAgent || "Shared pull queue";
      groups.set(name, [...(groups.get(name) ?? []), claim]);
    }
    return Array.from(groups.entries()).map(([name, rows]) => ({
      name,
      total: rows.length,
      onTime: rows.filter(row => row.firstContactAt && row.slaState === "within_sla").length,
      completed: rows.filter(row => row.completedAt).length,
      documented: rows.filter(row => row.factsOfLoss && row.preliminaryLiability).length,
      exceptions: rows.filter(row => !row.completedAt && (row.slaState !== "within_sla" || !row.factsOfLoss || !row.preliminaryLiability)),
    })).sort((left, right) => right.total - left.total);
  }, [claims]);

  const person = representatives.find(rep => rep.name.toLowerCase() === viewerName.toLowerCase()) ?? { name: viewerName, total: 0, onTime: 0, completed: 0, documented: 0, exceptions: [] };
  const recognition = [...representatives].filter(rep => rep.total >= 3).sort((left, right) => (percent(right.onTime, right.total) ?? 0) - (percent(left.onTime, left.total) ?? 0))[0];
  const opportunity = [...representatives].filter(rep => rep.total >= 3).sort((left, right) => (percent(left.documented, left.total) ?? 100) - (percent(right.documented, right.total) ?? 100))[0];
  const allExceptions = active.filter(claim => claim.slaState !== "within_sla" || !claim.factsOfLoss || !claim.preliminaryLiability);
  const filteredExceptions = (audience === "team" ? person.exceptions : allExceptions).filter(claim => {
    if (actionFilter === "fix") return !claim.factsOfLoss || !claim.preliminaryLiability;
    if (actionFilter === "review") return claim.slaState !== "within_sla";
    return true;
  });

  const switchAudience = (next: "leadership" | "team") => {
    setAudience(next);
    setPage(next === "leadership" ? "brief" : "my-results");
  };

  const leadershipNav: QaPage[] = ["brief", "team", "actions", "reports", "methodology"];
  const teamNav: QaPage[] = ["my-results", "my-actions", "feedback"];
  const nav = audience === "leadership" ? leadershipNav : teamNav;

  const openException = (claim: DispatchQaClaim) => onOpenClaim(claim.id);

  return <section className="rounded-2xl border border-[#151d44]/10 bg-gradient-to-b from-[#151d44]/[0.035] via-background to-background p-4 shadow-sm sm:p-6">
    <div className="flex flex-col gap-5 xl:flex-row">
      <aside className="shrink-0 xl:w-52">
        <div className="rounded-xl border border-[#151d44]/10 bg-background p-3 shadow-sm xl:sticky xl:top-4">
          <div className="mb-4 flex items-center gap-2"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#151d44] text-white"><Gauge className="h-4 w-4" /></div><div><p className="text-sm font-bold text-foreground">Intake QA</p><p className="text-[11px] text-muted-foreground">Weekly intelligence</p></div></div>
          {isAdmin && <div className="mb-4 grid grid-cols-2 rounded-lg bg-muted p-1 text-xs"><button className={`rounded-md px-2 py-2 font-medium ${audience === "leadership" ? "bg-background text-[#151d44] shadow-sm" : "text-muted-foreground"}`} onClick={() => switchAudience("leadership")}>Leadership</button><button className={`rounded-md px-2 py-2 font-medium ${audience === "team" ? "bg-background text-[#151d44] shadow-sm" : "text-muted-foreground"}`} onClick={() => switchAudience("team")}>Intake team</button></div>}
          <nav className="space-y-1">{nav.map(item => <button key={item} onClick={() => setPage(item)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${page === item ? "bg-[#151d44] text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}><span>{pageLabel(item)}</span>{page === item && <ArrowRight className="h-3.5 w-3.5" />}</button>)}</nav>
          <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-900"><div className="flex items-center gap-2 font-semibold"><Clock3 className="h-3.5 w-3.5" /> Operating rules</div><p className="mt-1.5 leading-5">In-office: 10 minutes. Remote: 4 business hours. Nights and weekends pause the clock.</p></div>
        </div>
      </aside>

      <div className="min-w-0 flex-1 space-y-5">
        {page === "brief" && <>
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#dd571d]">Leadership / weekly report</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-foreground">The week in one minute</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Use Dispatch evidence to separate initial response, statement completion, documentation quality, and filing follow-up. This scorecard is calculated from live Loss Intake records—not a manually maintained report.</p></div>
          <Card className="border-[#151d44]/10 bg-[#151d44] text-white"><CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between"><div className="flex gap-3"><div className="mt-0.5 rounded-lg bg-white/10 p-2"><BarChart3 className="h-5 w-5" /></div><div><p className="text-xs font-semibold uppercase tracking-[0.13em] text-white/65">Executive readout</p><h3 className="mt-1 text-lg font-semibold">Response and documentation are separate signals.</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-white/75">{active.length} records remain active. {officeOnTime == null ? "No in-office response baseline is available yet." : `In-office SLA is ${officeOnTime}%.`} {remoteOnTime == null ? "" : `Remote SLA is ${remoteOnTime}%.`} Review action cards before assigning a coaching conclusion.</p></div></div><Button variant="secondary" className="shrink-0 gap-2" onClick={() => setPage("team")}>Team detail <ArrowRight className="h-4 w-4" /></Button></CardContent></Card>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Metric label="Unique records" value={String(claims.length)} detail="Duplicate source notices collapse to a primary Dispatch record" /><Metric label="Response SLA" value={responseEligible ? `${percent(onTime, responseEligible)}%` : "—"} detail={responseEligible ? `${onTime} of ${responseEligible} documented first actions on time` : "No response activity yet"} tone="teal" /><Metric label="Intake complete" value={claims.length ? `${percent(claims.filter(claim => claim.completedAt).length, claims.length)}%` : "—"} detail="Completed work among live Dispatch records" tone="blue" /><Metric label="Evidence complete" value={claims.length ? `${percent(documented, claims.length)}%` : "—"} detail="Facts of loss and preliminary liability present" tone="teal" /><Metric label="Active risks" value={String(allExceptions.length)} detail="Late response or missing intake evidence" tone="coral" /></div>
          <div className="grid gap-4 xl:grid-cols-2"><Card><CardHeader><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Response by work type</p><CardTitle className="mt-1 text-lg">Two queues, two standards</CardTitle></div><Status tone="neutral">Business hours</Status></div></CardHeader><CardContent className="space-y-5"><div><div className="flex items-center justify-between gap-4"><div><p className="text-xs font-semibold text-[#527fdb]">IN-OFFICE / #CLAIMS</p><p className="mt-1 text-sm text-muted-foreground">Store Operations Slack evidence of arrival starts the 10-minute statement-attempt standard.</p></div><strong className="text-xl text-foreground">{officeOnTime == null ? "—" : `${officeOnTime}%`}</strong></div><Progress value={officeOnTime} tone="bg-[#527fdb]" /></div><div><div className="flex items-center justify-between gap-4"><div><p className="text-xs font-semibold text-emerald-700">ALL OTHER REPORTS</p><p className="mt-1 text-sm text-muted-foreground">Weekday 9 AM–6 PM ET clock with a 4-business-hour completion standard.</p></div><strong className="text-xl text-foreground">{remoteOnTime == null ? "—" : `${remoteOnTime}%`}</strong></div><Progress value={remoteOnTime} tone="bg-emerald-500" /></div></CardContent></Card>
          <Card><CardHeader><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Recognition & opportunities</p><CardTitle className="mt-1 text-lg">Manager review before recognition or coaching</CardTitle></CardHeader><CardContent className="space-y-4"><div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4"><div className="flex items-center gap-2"><Award className="h-4 w-4 text-emerald-700" /><Status tone="good">Recognition candidate</Status></div><p className="mt-2 font-semibold text-foreground">{recognition ? `${recognition.name} has the strongest documented on-time response rate.` : "No representative has sufficient completed activity for a recognition candidate yet."}</p>{recognition && <p className="mt-1 text-sm text-muted-foreground">{recognition.onTime} of {recognition.total} records met the documented response standard. Confirm workload context before sharing recognition.</p>}</div><div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4"><div className="flex items-center gap-2"><Target className="h-4 w-4 text-amber-700" /><Status tone="watch">Coaching opportunity</Status></div><p className="mt-2 font-semibold text-foreground">{opportunity ? `${opportunity.name} has the largest documentation follow-up opportunity.` : "No representative has sufficient activity for a coaching comparison yet."}</p>{opportunity && <p className="mt-1 text-sm text-muted-foreground">{opportunity.documented} of {opportunity.total} records contain both documented facts of loss and preliminary liability.</p>}</div></CardContent></Card></div>
        </>}

        {page === "team" && <>
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#dd571d]">Leadership / team performance</p><h2 className="mt-1 text-2xl font-bold tracking-tight">Compare within the right context</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Shared queue staffing and work type remain visible beside every score. Use record-level exceptions before drawing a performance conclusion.</p></div>
          <Card className="border-sky-200 bg-sky-50/50"><CardContent className="flex gap-3 p-4"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" /><div><p className="font-semibold text-sky-950">Corrected assignment model</p><p className="mt-1 text-sm leading-6 text-sky-900/80">In-office reports are a shared pull queue. Remote reports and overflow are distinct work types. Response and completion must not be treated as one measure.</p></div></CardContent></Card>
          <Card><CardContent className="overflow-x-auto p-0"><div className="min-w-[760px]"><div className="grid grid-cols-[1.6fr_.65fr_1fr_1fr_1fr_.75fr] gap-3 border-b bg-muted/50 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"><span>Handler / work context</span><span>Volume</span><span>Response SLA</span><span>Statements / completion</span><span>Evidence</span><span>Review</span></div>{representatives.map(rep => { const rate = percent(rep.onTime, rep.total); const completion = percent(rep.completed, rep.total); const evidence = percent(rep.documented, rep.total); return <div key={rep.name} className="grid grid-cols-[1.6fr_.65fr_1fr_1fr_1fr_.75fr] items-center gap-3 border-b px-4 py-4 text-sm last:border-0"><div><p className="font-semibold text-foreground">{rep.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{rep.name === "Shared pull queue" ? "Unassigned or shared work" : "Assigned Dispatch records"}</p></div><div><strong>{rep.total}</strong><p className="text-xs text-muted-foreground">records</p></div><div><strong>{rate == null ? "—" : `${rate}%`}</strong><Progress value={rate} tone="bg-[#527fdb]" /></div><div><strong>{completion == null ? "—" : `${completion}%`}</strong><p className="text-xs text-muted-foreground">intake complete</p></div><div><strong>{evidence == null ? "—" : `${evidence}%`}</strong><p className="text-xs text-muted-foreground">FOL + liability</p></div><Button size="sm" variant="outline" onClick={() => { const first = rep.exceptions[0]; if (first) onOpenClaim(first.id); }}>Review</Button></div>; })}{representatives.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">No live Dispatch records are assigned yet.</div>}</div></CardContent></Card>
        </>}

        {(page === "actions" || page === "my-actions") && <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#dd571d]">{page === "actions" ? "Leadership / action queue" : "My work / action queue"}</p><h2 className="mt-1 text-2xl font-bold tracking-tight">Records that need attention</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Fix missing evidence first; then review response-timing exceptions. Every item keeps its link back to the source record.</p></div><div className="flex rounded-lg border bg-background p-1 text-xs"><button onClick={() => setActionFilter("all")} className={`rounded-md px-3 py-2 ${actionFilter === "all" ? "bg-[#151d44] text-white" : "text-muted-foreground"}`}>All</button><button onClick={() => setActionFilter("fix")} className={`rounded-md px-3 py-2 ${actionFilter === "fix" ? "bg-[#151d44] text-white" : "text-muted-foreground"}`}>Fix now</button><button onClick={() => setActionFilter("review")} className={`rounded-md px-3 py-2 ${actionFilter === "review" ? "bg-[#151d44] text-white" : "text-muted-foreground"}`}>Review</button></div></div>
          <div className="grid gap-3 sm:grid-cols-3"><Metric label="Fix now" value={String(filteredExceptions.filter(claim => !claim.factsOfLoss || !claim.preliminaryLiability).length)} detail="Missing core intake evidence" tone="coral" /><Metric label="Timing review" value={String(filteredExceptions.filter(claim => claim.slaState !== "within_sla").length)} detail="At risk or beyond response target" tone="blue" /><Metric label="Records shown" value={String(filteredExceptions.length)} detail="Filtered operational exception queue" tone="navy" /></div>
          <div className="space-y-3">{filteredExceptions.map(claim => { const missing = [!claim.factsOfLoss && "facts of loss", !claim.preliminaryLiability && "preliminary liability"].filter(Boolean).join(" and "); const high = Boolean(missing); return <Card key={claim.id} className={high ? "border-red-200" : "border-amber-200"}><CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center"><div className="shrink-0"><Status tone={high ? "risk" : "watch"}>{high ? "Fix now" : "Review"}</Status></div><div className="min-w-0 flex-1"><p className="font-semibold text-foreground">{claim.memberName ?? "Unidentified member"} <span className="font-normal text-muted-foreground">· {claim.market ?? "Market unknown"}</span></p><p className="mt-1 text-sm text-muted-foreground">#{claim.channelName === "remote-markets" ? "claims-remotemarkets" : claim.channelName} · {claim.assignedAgent ?? "Shared pull queue"}</p><p className="mt-2 text-sm leading-6 text-foreground">{missing ? `Document ${missing}.` : "Review the response window and confirm the source-thread context."}</p></div><div className="flex shrink-0 gap-2"><Status tone={claim.slaState === "within_sla" ? "good" : "risk"}>{claim.slaState === "within_sla" ? "Response on time" : "Response review"}</Status><Button variant="outline" size="sm" onClick={() => openException(claim)}>Open record <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button></div></CardContent></Card>; })}{filteredExceptions.length === 0 && <Card><CardContent className="flex min-h-48 flex-col items-center justify-center text-center"><CheckCircle2 className="mb-3 h-8 w-8 text-emerald-500" /><p className="font-semibold">No records in this exception filter</p><p className="mt-1 text-sm text-muted-foreground">Change the filter or refresh live Dispatch sources.</p></CardContent></Card>}</div>
        </>}

        {page === "reports" && <><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#dd571d]">Leadership / reporting</p><h2 className="mt-1 text-2xl font-bold tracking-tight">A clean weekly reporting view</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Lead with the decision, show the evidence, and name the next owner. Trend language stays cautious until enough completed weekly refreshes exist.</p></div><Card className="bg-[#151d44] text-white"><CardContent className="grid gap-4 p-5 md:grid-cols-3"><div><p className="text-xs font-semibold tracking-[0.12em] text-white/60">HEADLINE</p><p className="mt-1 font-semibold">{officeOnTime != null && remoteOnTime != null ? `Remote SLA is ${remoteOnTime}% versus ${officeOnTime}% in-office.` : "Build the first validated SLA baseline."}</p></div><div><p className="text-xs font-semibold tracking-[0.12em] text-white/60">EVIDENCE</p><p className="mt-1 font-semibold">{allExceptions.length} active records have a timing or evidence exception.</p></div><div><p className="text-xs font-semibold tracking-[0.12em] text-white/60">OWNER / NEXT</p><p className="mt-1 font-semibold">Team lead reviews exceptions; assigned intake owners document the source thread.</p></div></CardContent></Card><div className="grid gap-4 xl:grid-cols-2"><Card><CardHeader><CardTitle className="text-lg">Completed versus gap</CardTitle></CardHeader><CardContent className="space-y-5">{[{ label: "In-office SLA", good: office.filter(claim => claim.firstContactAt && claim.slaState === "within_sla").length, total: office.length, tone: "bg-[#527fdb]" }, { label: "Remote SLA", good: remote.filter(claim => claim.firstContactAt && claim.slaState === "within_sla").length, total: remote.length, tone: "bg-emerald-500" }, { label: "Intake completion", good: claims.filter(claim => claim.completedAt).length, total: claims.length, tone: "bg-[#151d44]" }, { label: "Evidence complete", good: documented, total: claims.length, tone: "bg-[#dd571d]" }].map(row => <div key={row.label}><div className="flex justify-between text-sm"><span>{row.label}</span><strong>{row.good} of {row.total}</strong></div><Progress value={percent(row.good, row.total)} tone={row.tone} /></div>)}</CardContent></Card><Card><CardHeader><CardTitle className="text-lg">Definitions stay with the numbers</CardTitle></CardHeader><CardContent className="space-y-3 text-sm leading-6 text-muted-foreground"><p><strong className="text-foreground">In-office SLA:</strong> Vehicle photos in #claims establish a 10-minute attempt standard.</p><p><strong className="text-foreground">Remote SLA:</strong> #claims-remotemarkets runs Monday–Friday, 9:00 AM–6:00 PM ET with a 4-business-hour completion standard.</p><p><strong className="text-foreground">Evidence complete:</strong> Facts of loss and preliminary liability are documented in the intake source record.</p><p><strong className="text-foreground">Duplicates:</strong> linked source notices retain their audit trail but do not inflate unique-record counts.</p></CardContent></Card></div></>}

        {page === "methodology" && <><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#dd571d]">Leadership / methodology</p><h2 className="mt-1 text-2xl font-bold tracking-tight">Audit-ready by design</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Each number should trace to a source post, a business-time calculation, and a stated rule.</p></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{[[Clock3, "Business hours", "Monday–Friday, 9:00 AM–6:00 PM Eastern. Nights and weekends are excluded."], [Target, "In-office standard", "Vehicle photos establish an in-office record and a 10-minute statement-attempt target."], [Gauge, "Remote standard", "Remote markets are due within four business hours, beginning at the next opening when needed."], [FileCheck2, "Completion evidence", "Facts of loss and preliminary liability must be documented before the intake is considered evidence-complete."], [UsersRound, "Duplicate treatment", "Same member/customer and VIN notices collapse to an earliest primary record while retaining source links."], [ClipboardCheck, "Fair comparison", "Response, completion, and documentation remain separate measures with queue context visible."]].map(([Icon, title, body]) => { const RuleIcon = Icon as typeof Clock3; return <Card key={title as string}><CardContent className="p-4"><div className="mb-4 inline-flex rounded-lg bg-[#151d44]/8 p-2 text-[#151d44]"><RuleIcon className="h-5 w-5" /></div><p className="font-semibold">{title as string}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{body as string}</p></CardContent></Card>; })}</div></>}

        {page === "my-results" && <><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#dd571d]">My results</p><h2 className="mt-1 text-2xl font-bold tracking-tight">{person.name}, here is what your numbers say</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">This view is scoped to your assigned Dispatch work. It separates on-time initial response from follow-through and documentation.</p></div><Card className="border-[#151d44]/10"><CardContent className="grid gap-5 p-5 lg:grid-cols-[1.3fr_.9fr] lg:items-center"><div><Status tone={percent(person.onTime, person.total) != null && (percent(person.onTime, person.total) ?? 0) >= 80 ? "good" : "watch"}>Your active scorecard</Status><h3 className="mt-3 text-xl font-semibold">{person.total ? `${person.onTime} of ${person.total} records have a documented on-time response.` : "No assigned Dispatch records are available yet."}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Use the action queue to resolve exact records with late timing or missing core intake evidence.</p></div><div className="rounded-xl bg-muted/50 p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Fix these first</p><p className="mt-2 text-3xl font-bold">{person.exceptions.length}</p><p className="mt-1 text-sm text-muted-foreground">open action item{person.exceptions.length === 1 ? "" : "s"}</p><Button size="sm" className="mt-4 bg-[#151d44] hover:bg-[#202b5d]" onClick={() => setPage("my-actions")}>Open my action queue</Button></div></CardContent></Card><div className="grid gap-3 sm:grid-cols-3"><Metric label="Answered on time" value={person.total ? `${percent(person.onTime, person.total)}%` : "—"} detail={`${person.onTime} of ${person.total} records`} tone="blue" /><Metric label="Intake complete" value={person.total ? `${percent(person.completed, person.total)}%` : "—"} detail={`${person.completed} completed records`} tone="teal" /><Metric label="Evidence complete" value={person.total ? `${percent(person.documented, person.total)}%` : "—"} detail={`${person.documented} records with FOL + liability`} tone="navy" /></div><div className="grid gap-3 md:grid-cols-3"><Card className="border-emerald-200 bg-emerald-50/50"><CardContent className="p-4"><p className="flex items-center gap-2 text-sm font-semibold text-emerald-900"><CheckCircle2 className="h-4 w-4" /> Keep doing</p><p className="mt-2 text-sm leading-6 text-emerald-900/80">Document the first response promptly and preserve the source-thread evidence.</p></CardContent></Card><Card className="border-amber-200 bg-amber-50/50"><CardContent className="p-4"><p className="flex items-center gap-2 text-sm font-semibold text-amber-900"><Target className="h-4 w-4" /> Fix next</p><p className="mt-2 text-sm leading-6 text-amber-900/80">Close records missing facts of loss or preliminary liability before they become a QA exception.</p></CardContent></Card><Card className="border-sky-200 bg-sky-50/50"><CardContent className="p-4"><p className="flex items-center gap-2 text-sm font-semibold text-sky-900"><ArrowRight className="h-4 w-4" /> Do this every time</p><p className="mt-2 text-sm leading-6 text-sky-900/80">Record the response, statement status, required facts, liability assessment, and next owner when work is blocked.</p></CardContent></Card></div></>}

        {page === "feedback" && <><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#dd571d]">My feedback</p><h2 className="mt-1 text-2xl font-bold tracking-tight">Feedback from your manager</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Manager-reviewed feedback will appear here after a leadership review. The Dispatch board does not automatically publish a performance judgment.</p></div><Card><CardContent className="flex min-h-56 flex-col items-center justify-center text-center"><MessageSquareText className="mb-3 h-9 w-9 text-[#151d44]" /><p className="font-semibold">No manager-reviewed feedback has been issued</p><p className="mt-1 max-w-md text-sm text-muted-foreground">Use My Results and What I Need to Fix for the current evidence. Manager feedback requires a human review before it is visible.</p></CardContent></Card></>}
      </div>
    </div>
  </section>;
}
