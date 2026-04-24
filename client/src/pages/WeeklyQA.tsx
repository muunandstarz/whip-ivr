import { useState } from "react";
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
} from "lucide-react";
import { format, startOfWeek } from "date-fns";
import { toast } from "sonner";

// April 22 call analysis — pre-computed from Whip April Call Analysis
const APRIL_QA_DATA = [
  {
    agentName: "Lorraine Tria",
    callsScored: 18,
    avgOverall: 8.1,
    avgGreeting: 8.6,
    avgHold: 7.8,
    avgResolution: 8.2,
    avgEmpathy: 8.4,
    avgCallControl: 7.9,
    trend: "up" as const,
    weekOf: "Apr 22, 2026",
    strengths: [
      "Consistently uses the full Whip greeting script — callers immediately know they've reached the right place",
      "Excellent hold management: checks in every 60–90 seconds and always thanks callers for their patience",
      "Closes calls with a clear next-step summary — callers leave knowing what happens next and when",
      "Handles frustrated repeat callers with exceptional empathy; acknowledges prior contact without being prompted",
    ],
    improvements: [
      "Initial greeting runs slightly long (~25 sec) — trimming the intro by 5–8 seconds would reduce average handle time without sacrificing warmth",
      "Occasionally confirms claim numbers verbally but doesn't read them back phonetically — recommend using the NATO alphabet for digits to reduce transcription errors",
    ],
    coachingNote: "Lorraine is the team's benchmark this week. Pair her with agents scoring below 7.0 for peer coaching sessions on hold management and resolution closing.",
  },
  {
    agentName: "Jayla Bernard",
    callsScored: 25,
    avgOverall: 7.8,
    avgGreeting: 8.4,
    avgHold: 7.2,
    avgResolution: 7.9,
    avgEmpathy: 8.1,
    avgCallControl: 7.4,
    trend: "up" as const,
    weekOf: "Apr 22, 2026",
    strengths: [
      "Strongest law office handler on the team — professionally navigates attorney requests and sets appropriate expectations",
      "High empathy scores driven by genuine acknowledgment of caller frustration before jumping into intake",
      "Resolution steps are clear and specific — callers receive a named handler and a realistic timeframe",
      "Zero missed verification steps on demand letter calls — always confirms claim number, attorney name, and firm",
    ],
    improvements: [
      "Rushes through claim number confirmation on high-volume periods — slow down and read back the full number digit-by-digit",
      "Call control dips on complex multi-exposure calls — use the 'one exposure at a time' script to keep calls focused",
      "Recommend adding the callback email confirmation step consistently — currently done on ~60% of calls",
    ],
    coachingNote: "Jayla is ready for a senior agent role. Focus coaching on claim number verification discipline and multi-exposure call structure.",
  },
  {
    agentName: "Annie Ortiz",
    callsScored: 22,
    avgOverall: 7.5,
    avgGreeting: 7.9,
    avgHold: 7.0,
    avgResolution: 7.4,
    avgEmpathy: 7.8,
    avgCallControl: 7.3,
    trend: "stable" as const,
    weekOf: "Apr 22, 2026",
    strengths: [
      "100% answer rate this week — no missed calls, exceptional availability",
      "Consistent and professional tone across all call types — no variation in quality between easy and difficult callers",
      "Strong callback information collection — phone and email confirmed on 95% of calls",
      "Handles medical provider calls efficiently — collects provider name, NPI, and claim reference without prompting",
    ],
    improvements: [
      "Resolution documentation is brief — encourage adding a one-sentence summary of the caller's issue to the intake note for handler context",
      "Hold times average 2m 10s — slightly above team target of 90 seconds. Review hold reason before placing callers on hold",
      "Recommend confirming email addresses by spelling them back — currently skipped on ~40% of calls",
    ],
    coachingNote: "Annie is a reliable performer. Focus next coaching cycle on documentation quality and hold time reduction.",
  },
  {
    agentName: "MJ Badua",
    callsScored: 20,
    avgOverall: 7.4,
    avgGreeting: 7.8,
    avgHold: 6.9,
    avgResolution: 7.3,
    avgEmpathy: 7.6,
    avgCallControl: 7.2,
    trend: "up" as const,
    weekOf: "Apr 22, 2026",
    strengths: [
      "Strong performance on live-agent routed calls (member/claimant) — callers feel heard and understood",
      "Excellent at de-escalating upset members — uses name acknowledgment and active listening consistently",
      "Claim number collection accuracy is high — reads back numbers and confirms spelling of caller names",
      "Improving trend week-over-week — overall score up 0.4 points from prior week",
    ],
    improvements: [
      "Hold management is the primary development area — callers are placed on hold without an estimated wait time. Add 'I'll have an answer for you in about [X] minutes' before placing on hold",
      "Resolution closing needs a structured script — some calls end without confirming the next step or handler name",
      "On voicemail-to-live-transfer calls, review the AI intake summary before picking up so the caller doesn't have to repeat information",
    ],
    coachingNote: "MJ is on an upward trajectory. The biggest unlock is hold management — one focused training session on the hold script should move the score from 6.9 to 7.5+.",
  },
  {
    agentName: "Daryl Ochate",
    callsScored: 24,
    avgOverall: 7.6,
    avgGreeting: 8.0,
    avgHold: 7.4,
    avgResolution: 7.7,
    avgEmpathy: 7.5,
    avgCallControl: 7.5,
    trend: "stable" as const,
    weekOf: "Apr 22, 2026",
    strengths: [
      "99% answer rate — highest on the team. Daryl is the most available agent for live-routed calls",
      "Average call duration of 6m 42s reflects thorough intake — not rushing callers off the line",
      "Handles carrier and law office calls with confidence — does not defer or transfer unnecessarily",
      "Strong call control — keeps conversations on track without being abrupt",
    ],
    improvements: [
      "Empathy scores are slightly lower than peers on escalated calls — when a caller is frustrated, pause and acknowledge before moving to intake questions",
      "Recommend adding the 'repeat caller acknowledgment' script: 'I see you've reached out about this before — let me make sure we get this resolved today'",
      "On long calls (8+ min), check in with the caller mid-call to confirm they still have time — reduces abrupt call endings",
    ],
    coachingNote: "Daryl's availability and thoroughness are standout qualities. The coaching opportunity is empathy on escalated calls — a small adjustment with significant impact on caller satisfaction.",
  },
  {
    agentName: "Natashia Edulan",
    callsScored: 30,
    avgOverall: 7.2,
    avgGreeting: 8.1,
    avgHold: 6.4,
    avgResolution: 7.0,
    avgEmpathy: 7.8,
    avgCallControl: 6.9,
    trend: "up" as const,
    weekOf: "Apr 22, 2026",
    strengths: [
      "Warmest greeting on the team — callers consistently rate the initial interaction positively",
      "High empathy scores, especially with repeat callers and members reporting accidents",
      "Strong claim number collection — always confirms the number before ending the call",
      "Handles high call volume (207 calls in April) without quality degradation on greeting or empathy",
    ],
    improvements: [
      "Hold management is the primary gap — callers are placed on hold for 3+ minutes without updates. Implement the 60-second check-in rule immediately",
      "Resolution rate can improve by confirming next steps before ending the call: 'Before I let you go, here's what happens next...'",
      "Call control score of 6.9 reflects some calls running long without clear direction — use the structured closing script to bring calls to a defined end",
    ],
    coachingNote: "Natashia's empathy and greeting are team strengths. The hold management gap is the highest-priority coaching item — it's affecting both her score and caller experience on high-volume days.",
  },
  {
    agentName: "Jovel Villa",
    callsScored: 25,
    avgOverall: 6.9,
    avgGreeting: 7.3,
    avgHold: 6.5,
    avgResolution: 6.8,
    avgEmpathy: 7.1,
    avgCallControl: 6.8,
    trend: "stable" as const,
    weekOf: "Apr 22, 2026",
    strengths: [
      "Accurate reference number collection on medical provider calls — rarely needs to ask twice",
      "Good at routing wrong-department calls — provides the correct number and ends calls efficiently",
      "Improving on greeting consistency — fewer missed script elements compared to prior weeks",
    ],
    improvements: [
      "Hold management is the most critical gap — multiple callers reported 4+ minute holds with no check-in. This is the single highest-impact improvement available",
      "Call control needs a structured closing script — some calls end without a clear resolution statement, leaving callers uncertain about next steps",
      "Recommend reviewing the intake confirmation step: callers should hear their information read back before the call ends",
      "Greeting score of 7.3 has room to grow — practice the full Whip greeting script until it sounds natural, not scripted",
    ],
    coachingNote: "Jovel needs focused attention on hold management and call closing. Recommend a 30-minute one-on-one coaching session with the hold management script and a mock call exercise.",
  },
];

