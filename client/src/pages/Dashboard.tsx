import WhipLayout from "@/components/WhipLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  PhoneIncoming,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Building2,
  Scale,
  Stethoscope,
  User,
  HelpCircle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const CALLER_TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  carrier: { label: "Carrier", icon: Building2, color: "bg-blue-100 text-blue-700" },
  law_office: { label: "Law Office", icon: Scale, color: "bg-purple-100 text-purple-700" },
  medical_provider: { label: "Medical", icon: Stethoscope, color: "bg-green-100 text-green-700" },
  member: { label: "Member", icon: User, color: "bg-orange-100 text-orange-700" },
  claimant: { label: "Claimant", icon: User, color: "bg-yellow-100 text-yellow-700" },
  police: { label: "Police", icon: User, color: "bg-red-100 text-red-700" },
  wrong_department: { label: "Wrong Dept", icon: HelpCircle, color: "bg-gray-100 text-gray-600" },
  unknown: { label: "Unknown", icon: HelpCircle, color: "bg-gray-100 text-gray-600" },
};

export default function Dashboard() {
  const { data: recentData, isLoading } = trpc.intake.list.useQuery({
    limit: 8,
    offset: 0,
  });

  const { data: openData } = trpc.intake.list.useQuery({
    status: "open",
    limit: 1,
    offset: 0,
  });

  const { data: analyticsData } = trpc.intake.analytics.useQuery();

  const totalRecords = recentData?.total ?? 0;
  const openCount = openData?.total ?? 0;
  const closedCount = totalRecords - openCount;

  const callerTypeBreakdown = analyticsData?.byCallerType ?? [];
  const carrierCount = callerTypeBreakdown.find((c) => c.callerType === "carrier")?.count ?? 0;
  const memberCount =
    (callerTypeBreakdown.find((c) => c.callerType === "member")?.count ?? 0) +
    (callerTypeBreakdown.find((c) => c.callerType === "claimant")?.count ?? 0);

  return (
    <WhipLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#171b31]">Claims IVR Dashboard</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              AI-powered call intake management for Whip Claims
            </p>
          </div>
          <Link href="/intake/new">
            <Button className="bg-[#ff6221] hover:bg-[#e5541a] text-white gap-2">
              <PhoneIncoming className="w-4 h-4" />
              Log Manual Intake
            </Button>
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#171b31]/10 flex items-center justify-center">
                  <PhoneIncoming className="w-5 h-5 text-[#171b31]" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-[#171b31]">{totalRecords}</div>
                  <div className="text-xs text-muted-foreground">Total Intake Records</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-amber-600">{openCount}</div>
                  <div className="text-xs text-muted-foreground">Open / Pending</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600">{closedCount}</div>
                  <div className="text-xs text-muted-foreground">Closed</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#ff6221]/10 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-[#ff6221]" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-[#ff6221]">{Number(carrierCount)}</div>
                  <div className="text-xs text-muted-foreground">Carrier Intakes</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Recent Records */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base font-semibold">Recent Intake Records</CardTitle>
                <Link href="/intake">
                  <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground">
                    View all <ArrowRight className="w-3 h-3" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-6 text-center text-muted-foreground text-sm">Loading...</div>
                ) : recentData?.records.length === 0 ? (
                  <div className="p-8 text-center">
                    <PhoneIncoming className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No intake records yet.</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Records will appear here when the AI IVR collects caller information.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {recentData?.records.map((record) => {
                      const cfg = CALLER_TYPE_CONFIG[record.callerType ?? 'unknown'] ?? CALLER_TYPE_CONFIG.unknown;
                      const Icon = cfg.icon;
                      return (
                        <Link key={record.id} href={`/intake/${record.id}`}>
                          <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 cursor-pointer transition-colors">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${cfg.color}`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium truncate">
                                  {record.callerName || record.callerPhone || "Unknown Caller"}
                                </span>
                                {record.callerOrg && (
                                  <span className="text-xs text-muted-foreground truncate">
                                    — {record.callerOrg}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                {record.whipClaimNumber && (
                                  <span className="text-xs text-[#171b31] font-mono bg-[#171b31]/8 px-1.5 py-0.5 rounded">
                                    {record.whipClaimNumber}
                                  </span>
                                )}
                                <span className="text-xs text-muted-foreground">
                                  {formatDistanceToNow(new Date(record.createdAt), { addSuffix: true })}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <Badge
                                variant="outline"
                                className={`text-xs ${
                                  record.status === "open"
                                    ? "border-amber-300 text-amber-700 bg-amber-50"
                                    : "border-green-300 text-green-700 bg-green-50"
                                }`}
                              >
                                {record.status}
                              </Badge>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Caller Type Breakdown */}
          <div>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Caller Type Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {callerTypeBreakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No data yet</p>
                ) : (
                  callerTypeBreakdown.map((item) => {
                    const cfg = CALLER_TYPE_CONFIG[item.callerType ?? 'unknown'] ?? CALLER_TYPE_CONFIG.unknown;
                    const Icon = cfg.icon;
                    const pct = totalRecords > 0 ? Math.round((Number(item.count) / totalRecords) * 100) : 0;
                    return (
                      <div key={item.callerType} className="flex items-center gap-3">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${cfg.color}`}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-medium">{cfg.label}</span>
                            <span className="text-muted-foreground">{Number(item.count)}</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#171b31] rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            {/* IVR Webhook Info */}
            <Card className="mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Aircall Webhook</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Call Ended / Voicemail</div>
                  <code className="text-xs bg-muted px-2 py-1 rounded block break-all">
                    /api/aircall/webhook
                  </code>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Auth Token (HMAC)</div>
                  <code className="text-xs bg-muted px-2 py-1 rounded block break-all">
                    Set in Aircall Dashboard → Integrations
                  </code>
                </div>
                <Link href="/ivr-setup">
                  <Button variant="outline" size="sm" className="w-full mt-2 text-xs gap-1">
                    View Setup Guide <ArrowRight className="w-3 h-3" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </WhipLayout>
  );
}
