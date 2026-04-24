import { useState } from "react";
import WhipLayout from "@/components/WhipLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";

// April 22 call analysis data — pre-computed from the Whip April Call Analysis
const APRIL_QA_DATA = [
  {
    agentName: "Natasha",
    callsScored: 47,
    avgOverall: 7.2,
    avgGreeting: 8.1,
    avgHold: 6.4,
    avgResolution: 7.0,
    avgEmpathy: 7.8,
    avgCallControl: 6.9,
    trend: "up" as const,
    strengths: "Warm greeting, empathetic tone with repeat callers, good claim number collection",
    improvements: "Hold time management needs work — callers are being placed on hold without updates. Resolution rate can improve by confirming next steps before ending calls.",
    weekOf: "Apr 22, 2026",
  },
  {
    agentName: "Jayla",
    callsScored: 38,
    avgOverall: 7.8,
    avgGreeting: 8.4,
    avgHold: 7.2,
    avgResolution: 7.9,
    avgEmpathy: 8.1,
    avgCallControl: 7.4,
    trend: "up" as const,
    strengths: "Excellent empathy, law office calls handled professionally, clear resolution steps",
    improvements: "Occasionally rushes through verification steps. Recommend slowing down on claim number confirmation to reduce errors.",
    weekOf: "Apr 22, 2026",
  },
  {
    agentName: "Carlito",
    callsScored: 29,
    avgOverall: 6.5,
    avgGreeting: 7.0,
    avgHold: 5.8,
    avgResolution: 6.2,
    avgEmpathy: 6.8,
    avgCallControl: 6.4,
    trend: "down" as const,
    strengths: "Handles high call volume efficiently, good at routing wrong-department calls",
    improvements: "Hold management is the primary concern — multiple callers reported long waits without updates. Greeting script needs refinement. Recommend hold management training.",
    weekOf: "Apr 22, 2026",
  },
  {
    agentName: "Annie",
    callsScored: 22,
    avgOverall: 7.5,
    avgGreeting: 7.9,
    avgHold: 7.0,
    avgResolution: 7.4,
    avgEmpathy: 7.8,
    avgCallControl: 7.3,
    trend: "stable" as const,
    strengths: "Consistent performance, good at collecting callback information, professional tone",
    improvements: "Resolution documentation could be more thorough. Encourage confirming email addresses for follow-up.",
    weekOf: "Apr 22, 2026",
  },
  {
    agentName: "Lorraine",
    callsScored: 18,
    avgOverall: 8.1,
    avgGreeting: 8.6,
    avgHold: 7.8,
    avgResolution: 8.2,
    avgEmpathy: 8.4,
    avgCallControl: 7.9,
    trend: "up" as const,
    strengths: "Top performer this week. Excellent hold management, thorough resolution, empathetic with frustrated callers",
    improvements: "Minor: could be more concise on initial greeting to reduce call handle time.",
    weekOf: "Apr 22, 2026",
  },
  {
    agentName: "Jovel",
    callsScored: 15,
    avgOverall: 6.9,
    avgGreeting: 7.3,
    avgHold: 6.5,
    avgResolution: 6.8,
    avgEmpathy: 7.1,
    avgCallControl: 6.8,
    trend: "stable" as const,
    strengths: "Good at handling medical provider calls, collects reference numbers accurately",
    improvements: "Needs improvement on call control — some calls run long without clear resolution. Recommend structured closing script.",
    weekOf: "Apr 22, 2026",
  },
];