const seen = new Set<string>();
const APRIL_QA_DEDUPED = APRIL_QA_DATA.filter(a => {
  if (seen.has(a.agentName)) return false;
  seen.add(a.agentName);
  return true;
});

const TEAM_REPORT = {
  weekOf: "April 22, 2026",
  totalCallsAnalyzed: 169,
  teamAvgScore: 7.5,
  answerRate: 73,
  avgHandleTime: "5m 48s",
  topIssues: [
    "Hold time management — callers not updated during holds (affects 40% of calls). Team average hold check-in rate is below the 60-second target.",
    "Claim number verification — partial numbers not confirmed phonetically against system (affects 25% of calls). Risk of intake errors.",
    "Resolution confirmation — next steps not clearly stated before call end (affects 35% of calls). Callers leave uncertain about what happens next.",
    "Repeat caller recognition — agents not acknowledging prior contact, causing callers to repeat full context (affects 20% of calls).",
  ],
  trainingRecommendations: [
    "Hold Management Script: 'Thank you for holding — I'm still looking into this for you. I'll have an update in about [X] minutes.' Check in every 60 seconds. This single change is projected to improve team hold scores by 0.8–1.2 points.",
    "Phonetic Claim Number Verification: Read back claim numbers digit-by-digit using NATO alphabet (e.g., 'MD as in Mike-Delta, 9-5-6-2...'). Reduces transcription errors and builds caller confidence.",
    "Structured Resolution Closing: 'I've noted your message and [handler name] will follow up within [timeframe]. You'll receive a confirmation at [email]. Is there anything else I can help you with?' — use this on every call.",
    "Repeat Caller Acknowledgment: 'I can see you've reached out about this before — let me make sure we get this resolved for you today.' This one line significantly improves empathy scores on repeat contacts.",
    "Voicemail-to-Live Transfer Prep: Before picking up a transferred call, review the AI intake summary so the caller doesn't repeat their information. This reduces handle time and improves caller experience.",
  ],
  aiSummary: "The Whip Claims team handled 169 scored calls in the week of April 22, 2026 with a 73% answer rate. MJ Badua and Daryl Ochate are the primary live-agent processors for IVR-routed calls — Daryl leads with a 99% answer rate and MJ is on an upward trend. The team's strongest dimension is empathy (avg 7.7/10), while hold management (avg 7.0/10) is the most consistent opportunity across all agents. Lorraine Tria leads the team with an 8.1 overall score and is the recommended peer coach for hold management training. The AI IVR system, once fully deployed, is projected to handle 60–70% of carrier, law office, and medical provider calls automatically — reducing live-agent load and allowing MJ and Daryl to focus exclusively on member, claimant, and police calls.",
};

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 8 ? "bg-green-50 text-green-700 border-green-200" :
    score >= 7 ? "bg-blue-50 text-blue-700 border-blue-200" :
    score >= 6 ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
    "bg-red-50 text-red-700 border-red-200";
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

