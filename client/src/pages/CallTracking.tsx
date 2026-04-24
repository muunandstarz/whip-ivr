import { useState } from "react";
import WhipLayout from "@/components/WhipLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PhoneCall,
  PhoneMissed,
  PhoneIncoming,
  Voicemail,
  Clock,
  User,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  X,
  Building2,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Info,
  FileText,
  Mic,
  MessageSquare,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { format } from "date-fns";

const PAGE_SIZE = 50;

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  answered: { label: "Answered", icon: PhoneCall, className: "bg-green-50 text-green-700 border-green-200" },
  missed: { label: "Missed", icon: PhoneMissed, className: "bg-red-50 text-red-700 border-red-200" },
  voicemail: { label: "Voicemail", icon: Voicemail, className: "bg-blue-50 text-blue-700 border-blue-200" },
  transferred: { label: "Transferred", icon: PhoneIncoming, className: "bg-purple-50 text-purple-700 border-purple-200" },
  abandoned: { label: "Abandoned", icon: PhoneMissed, className: "bg-gray-50 text-gray-600 border-gray-200" },
};

function formatSeconds(seconds: number): string {
  if (!seconds || seconds === 0) return "—";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

function callerTypeBadge(type: string | null | undefined) {
  if (!type) return <Badge variant="outline" className="text-xs text-muted-foreground">Unknown</Badge>;
  const map: Record<string, string> = {
    carrier: "bg-blue-50 text-blue-700 border-blue-200",
    law_office: "bg-red-50 text-red-700 border-red-200",
    medical_provider: "bg-purple-50 text-purple-700 border-purple-200",
    member: "bg-green-50 text-green-700 border-green-200",
    claimant: "bg-yellow-50 text-yellow-700 border-yellow-200",
    police: "bg-gray-50 text-gray-700 border-gray-200",
  };
  return (
    <Badge variant="outline" className={`text-xs capitalize ${map[type] ?? ""}`}>
      {type.replace(/_/g, " ")}
    </Badge>
  );
}

function IntakeCardCT({ r, blocker, hasTranscript, hasRecording }: {
  r: any;
  blocker: string | null;
  hasTranscript: boolean;
  hasRecording: boolean;
}) {
  const [showTx, setShowTx] = useState(false);
  return (
    <div className="bg-muted/40 rounded-lg border text-sm overflow-hidden">
      <div className="flex items-start justify-between p-3 gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">
              {r.callerName ?? "Unknown"}{r.callerOrg ? ` · ${r.callerOrg}` : ""}
            </span>
            {r.whipClaimNumber && (
              <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5">
                Claim: {r.whipClaimNumber}
              </span>
            )}
            {r.source && (
              <span className="text-xs bg-slate-50 text-slate-600 border border-slate-200 rounded px-1.5 py-0.5 capitalize">
                {r.source === "voicemail" ? "Voicemail" : r.source === "live_call" ? "Live Call" : r.source}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {new Date(r.createdAt).toLocaleString()}
            {r.handlerName ? ` · Handler: ${r.handlerName}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Badge variant="outline" className={
            r.status === "open"
              ? "text-orange-600 border-orange-200 bg-orange-50"
              : "text-green-600 border-green-200 bg-green-50"
          }>{r.status}</Badge>
          {r.whipClaimNumber && (
            <a
              href={`https://snapsheetvice.com/claims?search=${encodeURIComponent(r.whipClaimNumber)}`}
              target="_blank" rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline flex items-center gap-0.5"
              onClick={(e) => e.stopPropagation()}
              title="Search in Snapsheet (login required)">
              Snapsheet <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
      {r.message && (
        <div className="px-3 pb-2">
          <div className="flex items-start gap-1.5 bg-background/70 rounded p-2 border border-border/50">
            <MessageSquare className="h-3.5 w-3.5 text-blue-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-blue-700 mb-0.5">Call Purpose</p>
              <p className="text-xs text-foreground leading-relaxed">{r.message}</p>
            </div>
          </div>
        </div>
      )}
      {blocker && (
        <div className="px-3 pb-2">
          <div className="flex items-center gap-1.5 bg-amber-50 rounded p-2 border border-amber-200">
            <HelpCircle className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
            <p className="text-xs text-amber-800"><span className="font-medium">Resolution blocker:</span> {blocker}</p>
          </div>
        </div>
      )}
      <div className="px-3 pb-3 flex items-center gap-3">
        {hasRecording && (
          <a href={r.aircallRecordingUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
            onClick={(e) => e.stopPropagation()}>
            <Mic className="h-3 w-3" /> Listen to recording
          </a>
        )}
        {hasTranscript && (
          <button
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowTx(v => !v)}>
            <FileText className="h-3 w-3" />
            {showTx ? "Hide transcript" : "View full transcript"}
            {showTx ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        )}
      </div>
      {showTx && hasTranscript && (
        <div className="border-t px-3 py-3 bg-background/50">
          <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
            <FileText className="h-3 w-3" /> Voicemail Transcript
          </p>
          <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap font-mono bg-muted/40 rounded p-2">
            {r.rawTranscript}
          </p>
        </div>
      )}
    </div>
  );
}

function CallerHistoryDrawer({ phone, onClose }: { phone: string; onClose: () => void }) {
  const { data, isLoading } = trpc.calls.callerHistory.useQuery({ phone });
  const profile = data?.profile;
  const intakes = data?.intakeRecords ?? [];
  const calls = data?.calls ?? [];

  const answered = calls.filter((c) => c.status === "answered").length;
  const missed = calls.filter((c) => c.status === "missed").length;
  const voicemail = calls.filter((c) => c.status === "voicemail").length;

  const callerType = profile?.callerType ?? intakes[0]?.callerType ?? null;
  const ivrEligible = callerType && ["carrier", "law_office", "medical_provider"].includes(callerType);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-background border-l shadow-2xl overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-background z-10">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold text-base">
                {intakes[0]?.callerName ?? profile?.name ?? "Unknown Caller"}
              </h2>
              {callerTypeBadge(callerType)}
              {ivrEligible && (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                  <CheckCircle2 className="h-3 w-3" /> IVR Eligible
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 font-mono">{phone}</p>
            {(intakes[0]?.callerOrg || profile?.org) && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Building2 className="h-3 w-3" />
                {intakes[0]?.callerOrg ?? profile?.org}
              </p>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>
        ) : (
          <div className="p-4 space-y-5">
            {/* Call Stats Summary */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Total Calls", value: calls.length, color: "text-foreground" },
                { label: "Answered", value: answered, color: "text-green-600" },
                { label: "Missed", value: missed, color: "text-red-500" },
                { label: "Voicemail", value: voicemail, color: "text-orange-500" },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-muted/40 rounded-lg p-3 text-center">
                  <p className={`text-xl font-bold ${color}`}>{value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {/* IVR Routing Recommendation */}
            {ivrEligible && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-emerald-800">IVR Self-Service Candidate</p>
                  <p className="text-emerald-700 text-xs mt-0.5">
                    This {(callerType ?? "").replace(/_/g, " ")} has called {calls.length} times.
                    With IVR Option 1 (Press 1), they could submit intake without tying up a live agent.
                  </p>
                </div>
              </div>
            )}

            {/* Repeat caller warning */}
            {calls.length >= 3 && !ivrEligible && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-amber-800">Persistent Caller — {calls.length} calls</p>
                  <p className="text-amber-700 text-xs mt-0.5">
                    This caller has not reached resolution. Consider proactive outreach or claim escalation.
                  </p>
                </div>
              </div>
            )}

            {/* Intake Records with full transcript */}
            {intakes.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Voicemails & Intake Records ({intakes.length})
                </h3>
                <div className="space-y-2">
                  {intakes.map((r) => {
                    const hasTranscript = !!(r.rawTranscript && r.rawTranscript.trim().length > 0);
                    const hasRecording = !!(r.aircallRecordingUrl);
                    const blockerKeywords = [
                      { pattern: /unable to reach|no answer|not available|voicemail/i, label: "Handler unavailable" },
                      { pattern: /waiting|pending|follow.?up|call back/i, label: "Awaiting callback" },
                      { pattern: /wrong number|wrong department|transfer/i, label: "Misrouted" },
                      { pattern: /missing info|no claim|no file|not found/i, label: "Missing claim info" },
                    ];
                    const blocker = blockerKeywords.find(b => b.pattern.test(`${r.message ?? ""} ${r.notes ?? ""}`))?.label ?? null;
                    return (
                      <IntakeCardCT key={r.id} r={r} blocker={blocker} hasTranscript={hasTranscript} hasRecording={hasRecording} />
                    );
                  })}
                </div>
              </div>
            )}

            {/* No intake records note */}
            {intakes.length === 0 && calls.length > 0 && (
              <div className="bg-muted/30 rounded-lg p-3 flex items-start gap-2 text-sm">
                <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <p className="text-muted-foreground text-xs">
                  No voicemail intake records for this number. All {calls.length} call(s) were answered or missed without leaving a message.
                  {calls.filter(c => c.status === "answered").length > 0 && " Questions asked during answered calls are not captured without a voicemail."}
                </p>
              </div>
            )}

            {/* All Calls */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Call History ({calls.length})
              </h3>
              <div className="space-y-1.5">
                {calls.map((c) => (
                  <div key={c.id} className="flex items-center justify-between bg-muted/30 rounded px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        c.status === "answered" ? "bg-green-500" : c.status === "missed" ? "bg-red-500" : "bg-orange-500"
                      }`} />
                      <span className="capitalize text-muted-foreground">{c.status}</span>
                      {c.agentName && <span className="text-foreground font-medium">· {c.agentName}</span>}
                    </div>
                    <div className="flex items-center gap-3 text-muted-foreground">
                      {c.durationSeconds ? <span>{formatSeconds(c.durationSeconds)}</span> : null}
                      <span>{format(new Date(c.startedAt), "MMM d, h:mm a")}</span>
                      {c.voicemailUrl && (
                        <a href={c.voicemailUrl} target="_blank" rel="noopener noreferrer"
                          className="text-blue-500 hover:underline" onClick={(e) => e.stopPropagation()}>
                          <Voicemail className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
                {calls.length === 0 && (
                  <p className="text-xs text-muted-foreground py-2">No call records found.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CallTracking() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);

  const { data, isLoading } = trpc.calls.list.useQuery({
    status: statusFilter === "all" ? undefined : statusFilter,
    agentName: agentFilter === "all" ? undefined : agentFilter,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const { data: analytics } = trpc.calls.analytics.useQuery();

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

  const totalCalls = analytics?.byStatus?.reduce((sum: number, s: { count: number }) => sum + Number(s.count), 0) ?? 0;
  const answeredCount = analytics?.byStatus?.find((s: { status: string }) => s.status === "answered")?.count ?? 0;
  const missedCount = analytics?.byStatus?.find((s: { status: string }) => s.status === "missed")?.count ?? 0;
  const answerRate = totalCalls > 0 ? Math.round((Number(answeredCount) / totalCalls) * 100) : 0;

  const agents = Array.from(
    new Set(
      (analytics?.byAgent ?? [])
        .map((a: { agentName: string | null }) => a.agentName)
        .filter(Boolean)
    )
  ) as string[];

  return (
    <WhipLayout>
      {selectedPhone && (
        <CallerHistoryDrawer phone={selectedPhone} onClose={() => setSelectedPhone(null)} />
      )}
      <div className="p-6 space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-[#171b31]">Call Tracking</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            All inbound calls — answered, missed, and voicemail. Click any row to view full caller profile.
          </p>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#171b31]/10 flex items-center justify-center">
                  <PhoneIncoming className="w-4 h-4 text-[#171b31]" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-[#171b31]">{totalCalls.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">Total Calls</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center">
                  <PhoneCall className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-[#171b31]">{Number(answeredCount).toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">Answered</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center">
                  <PhoneMissed className="w-4 h-4 text-red-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-[#171b31]">{Number(missedCount).toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">Missed</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#ff6221]/10 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-[#ff6221]" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-[#171b31]">{answerRate}%</div>
                  <div className="text-xs text-muted-foreground">Answer Rate</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Agent performance table */}
        {analytics?.byAgent && analytics.byAgent.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground" />
                Agent Performance (Last 30 Days)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Agent</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Total</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Answered</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Missed</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Voicemail</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Avg Duration</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Answer Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {analytics.byAgent.map((agent: {
                      agentName: string | null;
                      total: number;
                      answered: number;
                      missed: number;
                      voicemail: number;
                      avgDuration: number;
                    }) => {
                      const rate = agent.total > 0 ? Math.round((Number(agent.answered) / Number(agent.total)) * 100) : 0;
                      return (
                        <tr key={agent.agentName ?? "unknown"} className="hover:bg-muted/20">
                          <td className="px-4 py-2.5 font-medium text-[#171b31]">
                            {agent.agentName || "Unassigned"}
                          </td>
                          <td className="px-4 py-2.5 text-right text-muted-foreground">{Number(agent.total).toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-right text-green-700">{Number(agent.answered).toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-right text-red-600">{Number(agent.missed).toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-right text-blue-600">{Number(agent.voicemail).toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-right text-muted-foreground">{formatSeconds(Math.round(Number(agent.avgDuration)))}</td>
                          <td className="px-4 py-2.5 text-right">
                            <span className={`font-medium ${rate >= 80 ? "text-green-600" : rate >= 60 ? "text-yellow-600" : "text-red-600"}`}>
                              {rate}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="answered">Answered</SelectItem>
              <SelectItem value="missed">Missed</SelectItem>
              <SelectItem value="voicemail">Voicemail</SelectItem>
              <SelectItem value="abandoned">Abandoned</SelectItem>
            </SelectContent>
          </Select>
          <Select value={agentFilter} onValueChange={(v) => { setAgentFilter(v); setPage(0); }}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Agent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Agents</SelectItem>
              {agents.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="text-sm text-muted-foreground self-center ml-auto">
            {data?.total ?? 0} calls · <span className="text-xs">Click any row to view caller profile</span>
          </div>
        </div>

        {/* Call log table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Loading call history...</div>
            ) : data?.calls.length === 0 ? (
              <div className="p-12 text-center">
                <PhoneIncoming className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">No calls found.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Caller</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Status</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Agent</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Duration</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Date &amp; Time</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Type</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Intake</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {data?.calls.map((call) => {
                        const statusCfg = STATUS_CONFIG[call.status] ?? STATUS_CONFIG.missed;
                        const StatusIcon = statusCfg.icon;
                        const hasPhone = !!(call.callerPhone);
                        return (
                          <tr
                            key={call.id}
                            className={`hover:bg-muted/20 transition-colors ${hasPhone ? "cursor-pointer" : ""}`}
                            onClick={() => hasPhone && setSelectedPhone(call.callerPhone!)}
                          >
                            <td className="px-4 py-3">
                              <div>
                                <div className="font-medium text-[#171b31]">
                                  {call.callerName || call.callerPhone || "Unknown"}
                                </div>
                                {call.callerPhone && call.callerName && (
                                  <div className="text-xs text-muted-foreground font-mono">{call.callerPhone}</div>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className={`text-xs gap-1 ${statusCfg.className}`}>
                                <StatusIcon className="w-3 h-3" />
                                {statusCfg.label}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">
                              {call.agentName || "—"}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">
                              {formatSeconds(call.durationSeconds ?? 0)}
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                              {format(new Date(call.startedAt), "MMM d, h:mm a")}
                            </td>
                            <td className="px-4 py-3">
                              {(call as { callerType?: string | null }).callerType
                                ? callerTypeBadge((call as { callerType?: string | null }).callerType)
                                : <span className="text-xs text-muted-foreground">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              {call.hasIntakeRecord ? (
                                <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                                  ✓ Intake
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0}
                      className="gap-1"
                    >
                      <ChevronLeft className="w-4 h-4" /> Prev
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Page {page + 1} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                      className="gap-1"
                    >
                      Next <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </WhipLayout>
  );
}
