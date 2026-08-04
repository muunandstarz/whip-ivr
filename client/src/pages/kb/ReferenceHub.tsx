import { useState } from "react";
import WhipLayout from "@/components/WhipLayout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Info, Search } from "lucide-react";

// ── State Coverage Data (from CKB source) ────────────────────────────────────
const STATE_DATA: Record<string, {
  name: string; bi: string; pd: string; pip: boolean; pipMin: string | null;
  um: boolean; umNotes: string; mdFloor: boolean; notes: string;
}> = {
  "AL": { name:"Alabama",           bi:"25/50",  pd:"25",  pip:false, pipMin:null,   um:false, umNotes:"Optional",     mdFloor:false, notes:"" },
  "AK": { name:"Alaska",            bi:"50/100", pd:"25",  pip:false, pipMin:null,   um:true,  umNotes:"Required",     mdFloor:true,  notes:"MD floor applies on BI/PD" },
  "AZ": { name:"Arizona",           bi:"25/50",  pd:"15",  pip:false, pipMin:null,   um:true,  umNotes:"Required",     mdFloor:false, notes:"" },
  "AR": { name:"Arkansas",          bi:"25/50",  pd:"25",  pip:false, pipMin:null,   um:true,  umNotes:"Required",     mdFloor:false, notes:"" },
  "CA": { name:"California",        bi:"15/30",  pd:"5",   pip:false, pipMin:null,   um:true,  umNotes:"Required",     mdFloor:true,  notes:"MD floor applies; CA limits low — MD floor triggers" },
  "CO": { name:"Colorado",          bi:"25/50",  pd:"15",  pip:false, pipMin:null,   um:true,  umNotes:"Required",     mdFloor:false, notes:"" },
  "CT": { name:"Connecticut",       bi:"25/50",  pd:"25",  pip:false, pipMin:null,   um:true,  umNotes:"Required",     mdFloor:false, notes:"" },
  "DE": { name:"Delaware",          bi:"25/50",  pd:"10",  pip:true,  pipMin:"15",   um:true,  umNotes:"Required",     mdFloor:true,  notes:"Unauth: extend minimums" },
  "DC": { name:"Dist. of Columbia", bi:"25/50",  pd:"10",  pip:true,  pipMin:"50",   um:true,  umNotes:"Required",     mdFloor:true,  notes:"Unauth: extend minimums" },
  "FL": { name:"Florida",           bi:"10/20",  pd:"10",  pip:true,  pipMin:"10",   um:false, umNotes:"Optional",     mdFloor:true,  notes:"Unauth: extend minimums; MD floor triggers on BI" },
  "GA": { name:"Georgia",           bi:"25/50",  pd:"25",  pip:false, pipMin:null,   um:false, umNotes:"Not mandated", mdFloor:true,  notes:"MD floor applies to BI only. PIP/UM not mandated. Unauth: deny" },
  "HI": { name:"Hawaii",            bi:"20/40",  pd:"10",  pip:true,  pipMin:"10",   um:true,  umNotes:"Required",     mdFloor:true,  notes:"Unauth: extend minimums" },
  "ID": { name:"Idaho",             bi:"25/50",  pd:"15",  pip:false, pipMin:null,   um:true,  umNotes:"Required",     mdFloor:false, notes:"" },
  "IL": { name:"Illinois",          bi:"25/50",  pd:"20",  pip:false, pipMin:null,   um:true,  umNotes:"Required",     mdFloor:false, notes:"Unauth: deny" },
  "IN": { name:"Indiana",           bi:"25/50",  pd:"25",  pip:false, pipMin:null,   um:true,  umNotes:"Required",     mdFloor:false, notes:"" },
  "IA": { name:"Iowa",              bi:"20/40",  pd:"15",  pip:false, pipMin:null,   um:true,  umNotes:"Required",     mdFloor:true,  notes:"MD floor applies" },
  "KS": { name:"Kansas",            bi:"25/50",  pd:"25",  pip:true,  pipMin:"4.5",  um:true,  umNotes:"Required",     mdFloor:false, notes:"Unauth: extend minimums" },
  "KY": { name:"Kentucky",          bi:"25/50",  pd:"25",  pip:true,  pipMin:"10",   um:true,  umNotes:"Required",     mdFloor:false, notes:"Unauth: extend minimums" },
  "LA": { name:"Louisiana",         bi:"15/30",  pd:"25",  pip:false, pipMin:null,   um:true,  umNotes:"Required",     mdFloor:true,  notes:"MD floor on BI" },
  "ME": { name:"Maine",             bi:"50/100", pd:"25",  pip:false, pipMin:null,   um:true,  umNotes:"Required",     mdFloor:false, notes:"" },
  "MD": { name:"Maryland",          bi:"30/60",  pd:"15",  pip:true,  pipMin:"2.5",  um:true,  umNotes:"Required",     mdFloor:false, notes:"HOME STATE — floor limits. UAD: deny coverage." },
  "MA": { name:"Massachusetts",     bi:"20/40",  pd:"5",   pip:true,  pipMin:"8",    um:true,  umNotes:"Required",     mdFloor:true,  notes:"Unauth: extend minimums; MD floor on BI/PD" },
  "MI": { name:"Michigan",          bi:"50/100", pd:"10",  pip:true,  pipMin:"Unlim",um:true,  umNotes:"Required",     mdFloor:false, notes:"Unauth: extend minimums; unlimited PIP" },
  "MN": { name:"Minnesota",         bi:"30/60",  pd:"10",  pip:true,  pipMin:"40",   um:true,  umNotes:"Required",     mdFloor:false, notes:"Unauth: extend minimums" },
  "MS": { name:"Mississippi",       bi:"25/50",  pd:"25",  pip:false, pipMin:null,   um:false, umNotes:"Optional",     mdFloor:false, notes:"" },
  "MO": { name:"Missouri",          bi:"25/50",  pd:"25",  pip:false, pipMin:null,   um:true,  umNotes:"Required",     mdFloor:false, notes:"" },
  "MT": { name:"Montana",           bi:"25/50",  pd:"20",  pip:false, pipMin:null,   um:false, umNotes:"Optional",     mdFloor:false, notes:"" },
  "NE": { name:"Nebraska",          bi:"25/50",  pd:"25",  pip:false, pipMin:null,   um:true,  umNotes:"Required",     mdFloor:false, notes:"" },
  "NV": { name:"Nevada",            bi:"25/50",  pd:"20",  pip:false, pipMin:null,   um:true,  umNotes:"Required",     mdFloor:false, notes:"" },
  "NH": { name:"New Hampshire",     bi:"25/50",  pd:"25",  pip:false, pipMin:null,   um:true,  umNotes:"Required",     mdFloor:false, notes:"No mandatory liability" },
  "NJ": { name:"New Jersey",        bi:"15/30",  pd:"5",   pip:true,  pipMin:"15",   um:true,  umNotes:"Required",     mdFloor:true,  notes:"MD floor on BI/PD" },
  "NM": { name:"New Mexico",        bi:"25/50",  pd:"10",  pip:false, pipMin:null,   um:true,  umNotes:"Required",     mdFloor:false, notes:"" },
  "NY": { name:"New York",          bi:"25/50",  pd:"10",  pip:true,  pipMin:"50",   um:true,  umNotes:"Required",     mdFloor:false, notes:"" },
  "NC": { name:"North Carolina",    bi:"30/60",  pd:"25",  pip:false, pipMin:null,   um:true,  umNotes:"Required",     mdFloor:false, notes:"" },
  "ND": { name:"North Dakota",      bi:"25/50",  pd:"25",  pip:true,  pipMin:"30",   um:true,  umNotes:"Required",     mdFloor:false, notes:"Unauth: extend minimums" },
  "OH": { name:"Ohio",              bi:"25/50",  pd:"25",  pip:false, pipMin:null,   um:true,  umNotes:"Required",     mdFloor:false, notes:"" },
  "OK": { name:"Oklahoma",          bi:"25/50",  pd:"25",  pip:false, pipMin:null,   um:true,  umNotes:"Required",     mdFloor:false, notes:"" },
  "OR": { name:"Oregon",            bi:"25/50",  pd:"20",  pip:true,  pipMin:"15",   um:true,  umNotes:"Required",     mdFloor:false, notes:"Unauth: extend minimums" },
  "PA": { name:"Pennsylvania",      bi:"15/30",  pd:"5",   pip:true,  pipMin:"5",    um:true,  umNotes:"Required",     mdFloor:true,  notes:"Unauth: extend minimums; MD floor on BI/PD" },
  "RI": { name:"Rhode Island",      bi:"25/50",  pd:"25",  pip:false, pipMin:null,   um:true,  umNotes:"Required",     mdFloor:false, notes:"" },
  "SC": { name:"South Carolina",    bi:"25/50",  pd:"25",  pip:false, pipMin:null,   um:true,  umNotes:"Required",     mdFloor:false, notes:"" },
  "SD": { name:"South Dakota",      bi:"25/50",  pd:"25",  pip:false, pipMin:null,   um:true,  umNotes:"Required",     mdFloor:false, notes:"" },
  "TN": { name:"Tennessee",         bi:"25/50",  pd:"15",  pip:false, pipMin:null,   um:true,  umNotes:"Required",     mdFloor:false, notes:"" },
  "TX": { name:"Texas",             bi:"30/60",  pd:"25",  pip:false, pipMin:null,   um:true,  umNotes:"Required",     mdFloor:false, notes:"" },
  "UT": { name:"Utah",              bi:"25/65",  pd:"15",  pip:true,  pipMin:"3",    um:true,  umNotes:"Required",     mdFloor:false, notes:"Unauth: extend minimums" },
  "VT": { name:"Vermont",           bi:"25/50",  pd:"10",  pip:false, pipMin:null,   um:true,  umNotes:"Required",     mdFloor:false, notes:"" },
  "VA": { name:"Virginia",          bi:"50/100", pd:"25",  pip:false, pipMin:null,   um:true,  umNotes:"Required",     mdFloor:false, notes:"Limits updated Jan 1 2025 — 50/100/25. Unauth: deny" },
  "WA": { name:"Washington",        bi:"25/50",  pd:"10",  pip:true,  pipMin:"10",   um:true,  umNotes:"Required",     mdFloor:false, notes:"" },
  "WV": { name:"West Virginia",     bi:"25/50",  pd:"25",  pip:false, pipMin:null,   um:true,  umNotes:"Required",     mdFloor:false, notes:"" },
  "WI": { name:"Wisconsin",         bi:"25/50",  pd:"10",  pip:false, pipMin:null,   um:true,  umNotes:"Required",     mdFloor:false, notes:"" },
  "WY": { name:"Wyoming",           bi:"25/50",  pd:"20",  pip:false, pipMin:null,   um:false, umNotes:"Optional",     mdFloor:false, notes:"" },
};

