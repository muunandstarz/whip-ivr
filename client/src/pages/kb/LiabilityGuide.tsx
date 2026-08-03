import { useState } from "react";
import WhipLayout from "@/components/WhipLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Scale, Search, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, Info } from "lucide-react";

interface Section {
  id: string;
  title: string;
  badge?: string;
  badgeColor?: string;
  content: React.ReactNode;
}

function Accordion({ title, badge, badgeColor, children }: { title: string; badge?: string; badgeColor?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          {open ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
          <span className="font-medium text-sm">{title}</span>
          {badge && <Badge className={`text-xs border-0 ${badgeColor ?? "bg-muted text-muted-foreground"}`}>{badge}</Badge>}
        </div>
      </button>
      {open && <div className="px-4 pb-4 pt-1 border-t border-border/30 text-sm space-y-3">{children}</div>}
    </div>
  );
}

function RuleRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 py-1.5 border-b border-border/20 last:border-0">
      <span className="text-muted-foreground w-48 shrink-0 text-xs">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

export default function LiabilityGuide() {
  const [search, setSearch] = useState("");

  const sections: Section[] = [
    {
      id: "negligence",
      title: "Negligence Standards by State",
      badge: "Core",
      badgeColor: "bg-primary/10 text-primary",
      content: (
        <div className="space-y-3">
          <p className="text-muted-foreground text-xs">The negligence standard determines how fault is apportioned and whether a claimant can recover damages.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="bg-muted/40"><th className="text-left px-3 py-2">State</th><th className="text-left px-3 py-2">Standard</th><th className="text-left px-3 py-2">Rule</th></tr></thead>
              <tbody>
                {[
                  ["MD", "Contributory Negligence", "Any fault by claimant bars recovery entirely. Strict — even 1% fault = $0 recovery."],
                  ["VA", "Contributory Negligence", "Same as MD. Claimant must be 0% at fault to recover."],
                  ["DC", "Contributory Negligence", "Same strict bar as MD/VA."],
                  ["FL", "Modified Comparative (Pure)", "As of 3/24/2023: claimant can recover only if ≤50% at fault. Prior: pure comparative (any % recoverable)."],
                  ["PA", "Modified Comparative (51%)", "Claimant recovers if <51% at fault. Recovery reduced by their % fault."],
                  ["IL", "Modified Comparative (51%)", "Same as PA — claimant barred if ≥51% at fault."],
                  ["GA", "Modified Comparative (50%)", "Claimant barred if ≥50% at fault. Recovers if <50%."],
                  ["MA", "Modified Comparative (51%)", "Claimant barred if ≥51% at fault."],
                  ["TX", "Modified Comparative (51%)", "Claimant barred if >50% at fault."],
                  ["NC", "Contributory Negligence", "Strict bar — any claimant fault = no recovery."],
                  ["NJ", "Modified Comparative (51%)", "Claimant barred if >50% at fault."],
                  ["NY", "Pure Comparative", "Claimant can recover regardless of fault %, recovery reduced proportionally."],
                  ["OH", "Modified Comparative (51%)", "Claimant barred if >50% at fault."],
                ].map(([state, std, rule]) => (
                  <tr key={state} className="border-b border-border/20 hover:bg-muted/20">
                    <td className="px-3 py-2 font-bold text-primary">{state}</td>
                    <td className="px-3 py-2 font-medium">{std}</td>
                    <td className="px-3 py-2 text-muted-foreground">{rule}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ),
    },
    {
      id: "rideshare",
      title: "Rideshare / TNC Liability Periods",
      badge: "Whip-Specific",
      badgeColor: "bg-[#ff6221]/10 text-[#ff6221]",
      content: (
        <div className="space-y-3">
          <p className="text-muted-foreground text-xs">Whip operates as a TNC (Transportation Network Company). Coverage and liability depend on which period the driver was in at the time of the incident.</p>
          <div className="space-y-2">
            {[
              { period: "Period 0", label: "App Off", desc: "Driver's personal auto policy applies. Whip has no coverage obligation.", color: "bg-muted/40" },
              { period: "Period 1", label: "App On, No Ride Accepted", desc: "Contingent liability coverage: $50k/$100k BI, $25k PD. Applies only if driver's personal policy denies the claim.", color: "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40" },
              { period: "Period 2", label: "Ride Accepted, En Route to Pickup", desc: "Full Klutch commercial policy applies. $1M CSL BI/PD. Whip is primary.", color: "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800/40" },
              { period: "Period 3", label: "Passenger On Board", desc: "Full Klutch commercial policy applies. $1M CSL BI/PD. Whip is primary.", color: "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800/40" },
            ].map(({ period, label, desc, color }) => (
              <div key={period} className={`p-3 rounded-lg border ${color}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-sm">{period}</span>
                  <span className="text-xs text-muted-foreground">— {label}</span>
                </div>
                <p className="text-xs">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: "fault-standards",
      title: "Common Fault Scenarios",
      badge: "Reference",
      badgeColor: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
      content: (
        <div className="space-y-3">
          <div className="space-y-2">
            {[
              { scenario: "Rear-end collision", rule: "Striking driver presumed 100% at fault in most states. Exceptions: sudden stop, brake-check, or claimant cut off driver with insufficient following distance." },
              { scenario: "Left-turn collision", rule: "Turning driver presumed at fault. Exception: oncoming driver ran red light or was speeding excessively." },
              { scenario: "Lane change / merge", rule: "Merging driver presumed at fault. Exception: other driver was in blind spot and accelerated to block." },
              { scenario: "Intersection (no signal)", rule: "Right-of-way rules apply. Driver entering from stop sign yields to driver on through road." },
              { scenario: "Backing out of parking space", rule: "Backing driver presumed at fault. Exception: other driver was speeding through parking lot." },
              { scenario: "Dooring (cyclist)", rule: "Opening door into traffic — door-opener is at fault in most jurisdictions." },
              { scenario: "Pedestrian in crosswalk", rule: "Driver at fault if pedestrian had right of way. Shared fault if pedestrian jaywalked (comparative states)." },
              { scenario: "DUI / impaired driver", rule: "Impaired driver is at fault. Punitive damages may apply. Notify legal immediately." },
            ].map(({ scenario, rule }) => (
              <div key={scenario} className="p-3 rounded-lg bg-muted/30 border border-border/30">
                <p className="font-medium text-sm mb-1">{scenario}</p>
                <p className="text-xs text-muted-foreground">{rule}</p>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: "damages",
      title: "Damages: Types and Caps",
      badge: "Reference",
      badgeColor: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
      content: (
        <div className="space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            {[
              { type: "Special Damages (Economic)", items: ["Medical bills (past & future)", "Lost wages / lost earning capacity", "Property damage / diminished value", "Rental expenses", "Out-of-pocket costs"] },
              { type: "General Damages (Non-Economic)", items: ["Pain and suffering", "Emotional distress", "Loss of consortium", "Loss of enjoyment of life", "Disfigurement / scarring"] },
            ].map(({ type, items }) => (
              <div key={type} className="p-3 rounded-lg bg-muted/30 border border-border/30">
                <p className="font-semibold text-sm mb-2">{type}</p>
                <ul className="space-y-1">
                  {items.map(i => <li key={i} className="text-xs text-muted-foreground flex gap-2"><span className="text-primary mt-0.5">•</span>{i}</li>)}
                </ul>
              </div>
            ))}
          </div>
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40">
            <div className="flex gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-400">Punitive Damages</p>
                <p className="text-xs text-amber-700 dark:text-amber-500 mt-0.5">Awarded in cases of gross negligence, DUI, or intentional conduct. Escalate to legal immediately if punitive damages are alleged.</p>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "statutes",
      title: "Statutes of Limitations by State",
      badge: "Deadlines",
      badgeColor: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
      content: (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Time limits for filing a lawsuit after an accident. Missing the SOL bars the claim entirely.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="bg-muted/40"><th className="text-left px-3 py-2">State</th><th className="text-left px-3 py-2">BI / Personal Injury</th><th className="text-left px-3 py-2">PD</th><th className="text-left px-3 py-2">Notes</th></tr></thead>
              <tbody>
                {[
                  ["MD", "3 years", "3 years", "Runs from date of accident"],
                  ["VA", "2 years", "5 years", ""],
                  ["DC", "3 years", "3 years", ""],
                  ["FL", "2 years", "4 years", "Changed from 4→2 yrs for BI in 2023"],
                  ["PA", "2 years", "2 years", ""],
                  ["IL", "2 years", "5 years", ""],
                  ["GA", "2 years", "4 years", ""],
                  ["MA", "3 years", "3 years", ""],
                  ["TX", "2 years", "2 years", ""],
                  ["NC", "3 years", "3 years", ""],
                  ["NJ", "2 years", "6 years", ""],
                  ["NY", "3 years", "3 years", ""],
                  ["OH", "2 years", "2 years", ""],
                ].map(([state, bi, pd, notes]) => (
                  <tr key={state} className="border-b border-border/20 hover:bg-muted/20">
                    <td className="px-3 py-2 font-bold text-primary">{state}</td>
                    <td className="px-3 py-2">{bi}</td>
                    <td className="px-3 py-2">{pd}</td>
                    <td className="px-3 py-2 text-muted-foreground">{notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ),
    },
    {
      id: "pip",
      title: "PIP / No-Fault States",
      badge: "Coverage",
      badgeColor: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
      content: (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">In no-fault states, each party's own insurer pays their medical bills regardless of fault (up to PIP limits). BI claims are restricted.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="bg-muted/40"><th className="text-left px-3 py-2">State</th><th className="text-left px-3 py-2">No-Fault?</th><th className="text-left px-3 py-2">PIP Minimum</th><th className="text-left px-3 py-2">BI Threshold to Sue</th></tr></thead>
              <tbody>
                {[
                  ["FL", "Yes", "$10,000", "Permanent injury, significant scarring, or death"],
                  ["NY", "Yes", "$50,000", "Serious injury threshold (fracture, significant limitation, etc.)"],
                  ["NJ", "Yes", "$15,000", "Verbal threshold (elected) or $0 threshold (tort option)"],
                  ["PA", "Yes (limited)", "$5,000", "Limited tort: serious injury only. Full tort: no threshold."],
                  ["MA", "Yes", "$8,000", "Medical bills >$2,000 or serious injury"],
                  ["MD", "No", "N/A", "Fault-based — no PIP threshold"],
                  ["VA", "No", "N/A", "Fault-based"],
                  ["IL", "No", "N/A", "Fault-based"],
                  ["GA", "No", "N/A", "Fault-based"],
                  ["TX", "No", "N/A", "Fault-based"],
                ].map(([state, nf, pip, threshold]) => (
                  <tr key={state} className="border-b border-border/20 hover:bg-muted/20">
                    <td className="px-3 py-2 font-bold text-primary">{state}</td>
                    <td className="px-3 py-2">{nf === "Yes" ? <span className="text-amber-600 font-medium">Yes</span> : <span className="text-muted-foreground">No</span>}</td>
                    <td className="px-3 py-2">{pip}</td>
                    <td className="px-3 py-2 text-muted-foreground">{threshold}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ),
    },
    {
      id: "coverage-defenses",
      title: "Coverage Defenses & Exclusions",
      badge: "Defenses",
      badgeColor: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
      content: (
        <div className="space-y-2">
          {[
            { defense: "Permissive Use Denial", desc: "Driver was not authorized to use the vehicle. Requires documentation that driver was explicitly excluded or that use was outside scope of permission." },
            { defense: "Excluded Driver", desc: "Named exclusion on the policy. Verify the exclusion endorsement is on file and the excluded driver was operating the vehicle." },
            { defense: "Non-Covered Vehicle", desc: "Vehicle was not listed on the policy or was added after the loss date. Verify VIN against policy schedule." },
            { defense: "Policy Lapse / Non-Payment", desc: "Policy was cancelled for non-payment prior to the loss. Verify cancellation effective date and any reinstatement." },
            { defense: "Intentional Act", desc: "Loss was the result of an intentional act by the insured. Not covered under standard auto policy." },
            { defense: "Criminal Act", desc: "Driver was engaged in a felony at the time of the loss. Coverage may be excluded depending on policy language." },
            { defense: "Outside TNC Period", desc: "For Whip claims — driver was in Period 0 (app off). Personal policy is primary; Whip has no obligation." },
            { defense: "Misrepresentation", desc: "Material misrepresentation on the application (e.g., wrong address, undisclosed drivers). May void the policy ab initio." },
          ].map(({ defense, desc }) => (
            <div key={defense} className="p-3 rounded-lg bg-muted/30 border border-border/30">
              <p className="font-semibold text-sm text-destructive mb-1">{defense}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      ),
    },
  ];

  const filtered = search
    ? sections.filter(s => s.title.toLowerCase().includes(search.toLowerCase()) || s.id.toLowerCase().includes(search.toLowerCase()))
    : sections;

  return (
    <WhipLayout>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Scale className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Liability Guide</h1>
            <p className="text-sm text-muted-foreground">Negligence standards, fault scenarios, coverage periods, and state-specific rules</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search sections…"
            className="pl-9 h-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Sections */}
        <div className="space-y-3">
          {filtered.map((section) => (
            <Accordion key={section.id} title={section.title} badge={section.badge} badgeColor={section.badgeColor}>
              {section.content}
            </Accordion>
          ))}
        </div>
      </div>
    </WhipLayout>
  );
}
