import { useState } from "react";
import { AlertTriangle, CheckSquare, Square, ChevronDown, ChevronRight } from "lucide-react";

function Accordion({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-lg overflow-hidden mb-2">
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/70 text-left font-medium transition-colors"
        onClick={() => setOpen(!open)}
      >
        <span>{title}</span>
        {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
      </button>
      {open && <div className="px-4 py-3 text-sm space-y-2 bg-background">{children}</div>}
    </div>
  );
}

const CHECKLIST_REQUIRED = [
  "Recorded statement from the insured driver",
  "Confirmed date and time of loss",
  "Rideshare status at time of loss (Period 0 / 1 / 2 / 3)",
  "Photos — Whip vehicle damage",
  "Photos — third-party vehicle (if available)",
  "Written denial from the third-party carrier",
  "Statements from all involved parties",
];
const CHECKLIST_OBTAIN = [
  "Police report (required if one was filed)",
  "Witness statements",
];
const CHECKLIST_OPTIONAL = [
  "Scene photos",
  "Dashcam or telematics data",
  "Driver prior claim history",
  "Vehicle inspection or repair estimate",
];

export default function DeniedClaimEscalation() {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const toggle = (item: string) => setChecked(prev => {
    const next = new Set(prev);
    next.has(item) ? next.delete(item) : next.add(item);
    return next;
  });

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-1">Denied Claim Escalation</h1>
        <p className="text-muted-foreground text-sm">Process framework for pursuing recovery on claims denied by third-party carriers where our driver is confirmed not at fault.</p>
      </div>

      <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800 dark:text-amber-200">
          <strong>Why this process exists:</strong> When a third-party carrier denies a legitimate claim, Whip has legal standing to pursue recovery. This is not automatic — it requires documentation, a supervisor decision, and a sequenced approach. Skipping steps wastes time and weakens the position. Every escalation must be approved before it happens. Whip is not a member of ARB.
        </p>
      </div>

      {/* Threshold Gates */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Threshold Gates</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="border border-border rounded-lg p-4 bg-muted/20">
            <div className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-1">Auto-Close</div>
            <div className="text-lg font-bold mb-1">Under $3,000</div>
            <p className="text-sm text-muted-foreground">Cost of legal pursuit exceeds recovery. Close the file and absorb the loss.</p>
          </div>
          <div className="border border-amber-200 dark:border-amber-800 rounded-lg p-4 bg-amber-50/50 dark:bg-amber-950/20">
            <div className="text-xs font-mono uppercase tracking-wide text-amber-600 mb-1">Weigh Recovery Odds</div>
            <div className="text-lg font-bold mb-1">$3,000 – $10,000</div>
            <p className="text-sm text-muted-foreground">Escalation appropriate. Full checklist + roundtable required before any action.</p>
          </div>
          <div className="border border-green-200 dark:border-green-800 rounded-lg p-4 bg-green-50/50 dark:bg-green-950/20">
            <div className="text-xs font-mono uppercase tracking-wide text-green-600 mb-1">Full Escalation Eligible</div>
            <div className="text-lg font-bold mb-1">$10,000+</div>
            <p className="text-sm text-muted-foreground">Legal involvement clearly justified including total loss claims. Proceed through full pathway.</p>
          </div>
        </div>
      </div>

      {/* Decision Matrix */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Decision Matrix</h2>
        <p className="text-sm text-muted-foreground mb-3">All conditions in a row must be true to trigger that action.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-border rounded-lg overflow-hidden">
            <thead>
              <tr className="bg-muted/60">
                <th className="text-left px-3 py-2 font-semibold">Claim Value</th>
                <th className="text-left px-3 py-2 font-semibold">Docs Complete?</th>
                <th className="text-left px-3 py-2 font-semibold">Liability Defensible?</th>
                <th className="text-left px-3 py-2 font-semibold">Carrier Response</th>
                <th className="text-left px-3 py-2 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Under $3,000", "Any", "Any", "Any", "Auto-Close"],
                ["$3,000+", "Missing required items", "N/A", "N/A", "Hold — Get Missing Docs"],
                ["$3,000+", "All required present", "Needs review", "Denied", "Roundtable — Supervisor Required"],
                ["$3,000+", "All required present", "Confirmed defensible", "Denied", "Email — Liability Stance (Template 1)"],
                ["$3,000+", "All required present", "Confirmed defensible", "No response or continued denial", "File DOI Complaint (selective) + Email Template 2"],
                ["$3,000+", "All required present", "Confirmed defensible", "DOI filed — still no resolution", "Notice of Litigation (Template 3)"],
                ["$3,000+", "All required present", "Confirmed defensible", "No response to notice by deadline", "Retain Counsel (Template 4)"],
              ].map((row, i) => (
                <tr key={i} className="border-t border-border hover:bg-muted/20">
                  {row.map((cell, j) => (
                    <td key={j} className={`px-3 py-2 ${j === 4 ? "font-medium text-primary" : ""}`}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pre-Escalation Checklist */}
      <div>
        <h2 className="text-lg font-semibold mb-1">Pre-Escalation Checklist</h2>
        <p className="text-sm text-muted-foreground mb-3">Every required item must be confirmed before the claim goes to roundtable. Missing items = place on hold.</p>
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold mb-2 uppercase tracking-wide text-muted-foreground">Required Before Roundtable</h3>
            <div className="space-y-2">
              {CHECKLIST_REQUIRED.map(item => (
                <button key={item} onClick={() => toggle(item)} className="w-full flex items-center gap-3 text-left text-sm hover:bg-muted/30 rounded px-2 py-1 transition-colors">
                  {checked.has(item) ? <CheckSquare className="h-4 w-4 text-green-500 shrink-0" /> : <Square className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <span className={checked.has(item) ? "line-through text-muted-foreground" : ""}>{item}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-2 uppercase tracking-wide text-muted-foreground">Obtain If Available</h3>
            <div className="space-y-2">
              {CHECKLIST_OBTAIN.map(item => (
                <button key={item} onClick={() => toggle(item)} className="w-full flex items-center gap-3 text-left text-sm hover:bg-muted/30 rounded px-2 py-1 transition-colors">
                  {checked.has(item) ? <CheckSquare className="h-4 w-4 text-green-500 shrink-0" /> : <Square className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <span className={checked.has(item) ? "line-through text-muted-foreground" : ""}>{item}</span>
                </button>
              ))}
              {CHECKLIST_OPTIONAL.map(item => (
                <button key={item} onClick={() => toggle(item)} className="w-full flex items-center gap-3 text-left text-sm hover:bg-muted/30 rounded px-2 py-1 transition-colors">
                  {checked.has(item) ? <CheckSquare className="h-4 w-4 text-green-500 shrink-0" /> : <Square className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <span className={checked.has(item) ? "line-through text-muted-foreground" : ""}>{item} <span className="text-xs text-muted-foreground ml-1">OPTIONAL</span></span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Step-by-Step Workflow */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Step-by-Step Workflow</h2>
        <Accordion title="Carrier Denies Liability">
          <ol className="space-y-2">
            {[
              "Within 5 business days — review denial thoroughly. Compare to police report and evidence.",
              "Identify weaknesses or unsupported conclusions in the denial.",
              "If denial lacks merit: send written rebuttal citing specific evidence. 10-day response deadline.",
              "If denial stands: evaluate cost-benefit of litigation. Issue Notice of Intent to File Suit OR close if not economically viable — document either way.",
            ].map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">{i + 1}</span>
                <p>{step}</p>
              </li>
            ))}
          </ol>
        </Accordion>
        <Accordion title="Carrier Makes Low Offer">
          <ol className="space-y-2">
            {[
              "Within 5 business days — evaluate liability strength. Calculate recovery vs. risk.",
              "Determine counter strategy.",
              "If offer is materially low: send structured counteroffer. Reinforce liability position and evidence. Set 10-day deadline.",
              "If negotiations stall: escalate to DOI complaint or litigation notice.",
            ].map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">{i + 1}</span>
                <p>{step}</p>
              </li>
            ))}
          </ol>
        </Accordion>
        <Accordion title="Carrier Ignores Demand">
          <p>Follow the strict cadence — non-response does not pause the file. Day 7 → 21 → 30 → 45 escalation action.</p>
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded p-3 mt-2">
            <p className="text-amber-800 dark:text-amber-200 text-xs">After Day 45 with no response: file DOI complaint, issue Notice of Intent to File Suit, or prepare litigation referral package. Document whichever action is taken.</p>
          </div>
        </Accordion>
      </div>

      {/* DOI Complaint Links */}
      <div>
        <h2 className="text-lg font-semibold mb-3">DOI Complaint Links</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {[
            { state: "Maryland", url: "https://www.insurance.maryland.gov/Pages/consumer/fileacomplaint.aspx" },
            { state: "Georgia", url: "https://oci.georgia.gov/file-complaint" },
            { state: "Illinois", url: "https://insurance.illinois.gov/Pages/Complaints.aspx" },
            { state: "Pennsylvania", url: "https://www.insurance.pa.gov/Consumers/Pages/FilingAComplaint.aspx" },
            { state: "Florida", url: "https://www.myfloridacfo.com/division/consumers/filing-a-complaint" },
            { state: "Virginia", url: "https://www.scc.virginia.gov/pages/Received-a-Notice-from-Your-Insurance-Company" },
          ].map(({ state, url }) => (
            <a key={state} href={url} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-between px-3 py-2 border border-border rounded-lg hover:bg-muted/40 transition-colors text-sm font-medium">
              {state} <span className="text-muted-foreground text-xs">↗</span>
            </a>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">Log DOI filing in the claim after submission.</p>
      </div>

      {/* Litigation & Suit Referral */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Litigation &amp; Suit Referral</h2>
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold mb-2">Before Filing Suit — Evaluate:</h3>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li>Total recovery amount — is it worth it?</li>
              <li>Strength of evidence</li>
              <li>Filing costs versus expected recovery</li>
              <li>Collectability of judgment</li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-2">Pre-Suit Requirement:</h3>
            <p className="text-sm">Issue a formal Notice of Intent to File Suit with 10–14 day deadline. If no resolution → send suit referral package to outside counsel.</p>
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-2">Suit Referral Package Must Include:</h3>
            <ol className="list-decimal pl-5 space-y-1 text-sm">
              <li>Full demand package (liability analysis, police report, photos, estimate/invoice, proof of payment)</li>
              <li>Clear written liability summary (date/time/location, factual accident summary, legal theory)</li>
              <li>Summary of all contact attempts with adverse carrier</li>
              <li>Copies of all communications to/from adverse carrier</li>
              <li>Copy of denial letter or documentation of non-response</li>
              <li>Statute of limitations reviewed and confirmed</li>
            </ol>
          </div>
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
            <p className="text-sm text-amber-800 dark:text-amber-200">The referral summary must be concise, organized, and litigation-ready.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
