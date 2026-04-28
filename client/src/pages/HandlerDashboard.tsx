import { useState } from "react";
import { Link } from "wouter";
import WhipLayout from "@/components/WhipLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Phone,
  PhoneIncoming,
  PhoneOff,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Lightbulb,
  HeadphonesIcon,
  ArrowRightLeft,
  Bell,
  TrendingUp,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

// ── Coaching content ────────────────────────────────────────────────────────

const HOLD_REMINDERS = [
  {
    icon: "⏱️",
    title: "Check back every 30 seconds",
    body: "Return to the line and say: \"Thank you for holding, I'm still looking into this for you.\" Never leave a caller on hold silently for more than 30 seconds.",
  },
  {
    icon: "🙏",
    title: "Thank them when you return",
    body: "Always open with: \"Thank you so much for your patience.\" Callers who feel appreciated are far less likely to escalate.",
  },
  {
    icon: "⚠️",
    title: "Ask before you place on hold",
    body: "Say: \"May I place you on a brief hold while I pull that up?\" — never just click hold without asking first.",
  },
  {
    icon: "🔔",
    title: "Set a mental timer",
    body: "If you need more than 2 minutes, return to the caller and offer a callback instead. Long holds increase abandonment and complaints.",
  },
];

const SOFT_TRANSFER_TIPS = [
  {
    icon: "📋",
    title: "Warm transfer for recorded statements",
    body: "Before transferring to a handler for a recorded statement, brief the handler first: caller name, claim number, and what they're calling about. Never cold-transfer for statements.",
  },
  {
    icon: "🤝",
    title: "Stay on the line during intro",
    body: "When transferring an inbound caller to a handler, stay on the line long enough to introduce the caller: \"I have [Name] on the line regarding claim #[XXXXX].\" Then drop off cleanly.",
  },
  {
    icon: "📝",
    title: "Log before you transfer",
    body: "Always create or update the intake record before transferring. The receiving handler should never have to ask for information you already collected.",
  },
  {
    icon: "🔄",
    title: "Confirm availability first",
    body: "Check that the handler is available before initiating the transfer. If unavailable, take a message and set a callback time rather than routing to voicemail without explanation.",
  },
];

const COACHING_TIPS_BY_SCORE = [
  {
    minScore: 90,
    tips: [
      "Excellent work — maintain your consistency by reviewing one call recording per week to catch subtle improvement areas.",
      "Consider mentoring newer handlers on your hold management and empathy techniques.",
      "Focus on reducing average handle time without sacrificing quality — aim for crisp, confident closings.",
    ],
  },
  {
    minScore: 75,
    tips: [
      "Review your last 3 QA scorecards and identify the single most common deduction — target that one area this week.",
      "Practice your opening script out loud before your shift to build muscle memory and reduce filler words.",
      "When a caller seems frustrated, slow down your pace and lower your tone — it signals control and calm.",
    ],
  },
  {
    minScore: 0,
    tips: [
      "Focus on the core script: greeting → verify → empathize → resolve → close. Don't skip steps under pressure.",
      "If you're unsure of an answer, say: \"Let me get the right information for you\" — never guess on coverage or liability.",
      "Ask your supervisor to shadow one call this week for real-time coaching feedback.",
    ],
  },
];

function getCoachingTips(avgScore: number | null) {
  if (avgScore === null) return COACHING_TIPS_BY_SCORE[2].tips;
  const bucket = COACHING_TIPS_BY_SCORE.find((b) => avgScore >= b.minScore);
  return bucket?.tips ?? COACHING_TIPS_BY_SCORE[2].tips;
}

// ── Callback status badge ────────────────────────────────────────────────────

function CallbackBadge({ record }: { record: { callbackDueBy?: string | Date | null; callbackAt?: string | Date | null } }) {
  if (record.callbackAt) {
    return <Badge className="bg-green-100 text-green-700 border-green-200">Called Back</Badge>;
  }
  if (record.callbackDueBy) {
    const due = new Date(record.callbackDueBy);
    const now = new Date();
    if (due < now) {
      return <Badge className="bg-red-100 text-red-700 border-red-200">Overdue</Badge>;
    }
    return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Due EOB</Badge>;
  }
  return null;
}

