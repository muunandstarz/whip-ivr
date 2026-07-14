import { useState, useEffect } from "react";
import WhipLayout from "@/components/WhipLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Star,
  TrendingUp,
  TrendingDown,
  Minus,
  User,
  Mic,
  Phone,
  Heart,
  CheckCircle2,
  MessageSquare,
  Info,
  Clock,
  Lightbulb,
  Award,
  Send,
  Edit3,
  X,
  ChevronDown,
  Users,
} from "lucide-react";
import { format, startOfWeek } from "date-fns";
import { toast } from "sonner";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getMondayOf(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

const CALLER_TYPE_LABELS: Record<string, string> = {
  carrier: "Carrier",
  law_office: "Law Office",
  medical_provider: "Medical",
  member: "Member",
  claimant: "Claimant",
  police: "Police",
  unknown: "Unknown",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 9 ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-500/30" :
    score >= 8 ? "bg-green-500/15 text-green-700 dark:text-green-400 border-green-300 dark:border-green-500/30" :
    score >= 7 ? "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-500/30" :
    score >= 6 ? "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-300 dark:border-yellow-500/30" :
    "bg-red-500/15 text-red-700 dark:text-red-400 border-red-300 dark:border-red-500/30";
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded border ${color}`}>
      <Star className="w-2.5 h-2.5" />
      {score.toFixed(1)}
    </span>
  );
}

function ScoreInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        min="1"
        max="10"
        step="0.1"
        placeholder="1–10"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-sm"
      />
    </div>
  );
}

function TrendIcon({ trend }: { trend: "up" | "down" | "stable" }) {
  if (trend === "up") return <TrendingUp className="w-4 h-4 text-green-500" />;
  if (trend === "down") return <TrendingDown className="w-4 h-4 text-red-500" />;
  return <Minus className="w-4 h-4 text-gray-400" />;
}

// ─── Scorecard shape from DB ──────────────────────────────────────────────────

interface Scorecard {
  id: number;
  handlerId: number;
  handlerName: string;
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
  createdAt: Date;
  updatedAt: Date;
}

// ─── PushScorecardPanel ───────────────────────────────────────────────────────

interface PushFormState {
  handlerId: string;
  handlerName: string;
  weekOf: string;
  greetingScore: string;
  holdManagementScore: string;
  resolutionScore: string;
  empathyScore: string;
  callControlScore: string;
  overallScore: string;
  strengths: string;
  improvements: string;
  managerComments: string;
}

function PushScorecardPanel({
  agentName,
  weekOf,
  prefill,
  onClose,
}: {
  agentName: string;
  weekOf: string;
  prefill?: Scorecard | null;
  onClose: () => void;
}) {
  const { data: handlers } = trpc.handlers.list.useQuery();
  const saveScorecard = trpc.qa.saveScorecard.useMutation();
  const utils = trpc.useUtils();

  const [form, setForm] = useState<PushFormState>({
    handlerId: prefill ? String(prefill.handlerId) : "",
    handlerName: agentName,
    weekOf: prefill?.weekOf ?? weekOf,
    greetingScore: prefill?.greetingScore != null ? String(prefill.greetingScore) : "",
    holdManagementScore: prefill?.holdManagementScore != null ? String(prefill.holdManagementScore) : "",
    resolutionScore: prefill?.resolutionScore != null ? String(prefill.resolutionScore) : "",
    empathyScore: prefill?.empathyScore != null ? String(prefill.empathyScore) : "",
    callControlScore: prefill?.callControlScore != null ? String(prefill.callControlScore) : "",
    overallScore: prefill?.overallScore != null ? String(prefill.overallScore) : "",
    strengths: prefill?.strengths ?? "",
    improvements: prefill?.improvements ?? "",
    managerComments: prefill?.managerComments ?? "",
  });

  // Auto-link handler by name when handlers load
  useEffect(() => {
    if (!form.handlerId && handlers && handlers.length > 0) {
      const match = handlers.find((h: { id: number; name: string }) =>
        h.name.toLowerCase() === agentName.toLowerCase()
      );
      if (match) {
        setForm((f) => ({ ...f, handlerId: String(match.id), handlerName: match.name }));
      }
    }
  }, [handlers, agentName, form.handlerId]);

  const set = (key: keyof PushFormState) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async () => {
    if (!form.handlerId) {
      toast.error("Please link this scorecard to a handler profile.");
      return;
    }
    try {
      await saveScorecard.mutateAsync({
        handlerId: Number(form.handlerId),
        handlerName: form.handlerName,
        weekOf: form.weekOf,
        greetingScore: form.greetingScore ? Number(form.greetingScore) : undefined,
        holdManagementScore: form.holdManagementScore ? Number(form.holdManagementScore) : undefined,
        resolutionScore: form.resolutionScore ? Number(form.resolutionScore) : undefined,
        empathyScore: form.empathyScore ? Number(form.empathyScore) : undefined,
        callControlScore: form.callControlScore ? Number(form.callControlScore) : undefined,
        overallScore: form.overallScore ? Number(form.overallScore) : undefined,
        strengths: form.strengths || undefined,
        improvements: form.improvements || undefined,
        managerComments: form.managerComments || undefined,
      });
      await utils.qa.allScorecards.invalidate();
      await utils.qa.scorecardsByWeek.invalidate();
      toast.success(`${agentName}'s scorecard has been saved to their handler profile.`);
      onClose();
    } catch {
      toast.error("Failed to save scorecard. Please try again.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-background border-l shadow-2xl overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-background z-10">
          <div>
            <h2 className="font-semibold text-base flex items-center gap-2">
              <Send className="h-4 w-4 text-[#ff6221]" />
              Push Scorecard to Handler Profile
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">{agentName} — review and edit before pushing</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="p-4 space-y-5 flex-1">
          {/* Handler link */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Link to Handler Profile <span className="text-red-500">*</span></Label>
            <Select value={form.handlerId} onValueChange={(v) => {
              const h = (handlers ?? []).find((h: { id: number; name: string }) => String(h.id) === v);
              setForm((f) => ({ ...f, handlerId: v, handlerName: h?.name ?? agentName }));
            }}>
              <SelectTrigger>
                <SelectValue placeholder="Select handler…" />
              </SelectTrigger>
              <SelectContent>
                {(handlers ?? []).map((h: { id: number; name: string }) => (
                  <SelectItem key={String(h.id)} value={String(h.id)}>{h.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Week of */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Week Of</Label>
            <Input type="date" value={form.weekOf} onChange={(e) => set("weekOf")(e.target.value)} className="h-8 text-sm" />
          </div>

          {/* Score grid */}
          <div>
            <Label className="text-xs font-medium mb-2 block">Scores (1–10)</Label>
            <div className="grid grid-cols-2 gap-3">
              <ScoreInput label="Greeting" value={form.greetingScore} onChange={set("greetingScore")} />
              <ScoreInput label="Hold Management" value={form.holdManagementScore} onChange={set("holdManagementScore")} />
              <ScoreInput label="Resolution" value={form.resolutionScore} onChange={set("resolutionScore")} />
              <ScoreInput label="Empathy" value={form.empathyScore} onChange={set("empathyScore")} />
              <ScoreInput label="Call Control" value={form.callControlScore} onChange={set("callControlScore")} />
              <ScoreInput label="Overall Score" value={form.overallScore} onChange={set("overallScore")} />
            </div>
          </div>

          {/* Strengths */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium flex items-center gap-1">
              <Award className="h-3 w-3 text-green-600" /> Strengths
            </Label>
            <Textarea
              value={form.strengths}
              onChange={(e) => set("strengths")(e.target.value)}
              rows={4}
              placeholder="What this agent does well…"
              className="text-sm resize-none"
            />
          </div>

          {/* Improvements */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium flex items-center gap-1">
              <Lightbulb className="h-3 w-3 text-amber-600" /> Opportunities for Improvement
            </Label>
            <Textarea
              value={form.improvements}
              onChange={(e) => set("improvements")(e.target.value)}
              rows={4}
              placeholder="Areas to work on…"
              className="text-sm resize-none"
            />
          </div>

          {/* Manager comments */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium flex items-center gap-1">
              <MessageSquare className="h-3 w-3 text-blue-600" /> Supervisor Coaching Note
            </Label>
            <Textarea
              value={form.managerComments}
              onChange={(e) => set("managerComments")(e.target.value)}
              rows={3}
              placeholder="Private coaching note for this handler…"
              className="text-sm resize-none"
            />
          </div>
        </div>

        <div className="p-4 border-t sticky bottom-0 bg-background">
          <Button
            className="w-full bg-primary hover:bg-primary/90 text-white gap-2"
            onClick={handleSubmit}
            disabled={saveScorecard.isPending}
          >
            <Send className="h-4 w-4" />
            {saveScorecard.isPending ? "Pushing…" : `Push Scorecard to ${form.handlerName || agentName}'s Profile`}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WeeklyQA() {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [pushAgent, setPushAgent] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState(() => getMondayOf(new Date()));

  // Fetch available weeks that have scorecards
  const { data: availableWeeks } = trpc.qa.qaWeeks.useQuery();

  // Fetch scorecards for the selected week
  const { data: scorecards, isLoading: scorecardsLoading } = trpc.qa.scorecardsByWeek.useQuery({ weekOf: weekStart });

  // Handler weekly stats
  const { data: handlerStats, isLoading: statsLoading } = trpc.qa.handlerWeeklyStats.useQuery({ weekStart });

  const generateReport = trpc.qa.generateReport.useMutation();
  const bulkPushWeek = trpc.qa.bulkPushWeek.useMutation();
  const utils = trpc.useUtils();

  const batchGenerate = trpc.qa.batchGenerateAllWeeks.useMutation();

  const handleBatchGenerate = async () => {
    try {
      const results = await batchGenerate.mutateAsync();
      await utils.qa.scorecardsByWeek.invalidate();
      await utils.qa.qaWeeks.invalidate();
      const scored = results.filter((r: any) => r.count > 0).length;
      toast.success(`Retroactive QA complete: scored ${scored} week${scored !== 1 ? 's' : ''}.`);
    } catch {
      toast.error('Batch QA generation failed. Please try again.');
    }
  };

  const handleRegenerate = async () => {
    try {
      const result = await generateReport.mutateAsync({ weekStart });
      await utils.qa.scorecardsByWeek.invalidate();
      await utils.qa.qaWeeks.invalidate();
      toast.success(`Generated QA reports for ${result.count} handler${result.count !== 1 ? "s" : ""}.`);
    } catch {
      toast.error("Failed to generate QA reports. Please try again.");
    }
  };

  const handleBulkPush = async () => {
    try {
      const result = await bulkPushWeek.mutateAsync({ weekOf: weekStart });
      await utils.qa.allScorecards.invalidate();
      toast.success(`Pushed ${result.pushed} scorecard${result.pushed !== 1 ? "s" : ""} to handler profiles.`);
    } catch {
      toast.error("Failed to bulk push scorecards. Please try again.");
    }
  };

  // Build display data from real scorecards
  const displayData = (scorecards ?? []).map((sc: Scorecard) => ({
    agentName: sc.handlerName,
    avgOverall: Number(sc.overallScore ?? 0),
    avgGreeting: Number(sc.greetingScore ?? 0),
    avgHold: Number(sc.holdManagementScore ?? 0),
    avgResolution: Number(sc.resolutionScore ?? 0),
    avgEmpathy: Number(sc.empathyScore ?? 0),
    avgCallControl: Number(sc.callControlScore ?? 0),
    strengths: sc.strengths ?? "",
    improvements: sc.improvements ?? "",
    coachingNote: sc.managerComments ?? "",
    submittedBy: sc.submittedBy ?? "",
    trend: "stable" as const,
    scorecard: sc,
  }));

  const selected = selectedAgent
    ? displayData.find((d) => d.agentName === selectedAgent)
    : null;

  // Compute team averages from real data
  const teamAvgScore = displayData.length > 0
    ? (displayData.reduce((s, d) => s + d.avgOverall, 0) / displayData.length)
    : 0;

  const teamAnswerRate = handlerStats && handlerStats.length > 0
    ? Math.round(handlerStats.reduce((s: number, h: { answerRate: number }) => s + h.answerRate, 0) / handlerStats.length)
    : 0;

  const teamAvgDuration = handlerStats && handlerStats.length > 0
    ? Math.round(handlerStats.reduce((s: number, h: { avgCallDurationMin: number }) => s + h.avgCallDurationMin, 0) / handlerStats.length)
    : 0;

  const pushPrefill = pushAgent ? displayData.find((d) => d.agentName === pushAgent)?.scorecard ?? null : null;

  return (
    <WhipLayout>
      {pushAgent && (
        <PushScorecardPanel
          agentName={pushAgent}
          weekOf={weekStart}
          prefill={pushPrefill}
          onClose={() => setPushAgent(null)}
        />
      )}
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Weekly QA Scoring</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              AI-powered quality analysis
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Week selector — shows available weeks with data */}
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-muted-foreground whitespace-nowrap">Week of</label>
              <div className="relative">
                <select
                  value={weekStart}
                  onChange={(e) => setWeekStart(e.target.value)}
                  className="text-xs border rounded px-2 py-1.5 bg-background text-foreground pr-6 appearance-none cursor-pointer"
                >
                  {/* Always include current week */}
                  {!availableWeeks?.some((w: any) => w.week === weekStart) && (
                    <option value={weekStart}>{weekStart} (current week)</option>
                  )}
                  {(availableWeeks ?? []).map((w: any) => (
                    <option key={w.week} value={w.week}>
                      {w.week}{w.hasScorecards ? ' ✓' : ` — ${w.callCount} calls, no QA`}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
              </div>
              {/* Manual date fallback */}
              <input
                type="date"
                value={weekStart}
                onChange={(e) => setWeekStart(getMondayOf(new Date(e.target.value + "T12:00:00")))}
                className="text-xs border rounded px-2 py-1 bg-background text-foreground"
                title="Pick any date — snaps to Monday"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleBulkPush}
              disabled={bulkPushWeek.isPending || displayData.length === 0}
              className="text-xs gap-1.5"
            >
              {bulkPushWeek.isPending ? (
                <><span className="animate-spin">⟳</span> Pushing…</>
              ) : (
                <><Users className="w-3 h-3" /> Bulk Push All</>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleBatchGenerate}
              disabled={batchGenerate.isPending || generateReport.isPending}
              className="text-xs gap-1.5 border-amber-500 text-amber-600 hover:bg-amber-50"
              title="Score all weeks since launch that don't have QA yet"
            >
              {batchGenerate.isPending ? (
                <><span className="animate-spin">⟳</span> Scoring all weeks…</>
              ) : (
                <><Star className="w-3 h-3" /> Score All Weeks</>
              )}
            </Button>
            <Button
              size="sm"
              onClick={handleRegenerate}
              disabled={generateReport.isPending || batchGenerate.isPending}
              className="bg-[#ff6221] hover:bg-[#ff6221]/90 text-white text-xs gap-1.5"
            >
              {generateReport.isPending ? (
                <><span className="animate-spin">⟳</span> Generating…</>
              ) : (
                <><Star className="w-3 h-3" /> Regenerate QA</>
              )}
            </Button>
          </div>
        </div>

        {/* Per-handler weekly stats */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Phone className="w-4 h-4 text-[#ff6221]" />
              Handler Stats — Week of {weekStart}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {statsLoading ? (
              <div className="p-4 text-sm text-muted-foreground">Loading stats…</div>
            ) : !handlerStats || handlerStats.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">No call data for this week.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Handler</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Total Calls</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Answer Rate</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs hidden md:table-cell">Avg Duration</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs hidden lg:table-cell">Caller Types</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Overdues</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Callback Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {handlerStats.map((h: {
                      handlerName: string;
                      totalCalls: number;
                      answerRate: number;
                      avgCallDurationMin: number;
                      callsByCallerType: Record<string, number>;
                      overdueCallbacks: number;
                      callbackRate: number;
                    }, idx: number) => (
                      <tr key={`${h.handlerName}-${idx}`} className="hover:bg-muted/20">
                        <td className="px-4 py-3 font-medium text-foreground">{h.handlerName}</td>
                        <td className="px-4 py-3 text-right text-foreground">{h.totalCalls}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-medium ${
                            h.answerRate >= 90 ? "text-green-600" :
                            h.answerRate >= 75 ? "text-yellow-600" : "text-red-600"
                          }`}>{h.answerRate}%</span>
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground hidden md:table-cell">{h.avgCallDurationMin}m</td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(h.callsByCallerType)
                              .sort((a, b) => b[1] - a[1])
                              .slice(0, 4)
                              .map(([type, count]) => (
                                <span key={type} className="text-xs bg-muted px-1.5 py-0.5 rounded">
                                  {CALLER_TYPE_LABELS[type] ?? type} {count}
                                </span>
                              ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={h.overdueCallbacks > 0 ? "text-red-600 font-medium" : "text-muted-foreground"}>
                            {h.overdueCallbacks}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-medium ${
                            h.callbackRate >= 90 ? "text-green-600" :
                            h.callbackRate >= 70 ? "text-yellow-600" : "text-red-600"
                          }`}>{h.callbackRate}%</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Team summary KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#ff6221]/10 flex items-center justify-center">
                  <Star className="w-4 h-4 text-[#ff6221]" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-foreground">
                    {teamAvgScore > 0 ? teamAvgScore.toFixed(1) : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">Team Avg Score</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center">
                  <Phone className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-foreground">
                    {teamAnswerRate > 0 ? `${teamAnswerRate}%` : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">Answer Rate</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-foreground">
                    {teamAvgDuration > 0 ? `${teamAvgDuration}m` : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">Avg Handle Time</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center">
                  <User className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-foreground">{displayData.length}</div>
                  <div className="text-xs text-muted-foreground">Agents Scored</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Agent score table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              Agent Scores — Week of {weekStart}
              {scorecardsLoading && <span className="text-muted-foreground font-normal ml-2 text-xs">Loading…</span>}
              {!scorecardsLoading && displayData.length === 0 && (
                <span className="text-muted-foreground font-normal ml-2 text-xs">
                  No scorecards yet — click "Regenerate QA" to generate for this week
                </span>
              )}
            </CardTitle>
          </CardHeader>
          {displayData.length > 0 && (
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Agent</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Overall</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs hidden md:table-cell">Greeting</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs hidden md:table-cell">Hold Mgmt</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs hidden md:table-cell">Resolution</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs hidden md:table-cell">Empathy</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs hidden md:table-cell">Call Control</th>
                      <th className="text-center px-4 py-2.5 font-medium text-muted-foreground text-xs">Trend</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Push</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {displayData
                      .sort((a, b) => b.avgOverall - a.avgOverall)
                      .map((agent) => (
                        <tr
                          key={agent.agentName}
                          className={`hover:bg-muted/20 transition-colors cursor-pointer ${
                            selectedAgent === agent.agentName ? "bg-primary/5 border-l-2 border-l-[#ff6221]" : ""
                          }`}
                          onClick={() => setSelectedAgent(
                            selectedAgent === agent.agentName ? null : agent.agentName
                          )}
                        >
                          <td className="px-4 py-3 font-medium text-foreground">
                            <div className="flex items-center gap-2">
                              {agent.agentName}
                              {agent.submittedBy && (
                                <span className="text-xs text-muted-foreground bg-muted border rounded px-1.5 py-0.5">
                                  {agent.submittedBy === "AI QA System" || agent.submittedBy === "Auto-QA" ? "AI" : "Manager"}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {agent.avgOverall > 0 ? <ScoreBadge score={agent.avgOverall} /> : <span className="text-muted-foreground text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right hidden md:table-cell">
                            {agent.avgGreeting > 0 ? <ScoreBadge score={agent.avgGreeting} /> : <span className="text-muted-foreground text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right hidden md:table-cell">
                            {agent.avgHold > 0 ? <ScoreBadge score={agent.avgHold} /> : <span className="text-muted-foreground text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right hidden md:table-cell">
                            {agent.avgResolution > 0 ? <ScoreBadge score={agent.avgResolution} /> : <span className="text-muted-foreground text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right hidden md:table-cell">
                            {agent.avgEmpathy > 0 ? <ScoreBadge score={agent.avgEmpathy} /> : <span className="text-muted-foreground text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right hidden md:table-cell">
                            {agent.avgCallControl > 0 ? <ScoreBadge score={agent.avgCallControl} /> : <span className="text-muted-foreground text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3 text-center"><TrendIcon trend={agent.trend} /></td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs h-7 gap-1 border-primary/30 hover:bg-primary hover:text-white"
                              onClick={(e) => { e.stopPropagation(); setPushAgent(agent.agentName); }}
                            >
                              <Send className="h-3 w-3" />
                              Push
                            </Button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Agent detail panel */}
        {selected && (
          <Card className="border-[#ff6221]/30 shadow-sm">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <User className="w-4 h-4 text-[#ff6221]" />
                <span className="text-foreground">{selected.agentName}</span>
                <span className="text-muted-foreground font-normal">— Detailed Feedback</span>
                <Badge variant="outline" className="text-xs ml-auto">{weekStart}</Badge>
                <Button
                  size="sm"
                  className="bg-[#ff6221] hover:bg-[#ff6221]/90 text-white text-xs h-7 gap-1"
                  onClick={() => setPushAgent(selected.agentName)}
                >
                  <Edit3 className="h-3 w-3" /> Review &amp; Push to Profile
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 pt-4">
              {/* Score breakdown */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                  { label: "Greeting", score: selected.avgGreeting, icon: Mic },
                  { label: "Hold Mgmt", score: selected.avgHold, icon: Phone },
                  { label: "Resolution", score: selected.avgResolution, icon: CheckCircle2 },
                  { label: "Empathy", score: selected.avgEmpathy, icon: Heart },
                  { label: "Call Control", score: selected.avgCallControl, icon: MessageSquare },
                ].map(({ label, score, icon: Icon }) => (
                  <div key={label} className="bg-muted/30 rounded-lg p-3 text-center">
                    <Icon className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
                    <div className="text-lg font-bold text-foreground">
                      {score > 0 ? score.toFixed(1) : "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">{label}</div>
                  </div>
                ))}
              </div>

              {/* Strengths */}
              {selected.strengths && (
                <div className="bg-green-500/10 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Award className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-semibold text-green-800">What {selected.agentName.split(" ")[0]} Does Well</span>
                  </div>
                  <div className="text-sm text-green-700 whitespace-pre-wrap leading-relaxed">
                    {selected.strengths}
                  </div>
                </div>
              )}

              {/* Improvements */}
              {selected.improvements && (
                <div className="bg-amber-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Lightbulb className="w-4 h-4 text-amber-600" />
                    <span className="text-sm font-semibold text-amber-800">Opportunities for {selected.agentName.split(" ")[0]}</span>
                  </div>
                  <div className="text-sm text-amber-700 whitespace-pre-wrap leading-relaxed">
                    {selected.improvements}
                  </div>
                </div>
              )}

              {/* Coaching note */}
              {selected.coachingNote && (
                <div className="bg-primary/5 rounded-lg p-4 border border-primary/10">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="w-4 h-4 text-foreground" />
                    <span className="text-xs font-semibold text-foreground">Supervisor Coaching Note</span>
                  </div>
                  <p className="text-sm text-foreground/70 whitespace-pre-wrap">{selected.coachingNote}</p>
                </div>
              )}

              {/* No feedback yet */}
              {!selected.strengths && !selected.improvements && !selected.coachingNote && (
                <div className="text-sm text-muted-foreground text-center py-4">
                  No detailed feedback yet. Click "Review &amp; Push to Profile" to add coaching notes.
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Empty state */}
        {!scorecardsLoading && displayData.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center">
              <Star className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">No QA scorecards for {weekStart}</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">
                Click "Regenerate QA" to generate AI-powered scorecards for this week, or select a different week from the dropdown.
              </p>
              <Button
                size="sm"
                onClick={handleRegenerate}
                disabled={generateReport.isPending}
                className="bg-[#ff6221] hover:bg-[#ff6221]/90 text-white text-xs gap-1.5"
              >
                {generateReport.isPending ? (
                  <><span className="animate-spin">⟳</span> Generating…</>
                ) : (
                  <><Star className="w-3 h-3" /> Generate QA for {weekStart}</>
                )}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </WhipLayout>
  );
}
