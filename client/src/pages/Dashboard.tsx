import WhipLayout from "@/components/WhipLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  Info,
  BarChart2,
  Phone,
  PhoneCall,
  PhoneMissed,
  TrendingUp,
  Mic,
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

function InfoTooltip({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="w-3.5 h-3.5 text-muted-foreground/60 cursor-help flex-shrink-0" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function Dashboard() {
  const [, navigate] = useLocation();

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
  const { data: callFull } = trpc.calls.fullAnalytics.useQuery();

  const totalRecords = recentData?.total ?? 0;
  const openCount = openData?.total ?? 0;
  const closedCount = totalRecords - openCount;

  const callerTypeBreakdown = analyticsData?.byCallerType ?? [];
  const repeatCallers = analyticsData?.repeatCallers ?? [];
  const carrierCount = callerTypeBreakdown.find((c) => c.callerType === "carrier")?.count ?? 0;

  // Call analytics KPIs
  const totalCalls = callFull?.totals.reduce((s, r) => s + Number(r.count), 0) ?? 0;
  const answeredCalls = Number(callFull?.totals.find((r) => r.status === "answered")?.count ?? 0);
  const missedCalls = Number(callFull?.totals.find((r) => r.status === "missed")?.count ?? 0);
  const answerRate = totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0;

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

        {/* Intake Stats Row */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Intake Records</p>
            <InfoTooltip text="AI-processed voicemail intake records collected from the Whip Claims line. Each record represents a caller who left a voicemail with their claim information." />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Link href="/intake">
              <Card className="cursor-pointer hover:border-[#171b31]/40 hover:shadow-sm transition-all">
                <CardContent className="pt-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#171b31]/10 flex items-center justify-center">
                      <PhoneIncoming className="w-5 h-5 text-[#171b31]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <div className="text-2xl font-bold text-[#171b31]">{totalRecords}</div>
                        <InfoTooltip text="Total AI-processed intake records since the IVR went live. Click to view all records." />
                      </div>
                      <div className="text-xs text-muted-foreground">Total Intake Records</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href="/intake?status=open">
              <Card className="cursor-pointer hover:border-amber-300 hover:shadow-sm transition-all">
                <CardContent className="pt-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                      <Clock className="w-5 h-5 text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <div className="text-2xl font-bold text-amber-600">{openCount}</div>
                        <InfoTooltip text="Open intake records that still need a callback. Handlers should call these back within the same business day. Click to view open records." />
                      </div>
                      <div className="text-xs text-muted-foreground">Open / Pending Callback</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href="/intake?status=closed">
              <Card className="cursor-pointer hover:border-green-300 hover:shadow-sm transition-all">
                <CardContent className="pt-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <div className="text-2xl font-bold text-green-600">{closedCount}</div>
                        <InfoTooltip text="Intake records that have been resolved — the handler called back and the issue was addressed. Click to view closed records." />
                      </div>
                      <div className="text-xs text-muted-foreground">Closed / Resolved</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href="/intake?callerType=carrier">
              <Card className="cursor-pointer hover:border-[#ff6221]/40 hover:shadow-sm transition-all">
                <CardContent className="pt-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#ff6221]/10 flex items-center justify-center">
                      <AlertCircle className="w-5 h-5 text-[#ff6221]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <div className="text-2xl font-bold text-[#ff6221]">{Number(carrierCount)}</div>
                        <InfoTooltip text="Intake records from insurance carriers (GEICO, State Farm, Allstate, etc.). These are IVR-eligible — once the IVR is live, carriers can submit via Press 1 without a live agent. Click to view carrier intakes." />
                      </div>
                      <div className="text-xs text-muted-foreground">Carrier Intakes</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>

        {/* Call Volume Stats Row */}
        {totalCalls > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Call Volume — April 2026</p>
              <InfoTooltip text="Live call statistics from Aircall for the claims team. Includes all inbound and outbound calls handled by the 12 claims team members." />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Link href="/analytics">
                <Card className="cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all">
                  <CardContent className="pt-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                        <Phone className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <div className="text-2xl font-bold text-blue-600">{totalCalls.toLocaleString()}</div>
                          <InfoTooltip text="Total calls handled by the claims team in April 2026 — includes inbound, outbound, answered, missed, and voicemail. Click to view full analytics." />
                        </div>
                        <div className="text-xs text-muted-foreground">Total Calls</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>

              <Link href="/analytics">
                <Card className="cursor-pointer hover:border-green-300 hover:shadow-sm transition-all">
                  <CardContent className="pt-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                        <PhoneCall className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <div className="text-2xl font-bold text-green-600">{answeredCalls.toLocaleString()}</div>
                          <InfoTooltip text="Calls where a handler picked up and spoke with the caller. Click to view agent performance breakdown." />
                        </div>
                        <div className="text-xs text-muted-foreground">Answered</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>

              <Link href="/analytics">
                <Card className="cursor-pointer hover:border-red-300 hover:shadow-sm transition-all">
                  <CardContent className="pt-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                        <PhoneMissed className="w-5 h-5 text-red-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <div className="text-2xl font-bold text-red-500">{missedCalls.toLocaleString()}</div>
                          <InfoTooltip text="Calls that rang but no handler picked up. High missed call rates indicate understaffing or calls outside business hours. Click to view missed call patterns." />
                        </div>
                        <div className="text-xs text-muted-foreground">Missed</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>

              <Link href="/analytics">
                <Card className="cursor-pointer hover:border-orange-300 hover:shadow-sm transition-all">
                  <CardContent className="pt-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
                        <TrendingUp className="w-5 h-5 text-orange-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <div className="text-2xl font-bold text-orange-500">{answerRate}%</div>
                          <InfoTooltip text="Percentage of all calls that were answered by a live handler. Industry benchmark for claims teams is 85%+. Click to view trends." />
                        </div>
                        <div className="text-xs text-muted-foreground">Answer Rate</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Recent Records */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base font-semibold">Recent Intake Records</CardTitle>
                  <InfoTooltip text="The 8 most recently created AI intake records. Each row represents a voicemail that was transcribed and processed by the AI. Click any row to view full details." />
                </div>
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

          {/* Right Column */}
          <div className="space-y-4">
            {/* Caller Type Breakdown */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base font-semibold">Caller Type Breakdown</CardTitle>
                  <InfoTooltip text="Distribution of intake records by who called — carriers (insurance companies), law offices, medical providers, members (policy holders), and claimants. IVR-eligible types (carriers, law offices, medical) can self-serve via Press 1 once the IVR is live." />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {callerTypeBreakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No data yet</p>
                ) : (
                  callerTypeBreakdown.map((item) => {
                    const cfg = CALLER_TYPE_CONFIG[item.callerType ?? 'unknown'] ?? CALLER_TYPE_CONFIG.unknown;
                    const Icon = cfg.icon;
                    const pct = totalRecords > 0 ? Math.round((Number(item.count) / totalRecords) * 100) : 0;
                    const isIvrEligible = ["carrier", "law_office", "medical_provider"].includes(item.callerType ?? "");
                    return (
                      <div key={item.callerType} className="flex items-center gap-3">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${cfg.color}`}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between text-xs mb-1">
                            <div className="flex items-center gap-1">
                              <span className="font-medium">{cfg.label}</span>
                              {isIvrEligible && (
                                <span className="text-[10px] text-emerald-600 font-medium bg-emerald-50 px-1 rounded">IVR</span>
                              )}
                            </div>
                            <span className="text-muted-foreground">{Number(item.count)}</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${isIvrEligible ? "bg-emerald-500" : "bg-[#171b31]"}`}
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

            {/* Repeat Callers */}
            {repeatCallers.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-[#ff6221]" />
                      Repeat Callers
                    </CardTitle>
                    <InfoTooltip text="Callers who have left multiple voicemails about the same claim without receiving a callback. These represent unresolved cases that need urgent attention. Carrier repeat calls (same phone, different claims) are excluded." />
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {repeatCallers.slice(0, 5).map((caller, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{caller.callerName || caller.callerPhone || "Unknown"}</div>
                        {caller.callerOrg && (
                          <div className="text-xs text-muted-foreground truncate">{caller.callerOrg}</div>
                        )}
                      </div>
                      <span className="ml-2 flex-shrink-0 bg-[#ff6221]/10 text-[#ff6221] font-semibold px-2 py-0.5 rounded text-xs">
                        {Number(caller.count)}x
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* IVR Webhook Info */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base font-semibold">Aircall Webhook</CardTitle>
                  <InfoTooltip text="The webhook URL that Aircall sends events to. Configure this in your Aircall dashboard under Integrations → Webhooks. Events: call.voicemail_left, call.ended, call.answered, call.missed." />
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Webhook Endpoint</div>
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
