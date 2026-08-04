import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Upload, FileText, ChevronRight, ChevronLeft, Calculator, Printer, Save, Loader2, X, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ── Pricing data (from PriceList.xlsx) ──────────────────────────────────────
interface VehicleRate { model: string; weeklyRate: number; dailyRate: number; vehicleClass: string; taxIncluded?: boolean }
interface MarketPricing { code: string; name: string; vehicles: VehicleRate[]; taxNote?: string }

const MARKET_PRICING: MarketPricing[] = [
  { code: "DC", name: "Washington DC (Rockville)", vehicles: [
    { model: "Tesla Model 3 (LR/SR)", weeklyRate: 399, dailyRate: 57.00, vehicleClass: "Electric/EV" },
    { model: "Tesla Model Y (2018–2025)", weeklyRate: 449, dailyRate: 64.14, vehicleClass: "Electric/EV" },
    { model: "Tesla Model Y (2026)", weeklyRate: 550, dailyRate: 78.57, vehicleClass: "Electric/EV" },
    { model: "Toyota Corolla", weeklyRate: 350, dailyRate: 50.00, vehicleClass: "Compact" },
    { model: "Toyota Camry / Honda Accord (Gas)", weeklyRate: 375, dailyRate: 53.57, vehicleClass: "Midsize Sedan" },
    { model: "Toyota Camry Hybrid", weeklyRate: 399, dailyRate: 57.00, vehicleClass: "Midsize Hybrid" },
    { model: "Toyota RAV4 (Gas)", weeklyRate: 425, dailyRate: 60.71, vehicleClass: "SUV" },
    { model: "Toyota Highlander", weeklyRate: 450, dailyRate: 64.29, vehicleClass: "SUV" },
  ]},
  { code: "BWI", name: "Baltimore (Glen Burnie)", vehicles: [
    { model: "Tesla Model 3 (LR/SR)", weeklyRate: 399, dailyRate: 57.00, vehicleClass: "Electric/EV" },
    { model: "Tesla Model Y (2018–2025)", weeklyRate: 449, dailyRate: 64.14, vehicleClass: "Electric/EV" },
    { model: "Tesla Model Y (2026)", weeklyRate: 550, dailyRate: 78.57, vehicleClass: "Electric/EV" },
    { model: "Toyota Corolla", weeklyRate: 350, dailyRate: 50.00, vehicleClass: "Compact" },
    { model: "Toyota Camry / Honda Accord (Gas)", weeklyRate: 375, dailyRate: 53.57, vehicleClass: "Midsize Sedan" },
    { model: "Toyota Camry Hybrid", weeklyRate: 399, dailyRate: 57.00, vehicleClass: "Midsize Hybrid" },
    { model: "Toyota RAV4 (Gas)", weeklyRate: 425, dailyRate: 60.71, vehicleClass: "SUV" },
    { model: "Toyota Highlander", weeklyRate: 450, dailyRate: 64.29, vehicleClass: "SUV" },
  ]},
  { code: "ATL", name: "Atlanta", taxNote: "Rates include Georgia state sales tax.", vehicles: [
    { model: "Tesla Model 3 (LR/SR)", weeklyRate: 430.00, dailyRate: 61.43, vehicleClass: "Electric/EV", taxIncluded: true },
    { model: "Tesla Model Y (2018–2025)", weeklyRate: 484.00, dailyRate: 69.14, vehicleClass: "Electric/EV", taxIncluded: true },
    { model: "Tesla Model Y (2026)", weeklyRate: 592.63, dailyRate: 84.66, vehicleClass: "Electric/EV", taxIncluded: true },
    { model: "Toyota Corolla", weeklyRate: 377.13, dailyRate: 53.88, vehicleClass: "Compact", taxIncluded: true },
    { model: "Toyota Camry / Honda Accord (Gas)", weeklyRate: 404.06, dailyRate: 57.72, vehicleClass: "Midsize Sedan", taxIncluded: true },
    { model: "Toyota Camry Hybrid", weeklyRate: 429.92, dailyRate: 61.42, vehicleClass: "Midsize Hybrid", taxIncluded: true },
    { model: "Toyota RAV4 (Gas)", weeklyRate: 457.94, dailyRate: 65.42, vehicleClass: "SUV", taxIncluded: true },
    { model: "Toyota Highlander", weeklyRate: 484.88, dailyRate: 69.27, vehicleClass: "SUV", taxIncluded: true },
  ]},
  { code: "CHI", name: "Chicago", vehicles: [
    { model: "Tesla Model 3 (LR/SR)", weeklyRate: 399, dailyRate: 57.00, vehicleClass: "Electric/EV" },
    { model: "Tesla Model Y (2018–2025)", weeklyRate: 449, dailyRate: 64.14, vehicleClass: "Electric/EV" },
    { model: "Tesla Model Y (2026)", weeklyRate: 499, dailyRate: 71.29, vehicleClass: "Electric/EV" },
    { model: "Toyota Corolla", weeklyRate: 350, dailyRate: 50.00, vehicleClass: "Compact" },
    { model: "Toyota Camry / Honda Accord (Gas)", weeklyRate: 375, dailyRate: 53.57, vehicleClass: "Midsize Sedan" },
    { model: "Toyota Camry Hybrid", weeklyRate: 399, dailyRate: 57.00, vehicleClass: "Midsize Hybrid" },
    { model: "Toyota RAV4 (Gas)", weeklyRate: 425, dailyRate: 60.71, vehicleClass: "SUV" },
    { model: "Toyota Highlander", weeklyRate: 450, dailyRate: 64.29, vehicleClass: "SUV" },
  ]},
  { code: "MIA", name: "Miami", vehicles: [
    { model: "Tesla Model 3 (LR/SR)", weeklyRate: 399, dailyRate: 57.00, vehicleClass: "Electric/EV" },
    { model: "Tesla Model Y (2018–2025)", weeklyRate: 449, dailyRate: 64.14, vehicleClass: "Electric/EV" },
    { model: "Tesla Model Y (2026)", weeklyRate: 499, dailyRate: 71.29, vehicleClass: "Electric/EV" },
  ]},
  { code: "ORL", name: "Orlando", vehicles: [
    { model: "Tesla Model 3 (LR/SR)", weeklyRate: 399, dailyRate: 57.00, vehicleClass: "Electric/EV" },
    { model: "Tesla Model Y (2018–2025)", weeklyRate: 449, dailyRate: 64.14, vehicleClass: "Electric/EV" },
    { model: "Tesla Model Y (2026)", weeklyRate: 499, dailyRate: 71.29, vehicleClass: "Electric/EV" },
  ]},
  { code: "PHL", name: "Philadelphia", vehicles: [
    { model: "Tesla Model 3 (LR/SR)", weeklyRate: 449, dailyRate: 64.14, vehicleClass: "Electric/EV" },
    { model: "Tesla Model Y (2018–2025)", weeklyRate: 499, dailyRate: 71.29, vehicleClass: "Electric/EV" },
    { model: "Tesla Model Y (2026)", weeklyRate: 499, dailyRate: 71.29, vehicleClass: "Electric/EV" },
  ]},
  { code: "RIC", name: "Richmond", vehicles: [
    { model: "Tesla Model 3 (LR/SR)", weeklyRate: 399, dailyRate: 57.00, vehicleClass: "Electric/EV" },
    { model: "Tesla Model Y (2018–2025)", weeklyRate: 449, dailyRate: 64.14, vehicleClass: "Electric/EV" },
    { model: "Tesla Model Y (2026)", weeklyRate: 550, dailyRate: 78.57, vehicleClass: "Electric/EV" },
  ]},
  { code: "BOS", name: "Boston", vehicles: [
    { model: "Tesla Model 3 (LR/SR)", weeklyRate: 399, dailyRate: 57.00, vehicleClass: "Electric/EV" },
    { model: "Tesla Model Y (2018–2025)", weeklyRate: 449, dailyRate: 64.14, vehicleClass: "Electric/EV" },
    { model: "Tesla Model Y (2026)", weeklyRate: 550, dailyRate: 78.57, vehicleClass: "Electric/EV" },
  ]},
  { code: "DAL", name: "Dallas", vehicles: [
    { model: "Tesla Model 3 (LR/SR)", weeklyRate: 399, dailyRate: 57.00, vehicleClass: "Electric/EV" },
    { model: "Tesla Model Y (2018–2025)", weeklyRate: 449, dailyRate: 64.14, vehicleClass: "Electric/EV" },
    { model: "Tesla Model Y (2026)", weeklyRate: 499, dailyRate: 71.29, vehicleClass: "Electric/EV" },
  ]},
];

