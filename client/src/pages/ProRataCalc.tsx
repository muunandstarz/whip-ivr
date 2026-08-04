import { useState, useCallback } from "react";
import WhipLayout from "@/components/WhipLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, Ban, Info, Plus, Trash2, Copy, Check, Calculator } from "lucide-react";
import { toast } from "sonner";

// ─── State Data (exact from HTML spec) ────────────────────────────────────────
const STATES: Record<string, {
  name: string; biPP: number; biOcc: number; pd: number;
  doctrine: "contributory" | "mod50" | "mod51"; bar: number;
  noFault: boolean; notes: string[];
}> = {
  MD: { name: "Maryland",      biPP: 30000,  biOcc: 60000,  pd: 15000, doctrine: "contributory", bar: 0,  noFault: false, notes: ["Pure contributory negligence — any claimant fault bars BI recovery entirely.", "Last clear chance exception may apply — flag for outside counsel if disputed."] },
  GA: { name: "Georgia",       biPP: 25000,  biOcc: 50000,  pd: 25000, doctrine: "mod50",        bar: 50, noFault: false, notes: ["Modified comparative negligence — 50% bar.", "Georgia follows first-come, first-served for BI. Once the per-occurrence limit is exhausted, remaining claimants receive $0."] },
  IL: { name: "Illinois",      biPP: 25000,  biOcc: 50000,  pd: 20000, doctrine: "mod51",        bar: 51, noFault: false, notes: ["Modified comparative negligence — 51% bar."] },
  FL: { name: "Florida",       biPP: 10000,  biOcc: 20000,  pd: 10000, doctrine: "mod51",        bar: 51, noFault: true,  notes: ["Florida has no statutory BI minimum. BI limits shown are statutory PIP minimums only.", "Verify member's actual BI policy limit before calculating. No-fault state — PIP pays medical regardless of fault."] },
  VA: { name: "Virginia",      biPP: 50000,  biOcc: 100000, pd: 25000, doctrine: "contributory", bar: 0,  noFault: false, notes: ["Pure contributory negligence — any claimant fault bars BI recovery entirely.", "Last clear chance exception may apply — flag for outside counsel if disputed."] },
  PA: { name: "Pennsylvania",  biPP: 15000,  biOcc: 30000,  pd: 5000,  doctrine: "mod51",        bar: 51, noFault: true,  notes: ["Choice no-fault state. PIP required. BI claim viability depends on tort election — verify with claimant's carrier."] },
  NJ: { name: "New Jersey",    biPP: 35000,  biOcc: 70000,  pd: 25000, doctrine: "mod51",        bar: 51, noFault: true,  notes: ["Choice no-fault (updated Jan 1, 2026). Basic policy holders may not have BI coverage — verify policy tier before making BI payment."] },
  MA: { name: "Massachusetts", biPP: 25000,  biOcc: 50000,  pd: 30000, doctrine: "mod51",        bar: 51, noFault: true,  notes: ["No-fault / PIP state. PIP ($8,000) pays medical first regardless of fault.", "BI serious injury threshold applies before tort recovery is available."] },
  TX: { name: "Texas",         biPP: 30000,  biOcc: 60000,  pd: 25000, doctrine: "mod51",        bar: 51, noFault: false, notes: [] },
};

