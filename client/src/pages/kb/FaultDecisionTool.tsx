import { useState } from "react";
import WhipLayout from "@/components/WhipLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { GitFork, RefreshCw, AlertTriangle, CheckCircle2, Info } from "lucide-react";

type FaultLevel = "0%" | "0-25%" | "25-50%" | "50-75%" | "75-100%" | "100%";

interface FaultResult {
  whipFault: FaultLevel;
  claimantFault: FaultLevel;
  recommendation: string;
  canRecover: boolean;
  notes: string[];
  urgency: "normal" | "urgent" | "legal";
}

const STATES_CONTRIBUTORY = new Set(["MD", "VA", "DC", "NC"]);
const STATES_PURE_COMPARATIVE = new Set(["NY"]);
const STATES_50_MODIFIED = new Set(["GA"]);
const STATES_51_MODIFIED = new Set(["PA", "IL", "MA", "TX", "NJ", "OH"]);
// FL: 50% modified as of 3/24/2023

function getFaultRule(state: string): string {
  if (STATES_CONTRIBUTORY.has(state)) return "contributory";
  if (STATES_PURE_COMPARATIVE.has(state)) return "pure_comparative";
  if (STATES_50_MODIFIED.has(state)) return "modified_50";
  if (state === "FL") return "modified_50";
  return "modified_51";
}

function analyze(inputs: {
  state: string;
  scenario: string;
  whipDriverFaultPct: number;
  claimantFaultPct: number;
  isLegal: boolean;
  isDUI: boolean;
  isPeriod0: boolean;
  isPeriod1: boolean;
}): FaultResult {
  const notes: string[] = [];
  let urgency: "normal" | "urgent" | "legal" = "normal";

  if (inputs.isPeriod0) {
    return {
      whipFault: "0%", claimantFault: "0%",
      recommendation: "Period 0 — App Off. Whip has no coverage obligation. Direct claimant to driver's personal auto insurer.",
      canRecover: false,
      notes: ["Driver's personal policy is primary.", "Whip should issue a coverage denial letter.", "Document the period status from the trip log."],
      urgency: "normal",
    };
  }

  if (inputs.isDUI) {
    urgency = "legal";
    notes.push("DUI involved — escalate to legal immediately.", "Punitive damages may be alleged.", "Preserve all evidence and trip records.");
  }

  if (inputs.isLegal) {
    urgency = "legal";
    notes.push("Legal action filed — route to Jasmine immediately.", "Do not communicate directly with claimant's attorney without legal clearance.");
  }

  const rule = getFaultRule(inputs.state);
  const wFault = inputs.whipDriverFaultPct;
  const cFault = inputs.claimantFaultPct;

  let canRecover = false;
  let recommendation = "";

  if (rule === "contributory") {
    canRecover = cFault === 0;
    if (cFault > 0) {
      recommendation = `${inputs.state} uses contributory negligence. Claimant is ${cFault}% at fault — they are barred from recovery entirely.`;
      notes.push("Issue a denial letter citing contributory negligence.", "Document all evidence of claimant's fault.");
    } else {
      recommendation = `Claimant has no fault. ${inputs.state} contributory negligence does not bar recovery. Evaluate damages.`;
    }
  } else if (rule === "pure_comparative") {
    canRecover = true;
    recommendation = `${inputs.state} uses pure comparative negligence. Claimant recovers ${100 - cFault}% of damages (reduced by their ${cFault}% fault).`;
    notes.push(`Whip's exposure is ${wFault}% of total damages.`);
  } else if (rule === "modified_50") {
    canRecover = cFault < 50;
    if (cFault >= 50) {
      recommendation = `${inputs.state} bars recovery at ≥50% fault. Claimant is ${cFault}% at fault — deny.`;
      notes.push("Issue denial letter citing modified comparative negligence bar.");
    } else {
      recommendation = `Claimant is ${cFault}% at fault (under 50% bar). They recover ${100 - cFault}% of damages.`;
      notes.push(`Whip's exposure is ${wFault}% of total damages.`);
    }
  } else {
    // modified_51
    canRecover = cFault <= 50;
    if (cFault > 50) {
      recommendation = `${inputs.state} bars recovery if claimant is >50% at fault. Claimant is ${cFault}% — deny.`;
      notes.push("Issue denial letter citing modified comparative negligence bar.");
    } else {
      recommendation = `Claimant is ${cFault}% at fault (at or under 50% bar). They recover ${100 - cFault}% of damages.`;
      notes.push(`Whip's exposure is ${wFault}% of total damages.`);
    }
  }

  if (inputs.isPeriod1 && wFault > 0) {
    notes.push("Period 1 — contingent coverage only. Verify driver's personal policy denied the claim first before Whip's contingent policy applies.");
  }

  const toRange = (pct: number): FaultLevel => {
    if (pct === 0) return "0%";
    if (pct <= 25) return "0-25%";
    if (pct <= 50) return "25-50%";
    if (pct <= 75) return "50-75%";
    if (pct < 100) return "75-100%";
    return "100%";
  };

  return { whipFault: toRange(wFault), claimantFault: toRange(cFault), recommendation, canRecover, notes, urgency };
}

