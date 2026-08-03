import { useState } from "react";
import WhipLayout from "@/components/WhipLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, ChevronDown, ChevronRight, ArrowRight, Phone, Mail, FileText } from "lucide-react";

function Accordion({ title, badge, badgeColor, children }: { title: string; badge?: string; badgeColor?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors">
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

const DENIAL_TYPES = [
  "Coverage Denial — Period 0",
  "Coverage Denial — Excluded Driver",
  "Coverage Denial — Non-Covered Vehicle",
  "Coverage Denial — Policy Lapse",
  "Liability Denial — Contributory Negligence",
  "Liability Denial — No Fault Found",
  "Liability Denial — Claimant Over Fault Threshold",
  "Medical Denial — Unrelated Treatment",
  "Medical Denial — Treatment Excessive / Not Reasonable",
  "PD Denial — ACV Dispute",
  "PD Denial — Pre-Existing Damage",
  "Total Loss Dispute",
  "Diminished Value Dispute",
];

const ESCALATION_PATHS: Record<string, { path: string; steps: string[]; contacts: string[]; urgency: "normal" | "urgent" | "legal" }> = {
  "Coverage Denial — Period 0": {
    path: "Coverage Review → Jasmine",
    urgency: "normal",
    steps: [
      "Pull trip log from Whip platform to confirm Period 0 status at time of loss.",
      "Issue coverage denial letter citing Period 0 — no TNC coverage obligation.",
      "Direct claimant to driver's personal auto insurer.",
      "If claimant disputes Period 0 status, escalate to Jasmine with trip log evidence.",
    ],
    contacts: ["Jasmine (coverage disputes)", "Legal if lawsuit filed"],
  },
  "Coverage Denial — Excluded Driver": {
    path: "Policy Review → Jasmine",
    urgency: "normal",
    steps: [
      "Confirm exclusion endorsement is on file and signed.",
      "Verify the excluded driver was the operator at time of loss (police report, witness statements).",
      "Issue denial letter citing excluded driver endorsement.",
      "If claimant argues driver was not excluded, escalate to Jasmine.",
    ],
    contacts: ["Jasmine (policy coverage)", "Klutch underwriting if endorsement unclear"],
  },
  "Liability Denial — Contributory Negligence": {
    path: "Liability Review → Jayla",
    urgency: "normal",
    steps: [
      "Document all evidence of claimant's fault (police report, photos, witness statements).",
      "Confirm state uses contributory negligence (MD, VA, DC, NC).",
      "Issue denial letter citing contributory negligence bar.",
      "If claimant files suit, route immediately to Jasmine/legal.",
    ],
    contacts: ["Jayla (liability evaluation)", "Jasmine if lawsuit filed"],
  },
  "Medical Denial — Treatment Excessive / Not Reasonable": {
    path: "Medical Review → Jayla",
    urgency: "normal",
    steps: [
      "Request all medical records and bills.",
      "Compare treatment to injury mechanism (low-speed impact vs. extensive treatment).",
      "Request IME (Independent Medical Examination) if treatment appears disproportionate.",
      "Issue partial denial or reduction letter with medical rationale.",
      "If claimant disputes, offer to review additional records before final denial.",
    ],
    contacts: ["Jayla (BI medical review)", "IME vendor if needed"],
  },
  "Total Loss Dispute": {
    path: "PD Review → Giovanni",
    urgency: "urgent",
    steps: [
      "Obtain CCC One or comparable ACV report.",
      "Provide claimant with written ACV determination and comparable vehicles.",
      "If claimant disputes ACV, request their comparable vehicles (must be same year/make/model/trim/mileage range).",
      "Negotiate within reasonable range — document all communications.",
      "If no resolution, advise claimant of appraisal clause rights (if applicable in state).",
    ],
    contacts: ["Giovanni (PD/total loss)", "Jasmine if legal action threatened"],
  },
};

export default function DeniedClaimEscalation() {
  const [denialType, setDenialType] = useState("");
  const [notes, setNotes] = useState("");
  const escalation = ESCALATION_PATHS[denialType];

  return (
    <WhipLayout>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Denied Claim Escalation</h1>
            <p className="text-sm text-muted-foreground">Escalation paths, required steps, and contacts for denied or disputed claims</p>
          </div>
        </div>

        {/* Quick lookup */}
        <Card className="border-border/50">
          <CardHeader className="pb-3"><CardTitle className="text-base">Quick Escalation Lookup</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs">Denial / Dispute Type</Label>
              <Select value={denialType} onValueChange={setDenialType}>
                <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Select denial type…" /></SelectTrigger>
                <SelectContent>{DENIAL_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {escalation && (
              <div className={`p-4 rounded-lg border-2 space-y-4 ${escalation.urgency === "legal" ? "border-red-500 bg-red-50 dark:bg-red-950/20" : escalation.urgency === "urgent" ? "border-amber-400 bg-amber-50 dark:bg-amber-950/20" : "border-primary/30 bg-primary/5"}`}>
                <div className="flex items-center gap-2">
                  <ArrowRight className="w-4 h-4 text-[#ff6221]" />
                  <span className="font-semibold text-sm">{escalation.path}</span>
                  {escalation.urgency !== "normal" && (
                    <Badge className={`text-xs border-0 ${escalation.urgency === "legal" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
                      {escalation.urgency === "legal" ? "🚨 Legal" : "⚠ Urgent"}
                    </Badge>
                  )}
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Required Steps</p>
                  {escalation.steps.map((step, i) => (
                    <div key={i} className="flex gap-3 text-sm">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center shrink-0 font-bold mt-0.5">{i + 1}</span>
                      {step}
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contacts</p>
                  {escalation.contacts.map((c, i) => (
                    <div key={i} className="flex gap-2 text-xs text-muted-foreground">
                      <Phone className="w-3.5 h-3.5 shrink-0 mt-0.5" />{c}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Reference sections */}
        <div className="space-y-3">
          <Accordion title="General Escalation Matrix" badge="Reference" badgeColor="bg-primary/10 text-primary">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="bg-muted/40"><th className="text-left px-3 py-2">Denial Type</th><th className="text-left px-3 py-2">Primary Handler</th><th className="text-left px-3 py-2">Escalate To</th><th className="text-left px-3 py-2">Timeline</th></tr></thead>
                <tbody>
                  {[
                    ["Coverage (Period 0, Exclusion, Lapse)", "Jasmine", "Legal if suit filed", "Acknowledge within 10 days"],
                    ["Liability (Contributory, No Fault)", "Jayla", "Jasmine if suit filed", "Deny within 30 days of investigation"],
                    ["BI / Medical Disputes", "Jayla", "Jasmine if suit filed", "Respond within 15 days of demand"],
                    ["PD / Total Loss Disputes", "Giovanni", "Jasmine if legal action", "Resolve within 30 days"],
                    ["Legal / Lawsuit Filed", "Jasmine", "Outside counsel", "Respond to suit within SOL / answer deadline"],
                    ["Regulatory / AG Complaint", "Jasmine", "Legal + management", "Respond within state-mandated timeframe"],
                  ].map(([type, primary, escalate, timeline]) => (
                    <tr key={type} className="border-b border-border/20 hover:bg-muted/20">
                      <td className="px-3 py-2 font-medium">{type}</td>
                      <td className="px-3 py-2">{primary}</td>
                      <td className="px-3 py-2 text-muted-foreground">{escalate}</td>
                      <td className="px-3 py-2 text-muted-foreground">{timeline}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Accordion>

          <Accordion title="State Regulatory Denial Requirements" badge="Compliance" badgeColor="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
            <p className="text-xs text-muted-foreground mb-2">States have specific requirements for denial letters — missing these can result in bad faith claims.</p>
            <div className="space-y-2">
              {[
                { state: "MD", req: "Written denial required within 30 days of proof of loss. Must cite specific policy provision. Must include appeal rights." },
                { state: "VA", req: "Written denial within 45 days. Must cite policy provision and factual basis." },
                { state: "FL", req: "Written denial within 90 days of proof of loss. Must include specific coverage provision cited." },
                { state: "PA", req: "Written denial within 15 business days of proof of loss." },
                { state: "IL", req: "Written denial within 30 days. Must include reason and policy provision." },
                { state: "GA", req: "Written denial within 15 days of proof of loss." },
                { state: "TX", req: "Written denial within 15 business days of receiving all items." },
                { state: "NY", req: "Written denial within 30 days. Failure to timely deny may waive coverage defenses." },
              ].map(({ state, req }) => (
                <div key={state} className="flex gap-3 p-2 rounded bg-muted/30">
                  <span className="font-bold text-primary w-8 shrink-0">{state}</span>
                  <span className="text-xs text-muted-foreground">{req}</span>
                </div>
              ))}
            </div>
          </Accordion>

          <Accordion title="Bad Faith Triggers — What to Avoid" badge="Critical" badgeColor="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
            <div className="space-y-2">
              {[
                "Failing to acknowledge a claim within the state-mandated timeframe",
                "Denying a claim without a reasonable investigation",
                "Misrepresenting policy provisions to the claimant",
                "Offering unreasonably low settlements to force acceptance",
                "Failing to promptly settle when liability is reasonably clear",
                "Delaying payment after a settlement agreement is reached",
                "Threatening litigation to discourage a claimant from pursuing a valid claim",
                "Failing to explain the basis for a denial in writing",
              ].map((item, i) => (
                <div key={i} className="flex gap-2 text-xs">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                  {item}
                </div>
              ))}
            </div>
          </Accordion>
        </div>
      </div>
    </WhipLayout>
  );
}
