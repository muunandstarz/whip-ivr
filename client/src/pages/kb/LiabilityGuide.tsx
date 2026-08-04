import { useState } from "react";
import { ChevronDown, ChevronRight, AlertTriangle, Loader2, RotateCcw, CheckCircle2, XCircle, HelpCircle, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import WhipLayout from "@/components/WhipLayout";

// ─── Types ────────────────────────────────────────────────────────────────────
interface FaultResult {
  accidentType: string;
  faultAnalysis: string;
  redFlags: string[];
  stateLawImpact: string;
  estimatedFaultPct: number;
  recoveryLikelihood: "Yes" | "No" | "Partial" | "Uncertain";
  evidenceNeeded: string[];
  recommendedAction: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const STATES = [
  { value: "MD", label: "Maryland (Contributory)" },
  { value: "VA", label: "Virginia (Contributory)" },
  { value: "FL", label: "Florida (Pure Comparative)" },
  { value: "GA", label: "Georgia (50% Bar)" },
  { value: "IL", label: "Illinois (51% Bar)" },
  { value: "MA", label: "Massachusetts (51% Bar)" },
  { value: "PA", label: "Pennsylvania (51% Bar)" },
  { value: "TX", label: "Texas (51% Bar)" },
  { value: "NC", label: "North Carolina (Contributory)" },
  { value: "NJ", label: "New Jersey (51% Bar)" },
];

const ACCIDENT_TYPES = [
  { value: "auto", label: "Auto-detect from narrative" },
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
  { value: "none", label: "No police report" },
  { value: "pending", label: "Report pending" },
  { value: "yes-no-citation", label: "Yes — No citation" },
  { value: "yes-citation-other", label: "Yes — Citation to OTHER driver" },
  { value: "yes-citation-ours", label: "Yes — Citation to OUR driver" },
];

// ─── Sub-components ───────────────────────────────────────────────────────────
function Accordion({ title, icon, children }: { title: string; icon?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-lg overflow-hidden mb-2">
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/70 text-left font-medium transition-colors"
        onClick={() => setOpen(!open)}
      >
        <span>{icon && <span className="mr-2">{icon}</span>}{title}</span>
        {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
      </button>
      {open && <div className="px-4 py-3 text-sm space-y-2 bg-background">{children}</div>}
    </div>
  );
}

function RecoveryBadge({ likelihood }: { likelihood: string }) {
  const config = {
    Yes: { label: "Recovery Likely", icon: CheckCircle2, className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-green-200 dark:border-green-800" },
    No: { label: "No Recovery", icon: XCircle, className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800" },
    Partial: { label: "Partial Recovery", icon: TrendingDown, className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800" },
    Uncertain: { label: "Uncertain", icon: HelpCircle, className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800" },
  }[likelihood] ?? { label: likelihood, icon: HelpCircle, className: "bg-muted text-muted-foreground border-border" };
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold border ${config.className}`}>
      <Icon className="h-4 w-4" />
      {config.label}
    </span>
  );
}

function FaultMeter({ pct }: { pct: number }) {
  const color = pct <= 20 ? "bg-green-500" : pct <= 49 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Our Driver Fault</span>
        <span className="font-bold text-foreground">{pct}%</span>
      </div>
      <div className="h-2.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>0% (Not at fault)</span>
        <span>100% (Fully at fault)</span>
      </div>
    </div>
  );
}

function StructuredResult({ data }: { data: FaultResult }) {
  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-3 pb-3 border-b border-border">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-mono mb-0.5">Accident Type</p>
          <p className="font-semibold">{data.accidentType}</p>
        </div>
        <div className="ml-auto">
          <RecoveryBadge likelihood={data.recoveryLikelihood} />
        </div>
      </div>

      {/* Fault meter */}
      <div className="bg-muted/30 rounded-lg p-4">
        <FaultMeter pct={data.estimatedFaultPct} />
      </div>

      {/* Red flags */}
      {data.redFlags && data.redFlags.length > 0 && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-xs font-mono uppercase tracking-wide text-red-600 dark:text-red-400 mb-2 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> Red Flags / Inconsistencies
          </p>
          <ul className="space-y-1">
            {data.redFlags.map((f, i) => (
              <li key={i} className="text-sm text-red-800 dark:text-red-200 flex gap-2">
                <span className="mt-1 shrink-0 w-1.5 h-1.5 rounded-full bg-red-500" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Fault analysis */}
      <div>
        <p className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-1.5">Fault Analysis</p>
        <p className="text-sm leading-relaxed">{data.faultAnalysis}</p>
      </div>

      {/* State law */}
      <div className="bg-muted/30 rounded-lg p-4">
        <p className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-1.5">State Law Impact</p>
        <p className="text-sm leading-relaxed">{data.stateLawImpact}</p>
      </div>

      {/* Evidence needed */}
      {data.evidenceNeeded && data.evidenceNeeded.length > 0 && (
        <div>
          <p className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-2">Key Evidence Needed</p>
          <ul className="space-y-1.5">
            {data.evidenceNeeded.map((e, i) => (
              <li key={i} className="text-sm flex gap-2 items-start">
                <span className="mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full bg-primary" />
                {e}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommended action */}
      <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
        <p className="text-xs font-mono uppercase tracking-wide text-primary mb-1.5">Recommended Action</p>
        <p className="text-sm leading-relaxed font-medium">{data.recommendedAction}</p>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function LiabilityGuide() {
  const [narrative, setNarrative] = useState("");
  const [folNarrative, setFolNarrative] = useState("");
  const [state, setState] = useState("");
  const [accidentType, setAccidentType] = useState("auto");
  const [damageLocation, setDamageLocation] = useState("");
  const [policeReport, setPoliceReport] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [result, setResult] = useState<FaultResult | null>(null);
  const [rawResult, setRawResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyzeMutation = trpc.kb.analyzeFault.useMutation({
    onSuccess: (data) => {
      if (data.structured) {
        setResult(data.structured as FaultResult);
        setRawResult(null);
      } else {
        setRawResult(data.determination);
        setResult(null);
      }
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
    setRawResult(null);
    setLoading(true);
    analyzeMutation.mutate({
      narrative,
      folNarrative: folNarrative.trim() || undefined,
      state,
      accidentType: accidentType === "auto" ? undefined : accidentType,
      damageLocation: damageLocation || undefined,
      policeReport: policeReport || undefined,
      additionalContext: additionalContext.trim() || undefined,
    });
  };

  const handleClear = () => {
    setNarrative(""); setFolNarrative(""); setState(""); setAccidentType("auto");
    setDamageLocation(""); setPoliceReport(""); setAdditionalContext("");
    setResult(null); setRawResult(null); setError(null);
  };

  return (
    <WhipLayout>
    <div className="max-w-4xl mx-auto p-6 space-y-10">

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold mb-1">Liability Reference Guide</h1>
        <p className="text-muted-foreground text-sm">Scenario-based fault guide and AI-assisted fault determination for claims processors.</p>
      </div>

      {/* Disclaimer */}
      <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800 dark:text-amber-200">
          <strong>Important:</strong> This guide is a reference tool — not a substitute for professional judgment. Every accident is different. Use this as a starting point, not a final answer. When facts are unclear or the situation is complex, seek guidance from a senior team member.
        </p>
      </div>

      {/* ── AI Fault Determination ─────────────────────────────────────────── */}
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="bg-muted/50 px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold">AI Fault Determination</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Paste the FOL and driver narrative below. The AI will analyze fault, state law impact, and recommended next steps.</p>
        </div>
        <div className="p-5 space-y-5">

          {/* FOL narrative */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">
              First of Loss (FOL) Narrative
              <span className="ml-2 text-xs text-muted-foreground font-normal">Optional — paste the FOL report or initial intake notes</span>
            </label>
            <Textarea
              value={folNarrative}
              onChange={e => setFolNarrative(e.target.value)}
              placeholder="Paste the First of Loss narrative here..."
              className="min-h-[90px] font-mono text-xs"
            />
          </div>

          {/* Driver narrative */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Driver Narrative <span className="text-red-500">*</span>
              <span className="ml-2 text-xs text-muted-foreground font-normal">In the driver's own words — what happened?</span>
            </label>
            <Textarea
              value={narrative}
              onChange={e => setNarrative(e.target.value)}
              placeholder="Describe the accident in the driver's own words..."
              className="min-h-[110px]"
            />
          </div>

          {/* State + Accident Type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">State of Loss <span className="text-red-500">*</span></label>
              <Select value={state} onValueChange={setState}>
                <SelectTrigger><SelectValue placeholder="Select state..." /></SelectTrigger>
                <SelectContent>
                  {STATES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Accident Type</label>
              <Select value={accidentType} onValueChange={setAccidentType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACCIDENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Damage + Police Report */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Damage on Whip Vehicle</label>
              <Select value={damageLocation} onValueChange={setDamageLocation}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {DAMAGE_LOCATIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Police Report</label>
              <Select value={policeReport} onValueChange={setPoliceReport}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {POLICE_REPORT_OPTIONS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Additional context */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Additional Context</label>
            <Textarea
              value={additionalContext}
              onChange={e => setAdditionalContext(e.target.value)}
              placeholder="Any additional flags, coverage issues, or context..."
              className="min-h-[70px]"
            />
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <Button onClick={handleSubmit} disabled={loading} className="flex-1">
              {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analyzing...</> : "Get Fault Determination"}
            </Button>
            <Button variant="outline" onClick={handleClear} className="bg-background">
              <RotateCcw className="h-4 w-4 mr-2" />Clear
            </Button>
          </div>

          {/* Structured result */}
          {result && (
            <div className="border border-border rounded-lg p-5 bg-background">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-base">Fault Determination</h3>
                <Badge variant="outline" className="text-xs font-mono">AI-Assisted</Badge>
              </div>
              <StructuredResult data={result} />
            </div>
          )}

          {/* Raw fallback */}
          {rawResult && (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="bg-muted/40 px-4 py-2 text-sm font-semibold">Fault Determination</div>
              <div className="px-4 py-4 text-sm whitespace-pre-wrap leading-relaxed">{rawResult}</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Always Do This First ───────────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded uppercase tracking-wide">Before Any Determination</span>
          Always Do This First
        </h2>
        <ol className="space-y-3">
          {[
            { n: 1, text: <><strong>Pull the location on Google Maps.</strong> Confirm the location is real, the road layout matches the story, and any traffic controls described actually exist there.</> },
            { n: 2, text: <><strong>Read the full driver statement first.</strong> Note what the driver says happened, what they leave out, and whether the account is clear and consistent. A vague narrative is itself a flag.</> },
            { n: 3, text: <><strong>Match the damage photos to the story.</strong> If the driver says they were hit from behind, damage should be on the rear. If photos and story don't match — stop and flag it.</> },
            { n: 4, text: <><strong>Verify date, time, and location together.</strong> A highway accident at a location that is a residential side street doesn't make sense. Confirm the road type on Maps.</> },
            { n: 5, text: <><strong>Check for flags on the intake form.</strong> Review the CSA intake form's fraud/coverage section. If any flags were checked — note them before making any determination.</> },
          ].map(({ n, text }) => (
            <li key={n} className="flex gap-3">
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center">{n}</span>
              <p className="text-sm pt-0.5">{text}</p>
            </li>
          ))}
        </ol>
      </div>

      {/* ── Fault Scenarios ────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Fault Scenarios</h2>
        <div className="space-y-1">
          <Accordion title="Rear-End Collision" icon="💥">
            <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide mb-2">One vehicle drives into the back of the vehicle in front</p>
            <p><strong>General Rule:</strong> The following driver is presumed at fault. Rear-end collisions carry a strong presumption of negligence against the driver who struck from behind.</p>
            <p><strong>Exceptions / Defenses:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Sudden stop with no warning (brake-check)</li>
              <li>Mechanical failure (brake failure, not driver negligence)</li>
              <li>Third vehicle pushed our vehicle into the one ahead</li>
              <li>Lead vehicle reversed unexpectedly</li>
            </ul>
            <p><strong>Key evidence:</strong> Damage location (front of following vehicle, rear of lead vehicle), police report, dashcam, witness statements.</p>
            <p><strong>MD/VA note:</strong> Even 1% fault on our driver = no recovery under contributory negligence. Document thoroughly.</p>
          </Accordion>
          <Accordion title="Merging / Lane Change" icon="↘️">
            <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide mb-2">A vehicle moves from one lane into another and makes contact</p>
            <p><strong>General Rule:</strong> The merging driver has the duty to yield to traffic in the target lane. Fault typically falls on the vehicle that changed lanes.</p>
            <p><strong>Exceptions / Defenses:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Other driver accelerated to block the merge</li>
              <li>Merge was completed and lane was clear — other driver drifted</li>
              <li>Disputed which vehicle was in which lane</li>
            </ul>
            <p><strong>Key evidence:</strong> Damage location (side of merging vehicle, front corner of other vehicle), dashcam, witness statements, police report.</p>
          </Accordion>
          <Accordion title="Backing / Reversing" icon="🔄">
            <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide mb-2">A vehicle reverses and strikes something or someone</p>
            <p><strong>General Rule:</strong> The reversing driver bears the duty to ensure the path is clear. Fault is typically assigned to the reversing vehicle.</p>
            <p><strong>Exceptions / Defenses:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Other vehicle entered the path after reversing had begun</li>
              <li>Obstructed sightlines (parked vehicles, structures)</li>
              <li>Other driver was speeding through a parking lot</li>
            </ul>
            <p><strong>Key evidence:</strong> Rear damage on reversing vehicle, damage to front of other vehicle, parking lot camera footage if available.</p>
          </Accordion>
          <Accordion title="Left Turn / Intersection" icon="↰">
            <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide mb-2">A vehicle turns left and is hit by oncoming traffic</p>
            <p><strong>General Rule:</strong> The turning vehicle must yield to oncoming traffic. Fault typically falls on the vehicle making the left turn.</p>
            <p><strong>Exceptions / Defenses:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Oncoming vehicle ran a red light or stop sign</li>
              <li>Oncoming vehicle was speeding (turn was safe at legal speed)</li>
              <li>Protected left turn — green arrow was in effect</li>
              <li>Oncoming vehicle came from unexpected direction</li>
            </ul>
            <p><strong>Key evidence:</strong> Traffic signal status, police report, dashcam, damage pattern (front of turning vehicle, front/side of oncoming).</p>
          </Accordion>
          <Accordion title="T-Bone / Broadside" icon="➕">
            <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide mb-2">The front of one vehicle hits the side of another at an intersection</p>
            <p><strong>General Rule:</strong> Fault depends on right-of-way. The vehicle that failed to yield or ran a control device is typically at fault.</p>
            <p><strong>Key questions:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Which vehicle had the green light or right-of-way?</li>
              <li>Was there a stop sign or yield sign?</li>
              <li>Did either driver run a red light?</li>
              <li>Was the intersection controlled or uncontrolled?</li>
            </ul>
            <p><strong>Key evidence:</strong> Traffic signal data, police report, witness statements, dashcam, damage pattern (front of striking vehicle, side of struck vehicle).</p>
          </Accordion>
          <Accordion title="Sideswipe" icon="↔️">
            <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide mb-2">Two vehicles traveling side-by-side make scraping contact</p>
            <p><strong>General Rule:</strong> Fault depends on which vehicle drifted or failed to maintain its lane. Often disputed — both vehicles may share fault.</p>
            <p><strong>Key questions:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Which vehicle was in its lane and which drifted?</li>
              <li>Was either vehicle merging at the time?</li>
              <li>Was there a construction zone or lane reduction?</li>
            </ul>
            <p><strong>Key evidence:</strong> Damage location on both vehicles (driver side vs. passenger side), dashcam, witness statements, police report.</p>
          </Accordion>
          <Accordion title="Parking Lot / Dooring" icon="🅿️">
            <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide mb-2">Collision in a parking lot, or a car door opened into a moving vehicle</p>
            <p><strong>Parking Lot:</strong> Vehicles in the travel lane generally have right-of-way over vehicles exiting spaces. The vehicle backing out typically bears fault.</p>
            <p><strong>Dooring:</strong> The person opening the door into traffic is at fault. They have a duty to check for passing vehicles before opening.</p>
            <p><strong>Key evidence:</strong> Parking lot camera, damage location, witness statements. Note: police rarely respond to parking lot accidents — get witness info.</p>
          </Accordion>
          <Accordion title="Single Vehicle" icon="🌳">
            <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide mb-2">Only the Whip vehicle was involved</p>
            <p><strong>General Rule:</strong> Single-vehicle accidents are typically the driver's fault unless an external factor caused the loss.</p>
            <p><strong>Possible defenses / exceptions:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Road hazard (pothole, debris, unmarked construction)</li>
              <li>Animal in the road</li>
              <li>Mechanical failure (not driver-caused)</li>
              <li>Hit-and-run by unidentified vehicle</li>
              <li>Weather / road condition (ice, flooding)</li>
            </ul>
            <p><strong>Coverage note:</strong> Single-vehicle accidents may trigger collision coverage. Check TNC period via Argyle — if P1/P2/P3, TNC coverage rules apply.</p>
          </Accordion>
        </div>
      </div>

      {/* ── Comparative / Contributory Negligence ─────────────────────────── */}
      <div>
        <h2 className="text-lg font-semibold mb-1">Comparative / Contributory Negligence — State Rules</h2>
        <p className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-3">Whip Operating States</p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="border border-red-200 dark:border-red-900 rounded-lg p-4 bg-red-50/50 dark:bg-red-950/20">
            <h3 className="font-semibold text-red-700 dark:text-red-400 mb-2">Pure Contributory — MD, VA &amp; NC</h3>
            <p className="text-sm">If our driver is found to be <strong>even 1% at fault</strong>, our driver cannot recover any damages — regardless of how much more at fault the other driver was. This makes thorough documentation especially important in these states.</p>
          </div>
          <div className="border border-blue-200 dark:border-blue-900 rounded-lg p-4 bg-blue-50/50 dark:bg-blue-950/20">
            <h3 className="font-semibold text-blue-700 dark:text-blue-400 mb-2">Pure Comparative — FL</h3>
            <p className="text-sm">Fault is assigned as a percentage. Recovery is reduced by that percentage — but never fully eliminated. Even if our driver is 80% at fault, they can still recover 20%. Every percentage point of fault matters.</p>
          </div>
          <div className="border border-green-200 dark:border-green-900 rounded-lg p-4 bg-green-50/50 dark:bg-green-950/20">
            <h3 className="font-semibold text-green-700 dark:text-green-400 mb-2">Modified Comparative — 50% Bar (GA)</h3>
            <p className="text-sm">Our driver can recover as long as they are <strong>49% or less at fault</strong>. If 50% or more responsible — no recovery. If eligible, recovery is reduced proportionally.</p>
          </div>
          <div className="border border-purple-200 dark:border-purple-900 rounded-lg p-4 bg-purple-50/50 dark:bg-purple-950/20">
            <h3 className="font-semibold text-purple-700 dark:text-purple-400 mb-2">Modified Comparative — 51% Bar (IL, MA, PA, TX, NJ)</h3>
            <p className="text-sm">Our driver can recover as long as they are <strong>50% or less at fault</strong>. If 51% or more — no recovery. Gives slightly more room than the 50% bar states.</p>
          </div>
        </div>
        <div className="mt-4 bg-muted/40 rounded-lg p-4">
          <p className="text-sm"><strong>Example — Same accident, different outcomes ($10,000 damages, our driver 30% at fault):</strong><br />
          MD/VA/NC: recover $0 (contributory). FL: recover $7,000 (70% of $10K). GA/IL/MA/PA/TX/NJ: recover $7,000 (under the bar, reduced proportionally).</p>
        </div>
      </div>
    </div>
    </WhipLayout>
  );
}
