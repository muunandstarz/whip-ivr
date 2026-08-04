import { useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, MapPin, Phone, Truck, Shield, BookOpen, Copy, Check, Wrench, Building2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import WhipLayout from "@/components/WhipLayout";
import { toast } from "sonner";

// ── Data ─────────────────────────────────────────────────────────────────────

const MARKET_DIRECTORY = [
  { state: "MARYLAND", color: "#ff6221", city: "Rockville", address: "14670 Southlawn Ln, Rockville, MD 20850", towing: "Urgently (DC)", towingPOC: "Josue (Enrique Ramos Sorto)", towingBackup: "", claimsImpound: "", onSite: "" },
  { state: "MARYLAND", color: "#ff6221", city: "Glen Burnie", address: "7409 Ritchie Hwy, Glen Burnie, MD 21061", towing: "Urgently (DC)", towingPOC: "Josue (Enrique Ramos Sorto)", towingBackup: "", claimsImpound: "", onSite: "" },
  { state: "GEORGIA", color: "#2e7d32", city: "Atlanta", address: "1931 Roosevelt Hwy A, College Park, GA 30337", towing: "Bar Recovery LLC", towingPOC: "Darryl Leach", towingBackup: "barrecoveryllc@gmail.com · $75 hookup + $4/mi", claimsImpound: "", onSite: "" },
  { state: "ILLINOIS", color: "#1565c0", city: "Chicago", address: "2120 W Lake St, Chicago, IL 60612", towing: "Dark Angel Towing", towingPOC: "Nadia · (312) 623-2900", towingBackup: "nadia@darkangeltowing.com", claimsImpound: "", onSite: "" },
  { state: "FLORIDA", color: "#e65100", city: "Miami", address: "1633 NW 27th Ave, Miami, FL 33125", towing: "", towingPOC: "", towingBackup: "", claimsImpound: "Sara", onSite: "Edgar" },
  { state: "FLORIDA", color: "#e65100", city: "Orlando", address: "6050 S Semoran Blvd, Orlando, FL 32822", towing: "", towingPOC: "", towingBackup: "", claimsImpound: "Sara", onSite: "" },
  { state: "VIRGINIA", color: "#6a1b9a", city: "Richmond", address: "Richmond, VA", towing: "", towingPOC: "", towingBackup: "", claimsImpound: "", onSite: "" },
  { state: "PENNSYLVANIA", color: "#4527a0", city: "Philadelphia", address: "Philadelphia, PA", towing: "", towingPOC: "", towingBackup: "", claimsImpound: "", onSite: "" },
  { state: "MASSACHUSETTS", color: "#00695c", city: "Boston", address: "Boston, MA", towing: "", towingPOC: "", towingBackup: "", claimsImpound: "", onSite: "" },
  { state: "TEXAS", color: "#bf360c", city: "Dallas", address: "Dallas, TX", towing: "", towingPOC: "", towingBackup: "", claimsImpound: "", onSite: "" },
];

const REPAIR_SHOPS = [
  { market: "MD — Rockville", name: "Caliber Collision Rockville", address: "15800 Shady Grove Rd, Rockville, MD 20850", phone: "(301) 963-3700", preferred: true },
  { market: "MD — Glen Burnie", name: "Caliber Collision Glen Burnie", address: "7409 Ritchie Hwy, Glen Burnie, MD 21061", phone: "(410) 761-2886", preferred: true },
  { market: "GA — Atlanta", name: "Service King Atlanta", address: "1931 Roosevelt Hwy, College Park, GA 30337", phone: "(404) 762-1100", preferred: true },
  { market: "IL — Chicago", name: "Gerber Collision Chicago", address: "2120 W Lake St, Chicago, IL 60612", phone: "(312) 421-8200", preferred: true },
  { market: "FL — Miami", name: "Caliber Collision Miami", address: "1633 NW 27th Ave, Miami, FL 33125", phone: "(305) 635-4000", preferred: true },
  { market: "FL — Orlando", name: "Caliber Collision Orlando", address: "6050 S Semoran Blvd, Orlando, FL 32822", phone: "(407) 380-0100", preferred: true },
];

const TOW_PARTNERS = [
  { market: "MD / VA (DC Metro)", name: "Urgently", contact: "Josue (Enrique Ramos Sorto)", phone: "Via Urgently app", notes: "Primary tow partner for DC metro area. Dispatch through Urgently platform." },
  { market: "GA — Atlanta", name: "Bar Recovery LLC", contact: "Darryl Leach", phone: "barrecoveryllc@gmail.com", notes: "$75 hookup + $4/mi. Call Darryl directly for Atlanta market." },
  { market: "IL — Chicago", name: "Dark Angel Towing", contact: "Nadia", phone: "(312) 623-2900", notes: "nadia@darkangeltowing.com. Primary Chicago tow partner." },
];

const COVERAGE_MARKETS = [
  { abbr: "MD", name: "Maryland", city: "Glen Burnie / Baltimore", polPrefix: "MD000S0137", negligence: "Pure Contributory", notes: "Primary market. Even 1% fault = no recovery. Strict documentation required.", coverage: { p1: "$50k/$100k BI, $25k PD (contingent)", p2p3: "$1M CSL BI/PD (Klutch commercial)", um: "UM required (can reject in writing)", pip: "Full PIP $2,500 (default) | Limited PIP — Member Election | PIP Waived — Member Election" } },
  { abbr: "VA", name: "Virginia", city: "Richmond / Northern VA", polPrefix: "VA000S0137", negligence: "Pure Contributory", notes: "Same strict bar as MD. Any claimant fault = no recovery.", coverage: { p1: "$50k/$100k BI, $25k PD (contingent)", p2p3: "$1M CSL BI/PD (Klutch commercial)", um: "UM required", pip: "Not required" } },
  { abbr: "PA", name: "Pennsylvania", city: "Philadelphia", polPrefix: "PA000S0137", negligence: "Modified Comparative (51% Bar)", notes: "Limited tort / full tort election. PIP required. Recovery if <51% at fault.", coverage: { p1: "$50k/$100k BI, $25k PD (contingent)", p2p3: "$1M CSL BI/PD (Klutch commercial)", um: "UM required", pip: "$5,000 min PIP" } },
  { abbr: "FL", name: "Florida", city: "Miami / Orlando", polPrefix: "FL000S0137", negligence: "Pure Comparative", notes: "No-fault state. PIP pays first. BI threshold: permanent injury or death.", coverage: { p1: "$50k/$100k BI, $25k PD (contingent)", p2p3: "$1M CSL BI/PD (Klutch commercial)", um: "UM not required", pip: "$10,000 PIP required" } },
  { abbr: "IL", name: "Illinois", city: "Chicago", polPrefix: "IL000S0137", negligence: "Modified Comparative (51% Bar)", notes: "Recovery if 50% or less at fault. No PIP requirement.", coverage: { p1: "$50k/$100k BI, $25k PD (contingent)", p2p3: "$1M CSL BI/PD (Klutch commercial)", um: "UM required", pip: "Not required" } },
  { abbr: "GA", name: "Georgia", city: "Atlanta", polPrefix: "GA000S0137", negligence: "Modified Comparative (50% Bar)", notes: "Recovery if 49% or less at fault. UM rejection available.", coverage: { p1: "$50k/$100k BI, $25k PD (contingent)", p2p3: "$1M CSL BI/PD (Klutch commercial)", um: "UM required (rejection available — O.C.G.A. § 33-7-11)", pip: "Not required" } },
  { abbr: "MA", name: "Massachusetts", city: "Boston", polPrefix: "MA000S0137", negligence: "Modified Comparative (51% Bar)", notes: "No-fault state. PIP pays first. BI threshold: $2,000+ medical or serious injury.", coverage: { p1: "$50k/$100k BI, $25k PD (contingent)", p2p3: "$1M CSL BI/PD (Klutch commercial)", um: "UM required", pip: "$8,000 PIP required" } },
  { abbr: "TX", name: "Texas", city: "Dallas / Houston", polPrefix: "TX000S0137", negligence: "Modified Comparative (51% Bar)", notes: "No PIP requirement. Recovery if 50% or less at fault.", coverage: { p1: "$50k/$100k BI, $25k PD (contingent)", p2p3: "$1M CSL BI/PD (Klutch commercial)", um: "UM required", pip: "Not required" } },
];

const GLOSSARY_TERMS = [
  { term: "ACV (Actual Cash Value)", def: "The fair market value of a vehicle immediately before the loss, considering depreciation. Used to settle total loss claims." },
  { term: "ADAS", def: "Advanced Driver Assistance Systems. Cameras, sensors, and radar systems (e.g., Tesla Autopilot). Require calibration after any repair involving the windshield, bumpers, or front/rear sensors." },
  { term: "Adverse Carrier", def: "The insurance company representing the at-fault party in a third-party claim." },
  { term: "Argyle", def: "Whip's TNC trip status verification tool. Used to confirm which rideshare period a driver was in at the time of loss." },
  { term: "BI (Bodily Injury)", def: "Coverage for injuries sustained by third parties in an accident where our driver is at fault. Includes medical bills, lost wages, pain and suffering." },
  { term: "Claimant", def: "A third party making a claim against our insured driver. Not the same as the insured (member)." },
  { term: "Contributory Negligence", def: "Legal doctrine in MD, VA, and DC: if the claimant is even 1% at fault, they recover nothing. Strict standard — document carefully." },
  { term: "CSL (Combined Single Limit)", def: "A single policy limit covering both BI and PD combined, rather than separate per-person/per-occurrence limits. Whip's P2/P3 coverage is $1M CSL." },
  { term: "Deductible", def: "The amount the insured pays out-of-pocket before insurance coverage applies. Whip's standard deductible is $2,500." },
  { term: "Demand Letter", def: "A formal written request for payment of damages. Starts the clock on response deadlines. Must include liability basis, damages, and a response deadline." },
  { term: "Diary", def: "The scheduled follow-up date for a claim file. Every open file must have an active diary. Missing diaries = missed deadlines." },
  { term: "DV (Diminished Value)", def: "The reduction in a vehicle's market value after it has been in an accident and repaired. Third parties may claim DV in addition to repair costs." },
  { term: "FNOL", def: "First Notice of Loss. The initial report of an accident or incident. Whip's FNOL form is at drivewhip.com/rideshare/accident/." },
  { term: "Klutch", def: "Whip's commercial auto insurance carrier. Provides P2/P3 coverage ($1M CSL). Policy numbers follow the format [STATE]000S0137." },
  { term: "LOR (Letter of Representation)", def: "A letter from an attorney stating they represent a claimant. Once received, all communication must go through the attorney — not the claimant directly." },
  { term: "LOU (Loss of Use)", def: "Compensation for the time a claimant's vehicle is out of service due to the accident. Calculated as rental rate × days of repair." },
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
  { title: "Protection Plan — What's Covered", content: "The Whip Protection Plan (PP) covers physical damage to the rented vehicle up to the plan limits, subject to exclusions. PP is not insurance — it is a contractual waiver of the member's liability for covered damage. Coverage is per-incident, not per-rental period." },
  { title: "Protection Plan — What's Excluded", content: "PP does not cover: (1) Damage caused by intentional acts or gross negligence. (2) Damage to tires and wheels from road hazards (potholes, curbs) unless caused by a collision. (3) Interior damage from smoking, spills, or pet damage. (4) Damage to the charge port from drive-off while charging. (5) Damage occurring while the vehicle is operated outside the 150-mile radius. (6) Damage while the vehicle is used for a prohibited purpose (racing, commercial delivery, etc.)." },
  { title: "Member Responsibilities at Time of Accident", content: "Members must: (1) Stop and remain at the scene. (2) Call 911 if there are injuries. (3) Exchange information with all parties. (4) Report the accident to Whip within 24 hours via the FNOL form at drivewhip.com/rideshare/accident/. (5) Not admit fault or make any payment to any party. (6) Cooperate fully with the claims investigation. Failure to report within 24 hours may result in denial of the Protection Plan." },
  { title: "Deductible", content: "The standard Whip deductible is $2,500 per incident. The deductible applies to all covered claims under the Protection Plan. Members are responsible for the deductible regardless of fault. If Whip recovers from a third party, the deductible may be refunded proportionally." },
  { title: "150-Mile Radius Restriction", content: "Members may not operate the vehicle more than 150 miles from the vehicle's home market. Damage occurring outside the 150-mile radius is not covered by the Protection Plan. Whip may track vehicle location via telematics to verify compliance." },
  { title: "Prohibited Uses", content: "The vehicle may not be used for: racing or speed contests, driving instruction for compensation, transporting hazardous materials, moving services or commercial delivery, operation by an unauthorized driver, or any illegal purpose. Damage resulting from prohibited use voids Protection Plan coverage." },
  { title: "Damage Fees", content: "Members are responsible for damage fees assessed after a vehicle inspection. Fees are based on the cost of repair, diminished value, and loss of use during repair. Whip will provide an itemized statement of charges. Members may dispute damage fees within 10 days of receipt." },
  { title: "Dispute Resolution", content: "Disputes arising under the Whip membership agreement are subject to binding arbitration under the AAA Consumer Arbitration Rules. Members waive the right to a jury trial and to participate in class action proceedings. Arbitration is conducted in the member's home state." },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function MarketCard({ m }: { m: typeof MARKET_DIRECTORY[0] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-start justify-between p-4 text-left hover:bg-muted/30 transition-colors">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest mb-1" style={{ color: m.color }}>{m.state}</p>
          <p className="font-bold text-base">{m.city}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{m.address}</p>
        </div>
        <div className="flex items-center gap-1 mt-1 shrink-0">
          <span className="text-xs text-primary">{open ? "Collapse" : "Click to expand →"}</span>
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>
      {open && (
        <div className="border-t border-border px-4 py-4 bg-muted/10 space-y-3 text-sm">
          {m.towing && (
            <div className="flex gap-3">
              <Truck className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Towing</p>
                <p className="font-medium">{m.towing}</p>
                {m.towingPOC && <p className="text-xs text-muted-foreground">POC: {m.towingPOC}</p>}
                {m.towingBackup && <p className="text-xs text-muted-foreground">{m.towingBackup}</p>}
              </div>
            </div>
          )}
          {m.onSite && (
            <div className="flex gap-3">
              <Building2 className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">On-Site</p>
                <p className="font-medium">{m.onSite}</p>
              </div>
            </div>
          )}
          {m.claimsImpound && (
            <div className="flex gap-3">
              <Shield className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Claims / Impound</p>
                <p className="font-medium">{m.claimsImpound}</p>
              </div>
            </div>
          )}
          {!m.towing && !m.onSite && !m.claimsImpound && (
            <p className="text-xs text-muted-foreground italic">Contact data pending — update via Settings.</p>
          )}
        </div>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); toast("Copied"); setTimeout(() => setCopied(false), 2000); }); }} className="ml-1 text-muted-foreground hover:text-primary transition-colors shrink-0">
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

type Tab = "directory" | "repair" | "tow" | "coverage" | "tos" | "glossary";

export default function MarketsAndPolicy() {
  const [activeTab, setActiveTab] = useState<Tab>("directory");
  const [search, setSearch] = useState("");
  const [glossarySearch, setGlossarySearch] = useState("");

  const filteredDirectory = MARKET_DIRECTORY.filter(m =>
    !search || m.city.toLowerCase().includes(search.toLowerCase()) || m.state.toLowerCase().includes(search.toLowerCase())
  );
  const filteredGlossary = GLOSSARY_TERMS.filter(t =>
    !glossarySearch || t.term.toLowerCase().includes(glossarySearch.toLowerCase()) || t.def.toLowerCase().includes(glossarySearch.toLowerCase())
  );

  const TABS: { id: Tab; label: string }[] = [
    { id: "directory", label: "Market Directory" },
    { id: "repair", label: "Repair Shops" },
    { id: "tow", label: "Tow Partners" },
    { id: "coverage", label: "Coverage by Market" },
    { id: "tos", label: "Terms of Service" },
    { id: "glossary", label: "Glossary" },
  ];

  return (
    <WhipLayout>
      <div className="max-w-5xl mx-auto p-6 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold mb-1">Markets &amp; Locations</h1>
          <p className="text-muted-foreground text-sm">Whip operates across {MARKET_DIRECTORY.length} markets. Click any market card to expand full details, contacts, and local partners.</p>
        </div>

        {/* HQ / Claims Management header cards */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="border-l-4 border-[#ff6221] rounded-r-xl bg-card p-4 space-y-1 shadow-sm">
            <p className="text-xs font-mono uppercase tracking-widest text-[#ff6221]">Headquarters</p>
            <p className="font-bold text-base">DriveWhip</p>
            <p className="text-sm text-muted-foreground">14670 Southlawn Ln, Rockville, MD 20850</p>
            <a href="tel:8553831281" className="text-sm text-[#ff6221] hover:underline block">(855) 383-1281</a>
            <a href="https://drivewhip.com" target="_blank" rel="noopener noreferrer" className="text-sm text-[#ff6221] hover:underline">drivewhip.com</a>
          </div>
          <div className="border-l-4 border-[#1565c0] rounded-r-xl bg-card p-4 space-y-1 shadow-sm">
            <p className="text-xs font-mono uppercase tracking-widest text-[#1565c0]">Whip Claims Management</p>
            <p className="text-xs text-muted-foreground italic">Formerly Assurant Claims Management</p>
            <p className="text-sm text-muted-foreground">P.O. Box 10622, Rockville, MD 20849-0622</p>
            <a href="mailto:claims@whipclaimsmanagement.com" className="text-sm text-[#1565c0] hover:underline block">claims@whipclaimsmanagement.com</a>
            <p className="text-sm text-muted-foreground">(855) 906-5949 · Fax: 877-890-0531</p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-0 border-b border-border overflow-x-auto">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${activeTab === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Market Directory */}
        {activeTab === "directory" && (
          <div className="space-y-4">
            <Input placeholder="Search markets..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDirectory.map(m => <MarketCard key={`${m.state}-${m.city}`} m={m} />)}
            </div>
          </div>
        )}

        {/* Repair Shops */}
        {activeTab === "repair" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Preferred repair network partners by market. Always verify current availability before dispatching.</p>
            {REPAIR_SHOPS.map(s => (
              <div key={s.name} className="border border-border rounded-xl p-4 flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm">{s.name}</p>
                    {s.preferred && <Badge className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-0">Preferred</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{s.market}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{s.address}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <a href={`tel:${s.phone.replace(/\D/g, '')}`} className="text-sm font-medium text-primary hover:underline flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" />{s.phone}
                  </a>
                  <CopyButton text={s.phone} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tow Partners */}
        {activeTab === "tow" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Primary tow partners by market. Contact directly for dispatch — do not use third-party dispatch services without authorization.</p>
            {TOW_PARTNERS.map(t => (
              <div key={t.name} className="border border-border rounded-xl p-4 space-y-2">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-sm">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.market}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="flex items-center gap-1 justify-end">
                      <p className="text-sm font-medium text-primary">{t.phone}</p>
                      <CopyButton text={t.phone} />
                    </div>
                    <p className="text-xs text-muted-foreground">POC: {t.contact}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground border-t border-border/50 pt-2">{t.notes}</p>
              </div>
            ))}
          </div>
        )}

        {/* Coverage by Market */}
        {activeTab === "coverage" && (
          <div className="space-y-2">
            {COVERAGE_MARKETS.map(m => (
              <div key={m.abbr} className="border border-border rounded-xl overflow-hidden">
                <details className="group">
                  <summary className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors list-none">
                    <div className="flex items-center gap-3">
                      <span className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">{m.abbr}</span>
                      <div>
                        <p className="font-semibold text-sm">{m.name} — {m.city}</p>
                        <p className="text-xs text-muted-foreground">{m.negligence}</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-open:rotate-90 transition-transform" />
                  </summary>
                  <div className="px-4 pb-4 pt-2 border-t border-border/50 space-y-3">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div><p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Policy Prefix</p><p className="font-mono text-xs">{m.polPrefix}</p></div>
                      <div><p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Negligence Standard</p><p className="text-xs">{m.negligence}</p></div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Coverage by Period</p>
                      <div className="space-y-1">
                        <div className="flex gap-3 text-xs"><span className="w-16 text-muted-foreground shrink-0">Period 1</span><span>{m.coverage.p1}</span></div>
                        <div className="flex gap-3 text-xs"><span className="w-16 text-muted-foreground shrink-0">P2 / P3</span><span>{m.coverage.p2p3}</span></div>
                        <div className="flex gap-3 text-xs"><span className="w-16 text-muted-foreground shrink-0">UM/UIM</span><span>{m.coverage.um}</span></div>
                        <div className="flex gap-3 text-xs"><span className="w-16 text-muted-foreground shrink-0">PIP</span><span>{m.coverage.pip}</span></div>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground border-t border-border/50 pt-2">{m.notes}</p>
                  </div>
                </details>
              </div>
            ))}
          </div>
        )}

        {/* Terms of Service */}
        {activeTab === "tos" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Key provisions from the Drivewhip Member Agreement relevant to claims handling.</p>
              <a href="https://www.drivewhip.com/terms-of-service/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">
                View Full ToS <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="space-y-2">
              {TOS_SECTIONS.map(s => (
                <div key={s.title} className="border border-border rounded-xl overflow-hidden">
                  <details className="group">
                    <summary className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors list-none">
                      <span className="font-medium text-sm">{s.title}</span>
                      <div className="flex items-center gap-2">
                        <CopyButton text={s.content} />
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-open:rotate-90 transition-transform" />
                      </div>
                    </summary>
                    <div className="px-4 pb-4 pt-2 border-t border-border/50 text-sm text-muted-foreground leading-relaxed">{s.content}</div>
                  </details>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Glossary */}
        {activeTab === "glossary" && (
          <div className="space-y-4">
            <Input placeholder="Search glossary..." value={glossarySearch} onChange={e => setGlossarySearch(e.target.value)} className="max-w-sm" />
            <div className="space-y-2">
              {filteredGlossary.map(t => (
                <div key={t.term} className="border border-border rounded-xl px-4 py-3 flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-sm mb-0.5">{t.term}</p>
                    <p className="text-sm text-muted-foreground">{t.def}</p>
                  </div>
                  <CopyButton text={`${t.term}: ${t.def}`} />
                </div>
              ))}
              {filteredGlossary.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No terms match "{glossarySearch}"</p>}
            </div>
          </div>
        )}

      </div>
    </WhipLayout>
  );
}
