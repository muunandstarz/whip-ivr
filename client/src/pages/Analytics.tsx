import WhipLayout from "@/components/WhipLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Building2, Scale, Stethoscope, User, HelpCircle, PhoneCall, TrendingUp } from "lucide-react";
import { format, parseISO } from "date-fns";

const CALLER_TYPE_COLORS: Record<string, string> = {
  carrier: "#3b82f6",
  law_office: "#8b5cf6",
  medical_provider: "#10b981",
  member: "#f97316",
  claimant: "#eab308",
  police: "#ef4444",
  wrong_department: "#9ca3af",
  unknown: "#d1d5db",
};

const CALLER_TYPE_LABELS: Record<string, string> = {
  carrier: "Carrier",
  law_office: "Law Office",
  medical_provider: "Medical",
  member: "Member",
  claimant: "Claimant",
  police: "Police",
  wrong_department: "Wrong Dept",
  unknown: "Unknown",
};

const CALLER_TYPE_ICONS: Record<string, React.ElementType> = {
  carrier: Building2,
  law_office: Scale,
  medical_provider: Stethoscope,
  member: User,
  claimant: User,
  police: User,
  wrong_department: HelpCircle,
  unknown: HelpCircle,
};

export default function Analytics() {
  const { data: analytics, isLoading } = trpc.intake.analytics.useQuery();
  const { data: totalsData } = trpc.intake.list.useQuery({ limit: 1, offset: 0 });
  const { data: openData } = trpc.intake.list.useQuery({ status: "open", limit: 1, offset: 0 });

  const totalRecords = totalsData?.total ?? 0;
  const openCount = openData?.total ?? 0;
  const closedCount = totalRecords - openCount;
  const closeRate = totalRecords > 0 ? Math.round((closedCount / totalRecords) * 100) : 0;

  const byDay = (analytics?.byDay ?? []).map((d) => ({
    day: format(parseISO(d.day), "MMM d"),
    calls: Number(d.count),
  }));

  const byCallerType = (analytics?.byCallerType ?? []).map((d) => ({
    name: CALLER_TYPE_LABELS[d.callerType ?? 'unknown'] ?? (d.callerType ?? 'unknown'),
    value: Number(d.count),
    type: d.callerType ?? 'unknown',
  }));

  // Separate AI-routed (carrier/law/medical) vs live-needed (member/claimant/police)
  const aiRoutedTypes = ["carrier", "law_office", "medical_provider", "wrong_department"];
  const liveNeededTypes = ["member", "claimant", "police"];
  const aiRoutedCount = byCallerType
    .filter((d) => aiRoutedTypes.includes(d.type as string))
    .reduce((s, d) => s + d.value, 0);
  const liveNeededCount = byCallerType
    .filter((d) => liveNeededTypes.includes(d.type as string))
    .reduce((s, d) => s + d.value, 0);

  return (
    <WhipLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#171b31]">Analytics</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Call volume trends, caller type breakdown, and repeat caller identification
          </p>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-5">
              <div className="text-2xl font-bold text-[#171b31]">{totalRecords}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Total Records</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="text-2xl font-bold text-amber-600">{openCount}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Open / Pending</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="text-2xl font-bold text-green-600">{closeRate}%</div>
              <div className="text-xs text-muted-foreground mt-0.5">Close Rate</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="text-2xl font-bold text-[#ff6221]">{aiRoutedCount}</div>
              <div className="text-xs text-muted-foreground mt-0.5">AI-Handled Intakes</div>
            </CardContent>
          </Card>
        </div>

        {/* AI vs Live routing summary */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="border-l-4 border-l-[#171b31]">
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#171b31]/10 flex items-center justify-center">
                  <PhoneCall className="w-5 h-5 text-[#171b31]" />
                </div>
                <div>
                  <div className="text-xl font-bold text-[#171b31]">{aiRoutedCount}</div>
                  <div className="text-sm text-muted-foreground">
                    Carrier / Law / Medical intakes — handled by AI, no agent needed
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-[#ff6221]">
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#ff6221]/10 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-[#ff6221]" />
                </div>
                <div>
                  <div className="text-xl font-bold text-[#ff6221]">{liveNeededCount}</div>
                  <div className="text-sm text-muted-foreground">
                    Member / Claimant / Police — routed to live agent
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Call Volume by Day */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Call Volume — Last 30 Days</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                  Loading...
                </div>
              ) : byDay.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                  No data yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={byDay} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 11, fill: "#9ca3af" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#9ca3af" }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        fontSize: 12,
                        borderRadius: 8,
                        border: "1px solid #e5e7eb",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                      }}
                    />
                    <Bar dataKey="calls" fill="#171b31" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Caller Type Pie */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Caller Type Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                  Loading...
                </div>
              ) : byCallerType.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                  No data yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={byCallerType}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {byCallerType.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={CALLER_TYPE_COLORS[entry.type as string] ?? "#d1d5db"}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        fontSize: 12,
                        borderRadius: 8,
                        border: "1px solid #e5e7eb",
                      }}
                    />
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      formatter={(value) => (
                        <span style={{ fontSize: 11, color: "#6b7280" }}>{value}</span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Repeat Callers */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Repeat Callers (3+ calls)</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center text-muted-foreground text-sm py-4">Loading...</div>
            ) : (analytics?.repeatCallers ?? []).length === 0 ? (
              <div className="text-center text-muted-foreground text-sm py-6">
                No repeat callers identified yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Name</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Organization</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Phone</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Call Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {analytics?.repeatCallers.map((caller, i) => (
                      <tr key={i} className="hover:bg-muted/20">
                        <td className="px-3 py-2 font-medium">{caller.callerName || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{caller.callerOrg || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{caller.callerPhone}</td>
                        <td className="px-3 py-2">
                          <span className="bg-[#ff6221]/10 text-[#ff6221] font-semibold px-2 py-0.5 rounded text-xs">
                            {Number(caller.count)}x
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </WhipLayout>
  );
}
