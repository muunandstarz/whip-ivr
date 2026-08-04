import { useState } from "react";
import WhipLayout from "@/components/WhipLayout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Copy, Check } from "lucide-react";
import { toast } from "sonner";

const GLOSSARY = [
  { term:"ACV",                    cat:"Claims",   def:"Actual Cash Value — the fair market value of a vehicle at the time of loss, considering depreciation. Used to settle total loss claims." },
  { term:"AOB",                    cat:"Claims",   def:"Assignment of Benefits — a document signed by the claimant that transfers their right to receive insurance benefits directly to a healthcare provider or repair shop." },
  { term:"Arbitration",            cat:"Legal",    def:"A form of alternative dispute resolution where a neutral third party (arbitrator) hears both sides and makes a binding decision. Whip's member agreement requires binding individual arbitration." },
  { term:"Argyle",                 cat:"Internal", def:"TNC verification tool used to confirm whether a driver was active on a rideshare platform (Uber/Lyft) at the time of loss. Used to determine TNC period and coverage responsibility." },
  { term:"BI",                     cat:"Claims",   def:"Bodily Injury — liability coverage that pays for injuries to third parties caused by the insured driver. Includes medical expenses, lost wages, and pain and suffering." },
  { term:"BuyCrash",               cat:"Internal", def:"Online portal used to purchase police reports. Primary source for crash reports. Try BuyCrash before Metro Reporting Bureau." },
  { term:"Case Search",            cat:"Internal", def:"Internal tool used to look up court cases and legal filings related to claims." },
  { term:"CCC",                    cat:"Claims",   def:"CCC Intelligent Solutions — valuation platform used to calculate ACV for total loss vehicles. Generates CCC One reports used in settlement negotiations." },
  { term:"ChargeOver",             cat:"Internal", def:"Billing and subscription management platform used by Whip to manage member accounts and payment processing." },
  { term:"Checkr",                 cat:"Internal", def:"Background check platform used to screen drivers before they are approved to rent Whip vehicles." },
  { term:"Condition Report (CR)",  cat:"External", def:"Document created at vehicle pickup and return that records the condition of the vehicle. Used as baseline evidence in damage disputes." },
  { term:"Damage Fee",             cat:"External", def:"Fee charged to a member for damage to a Whip vehicle. Based on repair cost, diminished value, and loss of use. Itemized statement provided to member." },
  { term:"Damage Fee Forgiveness", cat:"External", def:"Program that waives or reduces damage fees under certain conditions, such as prompt reporting, clean history, or specific coverage elections." },
  { term:"Demand Letter",          cat:"Claims",   def:"Formal written request for payment sent to a third-party carrier or responsible party. Includes itemized damages, liability basis, and payment deadline." },
  { term:"Deposit",                cat:"External", def:"Amount held on a member's card at the start of a rental period. Released upon vehicle return in acceptable condition." },
  { term:"Driver Verification",    cat:"External", def:"Process of confirming a driver's identity, license validity, and authorization status before allowing vehicle operation." },
  { term:"EMC",                    cat:"Claims",   def:"Emergency Medical Coverage — first-party medical coverage available in some states. Distinct from PIP; may have different limits and requirements." },
  { term:"ERISA",                  cat:"Legal",    def:"Employee Retirement Income Security Act — federal law governing employee benefit plans. Relevant when a claimant's health insurer has a lien or subrogation right under an employer-sponsored plan." },
  { term:"Excessive Damage",       cat:"External", def:"Damage to a vehicle that exceeds normal wear and tear. Triggers a damage fee assessment and may result in account suspension." },
  { term:"Fountain",               cat:"Internal", def:"Driver application and onboarding platform used to manage the driver pipeline from application through approval." },
  { term:"FNOL",                   cat:"Claims",   def:"First Notice of Loss — the initial report of an accident or incident. Members submit via drivewhip.com/rideshare/accident/. Triggers the claims process." },
  { term:"Impound",                cat:"External", def:"Vehicle held by a towing company, police, or storage facility. Whip is responsible for impound fees on vehicles impounded due to accidents or violations." },
  { term:"Lien",                   cat:"Legal",    def:"A legal claim against a settlement or recovery. Common in BI claims where health insurers, Medicare/Medicaid, or attorneys assert a right to part of the settlement." },
  { term:"LOR",                    cat:"Legal",    def:"Letter of Representation — formal notice from an attorney that they represent a claimant. Once received, all communication must go through the attorney." },
  { term:"LOU",                    cat:"Claims",   def:"Loss of Use — damages claimed for the period a vehicle is out of service due to an accident. Calculated as daily rental rate × days out of service." },
  { term:"MD Floor",               cat:"Claims",   def:"Maryland Minimum Floor — Whip's home state minimums (30/60 BI, $15k PD) applied when a state's minimums are lower. Ensures consistent minimum coverage across all markets." },
  { term:"Member Agreement",       cat:"External", def:"The contract between Whip and the member governing vehicle use, coverage, responsibilities, and dispute resolution. Governs all claims involving Whip vehicles." },
  { term:"Metro Reporting Bureau",  cat:"Internal", def:"Used for police report requests and VIN lookups. Try BuyCrash first; use Metro if BuyCrash doesn't have the report." },
  { term:"PD",                     cat:"Claims",   def:"Property Damage — liability coverage that pays for damage to third-party property (usually vehicles) caused by the insured driver." },
  { term:"PIP",                    cat:"Claims",   def:"Personal Injury Protection — no-fault coverage that pays medical expenses, lost wages, and related costs regardless of fault. Only available in states that mandate it." },
  { term:"Policy Period",          cat:"Claims",   def:"The period of time during which the insurance policy is in effect. Losses must occur within the policy period to be covered." },
  { term:"Protection Plan",        cat:"External", def:"Vehicle coverage provided by Whip as part of the weekly subscription fee. Includes state minimum coverage for vehicles and drivers." },
  { term:"Proof of Rideshare (POR)",cat:"External", def:"Document proving the driver is driving for Uber or Lyft — generally a screenshot from the app." },
  { term:"RCV",                    cat:"Claims",   def:"Replacement Cost Value — the cost to replace a vehicle with a new equivalent. Typically higher than ACV. Whip pays ACV, not RCV, on total losses." },
  { term:"Rental or Subscription", cat:"External", def:"The term used to describe the customer's temporary use of one of Whip's vehicles." },
  { term:"Repossession",           cat:"External", def:"When Whip recovers a vehicle from a driver for reasons including non-payment, failure to report an accident, driving outside coverage area, or refusal to return." },
  { term:"Roadside Assistance",    cat:"External", def:"Service that provides help to stranded motorists when their vehicle breaks down or experiences an emergency while on the road." },
  { term:"Smartsheet",             cat:"Internal", def:"Internal database used to track approved drivers and the vehicles they are renting." },
  { term:"Standard Fleet",         cat:"Internal", def:"Tool used to monitor all Teslas' performance and location, as well as disable or enable the starter." },
  { term:"State Inspection",       cat:"External", def:"Document ensuring a vehicle is state-approved and meets necessary requirements for ridesharing." },
  { term:"Subrogation (Subro)",    cat:"Claims",   def:"A liability claim sent to a third party for recovery. The right an insurance company has to sue a third party who caused a loss. Allows the insurer to step into the shoes of the insured and pursue the responsible party." },
  { term:"Subscription / Weekly Fee",cat:"External",def:"Rate charged for renting a vehicle per week. At Whip this includes insurance fees." },
  { term:"TAVT",                   cat:"Claims",   def:"Title Ad Valorem Tax — Georgia's one-time title tax paid at vehicle registration instead of annual sales tax. Reimbursable on total losses in Georgia." },
  { term:"Textline",               cat:"Internal", def:"Tool used to send and receive SMS to and from customers after they have picked up their vehicle." },
  { term:"TNC",                    cat:"TNC",      def:"Transportation Network Company — companies like Uber and Lyft that connect drivers with passengers via an app. TNC periods (0, 1, 2, 3) determine which carrier is primary for a loss." },
  { term:"TNC Inspection",         cat:"TNC",      def:"Inspections required by rideshare companies in some markets on an annual basis." },
  { term:"TNC Period 0",           cat:"TNC",      def:"App is off. Driver is in personal use. Whip coverage applies fully. No TNC coverage involved." },
  { term:"TNC Period 1",           cat:"TNC",      def:"App is on, driver is logged in but has not accepted a ride. TNC carrier provides limited BI/PD ($50K/$100K/$25K). Whip denies PIP and third-party BI/PD." },
  { term:"TNC Period 2",           cat:"TNC",      def:"Driver has accepted a trip and is en route to pick up the passenger. TNC carrier provides $1M liability. Whip steps back — refer all liability claims to TNC carrier." },
  { term:"TNC Period 3",           cat:"TNC",      def:"Passenger is in the vehicle through drop-off. TNC carrier provides $1M liability. Same handling as Period 2." },
  { term:"Total Loss",             cat:"Claims",   def:"When the cost to repair a vehicle exceeds its actual cash value (ACV), or when the vehicle is not repairable. Settled at ACV plus applicable tax, title, and registration fees." },
  { term:"UM/UIM",                 cat:"Claims",   def:"Uninsured/Underinsured Motorist coverage — pays when the at-fault driver has no insurance or insufficient coverage. Only available in states that mandate it." },
  { term:"Wear & Tear",            cat:"External", def:"Gradual loss, damage, or deterioration of property due to normal, expected use over time. Not covered — distinct from excessive damage from an accident." },
  { term:"Whip",                   cat:"External", def:"The company providing rideshare rentals. Do not use 'WhipEV' or 'Drive Whip.' Use 'Whip' only." },
  { term:"Whip Pay",               cat:"Claims",   def:"A claim that remains within Whip and has not been subrogated to a third party." },
  { term:"10K",                    cat:"Internal", def:"Internal term for the intermittent service appointments that drivers must complete every 60 days or 10,000 miles." },
];