// ── Total Loss Fee Data (Whip operating states) ───────────────────────────────
const TL_DATA: Record<string, { name: string; tax: boolean; taxRate: string; title: boolean; titleAmt: string; reg: boolean; regAmt: string; notes: string }> = {
  "AL": { name:"Alabama",       tax:true,  taxRate:"2%",           title:true,  titleAmt:"$18",        reg:false, regAmt:"—", notes:"Tax on ACV; title required" },
  "AK": { name:"Alaska",        tax:false, taxRate:"—",            title:true,  titleAmt:"$15",        reg:false, regAmt:"—", notes:"No state sales tax" },
  "AZ": { name:"Arizona",       tax:true,  taxRate:"5.6%",         title:true,  titleAmt:"$4",         reg:false, regAmt:"—", notes:"Tax on ACV settlement" },
  "AR": { name:"Arkansas",      tax:true,  taxRate:"6.5%",         title:true,  titleAmt:"$8",         reg:false, regAmt:"—", notes:"" },
  "CA": { name:"California",    tax:true,  taxRate:"7.25%+",       title:true,  titleAmt:"$21",        reg:true,  regAmt:"Prorated", notes:"Reg prorated; local tax may vary" },
  "CO": { name:"Colorado",      tax:true,  taxRate:"2.9%",         title:true,  titleAmt:"$7.20",      reg:false, regAmt:"—", notes:"" },
  "CT": { name:"Connecticut",   tax:true,  taxRate:"6.35%",        title:true,  titleAmt:"$25",        reg:false, regAmt:"—", notes:"" },
  "DE": { name:"Delaware",      tax:true,  taxRate:"4.25%",        title:true,  titleAmt:"$35",        reg:false, regAmt:"—", notes:"" },
  "DC": { name:"D.C.",          tax:true,  taxRate:"6%",           title:true,  titleAmt:"$26",        reg:false, regAmt:"—", notes:"" },
  "FL": { name:"Florida",       tax:true,  taxRate:"6%+",          title:true,  titleAmt:"$75.25",     reg:false, regAmt:"—", notes:"Local surtax may apply; title fee varies by county" },
  "GA": { name:"Georgia",       tax:true,  taxRate:"6.6% TAVT",    title:true,  titleAmt:"$18",        reg:false, regAmt:"—", notes:"TAVT is one-time title tax; not sales tax" },
  "HI": { name:"Hawaii",        tax:true,  taxRate:"4%",           title:true,  titleAmt:"$5",         reg:false, regAmt:"—", notes:"" },
  "ID": { name:"Idaho",         tax:true,  taxRate:"6%",           title:true,  titleAmt:"$14",        reg:false, regAmt:"—", notes:"" },
  "IL": { name:"Illinois",      tax:true,  taxRate:"6.25%",        title:true,  titleAmt:"$150",       reg:false, regAmt:"—", notes:"Title fee is high in IL" },
  "IN": { name:"Indiana",       tax:true,  taxRate:"7%",           title:true,  titleAmt:"$15",        reg:false, regAmt:"—", notes:"" },
  "IA": { name:"Iowa",          tax:true,  taxRate:"5%",           title:true,  titleAmt:"$25",        reg:false, regAmt:"—", notes:"" },
  "KS": { name:"Kansas",        tax:true,  taxRate:"6.5%",         title:true,  titleAmt:"$10",        reg:false, regAmt:"—", notes:"" },
  "KY": { name:"Kentucky",      tax:true,  taxRate:"6%",           title:true,  titleAmt:"$9",         reg:false, regAmt:"—", notes:"" },
  "LA": { name:"Louisiana",     tax:true,  taxRate:"4.45%",        title:true,  titleAmt:"$68.50",     reg:false, regAmt:"—", notes:"" },
  "ME": { name:"Maine",         tax:true,  taxRate:"5.5%",         title:true,  titleAmt:"$33",        reg:false, regAmt:"—", notes:"" },
  "MD": { name:"Maryland",      tax:true,  taxRate:"6%",           title:true,  titleAmt:"$100",       reg:true,  regAmt:"Prorated", notes:"HOME STATE — title + reg both reimbursable" },
  "MA": { name:"Massachusetts", tax:true,  taxRate:"6.25%",        title:true,  titleAmt:"$75",        reg:false, regAmt:"—", notes:"" },
  "MI": { name:"Michigan",      tax:true,  taxRate:"6%",           title:true,  titleAmt:"$15",        reg:false, regAmt:"—", notes:"" },
  "MN": { name:"Minnesota",     tax:true,  taxRate:"6.5%",         title:true,  titleAmt:"$8.25",      reg:false, regAmt:"—", notes:"" },
  "MS": { name:"Mississippi",   tax:true,  taxRate:"5%",           title:true,  titleAmt:"$9",         reg:false, regAmt:"—", notes:"" },
  "MO": { name:"Missouri",      tax:true,  taxRate:"4.225%",       title:true,  titleAmt:"$8.50",      reg:false, regAmt:"—", notes:"" },
  "MT": { name:"Montana",       tax:false, taxRate:"—",            title:true,  titleAmt:"$12",        reg:false, regAmt:"—", notes:"No sales tax" },
  "NE": { name:"Nebraska",      tax:true,  taxRate:"5.5%",         title:true,  titleAmt:"$10",        reg:false, regAmt:"—", notes:"" },
  "NV": { name:"Nevada",        tax:true,  taxRate:"6.85%",        title:true,  titleAmt:"$28.25",     reg:false, regAmt:"—", notes:"" },
  "NH": { name:"New Hampshire", tax:false, taxRate:"—",            title:true,  titleAmt:"$25",        reg:false, regAmt:"—", notes:"No sales tax" },
  "NJ": { name:"New Jersey",    tax:true,  taxRate:"6.625%",       title:true,  titleAmt:"$60",        reg:false, regAmt:"—", notes:"" },
  "NM": { name:"New Mexico",    tax:true,  taxRate:"4%",           title:true,  titleAmt:"$5",         reg:false, regAmt:"—", notes:"" },
  "NY": { name:"New York",      tax:true,  taxRate:"4%+",          title:true,  titleAmt:"$50",        reg:false, regAmt:"—", notes:"Local tax adds 4–5%" },
  "NC": { name:"North Carolina",tax:true,  taxRate:"3%",           title:true,  titleAmt:"$56",        reg:false, regAmt:"—", notes:"" },
  "ND": { name:"North Dakota",  tax:true,  taxRate:"5%",           title:true,  titleAmt:"$5",         reg:false, regAmt:"—", notes:"" },
  "OH": { name:"Ohio",          tax:true,  taxRate:"5.75%",        title:true,  titleAmt:"$15",        reg:false, regAmt:"—", notes:"" },
  "OK": { name:"Oklahoma",      tax:true,  taxRate:"3.25%",        title:true,  titleAmt:"$11",        reg:false, regAmt:"—", notes:"" },
  "OR": { name:"Oregon",        tax:false, taxRate:"—",            title:true,  titleAmt:"$77",        reg:false, regAmt:"—", notes:"No sales tax; title fee higher" },
  "PA": { name:"Pennsylvania",  tax:true,  taxRate:"6%",           title:true,  titleAmt:"$55",        reg:false, regAmt:"—", notes:"" },
  "RI": { name:"Rhode Island",  tax:true,  taxRate:"7%",           title:true,  titleAmt:"$52.50",     reg:false, regAmt:"—", notes:"" },
  "SC": { name:"South Carolina",tax:true,  taxRate:"5% (max $500)",title:true,  titleAmt:"$15",        reg:false, regAmt:"—", notes:"Tax capped at $500" },
  "SD": { name:"South Dakota",  tax:true,  taxRate:"4%",           title:true,  titleAmt:"$10",        reg:false, regAmt:"—", notes:"" },
  "TN": { name:"Tennessee",     tax:true,  taxRate:"7%",           title:true,  titleAmt:"$11",        reg:false, regAmt:"—", notes:"" },
  "TX": { name:"Texas",         tax:true,  taxRate:"6.25%",        title:true,  titleAmt:"$28 + $2.50",reg:false, regAmt:"—", notes:"Standard + processing fee" },
  "UT": { name:"Utah",          tax:true,  taxRate:"6.85%",        title:true,  titleAmt:"$6",         reg:false, regAmt:"—", notes:"" },
  "VT": { name:"Vermont",       tax:true,  taxRate:"6%",           title:true,  titleAmt:"$35",        reg:false, regAmt:"—", notes:"" },
  "VA": { name:"Virginia",      tax:true,  taxRate:"4.15% Reg Tax",title:true,  titleAmt:"$15",        reg:false, regAmt:"—", notes:"Vehicle sales and use tax" },
  "WA": { name:"Washington",    tax:true,  taxRate:"6.5%",         title:true,  titleAmt:"$15",        reg:false, regAmt:"—", notes:"" },
  "WV": { name:"West Virginia", tax:true,  taxRate:"6%",           title:true,  titleAmt:"$10",        reg:false, regAmt:"—", notes:"" },
  "WI": { name:"Wisconsin",     tax:true,  taxRate:"5%",           title:true,  titleAmt:"$69.50",     reg:false, regAmt:"—", notes:"" },
  "WY": { name:"Wyoming",       tax:true,  taxRate:"4%",           title:true,  titleAmt:"$15",        reg:false, regAmt:"—", notes:"" },
};

