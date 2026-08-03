import { useState } from "react";
import WhipLayout from "@/components/WhipLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, MapPin, ChevronDown, ChevronRight, Shield } from "lucide-react";

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

const MARKETS = [
  { abbr: "MD", name: "Maryland", city: "Glen Burnie / Baltimore", polPrefix: "MD000S0137", active: true, notes: "Primary market. Contributory negligence state." },
  { abbr: "VA", name: "Virginia", city: "Richmond / Northern VA", polPrefix: "VA000S0137", active: true, notes: "Contributory negligence state." },
  { abbr: "PA", name: "Pennsylvania", city: "Philadelphia", polPrefix: "PA000S0137", active: true, notes: "51% modified comparative. Limited/full tort election." },
  { abbr: "FL", name: "Florida", city: "Miami / Orlando", polPrefix: "FL000S0137", active: true, notes: "No-fault state. BI threshold applies. UM not required." },
  { abbr: "IL", name: "Illinois", city: "Chicago", polPrefix: "IL000S0137", active: true, notes: "51% modified comparative." },
  { abbr: "GA", name: "Georgia", city: "Atlanta", polPrefix: "GA000S0137", active: true, notes: "50% modified comparative. UM rejection available." },
  { abbr: "MA", name: "Massachusetts", city: "Boston", polPrefix: "MA000S0137", active: true, notes: "No-fault state. 51% modified comparative." },
  { abbr: "TX", name: "Texas", city: "Dallas / Houston", polPrefix: "TX000S0137", active: true, notes: "51% modified comparative. No PIP requirement." },
];

export default function MarketsAndPolicy() {
  const [search, setSearch] = useState("");
  const filtered = MARKETS.filter(m =>
    m.abbr.toLowerCase().includes(search.toLowerCase()) ||
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.city.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <WhipLayout>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <MapPin className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Markets & Policy Terms</h1>
            <p className="text-sm text-muted-foreground">Active Whip markets, policy structure, coverage terms, and key definitions</p>
          </div>
        </div>

        {/* Markets */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Active Markets</CardTitle>
              <div className="relative w-48">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input placeholder="Search…" className="pl-8 h-7 text-xs" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-muted/30 border-b border-border/50"><th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">State</th><th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Market</th><th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Policy #</th><th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Notes</th></tr></thead>
                <tbody>
                  {filtered.map(m => (
                    <tr key={m.abbr} className="border-b border-border/20 hover:bg-muted/20">
                      <td className="px-4 py-2.5"><span className="font-bold text-primary">{m.abbr}</span></td>
                      <td className="px-4 py-2.5"><span className="font-medium">{m.name}</span><span className="text-xs text-muted-foreground ml-2">{m.city}</span></td>
                      <td className="px-4 py-2.5 font-mono text-xs">{m.polPrefix}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{m.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Policy terms */}
        <div className="space-y-3">
          <Accordion title="Klutch Insurance — Coverage Structure" badge="Policy" badgeColor="bg-primary/10 text-primary">
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Whip operates under a commercial auto policy issued by Klutch Insurance. Coverage applies during TNC Periods 1–3.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="bg-muted/40"><th className="text-left px-3 py-2">Coverage</th><th className="text-left px-3 py-2">Period 1</th><th className="text-left px-3 py-2">Period 2–3</th></tr></thead>
                  <tbody>
                    {[
                      ["Bodily Injury (BI)", "$50k/$100k (contingent)", "$1M CSL"],
                      ["Property Damage (PD)", "$25k (contingent)", "$1M CSL"],
                      ["UM/UIM", "Per state minimums", "Per state minimums"],
                      ["PIP / Med Pay", "Per state requirements", "Per state requirements"],
                      ["Collision", "Not covered", "Covered (driver deductible applies)"],
                      ["Comprehensive", "Not covered", "Covered (driver deductible applies)"],
                    ].map(([cov, p1, p23]) => (
                      <tr key={cov} className="border-b border-border/20 hover:bg-muted/20">
                        <td className="px-3 py-2 font-medium">{cov}</td>
                        <td className="px-3 py-2 text-muted-foreground">{p1}</td>
                        <td className="px-3 py-2">{p23}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Accordion>

          <Accordion title="Key Policy Terms & Definitions" badge="Reference" badgeColor="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
            <div className="space-y-2">
              {[
                { term: "ACV (Actual Cash Value)", def: "The fair market value of a vehicle immediately before the loss, accounting for depreciation. Used for total loss settlements." },
                { term: "CSL (Combined Single Limit)", def: "A single dollar limit that applies to both BI and PD combined, rather than separate per-person/per-occurrence limits." },
                { term: "Contingent Coverage", def: "Coverage that applies only after the driver's personal auto policy has denied the claim. Applies in Period 1." },
                { term: "Deductible", def: "The amount the insured must pay before coverage applies. Whip drivers have a deductible for collision/comprehensive claims." },
                { term: "Diminished Value (DV)", def: "The reduction in a vehicle's market value after it has been repaired following an accident. Claimable in most states." },
                { term: "Exclusion", def: "A specific condition, person, or type of loss that is not covered under the policy." },
                { term: "LOR (Letter of Representation)", def: "A letter from an attorney notifying the insurer that they represent the claimant. Triggers specific handling obligations." },
                { term: "PIP (Personal Injury Protection)", def: "No-fault coverage that pays the insured's medical bills and lost wages regardless of fault. Required in no-fault states." },
                { term: "Pro-Rata Cancellation", def: "Policy cancellation where the premium refund is proportional to the unused coverage days — no penalty." },
                { term: "Subrogation", def: "The insurer's right to recover payments made to the insured from the at-fault third party." },
                { term: "TNC (Transportation Network Company)", def: "A company that uses a digital platform to connect passengers with drivers. Whip is a TNC." },
                { term: "UM/UIM (Uninsured/Underinsured Motorist)", def: "Coverage that protects the insured when the at-fault driver has no insurance or insufficient coverage." },
              ].map(({ term, def }) => (
                <div key={term} className="p-3 rounded-lg bg-muted/30 border border-border/30">
                  <p className="font-semibold text-sm mb-1">{term}</p>
                  <p className="text-xs text-muted-foreground">{def}</p>
                </div>
              ))}
            </div>
          </Accordion>

          <Accordion title="Metrocars — Coverage Structure" badge="Policy" badgeColor="bg-[#ff6221]/10 text-[#ff6221]">
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Metrocars is Whip's vehicle program. Vehicles in the Metrocars fleet are covered under the Metrocars commercial policy during active rental periods.</p>
              <div className="p-3 rounded-lg bg-muted/30 border border-border/30 text-xs space-y-1.5">
                <p><span className="font-medium">BI/PD:</span> $300k/$300k per occurrence</p>
                <p><span className="font-medium">Collision/Comprehensive:</span> Covered with $1,000 deductible (driver responsible)</p>
                <p><span className="font-medium">UM/UIM:</span> Per state minimums</p>
                <p><span className="font-medium">PIP:</span> Per state requirements</p>
                <p><span className="font-medium">Coverage Period:</span> From vehicle checkout to return. Not applicable when vehicle is not checked out.</p>
              </div>
            </div>
          </Accordion>
        </div>
      </div>
    </WhipLayout>
  );
}