const CATEGORIES = ["All", "Claims", "External", "Internal", "Legal", "TNC"];

const CAT_COLORS: Record<string, string> = {
  Claims:   "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  External: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  Internal: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  Legal:    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  TNC:      "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
};

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); toast("Copied"); setTimeout(() => setCopied(false), 2000); }); }}
      className="ml-2 text-muted-foreground hover:text-primary transition-colors shrink-0">
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export default function GlossaryPage() {
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState("All");

  const filtered = GLOSSARY.filter(g => {
    const q = search.toLowerCase();
    const matchSearch = !q || g.term.toLowerCase().includes(q) || g.def.toLowerCase().includes(q);
    const matchCat = activeCat === "All" || g.cat === activeCat;
    return matchSearch && matchCat;
  });

  // Group alphabetically
  const grouped: Record<string, typeof GLOSSARY> = {};
  filtered.forEach(g => {
    const letter = g.term[0].toUpperCase();
    if (!grouped[letter]) grouped[letter] = [];
    grouped[letter].push(g);
  });

  return (
    <WhipLayout>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Glossary</h1>
          <p className="text-muted-foreground text-sm mt-1">Searchable A–Z claims and Whip operations terminology. {GLOSSARY.length} terms from the official Whip Glossary of Terms.</p>
        </div>

        {/* Search + Filters */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search terms or definitions..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-2 flex-wrap">
            {CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setActiveCat(cat)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${activeCat === cat ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground"}`}>
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Results count */}
        <p className="text-xs text-muted-foreground">{filtered.length} term{filtered.length !== 1 ? "s" : ""} shown</p>

        {/* Grouped terms */}
        {Object.keys(grouped).sort().map(letter => (
          <div key={letter}>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-lg font-bold text-primary">{letter}</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="space-y-2">
              {grouped[letter].map(g => (
                <div key={g.term} className="rounded-xl border border-border p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{g.term}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CAT_COLORS[g.cat] || "bg-muted text-muted-foreground"}`}>{g.cat}</span>
                    </div>
                    <CopyBtn text={`${g.term}: ${g.def}`} />
                  </div>
                  <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{g.def}</p>
                </div>
              ))}
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-sm">No terms match your search.</p>
            <button onClick={() => { setSearch(""); setActiveCat("All"); }} className="text-xs text-primary mt-2 hover:underline">Clear filters</button>
          </div>
        )}
      </div>
    </WhipLayout>
  );
}
