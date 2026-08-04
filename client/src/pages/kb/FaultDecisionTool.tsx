import { useState } from "react";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";

const STATES = [
  { value: "MD", label: "Maryland (Contributory)" },
  { value: "VA", label: "Virginia (Contributory)" },
  { value: "FL", label: "Florida (Pure Comparative)" },
  { value: "GA", label: "Georgia (50% Bar)" },
  { value: "IL", label: "Illinois (51% Bar)" },
  { value: "MA", label: "Massachusetts (51% Bar)" },
  { value: "PA", label: "Pennsylvania (51% Bar)" },
];

const ACCIDENT_TYPES = [
  { value: "auto", label: "Auto-detect..." },
  { value: "rear-end", label: "Rear-End" },
  { value: "merge", label: "Merging / Lane Change" },
  { value: "backing", label: "Backing / Reversing" },
  { value: "left-turn", label: "Left Turn / Intersection" },
  { value: "t-bone", label: "T-Bone / Broadside" },
  { value: "sideswipe", label: "Sideswipe" },
  { value: "parking", label: "Parking Lot / Dooring" },
  { value: "single", label: "Single Vehicle" },
];

const DAMAGE_LOCATIONS = [
  { value: "", label: "Select..." },
  { value: "front", label: "Front" },
  { value: "rear", label: "Rear" },
  { value: "front-left", label: "Front Left" },
  { value: "front-right", label: "Front Right" },
  { value: "driver-side", label: "Driver Side" },
  { value: "passenger-side", label: "Passenger Side" },
  { value: "rear-left", label: "Rear Left" },
  { value: "rear-right", label: "Rear Right" },
  { value: "multiple", label: "Multiple Areas" },
];

const POLICE_REPORT_OPTIONS = [
  { value: "", label: "Select..." },
  { value: "none", label: "No police report" },
  { value: "pending", label: "Report pending" },
  { value: "yes-no-citation", label: "Yes - No citation" },
  { value: "yes-citation-other", label: "Yes - Citation to OTHER driver" },
  { value: "yes-citation-ours", label: "Yes - Citation to OUR driver" },
];

export default function FaultDecisionTool() {
  const [narrative, setNarrative] = useState("");
  const [state, setState] = useState("");
  const [accidentType, setAccidentType] = useState("auto");
  const [damageLocation, setDamageLocation] = useState("");
  const [policeReport, setPoliceReport] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyzeMutation = trpc.kb.analyzeFault.useMutation({
    onSuccess: (data) => {
      setResult(data.determination);
      setLoading(false);
    },
    onError: (err) => {
      setError(err.message);
      setLoading(false);
    },
  });

  const handleSubmit = () => {
    if (!narrative.trim()) { setError("Enter a driver narrative first."); return; }
    if (!state) { setError("Select a state of loss."); return; }
    setError(null);
    setResult(null);
    setLoading(true);
    analyzeMutation.mutate({
      narrative,
      state,
      accidentType: accidentType === "auto" ? undefined : accidentType,
      damageLocation: damageLocation || undefined,
      policeReport: policeReport || undefined,
      additionalContext: additionalContext || undefined,
    });
  };

  const handleClear = () => {
    setNarrative("");
    setState("");
    setAccidentType("auto");
    setDamageLocation("");
    setPoliceReport("");
    setAdditionalContext("");
    setResult(null);
    setError(null);
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-1">Fault Decision Tool</h1>
        <p className="text-muted-foreground text-sm">Describe what happened. The tool reads the narrative, asks follow-up questions, and determines fault.</p>
      </div>

      <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800 dark:text-amber-200">
          All AI-generated output is a starting point only. Always apply your own judgment before acting on any result. This tool does not replace adjuster review.
        </p>
      </div>

      {/* Step 1 */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">1</span>
          Step 1 — What happened?
          <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded uppercase tracking-wide text-muted-foreground">Start Here</span>
        </h2>
        <div>
          <label className="text-sm font-medium mb-1 block">In the driver's own words — what happened?</label>
          <Textarea
            value={narrative}
            onChange={e => setNarrative(e.target.value)}
            placeholder="Describe the accident in the driver's own words..."
            className="min-h-[120px]"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-1 block">State of Loss</label>
            <Select value={state} onValueChange={setState}>
              <SelectTrigger>
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                {STATES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Accident Type</label>
            <Select value={accidentType} onValueChange={setAccidentType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCIDENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Step 3 — Evidence */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">3</span>
          Step 3 — Evidence
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Damage on Whip Vehicle</label>
            <Select value={damageLocation} onValueChange={setDamageLocation}>
              <SelectTrigger>
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
             <SelectContent>
                {DAMAGE_LOCATIONS.filter(d => d.value !== "").map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
             </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Police Report</label>
            <Select value={policeReport} onValueChange={setPoliceReport}>
              <SelectTrigger>
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
             <SelectContent>
                {POLICE_REPORT_OPTIONS.filter(p => p.value !== "").map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
             </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Additional context</label>
          <Textarea
            value={additionalContext}
            onChange={e => setAdditionalContext(e.target.value)}
            placeholder="Any additional context, flags, or coverage issues..."
            className="min-h-[80px]"
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <Button onClick={handleSubmit} disabled={loading} className="flex-1">
          {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analyzing...</> : "Get Determination"}
        </Button>
        <Button variant="outline" onClick={handleClear}>
          <RotateCcw className="h-4 w-4 mr-2" />Clear
        </Button>
      </div>

      {result && (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="bg-muted/40 px-4 py-2 text-sm font-semibold">Fault Determination</div>
          <div className="px-4 py-4 text-sm whitespace-pre-wrap">{result}</div>
        </div>
      )}
    </div>
  );
}