// ── Priority badge ───────────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, string> = {
    urgent: "bg-red-100 text-red-700 border-red-200",
    high: "bg-orange-100 text-orange-700 border-orange-200",
    normal: "bg-blue-100 text-blue-700 border-blue-200",
    low: "bg-gray-100 text-gray-600 border-gray-200",
  };
  return (
    <Badge className={map[priority] ?? map.normal}>
      {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </Badge>
  );
}

// ── Called-back button ───────────────────────────────────────────────────────

function CalledBackButton({ intakeId, handlerName, onSuccess }: { intakeId: number; handlerName: string; onSuccess: () => void }) {
  const utils = trpc.useUtils();
  const calledBack = trpc.handlerActions.calledBack.useMutation({
    onSuccess: () => {
      toast.success("Callback logged successfully");
      utils.intake.list.invalidate();
      onSuccess();
    },
    onError: () => toast.error("Failed to log callback"),
  });

  return (
    <Button
      size="sm"
      variant="outline"
      className="text-xs h-7 border-green-300 text-green-700 hover:bg-green-50"
      disabled={calledBack.isPending}
      onClick={() => calledBack.mutate({ intakeId, handlerName })}
    >
      <CheckCircle2 className="w-3 h-3 mr-1" />
      {calledBack.isPending ? "Logging…" : "Mark Called Back"}
    </Button>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function HandlerDashboard() {
  const { user: authUser } = useAuth();
  const { impersonating, isImpersonating } = useImpersonation();
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch handlers list to resolve linked handler profile
  const { data: handlersList } = trpc.handlers.list.useQuery();

  // Determine which handler name to use:
  // 1. Admin impersonating → use impersonated handler's name
  // 2. User with linked handler profile → use handler profile name (matches Aircall exactly)
  // 3. Fallback → use login display name
  const linkedHandler = authUser?.handlerProfileId
    ? handlersList?.find((h) => h.id === authUser.handlerProfileId)
    : null;
  const effectiveName = isImpersonating
    ? impersonating!.name
    : linkedHandler?.name ?? authUser?.name ?? "";
  const handlerRecord = isImpersonating
    ? handlersList?.find((h) => h.name.toLowerCase() === impersonating!.name.toLowerCase())
    : linkedHandler ?? handlersList?.find((h) => h.name.toLowerCase() === effectiveName.toLowerCase());
  const handlerId = handlerRecord?.id ?? null;

  // Fetch this handler's open intake records (callback queue)
  const { data: intakeData, isLoading: intakeLoading } = trpc.intake.list.useQuery(
    { handlerName: effectiveName, status: "open", limit: 50, offset: 0 },
    { enabled: !!effectiveName }
  );

  // Fetch this handler's call metrics
  const { data: metricsData, isLoading: metricsLoading } = trpc.handlerMetrics.byName.useQuery(
    { handlerName: effectiveName },
    { enabled: !!effectiveName }
  );

  // Fetch QA scorecards for coaching tips
  const { data: scorecards } = trpc.qa.handlerScorecards.useQuery(
    { handlerId: handlerId! },
    { enabled: !!handlerId }
  );

  const openRecords = intakeData?.records ?? [];
  const metrics = metricsData?.stats ?? null;

  // Compute average QA score
  const avgScore =
    scorecards && scorecards.length > 0
      ? Math.round(scorecards.reduce((sum, s) => sum + (s.overallScore ?? 0), 0) / scorecards.length)
      : null;

  const coachingTips = getCoachingTips(avgScore);

  // Separate voicemail callbacks from other open records
  const voicemailCallbacks = openRecords.filter((r) => r.source === "voicemail" && !r.callbackAt);
  const otherOpen = openRecords.filter((r) => !(r.source === "voicemail" && !r.callbackAt));

  const overdueCount = voicemailCallbacks.filter((r) => {
    if (!r.callbackDueBy) return false;
    return new Date(r.callbackDueBy) < new Date();
  }).length;

  return (
    <WhipLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#171b31]">
              {isImpersonating ? (
                <span>
                  Viewing as{" "}
                  <span className="text-[#ff6221]">{impersonating!.name}</span>
                </span>
              ) : (
                <span>My Dashboard</span>
              )}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isImpersonating
                ? `Admin view — handler perspective for ${impersonating!.name}`
                : `Welcome back, ${effectiveName || "Handler"}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {overdueCount > 0 && (
              <Badge className="bg-red-100 text-red-700 border-red-200 gap-1">
                <Bell className="w-3 h-3" />
                {overdueCount} overdue callback{overdueCount !== 1 ? "s" : ""}
              </Badge>
            )}
            <Link href="/softphone">
              <Button size="sm" className="bg-[#ff6221] hover:bg-[#e5541a] text-white gap-2">
                <Phone className="w-4 h-4" />
                Open Softphone
              </Button>
            </Link>
          </div>
        </div>

        {/* Personal Call Metrics */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Call Performance — This Month
          </h2>
          {metricsLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-4 h-20 bg-gray-100 rounded-lg" />
                </Card>
              ))}
            </div>
          ) : metrics ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="border-l-4 border-l-blue-500">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <PhoneIncoming className="w-4 h-4 text-blue-500" />
                    <span className="text-xs text-muted-foreground font-medium">Total Calls</span>
                  </div>
                  <div className="text-2xl font-bold text-[#171b31]">{metrics.total ?? 0}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">inbound + outbound</div>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-green-500">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span className="text-xs text-muted-foreground font-medium">Answered</span>
                  </div>
                  <div className="text-2xl font-bold text-[#171b31]">{metrics.answered ?? 0}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {metrics.total
                      ? `${Math.round(((metrics.answered ?? 0) / metrics.total) * 100)}% answer rate`
                      : "—"}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-red-400">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <PhoneOff className="w-4 h-4 text-red-400" />
                    <span className="text-xs text-muted-foreground font-medium">Missed</span>
                  </div>
                  <div className="text-2xl font-bold text-[#171b31]">{metrics.missed ?? 0}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {metrics.total
                      ? `${Math.round(((metrics.missed ?? 0) / metrics.total) * 100)}% miss rate`
                      : "—"}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-purple-500">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="w-4 h-4 text-purple-500" />
                    <span className="text-xs text-muted-foreground font-medium">Avg Handle Time</span>
                  </div>
                  <div className="text-2xl font-bold text-[#171b31]">
                    {metrics.avgDurationMin != null
                      ? `${metrics.avgDurationMin}m`
                      : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">per answered call</div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground text-sm">
                <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-30" />
                No call data found for <strong>{effectiveName}</strong>. Make sure your name in Aircall matches exactly.
              </CardContent>
            </Card>
          )}
        </section>

        {/* QA Score Summary */}
        {scorecards && scorecards.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              QA Score
            </h2>
            <Card>
              <CardContent className="p-4 flex items-center gap-6">
                <div className="text-center">
                  <div
                    className={`text-4xl font-bold ${
                      avgScore! >= 90
                        ? "text-green-600"
                        : avgScore! >= 75
                        ? "text-amber-600"
                        : "text-red-600"
                    }`}
                  >
                    {avgScore}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">avg score</div>
                </div>
                <div className="flex-1">
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        avgScore! >= 90
                          ? "bg-green-500"
                          : avgScore! >= 75
                          ? "bg-amber-500"
                          : "bg-red-500"
                      }`}
                      style={{ width: `${avgScore}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>0</span>
                    <span>Based on {scorecards.length} scorecard{scorecards.length !== 1 ? "s" : ""}</span>
                    <span>100</span>
                  </div>
                </div>
                <Link href={`/handlers/${scorecards[0]?.handlerId ?? ""}`}>
                  <Button variant="ghost" size="sm" className="gap-1 text-xs">
                    Full Profile <ChevronRight className="w-3 h-3" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </section>
        )}

        {/* Callback Queue */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Callback Queue
            </h2>
            <Badge variant="outline" className="text-xs">
              {voicemailCallbacks.length} pending
            </Badge>
          </div>

          {intakeLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : voicemailCallbacks.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground text-sm">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500 opacity-60" />
                All voicemail callbacks are complete. Great work!
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {voicemailCallbacks.map((record) => (
                <Card
                  key={record.id}
                  className={`transition-colors ${
                    record.callbackDueBy && new Date(record.callbackDueBy) < new Date()
                      ? "border-red-200 bg-red-50/30"
                      : "border-amber-200 bg-amber-50/20"
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm text-[#171b31]">
                            {record.callerName || record.callerPhone || "Unknown Caller"}
                          </span>
                          {record.callerOrg && (
                            <span className="text-xs text-muted-foreground">· {record.callerOrg}</span>
                          )}
                          <CallbackBadge record={record} />
                          <PriorityBadge priority={record.priority ?? "normal"} />
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                          {record.whipClaimNumber && (
                            <span>Claim #{record.whipClaimNumber}</span>
                          )}
                          {record.callbackPhone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {record.callbackPhone}
                            </span>
                          )}
                          {record.callbackDueBy && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Due {format(new Date(record.callbackDueBy), "M/d h:mm a")}
                            </span>
                          )}
                          {record.createdAt && (
                            <span>
                              Voicemail {format(new Date(record.createdAt), "M/d h:mm a")}
                            </span>
                          )}
                        </div>
                        {record.message && (
                          <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 italic">
                            "{record.message}"
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <CalledBackButton
                          intakeId={record.id}
                          handlerName={effectiveName}
                          onSuccess={() => setRefreshKey((k) => k + 1)}
                        />
                        <Link href={`/intake/${record.id}`}>
                          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1">
                            View <ChevronRight className="w-3 h-3" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Other Open Records */}
        {otherOpen.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Other Open Records
              </h2>
              <Badge variant="outline" className="text-xs">{otherOpen.length}</Badge>
            </div>
            <div className="space-y-2">
              {otherOpen.map((record) => (
                <Card key={record.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm text-[#171b31]">
                            {record.callerName || record.callerPhone || "Unknown Caller"}
                          </span>
                          {record.callerOrg && (
                            <span className="text-xs text-muted-foreground">· {record.callerOrg}</span>
                          )}
                          <PriorityBadge priority={record.priority ?? "normal"} />
                          {record.callerType && (
                            <Badge variant="outline" className="text-xs capitalize">
                              {record.callerType.replace(/_/g, " ")}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          {record.whipClaimNumber && <span>Claim #{record.whipClaimNumber}</span>}
                          {record.createdAt && (
                            <span>{format(new Date(record.createdAt), "M/d h:mm a")}</span>
                          )}
                        </div>
                      </div>
                      <Link href={`/intake/${record.id}`}>
                        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1">
                          View <ChevronRight className="w-3 h-3" />
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* AI Coaching Tips */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              AI Coaching Tips
              {avgScore !== null && (
                <span className="ml-2 font-normal normal-case text-xs">
                  (based on your avg score of {avgScore})
                </span>
              )}
            </h2>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {coachingTips.map((tip, i) => (
              <Card key={i} className="border-amber-100 bg-amber-50/30">
                <CardContent className="p-4">
                  <p className="text-sm text-[#171b31] leading-relaxed">{tip}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Hold Reminders */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <HeadphonesIcon className="w-4 h-4 text-blue-500" />
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Hold Reminders
            </h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {HOLD_REMINDERS.map((item, i) => (
              <Card key={i} className="border-blue-100 bg-blue-50/20">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-xl flex-shrink-0">{item.icon}</span>
                    <div>
                      <div className="font-semibold text-sm text-[#171b31] mb-1">{item.title}</div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{item.body}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Soft Transfer Tips */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <ArrowRightLeft className="w-4 h-4 text-purple-500" />
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Soft Transfer &amp; Recorded Statement Tips
            </h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {SOFT_TRANSFER_TIPS.map((item, i) => (
              <Card key={i} className="border-purple-100 bg-purple-50/20">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-xl flex-shrink-0">{item.icon}</span>
                    <div>
                      <div className="font-semibold text-sm text-[#171b31] mb-1">{item.title}</div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{item.body}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Quick Links */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Quick Links
          </h2>
          <div className="flex flex-wrap gap-3">
            <Link href="/softphone">
              <Button variant="outline" size="sm" className="gap-2">
                <Phone className="w-4 h-4" /> Softphone
              </Button>
            </Link>
            <Link href="/intake">
              <Button variant="outline" size="sm" className="gap-2">
                <PhoneIncoming className="w-4 h-4" /> All Intake Records
              </Button>
            </Link>
            <Link href="/intake/new">
              <Button variant="outline" size="sm" className="gap-2">
                <User className="w-4 h-4" /> New Manual Intake
              </Button>
            </Link>
            {scorecards && scorecards.length > 0 && scorecards[0]?.handlerId && (
              <Link href={`/handlers/${scorecards[0].handlerId}`}>
                <Button variant="outline" size="sm" className="gap-2">
                  <TrendingUp className="w-4 h-4" /> My QA Profile
                </Button>
              </Link>
            )}
          </div>
        </section>
      </div>
    </WhipLayout>
  );
}
