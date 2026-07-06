import { useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import {
  Download, Play, Save, Trash2, BookOpen, BarChart2, Phone, Users,
  PhoneIncoming, RefreshCw, ChevronDown, ChevronUp,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type ReportType = "call_volume" | "caller_type" | "handler_performance" | "intake_status" | "callback_outcomes" | "member_billing";
type GroupBy = "day" | "week" | "month";
type Direction = "inbound" | "outbound" | "both";

interface ReportConfig {
  reportType: ReportType;
  dateFrom?: string;
  dateTo?: string;
  groupBy: GroupBy;
  callerType?: string;
  handlerName?: string;
  direction: Direction;
}

const REPORT_TYPES: { value: ReportType; label: string; icon: React.ReactNode; description: string }[] = [
  { value: "call_volume", label: "Call Volume", icon: <Phone className="w-4 h-4" />, description: "Inbound/outbound counts, answer rate, avg duration by period" },
  { value: "caller_type", label: "Caller Type Breakdown", icon: <Users className="w-4 h-4" />, description: "Distribution of calls by caller type with avg duration" },
  { value: "handler_performance", label: "Handler Performance", icon: <BarChart2 className="w-4 h-4" />, description: "Per-handler call counts, answer rate, avg handle time" },
  { value: "intake_status", label: "Intake Status", icon: <PhoneIncoming className="w-4 h-4" />, description: "Open/closed/escalated intake breakdown by type and handler" },
  { value: "callback_outcomes", label: "Callback Outcomes", icon: <RefreshCw className="w-4 h-4" />, description: "Reached, voicemail, no-answer callback disposition rates" },
  { value: "member_billing", label: "Member Billing / Deductible", icon: <BookOpen className="w-4 h-4" />, description: "Member calls mentioning billing, deductible, or payment issues" },
];

const CALLER_TYPES = ["carrier", "law_office", "medical_provider", "member", "claimant", "police", "unknown"];
const PIE_COLORS = ["#ff6221", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#6b7280"];

// ─── Column label map ─────────────────────────────────────────────────────────

const COL_LABELS: Record<string, string> = {
  period: "Period", total: "Total", inbound: "Inbound", outbound: "Outbound",
  answered: "Answered", missed: "Missed", voicemail: "Voicemail",
  avg_duration_min: "Avg Duration (min)", answer_rate_pct: "Answer Rate %",
  caller_type: "Caller Type", pct_of_total: "% of Total",
  handler: "Handler", total_calls: "Total Calls", inbound_answered: "IB Answered",
  caller_type_label: "Caller Type", open_count: "Open", closed_count: "Closed",
  escalated_count: "Escalated", urgent_count: "Urgent",
  disposition: "Disposition", count: "Count", pct: "% of Total",
  reach_rate: "Reach Rate %", total_inbound: "Total Inbound",
  member_inbound_calls: "Member Inbound", member_pct_of_inbound: "Member %",
  total_member_intakes: "Member Intakes", billing_related: "Billing Related",
  billing_pct: "Billing %", other_member_intakes: "Other Member",
};

function colLabel(col: string) {
  return COL_LABELS[col] ?? col.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportCsv(rows: any[], columns: string[], filename: string) {
  const header = columns.map(colLabel).join(",");
  const body = rows.map((r) => columns.map((c) => JSON.stringify(r[c] ?? "")).join(",")).join("\n");
  const blob = new Blob([header + "\n" + body], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Chart selector ───────────────────────────────────────────────────────────

function ReportChart({ reportType, rows }: { reportType: ReportType; rows: any[] }) {
  if (!rows.length) return null;

  if (reportType === "call_volume") {
    return (
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2540" />
          <XAxis dataKey="period" tick={{ fill: "#9ca3af", fontSize: 11 }} />
          <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
          <Tooltip contentStyle={{ background: "#0f1220", border: "1px solid #1e2540", color: "#fff" }} />
          <Legend />
          <Bar dataKey="inbound" fill="#ff6221" name="Inbound" radius={[3,3,0,0]} />
          <Bar dataKey="outbound" fill="#3b82f6" name="Outbound" radius={[3,3,0,0]} />
          <Bar dataKey="missed" fill="#ef4444" name="Missed" radius={[3,3,0,0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (reportType === "caller_type") {
    return (
      <div className="flex gap-4">
        <div className="flex-1">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={rows} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2540" />
              <XAxis type="number" tick={{ fill: "#9ca3af", fontSize: 11 }} />
              <YAxis dataKey="caller_type" type="category" tick={{ fill: "#9ca3af", fontSize: 11 }} width={110} />
              <Tooltip contentStyle={{ background: "#0f1220", border: "1px solid #1e2540", color: "#fff" }} />
              <Bar dataKey="total" fill="#ff6221" name="Total Calls" radius={[0,3,3,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="w-48">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={rows} dataKey="total" nameKey="caller_type" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                {rows.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "#0f1220", border: "1px solid #1e2540", color: "#fff" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  if (reportType === "handler_performance") {
    return (
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2540" />
          <XAxis dataKey="handler" tick={{ fill: "#9ca3af", fontSize: 10 }} />
          <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
          <Tooltip contentStyle={{ background: "#0f1220", border: "1px solid #1e2540", color: "#fff" }} />
          <Legend />
          <Bar dataKey="total_calls" fill="#ff6221" name="Total Calls" radius={[3,3,0,0]} />
          <Bar dataKey="inbound_answered" fill="#10b981" name="IB Answered" radius={[3,3,0,0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (reportType === "callback_outcomes") {
    const byDisposition = rows.reduce((acc: Record<string, number>, r: any) => {
      acc[r.disposition] = (acc[r.disposition] || 0) + Number(r.count);
      return acc;
    }, {});
    const pieData = Object.entries(byDisposition).map(([name, value]) => ({ name, value }));
    return (
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
            {pieData.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
          </Pie>
          <Tooltip contentStyle={{ background: "#0f1220", border: "1px solid #1e2540", color: "#fff" }} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (reportType === "member_billing") {
    return (
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2540" />
          <XAxis dataKey="period" tick={{ fill: "#9ca3af", fontSize: 11 }} />
          <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
          <Tooltip contentStyle={{ background: "#0f1220", border: "1px solid #1e2540", color: "#fff" }} />
          <Legend />
          <Bar dataKey="total_member_intakes" fill="#3b82f6" name="Member Intakes" radius={[3,3,0,0]} />
          <Bar dataKey="billing_related" fill="#ff6221" name="Billing Related" radius={[3,3,0,0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // intake_status — line chart
  const periods = Array.from(new Set(rows.map((r: any) => r.period as string))).sort();
  const lineData = periods.map((p) => {
    const periodRows = rows.filter((r: any) => r.period === p);
    return {
      period: p,
      open: periodRows.reduce((s: number, r: any) => s + Number(r.open_count), 0),
      closed: periodRows.reduce((s: number, r: any) => s + Number(r.closed_count), 0),
      escalated: periodRows.reduce((s: number, r: any) => s + Number(r.escalated_count), 0),
    };
  });
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={lineData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e2540" />
        <XAxis dataKey="period" tick={{ fill: "#9ca3af", fontSize: 11 }} />
        <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
        <Tooltip contentStyle={{ background: "#0f1220", border: "1px solid #1e2540", color: "#fff" }} />
        <Legend />
        <Line type="monotone" dataKey="open" stroke="#f59e0b" name="Open" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="closed" stroke="#10b981" name="Closed" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="escalated" stroke="#ef4444" name="Escalated" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Summary cards ────────────────────────────────────────────────────────────

function SummaryCards({ summary, reportType }: { summary: any; reportType: ReportType }) {
  if (!summary) return null;
  const cards: { label: string; value: string | number }[] = [];

  if (reportType === "call_volume") {
    cards.push(
      { label: "Total Calls", value: summary.totalCalls?.toLocaleString() ?? "—" },
      { label: "Inbound", value: summary.totalInbound?.toLocaleString() ?? "—" },
      { label: "Outbound", value: summary.totalOutbound?.toLocaleString() ?? "—" },
      { label: "Answered", value: summary.totalAnswered?.toLocaleString() ?? "—" },
      { label: "Missed", value: summary.totalMissed?.toLocaleString() ?? "—" },
    );
  } else if (reportType === "caller_type") {
    cards.push({ label: "Total Calls", value: summary.totalCalls?.toLocaleString() ?? "—" });
  } else if (reportType === "handler_performance") {
    cards.push({ label: "Handlers", value: summary.handlerCount ?? "—" });
  } else if (reportType === "intake_status") {
    cards.push(
      { label: "Total Intakes", value: summary.totalIntakes?.toLocaleString() ?? "—" },
      { label: "Open", value: summary.totalOpen?.toLocaleString() ?? "—" },
      { label: "Closed", value: summary.totalClosed?.toLocaleString() ?? "—" },
    );
  } else if (reportType === "callback_outcomes") {
    cards.push(
      { label: "Total Callbacks", value: summary.total?.toLocaleString() ?? "—" },
      { label: "Reached", value: summary.reached?.toLocaleString() ?? "—" },
      { label: "Reach Rate", value: `${summary.reachRate ?? 0}%` },
    );
  } else if (reportType === "member_billing") {
    cards.push(
      { label: "Member Intakes", value: summary.totalMemberIntakes?.toLocaleString() ?? "—" },
      { label: "Billing Related", value: summary.totalBillingRelated?.toLocaleString() ?? "—" },
      { label: "Billing %", value: `${summary.overallBillingPct ?? 0}%` },
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
      {cards.map((c) => (
        <div key={c.label} className="bg-[#0f1220] border border-white/10 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-white">{c.value}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">{c.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Reports() {
  const today = new Date().toISOString().slice(0, 10);
  const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [config, setConfig] = useState<ReportConfig>({
    reportType: "call_volume",
    dateFrom: threeMonthsAgo,
    dateTo: today,
    groupBy: "month",
    direction: "both",
  });
  const [runConfig, setRunConfig] = useState<ReportConfig | null>(null);
  const [showTable, setShowTable] = useState(true);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveDesc, setSaveDesc] = useState("");

  const { data: result, isLoading, error } = trpc.reports.run.useQuery(
    runConfig as ReportConfig,
    { enabled: !!runConfig }
  );

  const { data: savedList, refetch: refetchSaved } = trpc.reports.listSaved.useQuery();
  const savePreset = trpc.reports.savePreset.useMutation({ onSuccess: () => { refetchSaved(); setSaveDialogOpen(false); setSaveName(""); setSaveDesc(""); toast.success("Report saved"); } });
  const deletePreset = trpc.reports.deletePreset.useMutation({ onSuccess: () => { refetchSaved(); toast.success("Report deleted"); } });

  const handleRun = useCallback(() => setRunConfig({ ...config }), [config]);

  const handleLoadPreset = useCallback((preset: any) => {
    const c = preset.config as ReportConfig;
    setConfig(c);
    setRunConfig(c);
  }, []);

  const handleExport = useCallback(() => {
    if (!result) return;
    exportCsv(result.rows, result.columns, `whip-report-${config.reportType}-${today}.csv`);
  }, [result, config.reportType, today]);

  const selectedType = useMemo(() => REPORT_TYPES.find((t) => t.value === config.reportType), [config.reportType]);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Custom Reports</h1>
            <p className="text-sm text-gray-400 mt-0.5">Build and export reports from all available call and intake data</p>
          </div>
          {result && (
            <Button onClick={handleExport} variant="outline" size="sm" className="gap-2 border-white/20 text-white hover:bg-white/10">
              <Download className="w-4 h-4" /> Export CSV
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* ── Builder panel ── */}
          <div className="lg:col-span-1 space-y-4">
            <Card className="bg-[#0f1220] border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-white">Report Builder</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Report type */}
                <div>
                  <Label className="text-xs text-gray-400 mb-1.5 block">Report Type</Label>
                  <div className="space-y-1.5">
                    {REPORT_TYPES.map((t) => (
                      <button
                        key={t.value}
                        onClick={() => setConfig((c) => ({ ...c, reportType: t.value }))}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center gap-2 transition-colors ${
                          config.reportType === t.value
                            ? "bg-[#ff6221]/20 text-[#ff6221] border border-[#ff6221]/40"
                            : "text-gray-300 hover:bg-white/5 border border-transparent"
                        }`}
                      >
                        {t.icon}
                        <span className="font-medium">{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <Separator className="bg-white/10" />

                {/* Date range */}
                <div>
                  <Label className="text-xs text-gray-400 mb-1.5 block">Date Range</Label>
                  <div className="space-y-2">
                    <Input type="date" value={config.dateFrom ?? ""} onChange={(e) => setConfig((c) => ({ ...c, dateFrom: e.target.value }))} className="h-8 text-xs bg-white/5 border-white/20 text-white" />
                    <Input type="date" value={config.dateTo ?? ""} onChange={(e) => setConfig((c) => ({ ...c, dateTo: e.target.value }))} className="h-8 text-xs bg-white/5 border-white/20 text-white" />
                  </div>
                </div>

                {/* Group by */}
                <div>
                  <Label className="text-xs text-gray-400 mb-1.5 block">Group By</Label>
                  <Select value={config.groupBy} onValueChange={(v) => setConfig((c) => ({ ...c, groupBy: v as GroupBy }))}>
                    <SelectTrigger className="h-8 text-xs bg-white/5 border-white/20 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="day">Day</SelectItem>
                      <SelectItem value="week">Week</SelectItem>
                      <SelectItem value="month">Month</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Direction */}
                <div>
                  <Label className="text-xs text-gray-400 mb-1.5 block">Direction</Label>
                  <Select value={config.direction} onValueChange={(v) => setConfig((c) => ({ ...c, direction: v as Direction }))}>
                    <SelectTrigger className="h-8 text-xs bg-white/5 border-white/20 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="both">Both</SelectItem>
                      <SelectItem value="inbound">Inbound Only</SelectItem>
                      <SelectItem value="outbound">Outbound Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Caller type filter */}
                <div>
                  <Label className="text-xs text-gray-400 mb-1.5 block">Caller Type Filter</Label>
                  <Select value={config.callerType ?? "all"} onValueChange={(v) => setConfig((c) => ({ ...c, callerType: v === "all" ? undefined : v }))}>
                    <SelectTrigger className="h-8 text-xs bg-white/5 border-white/20 text-white">
                      <SelectValue placeholder="All types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      {CALLER_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <Button onClick={handleRun} className="w-full bg-[#ff6221] hover:bg-[#e5561d] text-white gap-2">
                  <Play className="w-4 h-4" /> Run Report
                </Button>

                <Button
                  onClick={() => { setSaveName(selectedType?.label ?? ""); setSaveDialogOpen(true); }}
                  variant="outline"
                  size="sm"
                  className="w-full gap-2 border-white/20 text-white hover:bg-white/10"
                >
                  <Save className="w-4 h-4" /> Save as Preset
                </Button>
              </CardContent>
            </Card>

            {/* Saved presets */}
            {savedList && savedList.length > 0 && (
              <Card className="bg-[#0f1220] border-white/10">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-gray-400">Saved Presets</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {savedList.map((p: any) => (
                    <div key={p.id} className="flex items-center gap-1">
                      <button
                        onClick={() => handleLoadPreset(p)}
                        className="flex-1 text-left text-xs text-gray-300 hover:text-white px-2 py-1.5 rounded hover:bg-white/5 truncate"
                      >
                        {p.name}
                      </button>
                      <button onClick={() => deletePreset.mutate({ id: p.id })} className="text-gray-600 hover:text-red-400 p-1">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* ── Results panel ── */}
          <div className="lg:col-span-3 space-y-4">
            {!runConfig && (
              <Card className="bg-[#0f1220] border-white/10">
                <CardContent className="py-16 text-center">
                  <BarChart2 className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-400 text-sm">Select a report type and click <strong className="text-white">Run Report</strong> to see results.</p>
                  <p className="text-gray-600 text-xs mt-1">All data is pulled live from the Aircall sync database.</p>
                </CardContent>
              </Card>
            )}

            {isLoading && (
              <Card className="bg-[#0f1220] border-white/10">
                <CardContent className="py-16 text-center">
                  <RefreshCw className="w-8 h-8 text-[#ff6221] mx-auto mb-3 animate-spin" />
                  <p className="text-gray-400 text-sm">Running report…</p>
                </CardContent>
              </Card>
            )}

            {error && (
              <Card className="bg-[#0f1220] border-red-500/30">
                <CardContent className="py-8 text-center">
                  <p className="text-red-400 text-sm">{error.message}</p>
                </CardContent>
              </Card>
            )}

            {result && !isLoading && (
              <>
                {/* Report title */}
                <div className="flex items-center gap-3">
                  <div className="text-[#ff6221]">{selectedType?.icon}</div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">{selectedType?.label}</h2>
                    <p className="text-xs text-gray-400">{selectedType?.description}</p>
                  </div>
                  {runConfig?.dateFrom && (
                    <Badge variant="outline" className="ml-auto border-white/20 text-gray-400 text-xs">
                      {runConfig.dateFrom} → {runConfig.dateTo}
                    </Badge>
                  )}
                </div>

                {/* Summary KPIs */}
                <SummaryCards summary={result.summary} reportType={runConfig!.reportType} />

                {/* Chart */}
                <Card className="bg-[#0f1220] border-white/10">
                  <CardContent className="pt-4">
                    <ReportChart reportType={runConfig!.reportType} rows={result.rows} />
                  </CardContent>
                </Card>

                {/* Data table */}
                <Card className="bg-[#0f1220] border-white/10">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-sm text-white">Data Table</CardTitle>
                    <button onClick={() => setShowTable((v) => !v)} className="text-gray-400 hover:text-white">
                      {showTable ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </CardHeader>
                  {showTable && (
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-white/10">
                              {result.columns.map((col: string) => (
                                <th key={col} className="px-4 py-2 text-left text-gray-400 font-medium whitespace-nowrap">{colLabel(col)}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {result.rows.map((row: any, i: number) => (
                              <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                {result.columns.map((col: string) => (
                                  <td key={col} className="px-4 py-2 text-gray-200 whitespace-nowrap">
                                    {row[col] != null ? String(row[col]) : "—"}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {result.rows.length === 0 && (
                          <p className="text-center text-gray-500 text-xs py-8">No data for the selected filters.</p>
                        )}
                      </div>
                    </CardContent>
                  )}
                </Card>
              </>
            )}
          </div>
        </div>

        {/* Save dialog */}
        {saveDialogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-[#0f1220] border border-white/20 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
              <h3 className="text-white font-semibold mb-4">Save Report Preset</h3>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-gray-400 mb-1 block">Name</Label>
                  <Input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="e.g. Monthly Call Volume" className="bg-white/5 border-white/20 text-white" />
                </div>
                <div>
                  <Label className="text-xs text-gray-400 mb-1 block">Description (optional)</Label>
                  <Input value={saveDesc} onChange={(e) => setSaveDesc(e.target.value)} placeholder="Short description…" className="bg-white/5 border-white/20 text-white" />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button
                  onClick={() => savePreset.mutate({ name: saveName, description: saveDesc || undefined, config })}
                  disabled={!saveName.trim() || savePreset.isPending}
                  className="flex-1 bg-[#ff6221] hover:bg-[#e5561d] text-white"
                >
                  {savePreset.isPending ? "Saving…" : "Save"}
                </Button>
                <Button variant="outline" onClick={() => setSaveDialogOpen(false)} className="border-white/20 text-white hover:bg-white/10">Cancel</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
