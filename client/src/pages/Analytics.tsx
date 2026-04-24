import { useState } from "react";
import WhipLayout from "@/components/WhipLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line,
} from "recharts";
import {
  PhoneCall,
  PhoneMissed,
  Voicemail,
  TrendingUp,
  Users,
  RotateCcw,
  ChevronRight,
  X,
  Clock,
  Phone,
  Building2,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Info,
} from "lucide-react";
import { format, parseISO } from "date-fns";

function fmtDuration(seconds: number | null | undefined): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
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

function ivrRoutingBadge(type: string | null | undefined) {
  const ivrEligible = ["carrier", "law_office", "medical_provider"];
  if (type && ivrEligible.includes(type)) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
        <CheckCircle2 className="h-3 w-3" /> IVR Eligible
      </span>
    );
  }
  return null;
}

function CallerHistoryDrawer({ phone, onClose }: { phone: string; onClose: () => void }) {
  const { data, isLoading } = trpc.calls.callerHistory.useQuery({ phone });
  const profile = data?.profile;
  const intakes = data?.intakeRecords ?? [];
  const calls = data?.calls ?? [];

  const answered = calls.filter((c) => c.status === "answered").length;
  const missed = calls.filter((c) => c.status === "missed").length;
  const voicemail = calls.filter((c) => c.status === "voicemail").length;

  // Determine IVR eligibility
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
              {ivrRoutingBadge(callerType)}
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
                    With IVR Option C, they could submit intake without tying up a live agent.
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

            {/* Intake Records */}
            {intakes.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Intake Records ({intakes.length})
                </h3>
                <div className="space-y-2">
                  {intakes.map((r) => (
                    <div key={r.id} className="bg-muted/40 rounded-lg p-3 text-sm border">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">
                            {r.callerName ?? "Unknown"}{r.callerOrg ? ` · ${r.callerOrg}` : ""}
                          </span>
                          {r.whipClaimNumber && (
                            <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5">
                              Claim: {r.whipClaimNumber}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={
                            r.status === "open"
                              ? "text-orange-600 border-orange-200 bg-orange-50"
                              : "text-green-600 border-green-200 bg-green-50"
                          }>{r.status}</Badge>
                          {r.snapsheetClaimUrl && (
                            <a href={r.snapsheetClaimUrl} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:underline flex items-center gap-0.5"
                              onClick={(e) => e.stopPropagation()}>
                              Snapsheet <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </div>
                      {r.message && (
                        <p className="text-xs text-muted-foreground line-clamp-3 bg-background/60 rounded p-2 mt-1">
                          {r.message}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1.5">
                        {format(new Date(r.createdAt), "MMM d, yyyy h:mm a")}
                        {r.handlerName ? ` · Handler: ${r.handlerName}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* No intake records note */}
            {intakes.length === 0 && calls.length > 0 && (
              <div className="bg-muted/30 rounded-lg p-3 flex items-start gap-2 text-sm">
                <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <p className="text-muted-foreground text-xs">
                  No voicemail intake records for this number. All {calls.length} calls were answered or missed without leaving a message.
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
                      {c.durationSeconds ? <span>{fmtDuration(c.durationSeconds)}</span> : null}
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

export default function Analytics() {
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const { data: full, isLoading } = trpc.calls.fullAnalytics.useQuery();
  const { data: intakeAnalytics } = trpc.intake.analytics.useQuery();
  const { data: repeatCallers } = trpc.callers.repeats.useQuery();

  const totalCalls = full?.totals.reduce((s, r) => s + Number(r.count), 0) ?? 0;
  const answered = full?.totals.find((r) => r.status === "answered");
  const missed = full?.totals.find((r) => r.status === "missed");
  const voicemailCount = full?.totals.find((r) => r.status === "voicemail");
  const answerRate = totalCalls > 0
    ? Math.round((Number(answered?.count ?? 0) / totalCalls) * 100)
    : 0;

  const dayData = (full?.byDay ?? []).map((d) => ({
    day: d.day ? format(parseISO(d.day), "MMM d") : "",
    Answered: Number(d.answered),
    Missed: Number(d.missed),
    Voicemail: Number(d.voicemail),
  }));

  const agentData = (full?.byAgent ?? [])
    .filter((a) => a.agentName)
    .map((a) => ({
      fullName: a.agentName ?? "",
      Answered: Number(a.answered),
      Missed: Number(a.missed),
      Voicemail: Number(a.voicemail),
      total: Number(a.total),
      avgDuration: Number(a.avgDurationSeconds ?? 0),
      answerRate: Number(a.total) > 0
        ? Math.round((Number(a.answered) / Number(a.total)) * 100)
        : 0,
    }))
    .sort((a, b) => b.total - a.total);

  // Caller type breakdown
  const callerTypeData = (full?.byCallerType ?? []).map((ct) => ({
    type: ct.callerType ?? "Unknown",
    label: (ct.callerType ?? "Unknown").replace(/_/g, " "),
    total: Number(ct.total),
    answered: Number(ct.answered),
    missed: Number(ct.missed),
    voicemail: Number(ct.voicemail),
    ivrEligible: ct.callerType && ["carrier", "law_office", "medical_provider"].includes(ct.callerType),
  }));

  const ivrEligibleTotal = callerTypeData
    .filter((ct) => ct.ivrEligible)
    .reduce((s, ct) => s + ct.total, 0);

  // Trend data — use byDay for the line chart showing repeat callers
  const trendData = (full?.byMonth ?? []).map((d) => ({
    day: d.week ? format(parseISO(d.week), "MMM d") : "",
    Total: Number(d.total),
    Answered: Number(d.answered),
    Missed: Number(d.missed),
    Voicemail: Number(d.voicemail),
  }));

  // Repeat callers enriched
  const enrichedRepeats = (repeatCallers ?? []).filter((c) => c.totalCalls >= 3);

  if (isLoading) {
    return (
      <WhipLayout>
        <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
          Loading analytics…
        </div>
      </WhipLayout>
    );
  }

  return (
    <WhipLayout>
      {selectedPhone && (
        <CallerHistoryDrawer phone={selectedPhone} onClose={() => setSelectedPhone(null)} />
      )}
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">
            All {totalCalls.toLocaleString()} inbound &amp; outbound calls — April 2026
          </p>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Calls", value: totalCalls.toLocaleString(), icon: Phone, color: "text-blue-600" },
            { label: "Answered", value: Number(answered?.count ?? 0).toLocaleString(), icon: PhoneCall, color: "text-green-600" },
            { label: "Missed", value: Number(missed?.count ?? 0).toLocaleString(), icon: PhoneMissed, color: "text-red-500" },
            { label: "Answer Rate", value: `${answerRate}%`, icon: TrendingUp, color: "text-orange-500" },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label}>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg bg-muted/60 ${color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{value}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* IVR Opportunity Banner */}
        {ivrEligibleTotal > 0 && (
          <Card className="border-emerald-200 bg-emerald-50/50">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-emerald-800 text-sm">
                    IVR Self-Service Opportunity: {ivrEligibleTotal.toLocaleString()} calls ({Math.round(ivrEligibleTotal / totalCalls * 100)}% of volume)
                  </p>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    Carriers, law offices, and medical providers are IVR-eligible — they can submit intake via Aircall Option C without a live agent.
                    Routing these calls to IVR could free up significant agent capacity month over month.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Caller Type Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Building2 className="h-4 w-4" />Caller Type Breakdown — Who's Calling &amp; How They Were Handled
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    {["Caller Type", "Total", "Answered", "Missed", "Voicemail", "Answer Rate", "IVR Eligible"].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {callerTypeData.map((ct) => (
                    <tr key={ct.type} className="border-b hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          {callerTypeBadge(ct.type === "Unknown" ? null : ct.type)}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-semibold">{ct.total.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-green-600 font-medium">{ct.answered.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-red-500">{ct.missed.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-orange-500">{ct.voicemail.toLocaleString()}</td>
                      <td className="px-4 py-2.5">
                        <span className={`font-semibold ${
                          ct.total > 0 && Math.round(ct.answered / ct.total * 100) >= 80
                            ? "text-green-600"
                            : ct.total > 0 && Math.round(ct.answered / ct.total * 100) >= 60
                            ? "text-yellow-600"
                            : "text-red-500"
                        }`}>
                          {ct.total > 0 ? `${Math.round(ct.answered / ct.total * 100)}%` : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {ct.ivrEligible ? (
                          <span className="text-xs text-emerald-700 font-medium">✓ Yes</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Daily Volume Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Daily Call Volume — April 2026</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dayData} barSize={8}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} interval={2} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Answered" fill="#22c55e" stackId="a" />
                <Bar dataKey="Missed" fill="#ef4444" stackId="a" />
                <Bar dataKey="Voicemail" fill="#f97316" stackId="a" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Answer Rate Trend */}
        {trendData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />Answer Rate Trend — April 2026
                <span className="ml-auto text-xs font-normal text-muted-foreground">
                  Goal: Track this going down as IVR handles more volume
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} interval={2} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="Answered" stroke="#22c55e" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Missed" stroke="#ef4444" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Voicemail" stroke="#f97316" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Repeat Callers Intelligence Panel */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <RotateCcw className="h-4 w-4" />Repeat Callers Intelligence — 3+ Calls
              <span className="ml-auto text-xs font-normal text-muted-foreground">Click any row for full profile</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    {["Caller", "Organization", "Claim", "Type", "Calls", "Last Call", "IVR", ""].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {enrichedRepeats.map((c) => {
                    const name = c.intake?.callerName ?? c.name ?? null;
                    const org = c.intake?.callerOrg ?? c.org ?? null;
                    const claim = c.intake?.whipClaimNumber ?? null;
                    const type = c.callerType ?? c.intake?.callerType ?? null;
                    return (
                      <tr key={c.phone} className="border-b hover:bg-muted/20 transition-colors cursor-pointer"
                        onClick={() => setSelectedPhone(c.phone)}>
                        <td className="px-4 py-2.5">
                          <div>
                            <p className="font-medium">{name ?? "Unknown"}</p>
                            <p className="text-xs font-mono text-muted-foreground">{c.phone}</p>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-sm text-muted-foreground">
                          {org ? (
                            <span className="flex items-center gap-1">
                              <Building2 className="h-3 w-3 flex-shrink-0" />{org}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-2.5">
                          {claim ? (
                            <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5">
                              {claim}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-2.5">{callerTypeBadge(type)}</td>
                        <td className="px-4 py-2.5 font-semibold">{Number(c.totalCalls)}</td>
                        <td className="px-4 py-2.5 text-muted-foreground text-xs">
                          {c.lastCallAt ? format(new Date(c.lastCallAt), "MMM d, h:mm a") : "—"}
                        </td>
                        <td className="px-4 py-2.5">{ivrRoutingBadge(type)}</td>
                        <td className="px-4 py-2.5"><ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /></td>
                      </tr>
                    );
                  })}
                  {enrichedRepeats.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground text-xs">No repeat callers found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Persistent Callers — Called 3+ Times */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4" />Persistent Callers — Called 3+ Times Without Resolution
              <span className="ml-auto text-xs font-normal text-muted-foreground">Click to view call history</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    {["Phone", "Total", "Answered", "Missed", "Voicemail", "Last Call", ""].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(full?.callbackPatterns ?? []).map((c) => (
                    <tr key={c.callerPhone} className="border-b hover:bg-muted/20 transition-colors cursor-pointer"
                      onClick={() => c.callerPhone && setSelectedPhone(c.callerPhone)}>
                      <td className="px-4 py-2.5 font-mono text-xs">{c.callerPhone ?? "Unknown"}</td>
                      <td className="px-4 py-2.5 font-semibold">{Number(c.totalCalls)}</td>
                      <td className="px-4 py-2.5 text-green-600">{Number(c.answeredCalls)}</td>
                      <td className="px-4 py-2.5 text-red-500">{Number(c.missedCalls)}</td>
                      <td className="px-4 py-2.5 text-orange-500">{Number(c.voicemailCalls)}</td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">
                        {c.lastCallAt ? format(new Date(c.lastCallAt as string), "MMM d, h:mm a") : "—"}
                      </td>
                      <td className="px-4 py-2.5"><ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /></td>
                    </tr>
                  ))}
                  {(!full?.callbackPatterns || full.callbackPatterns.length === 0) && (
                    <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground text-xs">No persistent callers found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Agent Performance Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4" />Agent Performance — April 2026
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    {["Agent", "Total", "Answered", "Missed", "Voicemail", "Avg Duration", "Answer Rate"].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {agentData.map((a) => (
                    <tr key={a.fullName} className="border-b hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5 font-medium">{a.fullName}</td>
                      <td className="px-4 py-2.5">{a.total.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-green-600 font-medium">{a.Answered.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-red-500">{a.Missed.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-orange-500">{a.Voicemail.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{fmtDuration(a.avgDuration)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`font-semibold ${
                          a.answerRate >= 90 ? "text-green-600" : a.answerRate >= 75 ? "text-yellow-600" : "text-red-500"
                        }`}>{a.answerRate}%</span>
                      </td>
                    </tr>
                  ))}
                  {agentData.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground text-xs">No agent data found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Voicemail Intake by Caller Type */}
        {intakeAnalytics && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Voicemail className="h-4 w-4" />Voicemail Intake by Caller Type
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {intakeAnalytics.byCallerType.map((ct) => (
                  <div key={ct.callerType ?? "unknown"} className="bg-muted/40 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold">{Number(ct.count)}</p>
                    <p className="text-xs text-muted-foreground capitalize mt-0.5">
                      {(ct.callerType ?? "unknown").replace(/_/g, " ")}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </WhipLayout>
  );
}
