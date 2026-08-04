import { useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";

function Accordion({ title, children, defaultOpen }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
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

const MARKETS = [
  {
    abbr: "MD", name: "Maryland", city: "Glen Burnie / Baltimore",
    polPrefix: "MD000S0137", active: true,
    negligence: "Pure Contributory",
    notes: "Primary market. Even 1% fault = no recovery. Strict documentation required.",
    coverage: { p1: "$50k/$100k BI, $25k PD (contingent)", p2p3: "$1M CSL BI/PD (Klutch commercial)", um: "UM required (can reject in writing)", pip: "Not required" },
  },
  {
    abbr: "VA", name: "Virginia", city: "Richmond / Northern VA",
    polPrefix: "VA000S0137", active: true,
    negligence: "Pure Contributory",
    notes: "Same strict bar as MD. Any claimant fault = no recovery.",
    coverage: { p1: "$50k/$100k BI, $25k PD (contingent)", p2p3: "$1M CSL BI/PD (Klutch commercial)", um: "UM required", pip: "Not required" },
  },
  {
    abbr: "PA", name: "Pennsylvania", city: "Philadelphia",
    polPrefix: "PA000S0137", active: true,
    negligence: "Modified Comparative (51% Bar)",
    notes: "Limited tort / full tort election. PIP required. Recovery if <51% at fault.",
    coverage: { p1: "$50k/$100k BI, $25k PD (contingent)", p2p3: "$1M CSL BI/PD (Klutch commercial)", um: "UM required", pip: "$5,000 min PIP" },
  },
  {
    abbr: "FL", name: "Florida", city: "Miami / Orlando",
    polPrefix: "FL000S0137", active: true,
    negligence: "Pure Comparative",
    notes: "No-fault state. PIP pays first. BI threshold: permanent injury or death. Changed from pure comparative to 50% bar in 2023.",
    coverage: { p1: "$50k/$100k BI, $25k PD (contingent)", p2p3: "$1M CSL BI/PD (Klutch commercial)", um: "UM not required", pip: "$10,000 PIP required" },
  },
  {
    abbr: "IL", name: "Illinois", city: "Chicago",
    polPrefix: "IL000S0137", active: true,
    negligence: "Modified Comparative (51% Bar)",
    notes: "Recovery if 50% or less at fault. No PIP requirement.",
    coverage: { p1: "$50k/$100k BI, $25k PD (contingent)", p2p3: "$1M CSL BI/PD (Klutch commercial)", um: "UM required", pip: "Not required" },
  },
  {
    abbr: "GA", name: "Georgia", city: "Atlanta",
    polPrefix: "GA000S0137", active: true,
    negligence: "Modified Comparative (50% Bar)",
    notes: "Recovery if 49% or less at fault. UM rejection available.",
    coverage: { p1: "$50k/$100k BI, $25k PD (contingent)", p2p3: "$1M CSL BI/PD (Klutch commercial)", um: "UM required (rejection available)", pip: "Not required" },
  },
  {
    abbr: "MA", name: "Massachusetts", city: "Boston",
    polPrefix: "MA000S0137", active: true,
    negligence: "Modified Comparative (51% Bar)",
    notes: "No-fault state. PIP pays first. BI threshold: $2,000+ medical or serious injury.",
    coverage: { p1: "$50k/$100k BI, $25k PD (contingent)", p2p3: "$1M CSL BI/PD (Klutch commercial)", um: "UM required", pip: "$8,000 PIP required" },
  },
  {
    abbr: "TX", name: "Texas", city: "Dallas / Houston",
    polPrefix: "TX000S0137", active: true,
    negligence: "Modified Comparative (51% Bar)",
    notes: "No PIP requirement. Recovery if 50% or less at fault.",
    coverage: { p1: "$50k/$100k BI, $25k PD (contingent)", p2p3: "$1M CSL BI/PD (Klutch commercial)", um: "UM required", pip: "Not required" },
  },
];

const GLOSSARY_TERMS = [
  { term: "Actual Cash Value (ACV)", def: "The fair market value of a vehicle immediately before a loss, accounting for depreciation. Used to determine total loss settlements." },
  { term: "Adverse Carrier", def: "The insurance company representing the at-fault party in a third-party claim." },
  { term: "ADAS", def: "Advanced Driver Assistance Systems. Cameras, sensors, and radar systems (e.g., Tesla Autopilot). Require calibration after any repair involving the windshield, bumpers, or front/rear sensors." },
  { term: "Argyle", def: "Whip's TNC trip status verification tool. Used to confirm which rideshare period a driver was in at the time of loss." },
  { term: "BI (Bodily Injury)", def: "Coverage for injuries sustained by third parties in an accident where our driver is at fault. Includes medical bills, lost wages, pain and suffering." },
  { term: "Claimant", def: "A third party making a claim against our insured driver. Not the same as the insured (member)." },
  { term: "Collision Coverage", def: "Covers damage to the Whip vehicle from a collision, regardless of fault. Subject to deductible." },
  { term: "Comprehensive Coverage", def: "Covers non-collision damage: theft, vandalism, weather, glass, fire. Subject to deductible." },
  { term: "Contributory Negligence", def: "Legal doctrine in MD, VA, and DC: if the claimant is even 1% at fault, they recover nothing. Strict standard — document carefully." },
  { term: "CSL (Combined Single Limit)", def: "A single policy limit covering both BI and PD combined, rather than separate per-person/per-occurrence limits. Whip's P2/P3 coverage is $1M CSL." },
  { term: "Deductible", def: "The amount the insured pays out-of-pocket before insurance coverage applies. Whip's standard deductible is $2,500." },
  { term: "Demand Letter", def: "A formal written request for payment of damages. Starts the clock on response deadlines. Must include liability basis, damages, and a response deadline." },
  { term: "Diary", def: "The scheduled follow-up date for a claim file. Every open file must have an active diary. Missing diaries = missed deadlines." },
  { term: "Diminished Value (DV)", def: "The reduction in a vehicle's market value after it has been in an accident and repaired. Third parties may claim DV in addition to repair costs." },
  { term: "DOI", def: "Department of Insurance. State regulatory body that oversees insurance companies. Complaints can be filed if a carrier acts in bad faith." },
  { term: "FNOL", def: "First Notice of Loss. The initial report of an accident or incident. Whip's FNOL form is at drivewhip.com/rideshare/accident/." },
  { term: "Klutch", def: "Whip's commercial auto insurance carrier. Provides P2/P3 coverage ($1M CSL). Policy numbers follow the format [STATE]000S0137." },
  { term: "LOR (Letter of Representation)", def: "A letter from an attorney stating they represent a claimant. Once received, all communication must go through the attorney — not the claimant directly." },
  { term: "Loss of Use (LOU)", def: "Compensation for the time a claimant's vehicle is out of service due to the accident. Calculated as rental rate × days of repair." },
  { term: "Metrocars", def: "Whip's rental fleet program. Vehicles rented through Metrocars are covered under the Metrocars policy, not Klutch." },
  { term: "PD (Property Damage)", def: "Coverage for damage to third-party property (vehicles, structures, etc.) caused by our driver." },
  { term: "Period 0", def: "App off. Driver's personal auto policy is primary. Whip has no coverage obligation." },
  { term: "Period 1", def: "App on, no ride accepted. Contingent liability coverage: $50k/$100k BI, $25k PD. Applies only if driver's personal policy denies." },
  { term: "Period 2", def: "Ride accepted, en route to pickup. Full Klutch commercial policy applies. $1M CSL. Whip is primary." },
  { term: "Period 3", def: "Passenger on board. Full Klutch commercial policy applies. $1M CSL. Whip is primary." },
  { term: "PIP (Personal Injury Protection)", def: "No-fault coverage that pays the insured's medical bills regardless of fault. Required in FL, MA, PA, NJ, NY." },
  { term: "Pro-Rata", def: "Method of calculating the earned/unearned portion of a premium based on the number of days the policy was in force." },
  { term: "Reserves", def: "Money set aside to pay a claim. Must be set accurately and updated as the claim develops." },
  { term: "Snapsheet", def: "Whip's primary claims management system (CRM). All claims filed after Oct 27, 2025 are in Snapsheet." },
  { term: "SOL (Statute of Limitations)", def: "The deadline to file a lawsuit. Varies by state and claim type. Missing the SOL bars the claim entirely." },
  { term: "Subrogation", def: "The right to recover money paid out on a claim from the at-fault third party or their insurer." },
  { term: "TNC (Transportation Network Company)", def: "A rideshare company (Uber, Lyft, Whip). TNC coverage rules apply based on which period the driver was in at the time of loss." },
  { term: "Total Loss", def: "When the cost to repair a vehicle exceeds its ACV (or a state-defined threshold). Settled at ACV minus deductible." },
  { term: "UM/UIM (Uninsured/Underinsured Motorist)", def: "Coverage that pays when the at-fault driver has no insurance or insufficient insurance. Required in most Whip operating states." },
];

const TOS_SECTIONS = [
  {
    title: "Protection Plan — What's Covered",
    content: "The Whip Protection Plan (PP) covers physical damage to the rented vehicle up to the plan limits, subject to exclusions. PP is not insurance — it is a contractual waiver of the member's liability for covered damage. Coverage is per-incident, not per-rental period.",
  },
  {
    title: "Protection Plan — What's Excluded",
    content: "PP does not cover: (1) Damage caused by intentional acts or gross negligence. (2) Damage to tires and wheels from road hazards (potholes, curbs) unless caused by a collision. (3) Interior damage from smoking, spills, or pet damage. (4) Damage to the charge port from drive-off while charging. (5) Damage occurring while the vehicle is operated outside the 150-mile radius. (6) Damage while the vehicle is used for a prohibited purpose (racing, commercial delivery, etc.).",
  },
  {
    title: "Member Responsibilities at Time of Accident",
    content: "Members must: (1) Stop and remain at the scene. (2) Call 911 if there are injuries. (3) Exchange information with all parties. (4) Report the accident to Whip within 24 hours via the FNOL form at drivewhip.com/rideshare/accident/. (5) Not admit fault or make any payment to any party. (6) Cooperate fully with the claims investigation. Failure to report within 24 hours may result in denial of the Protection Plan.",
  },
  {
    title: "Deductible",
    content: "The standard Whip deductible is $2,500 per incident. The deductible applies to all covered claims under the Protection Plan. Members are responsible for the deductible regardless of fault. If Whip recovers from a third party, the deductible may be refunded proportionally.",
  },
  {
    title: "150-Mile Radius Restriction",
    content: "Members may not operate the vehicle more than 150 miles from the vehicle's home market. Damage occurring outside the 150-mile radius is not covered by the Protection Plan. Whip may track vehicle location via telematics to verify compliance.",
  },
  {
    title: "Prohibited Uses",
    content: "The vehicle may not be used for: racing or speed contests, driving instruction for compensation, transporting hazardous materials, moving services or commercial delivery, operation by an unauthorized driver, or any illegal purpose. Damage resulting from prohibited use voids Protection Plan coverage.",
  },
  {
    title: "Damage Fees",
    content: "Members are responsible for damage fees assessed after a vehicle inspection. Fees are based on the cost of repair, diminished value, and loss of use during repair. Whip will provide an itemized statement of charges. Members may dispute damage fees within 10 days of receipt.",
  },
  {
    title: "Dispute Resolution",
    content: "Disputes arising under the Whip membership agreement are subject to binding arbitration under the AAA Consumer Arbitration Rules. Members waive the right to a jury trial and to participate in class action proceedings. Arbitration is conducted in the member's home state.",
  },
];

export default function MarketsAndPolicy() {
  const [search, setSearch] = useState("");
  const [glossarySearch, setGlossarySearch] = useState("");
  const [activeTab, setActiveTab] = useState<"markets" | "tos" | "glossary">("markets");

  const filteredMarkets = MARKETS.filter(m =>
    m.abbr.toLowerCase().includes(search.toLowerCase()) ||
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.city.toLowerCase().includes(search.toLowerCase())
  );

  const filteredGlossary = GLOSSARY_TERMS.filter(t =>
    t.term.toLowerCase().includes(glossarySearch.toLowerCase()) ||
    t.def.toLowerCase().includes(glossarySearch.toLowerCase())
  );

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Markets, Policy &amp; Terms</h1>
        <p className="text-muted-foreground text-sm">Active Whip markets, coverage structures, Drivewhip Terms of Service, and claims glossary.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(["markets", "tos", "glossary"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "tos" ? "Terms of Service" : tab === "markets" ? "Markets & Coverage" : "Glossary"}
          </button>
        ))}
      </div>

      {/* Markets Tab */}
      {activeTab === "markets" && (
        <div className="space-y-4">
          <Input
            placeholder="Search markets..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <div className="space-y-2">
            {filteredMarkets.map(m => (
              <Accordion key={m.abbr} title={`${m.abbr} — ${m.name} (${m.city})`}>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-1">Policy Prefix</p>
                    <p className="font-medium">{m.polPrefix}</p>
                  </div>
                  <div>
                    <p className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-1">Negligence Standard</p>
                    <p className="font-medium">{m.negligence}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-1">Coverage by Period</p>
                  <div className="space-y-1">
                    <div className="flex gap-3 text-xs"><span className="w-16 text-muted-foreground shrink-0">Period 1</span><span>{m.coverage.p1}</span></div>
                    <div className="flex gap-3 text-xs"><span className="w-16 text-muted-foreground shrink-0">P2 / P3</span><span>{m.coverage.p2p3}</span></div>
                    <div className="flex gap-3 text-xs"><span className="w-16 text-muted-foreground shrink-0">UM/UIM</span><span>{m.coverage.um}</span></div>
                    <div className="flex gap-3 text-xs"><span className="w-16 text-muted-foreground shrink-0">PIP</span><span>{m.coverage.pip}</span></div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground border-t border-border pt-2">{m.notes}</p>
              </Accordion>
            ))}
          </div>
        </div>
      )}

      {/* Terms of Service Tab */}
      {activeTab === "tos" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Key provisions from the Drivewhip Member Agreement relevant to claims handling.</p>
            <a href="https://www.drivewhip.com/terms-of-service/" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-primary hover:underline">
              View Full ToS <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div className="space-y-1">
            {TOS_SECTIONS.map(s => (
              <Accordion key={s.title} title={s.title}>
                <p>{s.content}</p>
              </Accordion>
            ))}
          </div>
        </div>
      )}

      {/* Glossary Tab */}
      {activeTab === "glossary" && (
        <div className="space-y-4">
          <Input
            placeholder="Search glossary..."
            value={glossarySearch}
            onChange={e => setGlossarySearch(e.target.value)}
            className="max-w-sm"
          />
          <div className="space-y-1">
            {filteredGlossary.map(t => (
              <div key={t.term} className="border border-border rounded-lg px-4 py-3">
                <p className="font-semibold text-sm mb-1">{t.term}</p>
                <p className="text-sm text-muted-foreground">{t.def}</p>
              </div>
            ))}
            {filteredGlossary.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">No terms match "{glossarySearch}"</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
