import { useParams } from "wouter";
import WhipLayout from "@/components/WhipLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Star,
  User,
  Mic,
  Phone,
  Heart,
  CheckCircle2,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  Minus,
  Award,
  Lightbulb,
  ChevronLeft,
  Calendar,
  FileText,
} from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";

function ScoreBadge({ score }: { score: number | null | undefined }) {
  if (!score) return <span className="text-xs text-muted-foreground">—</span>;
  const n = Number(score);
  const color =
    n >= 8 ? "bg-green-500/15 text-green-700 dark:text-green-400 border-green-300 dark:border-green-500/30" :
    n >= 7 ? "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-500/30" :
    n >= 6 ? "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-300 dark:border-yellow-500/30" :
    "bg-red-500/15 text-red-700 dark:text-red-400 border-red-300 dark:border-red-500/30";
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded border ${color}`}>
      <Star className="w-2.5 h-2.5" />
      {n.toFixed(1)}
    </span>
  );
}

function ScoreBar({ score, max = 10 }: { score: number | null | undefined; max?: number }) {
  if (!score) return <div className="w-full h-1.5 bg-muted rounded-full" />;
  const n = Number(score);
  const pct = Math.round((n / max) * 100);
  const color = n >= 8 ? "bg-green-500" : n >= 7 ? "bg-blue-500" : n >= 6 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function TrendIcon({ trend }: { trend: "up" | "down" | "stable" | null }) {
  if (trend === "up") return <TrendingUp className="w-4 h-4 text-green-500" />;
  if (trend === "down") return <TrendingDown className="w-4 h-4 text-red-500" />;
  return <Minus className="w-4 h-4 text-gray-400" />;
}

function computeTrend(scorecards: { overallScore: number | null }[]): "up" | "down" | "stable" {
  if (scorecards.length < 2) return "stable";
  const latest = Number(scorecards[0].overallScore ?? 0);
  const prev = Number(scorecards[1].overallScore ?? 0);
  if (latest > prev + 0.1) return "up";
  if (latest < prev - 0.1) return "down";
  return "stable";
}

export default function HandlerProfile() {
  const params = useParams<{ id: string }>();
  const handlerId = Number(params.id);

  const { data: handlers } = trpc.handlers.list.useQuery();
  const { data: scorecards, isLoading: scLoading } = trpc.qa.handlerScorecards.useQuery(
    { handlerId },
    { enabled: !!handlerId }
  );
  const handler = (handlers ?? []).find((h: { id: number; name: string }) => h.id === handlerId);

  const { data: intakeData } = trpc.intake.list.useQuery(
    { handlerName: handler?.name, limit: 50, offset: 0 },
    { enabled: !!handler?.name }
  );
  const { data: metricsData } = trpc.handlerMetrics.byName.useQuery(
    { handlerName: handler?.name ?? "" },
    { enabled: !!handler?.name }
  );
  const callMetrics = metricsData?.stats ?? null;

  const handlerIntakes = intakeData?.records ?? [];

  const latestScorecard = scorecards?.[0];
  const trend = scorecards ? computeTrend(scorecards) : "stable";

  // Compute averages across all scorecards
  const avgScores = scorecards && scorecards.length > 0 ? {
    overall: scorecards.reduce((s: number, c: { overallScore: number | null }) => s + Number(c.overallScore ?? 0), 0) / scorecards.length,
    greeting: scorecards.reduce((s: number, c: { greetingScore: number | null }) => s + Number(c.greetingScore ?? 0), 0) / scorecards.length,
    hold: scorecards.reduce((s: number, c: { holdManagementScore: number | null }) => s + Number(c.holdManagementScore ?? 0), 0) / scorecards.length,
    resolution: scorecards.reduce((s: number, c: { resolutionScore: number | null }) => s + Number(c.resolutionScore ?? 0), 0) / scorecards.length,
    empathy: scorecards.reduce((s: number, c: { empathyScore: number | null }) => s + Number(c.empathyScore ?? 0), 0) / scorecards.length,
    callControl: scorecards.reduce((s: number, c: { callControlScore: number | null }) => s + Number(c.callControlScore ?? 0), 0) / scorecards.length,
  } : null;

  if (!handlerId || isNaN(handlerId)) {
    return (
      <WhipLayout>
        <div className="p-6">
          <p className="text-muted-foreground">Invalid handler ID.</p>
          <Link href="/handler-queue">
            <Button variant="outline" className="mt-4 gap-2"><ChevronLeft className="h-4 w-4" /> Back to Queue</Button>
          </Link>
        </div>
      </WhipLayout>
    );
  }

  return (
    <WhipLayout>
      <div className="p-6 space-y-5">
        {/* Back nav */}
        <div className="flex items-center gap-3">
          <Link href="/handler-queue">
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground hover:text-foreground">
              <ChevronLeft className="h-4 w-4" /> Handler Queue
            </Button>
          </Link>
          <span className="text-muted-foreground">/</span>
          <Link href="/qa">
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground hover:text-foreground">
              Weekly QA
            </Button>
          </Link>
        </div>

        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-primary flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
            {handler?.name?.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase() ?? "?"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-foreground">{handler?.name ?? `Handler #${handlerId}`}</h1>
              {latestScorecard?.overallScore && (
                <ScoreBadge score={latestScorecard.overallScore} />
              )}
              <TrendIcon trend={trend} />
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {scorecards?.length ?? 0} QA scorecard{(scorecards?.length ?? 0) !== 1 ? "s" : ""} on record
              {handlerIntakes.length > 0 && ` · ${handlerIntakes.length} recent intake records`}
            </p>
          </div>
        </div>

        {/* Call Performance Metrics */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Phone className="w-4 h-4 text-muted-foreground" />
              Call Performance — This Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            {callMetrics && callMetrics.total > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-foreground">{callMetrics.total}</div>
                  <div className="text-xs text-muted-foreground">Total Calls</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {callMetrics.total > 0 ? Math.round((callMetrics.answered / callMetrics.total) * 100) : 0}%
                  </div>
                  <div className="text-xs text-muted-foreground">Answer Rate</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-foreground">{callMetrics.avgDurationMin ?? "—"}m</div>
                  <div className="text-xs text-muted-foreground">Avg Handle Time</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-foreground">{callMetrics.totalHours ?? "—"}h</div>
                  <div className="text-xs text-muted-foreground">Total Talk Time</div>
                </div>
              </div>
            ) : (
              <div className="text-center text-muted-foreground text-sm py-4">
                <TrendingUp className="w-7 h-7 mx-auto mb-2 opacity-25" />
                No call data found for <strong>{handler?.name}</strong>.
                <p className="text-xs mt-1">Make sure the name in Aircall matches exactly: <code className="bg-muted px-1 rounded">{handler?.name}</code></p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Average score cards */}
        {avgScores && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Overall", score: avgScores.overall, icon: Star },
              { label: "Greeting", score: avgScores.greeting, icon: Mic },
              { label: "Hold Mgmt", score: avgScores.hold, icon: Phone },
              { label: "Resolution", score: avgScores.resolution, icon: CheckCircle2 },
              { label: "Empathy", score: avgScores.empathy, icon: Heart },
              { label: "Call Control", score: avgScores.callControl, icon: MessageSquare },
            ].map(({ label, score, icon: Icon }) => (
              <Card key={label}>
                <CardContent className="p-3 text-center">
                  <Icon className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
                  <div className="text-lg font-bold text-foreground">{score > 0 ? score.toFixed(1) : "—"}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="mt-1.5">
                    <ScoreBar score={score} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Scorecard history */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              QA Scorecard History ({scorecards?.length ?? 0})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {scLoading ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Loading scorecards…</div>
            ) : !scorecards || scorecards.length === 0 ? (
              <div className="p-8 text-center">
                <Star className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No scorecards pushed yet.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Go to <Link href="/qa" className="text-[#ff6221] hover:underline">Weekly QA</Link> to review and push a scorecard.
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {scorecards.map((sc: {
                  id: number;
                  weekOf: string;
                  overallScore: number | null;
                  greetingScore: number | null;
                  holdManagementScore: number | null;
                  resolutionScore: number | null;
                  empathyScore: number | null;
                  callControlScore: number | null;
                  strengths: string | null;
                  improvements: string | null;
                  managerComments: string | null;
                  submittedBy: string | null;
                  createdAt: string | Date;
                }) => (
                  <div key={String(sc.id)} className="p-4 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-foreground">Week of {sc.weekOf}</span>
                        <ScoreBadge score={sc.overallScore} />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Pushed by {sc.submittedBy ?? "Manager"} · {format(new Date(sc.createdAt), "MMM d, yyyy")}
                      </div>
                    </div>

                    {/* Score grid */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                      {[
                        { label: "Greeting", score: sc.greetingScore },
                        { label: "Hold Mgmt", score: sc.holdManagementScore },
                        { label: "Resolution", score: sc.resolutionScore },
                        { label: "Empathy", score: sc.empathyScore },
                        { label: "Call Control", score: sc.callControlScore },
                      ].map(({ label, score }) => (
                        <div key={label} className="bg-muted/30 rounded p-2 text-center">
                          <div className="text-sm font-bold text-foreground">{score ? Number(score).toFixed(1) : "—"}</div>
                          <div className="text-xs text-muted-foreground">{label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Strengths */}
                    {sc.strengths && (
                      <div className="bg-green-500/10 rounded p-3">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Award className="w-3.5 h-3.5 text-green-600" />
                          <span className="text-xs font-semibold text-green-800">Strengths</span>
                        </div>
                        <p className="text-xs text-green-700 whitespace-pre-wrap">{sc.strengths}</p>
                      </div>
                    )}

                    {/* Improvements */}
                    {sc.improvements && (
                      <div className="bg-amber-50 rounded p-3">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Lightbulb className="w-3.5 h-3.5 text-amber-600" />
                          <span className="text-xs font-semibold text-amber-800">Opportunities</span>
                        </div>
                        <p className="text-xs text-amber-700 whitespace-pre-wrap">{sc.improvements}</p>
                      </div>
                    )}

                    {/* Manager comments */}
                    {sc.managerComments && (
                      <div className="bg-primary/5 rounded p-3 border border-primary/10">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <TrendingUp className="w-3.5 h-3.5 text-foreground" />
                          <span className="text-xs font-semibold text-foreground">Supervisor Coaching Note</span>
                        </div>
                        <p className="text-xs text-foreground/70 whitespace-pre-wrap">{sc.managerComments}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent intake records */}
        {handlerIntakes.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                Recent Intake Records ({handlerIntakes.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      {["Caller", "Claim #", "Status", "Priority", "Date"].map((h) => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {handlerIntakes.map((r: {
                      id: number;
                      callerName: string | null;
                      whipClaimNumber: string | null;
                      status: string;
                      priority: string | null;
                      createdAt: string | Date;
                    }) => (
                      <tr key={String(r.id)} className="hover:bg-muted/20">
                        <td className="px-4 py-2.5 font-medium text-foreground">{r.callerName ?? "Unknown"}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono">{r.whipClaimNumber ?? "—"}</td>
                        <td className="px-4 py-2.5">
                          <Badge variant="outline" className={`text-xs ${
                            r.status === "open" ? "text-orange-600 border-orange-200 bg-orange-500/10" :
                            r.status === "closed" ? "text-green-600 border-green-200 bg-green-500/10" :
                            "text-purple-600 border-purple-200 bg-purple-500/10"
                          }`}>{r.status}</Badge>
                        </td>
                        <td className="px-4 py-2.5">
                          {r.priority ? (
                            <Badge variant="outline" className={`text-xs ${
                              r.priority === "urgent" ? "text-red-600 border-red-200 bg-red-500/10" :
                              r.priority === "high" ? "text-orange-600 border-orange-200 bg-orange-500/10" :
                              "text-gray-600 border-gray-200"
                            }`}>{r.priority}</Badge>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          {format(new Date(r.createdAt), "MMM d, yyyy")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* No data state */}
        {!handler && !scLoading && (
          <Card>
            <CardContent className="p-8 text-center">
              <User className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">Handler not found.</p>
              <Link href="/handler-queue">
                <Button variant="outline" className="mt-4 gap-2">
                  <ChevronLeft className="h-4 w-4" /> Back to Queue
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </WhipLayout>
  );
}