const STATES = ["MD", "VA", "DC", "FL", "PA", "IL", "GA", "MA", "TX", "NC", "NJ", "NY", "OH"];
const SCENARIOS = [
  "Rear-end (Whip driver struck claimant)",
  "Rear-end (Claimant struck Whip driver)",
  "Left-turn (Whip driver turning)",
  "Left-turn (Claimant turning)",
  "Lane change (Whip driver merged)",
  "Lane change (Claimant merged)",
  "Intersection — Whip driver ran stop sign",
  "Intersection — Claimant ran stop sign",
  "Backing out of parking space (Whip driver)",
  "Backing out of parking space (Claimant)",
  "Pedestrian — Whip driver at fault",
  "Pedestrian — Claimant jaywalked",
  "Other / Custom",
];

const SCENARIO_DEFAULTS: Record<string, { whip: number; claimant: number }> = {
  "Rear-end (Whip driver struck claimant)": { whip: 100, claimant: 0 },
  "Rear-end (Claimant struck Whip driver)": { whip: 0, claimant: 100 },
  "Left-turn (Whip driver turning)": { whip: 80, claimant: 20 },
  "Left-turn (Claimant turning)": { whip: 20, claimant: 80 },
  "Lane change (Whip driver merged)": { whip: 75, claimant: 25 },
  "Lane change (Claimant merged)": { whip: 25, claimant: 75 },
  "Intersection — Whip driver ran stop sign": { whip: 100, claimant: 0 },
  "Intersection — Claimant ran stop sign": { whip: 0, claimant: 100 },
  "Backing out of parking space (Whip driver)": { whip: 80, claimant: 20 },
  "Backing out of parking space (Claimant)": { whip: 20, claimant: 80 },
  "Pedestrian — Whip driver at fault": { whip: 100, claimant: 0 },
  "Pedestrian — Claimant jaywalked": { whip: 30, claimant: 70 },
};