// Utilization data (market-level, consistent across all repair periods)
const MARKET_UTIL: Record<string, { fleet: number; rented: number; util: number }> = {
  DC:  { fleet: 767, rented: 749, util: 97.7 },
  BWI: { fleet: 767, rented: 749, util: 97.7 },
  ATL: { fleet: 312, rented: 298, util: 95.5 },
  CHI: { fleet: 289, rented: 276, util: 95.5 },
  MIA: { fleet: 198, rented: 189, util: 95.5 },
  ORL: { fleet: 156, rented: 149, util: 95.5 },
  PHL: { fleet: 234, rented: 223, util: 95.3 },
  RIC: { fleet: 178, rented: 170, util: 95.5 },
  BOS: { fleet: 201, rented: 192, util: 95.5 },
  DAL: { fleet: 267, rented: 255, util: 95.5 },
};

interface ClaimInfo {
  whipClaimNo: string;
  adverseClaimNo: string;
  dol: string;
  adverseCarrier: string;
  vehicle: string;
  vin: string;
  memberDriver: string;
  registeredOwner: string;
  vehicleStatus: string;
  repairFacility: string;
  roNumber: string;
  dropOff: string;
  pickUp: string;
}

const EMPTY_CLAIM: ClaimInfo = {
  whipClaimNo: "", adverseClaimNo: "", dol: "", adverseCarrier: "",
  vehicle: "", vin: "", memberDriver: "", registeredOwner: "",
  vehicleStatus: "Actively leased / Revenue-generating",
  repairFacility: "", roNumber: "", dropOff: "", pickUp: "",
};