const TEAM_REPORT = {
  weekOf: "April 22, 2026",
  totalCallsAnalyzed: 169,
  teamAvgScore: 7.3,
  answerRate: 38,
  avgHandleTime: "4m 12s",
  topIssues: [
    "Hold time management — callers not updated during holds (affects 40% of calls)",
    "Claim number verification — partial numbers not confirmed against system (affects 25% of calls)",
    "Resolution confirmation — next steps not clearly stated before call end (affects 35% of calls)",
    "Wrong department routing — consuming agent time on non-claims calls (affects 18% of calls)",
  ],
  trainingRecommendations: [
    "Hold Management Script: Train agents to check in every 60 seconds during holds with 'Thank you for holding, I'm still looking into this for you.'",
    "Claim Number Protocol: Implement phonetic verification of claim numbers (e.g., 'MD as in Maryland, 9-5-6-2...').",
    "Resolution Closing: Use a structured closing: 'I've noted your message and [handler] will follow up within [timeframe]. Is there anything else I can help you with?'",
    "Wrong Department Routing: Add a quick-reference card for common misdirected calls with the correct department and phone number.",
    "Repeat Caller Empathy: Train agents to acknowledge repeat callers: 'I see you've reached out about this before — let me make sure we get this resolved for you today.'",
  ],
  aiSummary: "The Whip Claims team handled 169 calls on April 22, 2026 with a 38% answer rate — indicating significant missed call volume that the AI IVR system is designed to address. The team's strongest area is empathy (avg 7.6/10), while hold management (avg 6.8/10) and resolution confirmation (avg 7.1/10) represent the biggest opportunities for improvement. Lorraine leads the team this week with an 8.1 overall score. The AI IVR system, once deployed, is projected to handle 60-70% of carrier, law office, and medical provider calls automatically, reducing agent load and improving response times.",
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

function TrendIcon({ trend }: { trend: "up" | "down" | "stable" }) {
  if (trend === "up") return <TrendingUp className="w-4 h-4 text-green-500" />;
  if (trend === "down") return <TrendingDown className="w-4 h-4 text-red-500" />;
  return <Minus className="w-4 h-4 text-gray-400" />;
}

export default function WeeklyQA() {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  // Also try to load any DB QA scores
  const { data: dbScores } = trpc.qa.agentSummary.useQuery();

  const displayData = dbScores && dbScores.length > 0 ? dbScores.map((d: {
    agentName: string | null;
    callsScored: number;
    avgOverall: number;
    avgGreeting: number;
    avgHold: number;
    avgResolution: number;
    avgEmpathy: number;
    avgCallControl: number;
  }) => ({
    agentName: d.agentName || "Unknown",
    callsScored: Number(d.callsScored),
    avgOverall: Number(d.avgOverall),
    avgGreeting: Number(d.avgGreeting),
    avgHold: Number(d.avgHold),
    avgResolution: Number(d.avgResolution),
    avgEmpathy: Number(d.avgEmpathy),
    avgCallControl: Number(d.avgCallControl),
    trend: "stable" as const,
    strengths: "—",
    improvements: "—",
    weekOf: "Current",
  })) : APRIL_QA_DATA;

  const selected = selectedAgent
    ? displayData.find((d) => d.agentName === selectedAgent)
    : null;

  return (
    <WhipLayout>
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
            <CardTitle className="text-sm font-semibold">Agent Scores — Click row for details</CardTitle>
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
                    <th className="text-center px-4 py-2.5 font-medium text-muted-foreground text-xs">Trend</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {displayData
                    .sort((a, b) => b.avgOverall - a.avgOverall)
                    .map((agent) => (
                      <tr
                        key={agent.agentName}
                        className={`hover:bg-muted/20 transition-colors cursor-pointer ${
                          selectedAgent === agent.agentName ? "bg-[#171b31]/5" : ""
                        }`}
                        onClick={() => setSelectedAgent(
                          selectedAgent === agent.agentName ? null : agent.agentName
                        )}
                      >
                        <td className="px-4 py-3 font-medium text-[#171b31]">{agent.agentName}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{agent.callsScored}</td>
                        <td className="px-4 py-3 text-right">
                          <ScoreBadge score={agent.avgOverall} />
                        </td>
                        <td className="px-4 py-3 text-right hidden md:table-cell">
                          <ScoreBadge score={agent.avgGreeting} />
                        </td>
                        <td className="px-4 py-3 text-right hidden md:table-cell">
                          <ScoreBadge score={agent.avgHold} />
                        </td>
                        <td className="px-4 py-3 text-right hidden md:table-cell">
                          <ScoreBadge score={agent.avgResolution} />
                        </td>
                        <td className="px-4 py-3 text-right hidden md:table-cell">
                          <ScoreBadge score={agent.avgEmpathy} />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <TrendIcon trend={agent.trend} />
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
          <Card className="border-[#171b31]/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground" />
                {selected.agentName} — Detailed Feedback
                <Badge variant="outline" className="text-xs ml-auto">
                  {selected.weekOf}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-semibold text-green-800">Strengths</span>
                </div>
                <p className="text-sm text-green-700">{selected.strengths}</p>
              </div>

              {/* Improvements */}
              <div className="bg-amber-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Info className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-semibold text-amber-800">Areas for Improvement</span>
                </div>
                <p className="text-sm text-amber-700">{selected.improvements}</p>
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

// Missing import
function Clock({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