// ─── Types ─────────────────────────────────────────────────────────────────────
interface Claimant {
  id: string; name: string; carrier: string; fault: number;
  pd: number; pdDed: number; pdOop: number; bi: number; biOop: number; demandDate: string;
}
interface PDResult extends Claimant {
  total: number; firstDollarPayment: number; dedPayment: number; oopPayment: number;
  damagesShare: number; damagesPayment: number; payment: number;
  blocked: boolean; reason: string; firstDollarProRataApplied: boolean;
}
interface BIResult extends Claimant {
  total: number; payment: number; blocked: boolean; reason: string; exhaustedNow: boolean;
}
interface CalcResult {
  stateCode: string; s: typeof STATES[string]; memberFault: number;
  pdLimit: number; biLimitPP: number; biLimitOcc: number;
  availPD: number; availBIPP: number; availBIOcc: number;
  calcType: string; claimNum: string;
  pdResults: PDResult[]; biResults: BIResult[];
  biExhausted: boolean; biExhaustedAt: string | null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function doctrineLabel(d: string): string {
  if (d === "contributory") return "Pure Contributory Negligence";
  if (d === "mod50") return "Modified Comparative — 50% Bar";
  if (d === "mod51") return "Modified Comparative — 51% Bar";
  return d;
}
function newClaimant(): Claimant {
  return { id: crypto.randomUUID(), name: "", carrier: "", fault: 0, pd: 0, pdDed: 0, pdOop: 0, bi: 0, biOop: 0, demandDate: "" };
}

// ─── Core Calculation (exact port of HTML logic) ───────────────────────────────
function runCalc(stateCode: string, memberFault: number, pdLimit: number, biLimitPP: number, biLimitOcc: number, calcType: string, claimNum: string, claimants: Claimant[]): CalcResult {
  const s = STATES[stateCode];
  const availPD = pdLimit * (memberFault / 100);
  const availBIPP = biLimitPP * (memberFault / 100);
  const availBIOcc = biLimitOcc * (memberFault / 100);
  const pdResults: PDResult[] = [];
  if (calcType !== "bi") {
    const totalFirstDollar = claimants.reduce((sum, c) => sum + (c.pdDed || 0) + (c.pdOop || 0), 0);
    if (memberFault === 0) {
      claimants.forEach(c => pdResults.push({ ...c, total: c.pd + (c.pdDed||0) + c.pdOop, firstDollarPayment: 0, dedPayment: 0, oopPayment: 0, damagesShare: 0, damagesPayment: 0, payment: 0, blocked: true, reason: "Member has 0% fault — no payment available.", firstDollarProRataApplied: false }));
    } else if (totalFirstDollar >= availPD) {
      claimants.forEach(c => {
        const fd = (c.pdDed||0) + (c.pdOop||0);
        const share = totalFirstDollar > 0 ? fd / totalFirstDollar : 0;
        const fdPayment = Math.min(availPD * share, fd);
        pdResults.push({ ...c, total: c.pd + (c.pdDed||0) + c.pdOop, firstDollarPayment: fdPayment, dedPayment: c.pdDed||0, oopPayment: c.pdOop||0, damagesShare: 0, damagesPayment: 0, payment: fdPayment, blocked: false, reason: "", firstDollarProRataApplied: true });
      });
    } else {
      const pool = availPD - totalFirstDollar;
      const totalRepairs = claimants.reduce((sum, c) => sum + c.pd, 0);
      claimants.forEach(c => {
        const fd = (c.pdDed||0) + (c.pdOop||0);
        const repShare = totalRepairs > 0 ? c.pd / totalRepairs : 0;
        const repPmt = Math.min(pool * repShare, c.pd);
        pdResults.push({ ...c, total: c.pd + (c.pdDed||0) + c.pdOop, firstDollarPayment: fd, dedPayment: c.pdDed||0, oopPayment: c.pdOop||0, damagesShare: repShare, damagesPayment: repPmt, payment: fd + repPmt, blocked: false, reason: "", firstDollarProRataApplied: false });
      });
    }
  }
  const biResults: BIResult[] = [];
  let biExhausted = false, biExhaustedAt: string | null = null;
  if (calcType !== "pd") {
    let remaining = availBIOcc;
    const sorted = stateCode === "GA" ? [...claimants].sort((a, b) => { if (!a.demandDate && !b.demandDate) return 0; if (!a.demandDate) return 1; if (!b.demandDate) return -1; return new Date(a.demandDate).getTime() - new Date(b.demandDate).getTime(); }) : [...claimants];
    if (stateCode === "GA") {
      sorted.forEach(c => {
        const total = c.bi + c.biOop;
        let payment = 0, blocked = false, reason = "", exhaustedNow = false;
        if (memberFault === 0) { blocked = true; reason = "Member has 0% fault."; }
        else if (s.doctrine === "contributory" && c.fault > 0) { blocked = true; reason = `Claimant has ${c.fault}% fault — bars recovery (contributory negligence).`; }
        else if (s.doctrine !== "contributory" && c.fault >= s.bar) { blocked = true; reason = `Claimant's ${c.fault}% fault meets or exceeds the ${s.bar}% bar.`; }
        else if (remaining <= 0) { blocked = true; reason = "BI per-occurrence limit exhausted (GA first-come rule)."; biExhausted = true; }
        else { payment = Math.min(availBIPP, total, remaining); if (remaining - payment <= 0) { exhaustedNow = true; biExhaustedAt = c.name; } remaining -= payment; if (remaining < 0) remaining = 0; }
        biResults.push({ ...c, total, payment, blocked, reason, exhaustedNow });
      });
    } else {
      const totalClaimed = sorted.reduce((sum, c) => sum + c.bi + c.biOop, 0);
      sorted.forEach(c => {
        const total = c.bi + c.biOop;
        let payment = 0, blocked = false, reason = "";
        if (memberFault === 0) { blocked = true; reason = "Member has 0% fault."; }
        else if (s.doctrine === "contributory" && c.fault > 0) { blocked = true; reason = `Claimant has ${c.fault}% fault — bars recovery (contributory negligence).`; }
        else if (s.doctrine !== "contributory" && c.fault >= s.bar) { blocked = true; reason = `Claimant's ${c.fault}% fault meets or exceeds the ${s.bar}% bar.`; }
        else { const share = totalClaimed > 0 ? total / totalClaimed : 0; payment = Math.min(availBIPP, Math.min(availBIOcc * share, total)); }
        biResults.push({ ...c, total, payment, blocked, reason, exhaustedNow: false });
      });
    }
  }
  return { stateCode, s, memberFault, pdLimit, biLimitPP, biLimitOcc, availPD, availBIPP, availBIOcc, calcType, claimNum, pdResults, biResults, biExhausted, biExhaustedAt };
}

// ─── Snapsheet Note ────────────────────────────────────────────────────────────
function genSnapsheet(r: CalcResult): string {
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  let t = `PRO RATA CALC — ${today}\nClaim: ${r.claimNum} | State: ${r.s.name} | Member Fault: ${r.memberFault}%\nDoctrine: ${doctrineLabel(r.s.doctrine)}\n─────────────────────────────────────\n`;
  if (r.calcType !== "bi" && r.pdResults.length > 0) {
    const allFD = r.pdResults.reduce((s, x) => s + (x.pdDed||0) + (x.pdOop||0), 0);
    const pool = Math.max(0, r.availPD - allFD);
    const totalPD = r.pdResults.reduce((s, x) => s + x.payment, 0);
    t += `PROPERTY DAMAGE\nLimit: ${fmt(r.pdLimit)} | Available (${r.memberFault}%): ${fmt(r.availPD)}\nTotal First-Dollar: ${fmt(allFD)} | Pool for Repairs: ${fmt(pool)}\n\n`;
    r.pdResults.forEach((c, i) => { t += `  Claimant ${i+1}: ${c.name||"Unnamed"}\n  Repairs: ${fmt(c.pd||0)} | Ded: ${fmt(c.pdDed||0)} | OOP: ${fmt(c.pdOop||0)}\n`; if (c.blocked) t += `  Payment: $0.00 — ${c.reason}\n`; else t += `  First-Dollar: ${fmt(c.firstDollarPayment||0)}\n  Repairs Pro Rata (${((c.damagesShare||0)*100).toFixed(1)}%): ${fmt(c.damagesPayment||0)}\n  TOTAL: ${fmt(c.payment)}\n`; t += "\n"; });
    t += `Total PD Issued: ${fmt(totalPD)}\n─────────────────────────────────────\n`;
  }
  if (r.calcType !== "pd" && r.biResults.length > 0) {
    const totalBI = r.biResults.reduce((s, x) => s + x.payment, 0);
    t += `BODILY INJURY\nLimits: ${fmt(r.biLimitPP)}/person | ${fmt(r.biLimitOcc)}/occ\nAvailable: ${fmt(r.availBIPP)}/pp | ${fmt(r.availBIOcc)}/occ\n`;
    if (r.stateCode === "GA") t += `Rule: First-come, first-served (GA)\n`;
    t += "\n";
    r.biResults.forEach((c, i) => { t += `  Claimant ${i+1}: ${c.name||"Unnamed"}${c.demandDate ? ` | Demand: ${c.demandDate}` : ""}\n  BI Claimed: ${fmt(c.total)}\n`; if (c.blocked) t += `  Payment: $0.00 — ${c.reason}\n`; else t += `  TOTAL: ${fmt(c.payment)}\n`; t += "\n"; });
    t += `Total BI Issued: ${fmt(totalBI)}\n─────────────────────────────────────\n`;
  }
  return t + `Calculated by Whip Claims Pro Rata Calculator`;
}

// ─── Letter Generator ──────────────────────────────────────────────────────────
function genLetter(r: CalcResult, idx: number): string {
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const c = r.pdResults[idx] ?? r.biResults[idx];
  if (!c) return "Select a claimant to generate a letter.";
  const pdR = r.pdResults[idx];
  const biR = r.biResults[idx];
  const carrier = c.carrier || "Claimant / Claimant's Representative";
  const vehicle = c.name || "[Claimant]";
  const claim = r.claimNum || "[Claim Number]";
  const state = r.s.name;
  if (r.s.doctrine === "contributory" && c.fault > 0) {
    return `${today}\nRE: Claim No. ${claim}\nClaimant: ${vehicle}\nDear ${carrier},\n\nPlease accept this letter as confirmation of our liability evaluation in connection with the above-referenced loss occurring in the state of ${state}.\n\nFollowing the completion of our investigation, we are unable to extend payment on behalf of our insured at this time.\n\n${state} applies a pure contributory negligence doctrine. Under this standard, a claimant who bears any degree of fault for the subject accident is barred from recovering damages from another party, regardless of the extent of that party's own negligence.\n\nBased on our investigation, the facts of this loss reflect that the claimant bears ${c.fault}% responsibility for the accident. Accordingly, we are unable to issue payment under the applicable law.\n\nIf you believe our liability assessment is incorrect, we welcome the opportunity to review any additional evidence supporting a finding that our insured was solely responsible for this loss. Please direct any such documentation to our office at your earliest convenience.\n\nSincerely,\n\n[Handler Name]\nWhip / MetroCars Leasing Corporation — Claims Department\n\n---\nThis determination is made in good faith based on the facts available at the time of this writing and does not constitute a final waiver of any rights or defenses. Handler should consult with outside counsel for any dispute involving contributory negligence findings.`;
  }
  if (r.s.doctrine !== "contributory" && c.fault >= r.s.bar) {
    return `${today}\nRE: Claim No. ${claim}\nClaimant: ${vehicle}\nDear ${carrier},\n\nPlease accept this letter as confirmation of our liability evaluation in connection with the above-referenced loss occurring in the state of ${state}.\n\nFollowing the completion of our investigation, we are unable to extend payment on behalf of our insured at this time.\n\n${state} applies a modified comparative negligence doctrine with a ${r.s.bar}% bar. Under this standard, a claimant whose fault equals or exceeds ${r.s.bar}% is barred from recovering damages.\n\nBased on our investigation, the claimant has been assessed ${c.fault}% responsibility for this loss, which meets or exceeds the recovery threshold. Accordingly, we are unable to issue payment.\n\nIf you dispute this assessment, please submit supporting documentation to our office for further review.\n\nSincerely,\n\n[Handler Name]\nWhip / MetroCars Leasing Corporation — Claims Department`;
  }
  let body = `${today}\nRE: Claim No. ${claim}\nClaimant: ${vehicle}${c.carrier ? `\n${carrier}` : ""}\nDear ${carrier},\n\n`;
  if (pdR && !pdR.blocked && pdR.total > 0) {
    const allFD = r.pdResults.reduce((s, x) => s + (x.pdDed||0) + (x.pdOop||0), 0);
    body += `Please accept this letter as confirmation of our property damage evaluation and payment calculation for the above-referenced loss.\n\nFollowing completion of our investigation, liability for this loss was accepted on behalf of our driver. However, the total property damage exposure arising from this loss exceeds the available property damage limits applicable to the claim. As a result, payments are being issued on a pro rata basis among all involved claimants.\n\nThe applicable property damage limit available for this loss is ${fmt(r.availPD)}.\n\nAs part of our evaluation, documented out-of-pocket expenses — including deductibles and any applicable rental, storage, or towing costs — were reimbursed first as fixed, verifiable losses. Following reimbursement of these first-dollar expenses for all affected parties, the remaining available limits were distributed proportionally based on each claimant's repair damages.\n\n`;
    if (pdR.firstDollarProRataApplied) {
      body += `Please note that in this instance, the combined total of all claimant deductibles and out-of-pocket expenses (${fmt(allFD)}) exceeded the available limit. As a result, first-dollar reimbursements were themselves distributed on a pro rata basis, and no funds remained for repair damages.\n\nYour first-dollar reimbursement (deductible: ${fmt(pdR.pdDed||0)} + OOP: ${fmt(pdR.pdOop||0)}): ${fmt(pdR.firstDollarPayment||0)}\n\n`;
    } else {
      body += `Your insured's documented repair damages totaled ${fmt(pdR.pd||0)}, representing approximately ${((pdR.damagesShare||0)*100).toFixed(1)}% of the total repair damages for all claimants involved in this loss.\n\nBased on that proportional allocation, payment has been calculated as follows:\n\n  • Deductible Reimbursement: ${fmt(pdR.dedPayment||0)}\n  • Out-of-Pocket Reimbursement: ${fmt(pdR.oopPayment||0)}\n  • Repair Damages (Pro Rata): ${fmt(pdR.damagesPayment||0)}\n  • TOTAL PAYMENT: ${fmt(pdR.payment)}\n\n`;
    }
  }
  if (biR && !biR.blocked && biR.total > 0) {
    body += `Regarding the bodily injury claim: based on our investigation, liability was accepted at ${r.memberFault}% on behalf of our insured. The available bodily injury limit per person is ${fmt(r.availBIPP)} and ${fmt(r.availBIOcc)} per occurrence.\n\nYour total bodily injury damages claimed: ${fmt(biR.total)}\nPayment calculated: ${fmt(biR.payment)}\n\n`;
  }
  return body + `This calculation is for internal claims handling purposes and does not constitute legal advice. Handler should consult with defense counsel for any dispute involving contributory negligence, comparative fault bars, or contested liability.\n\nSincerely,\n\n[Handler Name]\nWhip / MetroCars Leasing Corporation — Claims Department`;
}

// ─── Claimant Card ─────────────────────────────────────────────────────────────
function ClaimantCard({ c, idx, stateCode, calcType, onChange, onRemove }: { c: Claimant; idx: number; stateCode: string; calcType: string; onChange: (id: string, f: keyof Claimant, v: string | number) => void; onRemove: (id: string) => void; }) {
  return (
    <div className="border border-border rounded-xl p-4 bg-card/50">
      <div className="flex items-center justify-between mb-3">
        <span className="font-semibold text-sm">Claimant {idx + 1}</span>
        {idx > 0 && <Button variant="ghost" size="sm" onClick={() => onRemove(c.id)} className="h-7 text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5 mr-1" />Remove</Button>}
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div><Label className="text-xs text-muted-foreground">Claimant Name</Label><Input value={c.name} onChange={e => onChange(c.id, "name", e.target.value)} placeholder="Name" className="mt-1 h-8 text-sm" /></div>
        <div><Label className="text-xs text-muted-foreground">Carrier / Rep</Label><Input value={c.carrier} onChange={e => onChange(c.id, "carrier", e.target.value)} placeholder="Carrier name" className="mt-1 h-8 text-sm" /></div>
        <div><Label className="text-xs text-muted-foreground">Claimant Fault %</Label><Input type="number" min={0} max={100} value={c.fault} onChange={e => onChange(c.id, "fault", parseFloat(e.target.value)||0)} className="mt-1 h-8 text-sm" /></div>
        {stateCode === "GA" && calcType !== "pd" && <div><Label className="text-xs text-muted-foreground">Demand Date (GA — FCFS)</Label><Input type="date" value={c.demandDate} onChange={e => onChange(c.id, "demandDate", e.target.value)} className="mt-1 h-8 text-sm" /></div>}
      </div>
      {calcType !== "bi" && (
        <div className="mb-3">
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Property Damage</p>
          <div className="grid grid-cols-3 gap-3">
            <div><Label className="text-xs text-muted-foreground">Repair Damages</Label><Input type="number" min={0} value={c.pd} onChange={e => onChange(c.id, "pd", parseFloat(e.target.value)||0)} className="mt-1 h-8 text-sm" /></div>
            <div><Label className="text-xs text-muted-foreground">Deductible</Label><Input type="number" min={0} value={c.pdDed} onChange={e => onChange(c.id, "pdDed", parseFloat(e.target.value)||0)} className="mt-1 h-8 text-sm" /></div>
            <div><Label className="text-xs text-muted-foreground">OOP (rental/tow)</Label><Input type="number" min={0} value={c.pdOop} onChange={e => onChange(c.id, "pdOop", parseFloat(e.target.value)||0)} className="mt-1 h-8 text-sm" /></div>
          </div>
        </div>
      )}
      {calcType !== "pd" && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Bodily Injury</p>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs text-muted-foreground">BI Claimed</Label><Input type="number" min={0} value={c.bi} onChange={e => onChange(c.id, "bi", parseFloat(e.target.value)||0)} className="mt-1 h-8 text-sm" /></div>
            <div><Label className="text-xs text-muted-foreground">BI OOP (medical)</Label><Input type="number" min={0} value={c.biOop} onChange={e => onChange(c.id, "biOop", parseFloat(e.target.value)||0)} className="mt-1 h-8 text-sm" /></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function ProRataCalc() {
  const [stateCode, setStateCode] = useState("MD");
  const [memberFault, setMemberFault] = useState(100);
  const [pdLimit, setPdLimit] = useState(STATES["MD"].pd);
  const [biLimitPP, setBiLimitPP] = useState(STATES["MD"].biPP);
  const [biLimitOcc, setBiLimitOcc] = useState(STATES["MD"].biOcc);
  const [calcType, setCalcType] = useState("both");
  const [claimNum, setClaimNum] = useState("");
  const [claimants, setClaimants] = useState<Claimant[]>([newClaimant()]);
  const [result, setResult] = useState<CalcResult | null>(null);
  const [activeLetterIdx, setActiveLetterIdx] = useState(0);
  const [copiedSnap, setCopiedSnap] = useState(false);
  const [copiedLetter, setCopiedLetter] = useState(false);


  const handleStateChange = useCallback((code: string) => {
    setStateCode(code); const s = STATES[code];
    setPdLimit(s.pd); setBiLimitPP(s.biPP); setBiLimitOcc(s.biOcc); setResult(null);
  }, []);

  const handleClaimantChange = useCallback((id: string, f: keyof Claimant, v: string | number) => {
    setClaimants(prev => prev.map(c => c.id === id ? { ...c, [f]: v } : c)); setResult(null);
  }, []);

  const handleCalculate = useCallback(() => {
    if (!stateCode) { toast.error("Select a state"); return; }
    if (claimants.length === 0) { toast.error("Add at least one claimant"); return; }
    setResult(runCalc(stateCode, memberFault, pdLimit, biLimitPP, biLimitOcc, calcType, claimNum, claimants));
    setActiveLetterIdx(0);
  }, [stateCode, memberFault, pdLimit, biLimitPP, biLimitOcc, calcType, claimNum, claimants]);

  const handleReset = useCallback(() => {
    setResult(null); setClaimants([newClaimant()]); setStateCode("MD"); setMemberFault(100);
    const s = STATES["MD"]; setPdLimit(s.pd); setBiLimitPP(s.biPP); setBiLimitOcc(s.biOcc);
    setCalcType("both"); setClaimNum("");
  }, []);

  const s = STATES[stateCode];

  return (
    <WhipLayout>
      <div className="max-w-5xl mx-auto py-6 px-4 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Calculator className="h-6 w-6 text-[#ff6221]" /> PD / BI Pro Rata Calculator
            </h1>
            <p className="text-sm text-muted-foreground mt-1">State-aware liability payment calculator for Whip / MetroCars claims</p>
          </div>
          {result && <Button variant="outline" size="sm" onClick={handleReset}>Reset Calculator</Button>}
        </div>

        {!result ? (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Claim Setup</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">State of Loss</Label>
                    <Select value={stateCode} onValueChange={handleStateChange}>
                      <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(STATES).map(([code, st]) => <SelectItem key={code} value={code}>{st.name}</SelectItem>)}</SelectContent>
                    </Select>
                    {s.notes.length > 0 && (
                      <div className={`mt-2 p-2.5 rounded-lg text-xs flex gap-2 ${s.doctrine === "contributory" ? "bg-destructive/10 text-destructive border border-destructive/20" : "bg-amber-500/10 text-amber-600 border border-amber-500/20"}`}>
                        <span className="flex-shrink-0">{s.doctrine === "contributory" ? "🚫" : "⚠️"}</span>
                        <div><strong>{s.name} — {doctrineLabel(s.doctrine)}</strong><ul className="mt-1 space-y-0.5">{s.notes.map((n, i) => <li key={i}>• {n}</li>)}</ul></div>
                      </div>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div><Label className="text-xs text-muted-foreground">Claim Number</Label><Input value={claimNum} onChange={e => setClaimNum(e.target.value)} placeholder="e.g. MD-6178755821" className="mt-1 h-9 text-sm" /></div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Calculation Type</Label>
                      <Select value={calcType} onValueChange={v => { setCalcType(v); setResult(null); }}>
                        <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="both">PD + BI (Both)</SelectItem>
                          <SelectItem value="pd">PD Only</SelectItem>
                          <SelectItem value="bi">BI Only</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <Separator />
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">Member Fault & Policy Limits</p>
                  <div className="grid grid-cols-4 gap-3">
                    <div><Label className="text-xs text-muted-foreground">Member Fault %</Label><Input type="number" min={0} max={100} value={memberFault} onChange={e => { setMemberFault(parseFloat(e.target.value)||0); setResult(null); }} className="mt-1 h-9 text-sm" /></div>
                    {calcType !== "bi" && <div><Label className="text-xs text-muted-foreground">PD Limit</Label><Input type="number" min={0} value={pdLimit} onChange={e => { setPdLimit(parseFloat(e.target.value)||0); setResult(null); }} className="mt-1 h-9 text-sm" /></div>}
                    {calcType !== "pd" && <>
                      <div><Label className="text-xs text-muted-foreground">BI / Person</Label><Input type="number" min={0} value={biLimitPP} onChange={e => { setBiLimitPP(parseFloat(e.target.value)||0); setResult(null); }} className="mt-1 h-9 text-sm" /></div>
                      <div><Label className="text-xs text-muted-foreground">BI / Occurrence</Label><Input type="number" min={0} value={biLimitOcc} onChange={e => { setBiLimitOcc(parseFloat(e.target.value)||0); setResult(null); }} className="mt-1 h-9 text-sm" /></div>
                    </>}
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Claimants</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {claimants.map((cl, i) => <ClaimantCard key={cl.id} c={cl} idx={i} stateCode={stateCode} calcType={calcType} onChange={handleClaimantChange} onRemove={id => setClaimants(prev => prev.filter(c => c.id !== id))} />)}
                <Button variant="outline" className="w-full border-dashed" onClick={() => setClaimants(prev => [...prev, newClaimant()])}><Plus className="h-4 w-4 mr-2" />Add Claimant</Button>
              </CardContent>
            </Card>
            <Button className="w-full bg-[#ff6221] hover:bg-[#e5571d] text-white font-semibold py-3" onClick={handleCalculate}>Calculate Pro Rata Payments</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary Tiles */}
            <div className="grid grid-cols-3 gap-4">
              <Card className="border-[#ff6221]/30 bg-[#ff6221]/5"><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Member Fault</p><p className="text-3xl font-black">{result.memberFault}%</p><p className="text-xs text-muted-foreground mt-1">{doctrineLabel(result.s.doctrine)}</p></CardContent></Card>
              <Card className="border-green-500/30 bg-green-500/5"><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total PD Payment</p><p className="text-3xl font-black text-green-600">{fmt(result.pdResults.reduce((s, c) => s + c.payment, 0))}</p><p className="text-xs text-muted-foreground mt-1">of {fmt(result.availPD)} available</p></CardContent></Card>
              <Card className="border-blue-500/30 bg-blue-500/5"><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total BI Payment</p><p className="text-3xl font-black text-blue-600">{fmt(result.biResults.reduce((s, c) => s + c.payment, 0))}</p><p className="text-xs text-muted-foreground mt-1">of {fmt(result.availBIOcc)} occ. available</p></CardContent></Card>
            </div>
            {/* Alerts */}
            {result.s.doctrine === "contributory" && result.pdResults.some(c => c.fault > 0) && (
              <div className="flex gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm"><Ban className="h-4 w-4 flex-shrink-0 mt-0.5" /><div><strong>Contributory Negligence Block</strong> — {result.s.name}: any claimant with assigned fault is barred from BI recovery. Review claimant fault percentages carefully. Last clear chance exception may apply — consult outside counsel if disputed.</div></div>
            )}
            {result.s.noFault && <div className="flex gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-700 text-sm"><Info className="h-4 w-4 flex-shrink-0 mt-0.5" /><div><strong>{result.s.name} — No-Fault / PIP State</strong> — PIP coverage pays medical bills regardless of fault. Confirm PIP has been exhausted before processing BI claims. For PA/NJ, verify tort election on claimant's policy.</div></div>}
            {result.biExhausted && <div className="flex gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 text-sm"><AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" /><div><strong>Georgia — BI Limit Exhausted (First-Come, First-Served)</strong> — The per-occurrence BI limit has been exhausted. Remaining claimants receive $0 under GA's first-come rule. Trigger the BI Exhaustion Letter for affected claimants.</div></div>}
            {/* PD Table */}
            {result.calcType !== "bi" && result.pdResults.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-2">Property Damage Results<Badge variant="outline" className="font-mono text-xs">Limit {fmt(result.pdLimit)} · Available {fmt(result.availPD)}</Badge></CardTitle></CardHeader>
                <CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-xs text-muted-foreground">{["Claimant","Repairs","Deductible","OOP","Total Claimed","First-Dollar Pmt","Repairs Pro Rata","Total Payment"].map(h => <th key={h} className="text-left py-2 pr-3 font-medium">{h}</th>)}</tr></thead><tbody>{result.pdResults.map((c, i) => (<tr key={i} className="border-b last:border-0"><td className="py-2 pr-3 font-medium">{c.name||"Unnamed"}<div className="text-xs text-muted-foreground">{c.carrier}</div></td><td className="py-2 pr-3">{fmt(c.pd||0)}</td><td className="py-2 pr-3">{fmt(c.pdDed||0)}</td><td className="py-2 pr-3">{fmt(c.pdOop||0)}</td><td className="py-2 pr-3">{fmt(c.total)}</td><td className="py-2 pr-3">{c.blocked?"—":fmt(c.firstDollarPayment||0)}{c.firstDollarProRataApplied&&<div className="text-xs text-amber-600">Pro rata'd — pool exhausted</div>}</td><td className="py-2 pr-3">{c.blocked?"—":fmt(c.damagesPayment||0)}{!c.blocked&&c.damagesShare>0&&<div className="text-xs text-muted-foreground">{(c.damagesShare*100).toFixed(1)}% share</div>}</td><td className="py-2">{c.blocked?<><span className="font-bold text-destructive">$0.00</span><div className="text-xs text-muted-foreground">{c.reason}</div></>:<span className="font-bold text-green-600">{fmt(c.payment)}</span>}</td></tr>))}</tbody></table></div></CardContent>
              </Card>
            )}
            {/* BI Table */}
            {result.calcType !== "pd" && result.biResults.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-2">Bodily Injury Results<Badge variant="outline" className="font-mono text-xs">{fmt(result.biLimitPP)}/pp · {fmt(result.biLimitOcc)}/occ · Avail {fmt(result.availBIPP)}pp / {fmt(result.availBIOcc)}occ</Badge></CardTitle></CardHeader>
                <CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-xs text-muted-foreground">{["Claimant","BI Claimed","BI OOP","Total","Payment"].map(h => <th key={h} className="text-left py-2 pr-3 font-medium">{h}</th>)}</tr></thead><tbody>{result.biResults.map((c, i) => (<tr key={i} className="border-b last:border-0"><td className="py-2 pr-3 font-medium">{c.name||"Unnamed"}{c.demandDate&&<div className="text-xs text-muted-foreground">Demand: {c.demandDate}</div>}<div className="text-xs text-muted-foreground">{c.carrier}</div></td><td className="py-2 pr-3">{fmt(c.bi)}</td><td className="py-2 pr-3">{fmt(c.biOop)}</td><td className="py-2 pr-3">{fmt(c.total)}</td><td className="py-2">{c.blocked?<><span className="font-bold text-destructive">$0.00</span><div className="text-xs text-muted-foreground">{c.reason}</div></>:<><span className="font-bold text-blue-600">{fmt(c.payment)}</span>{c.exhaustedNow&&<div className="text-xs text-destructive">Limit exhausted at this claimant</div>}</>}</td></tr>))}</tbody></table></div></CardContent>
              </Card>
            )}
            {/* Snapsheet */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Copy to Snapsheet Notes</CardTitle></CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">Plain-text summary formatted for paste into Snapsheet claim history.</p>
                <pre className="text-xs font-mono bg-muted/50 rounded-lg p-3 whitespace-pre-wrap overflow-x-auto">{genSnapsheet(result)}</pre>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => { navigator.clipboard.writeText(genSnapsheet(result)).then(() => { setCopiedSnap(true); setTimeout(() => setCopiedSnap(false), 2000); }); }}>
                  {copiedSnap ? <><Check className="h-3.5 w-3.5 mr-1.5 text-green-600" />Copied</> : <><Copy className="h-3.5 w-3.5 mr-1.5" />Copy to Clipboard</>}
                </Button>
              </CardContent>
            </Card>
            {/* Letters */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Explanation Letter</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2 mb-3">
                  {claimants.map((cl, i) => <Button key={i} size="sm" variant={activeLetterIdx === i ? "default" : "outline"} onClick={() => setActiveLetterIdx(i)} className={activeLetterIdx === i ? "bg-[#ff6221] hover:bg-[#e5571d]" : ""}>{cl.name || `Claimant ${i + 1}`}</Button>)}
                </div>
                <pre className="text-xs font-mono bg-muted/50 rounded-lg p-3 whitespace-pre-wrap overflow-x-auto min-h-[200px]">{genLetter(result, activeLetterIdx)}</pre>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => { navigator.clipboard.writeText(genLetter(result, activeLetterIdx)).then(() => { setCopiedLetter(true); setTimeout(() => setCopiedLetter(false), 2000); }); }}>
                  {copiedLetter ? <><Check className="h-3.5 w-3.5 mr-1.5 text-green-600" />Copied</> : <><Copy className="h-3.5 w-3.5 mr-1.5" />Copy Letter</>}
                </Button>
              </CardContent>
            </Card>
            <p className="text-xs text-muted-foreground text-center">This calculation is for internal claims handling purposes and does not constitute legal advice. Handler should consult with defense counsel for any dispute involving contributory negligence, comparative fault bars, or contested liability.</p>
          </div>
        )}
      </div>
    </WhipLayout>
  );
}