export default function FaultDecisionTool() {
  const [state, setState] = useState("MD");
  const [scenario, setScenario] = useState(SCENARIOS[0]);
  const [whipFaultPct, setWhipFaultPct] = useState(100);
  const [claimantFaultPct, setClaimantFaultPct] = useState(0);
  const [isLegal, setIsLegal] = useState(false);
  const [isDUI, setIsDUI] = useState(false);
  const [isPeriod0, setIsPeriod0] = useState(false);
  const [isPeriod1, setIsPeriod1] = useState(false);
  const [result, setResult] = useState<FaultResult | null>(null);

  function handleScenarioChange(s: string) {
    setScenario(s);
    const defaults = SCENARIO_DEFAULTS[s];
    if (defaults) {
      setWhipFaultPct(defaults.whip);
      setClaimantFaultPct(defaults.claimant);
    }
  }

  function handleAnalyze() {
    setResult(analyze({ state, scenario, whipDriverFaultPct: whipFaultPct, claimantFaultPct, isLegal, isDUI, isPeriod0, isPeriod1 }));
  }

  const urgencyColors = { normal: "border-border/50", urgent: "border-amber-400", legal: "border-red-500" };
  const urgencyBg = { normal: "", urgent: "bg-amber-50 dark:bg-amber-950/20", legal: "bg-red-50 dark:bg-red-950/20" };

  return (
    <WhipLayout>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#ff6221]/10 flex items-center justify-center">
            <GitFork className="w-5 h-5 text-[#ff6221]" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Fault Decision Tool</h1>
            <p className="text-sm text-muted-foreground">Determine liability exposure and recovery eligibility based on state law and fault allocation</p>
          </div>
        </div>

        <Card className="border-border/50">
          <CardHeader className="pb-3"><CardTitle className="text-base">Claim Inputs</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">State</Label>
                <Select value={state} onValueChange={setState}>
                  <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Scenario</Label>
                <Select value={scenario} onValueChange={handleScenarioChange}>
                  <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{SCENARIOS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Whip Driver Fault %</Label>
                <input type="range" min={0} max={100} step={5} value={whipFaultPct}
                  onChange={(e) => setWhipFaultPct(Number(e.target.value))}
                  className="w-full mt-2 accent-[#ff6221]" />
                <p className="text-center text-sm font-bold mt-1">{whipFaultPct}%</p>
              </div>
              <div>
                <Label className="text-xs">Claimant Fault %</Label>
                <input type="range" min={0} max={100} step={5} value={claimantFaultPct}
                  onChange={(e) => setClaimantFaultPct(Number(e.target.value))}
                  className="w-full mt-2 accent-[#ff6221]" />
                <p className="text-center text-sm font-bold mt-1">{claimantFaultPct}%</p>
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Legal Action Filed", value: isLegal, set: setIsLegal },
                { label: "DUI Involved", value: isDUI, set: setIsDUI },
                { label: "Period 0 (App Off)", value: isPeriod0, set: setIsPeriod0 },
                { label: "Period 1 (Contingent)", value: isPeriod1, set: setIsPeriod1 },
              ].map(({ label, value, set }) => (
                <div key={label} className="flex items-center gap-2">
                  <Switch checked={value} onCheckedChange={set} />
                  <Label className="text-xs">{label}</Label>
                </div>
              ))}
            </div>
            <Button className="w-full bg-[#ff6221] hover:bg-[#e5541a] text-white gap-2" onClick={handleAnalyze}>
              <GitFork className="w-4 h-4" /> Analyze Fault
            </Button>
          </CardContent>
        </Card>

        {result && (
          <Card className={`border-2 ${urgencyColors[result.urgency]} ${urgencyBg[result.urgency]}`}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Decision</CardTitle>
                <div className="flex items-center gap-2">
                  {result.urgency === "legal" && <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-0">🚨 Legal — Escalate</Badge>}
                  {result.urgency === "urgent" && <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-0">⚠ Urgent</Badge>}
                  {result.canRecover
                    ? <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-0"><CheckCircle2 className="w-3 h-3 mr-1" />Claimant Can Recover</Badge>
                    : <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-0">Deny / No Recovery</Badge>}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">{result.recommendation}</p>
              {result.notes.length > 0 && (
                <div className="space-y-1.5">
                  {result.notes.map((note, i) => (
                    <div key={i} className="flex gap-2 text-xs text-muted-foreground">
                      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
                      {note}
                    </div>
                  ))}
                </div>
              )}
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setResult(null)}>
                <RefreshCw className="w-3 h-3" /> Reset
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </WhipLayout>
  );
}