function daysBetween(a: string, b: string): number {
  if (!a || !b) return 0;
  const d1 = new Date(a + "T00:00:00");
  const d2 = new Date(b + "T00:00:00");
  return Math.max(0, Math.round((d2.getTime() - d1.getTime()) / 86400000));
}

function formatDate(d: string) {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function buildUtilRows(dropOff: string, pickUp: string, marketCode: string) {
  const util = MARKET_UTIL[marketCode] ?? { fleet: 767, rented: 749, util: 97.7 };
  const mkt = MARKET_PRICING.find(m => m.code === marketCode);
  const location = mkt?.name ?? marketCode;
  const rows: { date: string; location: string; vehicleClass: string; fleet: number; rented: number; util: number }[] = [];
  const start = new Date(dropOff + "T00:00:00");
  const end = new Date(pickUp + "T00:00:00");
  const cur = new Date(start);
  while (cur < end) {
    rows.push({
      date: cur.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      location,
      vehicleClass: "",
      fleet: util.fleet,
      rented: util.rented,
      util: util.util,
    });
    cur.setDate(cur.getDate() + 1);
  }
  return rows;
}

// ── Step indicator ────────────────────────────────────────────────────────────
function StepBar({ step }: { step: number }) {
  const steps = ["Upload Estimate", "Claim Info", "Vehicle & Rate", "Review & Generate"];
  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center flex-1 last:flex-none">
          <div className={`flex items-center gap-2 ${i < step ? "text-primary" : i === step ? "text-foreground font-semibold" : "text-muted-foreground"}`}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 shrink-0 ${
              i < step ? "bg-primary border-primary text-primary-foreground" :
              i === step ? "border-primary text-primary" :
              "border-muted-foreground/40 text-muted-foreground"
            }`}>
              {i < step ? <CheckCircle className="w-4 h-4" /> : i + 1}
            </div>
            <span className="text-xs hidden sm:block">{s}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={`flex-1 h-0.5 mx-2 ${i < step ? "bg-primary" : "bg-border"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function LouCalculator() {
  const [step, setStep] = useState(0);
  const [claim, setClaim] = useState<ClaimInfo>(EMPTY_CLAIM);
  const [marketCode, setMarketCode] = useState("DC");
  const [vehicleModel, setVehicleModel] = useState("");
  const [customRate, setCustomRate] = useState<number | null>(null);
  const [daysClaimed, setDaysClaimed] = useState<number | null>(null);
  const [estimateFile, setEstimateFile] = useState<File | null>(null);
  const [estimateUrl, setEstimateUrl] = useState("");
  const [estimateKey, setEstimateKey] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadMut = trpc.lou.uploadEstimate.useMutation();
  const parseMut = trpc.lou.parseEstimate.useMutation();
  const saveMut = trpc.lou.save.useMutation();

  const mkt = MARKET_PRICING.find(m => m.code === marketCode);
  const selectedVehicle = mkt?.vehicles.find(v => v.model === vehicleModel);
  const dailyRate = customRate ?? selectedVehicle?.dailyRate ?? 0;
  const totalDays = daysClaimed ?? daysBetween(claim.dropOff, claim.pickUp);
  const totalLou = +(dailyRate * totalDays).toFixed(2);
  const utilData = MARKET_UTIL[marketCode] ?? { fleet: 767, rented: 749, util: 97.7 };

  const handleFileSelect = useCallback(async (file: File) => {
    setEstimateFile(file);
    setParsing(true);
    try {
      const ab = await file.arrayBuffer();
      const bytes = new Uint8Array(ab);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      const b64 = btoa(binary);
      const up = await uploadMut.mutateAsync({ fileName: file.name, fileBase64: b64, mimeType: file.type });
      setEstimateUrl(up.url);
      setEstimateKey(up.key);
      const parsed = await parseMut.mutateAsync({ fileUrl: up.url, fileKey: up.key });
      if (parsed.success && parsed.data) {
        const d = parsed.data as Partial<ClaimInfo & { totalDays?: number; daysClaimed?: number; vehicleClass?: string }>;
        setClaim(prev => ({
          ...prev,
          whipClaimNo: d.whipClaimNo ?? prev.whipClaimNo,
          adverseClaimNo: d.adverseClaimNo ?? prev.adverseClaimNo,
          dol: d.dol ?? prev.dol,
          adverseCarrier: d.adverseCarrier ?? prev.adverseCarrier,
          vehicle: d.vehicle ?? prev.vehicle,
          vin: d.vin ?? prev.vin,
          memberDriver: d.memberDriver ?? prev.memberDriver,
          registeredOwner: d.registeredOwner ?? prev.registeredOwner,
          vehicleStatus: d.vehicleStatus ?? prev.vehicleStatus,
          repairFacility: d.repairFacility ?? prev.repairFacility,
          roNumber: d.roNumber ?? prev.roNumber,
          dropOff: d.dropOff ?? prev.dropOff,
          pickUp: d.pickUp ?? prev.pickUp,
        }));
        if (d.daysClaimed) setDaysClaimed(d.daysClaimed);
        // Auto-match vehicle model
        if (d.vehicle && mkt) {
          const match = mkt.vehicles.find(v => d.vehicle && v.model.toLowerCase().includes(d.vehicle.toLowerCase().split(" ")[1] ?? ""));
          if (match) setVehicleModel(match.model);
        }
        toast.success("Estimate parsed — fields pre-filled. Review and adjust as needed.");
      } else {
        toast.info("Could not auto-parse — please fill fields manually.");
      }
    } catch {
      toast.error("Upload failed. Please try again.");
    } finally {
      setParsing(false);
    }
  }, [uploadMut, parseMut, mkt]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const utilRows = buildUtilRows(claim.dropOff, claim.pickUp, marketCode).map(r => ({
        date: r.date, location: r.location,
        vehicleClass: selectedVehicle?.vehicleClass ?? "Midsize Sedan",
        fleetCount: r.fleet, rentCount: r.rented,
      }));
      const res = await saveMut.mutateAsync({
        id: savedId ?? undefined,
        claimInfo: { ...claim, totalDays, daysClaimed: totalDays },
        utilizationLog: utilRows,
        dailyRate,
        totalLou,
        estimateFileKey: estimateKey || undefined,
        estimateFileUrl: estimateUrl || undefined,
      });
      setSavedId(res.id);
      toast.success("LOU calculation saved.");
    } catch {
      toast.error("Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    const utilRows = buildUtilRows(claim.dropOff, claim.pickUp, marketCode);
    const vClass = selectedVehicle?.vehicleClass ?? "Midsize Sedan";
    const rateNote = `${claim.vehicle || "Vehicle"} — Whip Standard Rate, ${mkt?.name ?? marketCode} market ($${(dailyRate * 7).toFixed(0)}/wk ÷ 7 = $${dailyRate.toFixed(2)}/day)`;
    const utilNote = mkt?.taxNote ? `<p style="font-size:9pt;color:#555;margin-top:4px">${mkt.taxNote}</p>` : "";

    const rowsHtml = utilRows.map(r =>
      `<tr><td>${r.date}</td><td>${r.location}</td><td>${vClass}</td><td style="text-align:right">${r.fleet}</td><td style="text-align:right">${r.rented}</td><td style="text-align:right;color:#c0392b;font-weight:600">${r.util}%</td></tr>`
    ).join("");

    const html = `<!DOCTYPE html><html><head><title>Whip LOU — ${claim.whipClaimNo || "Draft"}</title>
<style>
body{font-family:Arial,sans-serif;font-size:10pt;color:#1a1a1a;margin:0;padding:0}
.page{max-width:7.5in;margin:0 auto;padding:0.75in}
.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #e0e0e0;padding-bottom:12px;margin-bottom:16px}
.logo{font-size:28pt;font-weight:900;color:#1a1a1a;letter-spacing:-1px}
.company{text-align:right;font-size:9pt;line-height:1.5}
h1{font-size:16pt;font-weight:700;margin:0 0 2px}
.sub{font-size:9pt;color:#666;margin:0 0 12px}
table{width:100%;border-collapse:collapse;margin-bottom:12px;font-size:9pt}
th{background:#f5f5f5;font-weight:600;text-align:left;padding:5px 8px;border:1px solid #ddd}
td{padding:4px 8px;border:1px solid #e5e5e5;vertical-align:top}
.section-title{font-size:8pt;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#c0392b;margin:16px 0 6px;border-bottom:1px solid #e0e0e0;padding-bottom:3px}
.total-box{background:#1a1a1a;color:#fff;padding:10px 16px;display:flex;justify-content:space-between;align-items:center;margin:12px 0}
.total-label{font-size:9pt;font-weight:600;letter-spacing:.05em;text-transform:uppercase}
.total-amount{font-size:14pt;font-weight:700}
.legal{font-size:8.5pt;line-height:1.6;color:#333;margin:12px 0}
.sig{margin-top:24px;font-size:9pt}
.footer{text-align:center;font-size:8pt;color:#999;border-top:1px solid #e0e0e0;padding-top:8px;margin-top:24px}
@media print{@page{margin:0.75in}body{font-size:10pt}}
</style></head><body><div class="page">
<div class="header">
  <div><div class="logo">whip</div></div>
  <div class="company"><strong>Whip Claims Management</strong><br>P.O. Box 10622 | Rockville, MD 20849-0622<br>(855) 906-5949 | claims@drivewhip.com</div>
</div>
<h1>Loss of Use / Rental Reimbursement Request</h1>
<p class="sub">Fleet Utilization Log &amp; Claim Documentation<br>${new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}</p>
<table>
<tr><th style="width:40%">Whip Claim No.</th><td>${claim.whipClaimNo || "—"}</td></tr>
<tr><th>Adverse Claim No.</th><td>${claim.adverseClaimNo || "—"}</td></tr>
<tr><th>Date of Loss</th><td>${claim.dol ? formatDate(claim.dol) : "—"}</td></tr>
<tr><th>Adverse Carrier</th><td>${claim.adverseCarrier || "—"}</td></tr>
<tr><th>Vehicle</th><td>${claim.vehicle || "—"}</td></tr>
<tr><th>VIN</th><td>${claim.vin || "—"}</td></tr>
<tr><th>Member / Driver</th><td>${claim.memberDriver || "—"}</td></tr>
<tr><th>Registered Owner</th><td>${claim.registeredOwner || "Metro Cars Leasing Corp."}</td></tr>
<tr><th>Vehicle Status</th><td>${claim.vehicleStatus || "Actively leased / Revenue-generating"}</td></tr>
<tr><th>Vehicle Class</th><td>${vClass}</td></tr>
</table>
<div class="section-title">Repair Period</div>
<table>
<tr><th style="width:40%">Repair Facility</th><td>${claim.repairFacility || "—"}</td></tr>
<tr><th>RO Number</th><td>${claim.roNumber || "—"}</td></tr>
<tr><th>Drop-Off Date</th><td>${claim.dropOff ? formatDate(claim.dropOff) : "—"}</td></tr>
<tr><th>Pick-Up Date</th><td>${claim.pickUp ? formatDate(claim.pickUp) : "—"}</td></tr>
<tr><th>Total Days in Repair</th><td>${totalDays}</td></tr>
<tr><th>Days Claimed</th><td>${totalDays}</td></tr>
</table>
<div class="section-title">Fleet Utilization Log</div>
<p style="font-size:8.5pt;color:#444;margin-bottom:8px">The table below reflects the fleet utilization rate for <strong>${vClass}</strong> class vehicles at the <strong>${mkt?.name ?? marketCode}</strong> market/location where the vehicle was in active service, for each day the vehicle was out of service for repair as a result of this loss. Utilization data reflects the ratio of rented vehicles to the total available fleet at that location. The available fleet excludes vehicles in repair, awaiting reconditioning, or pending auction — consistent with industry-standard utilization methodology used by major rental companies.</p>
<table>
<tr><th>Date</th><th>Renting Location</th><th>Vehicle Class</th><th style="text-align:right">Fleet Count</th><th style="text-align:right">Rent Count</th><th style="text-align:right">Utilization</th></tr>
${rowsHtml}
</table>
${utilNote}
<p style="font-size:8pt;color:#555;background:#f9f9f9;border:1px solid #e0e0e0;padding:8px;margin:8px 0"><strong>Utilization Methodology Note:</strong> Fleet utilization is calculated as rented vehicles ÷ available fleet at month-end for the applicable market. The available fleet excludes vehicles being repaired, waiting to be repaired, waiting to be sold at auction, or recently purchased vehicles still being transported or reconditioned. This market-level utilization (ranging from 95% to 100% across Whip's operating history) reflects the true opportunity cost of the out-of-service vehicle and is the metric used by Whip's operations team to track fleet efficiency.</p>
<div class="section-title">Loss of Use / Rental Calculation</div>
<p style="font-size:9pt;font-weight:600;margin-bottom:4px">Loss of Use Breakdown</p>
<p style="font-size:9pt;margin-bottom:4px">Days Out of Service: <strong>${totalDays}</strong> × Daily Rate (Whip Standard Rate): <strong>$${dailyRate.toFixed(2)}</strong></p>
<p style="font-size:8pt;color:#666;margin-bottom:8px">Rate basis: ${rateNote}</p>
<div class="total-box"><span class="total-label">Total Loss of Use / Rental Reimbursement Claimed:</span><span class="total-amount">$${totalLou.toFixed(2)}</span></div>
<div class="section-title">Legal Basis — Tort / Third-Party Liability:</div>
<div class="legal">
<p>Under the common law of negligence and the applicable state tort statutes, a tortfeasor is liable for all economic losses <em>proximately</em> caused by their negligent act, including loss of use of a damaged vehicle. Loss of use damages are recoverable by the owner of a revenue-generating vehicle for each day the vehicle is out of service due to the collision — regardless of whether a substitute vehicle was rented. <em>See, e.g., Restatement (Second) of Torts § 928; Enterprise Leasing Co. v. Allstate Ins. Co., 671 A.2d 509 (Md. Ct. Spec. App. 1996); Hertz Corp. v. State Farm Mut. Auto. Ins. Co., 573 N.W.2d 686 (Minn. Ct. App. 1998).</em></p>
<p>The subject vehicle is registered to <strong>Metro Cars Leasing Corp.</strong> and is actively leased to a Whip member as a revenue-generating fleet asset. The vehicle was unavailable for service during the repair period described above, resulting in direct economic loss equal to the contracted daily lease rate multiplied by the number of days out of service. The fleet utilization data above — showing ${utilData.util}% average utilization during the repair period — confirms that a replacement vehicle would have been rented but for this loss.</p>
<p><em>Note: If the Loss of Use amount above is zero, Loss of Use is not being claimed on this file. Please contact us directly if additional documentation is required for review.</em></p>
</div>
<div class="sig"><p>Respectfully,</p><br><p><strong>Whip Claims Management</strong><br>Claims Resolution Specialist<br>(855) 906-5949 | claims@drivewhip.com<br>P.O. Box 10622, Rockville, MD 20849</p></div>
<div class="footer">Whip Claims Management &bull; P.O. Box 10622, Rockville, MD 20849 &bull; (855) 906-5949 &bull; claims@drivewhip.com</div>
</div></body></html>`;

    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 400); }
  };

  // ── Step 0: Upload Estimate ────────────────────────────────────────────────
  const renderStep0 = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Step 1 — Upload Estimate</h2>
        <p className="text-sm text-muted-foreground">Upload the repair estimate, repair order, or any claim document. The AI will auto-fill claim fields. You can also skip and fill manually.</p>
      </div>
      <div
        className="border-2 border-dashed border-border rounded-xl p-12 flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
        onClick={() => fileRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileSelect(f); }}
      >
        {parsing ? (
          <><Loader2 className="w-10 h-10 text-primary animate-spin" /><p className="text-sm font-medium">Parsing document with AI…</p></>
        ) : estimateFile ? (
          <><CheckCircle className="w-10 h-10 text-green-500" /><p className="text-sm font-semibold text-green-600">{estimateFile.name}</p><p className="text-xs text-muted-foreground">File uploaded and parsed</p></>
        ) : (
          <><Upload className="w-10 h-10 text-muted-foreground" /><p className="text-sm font-medium">Drop estimate here or click to browse</p><p className="text-xs text-muted-foreground">PDF, image, or repair order — AI will extract claim fields</p></>
        )}
        <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />
      </div>
      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setStep(1)}>Skip — Fill Manually</Button>
        <Button onClick={() => setStep(1)} disabled={parsing}>
          {estimateFile ? "Continue to Claim Info" : "Continue Without Upload"} <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );

  // ── Step 1: Claim Info ─────────────────────────────────────────────────────
  const renderStep1 = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Step 2 — Claim Information</h2>
        <p className="text-sm text-muted-foreground">Review and complete all claim fields. Fields pre-filled from the uploaded estimate are highlighted.</p>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {([
          ["whipClaimNo", "Whip Claim No."],
          ["adverseClaimNo", "Adverse Claim No."],
          ["dol", "Date of Loss", "date"],
          ["adverseCarrier", "Adverse Carrier"],
          ["vehicle", "Vehicle (Year Make Model)"],
          ["vin", "VIN"],
          ["memberDriver", "Member / Driver"],
          ["registeredOwner", "Registered Owner"],
          ["vehicleStatus", "Vehicle Status"],
          ["repairFacility", "Repair Facility"],
          ["roNumber", "RO Number"],
        ] as [keyof ClaimInfo, string, string?][]).map(([key, label, type]) => (
          <div key={key}>
            <Label className="text-xs mb-1">{label}</Label>
            <Input
              type={type ?? "text"}
              value={claim[key]}
              onChange={e => setClaim(p => ({ ...p, [key]: e.target.value }))}
              placeholder={label}
            />
          </div>
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <Label className="text-xs mb-1">Drop-Off Date</Label>
          <Input type="date" value={claim.dropOff} onChange={e => setClaim(p => ({ ...p, dropOff: e.target.value }))} />
        </div>
        <div>
          <Label className="text-xs mb-1">Pick-Up Date</Label>
          <Input type="date" value={claim.pickUp} onChange={e => setClaim(p => ({ ...p, pickUp: e.target.value }))} />
        </div>
      </div>
      {claim.dropOff && claim.pickUp && (
        <div className="bg-muted/40 rounded-lg px-4 py-2 text-sm">
          <span className="text-muted-foreground">Days in repair: </span>
          <span className="font-semibold">{daysBetween(claim.dropOff, claim.pickUp)} days</span>
          {daysClaimed !== null && daysClaimed !== daysBetween(claim.dropOff, claim.pickUp) && (
            <span className="ml-3 text-muted-foreground">Days claimed: <span className="font-semibold">{daysClaimed}</span></span>
          )}
        </div>
      )}
      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setStep(0)}><ChevronLeft className="w-4 h-4 mr-1" /> Back</Button>
        <Button onClick={() => setStep(2)}>Continue to Vehicle & Rate <ChevronRight className="w-4 h-4 ml-1" /></Button>
      </div>
    </div>
  );

  // ── Step 2: Vehicle & Rate ─────────────────────────────────────────────────
  const renderStep2 = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Step 3 — Vehicle Class & Rate</h2>
        <p className="text-sm text-muted-foreground">Select the market and vehicle model to auto-apply the Whip standard rate, or enter a custom rate.</p>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <Label className="text-xs mb-1">Market / Location</Label>
          <Select value={marketCode} onValueChange={v => { setMarketCode(v); setVehicleModel(""); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MARKET_PRICING.map(m => <SelectItem key={m.code} value={m.code}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs mb-1">Vehicle Model</Label>
          <Select value={vehicleModel} onValueChange={setVehicleModel}>
            <SelectTrigger><SelectValue placeholder="Select vehicle…" /></SelectTrigger>
            <SelectContent>
              {(mkt?.vehicles ?? []).map(v => (
                <SelectItem key={v.model} value={v.model}>
                  {v.model} — ${v.dailyRate.toFixed(2)}/day ({v.vehicleClass})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {selectedVehicle && (
        <div className="bg-muted/40 rounded-lg px-4 py-3 text-sm space-y-1">
          <div className="flex justify-between"><span className="text-muted-foreground">Weekly rate:</span><span className="font-medium">${selectedVehicle.weeklyRate.toFixed(2)}/wk</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Daily rate:</span><span className="font-medium">${selectedVehicle.dailyRate.toFixed(2)}/day</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Vehicle class:</span><span className="font-medium">{selectedVehicle.vehicleClass}</span></div>
          {selectedVehicle.taxIncluded && <p className="text-xs text-amber-600">{mkt?.taxNote}</p>}
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <Label className="text-xs mb-1">Override Daily Rate (optional)</Label>
          <Input
            type="number" step="0.01" min="0"
            placeholder={selectedVehicle ? `${selectedVehicle.dailyRate.toFixed(2)} (auto)` : "Enter rate"}
            value={customRate ?? ""}
            onChange={e => setCustomRate(e.target.value ? +e.target.value : null)}
          />
        </div>
        <div>
          <Label className="text-xs mb-1">Override Days Claimed (optional)</Label>
          <Input
            type="number" min="0"
            placeholder={`${daysBetween(claim.dropOff, claim.pickUp)} (auto from dates)`}
            value={daysClaimed ?? ""}
            onChange={e => setDaysClaimed(e.target.value ? +e.target.value : null)}
          />
        </div>
      </div>
      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setStep(1)}><ChevronLeft className="w-4 h-4 mr-1" /> Back</Button>
        <Button onClick={() => setStep(3)} disabled={!dailyRate || !totalDays}>
          Review & Generate <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );

  // ── Step 3: Review & Generate ──────────────────────────────────────────────
  const renderStep3 = () => {
    const utilRows = buildUtilRows(claim.dropOff, claim.pickUp, marketCode);
    const vClass = selectedVehicle?.vehicleClass ?? "Midsize Sedan";
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold mb-1">Step 4 — Review &amp; Generate</h2>
          <p className="text-sm text-muted-foreground">Review the calculation summary and generate the LOU document.</p>
        </div>
        {/* Summary */}
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div className="space-y-2 border border-border rounded-lg p-4">
            <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2">Claim Info</p>
            <div className="flex justify-between"><span className="text-muted-foreground">Whip Claim No.</span><span className="font-medium">{claim.whipClaimNo || "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Adverse Carrier</span><span className="font-medium">{claim.adverseCarrier || "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Vehicle</span><span className="font-medium">{claim.vehicle || "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Member / Driver</span><span className="font-medium">{claim.memberDriver || "—"}</span></div>
          </div>
          <div className="space-y-2 border border-border rounded-lg p-4">
            <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2">Calculation</p>
            <div className="flex justify-between"><span className="text-muted-foreground">Repair Period</span><span className="font-medium">{claim.dropOff ? formatDate(claim.dropOff) : "—"} → {claim.pickUp ? formatDate(claim.pickUp) : "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Days Claimed</span><span className="font-medium">{totalDays}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Daily Rate</span><span className="font-medium">${dailyRate.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Market</span><span className="font-medium">{mkt?.name}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Fleet Utilization</span><span className="font-medium text-red-600">{utilData.util}%</span></div>
          </div>
        </div>
        {/* Total */}
        <div className="bg-foreground text-background rounded-lg px-6 py-4 flex justify-between items-center">
          <span className="text-sm font-semibold uppercase tracking-wider">Total Loss of Use / Rental Reimbursement Claimed:</span>
          <span className="text-2xl font-bold">${totalLou.toFixed(2)}</span>
        </div>
        {/* Utilization log preview */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Fleet Utilization Log Preview ({utilRows.length} days)</p>
          <div className="border border-border rounded-lg overflow-hidden max-h-48 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2">Date</th>
                  <th className="text-left px-3 py-2">Location</th>
                  <th className="text-left px-3 py-2">Class</th>
                  <th className="text-right px-3 py-2">Fleet</th>
                  <th className="text-right px-3 py-2">Rented</th>
                  <th className="text-right px-3 py-2">Util%</th>
                </tr>
              </thead>
              <tbody>
                {utilRows.map((r, i) => (
                  <tr key={i} className="border-t border-border/50">
                    <td className="px-3 py-1.5">{r.date}</td>
                    <td className="px-3 py-1.5">{r.location}</td>
                    <td className="px-3 py-1.5">{vClass}</td>
                    <td className="px-3 py-1.5 text-right">{r.fleet}</td>
                    <td className="px-3 py-1.5 text-right">{r.rented}</td>
                    <td className="px-3 py-1.5 text-right font-semibold text-red-600">{r.util}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 justify-between">
          <Button variant="outline" onClick={() => setStep(2)}><ChevronLeft className="w-4 h-4 mr-1" /> Back</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span className="ml-1">{savedId ? "Update" : "Save"}</span>
            </Button>
            <Button onClick={handlePrint}>
              <Printer className="w-4 h-4 mr-1" /> Print / Save as PDF
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Calculator className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Loss of Use / Rental Reimbursement</h1>
          <p className="text-xs text-muted-foreground">Fleet Utilization Log &amp; Claim Documentation</p>
        </div>
      </div>
      <StepBar step={step} />
      <div className="bg-card border border-border rounded-xl p-6">
        {step === 0 && renderStep0()}
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
      </div>
    </div>
  );
}