function PushScorecardPanel({ agentName, onClose }: { agentName: string; onClose: () => void }) {
  const { data: handlers } = trpc.handlers.list.useQuery();
  const saveScorecard = trpc.qa.saveScorecard.useMutation();
  const utils = trpc.useUtils();

  // Pre-fill from static QA data
  const staticData = APRIL_QA_DEDUPED.find(a => a.agentName === agentName);

  const [form, setForm] = useState<PushFormState>({
    handlerId: "",
    handlerName: agentName,
    weekOf: format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"),
    greetingScore: staticData?.avgGreeting?.toFixed(1) ?? "",
    holdManagementScore: staticData?.avgHold?.toFixed(1) ?? "",
    resolutionScore: staticData?.avgResolution?.toFixed(1) ?? "",
    empathyScore: staticData?.avgEmpathy?.toFixed(1) ?? "",
    callControlScore: staticData?.avgCallControl?.toFixed(1) ?? "",
    overallScore: staticData?.avgOverall?.toFixed(1) ?? "",
    strengths: staticData?.strengths?.join("\n") ?? "",
    improvements: staticData?.improvements?.join("\n") ?? "",
    managerComments: staticData?.coachingNote ?? "",
  });

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
      toast.success(`${agentName}'s scorecard has been saved to their handler profile.`);
      onClose();
    } catch (err) {
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
                  <SelectItem key={h.id} value={String(h.id)}>{h.name}</SelectItem>
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
            className="w-full bg-[#171b31] hover:bg-[#171b31]/90 text-white gap-2"
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

export default function WeeklyQA() {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [pushAgent, setPushAgent] = useState<string | null>(null);

  const { data: dbScores } = trpc.qa.agentSummary.useQuery();
  const { data: pushedScorecards } = trpc.qa.allScorecards.useQuery();

  const displayData = dbScores && dbScores.length > 0
    ? dbScores.map((d: {
        agentName: string | null;
        callsScored: number;
        avgOverall: number;
        avgGreeting: number;
        avgHold: number;
        avgResolution: number;
        avgEmpathy: number;
        avgCallControl: number;
      }) => {
        const staticMatch = APRIL_QA_DEDUPED.find(a =>
          a.agentName.toLowerCase().includes((d.agentName || "").toLowerCase().split(" ")[0].toLowerCase())
        );
        return {
          agentName: d.agentName || "Unknown",
          callsScored: Number(d.callsScored),
          avgOverall: Number(d.avgOverall),
          avgGreeting: Number(d.avgGreeting),
          avgHold: Number(d.avgHold),
          avgResolution: Number(d.avgResolution),
          avgEmpathy: Number(d.avgEmpathy),
          avgCallControl: Number(d.avgCallControl),
          trend: "stable" as const,
          weekOf: "Current",
          strengths: staticMatch?.strengths ?? ["Data from live QA scoring"],
          improvements: staticMatch?.improvements ?? ["Review upcoming scored calls for detailed feedback"],
          coachingNote: staticMatch?.coachingNote ?? "",
        };
      })
    : APRIL_QA_DEDUPED;

  const selected = selectedAgent
    ? displayData.find((d) => d.agentName === selectedAgent)
    : null;

  // Check which agents have already had scorecards pushed this week
  const pushedThisWeek = new Set(
    (pushedScorecards ?? []).map((s: { handlerName: string }) => s.handlerName)
  );

  return (
    <WhipLayout>
      {pushAgent && (
        <PushScorecardPanel agentName={pushAgent} onClose={() => setPushAgent(null)} />
      )}
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#171b31]">Weekly QA Scoring</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              AI-powered quality analysis — Week of {TEAM_REPORT.weekOf}
            </p>
          </div>
          <Badge variant="outline" className="bg-[#171b31] text-white border-[#171b31] text-xs">
            {TEAM_REPORT.totalCallsAnalyzed} calls analyzed
          </Badge>
        </div>

        {/* Team summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#ff6221]/10 flex items-center justify-center">
                  <Star className="w-4 h-4 text-[#ff6221]" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-[#171b31]">{TEAM_REPORT.teamAvgScore}</div>
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
                  <div className="text-2xl font-bold text-[#171b31]">{TEAM_REPORT.answerRate}%</div>
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
                  <div className="text-2xl font-bold text-[#171b31]">{TEAM_REPORT.avgHandleTime}</div>
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
                  <div className="text-2xl font-bold text-[#171b31]">{displayData.length}</div>
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
              Agent Scores — Click a row for detailed feedback · Use "Push to Profile" to send scorecard to handler
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Agent</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Calls</th>
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
                          selectedAgent === agent.agentName ? "bg-[#171b31]/5 border-l-2 border-l-[#ff6221]" : ""
                        }`}
                        onClick={() => setSelectedAgent(
                          selectedAgent === agent.agentName ? null : agent.agentName
                        )}
                      >
                        <td className="px-4 py-3 font-medium text-[#171b31]">
                          <div className="flex items-center gap-2">
                            {agent.agentName}
                            {pushedThisWeek.has(agent.agentName) && (
                              <span className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                                ✓ Pushed
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{agent.callsScored}</td>
                        <td className="px-4 py-3 text-right"><ScoreBadge score={agent.avgOverall} /></td>
                        <td className="px-4 py-3 text-right hidden md:table-cell"><ScoreBadge score={agent.avgGreeting} /></td>
                        <td className="px-4 py-3 text-right hidden md:table-cell"><ScoreBadge score={agent.avgHold} /></td>
                        <td className="px-4 py-3 text-right hidden md:table-cell"><ScoreBadge score={agent.avgResolution} /></td>
                        <td className="px-4 py-3 text-right hidden md:table-cell"><ScoreBadge score={agent.avgEmpathy} /></td>
                        <td className="px-4 py-3 text-right hidden md:table-cell"><ScoreBadge score={agent.avgCallControl} /></td>
                        <td className="px-4 py-3 text-center"><TrendIcon trend={agent.trend} /></td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7 gap-1 border-[#171b31]/30 hover:bg-[#171b31] hover:text-white"
                            onClick={(e) => { e.stopPropagation(); setPushAgent(agent.agentName); }}
                          >
                            <Send className="h-3 w-3" />
                            {pushedThisWeek.has(agent.agentName) ? "Re-push" : "Push"}
                          </Button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Agent detail panel */}
        {selected && (
          <Card className="border-[#ff6221]/30 shadow-sm">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <User className="w-4 h-4 text-[#ff6221]" />
                <span className="text-[#171b31]">{selected.agentName}</span>
                <span className="text-muted-foreground font-normal">— Detailed Feedback</span>
                <Badge variant="outline" className="text-xs ml-auto">{selected.weekOf}</Badge>
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
                    <div className="text-lg font-bold text-[#171b31]">{score.toFixed(1)}</div>
                    <div className="text-xs text-muted-foreground">{label}</div>
                  </div>
                ))}
              </div>

              {/* Strengths */}
              <div className="bg-green-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Award className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-semibold text-green-800">What {selected.agentName.split(" ")[0]} Does Well</span>
                </div>
                <ul className="space-y-2">
                  {(Array.isArray(selected.strengths) ? selected.strengths : [selected.strengths]).map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-green-700">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Improvements */}
              <div className="bg-amber-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-semibold text-amber-800">Opportunities for {selected.agentName.split(" ")[0]}</span>
                </div>
                <ul className="space-y-2">
                  {(Array.isArray(selected.improvements) ? selected.improvements : [selected.improvements]).map((imp, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-amber-700">
                      <Info className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                      {imp}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Coaching note */}
              {selected.coachingNote && (
                <div className="bg-[#171b31]/5 rounded-lg p-4 border border-[#171b31]/10">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="w-4 h-4 text-[#171b31]" />
                    <span className="text-xs font-semibold text-[#171b31]">Supervisor Coaching Note</span>
                  </div>
                  <p className="text-sm text-[#171b31]/70">{selected.coachingNote}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Pushed scorecards this week */}
        {pushedScorecards && pushedScorecards.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Send className="w-4 h-4 text-emerald-600" />
                Scorecards Pushed to Handler Profiles ({pushedScorecards.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      {["Handler", "Week Of", "Overall", "Greeting", "Hold Mgmt", "Resolution", "Empathy", "Call Control", "Pushed By"].map((h) => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {pushedScorecards.map((sc: {
                      id: number;
                      handlerName: string;
                      weekOf: string;
                      overallScore: number | null;
                      greetingScore: number | null;
                      holdManagementScore: number | null;
                      resolutionScore: number | null;
                      empathyScore: number | null;
                      callControlScore: number | null;
                      submittedBy: string | null;
                    }) => (
                      <tr key={sc.id} className="hover:bg-muted/20">
                        <td className="px-4 py-2.5 font-medium">{sc.handlerName}</td>
                        <td className="px-4 py-2.5 text-muted-foreground text-xs">{sc.weekOf}</td>
                        <td className="px-4 py-2.5">{sc.overallScore ? <ScoreBadge score={Number(sc.overallScore)} /> : "—"}</td>
                        <td className="px-4 py-2.5">{sc.greetingScore ? <ScoreBadge score={Number(sc.greetingScore)} /> : "—"}</td>
                        <td className="px-4 py-2.5">{sc.holdManagementScore ? <ScoreBadge score={Number(sc.holdManagementScore)} /> : "—"}</td>
                        <td className="px-4 py-2.5">{sc.resolutionScore ? <ScoreBadge score={Number(sc.resolutionScore)} /> : "—"}</td>
                        <td className="px-4 py-2.5">{sc.empathyScore ? <ScoreBadge score={Number(sc.empathyScore)} /> : "—"}</td>
                        <td className="px-4 py-2.5">{sc.callControlScore ? <ScoreBadge score={Number(sc.callControlScore)} /> : "—"}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{sc.submittedBy ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Team issues */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-muted-foreground" />
              Top Team Issues This Week
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {TEAM_REPORT.topIssues.map((issue, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="w-5 h-5 rounded-full bg-red-100 text-red-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-muted-foreground">{issue}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Training recommendations */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
              Training Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {TEAM_REPORT.trainingRecommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-muted-foreground">{rec}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* AI summary */}
        <Card className="bg-[#171b31] text-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-white">
              <Star className="w-4 h-4 text-[#ff6221]" />
              AI Weekly Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-white/80 leading-relaxed">{TEAM_REPORT.aiSummary}</p>
          </CardContent>
        </Card>
      </div>
    </WhipLayout>
  );
}
