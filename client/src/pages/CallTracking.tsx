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
} from "lucide-react";
import { format, formatDuration, intervalToDuration } from "date-fns";

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

export default function CallTracking() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [page, setPage] = useState(0);

  const { data, isLoading } = trpc.calls.list.useQuery({
    status: statusFilter === "all" ? undefined : statusFilter,
    agentName: agentFilter === "all" ? undefined : agentFilter,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const { data: analytics } = trpc.calls.analytics.useQuery();

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

  // Compute summary from analytics
  const totalCalls = analytics?.byStatus?.reduce((sum: number, s: { count: number }) => sum + Number(s.count), 0) ?? 0;
  const answeredCount = analytics?.byStatus?.find((s: { status: string }) => s.status === "answered")?.count ?? 0;
  const missedCount = analytics?.byStatus?.find((s: { status: string }) => s.status === "missed")?.count ?? 0;
  const voicemailCount = analytics?.byStatus?.find((s: { status: string }) => s.status === "voicemail")?.count ?? 0;
  const answerRate = totalCalls > 0 ? Math.round((Number(answeredCount) / totalCalls) * 100) : 0;

  // Get unique agents for filter
  const agents = Array.from(
    new Set(
      (analytics?.byAgent ?? [])
        .map((a: { agentName: string | null }) => a.agentName)
        .filter(Boolean)
    )
  ) as string[];

  return (
    <WhipLayout>
      <div className="p-6 space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-[#171b31]">Call Tracking</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            All inbound calls — answered, missed, and voicemail (last 30 days)
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
            {data?.total ?? 0} calls
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
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Date & Time</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Intake</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {data?.calls.map((call) => {
                        const statusCfg = STATUS_CONFIG[call.status] ?? STATUS_CONFIG.missed;
                        const StatusIcon = statusCfg.icon;
                        return (
                          <tr key={call.id} className="hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3">
                              <div>
                                <div className="font-medium text-[#171b31]">
                                  {call.callerName || call.callerPhone || "Unknown"}
                                </div>
                                {call.callerPhone && call.callerName && (
                                  <div className="text-xs text-muted-foreground">{call.callerPhone}</div>
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