const UNAUTH_EXTEND = ["FL","MA","PA","DE","DC","HI","KS","KY","MI","MN","NJ","NY","ND","OR","UT"];
const UNAUTH_DENY   = ["MD","GA","VA","IL"];

const WHIP_STATES = ["MD","VA","PA","FL","IL","GA","MA","TX"];

type Tab = "matrix" | "unauth" | "tl" | "protocols";

export default function ReferenceHub() {
  const [activeTab, setActiveTab] = useState<Tab>("matrix");
  const [matrixSearch, setMatrixSearch] = useState("");
  const [tlSearch, setTlSearch] = useState("");
  const [showWhipOnly, setShowWhipOnly] = useState(false);

  const stateEntries = Object.entries(STATE_DATA).filter(([code, s]) => {
    const q = matrixSearch.toLowerCase();
    const match = !q || s.name.toLowerCase().includes(q) || code.toLowerCase().includes(q);
    const whipFilter = !showWhipOnly || WHIP_STATES.includes(code);
    return match && whipFilter;
  });

  const tlEntries = Object.entries(TL_DATA).filter(([code, s]) => {
    const q = tlSearch.toLowerCase();
    const match = !q || s.name.toLowerCase().includes(q) || code.toLowerCase().includes(q);
    const whipFilter = !showWhipOnly || WHIP_STATES.includes(code);
    return match && whipFilter;
  });

  const tabs: { id: Tab; label: string }[] = [
    { id: "matrix", label: "50-State Coverage" },
    { id: "unauth", label: "Unauthorized Driver" },
    { id: "tl", label: "Total Loss Fees" },
    { id: "protocols", label: "Mail Protocols" },
  ];

  return (
    <WhipLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Reference Hub</h1>
          <p className="text-muted-foreground text-sm mt-1">50-state coverage matrix, unauthorized driver rules, total loss fees, and mail protocols.</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* 50-State Coverage Matrix */}
        {activeTab === "matrix" && (
          <div className="space-y-4">
            <div className="flex gap-3 items-center flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by state..." className="pl-9" value={matrixSearch} onChange={e => setMatrixSearch(e.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={showWhipOnly} onChange={e => setShowWhipOnly(e.target.checked)} className="accent-primary" />
                Whip operating states only
              </label>
            </div>
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="text-left px-3 py-2.5 font-semibold text-xs uppercase tracking-wide">State</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-xs uppercase tracking-wide">BI Min</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-xs uppercase tracking-wide">PD Min</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-xs uppercase tracking-wide">PIP</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-xs uppercase tracking-wide">PIP Min</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-xs uppercase tracking-wide">UM/UIM</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-xs uppercase tracking-wide">MD Floor</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-xs uppercase tracking-wide">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stateEntries.map(([code, s], i) => (
                      <tr key={code} className={`border-b border-border last:border-0 ${WHIP_STATES.includes(code) ? "bg-primary/5" : i % 2 === 0 ? "" : "bg-muted/20"}`}>
                        <td className="px-3 py-2 font-medium">
                          <span className="font-mono text-xs text-muted-foreground mr-1">{code}</span>
                          {s.name}
                          {WHIP_STATES.includes(code) && <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-primary align-middle" title="Whip operating state" />}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{s.bi}</td>
                        <td className="px-3 py-2 font-mono text-xs">${s.pd}k</td>
                        <td className="px-3 py-2">
                          {s.pip ? <span className="text-xs font-semibold text-green-600">Yes</span> : <span className="text-xs text-muted-foreground">No</span>}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{s.pipMin ? `$${s.pipMin}k` : "—"}</td>
                        <td className="px-3 py-2">
                          <span className={`text-xs font-medium ${s.um ? "text-green-600" : "text-amber-600"}`}>{s.umNotes}</span>
                        </td>
                        <td className="px-3 py-2">
                          {s.mdFloor ? <span className="text-xs font-semibold text-orange-500">Yes</span> : <span className="text-xs text-muted-foreground">No</span>}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground max-w-[240px]">{s.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary mr-1 align-middle" /> Highlighted rows = Whip operating states. BI Min shown as per-person/per-occurrence in thousands.
            </p>
          </div>
        )}

        {/* Unauthorized Driver */}
        {activeTab === "unauth" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 p-4 flex gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              <div className="text-sm">
                <strong>Denial States (MD, GA, VA, IL):</strong> Whip denies UAD coverage entirely in these states — do NOT extend minimums. Deny coverage and handle only after: (1) written carrier denial received, OR (2) suit is filed. Use Doc Generator → UAD Denial for the denial letter.
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900 p-4">
                <h3 className="font-semibold text-green-700 dark:text-green-400 mb-1">Extend Minimums</h3>
                <p className="text-xs text-muted-foreground mb-3">Whip extends statutory minimums to unauthorized drivers in these states.</p>
                <div className="flex flex-wrap gap-2">
                  {UNAUTH_EXTEND.map(s => (
                    <Badge key={s} variant="outline" className="border-green-400 text-green-700 dark:text-green-400 font-mono">{s}</Badge>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 p-4">
                <h3 className="font-semibold text-red-700 dark:text-red-400 mb-1">Deny Coverage</h3>
                <p className="text-xs text-muted-foreground mb-3">Coverage may be denied for unauthorized drivers in these states:</p>
                <div className="flex flex-wrap gap-2">
                  {UNAUTH_DENY.map(s => (
                    <Badge key={s} variant="outline" className="border-red-400 text-red-700 dark:text-red-400 font-mono">{s}</Badge>
                  ))}
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border p-5 space-y-4">
              <h3 className="font-semibold">4-Step Unauthorized Driver Process</h3>
              <ol className="space-y-3">
                {[
                  { n: "1", title: "Determine Authorization Status", body: "Review rental agreement, dispatch records, and telematics. Was the driver authorized at time of loss?" },
                  { n: "2", title: "Check State Rule", body: "Use the table above. Does the state require extending minimums, or permit denial?" },
                  { n: "3", title: "Note the File", body: "Document: driver name, authorization status, how determined, state rule applied, coverage decision. This is the audit trail." },
                  { n: "4", title: "Generate Denial or Extend", body: "If denial: use Doc Generator → UAD Denial. If extending minimums: apply state limits and process accordingly." },
                ].map(step => (
                  <li key={step.n} className="flex gap-3">
                    <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: "#ff6221" }}>{step.n}</span>
                    <div className="text-sm"><strong>{step.title}</strong> — {step.body}</div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}

        {/* Total Loss Fees */}
        {activeTab === "tl" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-4 flex gap-3">
              <Info className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-sm">
                Tax, title, and registration fees are reimbursable on top of ACV. Rates shown are state-level; local taxes may vary. Always verify with the current tax rate for the county of registration.
              </div>
            </div>
            <div className="flex gap-3 items-center flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search state..." className="pl-9" value={tlSearch} onChange={e => setTlSearch(e.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={showWhipOnly} onChange={e => setShowWhipOnly(e.target.checked)} className="accent-primary" />
                Whip operating states only
              </label>
            </div>
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="text-left px-3 py-2.5 font-semibold text-xs uppercase tracking-wide">State</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-xs uppercase tracking-wide">Sales Tax</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-xs uppercase tracking-wide">Tax Rate</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-xs uppercase tracking-wide">Title Fee</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-xs uppercase tracking-wide">Reg Fee</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-xs uppercase tracking-wide">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tlEntries.map(([code, s], i) => (
                      <tr key={code} className={`border-b border-border last:border-0 ${WHIP_STATES.includes(code) ? "bg-primary/5" : i % 2 === 0 ? "" : "bg-muted/20"}`}>
                        <td className="px-3 py-2 font-medium">
                          <span className="font-mono text-xs text-muted-foreground mr-1">{code}</span>
                          {s.name}
                          {WHIP_STATES.includes(code) && <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-primary align-middle" />}
                        </td>
                        <td className="px-3 py-2">
                          {s.tax ? <span className="text-xs font-semibold text-green-600">Yes</span> : <span className="text-xs text-muted-foreground">No</span>}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{s.taxRate}</td>
                        <td className="px-3 py-2 font-mono text-xs">{s.title ? s.titleAmt : "—"}</td>
                        <td className="px-3 py-2 font-mono text-xs">{s.reg ? s.regAmt : "—"}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{s.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Mail Protocols */}
        {activeTab === "protocols" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-4 flex gap-3">
              <Info className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-sm">First Party mail routes to the assigned handler or D'emily (FP Team Lead) if unassigned. LORs route round-robin to Jayla → Carlito (max 3/day). Injury demands route to Jayla. PD demands route to Giovanni. Legal mail (complaints, summons, subpoenas, warrants, police inquiries, government requests) escalates directly to Jasmine. All other mail routes to the 1st party team: Natashia, Annie, Josie, and Tasha.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { title: "First Party Mail", color: "blue", items: ["Routes to assigned handler", "If unassigned → D'emily (FP Team Lead)", "Include: photos, police report, TNC confirmation"] },
                { title: "LOR / Attorney Mail", color: "purple", items: ["Round-robin: Jayla → Carlito", "Max 3 LORs per handler per day", "Log receipt date in claim notes"] },
                { title: "Injury Demands", color: "red", items: ["Route to Jayla", "Confirm coverage period and TNC status", "Open BI reserve immediately"] },
                { title: "PD Demands", color: "orange", items: ["Route to Giovanni (Carlito)", "Confirm liability before responding", "Request repair estimate if not attached"] },
                { title: "Legal Mail", color: "red", items: ["Complaints, summons, subpoenas, warrants", "Police inquiries, government requests", "Escalate directly to Jasmine — same day"] },
                { title: "General / Unclassified", color: "gray", items: ["Routes to 1st party team: Natashia, Annie, Josie, Tasha", "Triage within 24 hours", "Log in #claims-mail channel"] },
              ].map(card => (
                <div key={card.title} className="rounded-xl border border-border p-4">
                  <h3 className="font-semibold mb-2 text-sm">{card.title}</h3>
                  <ul className="space-y-1">
                    {card.items.map((item, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </WhipLayout>
  );
}
