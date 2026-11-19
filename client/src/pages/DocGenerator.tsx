import TotalReconReceiptForm from "@/components/TotalReconReceiptForm";
import PendingClosureForm from "@/components/PendingClosureForm";
import InsuranceDirectRepairUpload from "@/components/InsuranceDirectRepairUpload";
import type { RepairPrefillPatch } from "@shared/insuranceDirectRepair";
import UadDenialFields from "@/components/UadDenialFields";
import UadDenialDraftPreview from "@/components/UadDenialDraftPreview";
import { useFreshPdfPreview } from "@/hooks/useFreshPdfPreview";
import { createUadDenialPdf } from "@/lib/uadDenialPdf";
import { buildUadDenialText, emptyUadDenialFields, restoreUadDenialFields, UAD_DENIAL_HINT, UAD_DENIAL_LABEL, UAD_DENIAL_TYPE, UAD_FIELD_META, validateUadDenialFields, type UadDenialField } from "@shared/uadDenial";
import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import WhipLayout from "@/components/WhipLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { getHandlerExtension } from "@shared/handlerExtensions";
import { useKlutchSignoff } from "@/hooks/useKlutchSignoff";
import { findLouVehicleRate, louRateSourceLabel } from "@shared/louRates";
import { buildDvReportReference, DV_REFERENCE_STARTER, type DvReportFacts } from "@shared/insuranceDirectDv";
import InsuranceDirectDvReview from "@/components/InsuranceDirectDvReview";
import { calculateDirectLou, directDemandItems, directMoney, directRepairDays, initialInsuranceDirectDraft, LIABILITY_STATEMENT_EXAMPLES, validateInsuranceDirectDemand, type InsuranceDirectDraft } from "@shared/insuranceDirect";
import { createInsuranceDirectPdf } from "@/lib/insuranceDirectPdf";
import { createStandaloneLouPdf, appendLouPacketAttachment, numberLouPages, type StandaloneLouInput } from "@/lib/standaloneLouPdf";
import { jsPDF } from "jspdf";
import { AlignmentType, BorderStyle, Document as WordDocument, Footer, Header, ImageRun, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import PipBillReviewWorkflow from "@/components/PipBillReviewWorkflow";
import {
  AlertTriangle,
  Brain,
  Building2,
  Calculator,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Download,
  Eye,
  ExternalLink,
  FileCheck,
  FileText,
  FolderOpen,
  Inbox,
  Info,
  Mail,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Phone,
  Plus,
  Receipt,
  RefreshCw,
  RotateCcw,
  Save,
  Scale,
  Send,
  Share2,
  Shield,
  Sparkles,
  Star,
  Stethoscope,
  Trash2,
  Truck,
  Upload,
  Users,
  X,
  XCircle,
  Search,
  Loader2,
  TrendingDown,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type DocGenTab =
  | "blank-letterhead"
  | "claimant-contact"
  | "pending-closure"
  | "failed-contact"
  | "storage-mitigation"
  | "coverage-tnc"
  | "denial"
  | "damage-denial"
  | "ror"
  | "release-bi"
  | "release-pd"
  | "limited-liability-bi"
  | "tl-settlement"
  | "subro-demand"
  | "carrier-rebuttal"
  | "payment-receipt"
  | "urgently-invoice"
  | "pip-exhaustion"
  | "pip-bill-review"
  | "lou-calculator"
  | "coi-whip"
  | "coi-klutch"
  | "klutch-policy-declarations"
  | "klutch-policy-documents"
  | "dv-calculator";

type LouDemandHandoff = {
  id: string;
  total: string;
  claimNumber: string;
  adverseClaimNumber: string;
  dateOfLoss: string;
  adverseCarrier: string;
  adjuster: string;
  vehicle: string;
  vin: string;
  days: number;
  dailyRate: string;
  marketCode: string;
  vehicleClass: string;
  repairFacility: string;
  roNumber: string;
  registeredOwner: string;
  vehicleStatus: string;
  repairStart: string;
  repairEnd: string;
};

type LouUtilizationRow = {
  date: string;
  fleetCount: number;
  rentCount: number;
  availableCount: number;
  utilization: string;
  sourceMonth?: string | null;
  dataStatus?: "reported" | "latest_available" | "unavailable";
};

function formatLouUtilization(value: unknown): string {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) return "—";
  return `${numeric.toFixed(1)}%`;
}

type LouUtilizationSnapshot = {
  reportMonth: string;
  repairDays: number;
  fleetCount: number;
  rentCount: number;
  availableCount: number;
  utilization: string;
  dataStatus?: LouUtilizationRow["dataStatus"];
};

/**
 * The Whip Utilization Report is a monthly market snapshot, not a daily
 * telemetry feed. A repair period is therefore represented once per report
 * month so a carrier does not mistake duplicated monthly values for daily data.
 */
function summarizeLouUtilizationRows(rows: LouUtilizationRow[]): LouUtilizationSnapshot[] {
  const snapshots = new Map<string, LouUtilizationSnapshot>();
  for (const row of rows) {
    const reportMonth = row.sourceMonth || "No reported snapshot";
    const key = `${reportMonth}|${row.dataStatus || "unavailable"}`;
    const existing = snapshots.get(key);
    if (existing) {
      existing.repairDays += 1;
      continue;
    }
    snapshots.set(key, {
      reportMonth,
      repairDays: 1,
      fleetCount: row.fleetCount,
      rentCount: row.rentCount,
      availableCount: row.availableCount,
      utilization: row.utilization,
      dataStatus: row.dataStatus,
    });
  }
  return Array.from(snapshots.values());
}

function louUtilizationReconciliation(snapshots: LouUtilizationSnapshot[]): string {
  const reported = snapshots.filter((snapshot) => snapshot.dataStatus !== "unavailable");
  if (!reported.length) return "No monthly market snapshot was available to reconcile fleet counts for this repair period.";
  return `Monthly reconciliation: ${reported.map((snapshot) => `${snapshot.reportMonth}: ${snapshot.rentCount} rented + ${snapshot.availableCount} reported unrented = ${snapshot.fleetCount} reported rentable fleet (${snapshot.utilization} reported occupancy)`).join("; ")}.`;
}

function louUtilizationSourceNote(rows: LouUtilizationRow[]): string {
  const months = Array.from(new Set(rows.map((row) => row.sourceMonth).filter((month): month is string => Boolean(month))));
  if (!months.length) return "No reported market utilization snapshot was available for this repair period; no utilization percentage is represented.";
  const hasLatestFallback = rows.some((row) => row.dataStatus === "latest_available");
  return `Source: Whip Utilization Report (${months.join(", ")}). Each row is one monthly market snapshot, not a repeated daily measurement. The snapshot reconciles Rented + Reported Unrented to the report's rentable-fleet denominator; Occupancy is the report's stated monthly occupancy rate. The source does not allocate its separate total-fleet or unavailable/hold population to individual markets.${hasLatestFallback ? " Repair dates after the last available report use the most recent reported monthly snapshot and are identified as such." : ""}`;
}

type LouSupportingSchedule = {
  claimNumber: string;
  adverseClaimNumber: string;
  dateOfLoss: string;
  adverseCarrier: string;
  adjuster: string;
  vehicle: string;
  vin: string;
  memberDriver: string;
  registeredOwner: string;
  vehicleStatus: string;
  vehicleClass: string;
  marketName: string;
  repairFacility: string;
  roNumber: string;
  repairStart: string;
  repairEnd: string;
  days: number;
  dailyRate: number;
  total: number;
  weeklyRate?: number;
  rateSource?: string;
  customRate: boolean;
  letterDate: string;
  handlerExtension: string;
  handlerEmail: string;
  handlerName: string;
  handlerTitle: string;
  utilizationRows: LouUtilizationRow[];
};

const LOU_DEMAND_HANDOFF_KEY = "lou_demand_handoff";

function readLouDemandHandoff(): LouDemandHandoff | null {
  try {
    const raw = sessionStorage.getItem(LOU_DEMAND_HANDOFF_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LouDemandHandoff>;
      if (parsed.id && parsed.total) {
        return {
          id: parsed.id,
          total: parsed.total,
          claimNumber: parsed.claimNumber ?? "",
          adverseClaimNumber: parsed.adverseClaimNumber ?? "",
          dateOfLoss: parsed.dateOfLoss ?? "",
          adverseCarrier: parsed.adverseCarrier ?? "",
          adjuster: parsed.adjuster ?? "",
          vehicle: parsed.vehicle ?? "",
          vin: parsed.vin ?? "",
          days: parsed.days ?? 0,
          dailyRate: parsed.dailyRate ?? "",
          marketCode: parsed.marketCode ?? "DC",
          vehicleClass: parsed.vehicleClass ?? "",
          repairFacility: parsed.repairFacility ?? "",
          roNumber: parsed.roNumber ?? "",
          registeredOwner: parsed.registeredOwner ?? "Metrocars Leasing Corp.",
          vehicleStatus: parsed.vehicleStatus ?? "Actively leased / Revenue-generating",
          repairStart: parsed.repairStart ?? "",
          repairEnd: parsed.repairEnd ?? "",
        };
      }
    }

    // Retain compatibility with handoffs started immediately before this repair.
    const legacyTotal = sessionStorage.getItem("lou_total");
    if (!legacyTotal) return null;
    return {
      id: `legacy-${legacyTotal}-${sessionStorage.getItem("lou_claim") ?? ""}`,
      total: legacyTotal,
      claimNumber: sessionStorage.getItem("lou_claim") ?? "",
      adverseClaimNumber: "",
      dateOfLoss: "",
      adverseCarrier: "",
      adjuster: "",
      vehicle: "",
      vin: "",
      days: Number(sessionStorage.getItem("lou_days") ?? 0),
      dailyRate: sessionStorage.getItem("lou_rate") ?? "",
      marketCode: "DC",
      vehicleClass: "",
      repairFacility: "",
      roNumber: "",
      registeredOwner: "Metrocars Leasing Corp.",
      vehicleStatus: "Actively leased / Revenue-generating",
      repairStart: "",
      repairEnd: "",
    };
  } catch {
    return null;
  }
}

interface NavGroup {
  label: string;
  items: { id: DocGenTab; label: string; icon: React.ElementType }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Contacts",
    items: [
      { id: "blank-letterhead", label: "Blank Letterhead", icon: FileText },
      { id: "claimant-contact", label: "Claimant Contact", icon: Phone },
      { id: "pending-closure", label: "Pending Closure Letter", icon: Mail },
      { id: "failed-contact", label: "Failed Contact (PD only)", icon: Phone },
      { id: "storage-mitigation", label: "Storage Mitigation", icon: AlertTriangle },
    ],
  },
  {
    label: "Denials",
    items: [
      { id: "denial", label: "Denial & Acknowledgment", icon: FileCheck },
      { id: "damage-denial", label: "Damage Denial", icon: AlertTriangle },
      { id: "ror", label: "Reservation of Rights", icon: Scale },
    ],
  },
  {
    label: "Settlements",
    items: [
      { id: "release-bi", label: "General Release — BI", icon: FileCheck },
      { id: "release-pd", label: "General Release — PD", icon: FileCheck },
      { id: "limited-liability-bi", label: "Limited Liability Release — BI", icon: FileCheck },
      { id: "tl-settlement", label: "TL Settlement & Release", icon: FileCheck },
    ],
  },
  {
    label: "Subrogation",
    items: [
      { id: "subro-demand", label: "Subro Demand Letter", icon: Scale },
      { id: "carrier-rebuttal", label: "Carrier Rebuttal", icon: Scale },
      { id: "payment-receipt", label: "Total Recon Payment Receipt", icon: Receipt },
      { id: "urgently-invoice", label: "Towing Invoice", icon: Truck },
    ],
  },
  {
    label: "Insurance Direct",
    items: [
      { id: "lou-calculator", label: "Insurance Direct: Loss of Use", icon: Calculator },
      { id: "dv-calculator", label: "DV Calculator", icon: TrendingDown },
    ],
  },
  {
    label: "Medical Review",
    items: [
      { id: "pip-bill-review", label: "Medical Bill Review", icon: FileText },
      { id: "pip-exhaustion", label: "PIP Exhaustion Letters", icon: AlertTriangle },
    ],
  },

];

const LEGACY_KLUTCH_TAB_IDS = new Set(["coverage-tnc", "coi-whip", "coi-klutch", "klutch-policy-declarations", "dec-page-whip"]);

function normalizeDocGeneratorTab(tab: string | null | undefined): DocGenTab {
  if (LEGACY_KLUTCH_TAB_IDS.has(tab ?? "")) return "klutch-policy-documents";
  const valid: DocGenTab[] = ["blank-letterhead","claimant-contact","pending-closure","failed-contact","storage-mitigation","coverage-tnc","denial","damage-denial","ror","release-bi","release-pd","limited-liability-bi","tl-settlement","subro-demand","carrier-rebuttal","payment-receipt","urgently-invoice","pip-exhaustion","pip-bill-review","lou-calculator","klutch-policy-documents","dv-calculator"];
  return valid.includes(tab as DocGenTab) ? tab as DocGenTab : "blank-letterhead";
}

// ─── PDF Helpers ──────────────────────────────────────────────────────────────
const WHIP_ORANGE: [number, number, number] = [255, 98, 33];
const WHIP_DARK: [number, number, number] = [23, 27, 49];

// Whip logo base64 (PNG, 180x60)
const WHIP_LOGO_B64 = "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";
const KLUTCH_LOGO_B64 = "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nqz9Gp/fjRtgcXHTJz017ITkB0/g4HCHJWdONIKzeezJt+hu2gzb5u+1HXZFdvC+PFkfYyd9Ttn8eRqbc8c9z4WFBTlNH4QVX9YODA6a52mzpswk9zVPYIfa5PZD759TTswsYEGOzW+5H/Kw7JE3pJsnZJ8a9/QCT+Bx2E5a34pI87T2Rr9WVPm0Q8OunurnP5PJtNOJ63eUbfuMmm87Wy+GFHBvcEwbiaG2WtyiRYsWLc6EX9HePRMO3Ofn50/ox6WAr/UBWkxs79122208ESdSKnq1++/T3K482BqfYhH00+ruWlhY4EPxJLR2tUWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1atGhxNuH/B32eHJG87kaHAAAAAElFTkSuQmCC";
const MCL_LOGO_B64 = "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";

function addWhipLetterhead(doc: jsPDF, _title?: string, _subtitle?: string) {
  const W = doc.internal.pageSize.getWidth();
  // Logo — left side, top
  try {
    doc.addImage("data:image/png;base64," + WHIP_LOGO_B64, "PNG", 14, 8, 29, 19);
  } catch (_e) {
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...WHIP_ORANGE);
    doc.text("whip", 14, 20);
  }
  // Company info — right side (bold name, normal address/contact)
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  // Keep generated correspondence neutral and print-friendly. The logo is the
  // only brand-colored element; all letterhead text prints in black/gray.
  doc.setTextColor(20, 20, 20);
  doc.text("Whip Claims Management", W - 14, 12, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text("P.O. Box 10622  Rockville, MD 20849-0622", W - 14, 17, { align: "right" });
  doc.text("(855) 906-5949  |  claims@drivewhip.com", W - 14, 22, { align: "right" });
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.5);
  doc.line(14, 30, W - 14, 30);
  doc.setLineWidth(0.2);
  // Return y position for body content to start
  return 38;
}
function addLetterFooter(doc: jsPDF) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.4);
  doc.line(14, H - 12, W - 14, H - 12);
  doc.setLineWidth(0.2);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(
    "Whip Claims Management  |  PO BOX 10622 Rockville, MD 20850  |  (855) 906-5949",
    W / 2,
    H - 7,
    { align: "center" }
  );
}

function addPipLetterhead(doc: jsPDF) {
  const W = doc.internal.pageSize.getWidth();
  try {
    doc.addImage("data:image/png;base64," + WHIP_LOGO_B64, "PNG", 42, 16, 38, 25);
  } catch {
    doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(...WHIP_ORANGE); doc.text("whip", 42, 31);
  }
  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(20, 20, 20);
  doc.text("WHIP CLAIMS MANAGEMENT", W - 42, 22, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(80, 80, 80);
  doc.text("P.O. Box 10622 · Rockville, MD 20850", W - 42, 34, { align: "right" });
  doc.text("(855) 906-5949 · claims@drivewhip.com", W - 42, 45, { align: "right" });
  doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.5); doc.line(42, 58, W - 42, 58); doc.setLineWidth(0.2);
  return 76;
}

function addPipLetterFooter(doc: jsPDF) {
  const W = doc.internal.pageSize.getWidth(); const H = doc.internal.pageSize.getHeight();
  doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.4); doc.line(42, H - 26, W - 42, H - 26); doc.setLineWidth(0.2);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(100, 100, 100);
  doc.text("Whip Claims Management  |  P.O. Box 10622  |  Rockville, MD 20850  |  (855) 906-5949", W / 2, H - 15, { align: "center" });
}
const PD_SOL_YEARS: Record<string, number> = {
  AL: 2, AK: 2, AZ: 2, AR: 3, CA: 3, CO: 3, CT: 2, DE: 2, DC: 3, FL: 4,
  GA: 4, HI: 2, ID: 3, IL: 5, IN: 2, IA: 5, KS: 2, KY: 2, LA: 2, ME: 6,
  MD: 3, MA: 3, MI: 3, MN: 6, MS: 3, MO: 5, MT: 2, NE: 4, NV: 3, NH: 3,
  NJ: 6, NM: 4, NY: 3, NC: 3, ND: 6, OH: 2, OK: 2, OR: 6, PA: 2, RI: 10,
  SC: 3, SD: 6, TN: 3, TX: 2, UT: 4, VT: 3, VA: 5, WA: 3, WV: 2, WI: 3, WY: 4,
};

const PD_SOL_STATE_OPTIONS = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'], ['CO', 'Colorado'],
  ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'],
  ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'],
  ['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'],
  ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'],
  ['NM', 'New Mexico'], ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'],
  ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'], ['SD', 'South Dakota'], ['TN', 'Tennessee'],
  ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
] as const;

function projectedPdSolDate(dateOfLoss: string, state: string): Date | null {
  const years = PD_SOL_YEARS[state];
  if (!dateOfLoss || !years) return null;
  const [year, month, day] = dateOfLoss.split('-').map(Number);
  if (!year || !month || !day) return null;
  const result = new Date(year + years, month - 1, day);
  // Keep leap-day calculations inside the intended expiration month.
  if (result.getMonth() !== month - 1) result.setDate(0);
  return result;
}

function formatLongCalendarDate(value: Date | null): string | null {
  return value ? value.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null;
}

function addFailedContactPdSolNotice(doc: jsPDF, state: string, dateOfLoss: string) {
  const projectedDate = formatLongCalendarDate(projectedPdSolDate(dateOfLoss, state));
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const notice = `Please be advised that your claim is subject to applicable legal filing deadlines, including the statute of limitations. Based on the information currently available to us, the applicable statute of limitations is currently projected to expire on ${projectedDate ?? '[DATE]'}. This date may be affected by the specific circumstances of your claim and should not be considered legal advice. Our investigation, communications, attempts to contact you, or closure of our claim file do not extend, waive, or toll any applicable deadline. It is your responsibility to take any action necessary to preserve your legal rights.`;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  const lines = doc.splitTextToSize(notice, W - 28);
  const lineHeight = 4.15;
  const startY = H - 17 - (lines.length * lineHeight);
  doc.text(lines, 14, startY, { lineHeightFactor: 1.15 });
  doc.setTextColor(40, 40, 40);
  doc.setFont('helvetica', 'normal');
}

function addSOLNotice(_doc: jsPDF, _state?: string) {
  // SOL notices are selectively rendered by documents that explicitly request them.
}

function wrapText(doc: jsPDF, text: string, x: number, y: number, maxW: number, lineH: number, lineHeightFactor = 1.15): number {
  const lines = doc.splitTextToSize(text, maxW);
  doc.text(lines, x, y, { lineHeightFactor });
  return y + lines.length * lineH;
}

type ReleaseSignatureDetails = {
  signerName: string;
  signerType: "claimant" | "guardian" | "carrier";
  minorName?: string;
};

function writeReleaseSignatureBlock(doc: jsPDF, y: number, details: ReleaseSignatureDetails): void {
  const signerX = 14;
  const signerLineEnd = 82;
  const witnessX = 108;
  const witnessLineEnd = 176;
  const labelForSigner = details.signerType === "guardian"
    ? "Signature of Parent/Guardian:"
    : details.signerType === "carrier"
      ? "Carrier Representative Signature:"
      : "Claimant Signature:";
  const printLabel = details.signerType === "guardian" ? "Printed Name (Parent/Guardian):" : "Printed Name:";
  const renderLine = (label: string, x: number, lineEnd: number, value = "") => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.line(x, y, lineEnd, y);
    if (value) {
      doc.setFont("helvetica", "normal");
      doc.text(value, x + 1.5, y - 1.5);
    }
    doc.text(label, x, y + 4);
  };

  const renderPair = (signerLabel: string, witnessLabel: string, signerValue = "") => {
    renderLine(signerLabel, signerX, signerLineEnd, signerValue);
    renderLine(witnessLabel, witnessX, witnessLineEnd);
    y += 10;
  };

  renderPair(labelForSigner, "Witness Signature:");
  // Releases are signed by the claimant or guardian. Do not pre-populate any
  // signature, printed name, relationship, or date fields from form data.
  renderPair(printLabel, "Printed Name:");
  if (details.signerType === "guardian") {
    renderPair("Relationship to Minor:", "Witness Address:");
    renderPair("Minor's Name:", "");
  }
  renderPair("Date:", "Date:");
}

function writeReleaseText(doc: jsPDF, text: string, signature?: ReleaseSignatureDetails): void {
  // Compact claimant release matching the approved one-page legal-document form.
  const marginX = 14;
  const marginTop = 16;
  const marginBottom = 16;
  const bodyLineH = 4.05;
  const paragraphGap = 2.1;
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxY = doc.internal.pageSize.getHeight() - marginBottom;
  const blocks = text.trim().split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
  const [title, ...bodyBlocks] = blocks;
  let y = marginTop;

  const nextPage = () => {
    doc.addPage();
    y = marginTop;
  };

  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.4);
  doc.text(title, pageWidth / 2, y, { align: "center" });
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.7);
  for (const block of bodyBlocks) {
    const lines = doc.splitTextToSize(block, pageWidth - marginX * 2) as string[];
    const blockHeight = lines.length * bodyLineH;
    if (y + blockHeight > maxY) nextPage();
    doc.text(lines, marginX, y, { lineHeightFactor: 1.04 });
    y += blockHeight + paragraphGap;
  }

  if (signature) {
    const signatureHeight = signature.signerType === "guardian" ? 44 : 32;
    if (y + signatureHeight > maxY) nextPage();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.7);
    doc.text("IN WITNESS WHEREOF, the undersigned has executed this Release on the date set forth below.", marginX, y);
    y += 10;
    writeReleaseSignatureBlock(doc, y, signature);
  }
}

const RELEASE_STATE_NAMES: Record<string, string> = {
  MD: "Maryland", VA: "Virginia", PA: "Pennsylvania", FL: "Florida",
  IL: "Illinois", GA: "Georgia", MA: "Massachusetts", TX: "Texas",
};

function buildPropertyDamageReleaseText(input: {
  releasorDescription: string;
  settlementAmount: string;
  dateOfLoss: string;
  state: string;
}): string {
  const releaseStateName = RELEASE_STATE_NAMES[input.state] || input.state || "[State]";
  return [
    "GENERAL RELEASE OF ALL CLAIMS – PROPERTY DAMAGE",
    "",
    `KNOW ALL PERSONS BY THESE PRESENTS, that the undersigned, ${input.releasorDescription}, for and in consideration of the sum of $${input.settlementAmount || "[Settlement Amount]"}, the receipt and sufficiency of which is hereby acknowledged, does hereby release, acquit, and forever discharge Whip Inc., Metrocars Leasing Corp., Assurant LLC, and Whip Claims Management, and their respective members, drivers, agents, employees, officers, representatives, affiliates, successors, and assigns (collectively, the "Releasees"), from any and all claims, demands, actions, causes of action, damages, costs, expenses, and compensation of any kind whatsoever, whether known or unknown, anticipated or unanticipated, arising out of or in any way connected with the motor vehicle incident that occurred on or about ${formatReleaseDate(input.dateOfLoss)} (the "Incident"), and from any and all other property damage claims of any kind or nature that Claimant has or may have against the Releasees as of the date of this Release.`,
    "",
    "This Release is intended to operate as a full, complete, and final settlement of all property damage claims that Claimant has or may have against the Releasees as of the date of execution, including but not limited to vehicle repair costs, total loss settlement, diminished value, loss of use, rental expenses, towing and storage charges, personal property damage, and any and all other property-related damages of any kind, whether currently known or that may later be discovered. Claimant expressly waives any rights or benefits under any statute or common law principle that would otherwise limit the effect of this Release to claims known to exist at the time of execution.",
    "",
    "Claimant represents and warrants that all liens, subrogation interests, and reimbursement claims related to the property at issue, including but not limited to those of insurers, lienholders, and finance companies, have been disclosed. Claimant agrees to satisfy and resolve any such liens or reimbursement obligations from the settlement proceeds and further agrees to indemnify, defend, and hold harmless the Releasees from any claim, demand, or action related to unpaid balances, liens, or reimbursement rights arising from the Incident or otherwise.",
    "",
    "It is understood and agreed that this settlement is the compromise of a disputed claim, and that the payment made is not to be construed as an admission of liability on the part of the Releasees, by whom liability is expressly denied.",
    "",
    "Claimant acknowledges that this is a general release intended to resolve all property damage claims of any nature, known or unknown, that Claimant has or may have against the Releasees as of the date of execution, that Claimant has read this Release in its entirety, fully understands its terms, and has executed this Release voluntarily and with the opportunity to consult with counsel of Claimant's choosing.",
    "",
    `This Release shall be governed by and construed in accordance with the laws of the State of ${releaseStateName}.`,
  ].join("\n");
}

function formatReleaseDate(value: string): string {
  const date = parseLocalDate(value);
  return date ? date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "[Date of Loss]";
}

function wrapLetterText(doc: jsPDF, text: string, x: number, y: number, maxW: number, baseLineH = 6): number {
  return wrapText(doc, text, x, y, maxW, baseLineH * 1.5, 1.5);
}

function downloadPDF(doc: jsPDF, filename: string) {
  doc.save(filename);
}

function getPDFDataUrl(doc: jsPDF): string {
  // Use an object URL rather than a data URI. Browser security policies can
  // block data: URLs inside preview iframes, leaving the formatted preview blank.
  return URL.createObjectURL(doc.output("blob"));
}

/**
 * Adds the same evidentiary utilization and loss-of-use narrative used by the
 * standalone LOU packet. It is deliberately appended to a demand as a support
 * schedule, so the demand letter remains first and the calculation travels in
 * the same PDF packet.
 */
function appendLouSupportingSchedule(doc: jsPDF, schedule: LouSupportingSchedule) {
  const firstFormPage = doc.getNumberOfPages() + 1;
  const snapshots = summarizeLouUtilizationRows(schedule.utilizationRows);
  // Map claim facts only; all typography, content, pagination and footer geometry
  // come from the exact same complete form used by standalone LOU downloads.
  appendLouPacketAttachment(doc, {
    claimNumber: schedule.claimNumber, carrierClaimNumber: schedule.adverseClaimNumber,
    dateOfLoss: formatNorthAmericanLetterDate(schedule.dateOfLoss),
    carrier: schedule.adverseCarrier, adjuster: schedule.adjuster, vehicle: schedule.vehicle,
    vin: schedule.vin, driver: schedule.memberDriver, registeredOwner: schedule.registeredOwner,
    vehicleStatus: schedule.vehicleStatus, vehicleClass: schedule.vehicleClass,
    marketName: schedule.marketName, repairFacility: schedule.repairFacility, roNumber: schedule.roNumber,
    repairStart: formatNorthAmericanLetterDate(schedule.repairStart), repairEnd: formatNorthAmericanLetterDate(schedule.repairEnd),
    days: schedule.days, dailyRate: schedule.dailyRate, amount: Number(schedule.total.toFixed(2)),
    customRate: schedule.customRate, weeklyRate: schedule.weeklyRate, rateSource: schedule.rateSource,
    letterDate: schedule.letterDate, handlerName: schedule.handlerName, handlerTitle: schedule.handlerTitle,
    handlerExtension: schedule.handlerExtension, handlerEmail: schedule.handlerEmail, logoBase64: WHIP_LOGO_B64,
    snapshots, sourceNote: louUtilizationSourceNote(schedule.utilizationRows),
    reconciliation: louUtilizationReconciliation(snapshots),
  });
  numberLouPages(doc, { startPage: firstFormPage });
}

// ─── Denial Templates ─────────────────────────────────────────────────────────
function formatNorthAmericanLetterDate(value?: string) {
  if (!value) return "[Date of Loss]";
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

const DENIAL_TEMPLATES: Record<
  string,
  { label: string; hint: string; fields: string[]; build: (f: Record<string, string>) => string }
> = {
  tnc_pip: {
    label: "TNC PIP Denial (Rideshare)",
    hint: "Use when the member was in active rideshare/TNC activity and is claiming PIP benefits.",
    fields: ["recipient", "claimant", "dol", "tnc", "period", "tnc_carrier", "tnc_claim", "adjuster"],
    build: (f) => {
      const carrierReference = [
        f.tnc_carrier && `TNC Insurance Carrier: ${f.tnc_carrier}`,
        f.tnc_claim && `Claim Number: ${f.tnc_claim}`,
      ].filter(Boolean).join("\n");
      const carrierReferenceBlock = carrierReference
        ? `\n\nFor reference, coverage may be available through the TNC platform's insurance carrier:\n${carrierReference}`
        : "";
      return `Hello ${f.recipient || "[Recipient Name: Member/Counsel]"},\n\nWe are in receipt of notice that ${f.claimant || "[Member Name]"} has reported bodily injuries arising from the above-referenced incident.\n\nPlease be advised that Personal Injury Protection (PIP) benefits are not available under this claim. Our investigation confirms that on ${formatNorthAmericanLetterDate(f.dol)}, the vehicle was engaged in Transportation Network Company (TNC) activity with ${f.tnc || "[Uber/Lyft]"} during Period ${f.period || "[1/2/3]"}.\n\nPer the applicable Whip Member Agreement and Terms of Service, first-party injury benefits, including PIP, are excluded when the vehicle is being operated in connection with rideshare or delivery activity. During active TNC periods, the TNC platform's insurance carrier is the primary insurer for bodily injury claims.\n\nAccordingly, PIP benefits are denied for this claim.${carrierReferenceBlock}\n\nPlease contact our office if you have questions.\n\nRegards,\n${f.adjuster || "[Adjuster Name]"}\nWhip Claims Management`;
    },
  },
  no_pip_state: {
    label: "No PIP — State Does Not Mandate",
    hint: "Use when the state of loss does not mandate PIP (e.g., GA, IL, VA, TX).",
    fields: ["recipient", "adjuster"],
    build: (f) =>
      `Hello ${f.recipient || "[Member Name]"},\n\nI hope you're doing okay and recovering after the accident. We received notice that you reported injuries related to this claim and wanted to reach out with some important information.\n\nBecause this loss occurred in a state that does not require Personal Injury Protection (PIP) or no-fault medical coverage, there are no first-party injury benefits available to members through the platform for medical expenses, lost wages, or pain and suffering.\n\nIn these situations, injury-related expenses are typically addressed through your personal health insurance, or through a third-party bodily injury claim if another party is determined to be legally responsible.\n\nWe will continue reviewing the claim and will let you know if we need anything further. In the meantime, please don't hesitate to reach out if you have questions or need clarification.\n\nBest regards,\n${f.adjuster || "[Adjuster Name]"}\nWhip Claims Team`,
  },
  pip_waiver: {
    label: "PIP Waiver — Member Waived Coverage",
    hint: "Use when the member expressly waived PIP in the Vehicle Membership Agreement.",
    fields: ["recipient", "claimant", "lease_date", "adjuster"],
    build: (f) =>
      `Hello ${f.recipient || "[Recipient Name: Member/Counsel]"},\n\nWe are in receipt of notice that ${f.claimant || "[Member Name]"} has reported bodily injuries arising from the above-referenced incident.\n\nPlease be advised that Personal Injury Protection (PIP) benefits are not available under this claim. Per the executed Vehicle Membership Agreement dated ${f.lease_date || "[Lease Date]"}, the lessee expressly waived eligibility for optional first-party coverages, including Personal Injury Protection (PIP) or similar no-fault medical benefits.\n\nAs such, there are no first-party medical, wage loss, or related injury benefits available through Whip/Metrocars Leasing Corp for this loss.\n\nAny injury-related treatment should be submitted to ${f.claimant || "[the member]"}'s personal health insurance, if applicable. To the extent another party is alleged to be legally responsible for the accident, injury damages may be pursued through a third-party bodily injury claim.\n\nPlease contact our office if you require clarification regarding this coverage position.\n\nRegards,\n${f.adjuster || "[Adjuster Name]"}\nWhip Claims Management`,
  },
  tnc_liability: {
    label: "TNC Liability Denial (PD & BI)",
    hint: "Use when vehicle was in TNC activity and a third-party claimant or carrier is seeking liability coverage.",
    fields: ["recipient", "dol", "tnc", "period", "tnc_carrier", "tnc_claim", "tnc_contact"],
    build: (f) =>
      `Hello ${f.recipient || "[Claimant/Carrier]"},\n\nWe have completed our review of the liability coverage portion of this claim.\n\nOur investigation confirms that on ${formatNorthAmericanLetterDate(f.dol)}, the vehicle was engaged in Transportation Network Company (TNC) activity with ${f.tnc || "[Uber/Lyft]"} during Period ${f.period || "[1/2/3]"}. Based on the applicable Whip Member Agreement and Terms of Service, liability coverage does not apply when the vehicle is being used in connection with rideshare or delivery activity.\n\nAccordingly, liability coverage is denied for this claim.\n\nIf you believe this determination is incorrect, please provide documentation showing the driver was not engaged in TNC activity at the time of loss.\n\nFor reference, coverage may be available through the TNC platform's insurance carrier during active rideshare periods:\nTNC Insurance Carrier: ${f.tnc_carrier || "[TNC Carrier Name]"}\nClaim Number: ${f.tnc_claim || "[TNC Claim Number]"}\nCarrier Contact Information: ${f.tnc_contact || "[Carrier Contact Info]"}\n\nThis determination applies to liability coverage only. All other coverages, if any, are evaluated separately.\n\nPlease let us know if you have any questions.\n\nRegards,\nWhip Claims Management`,
  },
  lor_acknowledgment: {
    label: "LOR — Acknowledge Only",
    hint: "Use to acknowledge receipt of a Letter of Representation without making a coverage determination.",
    fields: ["recipient", "claimant", "dol", "adjuster", "phone", "email"],
    build: (f) =>
      `Dear ${f.recipient || "[Attorney/Firm Name]"},\n\nThank you for forwarding your Letter of Representation on behalf of ${f.claimant || "[Claimant Name]"} in connection with the above-referenced claim (Date of Loss: ${f.dol || "[Date of Loss]"}).\n\nWe acknowledge receipt of your representation and will direct all future communications regarding this matter to your office. Please be advised that our investigation is ongoing and no coverage determination has been made at this time.\n\nWe will be in touch as our review progresses. In the meantime, please direct any questions or correspondence to:\n\n${f.adjuster || "[Adjuster Name]"}\nWhip Claims Management\nPhone: ${f.phone || "(xxx) xxx-xxxx"}\nEmail: ${f.email || "claims@drivewhip.com"}\n\nSincerely,\n${f.adjuster || "[Adjuster Name]"}\nWhip Claims Management`,
  },
  lor_deny_bi: {
    label: "LOR — Acknowledge + Deny BI (No Liability)",
    hint: "Use to acknowledge LOR and deny BI claim based on no liability finding.",
    fields: ["recipient", "claimant", "dol", "adjuster", "phone", "email"],
    build: (f) =>
      `Dear ${f.recipient || "[Attorney/Firm Name]"},\n\nThank you for forwarding your Letter of Representation on behalf of ${f.claimant || "[Claimant Name]"} in connection with the above-referenced claim (Date of Loss: ${f.dol || "[Date of Loss]"}).\n\nWe acknowledge receipt of your representation. After completing our investigation, we have determined that our insured/member was not liable for the subject accident. Accordingly, we are unable to extend coverage for the bodily injury claim asserted on behalf of your client.\n\nThis determination is based on the information currently available. We reserve all rights under the applicable policy and applicable law. If you have additional information that you believe impacts this determination, please forward it to our office for review.\n\nPlease direct any questions to:\n\n${f.adjuster || "[Adjuster Name]"}\nWhip Claims Management\nPhone: ${f.phone || "(xxx) xxx-xxxx"}\nEmail: ${f.email || "claims@drivewhip.com"}\n\nSincerely,\n${f.adjuster || "[Adjuster Name]"}\nWhip Claims Management`,
  },
  empower_member: {
    label: "Empower Denial — Member (Unauthorized Platform Use)",
    hint: "Use when the vehicle was used on an unauthorized platform (Empower, etc.) not covered under the membership.",
    fields: ["recipient", "claimant", "dol", "platform", "adjuster"],
    build: (f) => {
      const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      return `${today}\n\n${f.recipient || "[Member Name]"}\n\nRe: Claim Number: [Claim #] / Date of Loss: ${f.dol || "[Date of Loss]"} / Vehicle: [Vehicle Info]\n\nDear ${f.recipient || "[Member Name]"},\n\nWe are writing in connection with the above-referenced claim arising from the incident on ${f.dol || "[Date of Loss]"}.\n\nOur investigation has determined that at the time of loss, the vehicle was being operated in connection with ${f.platform || "[Empower/Unauthorized Platform]"}, a transportation network company (TNC) that is not authorized under your Vehicle Membership Agreement with Whip/Metrocars Leasing Corp.\n\nThe Empower platform operates outside the scope of the authorized TNC platforms covered under your membership agreement. Per the terms of your membership agreement, coverage is not available for losses occurring while the vehicle is being used in connection with unauthorized third-party platforms or services. Accordingly, we are unable to extend coverage for this claim.\n\nIf you believe this determination is in error, please provide documentation demonstrating the vehicle was not engaged in unauthorized platform activity at the time of loss. You may also wish to contact ${f.platform || "[Empower/Unauthorized Platform]"} directly regarding any coverage they may provide for incidents occurring during platform activity.\n\nSincerely,\n${f.adjuster || "[Handler Name]"}\nWhip Claims Management`;
    },
  },
  empower_claimant: {
    label: "Empower Denial — Claimant (Unauthorized Platform Use)",
    hint: "Use when a third-party claimant is seeking coverage and the vehicle was on an unauthorized platform.",
    fields: ["recipient", "dol", "platform", "adjuster"],
    build: (f) => {
      const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      return `${today}\n\n${f.recipient || "[Claimant/Carrier/Counsel]"}\n\nRe: Claim Number: [Claim #] / Date of Loss: ${f.dol || "[Date of Loss]"} / Vehicle: [Vehicle Info]\n\nDear ${f.recipient || "[Claimant/Carrier/Counsel]"},\n\nWe have completed our review of the coverage available for the above-referenced claim arising from the incident on ${f.dol || "[Date of Loss]"}.\n\nOur investigation has determined that at the time of loss, the vehicle was being operated in connection with ${f.platform || "[Empower/Unauthorized Platform]"}, a transportation network company (TNC) that is not authorized under the applicable Vehicle Membership Agreement with Whip/Metrocars Leasing Corp. The Empower platform operates outside the scope of authorized TNC platforms covered under the membership agreement.\n\nPer the terms of the membership agreement, coverage is not available for losses occurring while the vehicle is being used in connection with unauthorized third-party platforms or services. Accordingly, we are unable to extend coverage for this claim.\n\nIf you believe this determination is in error, please provide documentation demonstrating the vehicle was not engaged in unauthorized platform activity at the time of loss. You may also wish to direct your inquiry to ${f.platform || "[Empower/Unauthorized Platform]"} directly regarding any coverage they may provide for incidents occurring during platform activity.\n\nSincerely,\n${f.adjuster || "[Handler Name]"}\nWhip Claims Management`;
    },
  },
  [UAD_DENIAL_TYPE]: {
    label: UAD_DENIAL_LABEL,
    hint: UAD_DENIAL_HINT,
    fields: UAD_FIELD_META.map(({ key }) => key),
    build: (fields) => buildUadDenialText(restoreUadDenialFields(fields)),
  },
};

// ─── Shared field helpers ─────────────────────────────────────────────────────
function Field({
  label,
  id,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs font-semibold text-foreground/80">
        {label}
        {required && <span className="text-[#ff6221] ml-0.5">*</span>}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="text-sm h-8"
      />
    </div>
  );
}

// ─── Coverage-through date utilities ─────────────────────────────────────────
function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const targetMonth = d.getMonth() + months;
  d.setMonth(targetMonth);
  // Clamp month-end: if day overflowed (e.g. Jan 31 + 1 month → Mar 3), roll back
  if (d.getMonth() !== ((targetMonth % 12) + 12) % 12) {
    d.setDate(0); // last day of previous month
  }
  return d;
}
function toDateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function parseLocalDate(s: string): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function formatDateDisplay(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

interface CoverageThroughResult {
  throughDate: Date | null;
  helperText: string;
  warning: string | null;
}

export function computeCoverageThrough(opts: {
  startDateStr: string;
  state: string;
  stillInRental: boolean;
  dateOfLossStr: string;
  refDateStr?: string; // defaults to today
}): CoverageThroughResult {
  const { startDateStr, state, stillInRental, dateOfLossStr, refDateStr } = opts;
  const start = parseLocalDate(startDateStr);
  if (!start) return { throughDate: null, helperText: "", warning: null };

  const isMD = state === "MD";
  const initialTermEnd = isMD ? addDays(start, 30) : addMonths(start, 12);

  if (!stillInRental) {
    // Not in rental: use date of loss (or start date as fallback)
    const lossDate = parseLocalDate(dateOfLossStr) || start;
    return {
      throughDate: lossDate,
      helperText: `Rental ended — coverage through last rental day (${formatDateDisplay(lossDate)}).`,
      warning: null,
    };
  }

  // Still in rental: compute from reference date (today by default)
  const today = toDateOnly(refDateStr ? (parseLocalDate(refDateStr) || new Date()) : new Date());

  if (today < toDateOnly(start)) {
    return {
      throughDate: null,
      helperText: "",
      warning: "Reference date is before the coverage start date — please check the effective date.",
    };
  }

  const termEndDay = toDateOnly(initialTermEnd);

  if (today <= termEndDay) {
    // Still inside initial term
    const label = isMD ? "MD 30-day initial term" : "12-month initial term";
    return {
      throughDate: termEndDay,
      helperText: `Still in rental — ${label} ends ${formatDateDisplay(termEndDay)}, currently covered through ${formatDateDisplay(termEndDay)}.`,
      warning: null,
    };
  }

  // Past initial term — find current 7-day renewal window
  const daysAfterTerm = Math.ceil((today.getTime() - termEndDay.getTime()) / 86400000);
  const weeks = Math.ceil(daysAfterTerm / 7);
  const throughDate = addDays(termEndDay, weeks * 7);
  const label = isMD ? "MD initial term ended" : "Initial term ended";
  return {
    throughDate,
    helperText: `Still in rental — ${label} ${formatDateDisplay(termEndDay)}, renews weekly, currently covered through ${formatDateDisplay(throughDate)}.`,
    warning: null,
  };
}

// ─── Shared: Handler Select Dropdown ─────────────────────────────────────────
// Priority handlers shown first; rest sorted alphabetically
const PRIORITY_HANDLERS = ["Tim Chan", "Daniel Giono"];
const INSURANCE_COMPANIES = [
  "Whip Claims Management",
  "Assurant Claim Management",
  "Klutch Insurance",
  "Total Recon",
  "Whip Inc.",
  "Metrocars Leasing Corp.",
] as const;

function InsuranceCompanySelect({
  value,
  onChange,
  id,
  label = "Insurance Company",
}: {
  value: string;
  onChange: (v: string) => void;
  id: string;
  label?: string;
}) {
  const isListed = INSURANCE_COMPANIES.includes(value as typeof INSURANCE_COMPANIES[number]);
  const [isCustom, setIsCustom] = React.useState(() => Boolean(value && !isListed));
  React.useEffect(() => {
    if (value && !isListed) setIsCustom(true);
  }, [isListed, value]);
  const selectedValue = isCustom ? "other" : (isListed ? value : undefined);
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs font-semibold text-foreground/80">{label}</Label>
      <Select value={selectedValue} onValueChange={(next) => {
        const nextIsCustom = next === "other";
        setIsCustom(nextIsCustom);
        if (!nextIsCustom) onChange(next);
      }}>
        <SelectTrigger id={id} className="h-8 text-sm"><SelectValue placeholder="Select insurance company…" /></SelectTrigger>
        <SelectContent>
          {INSURANCE_COMPANIES.map((company) => <SelectItem key={company} value={company}>{company}</SelectItem>)}
          <SelectItem value="other">Other / enter manually</SelectItem>
        </SelectContent>
      </Select>
      {isCustom && (
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Insurer from estimate or other carrier"
          className="h-8 text-sm"
          aria-label={`${label} custom value`}
        />
      )}
    </div>
  );
}

const THIRD_PARTY_CARRIERS = [
  "State Farm",
  "Progressive",
  "GEICO",
  "Allstate",
  "Liberty Mutual",
  "Safeco",
  "Nationwide",
  "Travelers",
  "USAA",
  "Farmers Insurance",
  "American Family",
  "Erie Insurance",
  "The Hartford",
  "Kemper",
  "The General",
  "Auto-Owners Insurance",
  "Chubb",
] as const;

type ThirdPartyCarrierRouting = { address: string; preferredMethod: string; routingNote: string };

// Carrier-published correspondence addresses are editable defaults. The claims
// number must be on every demand, and an assigned adjuster's routing instructions
// always control over this directory.
const THIRD_PARTY_CARRIER_ROUTING: Record<typeof THIRD_PARTY_CARRIERS[number], ThirdPartyCarrierRouting> = {
  "State Farm": { address: "State Farm Insurance\nPO Box 680001\nDallas, TX 75368-0001", preferredMethod: "Use State Farm's other-insurer claim portal or the assigned claim handler.", routingNote: "State Farm routes auto mail by policy state; confirm the policy-specific Auto Operation Center before mailing." },
  "Progressive": { address: "The Progressive Corporation\n300 North Commons Blvd\nMayfield Village, OH 44143", preferredMethod: "Use the assigned adjuster's channel; Progressive also publishes General Fax 1-877-280-5587.", routingNote: "Corporate correspondence default; confirm claim-specific routing before mailing." },
  "GEICO": { address: "GEICO\n5260 Western Avenue\nChevy Chase, MD 20815", preferredMethod: "Upload through the GEICO claim portal or obtain the fax/email from the assigned claims agent.", routingNote: "Corporate correspondence default; GEICO uses claim-specific claims routing." },
  "Allstate": { address: "Allstate Insurance Company\nPO Box 660636\nDallas, TX 75266", preferredMethod: "Use Allstate MyClaim/assigned claim contact when available.", routingNote: "Allstate publishes this for property-and-casualty claims mail." },
  "Liberty Mutual": { address: "Liberty Mutual Insurance\nP.O. Box 5014\nScranton, PA 18505-5014", preferredMethod: "Use Liberty Mutual's third-party carrier portal or assigned claims representative.", routingNote: "General auto-claims correspondence default; include the claim number." },
  "Safeco": { address: "Liberty Mutual Insurance\nP.O. Box 1053\nMontgomeryville, PA 18936-1053", preferredMethod: "Use the Safeco/Liberty Mutual third-party portal or assigned claims representative.", routingNote: "General claims correspondence default; confirm the applicable Safeco entity and claim routing." },
  "Nationwide": { address: "Nationwide Headquarters\nOne Nationwide Plaza\nColumbus, OH 43215-2220", preferredMethod: "Use Nationwide's claim tools or the assigned claims adjuster.", routingNote: "Home-office correspondence default; confirm claim-specific routing before mailing." },
  "Travelers": { address: "Travelers Insurance\nAttention: Travelers – 4210\n3000 Kellway Drive, Suite 120\nCarrollton, TX 75006", preferredMethod: "Use Travelers' secure Claim Upload Center for demand documents.", routingNote: "Carrier publishes this subrogation address for FedEx-only payments; do not send ordinary USPS without confirming the adjuster's routing." },
  "USAA": { address: "USAA Claims Service\nP.O. Box 33490\nSan Antonio, TX 78265", preferredMethod: "Email the assigned adjuster's address or fax 800-531-8669 with the claim number.", routingNote: "USAA publishes this as its claims mailing address." },
  "Farmers Insurance": { address: "Farmers Insurance\n6301 Owensmouth Ave\nWoodland Hills, CA 91367", preferredMethod: "Use Farmers' document-upload portal or the assigned claims representative.", routingNote: "General correspondence default; confirm Claims Center routing for a demand." },
  "American Family": { address: "American Family Insurance Claims Services, Inc.\n6000 American Parkway\nMadison, WI 53783-0001", preferredMethod: "Email claimdocuments@afics.com with the claim number in the subject; fax 1-866-935-2858 is also published.", routingNote: "American Family publishes this claims-documentation address." },
  "Erie Insurance": { address: "Erie Branch Claims Office\nP.O. Box 13002\nErie, PA 16514-3002", preferredMethod: "Use the assigned claims handler; fax 814-451-5209 or 888-333-3743 is published by the claims office.", routingNote: "General claims-office correspondence default; include the ERIE claim number." },
  "The Hartford": { address: "The Hartford\nP.O. Box 14219\nLexington, KY 40512", preferredMethod: "Use the third-party claim portal and the assigned adjuster.", routingNote: "General correspondence default; do not use the separate NJ PIP medical-billing address for property-damage demands." },
  "Kemper": { address: "Kemper Claims\n123 Town Square Place, PMB 785\nJersey City, NJ 07310", preferredMethod: "Email mail.claims@kemper.com or fax 888-976-2123 with the claim number.", routingNote: "Kemper publishes this claims address and electronic document contacts." },
  "The General": { address: "The General Claims Department\nPO Box 8001\nStevens Point, WI 54481-9820", preferredMethod: "Email Claims@thegeneral.com or fax 1-833-464-9908 with the claim number.", routingNote: "The General publishes this for claim documentation." },
  "Auto-Owners Insurance": { address: "Auto-Owners Insurance\n6101 Anacapri Blvd\nLansing, MI 48917", preferredMethod: "Use the local independent agent or assigned claim representative.", routingNote: "Corporate correspondence default; Auto-Owners requires agent/claim-representative routing for claims." },
  "Chubb": { address: "Chubb North America Claims\nP.O. Box 716\nPortland, ME 04104", preferredMethod: "Upload through Chubb's claim application or obtain the correct route from the assigned adjuster.", routingNote: "Chubb publishes this as a General Claims address; confirm the assigned adjuster's address/fax for a specific auto claim." },
};

function ThirdPartyCarrierSelect({
  value,
  onChange,
  onAddressChange,
}: {
  value: string;
  onChange: (v: string) => void;
  onAddressChange?: (v: string) => void;
}) {
  const isListed = THIRD_PARTY_CARRIERS.includes(value as typeof THIRD_PARTY_CARRIERS[number]);
  const [isCustom, setIsCustom] = React.useState(() => Boolean(value && !isListed));
  React.useEffect(() => {
    if (value && !isListed) setIsCustom(true);
  }, [isListed, value]);
  const selectedValue = isCustom ? "other" : (isListed ? value : undefined);
  const selectedRouting = isListed ? THIRD_PARTY_CARRIER_ROUTING[value as keyof typeof THIRD_PARTY_CARRIER_ROUTING] : null;
  return (
    <div className="space-y-1">
      <Label htmlFor="sd-carrier" className="text-xs font-semibold text-foreground/80">Third-party carrier</Label>
      <Select value={selectedValue} onValueChange={(next) => {
        const nextIsCustom = next === "other";
        setIsCustom(nextIsCustom);
        if (!nextIsCustom) {
          onChange(next);
          const routing = THIRD_PARTY_CARRIER_ROUTING[next as keyof typeof THIRD_PARTY_CARRIER_ROUTING];
          if (routing?.address) onAddressChange?.(routing.address);
        }
      }}>
        <SelectTrigger id="sd-carrier" className="h-8 text-sm"><SelectValue placeholder="Select their insurance carrier…" /></SelectTrigger>
        <SelectContent>
          {THIRD_PARTY_CARRIERS.map((carrier) => <SelectItem key={carrier} value={carrier}>{carrier}</SelectItem>)}
          <SelectItem value="other">Other third-party carrier / enter manually</SelectItem>
        </SelectContent>
      </Select>
      {isCustom && (
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Enter the third-party carrier"
          className="h-8 text-sm"
          aria-label="Third-party carrier manual entry"
        />
      )}
      <p className="text-[10px] leading-4 text-muted-foreground">Use the adverse/third-party carrier—not Whip, Metrocars, or the member’s carrier.</p>
      {selectedRouting && (
        <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] leading-4 text-slate-600">
          <p><span className="font-semibold text-slate-800">Preferred delivery:</span> {selectedRouting.preferredMethod}</p>
          <p className="mt-0.5"><span className="font-semibold text-slate-800">Mail routing:</span> {selectedRouting.routingNote}</p>
        </div>
      )}
    </div>
  );
}

function HandlerSelect({
  value,
  onChange,
  onHandlerChange,
  label = "Handler Name",
  id = "handler-select",
}: {
  value: string;
  onChange: (v: string) => void;
  onHandlerChange?: (handler: { name: string; extension?: string | null }) => void;
  label?: string;
  id?: string;
}) {
  const { data: handlers } = trpc.handlers.list.useQuery(undefined, { staleTime: 60_000 });
  const sorted = React.useMemo<Array<{ name: string; extension: string | null }>>(() => {
    if (!handlers) return PRIORITY_HANDLERS.map((name) => ({ name, extension: getHandlerExtension(name) }));
    const priority = PRIORITY_HANDLERS.map(n => handlers.find(h => h.name === n)).filter(Boolean) as typeof handlers;
    const rest = handlers.filter(h => !PRIORITY_HANDLERS.includes(h.name)).sort((a, b) => a.name.localeCompare(b.name));
    return [...priority, ...rest].map((handler) => ({
      name: handler.name,
      extension: handler.extension ?? getHandlerExtension(handler.name),
    }));
  }, [handlers]);
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs font-semibold text-foreground/80">{label}</Label>
      <Select
        value={value}
        onValueChange={(nextValue) => {
          onChange(nextValue);
          const selected = sorted.find((handler) => handler.name === nextValue);
          if (selected) onHandlerChange?.(selected);
        }}
      >
        <SelectTrigger id={id} className="h-8 text-sm"><SelectValue placeholder="Select handler…" /></SelectTrigger>
        <SelectContent>
          {sorted.map((h, i) => (
            <React.Fragment key={h.name}>
              {i === PRIORITY_HANDLERS.length && sorted.length > PRIORITY_HANDLERS.length && (
                <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-t border-border mt-1 pt-1">All Handlers</div>
              )}
              <SelectItem value={h.name}>{h.name}</SelectItem>
            </React.Fragment>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function TextareaField({
  label,
  id,
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs font-semibold text-foreground/80">
        {label}
      </Label>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="text-sm resize-y"
      />
    </div>
  );
}

function Panel({
  title,
  tag,
  children,
}: {
  title: string;
  tag?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-border rounded-lg overflow-hidden mb-4">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-muted/40 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {tag && (
          <span className="text-[10px] font-mono font-bold text-[#ff6221] bg-[#ff6221]/10 px-1.5 py-0.5 rounded">
            {tag}
          </span>
        )}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>;
}

function Grid3({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-3 gap-3">{children}</div>;
}

// ─── Preview Panel ────────────────────────────────────────────────────────────
function PreviewPanel({
  text,
  onCopy,
  onPreview,
  onDownload,
  filename,
  extra,
  pdfUrl,
  formattedPreview,
  allowPreviewDownload = true,
}: {
  text: string;
  onCopy: () => void;
  onPreview?: () => void;
  onDownload: () => void;
  filename?: string;
  extra?: React.ReactNode;
  pdfUrl?: string | null;
  formattedPreview?: React.ReactNode;
  allowPreviewDownload?: boolean;
}) {
  const [showPdf, setShowPdf] = useState(true);
  const [fullScreen, setFullScreen] = useState(false);
  // Auto-switch to PDF view when a URL is available
  useEffect(() => { if (pdfUrl) setShowPdf(true); }, [pdfUrl]);
  return (
    <>
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/40 border-b border-border">
          <FileText className="w-3.5 h-3.5 text-[#ff6221]" />
          <h3 className="text-sm font-semibold text-foreground flex-1">Preview</h3>
          <div className="flex items-center gap-1 mr-1">
              <button
                onClick={() => setShowPdf(false)}
                className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${!showPdf ? "bg-[#ff6221] text-white border-[#ff6221]" : "border-border text-foreground/60 hover:border-[#ff6221]/40"}`}
              >Text</button>
              <button
                onClick={() => setShowPdf(true)}
                className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${showPdf ? "bg-[#ff6221] text-white border-[#ff6221]" : "border-border text-foreground/60 hover:border-[#ff6221]/40"}`}
              >Formatted</button>
            </div>
          {extra}
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={onCopy}>
            <Copy className="w-3 h-3" /> Copy
          </Button>
          {pdfUrl && (
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setFullScreen(true)}>
              <Maximize2 className="w-3 h-3" /> Full Screen
            </Button>
          )}
          {onPreview && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs border-[#ff6221]/50 text-[#ff6221] hover:bg-[#ff6221]/10"
              onClick={onPreview}
            >
              <Eye className="w-3 h-3" /> Preview
            </Button>
          )}
          <Button
            size="sm"
            className="h-7 gap-1.5 text-xs bg-[#ff6221] hover:bg-[#e5541a] text-white"
            onClick={onDownload}
          >
            <Download className="w-3 h-3" /> Download
          </Button>
        </div>
        {showPdf ? (
          formattedPreview ? (
            formattedPreview
          ) : pdfUrl ? (
            <iframe
              src={pdfUrl}
              className="w-full bg-white"
              style={{ height: "600px", border: "none" }}
              title="PDF Preview"
            />
          ) : (
            <div className="flex flex-col items-center justify-center bg-white" style={{ height: "600px" }}>
              <div className="text-center space-y-3 px-6">
                <div className="w-12 h-12 rounded-full bg-[#ff6221]/10 flex items-center justify-center mx-auto">
                  <FileText className="w-6 h-6 text-[#ff6221]" />
                </div>
                <p className="text-sm font-medium text-foreground">PDF Preview</p>
                <p className="text-xs text-foreground/50">Fill in the fields and click <span className="font-semibold text-[#ff6221]">Preview</span> to generate a formatted preview, or <span className="font-semibold text-[#ff6221]">Download</span> to save the PDF directly</p>
              </div>
            </div>
          )
        ) : (
          <pre className="p-4 text-xs font-mono whitespace-pre-wrap text-foreground/80 max-h-[600px] overflow-y-auto bg-background">
            {text || "(Fill in the fields above to generate a preview)"}
          </pre>
        )}
      </div>
      {fullScreen && pdfUrl && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-black/95">
          <div className="flex items-center justify-between px-4 py-2 bg-background/10 border-b border-white/10">
            <span className="text-white text-sm font-medium">{filename || "Document Preview"}</span>
            <div className="flex items-center gap-3">
              {allowPreviewDownload && <a href={pdfUrl} download={filename} className="text-white/70 hover:text-white text-xs flex items-center gap-1">
                <Download className="w-3.5 h-3.5" /> Download
              </a>}
              <button onClick={() => setFullScreen(false)} className="text-white/70 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <iframe src={pdfUrl} className="w-full h-full" title="Full Screen PDF Preview" />
          </div>
        </div>
      )}
    </>
  );
}

// ─── Tab: Blank Letterhead ────────────────────────────────────────────────────
function BlankLetterheadTab() {
  type CoreSectionId = "date" | "recipient" | "reference" | "subject" | "greeting" | "body" | "closing" | "signature" | "contact";
  type CustomSection = { id: string; title: string; content: string; enabled: boolean };
  const [form, setForm] = useState({
    letterDate: new Date().toISOString().slice(0, 10),
    claimNumber: "",
    dateOfLoss: "",
    recipient: "",
    recipientAddress: "",
    subject: "",
    body: "",
    greeting: "Dear",
    closing: "Sincerely,",
    handlerName: "",
    handlerTitle: "",
    companyName: "Whip Claims Management",
    companyAddress: "P.O. Box 10622, Rockville, MD 20849",
    companyEmail: "claims@drivewhip.com",
    companyPhone: "",
  });
  const coreSections: { id: CoreSectionId; label: string }[] = [
    { id: "date", label: "Letter date" },
    { id: "recipient", label: "Recipient block" },
    { id: "reference", label: "Claim reference" },
    { id: "subject", label: "Subject line" },
    { id: "greeting", label: "Greeting" },
    { id: "body", label: "Letter body" },
    { id: "closing", label: "Closing" },
    { id: "signature", label: "Handler signature" },
    { id: "contact", label: "Company contact block" },
  ];
  const [enabledSections, setEnabledSections] = useState<Record<CoreSectionId, boolean>>({
    date: true,
    recipient: true,
    reference: true,
    subject: true,
    greeting: true,
    body: true,
    closing: true,
    signature: true,
    contact: true,
  });
  const [customSections, setCustomSections] = useState<CustomSection[]>([]);
  const [sectionOrder, setSectionOrder] = useState<string[]>(coreSections.map(section => section.id));
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const improveMutation = trpc.docgen.improveWithAI.useMutation();

  const set = (k: keyof typeof form) => (v: string) => setForm((p) => ({ ...p, [k]: v }));
  const formattedDate = form.letterDate
    ? new Date(`${form.letterDate}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "[Letter Date]";

  const isEnabled = (id: string) => {
    const custom = customSections.find(section => section.id === id);
    return custom ? custom.enabled : enabledSections[id as CoreSectionId] !== false;
  };

  const sectionContent = (id: string) => {
    const custom = customSections.find(section => section.id === id);
    if (custom) return [custom.title, custom.content].filter(Boolean).join("\n");
    switch (id as CoreSectionId) {
      case "date": return formattedDate;
      case "recipient": return [form.recipient || "[Recipient Name]", form.recipientAddress || "[Recipient Address]"].join("\n");
      case "reference": return `Re: Claim #${form.claimNumber || "[Claim Number]"}${form.dateOfLoss ? ` — Date of Loss: ${form.dateOfLoss}` : ""}`;
      case "subject": return form.subject;
      case "greeting": return `${form.greeting || "Dear"} ${form.recipient || "[Recipient]"},`;
      case "body": return form.body || "[Letter body will appear here]";
      case "closing": return form.closing || "Sincerely,";
      case "signature": return [form.handlerName || "[Handler Name]", form.handlerTitle].filter(Boolean).join("\n");
      case "contact": return [form.companyName, form.companyAddress, form.companyPhone && `Phone: ${form.companyPhone}`, form.companyEmail].filter(Boolean).join("\n");
      default: return "";
    }
  };

  const preview = sectionOrder
    .filter(isEnabled)
    .map(sectionContent)
    .filter(Boolean)
    .join("\n\n");

  const buildDocument = useCallback(() => {
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    let y = addWhipLetterhead(doc);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(40, 40, 40);

    const writeSection = (text: string, gap = 5, italic = false) => {
      if (!text) return;
      doc.setFont("helvetica", italic ? "italic" : "normal");
      for (const paragraph of text.split("\n")) {
        const lines = doc.splitTextToSize(paragraph || " ", W - 28) as string[];
        for (const line of lines) {
          if (y > H - 20) {
            doc.addPage();
            y = 18;
          }
          doc.text(line, 14, y);
          y += 6.25;
        }
      }
      y += gap;
      doc.setFont("helvetica", "normal");
    };

    for (const id of sectionOrder) {
      if (!isEnabled(id)) continue;
      writeSection(sectionContent(id), id === "body" ? 7 : 4, id === "subject");
    }
    addLetterFooter(doc);
    return doc;
  }, [form, customSections, enabledSections, sectionOrder]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextUrl = getPDFDataUrl(buildDocument());
      setPreviewPdfUrl(previous => {
        if (previous) URL.revokeObjectURL(previous);
        return nextUrl;
      });
    }, 160);
    return () => window.clearTimeout(timer);
  }, [buildDocument]);

  useEffect(() => () => {
    if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl);
  }, [previewPdfUrl]);

  const toggleCore = (id: CoreSectionId) => setEnabledSections(previous => ({ ...previous, [id]: !previous[id] }));
  const moveSection = (id: string, direction: -1 | 1) => setSectionOrder(previous => {
    const currentIndex = previous.indexOf(id);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= previous.length) return previous;
    const next = [...previous];
    [next[currentIndex], next[nextIndex]] = [next[nextIndex], next[currentIndex]];
    return next;
  });
  const addCustomSection = () => {
    const id = `custom-${Date.now()}`;
    setCustomSections(previous => [...previous, { id, title: "Additional area", content: "", enabled: true }]);
    setSectionOrder(previous => [...previous, id]);
  };
  const updateCustom = (id: string, patch: Partial<CustomSection>) => setCustomSections(previous => previous.map(section => section.id === id ? { ...section, ...patch } : section));
  const removeCustom = (id: string) => {
    setCustomSections(previous => previous.filter(section => section.id !== id));
    setSectionOrder(previous => previous.filter(sectionId => sectionId !== id));
  };

  const handleImprove = async () => {
    if (!form.body.trim()) {
      toast.error("Enter a letter body first");
      return;
    }
    setAiLoading(true);
    try {
      const result = await improveMutation.mutateAsync({ body: form.body, claimNumber: form.claimNumber, recipient: form.recipient });
      set("body")(result.improved);
      toast.success("Letter improved with AI");
    } catch (e: unknown) {
      toast.error((e as Error).message || "AI error");
    } finally {
      setAiLoading(false);
    }
  };

  const handleDownload = (shouldDownload = true) => {
    const doc = buildDocument();
    if (shouldDownload) downloadPDF(doc, `Whip_Letter_${form.claimNumber || "Draft"}.pdf`);
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <div>
        <Panel title="Letter Details" tag="MODULAR">
          <Grid3>
            <Field label="Letter Date" id="bl-date" value={form.letterDate} onChange={set("letterDate")} type="date" />
            <Field label="Claim Number" id="bl-claim" value={form.claimNumber} onChange={set("claimNumber")} placeholder="e.g. PF438367" />
            <Field label="Date of Loss" id="bl-dol" value={form.dateOfLoss} onChange={set("dateOfLoss")} type="date" />
          </Grid3>
          <div className="mt-3"><Field label="Recipient Name" id="bl-recipient" value={form.recipient} onChange={set("recipient")} placeholder="e.g. John Smith" /></div>
          <div className="mt-3"><Field label="Recipient Address" id="bl-addr" value={form.recipientAddress} onChange={set("recipientAddress")} placeholder="123 Main St, City, ST 00000" /></div>
          <div className="mt-3"><Field label="Subject Line" id="bl-subject" value={form.subject} onChange={set("subject")} placeholder="e.g. Claim Status Update" /></div>
        </Panel>

        <Panel title="Letter Content">
          <Grid2>
            <Field label="Greeting" id="bl-greeting" value={form.greeting} onChange={set("greeting")} placeholder="Dear" />
            <Field label="Closing" id="bl-closing" value={form.closing} onChange={set("closing")} placeholder="Sincerely," />
          </Grid2>
          <div className="mt-3"><TextareaField label="Body" id="bl-body" value={form.body} onChange={set("body")} placeholder="Type your letter body here..." rows={10} /></div>
          <div className="mt-3 flex gap-2"><Button variant="outline" size="sm" className="gap-1.5 border-[#ff6221]/40 text-[#ff6221] hover:bg-[#ff6221]/10" onClick={handleImprove} disabled={aiLoading}>{aiLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}{aiLoading ? "Improving..." : "Improve with AI"}</Button></div>
        </Panel>

        <Panel title="Signature & Contact">
          <Grid2>
            <HandlerSelect value={form.handlerName} onChange={set("handlerName")} label="Handler Name" id="bl-handler" />
            <Field label="Handler Title" id="bl-title" value={form.handlerTitle} onChange={set("handlerTitle")} placeholder="e.g. Claims Handler" />
            <Field label="Company Name" id="bl-company" value={form.companyName} onChange={set("companyName")} />
            <Field label="Company Email" id="bl-email" value={form.companyEmail} onChange={set("companyEmail")} />
          </Grid2>
          <div className="mt-3"><Field label="Company Address" id="bl-company-address" value={form.companyAddress} onChange={set("companyAddress")} /></div>
          <div className="mt-3"><Field label="Company Phone" id="bl-phone" value={form.companyPhone} onChange={set("companyPhone")} placeholder="(xxx) xxx-xxxx" /></div>
        </Panel>

        <Panel title="Sections & Layout">
          <p className="mb-3 text-xs leading-5 text-muted-foreground">Toggle any standard area off, add your own area, and use the arrows to control the order used in both the live formatted preview and the downloaded PDF.</p>
          <div className="space-y-2">{sectionOrder.map((id, index) => {
            const custom = customSections.find(section => section.id === id);
            const core = coreSections.find(section => section.id === id);
            const label = custom ? custom.title || "Additional area" : core?.label || "Section";
            return <div key={id} className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-2"><Checkbox id={`bl-section-${id}`} checked={isEnabled(id)} onCheckedChange={() => custom ? updateCustom(id, { enabled: !custom.enabled }) : toggleCore(id as CoreSectionId)} /><Label htmlFor={`bl-section-${id}`} className="min-w-0 flex-1 cursor-pointer text-sm">{label}</Label>{custom && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Custom</span>}<button type="button" onClick={() => moveSection(id, -1)} disabled={index === 0} className="rounded px-1.5 py-0.5 text-sm text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label={`Move ${label} up`}>↑</button><button type="button" onClick={() => moveSection(id, 1)} disabled={index === sectionOrder.length - 1} className="rounded px-1.5 py-0.5 text-sm text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label={`Move ${label} down`}>↓</button>{custom && <button type="button" onClick={() => removeCustom(id)} className="rounded p-1 text-red-500 hover:bg-red-50" aria-label={`Remove ${label}`}><Trash2 className="h-3.5 w-3.5" /></button>}</div>;
          })}</div>
          <Button type="button" variant="outline" size="sm" className="mt-3 gap-1.5" onClick={addCustomSection}><Plus className="h-3.5 w-3.5" /> Add an area</Button>
        </Panel>

        {customSections.length > 0 && <Panel title="Custom Areas">{customSections.map(section => <div key={section.id} className="mb-4 rounded-lg border bg-muted/20 p-3 last:mb-0"><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Additional area</p><Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => removeCustom(section.id)}><Trash2 className="h-3.5 w-3.5" /> Remove</Button></div><div className="mt-2"><Field label="Area Label" id={`${section.id}-label`} value={section.title} onChange={value => updateCustom(section.id, { title: value })} placeholder="e.g. Enclosures" /></div><div className="mt-2"><TextareaField label="Area Content" id={`${section.id}-content`} value={section.content} onChange={value => updateCustom(section.id, { content: value })} placeholder="Add any custom language, attachment list, or signature content..." rows={4} /></div></div>)}</Panel>}
      </div>
      <div className="xl:sticky xl:top-4 xl:self-start">
        <PreviewPanel
          text={preview}
          onCopy={() => { navigator.clipboard.writeText(preview); toast.success("Copied"); }}
          onDownload={() => handleDownload(true)}
          filename={`Whip_Letter_${form.claimNumber || "Draft"}.pdf`}
          pdfUrl={previewPdfUrl}
          onPreview={() => handleDownload(false)}
          extra={<span className="hidden text-[10px] font-medium text-emerald-700 sm:inline">Updates as you type</span>}
          formattedPreview={<div className="min-h-[600px] bg-[#e9edf2] p-4 sm:p-6"><article className="mx-auto min-h-[560px] max-w-[760px] bg-white px-8 py-9 text-[11px] leading-[1.7] text-[#232a38] shadow-sm sm:px-12 sm:py-12"><div className="border-b border-[#ff6221]/60 pb-4"><p className="text-base font-semibold tracking-tight text-[#171b31]">Whip Claims Management</p><p className="mt-0.5 text-[10px] uppercase tracking-[0.13em] text-[#ff6221]">Letter preview</p></div><div className="mt-8 whitespace-pre-wrap">{preview}</div></article></div>}
        />
      </div>
    </div>
  );
}

// ─── Tab: Claimant Contact ────────────────────────────────────────────────────
function ClaimantContactTab() {
  const [form, setForm] = useState({
    claimantName: "",
    claimNumber: "",
    dateOfLoss: "",
    state: "",
    vehicle: "",
    adjusterName: "",
    adjusterPhone: "",
    adjusterEmail: "",
    contactType: "initial",
    additionalNotes: "",
  });
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const contactTypeLabel: Record<string, string> = {
    initial: "Initial Contact",
    followup: "Follow-Up Contact",
    status_update: "Status Update",
    document_request: "Document Request",
  };

  const preview = `${today}

Re: ${contactTypeLabel[form.contactType] || "Contact"} — Claim #${form.claimNumber || "[Claim Number]"}
    Date of Loss: ${form.dateOfLoss || "[Date of Loss]"}
    Vehicle: ${form.vehicle || "[Vehicle]"}

Dear ${form.claimantName || "[Claimant Name]"},

${
  form.contactType === "initial"
    ? `We are writing to introduce ourselves in connection with the above-referenced claim. My name is ${form.adjusterName || "[Adjuster Name]"}, and I am the claims handler assigned to your file at Whip Claims Management.\n\nWe have received notice of the incident that occurred on ${form.dateOfLoss || "[Date of Loss]"} involving ${form.vehicle || "[the vehicle]"}. We are currently conducting our investigation and will be in touch as our review progresses.\n\nTo assist us in processing your claim promptly, please contact our office at your earliest convenience.`
    : form.contactType === "followup"
    ? `We are following up in connection with the above-referenced claim. We have attempted to reach you regarding this matter and wanted to ensure you have our contact information.\n\nPlease contact our office at your earliest convenience so we may discuss the status of your claim.`
    : form.contactType === "status_update"
    ? `We are writing to provide you with a status update on the above-referenced claim. Our investigation is ongoing, and we will notify you of any significant developments.\n\nIf you have any questions or additional information to provide, please do not hesitate to contact us.`
    : `We are writing to request documentation in connection with the above-referenced claim. To continue processing your claim, we require the following:\n\n${form.additionalNotes || "[List required documents]"}\n\nPlease forward the requested documentation to our office at your earliest convenience.`
}

${form.additionalNotes && form.contactType !== "document_request" ? `\n${form.additionalNotes}\n` : ""}
Please do not hesitate to contact me directly with any questions.

Sincerely,

${form.adjusterName || "[Adjuster Name]"}
Whip Claims Management
Phone: ${form.adjusterPhone || "(xxx) xxx-xxxx"}
Email: ${form.adjusterEmail || "claims@drivewhip.com"}`;

  const handleDownload = (shouldDownload = true) => {
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    let y = addWhipLetterhead(doc);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(40, 40, 40);
    y = wrapLetterText(doc, preview, 14, y, W - 28, 6);
    if (form.state && form.dateOfLoss) addFailedContactPdSolNotice(doc, form.state, form.dateOfLoss);
    addLetterFooter(doc);
    setPreviewPdfUrl(getPDFDataUrl(doc));
    if (shouldDownload) downloadPDF(doc, `Whip_Contact_${form.claimNumber || "Draft"}.pdf`);
  };
  const handlePreviewOnly = () => { handleDownload(false); };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div>
        <Panel title="Claim Details" tag="REQUIRED">
          <Grid3>
            <Field label="Claimant Name" id="cc-name" value={form.claimantName} onChange={set("claimantName")} placeholder="First Last" required />
            <Field label="Claim Number" id="cc-claim" value={form.claimNumber} onChange={set("claimNumber")} placeholder="e.g. PF438367" />
            <Field label="Date of Loss" id="cc-dol" value={form.dateOfLoss} onChange={set("dateOfLoss")} type="date" />
          </Grid3>
          <div className="mt-3">
            <Field label="Vehicle (Year/Make/Model)" id="cc-vehicle" value={form.vehicle} onChange={set("vehicle")} placeholder="e.g. 2024 Toyota Camry" />
          </div>
        </Panel>
        <Panel title="Contact Type">
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Contact Type</Label>
            <Select value={form.contactType} onValueChange={set("contactType")}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="initial">Initial Contact</SelectItem>
                <SelectItem value="followup">Follow-Up Contact</SelectItem>
                <SelectItem value="status_update">Status Update</SelectItem>
                <SelectItem value="document_request">Document Request</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="mt-3">
            <TextareaField label="Additional Notes / Document List" id="cc-notes" value={form.additionalNotes} onChange={set("additionalNotes")} placeholder="Additional context or document list..." rows={3} />
          </div>
        </Panel>
        <Panel title="Handler Info">
          <Grid3>
            <HandlerSelect value={form.adjusterName} onChange={set("adjusterName")} label="Handler Name" id="cc-handler" />
            <Field label="Handler Phone" id="cc-phone" value={form.adjusterPhone} onChange={set("adjusterPhone")} placeholder="(xxx) xxx-xxxx" />
            <Field label="Handler Email" id="cc-email" value={form.adjusterEmail} onChange={set("adjusterEmail")} placeholder="handler@drivewhip.com" />
          </Grid3>
        </Panel>
      </div>
      <PreviewPanel
        text={preview}
        onCopy={() => { navigator.clipboard.writeText(preview); toast.success("Copied"); }}
        onDownload={handleDownload}
      
        pdfUrl={previewPdfUrl}
      
        onPreview={handlePreviewOnly}/>
    </div>
  );
}

// ─── Tab: Failed Contact ──────────────────────────────────────────────────────
function FailedContactTab() {
  const [form, setForm] = useState({
    claimantName: "",
    claimNumber: "",
    dateOfLoss: "",
    state: "",
    vehicle: "",
    adjusterName: "",
    adjusterPhone: "",
    adjusterEmail: "",
    attemptCount: "3",
    lastAttemptDate: "",
    deadline: "10",
  });
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const preview = `${today}

Re: Notice of Failed Contact — Claim #${form.claimNumber || "[Claim Number]"}
    Date of Loss: ${form.dateOfLoss || "[Date of Loss]"}
    Vehicle: ${form.vehicle || "[Vehicle]"}

Dear ${form.claimantName || "[Claimant Name]"},

We are writing to inform you that we have made ${form.attemptCount || "multiple"} attempts to contact you regarding the above-referenced claim${form.lastAttemptDate ? `, most recently on ${form.lastAttemptDate}` : ""}. Unfortunately, we have been unable to reach you.

Your cooperation is required to continue processing this claim. Please contact our office within ${form.deadline || "10"} business days of the date of this letter. Failure to respond may result in a delay or suspension of claim processing.

Please contact:

${form.adjusterName || "[Adjuster Name]"}
Whip Claims Management
Phone: ${form.adjusterPhone || "(xxx) xxx-xxxx"}
Email: ${form.adjusterEmail || "claims@drivewhip.com"}

We look forward to hearing from you.

Sincerely,

${form.adjusterName || "[Adjuster Name]"}
Whip Claims Management

${form.state && form.dateOfLoss ? `Statute of Limitations Notice (PD only): Based on the information currently available, the applicable statute of limitations is currently projected to expire on ${formatLongCalendarDate(projectedPdSolDate(form.dateOfLoss, form.state)) ?? "[DATE]"}.` : ""}`;

  const handleDownload = (shouldDownload = true) => {
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    let y = addWhipLetterhead(doc);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(40, 40, 40);
    y = wrapLetterText(doc, preview, 14, y, W - 28, 6);
    if (form.state && form.dateOfLoss) addFailedContactPdSolNotice(doc, form.state, form.dateOfLoss);
    addLetterFooter(doc);
    setPreviewPdfUrl(getPDFDataUrl(doc));
    if (shouldDownload) downloadPDF(doc, `Whip_FailedContact_${form.claimNumber || "Draft"}.pdf`);
  };
  const handlePreviewOnly = () => { handleDownload(false); };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div>
        <Panel title="Claim Details" tag="REQUIRED">
          <Grid3>
            <Field label="Claimant Name" id="fc-name" value={form.claimantName} onChange={set("claimantName")} placeholder="First Last" required />
            <Field label="Claim Number" id="fc-claim" value={form.claimNumber} onChange={set("claimNumber")} placeholder="e.g. PF438367" />
            <Field label="Date of Loss" id="fc-dol" value={form.dateOfLoss} onChange={set("dateOfLoss")} type="date" required />
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Loss State (PD SOL)</Label>
              <Select value={form.state} onValueChange={set("state")}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select state" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {PD_SOL_STATE_OPTIONS.map(([code, name]) => <SelectItem key={code} value={code}>{name} ({code})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </Grid3>
          {form.state && form.dateOfLoss && (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              PD statute date (projected): <strong>{formatLongCalendarDate(projectedPdSolDate(form.dateOfLoss, form.state)) ?? "Check the date of loss"}</strong>. Review before issuing; this is not legal advice.
            </p>
          )}
          <div className="mt-3">
            <Field label="Vehicle (Year/Make/Model)" id="fc-vehicle" value={form.vehicle} onChange={set("vehicle")} placeholder="e.g. 2024 Toyota Camry" />
          </div>
        </Panel>
        <Panel title="Contact Attempts">
          <Grid3>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Number of Attempts</Label>
              <Select value={form.attemptCount} onValueChange={set("attemptCount")}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["1","2","3","4","5","6+"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Field label="Last Attempt Date" id="fc-last" value={form.lastAttemptDate} onChange={set("lastAttemptDate")} type="date" />
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Response Deadline (days)</Label>
              <Select value={form.deadline} onValueChange={set("deadline")}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["5","7","10","14","15","20","30"].map(v => <SelectItem key={v} value={v}>{v} days</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </Grid3>
        </Panel>
        <Panel title="Handler Info">
          <Grid3>
            <HandlerSelect value={form.adjusterName} onChange={set("adjusterName")} label="Handler Name" id="fc-handler" />
            <Field label="Handler Phone" id="fc-phone" value={form.adjusterPhone} onChange={set("adjusterPhone")} placeholder="(xxx) xxx-xxxx" />
            <Field label="Handler Email" id="fc-email" value={form.adjusterEmail} onChange={set("adjusterEmail")} placeholder="handler@drivewhip.com" />
          </Grid3>
        </Panel>
      </div>
      <PreviewPanel
        text={preview}
        onCopy={() => { navigator.clipboard.writeText(preview); toast.success("Copied"); }}
        onDownload={handleDownload}
      
        pdfUrl={previewPdfUrl}
      
        onPreview={handlePreviewOnly}/>
    </div>
  );
}

// ─── Tab: Storage Mitigation ──────────────────────────────────────────────────
function StorageMitigationTab() {
  const [form, setForm] = useState({
    recipientName: "",
    claimNumber: "",
    dateOfLoss: "",
    vehicle: "",
    vin: "",
    storageFacility: "",
    storageAddress: "",
    storagePhone: "",
    towDate: "",
    dailyRate: "",
    adjusterName: "",
    adjusterPhone: "",
    adjusterEmail: "",
    deadline: "5",
  });
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const preview = `${today}

Notice Regarding Vehicle Storage and Duty to Mitigate

Dear ${form.recipientName || "[RECIPIENT NAME]"},

As part of the claims process, Whip Claims Management provides this notice to all claimants regarding vehicle storage charges. If your vehicle is not currently incurring storage charges, no action is required.

If your vehicle is being held at a tow yard, repair facility, storage facility, or other location where storage charges are accruing, you are expected to take reasonable steps to prevent unnecessary charges from continuing to accumulate. This may include arranging for the vehicle to be released or relocated to a location where additional storage charges will not accrue.

Please be advised that Whip Claims Management's receipt, acknowledgment, or investigation of a claim does not constitute an acceptance of liability or an agreement to pay towing, storage, or other charges.

Any storage charges submitted for consideration will be evaluated based on the circumstances of the claim, applicable coverage and liability, and the reasonableness and necessity of the charges incurred. Charges that continue to accrue after a reasonable opportunity to mitigate may not be reimbursed, in whole or in part.

If your vehicle is incurring storage charges and circumstances outside of your control prevent you from moving or releasing it, please contact Whip Claims Management promptly so that the circumstances can be documented and reviewed.

If you have questions regarding this notice, please contact us at (855) 906-5949.

Sincerely,

Whip Claims Management`;

  const handleDownload = (shouldDownload = true) => {
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    let y = addWhipLetterhead(doc);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(40, 40, 40);
    y = wrapLetterText(doc, preview, 14, y, W - 28, 6);
    addSOLNotice(doc);
    addLetterFooter(doc);
    setPreviewPdfUrl(getPDFDataUrl(doc));
    if (shouldDownload) downloadPDF(doc, `Whip_StorageMitigation_${form.claimNumber || "Draft"}.pdf`);
  };
  const handlePreviewOnly = () => { handleDownload(false); };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div>
        <Panel title="Claim Details" tag="REQUIRED">
          <Grid3>
            <Field label="Recipient Name" id="sm-recipient" value={form.recipientName} onChange={set("recipientName")} placeholder="Member / Claimant Name" required />
            <Field label="Claim Number" id="sm-claim" value={form.claimNumber} onChange={set("claimNumber")} placeholder="e.g. PF438367" />
            <Field label="Date of Loss" id="sm-dol" value={form.dateOfLoss} onChange={set("dateOfLoss")} type="date" />
          </Grid3>
          <Grid2 children={<>
            <Field label="Vehicle (Year/Make/Model)" id="sm-vehicle" value={form.vehicle} onChange={set("vehicle")} placeholder="e.g. 2024 Toyota Camry" />
            <Field label="VIN" id="sm-vin" value={form.vin} onChange={set("vin")} placeholder="17-character VIN" />
          </>} />
        </Panel>
        <Panel title="Storage Details">
          <Grid2 children={<>
            <Field label="Storage Facility Name" id="sm-facility" value={form.storageFacility} onChange={set("storageFacility")} placeholder="e.g. ABC Towing & Storage" />
            <Field label="Tow Date" id="sm-towdate" value={form.towDate} onChange={set("towDate")} type="date" />
          </>} />
          <div className="mt-3">
            <Field label="Storage Address" id="sm-addr" value={form.storageAddress} onChange={set("storageAddress")} placeholder="123 Main St, City, ST 00000" />
          </div>
          <Grid2 children={<>
            <Field label="Storage Phone" id="sm-phone" value={form.storagePhone} onChange={set("storagePhone")} placeholder="(xxx) xxx-xxxx" />
            <Field label="Daily Storage Rate ($)" id="sm-rate" value={form.dailyRate} onChange={set("dailyRate")} placeholder="e.g. 45.00" />
          </>} />
          <div className="mt-3 space-y-1">
            <Label className="text-xs font-semibold">Response Deadline (days)</Label>
            <Select value={form.deadline} onValueChange={set("deadline")}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["3","5","7","10"].map(v => <SelectItem key={v} value={v}>{v} business days</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </Panel>
        <Panel title="Handler Info">
          <Grid3>
            <HandlerSelect value={form.adjusterName} onChange={set("adjusterName")} label="Handler Name" id="sm-handler" />
            <Field label="Handler Phone" id="sm-hphone" value={form.adjusterPhone} onChange={set("adjusterPhone")} placeholder="(xxx) xxx-xxxx" />
            <Field label="Handler Email" id="sm-hemail" value={form.adjusterEmail} onChange={set("adjusterEmail")} placeholder="handler@drivewhip.com" />
          </Grid3>
        </Panel>
      </div>
      <PreviewPanel
        text={preview}
        onCopy={() => { navigator.clipboard.writeText(preview); toast.success("Copied"); }}
        onDownload={handleDownload}
      
        pdfUrl={previewPdfUrl}
      
        onPreview={handlePreviewOnly}/>
    </div>
  );
}

// ─── Tab: Certificate of Coverage ────────────────────────────────────────────
function CertOfCoverageTab({ initialState = "MD" }: { initialState?: string }) {
  const STATE_RULES: Record<string, {
    statute: string; stateName: string;
    bi_pp: string; bi_po: string; pd: string;
    pip: boolean; pip_limit?: string; pipWaiverAvailable?: boolean;
    um: boolean; uim: boolean;
  }> = {
    // MD: $30k/$60k BI, $15k PD, $2,500 PIP (waivable), UM/UIM required
    MD: { statute: "Maryland Transportation Article § 17-103", stateName: "Maryland", bi_pp: "$30,000", bi_po: "$60,000", pd: "$15,000", pip: true, pip_limit: "$2,500", pipWaiverAvailable: true, um: true, uim: true },
    // VA: $30k/$60k BI, $20k PD, no PIP, UM/UIM required
    VA: { statute: "Virginia Code § 38.2-2206", stateName: "Virginia", bi_pp: "$30,000", bi_po: "$60,000", pd: "$20,000", pip: false, um: true, uim: true },
    // PA: $15k/$30k BI, $5k PD, $5k PIP (first-party benefits), UM/UIM required
    PA: { statute: "75 Pa.C.S. § 1786", stateName: "Pennsylvania", bi_pp: "$15,000", bi_po: "$30,000", pd: "$5,000", pip: true, pip_limit: "$5,000", um: true, uim: true },
    // FL: No state-minimum BI requirement → apply MD BI limits ($30k/$60k); $10k PD; $10k PIP required; UM/UIM not required
    FL: { statute: "Florida Statutes § 627.736", stateName: "Florida", bi_pp: "$30,000", bi_po: "$60,000", pd: "$10,000", pip: true, pip_limit: "$10,000", um: false, uim: false },
    // IL: $25k/$50k BI, $20k PD, no PIP, UM/UIM required
    IL: { statute: "215 ILCS 5/7-317", stateName: "Illinois", bi_pp: "$25,000", bi_po: "$50,000", pd: "$20,000", pip: false, um: true, uim: true },
    // GA: $25k/$50k BI, $25k PD, no PIP, UM/UIM required
    GA: { statute: "O.C.G.A. § 33-7-11", stateName: "Georgia", bi_pp: "$25,000", bi_po: "$50,000", pd: "$25,000", pip: false, um: true, uim: true },
    // MA: $20k/$40k BI, $5k PD, $8k PIP required, UM/UIM required
    MA: { statute: "M.G.L. c. 175 § 113A", stateName: "Massachusetts", bi_pp: "$20,000", bi_po: "$40,000", pd: "$5,000", pip: true, pip_limit: "$8,000", um: true, uim: true },
    // TX: $30k/$60k BI, $25k PD, no PIP, UM/UIM optional
    TX: { statute: "Texas Insurance Code § 1952.101", stateName: "Texas", bi_pp: "$30,000", bi_po: "$60,000", pd: "$25,000", pip: false, um: true, uim: true },
  };

  const [form, setForm] = useState({
    memberName: "",
    claimNumber: "",
    dateOfLoss: "",
    vehicleYear: "",
    vehicleMake: "",
    vehicleModel: "",
    vin: "",
    licensePlate: "",
    policyNumber: "",
    effectiveDate: "",
    expirationDate: "",
    stateOfCoverage: initialState || "MD",
    pipWaived: true,
    certNumber: "",
    requestedBy: "",
    adjusterName: "",
  });
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [lookupClaim, setLookupClaim] = useState("");
  const [lookupEnabled, setLookupEnabled] = useState(false);
  const set = (k: keyof typeof form) => (v: string | boolean) => setForm(p => ({ ...p, [k]: v }));

  const claimLookupQuery = trpc.docgen.claimLookup.useQuery(
    { claimNumber: lookupClaim },
    { enabled: lookupEnabled && lookupClaim.trim().length > 0, retry: false }
  );
  useEffect(() => {
    if (!lookupEnabled) return;
    if (claimLookupQuery.isSuccess) {
      const data = claimLookupQuery.data;
      if (data) {
        setForm(p => ({
          ...p,
          memberName: data.memberName || p.memberName,
          dateOfLoss: data.dateOfLoss ? new Date(data.dateOfLoss).toISOString().split("T")[0] : p.dateOfLoss,
          stateOfCoverage: data.stateOfCoverage || p.stateOfCoverage,
        }));
        toast.success("Claim data loaded");
      } else {
        toast.error("No claim found for " + lookupClaim);
      }
      setLookupEnabled(false);
    }
    if (claimLookupQuery.isError) {
      setLookupEnabled(false);
      toast.error("Lookup failed");
    }
  }, [claimLookupQuery.isSuccess, claimLookupQuery.isError, lookupEnabled]);

  const rules = STATE_RULES[form.stateOfCoverage] || STATE_RULES["MD"];
  const vehicleDesc = [form.vehicleYear, form.vehicleMake, form.vehicleModel].filter(Boolean).join(" ") || "[Vehicle Year Make Model]";
  const certNum = form.certNumber || (form.stateOfCoverage + "000S0137");

  const handleDownload = (shouldDownload = true) => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
    const W = doc.internal.pageSize.getWidth(); // 216mm
    const H = doc.internal.pageSize.getHeight(); // 279mm

    // ── Header ──────────────────────────────────────────────────────────────
    // Transparent Klutch logo contained within the original 62 x 18mm box.
    try {
      doc.addImage(KLUTCH_LOGO_B64, "PNG", 4, 2, 18 * (1056 / 372), 18);
    } catch (_e) {
      doc.setFillColor(10, 20, 60);
      doc.rect(0, 0, 70, 22, "F");
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text("KLUTCH RISK RETENTION GROUP", 8, 10, { maxWidth: 62 });
    }

    // Title (center)
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("CERTIFICATE OF COVERAGE", W / 2, 10, { align: "center" });
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    doc.text("Issued by Klutch Risk Retention Group", W / 2, 15, { align: "center" });
    doc.text("Pursuant to " + rules.statute, W / 2, 19, { align: "center" });

    // Date / Cert # (right)
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("DATE (MM/DD/YYYY)", W - 14, 8, { align: "right" });
    doc.setFont("helvetica", "normal");
    const today = new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
    doc.text(today, W - 14, 13, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.text("CERTIFICATE NO.", W - 14, 18, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.text(certNum, W - 14, 22, { align: "right" });

    // ── Disclaimer box ───────────────────────────────────────────────────────
    let y = 26;
    doc.setFillColor(245, 245, 245);
    doc.rect(8, y, W - 16, 12, "F");
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);
    doc.rect(8, y, W - 16, 12);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(40, 40, 40);
    const disclaimer = "THIS CERTIFICATE IS ISSUED AS PROOF OF FINANCIAL RESPONSIBILITY PURSUANT TO " + rules.statute + ". IT DOES NOT AFFIRMATIVELY OR NEGATIVELY AMEND, EXTEND OR ALTER COVERAGE AFFORDED BY THE POLICY ISSUED BY KLUTCH RISK RETENTION GROUP. COVERAGE IS SUBJECT TO ALL TERMS, CONDITIONS, AND EXCLUSIONS OF THE POLICY.";
    const dLines = doc.splitTextToSize(disclaimer, W - 24);
    doc.text(dLines, 12, y + 4);
    y += 16;

    // ── Producer / Contact / Insurer grid ───────────────────────────────────
    const col1W = 70, col2W = 70, col3W = W - 16 - col1W - col2W;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.rect(8, y, col1W, 22);
    doc.rect(8 + col1W, y, col2W, 22);
    doc.rect(8 + col1W + col2W, y, col3W, 22);

    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(100, 100, 100);
    doc.text("PRODUCER / CARRIER", 10, y + 4);
    doc.text("CONTACT", 10 + col1W, y + 4);
    doc.text("INSURER(S) AFFORDING COVERAGE", 10 + col1W + col2W, y + 4);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text("Klutch Risk Retention Group", 10, y + 9);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text("424 Church Street, Suite 800", 10, y + 13);
    doc.text("Nashville, Tennessee 37219", 10, y + 17);
    doc.text("claims@klutchinsurance.com", 10, y + 21);

    doc.setFontSize(7.5);
    doc.text("EMAIL: claims@klutchinsurance.com", 10 + col1W, y + 9);
    doc.text("FAX: N/A", 10 + col1W, y + 13);
    doc.text("CERT NO: " + certNum, 10 + col1W, y + 17);

    doc.setFont("helvetica", "bold");
    doc.text("INSURER A: Klutch Risk Retention Group", 10 + col1W + col2W, y + 9);
    doc.setFont("helvetica", "normal");
    doc.text("CERT NO: " + certNum, 10 + col1W + col2W, y + 13);
    y += 26;

    // ── Named Insured box ────────────────────────────────────────────────────
    const niW = (W - 16) * 0.55;
    const cpW = (W - 16) - niW;
    doc.setDrawColor(0, 0, 0);
    doc.rect(8, y, niW, 20);
    doc.rect(8 + niW, y, cpW, 20);

    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(100, 100, 100);
    doc.text("NAMED INSURED", 10, y + 4);
    doc.text("COVERAGE PERIOD", 10 + niW, y + 4);

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("METROCARS LEASING CORP", 10, y + 9);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("Named Operator / Lessee: " + (form.memberName || "[Member Name]"), 10, y + 14);
    doc.text("Vehicle: " + vehicleDesc + (form.vin ? "  |  VIN: " + form.vin : ""), 10, y + 18);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    const effStr = form.effectiveDate ? new Date(form.effectiveDate + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "[Effective Date]";
    const expStr = form.expirationDate ? new Date(form.expirationDate + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "[Expiration Date]";
    doc.text(effStr + " — " + expStr, 10 + niW, y + 9);
    doc.setFont("helvetica", "bold");
    doc.text("STATE OF LOSS:", 10 + niW, y + 14);
    doc.setFont("helvetica", "normal");
    doc.text(rules.stateName, 10 + niW + 28, y + 14);
    y += 24;

    // ── Coverages header ─────────────────────────────────────────────────────
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("COVERAGES", 8, y);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    doc.text("CERTIFICATE NUMBER: " + certNum, W / 2, y, { align: "center" });
    y += 4;

    // Table header
    const tCols = [8, 18, 28, 80, 130, 160, 190, 220];
    doc.setFillColor(10, 20, 60);
    doc.rect(8, y - 3, W - 16, 8, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("INS", tCols[0] + 1, y + 1);
    doc.text("ADDL", tCols[1] + 1, y + 1);
    doc.text("SUBR WVD", tCols[2] + 1, y + 1);
    doc.text("TYPE OF INSURANCE", tCols[3], y + 1);
    doc.text("POLICY NUMBER", tCols[4], y + 1);
    doc.text("POLICY EFF", tCols[5], y + 1);
    doc.text("POLICY EXP", tCols[6], y + 1);
    doc.text("LIMITS", tCols[7], y + 1);
    y += 7;

    const effShort = form.effectiveDate ? form.effectiveDate.split("-").slice(1).concat(form.effectiveDate.split("-")[0]).join("/") : "[Eff]";
    const expShort = form.expirationDate ? form.expirationDate.split("-").slice(1).concat(form.expirationDate.split("-")[0]).join("/") : "[Exp]";
    const polNum = form.policyNumber || (form.stateOfCoverage + "000S0137");

    const coverageRows: Array<[string, string, string, string, string]> = [
      ["BI", "BODILY INJURY LIABILITY", polNum, rules.bi_pp + " PER PERSON / " + rules.bi_po + " PER OCCURRENCE", ""],
      ["PD", "PROPERTY DAMAGE LIABILITY", polNum, rules.pd + " PER OCCURRENCE", ""],
      ["UM", "UNINSURED MOTORIST (UM)", polNum, rules.bi_pp + " / " + rules.bi_po, ""],
      ["UIM", "UNDERINSURED MOTORIST (UIM)", polNum, rules.bi_pp + " / " + rules.bi_po, ""],
      ["PIP", "PERSONAL INJURY PROTECTION (PIP)", "—", rules.pip ? (form.pipWaived && rules.pipWaiverAvailable ? "WAIVED" : (rules.pip_limit || "INCLUDED")) : "N/A — NOT REQUIRED", ""],
      ["COL", "PHYSICAL DAMAGE — COLLISION", polNum, "SUBJECT TO MEMBER AGREEMENT — INCLUDED", ""],
      ["COMP", "PHYSICAL DAMAGE — COMPREHENSIVE", polNum, "SUBJECT TO MEMBER AGREEMENT — INCLUDED", ""],
    ];

    coverageRows.forEach(([code, label, pNum, limits], idx) => {
      if (idx % 2 === 0) {
        doc.setFillColor(248, 248, 252);
        doc.rect(8, y - 3, W - 16, 7, "F");
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(0, 0, 0);
      // Checkbox squares
      doc.setDrawColor(100, 100, 100);
      doc.rect(tCols[0] + 1, y - 2, 4, 4);
      doc.rect(tCols[1] + 1, y - 2, 4, 4);
      doc.rect(tCols[2] + 1, y - 2, 4, 4);
      // Check mark in INS column
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(10, 20, 60);
      doc.text("✓", tCols[0] + 1.5, y + 1.5);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(0, 0, 0);
      doc.text(code + " — " + label, tCols[3], y + 1);
      doc.setFont("helvetica", "normal");
      doc.text(pNum, tCols[4], y + 1);
      doc.text(effShort, tCols[5], y + 1);
      doc.text(expShort, tCols[6], y + 1);
      doc.setFont("helvetica", "bold");
      doc.text(limits, tCols[7], y + 1);
      y += 7;
    });

    y += 4;

    // ── Description of Operations ────────────────────────────────────────────
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(100, 100, 100);
    doc.text("DESCRIPTION OF OPERATIONS / LOCATIONS / VEHICLES / SPECIAL CONDITIONS", 8, y);
    y += 4;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    const descLines = [
      "1. This certificate is issued by Klutch Risk Retention Group to Metrocars Leasing Corp (named insured/vehicle owner). Coverage applies to the vehicle identified above when operated by the named operator under an active Membership Agreement.",
      "2. Certificate No: " + certNum + " issued pursuant to " + rules.statute + ".",
      "3. During any TNC period in which Uber/Lyft coverage is primary, this certificate provides contingent coverage only to the extent not covered by the TNC carrier.",
      "4. Unauthorized/unlisted operator exclusion applies.",
    ];
    descLines.forEach(line => {
      const wrapped = doc.splitTextToSize(line, W - 16);
      doc.text(wrapped, 8, y);
      y += wrapped.length * 3.5 + 1;
    });

    y += 2;

    // ── Bottom grid: Certificate Holder + Cancellation ───────────────────────
    const bhW = (W - 16) / 2;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.rect(8, y, bhW, 22);
    doc.rect(8 + bhW, y, bhW, 22);

    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(100, 100, 100);
    doc.text("CERTIFICATE HOLDER", 10, y + 4);
    doc.text("CANCELLATION", 10 + bhW, y + 4);

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Metrocars Leasing Corp", 10, y + 9);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text("P.O. Box 10622", 10, y + 13);
    doc.text("Rockville, MD 20850", 10, y + 17);
    if (form.requestedBy) doc.text("Requested By: " + form.requestedBy, 10, y + 21);

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    const cancelText = "SHOULD ANY OF THE ABOVE DESCRIBED COVERAGES BE CANCELLED BEFORE THE EXPIRATION DATE THEREOF, NOTICE WILL BE DELIVERED IN ACCORDANCE WITH APPLICABLE STATUTORY REQUIREMENTS AND THE TERMS OF THE MEMBER AGREEMENT.";
    const cancelLines = doc.splitTextToSize(cancelText, bhW - 8);
    doc.text(cancelLines, 10 + bhW, y + 9);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text("AUTHORIZED REPRESENTATIVE: KLUTCH RISK RETENTION GROUP", 10 + bhW, y + 20);

    // ── Footer ───────────────────────────────────────────────────────────────
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.line(8, H - 8, W - 8, H - 8);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text("Klutch Risk Retention Group  |  MD-" + certNum + "  |  424 Church Street, Suite 800, Nashville, Tennessee 37219", W / 2, H - 4, { align: "center" });

    setPreviewPdfUrl(getPDFDataUrl(doc));
    if (shouldDownload) downloadPDF(doc, `Klutch_COI_${form.memberName || "Member"}_${certNum}.pdf`);
  };

  const handlePreviewOnly = () => {
    // Simplest: just call handleDownload (it always sets previewPdfUrl)
    handleDownload();
  };

  const preview = `CERTIFICATE OF COVERAGE — Klutch Risk Retention Group
Pursuant to ${rules.statute}

Certificate No: ${certNum}
State: ${rules.stateName}

Named Insured: METROCARS LEASING CORP
Named Operator/Lessee: ${form.memberName || "[Member Name]"}
Vehicle: ${vehicleDesc}${form.vin ? " | VIN: " + form.vin : ""}
Coverage Period: ${form.effectiveDate || "[Eff]"} — ${form.expirationDate || "[Exp]"}

COVERAGES:
BI: ${rules.bi_pp} / ${rules.bi_po}
PD: ${rules.pd}
UM: ${rules.bi_pp} / ${rules.bi_po}
UIM: ${rules.bi_pp} / ${rules.bi_po}
PIP: ${rules.pip ? (form.pipWaived && rules.pipWaiverAvailable ? "WAIVED" : rules.pip_limit || "INCLUDED") : "N/A"}
COL: INCLUDED
COMP: INCLUDED`;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div>
        <div className="mb-4 flex items-center gap-2 p-3 rounded-lg border border-[#ff6221]/30 bg-[#ff6221]/5">
          <Search className="w-4 h-4 text-[#ff6221] shrink-0" />
          <input
            className="flex-1 h-8 rounded-md border border-input bg-background px-3 text-sm"
            placeholder="Enter claim # to auto-fill…"
            value={lookupClaim}
            onChange={e => { setLookupClaim(e.target.value); setLookupEnabled(false); }}
            onKeyDown={e => { if (e.key === "Enter") setLookupEnabled(true); }}
          />
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs bg-[#ff6221] hover:bg-[#e5541a] text-white"
            onClick={() => setLookupEnabled(true)}
            disabled={claimLookupQuery.isFetching || !lookupClaim.trim()}
          >
            {claimLookupQuery.isFetching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
            Load
          </Button>
        </div>
        <Panel title="Certificate Information" tag="REQUIRED">
          <Grid3>
            <Field label="Certificate Number" id="coc-cert" value={form.certNumber} onChange={set("certNumber")} placeholder="MD-00S0137" />
            <Field label="Policy Number" id="coc-pol" value={form.policyNumber} onChange={set("policyNumber")} placeholder={form.stateOfCoverage + "000S0137"} />
            <div>
              <label className="block text-xs font-medium text-foreground/70 mb-1">State of Coverage</label>
              <div className="flex flex-wrap gap-1 mt-1">
                {["MD", "VA", "PA", "FL", "IL", "GA", "MA", "TX"].map((s) => (
                  <button key={s} type="button" onClick={() => set("stateOfCoverage")(s)}
                    className={`px-2.5 py-0.5 rounded text-xs font-semibold border transition-colors ${form.stateOfCoverage === s ? "bg-[#ff6221] text-white border-[#ff6221]" : "bg-muted text-foreground border-border hover:border-[#ff6221]/50"}`}>
                    {s}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-amber-600 mt-1">Coverage is based on member&apos;s home market, not accident location.</p>
            </div>
          </Grid3>
          <div className="mt-3">
            <Grid3>
              <Field label="Effective Date" id="coc-eff" value={form.effectiveDate} onChange={set("effectiveDate")} type="date" />
              <Field label="Expiration Date" id="coc-exp" value={form.expirationDate} onChange={set("expirationDate")} type="date" />
              <Field label="Claim Number" id="coc-claim" value={form.claimNumber} onChange={set("claimNumber")} placeholder="e.g. PF438367" />
              <Field label="Date of Loss" id="coc-dol" value={form.dateOfLoss} onChange={set("dateOfLoss")} type="date" />
            </Grid3>
          </div>
          {rules.pip && rules.pipWaiverAvailable && (
            <div className="mt-3 flex items-center gap-2">
              <input type="checkbox" id="coc-pip-waived" checked={form.pipWaived as unknown as boolean} onChange={e => set("pipWaived")(e.target.checked as unknown as string)} className="h-4 w-4" />
              <label htmlFor="coc-pip-waived" className="text-sm">PIP Waived (member elected waiver)</label>
            </div>
          )}
        </Panel>
        <Panel title="Member / Named Operator">
          <Grid3>
            <Field label="Member Name" id="coc-member" value={form.memberName} onChange={set("memberName")} placeholder="First Last" required />
            <Field label="Requested By" id="coc-reqby" value={form.requestedBy} onChange={set("requestedBy")} placeholder="e.g. State Farm Insurance" />
            <HandlerSelect value={form.adjusterName} onChange={set("adjusterName")} label="Handler Name" id="coc-handler" />
          </Grid3>
        </Panel>
        <Panel title="Vehicle">
          <Grid3>
            <Field label="Year" id="coc-yr" value={form.vehicleYear} onChange={set("vehicleYear")} placeholder="2024" />
            <Field label="Make" id="coc-make" value={form.vehicleMake} onChange={set("vehicleMake")} placeholder="Toyota" />
            <Field label="Model" id="coc-model" value={form.vehicleModel} onChange={set("vehicleModel")} placeholder="Camry" />
            <Field label="VIN" id="coc-vin" value={form.vin} onChange={set("vin")} placeholder="17-character VIN" />
            <Field label="License Plate" id="coc-plate" value={form.licensePlate} onChange={set("licensePlate")} placeholder="e.g. ABC1234" />
          </Grid3>
        </Panel>
      </div>
      <PreviewPanel
        text={preview}
        onCopy={() => { navigator.clipboard.writeText(preview); toast.success("Copied"); }}
        onPreview={handlePreviewOnly}
        onDownload={handleDownload}
        filename={`Klutch_COI_${form.memberName || "Member"}_${certNum}.pdf`}
        pdfUrl={previewPdfUrl}
      />
    </div>
  );
}

// ─── Tab: Coverage Position — TNC Primary ────────────────────────────────────
function CoverageTNCTab() {
  const [form, setForm] = useState({
    carrier: "metrocars" as "metrocars" | "klutch",
    recipientName: "",
    claimNumber: "",
    dateOfLoss: "",
    vehicle: "",
    vin: "",
    driverName: "",
    tncPlatform: "Uber",
    tncPeriod: "2",
    tncCarrier: "",
    tncClaimNumber: "",
    tncContact: "",
    adjusterName: "",
    adjusterPhone: "",
    adjusterEmail: "",
  });
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const preview = `${today}

Re: Claim #${form.claimNumber || "[Claim Number]"}
Date of Loss: ${form.dateOfLoss || "[Date of Loss]"}
Vehicle: ${form.vehicle || "[Year Make Model]"}
VIN: ${form.vin || "[VIN]"}
Driver: ${form.driverName || "[Driver Name]"}

RE: Notice of TNC Primary Coverage

Dear ${form.recipientName || "[Recipient Name]"},

Whip Claims Management is providing notice of the above-referenced loss and our coverage position based on the information obtained during our investigation.

Our investigation confirms that, at the time of the loss, the driver was actively engaged in Transportation Network Company (TNC) activity through ${form.tncPlatform || "[Uber/Lyft]"} and was operating within TNC Period ${form.tncPeriod || "[Period]"}.

Based on the driver's TNC status at the time of loss, ${form.tncPlatform || "[Uber/Lyft]"}'s applicable TNC insurance coverage is primary for this loss. Accordingly, we are tendering the claim to the applicable TNC carrier for handling under its policy.

Platform: ${form.tncPlatform || "[Uber/Lyft]"}
Period: ${form.tncPeriod || "[Period]"}
Carrier: ${form.tncCarrier || "[TNC Carrier Name]"}
Claim Number: ${form.tncClaimNumber || "[TNC Claim Number]"}
Contact: ${form.tncContact || "[TNC Carrier Contact]"}

Please confirm receipt of this notice and acceptance of primary handling. If additional information or documentation is required to evaluate coverage, please advise us promptly.

Whip Claims Management will cooperate with the TNC carrier's investigation and provide relevant documentation in our possession upon request.

Nothing in this correspondence should be construed as a waiver of any rights, defenses, or coverage positions available to Whip Claims Management or any applicable party.

Sincerely,

${form.adjusterName || "[Adjuster Name]"}
Whip Claims Management
Phone: ${form.adjusterPhone || "[Adjuster Phone]"}
Email: ${form.adjusterEmail || "[claim email]"}`;

  const handleDownload = (shouldDownload = true) => {
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    const lm = 14, rm = W - 14, tw = W - 28;
    let y = 15;

    // ── Carrier logo letterhead ──
    if (form.carrier === "klutch") {
      try {
        doc.addImage(KLUTCH_LOGO_B64, "PNG", lm, y, 10 * (1056 / 372), 10);
      } catch { /* skip if logo fails */ }
      doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 100, 100);
      doc.text("Klutch Risk Retention Group", rm, y + 6, { align: "right" });
      doc.text("424 Church Street, Suite 800", rm, y + 11, { align: "right" });
      doc.text("Nashville, Tennessee 37219", rm, y + 16, { align: "right" });
    } else {
      try {
        doc.addImage(MCL_LOGO_B64, "PNG", lm, y, 45, 15);
      } catch { /* skip if logo fails */ }
      doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 100, 100);
      doc.text("Metrocars Leasing Corp.", rm, y + 5, { align: "right" });
      doc.text("P.O. Box 10622, Rockville, MD 20849", rm, y + 10, { align: "right" });
      doc.text("(855) 906-5949  |  claims@drivewhip.com", rm, y + 15, { align: "right" });
    }
    y += 28;
    // Single thin grey divider only (no thick navy line, no second title header)
    doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3); doc.line(lm, y, rm, y);
    y += 8;

    // ── Body ── (1.5 line spacing = 9pt * 1.5 = ~6.75mm, use 6.5)
    doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(60, 60, 60);
    y = wrapLetterText(doc, preview, lm, y, tw, 6.5);
    addSOLNotice(doc);
    addLetterFooter(doc);
    setPreviewPdfUrl(getPDFDataUrl(doc));
    if (shouldDownload) downloadPDF(doc, `Whip_CoveragePosition_${form.claimNumber || "Draft"}.pdf`);
  };
  const handlePreviewOnly = () => { handleDownload(false); };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div>
        <Panel title="Issuing Carrier">
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Letter Written From</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => set("carrier")("metrocars")}
                className={`flex items-center gap-2 p-2 rounded-md border text-xs font-medium transition-colors ${form.carrier === "metrocars" ? "border-[#171b31] bg-[#171b31]/10 text-[#171b31]" : "border-border bg-background text-muted-foreground hover:border-[#171b31]/50"}`}
              >
                <img src="/manus-storage/metrocars_logo_dark_5b624785.png" alt="MetroCars" className="h-5 object-contain" />
                <span>Metrocars Leasing</span>
              </button>
              <button
                type="button"
                onClick={() => set("carrier")("klutch")}
                className={`flex items-center gap-2 p-2 rounded-md border text-xs font-medium transition-colors ${form.carrier === "klutch" ? "border-[#1e3a5f] bg-[#1e3a5f]/10 text-[#1e3a5f]" : "border-border bg-background text-muted-foreground hover:border-[#1e3a5f]/50"}`}
              >
                <img src="/manus-storage/klutch-risk-retention-group-print_94cb75e0.png" alt="Klutch Risk Retention Group" className="h-5 object-contain" />
                <span>Klutch Insurance</span>
              </button>
            </div>
          </div>
        </Panel>
        <Panel title="Claim Details" tag="REQUIRED">
          <Grid3>
            <Field label="Recipient Name" id="tnc-recipient" value={form.recipientName} onChange={set("recipientName")} placeholder="Carrier / Claimant / Counsel" required />
            <Field label="Claim Number" id="tnc-claim" value={form.claimNumber} onChange={set("claimNumber")} placeholder="e.g. PF438367" />
            <Field label="Date of Loss" id="tnc-dol" value={form.dateOfLoss} onChange={set("dateOfLoss")} type="date" />
          </Grid3>
          <Grid3>
            <Field label="Vehicle (Year/Make/Model)" id="tnc-vehicle" value={form.vehicle} onChange={set("vehicle")} placeholder="e.g. 2024 Toyota Camry" />
            <Field label="VIN" id="tnc-vin" value={form.vin} onChange={set("vin")} placeholder="17-character VIN" />
            <Field label="Driver Name" id="tnc-driver" value={form.driverName} onChange={set("driverName")} placeholder="First Last" />
          </Grid3>
        </Panel>
        <Panel title="TNC Details">
          <Grid3>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">TNC Platform</Label>
              <Select value={form.tncPlatform} onValueChange={set("tncPlatform")}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Uber">Uber</SelectItem>
                  <SelectItem value="Lyft">Lyft</SelectItem>
                  <SelectItem value="Uber/Lyft">Uber/Lyft</SelectItem>
                  <SelectItem value="DoorDash">DoorDash</SelectItem>
                  <SelectItem value="Instacart">Instacart</SelectItem>
                  <SelectItem value="Amazon Flex">Amazon Flex</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">TNC Period</Label>
              <Select value={form.tncPeriod} onValueChange={set("tncPeriod")}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Period 1 (App On, No Ride)</SelectItem>
                  <SelectItem value="2">Period 2 (En Route to Pickup)</SelectItem>
                  <SelectItem value="3">Period 3 (Passenger Onboard)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Field label="TNC Carrier" id="tnc-carrier" value={form.tncCarrier} onChange={set("tncCarrier")} placeholder="e.g. James River Insurance" />
          </Grid3>
          <Grid2 children={<>
            <Field label="TNC Claim Number" id="tnc-tnclaim" value={form.tncClaimNumber} onChange={set("tncClaimNumber")} placeholder="TNC carrier claim #" />
            <Field label="TNC Carrier Contact" id="tnc-contact" value={form.tncContact} onChange={set("tncContact")} placeholder="Phone / Email" />
          </>} />
        </Panel>
        <Panel title="Handler Info">
          <Grid3>
            <HandlerSelect value={form.adjusterName} onChange={set("adjusterName")} label="Handler Name" id="tnc-handler" />
            <Field label="Handler Phone" id="tnc-phone" value={form.adjusterPhone} onChange={set("adjusterPhone")} placeholder="(xxx) xxx-xxxx" />
            <Field label="Handler Email" id="tnc-email" value={form.adjusterEmail} onChange={set("adjusterEmail")} placeholder="handler@drivewhip.com" />
          </Grid3>
        </Panel>
      </div>
      <PreviewPanel
        text={preview}
        onCopy={() => { navigator.clipboard.writeText(preview); toast.success("Copied"); }}
        onDownload={handleDownload}
      
        pdfUrl={previewPdfUrl}
      
        onPreview={handlePreviewOnly}/>
    </div>
  );
}

// ─── Tab: Denial & Acknowledgment ────────────────────────────────────────────
function DenialTab({ onNavigate, initialDraft, onDraftChange, initialTemplate }: { onNavigate?: (tab: DocGenTab) => void; initialDraft?: Record<string, unknown>; onDraftChange?: (draft: Record<string, unknown>) => void; initialTemplate?: string }) {
  const saved = initialDraft?.denialDraftVersion === "denial-v1" ? initialDraft : undefined;
  const savedText = (key: string, fallback = "") => typeof saved?.[key] === "string" ? saved[key] as string : fallback;
  const [selectedTemplate, setSelectedTemplate] = useState<string>(() => DENIAL_TEMPLATES[savedText("selectedTemplate")] ? savedText("selectedTemplate") : initialTemplate === UAD_DENIAL_TYPE ? UAD_DENIAL_TYPE : "tnc_pip");
  const [claimNumber, setClaimNumber] = useState(() => savedText("claimNumber"));
  const todayISO = new Date().toISOString().split("T")[0];
  const [letterDate, setLetterDate] = useState(() => savedText("letterDate", todayISO));
  const [dateOfLoss, setDateOfLoss] = useState(() => savedText("dateOfLoss"));
  const [vehicle, setVehicle] = useState(() => savedText("vehicle"));
  const [vin, setVin] = useState(() => savedText("vin"));
  const [driverName, setDriverName] = useState(() => savedText("driverName"));
  const [reference, setReference] = useState(() => savedText("reference"));
  const [fields, setFields] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(saved?.fields && typeof saved.fields === "object" ? saved.fields : {}).filter(([, value]) => typeof value === "string")) as Record<string, string>);
  const [uadFields, setUadFields] = useState(() => restoreUadDenialFields(saved?.uadFields));
  const [uadErrors, setUadErrors] = useState<string[]>([]);
  const isUad = selectedTemplate === UAD_DENIAL_TYPE;
  const draftData = useMemo(() => ({ denialDraftVersion: "denial-v1", selectedTemplate, claimNumber, letterDate, dateOfLoss, vehicle, vin, driverName, reference, fields, uadFields }), [selectedTemplate, claimNumber, letterDate, dateOfLoss, vehicle, vin, driverName, reference, fields, uadFields]);
  useEffect(() => { onDraftChange?.(draftData); }, [draftData, onDraftChange]);
  const pdfPreview = useFreshPdfPreview(JSON.stringify(draftData));
  const previewPdfUrl = pdfPreview.url;
  const setUadField = (key: UadDenialField, value: string) => { setUadFields(previous => ({ ...previous, [key]: value })); setUadErrors([]); };
  const selectTemplate = (key: string) => { pdfPreview.clear(); setSelectedTemplate(key); setUadErrors([]); };
  const resetUad = () => { pdfPreview.clear(); setUadFields(emptyUadDenialFields()); setUadErrors([]); };

  const template = DENIAL_TEMPLATES[selectedTemplate];
  const formatHeadingDate = (value: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "[Date]";
  const claimHeading = template ? `${formatHeadingDate(letterDate)}

Claim #${claimNumber || "[Claim Number]"}
Date of Loss: ${formatNorthAmericanLetterDate(dateOfLoss)}
Vehicle: ${vehicle || "[Year Make Model]"}
VIN: ${vin || "[VIN]"}
Driver: ${driverName || "[Driver Name]"}

RE: ${reference || template.label}` : "";

  const setField = (k: string) => (v: string) =>
    setFields((p) => ({ ...p, [k]: v }));

  const FIELD_LABELS: Record<string, { label: string; placeholder: string; type?: string }> = {
    recipient: { label: "Recipient Name", placeholder: "Member / Counsel / Carrier" },
    claimant: { label: "Claimant / Member Name", placeholder: "First Last" },
    dol: { label: "Date of Loss", placeholder: "", type: "date" },
    tnc: { label: "TNC Platform", placeholder: "e.g. Uber, Lyft" },
    period: { label: "TNC Period", placeholder: "e.g. 1, 2, or 3" },
    adjuster: { label: "Adjuster / Handler Name", placeholder: "e.g. Jane Smith" },
    phone: { label: "Handler Phone", placeholder: "(xxx) xxx-xxxx" },
    email: { label: "Handler Email", placeholder: "handler@drivewhip.com" },
    lease_date: { label: "Lease / Agreement Date", placeholder: "e.g. 01/15/2024" },
    tnc_carrier: { label: "TNC Carrier Name", placeholder: "e.g. James River Insurance" },
    tnc_claim: { label: "TNC Claim Number", placeholder: "TNC carrier claim #" },
    tnc_contact: { label: "TNC Carrier Contact", placeholder: "Phone / Email" },
    platform: { label: "Unauthorized Platform", placeholder: "e.g. Empower, Alto" },
  };

  const preview = isUad ? buildUadDenialText(uadFields) : template
    ? `${claimHeading}\n\n${template.build({ ...fields, dol: dateOfLoss })}`
    : "";

  const handleDownload = (shouldDownload = true) => {
    if (isUad) {
      const errors = shouldDownload ? validateUadDenialFields(uadFields) : [];
      if (errors.length) { setUadErrors(errors); toast.error("Complete the required UAD fields before final download. Partial drafts can still be previewed."); return; }
      try {
        const doc = createUadDenialPdf(uadFields, { logoBase64: WHIP_LOGO_B64, draft: !shouldDownload });
        pdfPreview.replace(doc.output("blob"));
        setUadErrors([]);
        if (shouldDownload) downloadPDF(doc, `Whip_UAD_Denial_${uadFields.claim_number.trim().replace(/[^a-zA-Z0-9_-]/g, "_") || "Draft"}.pdf`);
      } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to generate UAD denial."); }
      return;
    }
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    let y = addWhipLetterhead(doc);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(40, 40, 40);
    const body = template ? `${claimHeading}\n\n${template.build({ ...fields, dol: dateOfLoss })}` : "";
    y = wrapLetterText(doc, body, 14, y, W - 28, 6);
    addSOLNotice(doc);
    addLetterFooter(doc);
    pdfPreview.replace(doc.output("blob"));
    if (shouldDownload) downloadPDF(doc, `Whip_Denial_${claimNumber || "Draft"}.pdf`);
  };
  const handlePreviewOnly = () => { handleDownload(false); };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div>
        <Panel title="Select Denial Template" tag="REQUIRED">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {Object.entries(DENIAL_TEMPLATES).map(([key, t]) => {
              const isSelected = selectedTemplate === key;
              // Short labels for the card grid matching the screenshot
              const shortLabels: Record<string, { title: string; sub: string }> = {
                tnc_pip: { title: "TNC PIP Denial", sub: "Rideshare — PIP excluded" },
                no_pip_state: { title: "Non-Mandated State", sub: "PIP not required in state" },
                pip_waiver: { title: "PIP Waiver", sub: "Member waived PIP in agreement" },
                tnc_liability: { title: "TNC Liability Denial", sub: "TNC activity — PD & BI denied" },
                lor_ack: { title: "LOR — Acknowledge / Deny", sub: "Ack only or include denial language" },
                lor_ack_deny: { title: "LOR — Acknowledge / Deny", sub: "Ack only or include denial language" },
                empower_member: { title: "Empower Denial — Member", sub: "Empower TNC — member coverage denied" },
                empower_claimant: { title: "Empower Denial — Claimant", sub: "Empower TNC — claimant liability denied" },
                uad_denial: { title: "Unauthorized Driver / UAD Denial", sub: "Unauthorized driver — supplied coverage denial" },
              };
              const card = shortLabels[key] || { title: t.label, sub: t.hint };
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => selectTemplate(key)}
                  aria-pressed={isSelected}
                  className={`text-left p-3 rounded-lg border transition-all ${
                    isSelected
                      ? "border-[#ff6221] bg-[#ff6221]/5 shadow-sm"
                      : "border-border bg-card hover:border-[#ff6221]/40 hover:bg-muted/30"
                  }`}
                >
                  <div className={`text-xs font-bold leading-tight ${isSelected ? "text-[#ff6221]" : "text-foreground"}`}>{card.title}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{card.sub}</div>
                </button>
              );
            })}
          </div>
          {/* PIP Exhaustion quick-access cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-2">
            {[
              { id: "pip-exhaustion-fl", label: "PIP Exhaustion — FL", sub: "Florida §627.736 — benefits exhausted", tab: "pip-exhaustion" as DocGenTab },
              { id: "pip-exhaustion-pa", label: "Med Benefits Exhaustion — PA", sub: "Pennsylvania first-party medical", tab: "pip-exhaustion" as DocGenTab },
              { id: "pip-exhaustion-va", label: "PIP Exhaustion — VA", sub: "Virginia add-on PIP exhausted", tab: "pip-exhaustion" as DocGenTab },
            ].map(card => (
              <button
                key={card.id}
                type="button"
                onClick={() => onNavigate?.(card.tab)}
                className="text-left p-3 rounded-lg border border-border bg-card hover:border-[#171b31]/40 hover:bg-muted/30 transition-all"
              >
                <div className="text-xs font-bold leading-tight text-foreground">{card.label}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{card.sub}</div>
              </button>
            ))}
          </div>
          {template && (
            <div className="text-xs text-muted-foreground bg-muted/40 rounded p-2 border border-border/50 mt-3">
              <span className="font-semibold text-[#ff6221]">When to use:</span> {template.hint}
            </div>
          )}
        </Panel>
        {isUad ? <Panel title="Unauthorized Driver / UAD Letter Fields">
          <UadDenialFields fields={uadFields} onChange={setUadField} />
          <Button type="button" variant="outline" className="mt-3 h-8 text-xs" onClick={resetUad}><RotateCcw className="w-3 h-3 mr-1" />Reset UAD inputs</Button>
          {uadErrors.length > 0 && <div role="alert" className="mt-3 text-xs text-destructive"><ul className="list-disc pl-4">{uadErrors.map(error => <li key={error}>{error}</li>)}</ul></div>}
        </Panel> : <>
        <Panel title="Claim Details" tag="REQUIRED">
          <Grid2>
            <Field label="Letter Date" id="den-letter-date" value={letterDate} onChange={setLetterDate} type="date" />
            <Field label="Claim Number" id="den-claim" value={claimNumber} onChange={setClaimNumber} placeholder="e.g. PF438367" />
            <Field label="Date of Loss" id="den-dol" value={dateOfLoss} onChange={setDateOfLoss} type="date" />
            <Field label="Vehicle" id="den-vehicle" value={vehicle} onChange={setVehicle} placeholder="Year Make Model" />
            <Field label="VIN" id="den-vin" value={vin} onChange={setVin} placeholder="17-character VIN" />
            <Field label="Driver Name" id="den-driver" value={driverName} onChange={setDriverName} placeholder="First Last" />
            <Field label="Reference" id="den-reference" value={reference} onChange={setReference} placeholder="e.g. Notice of TNC PIP Denial" />
          </Grid2>
        </Panel>
        {template && (
          <Panel title="Template Fields">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {template.fields.filter((f) => f !== "dol").map((f) => {
                const meta = FIELD_LABELS[f];
                if (!meta) return null;
                return (
                  <Field
                    key={f}
                    label={meta.label}
                    id={`den-${f}`}
                    value={fields[f] || ""}
                    onChange={setField(f)}
                    placeholder={meta.placeholder}
                    type={meta.type}
                  />
                );
              })}
            </div>
          </Panel>
        )}
        </>}
      </div>
      <PreviewPanel
        key={selectedTemplate}
        text={preview}
        onCopy={() => { navigator.clipboard.writeText(preview); toast.success("Copied"); }}
        onDownload={handleDownload}
        allowPreviewDownload={!isUad || validateUadDenialFields(uadFields).length === 0}
        filename={isUad ? `Whip_UAD_Denial_${uadFields.claim_number || "Draft"}.pdf` : undefined}
        formattedPreview={isUad && !previewPdfUrl ? <UadDenialDraftPreview fields={uadFields} logoBase64={WHIP_LOGO_B64} /> : undefined}
        pdfUrl={previewPdfUrl}
        onPreview={handlePreviewOnly}/>
    </div>
  );
}

// ─── Tab: Damage Denial ───────────────────────────────────────────────────────
function DamageDenialTab() {
  const [form, setForm] = useState({
    recipientName: "",
    claimNumber: "",
    dateOfLoss: "",
    vehicle: "",
    vin: "",
    denialReason: "pre_existing",
    denialDetail: "",
    adjusterName: "",
    adjusterPhone: "",
    adjusterEmail: "",
  });
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const denialReasonLabels: Record<string, string> = {
    pre_existing: "Pre-Existing Damage",
    unrelated: "Damage Unrelated to Claimed Loss",
    no_coverage: "No Coverage for Claimed Damage Type",
    member_fault: "Member Responsibility / Policy Violation",
    fraud: "Suspected Fraud / Misrepresentation",
    other: "Other",
  };

  const denialReasonBody: Record<string, string> = {
    pre_existing: `Our investigation, including a review of pre-loss vehicle inspection records and photographic evidence, indicates that the damage claimed was pre-existing prior to the date of loss and was not caused by the reported incident.`,
    unrelated: `Our investigation has determined that the damage claimed is not consistent with the mechanics of the reported incident and appears to be unrelated to the subject loss.`,
    no_coverage: `The Vehicle Membership Agreement does not provide coverage for the type of damage claimed. Coverage is limited to losses arising from covered perils as defined in the applicable membership agreement.`,
    member_fault: `Our investigation has determined that the damage resulted from a violation of the Vehicle Membership Agreement. ${form.denialDetail || "[Describe violation]"}`,
    fraud: `Based on our investigation, we have identified material inconsistencies in the claim that raise concerns regarding the accuracy of the reported loss. We are unable to extend coverage at this time pending further investigation.`,
    other: form.denialDetail || "[Describe denial reason]",
  };

  const preview = `${today}

Re: Damage Denial — Claim #${form.claimNumber || "[Claim Number]"}
    Date of Loss: ${form.dateOfLoss || "[Date of Loss]"}
    Vehicle: ${form.vehicle || "[Vehicle]"} | VIN: ${form.vin || "[VIN]"}

Dear ${form.recipientName || "[Recipient Name]"},

We have completed our review of the above-referenced claim for property damage.

DENIAL BASIS: ${denialReasonLabels[form.denialReason] || form.denialReason}

${denialReasonBody[form.denialReason] || form.denialDetail || ""}

Accordingly, we are unable to extend coverage for the claimed damages.

This determination is based on the information currently available. We reserve all rights under the applicable membership agreement and applicable law. If you have additional information that you believe impacts this determination, please forward it to our office within 30 days of the date of this letter.

Sincerely,

${form.adjusterName || "[Adjuster Name]"}
Whip Claims Management
Phone: ${form.adjusterPhone || "(xxx) xxx-xxxx"}
Email: ${form.adjusterEmail || "claims@drivewhip.com"}`;

  const handleDownload = (shouldDownload = true) => {
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    let y = addWhipLetterhead(doc);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(40, 40, 40);
    y = wrapLetterText(doc, preview, 14, y, W - 28, 6);
    addSOLNotice(doc);
    addLetterFooter(doc);
    setPreviewPdfUrl(getPDFDataUrl(doc));
    if (shouldDownload) downloadPDF(doc, `Whip_DamageDenial_${form.claimNumber || "Draft"}.pdf`);
  };
  const handlePreviewOnly = () => { handleDownload(false); };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div>
        <Panel title="Claim Details" tag="REQUIRED">
          <Grid3>
            <Field label="Recipient Name" id="dd-recipient" value={form.recipientName} onChange={set("recipientName")} placeholder="Member / Carrier / Counsel" required />
            <Field label="Claim Number" id="dd-claim" value={form.claimNumber} onChange={set("claimNumber")} placeholder="e.g. PF438367" />
            <Field label="Date of Loss" id="dd-dol" value={form.dateOfLoss} onChange={set("dateOfLoss")} type="date" />
          </Grid3>
          <Grid2 children={<>
            <Field label="Vehicle (Year/Make/Model)" id="dd-vehicle" value={form.vehicle} onChange={set("vehicle")} placeholder="e.g. 2024 Toyota Camry" />
            <Field label="VIN" id="dd-vin" value={form.vin} onChange={set("vin")} placeholder="17-character VIN" />
          </>} />
        </Panel>
        <Panel title="Denial Basis">
          <div className="space-y-1 mb-3">
            <Label className="text-xs font-semibold">Denial Reason</Label>
            <Select value={form.denialReason} onValueChange={set("denialReason")}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(denialReasonLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(form.denialReason === "member_fault" || form.denialReason === "other") && (
            <TextareaField label="Detail / Explanation" id="dd-detail" value={form.denialDetail} onChange={set("denialDetail")} placeholder="Describe the specific reason for denial..." rows={4} />
          )}
        </Panel>
        <Panel title="Handler Info">
          <Grid3>
            <HandlerSelect value={form.adjusterName} onChange={set("adjusterName")} label="Handler Name" id="dd-handler" />
            <Field label="Handler Phone" id="dd-phone" value={form.adjusterPhone} onChange={set("adjusterPhone")} placeholder="(xxx) xxx-xxxx" />
            <Field label="Handler Email" id="dd-email" value={form.adjusterEmail} onChange={set("adjusterEmail")} placeholder="handler@drivewhip.com" />
          </Grid3>
        </Panel>
      </div>
      <PreviewPanel
        text={preview}
        onCopy={() => { navigator.clipboard.writeText(preview); toast.success("Copied"); }}
        onDownload={handleDownload}
      
        pdfUrl={previewPdfUrl}
      
        onPreview={handlePreviewOnly}/>
    </div>
  );
}

// ─── Tab: Reservation of Rights ───────────────────────────────────────────────
function RORTab() {
  const [form, setForm] = useState({
    memberName: "",
    claimNumber: "",
    dateOfLoss: "",
    vehicle: "",
    vin: "",
    location: "",
    handlerName: "",
    handlerPhone: "",
    handlerEmail: "",
    violationDetail: "",
  });
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, boolean>>({
    tnc: false,
    unauth: false,
    violation: false,
    investigation: false,
    coverage: false,
    fraud: false,
  });

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((p) => ({ ...p, [k]: v }));
  const toggleReason = (k: string) =>
    setReasons((p) => ({ ...p, [k]: !p[k] }));

  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const reasonTexts: Record<string, string> = {
    tnc: "TNC Platform Status / Period Confirmation: We are currently awaiting confirmation from the applicable Transportation Network Company (TNC) platform regarding the vehicle's status and active period at the time of loss. Coverage determinations are contingent upon this confirmation.",
    unauth: "Unauthorized Driver: Our investigation has raised questions regarding whether the operator of the vehicle at the time of loss was an authorized driver under the applicable Vehicle Membership Agreement. We are continuing to investigate this issue.",
    violation: `Membership / Policy Violation: Our investigation has identified a potential violation of the Vehicle Membership Agreement. ${form.violationDetail || "[Describe violation]"} We are continuing to evaluate the impact of this issue on coverage.`,
    investigation: "Ongoing Investigation: Our investigation of this claim is ongoing. We are reserving all rights pending the completion of our investigation and receipt of all relevant documentation.",
    coverage: "Coverage Analysis Pending: We are continuing to analyze the applicable coverage provisions of the Vehicle Membership Agreement as they relate to this claim. We reserve all rights under the agreement pending completion of this analysis.",
    fraud: "Potential Misrepresentation: Our investigation has identified potential inconsistencies in the reported facts of this claim. We are continuing to investigate and reserve all rights, including the right to deny coverage, if misrepresentation is established.",
  };

  const reasonLabels: Record<string, string> = {
    tnc: "TNC Period Disputed / Platform Status Unconfirmed",
    unauth: "Unauthorized Driver",
    violation: "Membership / Policy Violation",
    investigation: "Ongoing Investigation",
    coverage: "Coverage Analysis Pending",
    fraud: "Potential Misrepresentation / Fraud",
  };

  const selectedReasons = Object.entries(reasons)
    .filter(([, v]) => v)
    .map(([k]) => reasonTexts[k])
    .join("\n\n");

  const preview = `${today}

RESERVATION OF RIGHTS NOTICE

Re: Claim #${form.claimNumber || "[Claim Number]"}
    Date of Loss: ${form.dateOfLoss || "[Date of Loss]"}
    Vehicle: ${form.vehicle || "[Vehicle]"} | VIN: ${form.vin || "[VIN]"}
    Incident Location: ${form.location || "[Location]"}

Dear ${form.memberName || "[Member Name]"},

This letter is to advise you that Whip Claims Management / Metrocars Leasing Corp is conducting an investigation of the above-referenced claim. We are issuing this Reservation of Rights notice to advise you that we are reserving all rights under the applicable Vehicle Membership Agreement and applicable law, including but not limited to the right to deny coverage, while our investigation is ongoing.

RESERVATION BASIS:

${selectedReasons || "[Select reservation reasons above]"}

This notice does not constitute a waiver of any rights, defenses, or coverage positions available to Whip Claims Management / Metrocars Leasing Corp under the applicable Vehicle Membership Agreement or applicable law. We expressly reserve all such rights.

We will continue to investigate this claim and will advise you of our coverage determination upon completion of our investigation.

Please contact our office if you have any questions.

Sincerely,

${form.handlerName || "[Handler Name]"}
Whip Claims Management
Phone: ${form.handlerPhone || "(xxx) xxx-xxxx"}
Email: ${form.handlerEmail || "claims@drivewhip.com"}`;

  const handleDownload = (shouldDownload = true) => {
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    let y = addWhipLetterhead(doc);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(40, 40, 40);
    y = wrapLetterText(doc, preview, 14, y, W - 28, 6);
    addSOLNotice(doc);
    addLetterFooter(doc);
    setPreviewPdfUrl(getPDFDataUrl(doc));
    if (shouldDownload) downloadPDF(doc, `Whip_ROR_${form.claimNumber || "Draft"}.pdf`);
  };
  const handlePreviewOnly = () => { handleDownload(false); };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div>
        <Panel title="Claim Details" tag="REQUIRED">
          <Grid3>
            <Field label="Member Name" id="ror-member" value={form.memberName} onChange={set("memberName")} placeholder="First Last" required />
            <Field label="Claim Number" id="ror-claim" value={form.claimNumber} onChange={set("claimNumber")} placeholder="e.g. PF438367" />
            <Field label="Date of Loss" id="ror-dol" value={form.dateOfLoss} onChange={set("dateOfLoss")} type="date" />
          </Grid3>
          <Grid3 children={<>
            <Field label="Vehicle (Year/Make/Model)" id="ror-vehicle" value={form.vehicle} onChange={set("vehicle")} placeholder="e.g. 2024 Toyota Camry" />
            <Field label="VIN" id="ror-vin" value={form.vin} onChange={set("vin")} placeholder="17-character VIN" />
            <Field label="Incident Location" id="ror-location" value={form.location} onChange={set("location")} placeholder="City, State" />
          </>} />
        </Panel>
        <Panel title="Reservation Reasons">
          <div className="space-y-2">
            {Object.entries(reasonLabels).map(([k, label]) => (
              <label key={k} className="flex items-start gap-3 p-2.5 rounded-md border border-border/50 cursor-pointer hover:bg-muted/30 transition-colors">
                <Checkbox
                  checked={!!reasons[k]}
                  onCheckedChange={() => toggleReason(k)}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-xs font-semibold text-foreground">{label}</div>
                  {k === "violation" && reasons[k] && (
                    <Textarea
                      className="mt-2 text-xs h-16 resize-none"
                      placeholder="Describe the violation..."
                      value={form.violationDetail}
                      onChange={(e) => set("violationDetail")(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                </div>
              </label>
            ))}
          </div>
        </Panel>
        <Panel title="Handler Info">
          <Grid3>
            <HandlerSelect value={form.handlerName} onChange={set("handlerName")} label="Handler Name" id="ror-handler" />
            <Field label="Handler Phone" id="ror-phone" value={form.handlerPhone} onChange={set("handlerPhone")} placeholder="(xxx) xxx-xxxx" />
            <Field label="Handler Email" id="ror-email" value={form.handlerEmail} onChange={set("handlerEmail")} placeholder="handler@drivewhip.com" />
          </Grid3>
        </Panel>
      </div>
      <PreviewPanel
        text={preview}
        onCopy={() => { navigator.clipboard.writeText(preview); toast.success("Copied"); }}
        onDownload={handleDownload}
      
        pdfUrl={previewPdfUrl}
      
        onPreview={handlePreviewOnly}/>
    </div>
  );
}

// ─── Tab: General Release — BI ────────────────────────────────────────────────
function ReleaseBITab() {
  const WHIP_STATES = ["MD", "VA", "PA", "FL", "IL", "GA", "MA", "TX"];
  const [form, setForm] = useState({
    claimantName: "",
    claimNumber: "",
    dateOfLoss: "",
    vehicle: "",
    settlementAmount: "",
    adjusterName: "",
    recipientEmail: "",
    injuryDescription: "",
    additionalNotes: "",
    state: "MD",
    isMinor: false,
    minorGuardianName: "",
    isCarrierPayee: false,
    carrierName: "",
  });
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [aiValidating, setAiValidating] = useState(false);
  const emailMutation = trpc.docgen.generateSettlementEmail.useMutation();
  const validateMutation = trpc.docgen.validateReleaseLanguage.useMutation();

  const set = (k: keyof typeof form) => (v: string | boolean) =>
    setForm((p) => ({ ...p, [k]: v }));

  const today = new Date().toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });

  const releasorDescription = form.isMinor
    ? `${form.minorGuardianName || "[Parent/Guardian Name]"}, as parent and natural guardian of ${form.claimantName || "[Minor's Name]"}, a minor ("Claimant")`
    : `${form.claimantName || "[Claimant Full Name]"} ("Claimant")`;
  const releaseStateName = RELEASE_STATE_NAMES[form.state] || form.state || "[State]";

  const releaseText = [
    "GENERAL RELEASE OF ALL CLAIMS – BODILY INJURY",
    "",
    `KNOW ALL PERSONS BY THESE PRESENTS, that the undersigned, ${releasorDescription}, for and in consideration of the sum of $${form.settlementAmount || "[Settlement Amount]"}, the receipt and sufficiency of which is hereby acknowledged, does hereby release, acquit, and forever discharge Whip Inc., Metrocars Leasing Corp., Assurant LLC, and Whip Claims Management, and their respective members, drivers, agents, employees, officers, representatives, affiliates, successors and assigns (collectively, the "Releasees"), from any and all claims, demands, actions, causes of action, damages, costs, loss of services, expenses, and compensation of any kind whatsoever, whether known or unknown, anticipated or unanticipated, arising out of or in any way connected with the motor vehicle incident that occurred on or about ${formatReleaseDate(form.dateOfLoss)} (the "Incident"), and from any and all other claims of any kind or nature that Claimant has or may have against the Releasees as of the date of this Release.`,
    "",
    "This Release is intended to operate as a full, complete, and final settlement of all bodily injury claims and all other claims of any kind that Claimant has or may have against the Releasees as of the date of execution, including but not limited to past and future medical expenses, hospital, physician, therapy, and diagnostic services, pain and suffering, emotional distress, loss of earnings or earning capacity, loss of consortium, and any and all other damages of any kind, whether currently known or that may later be discovered. Claimant expressly waives any rights or benefits under any statute or common law principle that would otherwise limit the effect of this Release to claims known to exist at the time of execution.",
    "",
    "Claimant represents and warrants that all medical bills, liens, subrogation interests, and reimbursement claims, including but not limited to those of health insurers, Medicare, Medicaid, ERISA plans, hospitals, and medical providers related to the Incident, have been disclosed. Claimant agrees to satisfy and resolve any such liens or reimbursement obligations from the settlement proceeds and further agrees to indemnify, defend, and hold harmless the Releasees from any claim, demand, or action related to unpaid medical balances, liens, or reimbursement rights arising from the Incident or otherwise.",
    "",
    "It is understood and agreed that this settlement is the compromise of a disputed claim, and that the payment made is not to be construed as an admission of liability on the part of the Releasees, by whom liability is expressly denied.",
    "",
    "Claimant acknowledges that this is a general release intended to resolve all claims of any nature, known or unknown, that Claimant has or may have against the Releasees as of the date of execution, that Claimant has read this Release in its entirety, fully understands its terms, and has executed this Release voluntarily and with the opportunity to consult with counsel of Claimant's choosing.",
    "",
    `This Release shall be governed by and construed in accordance with the laws of the State of ${releaseStateName}.`,
  ].join("\n");

  const handleGenerateEmail = async () => {
    if (!form.claimantName || !form.claimNumber || !form.settlementAmount) {
      toast.error("Fill in Claimant Name, Claim Number, and Settlement Amount first");
      return;
    }
    setEmailLoading(true);
    try {
      const result = await emailMutation.mutateAsync({
        type: "bi",
        claimantName: form.claimantName,
        claimNumber: form.claimNumber,
        dateOfLoss: form.dateOfLoss,
        settlementAmount: form.settlementAmount,
        adjusterName: form.adjusterName,
        recipientEmail: form.recipientEmail,
        injuryDescription: form.injuryDescription,
        additionalNotes: form.additionalNotes,
      });
      setEmailDraft(result.email);
      toast.success("Settlement email generated");
    } catch (e: unknown) {
      toast.error((e as Error).message || "AI error");
    } finally {
      setEmailLoading(false);
    }
  };


  const handleDownload = (shouldDownload = true) => {
    const doc = new jsPDF();
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    writeReleaseText(doc, releaseText, {
      signerName: form.isMinor ? form.minorGuardianName || "[Parent/Guardian Name]" : form.claimantName || "[Claimant Full Name]",
      signerType: form.isMinor ? "guardian" : "claimant",
      minorName: form.claimantName || "[Minor's Name]",
    });
    // Releases are unbranded legal documents: no Whip letterhead, SOL notice, or footer.
    setPreviewPdfUrl(getPDFDataUrl(doc));
    if (shouldDownload) downloadPDF(doc, `Whip_Release_BI_${form.claimNumber || "Draft"}.pdf`);
  };
  const handlePreviewOnly = () => { handleDownload(false); };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div>
        <Panel title="Release Details" tag="REQUIRED">
          <Grid3>
            <Field label="Claimant Name" id="rbi-name" value={form.claimantName} onChange={set("claimantName")} placeholder="First Last" required />
            <Field label="Claim Number" id="rbi-claim" value={form.claimNumber} onChange={set("claimNumber")} placeholder="e.g. PF438367" />
            <Field label="Date of Loss" id="rbi-dol" value={form.dateOfLoss} onChange={set("dateOfLoss")} type="date" />
          </Grid3>
          <Grid2 children={<>
            <Field label="Vehicle (Year/Make/Model)" id="rbi-vehicle" value={form.vehicle} onChange={set("vehicle")} placeholder="e.g. 2024 Toyota Camry" />
            <Field label="Settlement Amount ($)" id="rbi-amount" value={form.settlementAmount} onChange={set("settlementAmount")} placeholder="e.g. 5000.00" required />
          </>} />
          <div className="mt-3">
            <Field label="Injury Description (for email)" id="rbi-injury" value={form.injuryDescription} onChange={set("injuryDescription")} placeholder="e.g. soft tissue injuries to neck and back" />
          </div>
        </Panel>
        <Panel title="State & Options">
          <div className="mb-3">
            <label className="block text-xs font-medium text-foreground/70 mb-1">State of Claim</label>
            <select
              value={form.state}
              onChange={(e) => set("state")(e.target.value)}
              className="w-full h-8 rounded-md border border-input bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {WHIP_STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {form.state === "GA" && (
            <div className="mb-3 flex items-start gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
              <Info className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-[11px] text-amber-700 dark:text-amber-400 leading-snug">
                <strong>Georgia claim detected.</strong> For GA claims where liability is limited to policy limits, use the <strong>Limited Liability Release — BI</strong> tab instead. It includes O.C.G.A. § 33-7-11 language and the Georgia-specific limited liability provision.
              </div>
            </div>
          )}
          <div className="space-y-2">
            <label className="flex items-center gap-3 cursor-pointer p-2.5 rounded-md border border-border/50 hover:bg-muted/30 transition-colors">
              <Checkbox checked={form.isMinor} onCheckedChange={(v) => set("isMinor")(!!v)} />
              <div>
                <div className="text-xs font-semibold">Minor Claimant</div>
                <div className="text-xs text-muted-foreground">Adds guardian signature block and minor court-approval notice</div>
              </div>
            </label>
            {form.isMinor && (
              <div className="ml-7">
                <Field label="Guardian / Parent Name" id="rbi-guardian" value={form.minorGuardianName} onChange={set("minorGuardianName")} placeholder="Guardian's full name" />
              </div>
            )}
          </div>
        </Panel>
        <Panel title="Handler Info">
          <Grid2>
            <HandlerSelect value={form.adjusterName} onChange={set("adjusterName")} label="Handler Name" id="rbi-handler" />
            <Field label="Recipient Email" id="rbi-email" value={form.recipientEmail} onChange={set("recipientEmail")} placeholder="attorney@lawfirm.com" />
          </Grid2>
        </Panel>
        <Panel title="AI Tools" tag="AI">
          <div className="flex gap-2 flex-wrap mb-3">
            <Button variant="outline" size="sm" className="gap-1.5 border-[#ff6221]/40 text-[#ff6221] hover:bg-[#ff6221]/10" onClick={handleGenerateEmail} disabled={emailLoading}>
              {emailLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
              {emailLoading ? "Generating..." : "Generate Email Draft"}
            </Button>
          </div>
          {emailDraft && (
            <div className="border border-border rounded-md overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b border-border">
                <Mail className="w-3.5 h-3.5 text-[#ff6221]" />
                <span className="text-xs font-semibold flex-1">Email Draft</span>
                <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs" onClick={() => { navigator.clipboard.writeText(emailDraft); toast.success("Copied"); }}>
                  <Copy className="w-3 h-3" /> Copy
                </Button>
                <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs text-[#ff6221]" onClick={handleGenerateEmail} disabled={emailLoading}>
                  <RefreshCw className="w-3 h-3" /> Regen
                </Button>
              </div>
              <pre className="p-3 text-xs font-mono whitespace-pre-wrap text-foreground/80 max-h-[300px] overflow-y-auto">{emailDraft}</pre>
            </div>
          )}
        </Panel>
      </div>
      <PreviewPanel
        text={releaseText}
        onCopy={() => { navigator.clipboard.writeText(releaseText); toast.success("Copied"); }}
        onDownload={handleDownload}
      
        pdfUrl={previewPdfUrl}
      
        onPreview={handlePreviewOnly}/>
    </div>
  );
}

// ─── Tab: General Release — PD ────────────────────────────────────────────────
function ReleasePDTab() {
  const WHIP_STATES = ["MD", "VA", "PA", "FL", "IL", "GA", "MA", "TX"];
  const [form, setForm] = useState({
    claimantName: "",
    claimNumber: "",
    dateOfLoss: "",
    vehicle: "",
    vin: "",
    settlementAmount: "",
    adjusterName: "",
    recipientEmail: "",
    damageDescription: "",
    additionalNotes: "",
    state: "MD",
    isMinor: false,
    minorGuardianName: "",
    isCarrierPayee: false,
    carrierName: "",
  });
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [aiValidating, setAiValidating] = useState(false);
  const emailMutation = trpc.docgen.generateSettlementEmail.useMutation();
  const validateMutation = trpc.docgen.validateReleaseLanguage.useMutation();

  const set = (k: keyof typeof form) => (v: string | boolean) =>
    setForm((p) => ({ ...p, [k]: v }));

  const today = new Date().toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });

  const signerName = form.isCarrierPayee ? form.carrierName || "[Carrier Name]" : form.isMinor ? form.minorGuardianName || "[Parent/Guardian Name]" : form.claimantName || "[Claimant Full Name]";
  const releasorDescription = form.isCarrierPayee
    ? `${signerName}, as authorized representative of the property-damage claimant ("Claimant")`
    : form.isMinor
      ? `${signerName}, as parent and natural guardian of ${form.claimantName || "[Minor's Name]"}, a minor ("Claimant")`
      : `${form.claimantName || "[Claimant Full Name]"} ("Claimant")`;
  const releaseText = buildPropertyDamageReleaseText({
    releasorDescription,
    settlementAmount: form.settlementAmount,
    dateOfLoss: form.dateOfLoss,
    state: form.state,
  });

  const handleGenerateEmail = async () => {
    if (!form.claimantName || !form.claimNumber || !form.settlementAmount) {
      toast.error("Fill in Claimant Name, Claim Number, and Settlement Amount first");
      return;
    }
    setEmailLoading(true);
    try {
      const result = await emailMutation.mutateAsync({
        type: "pd",
        claimantName: form.claimantName,
        claimNumber: form.claimNumber,
        dateOfLoss: form.dateOfLoss,
        settlementAmount: form.settlementAmount,
        adjusterName: form.adjusterName,
        recipientEmail: form.recipientEmail,
        injuryDescription: form.damageDescription,
        additionalNotes: form.additionalNotes,
      });
      setEmailDraft(result.email);
      toast.success("Settlement email generated");
    } catch (e: unknown) {
      toast.error((e as Error).message || "AI error");
    } finally {
      setEmailLoading(false);
    }
  };


  const handleDownload = (shouldDownload = true) => {
    const doc = new jsPDF();
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    writeReleaseText(doc, releaseText, {
      signerName,
      signerType: form.isMinor ? "guardian" : form.isCarrierPayee ? "carrier" : "claimant",
      minorName: form.claimantName || "[Minor's Name]",
    });
    // Releases are unbranded legal documents: no Whip letterhead, SOL notice, or footer.
    setPreviewPdfUrl(getPDFDataUrl(doc));
    if (shouldDownload) downloadPDF(doc, `Whip_Release_PD_${form.claimNumber || "Draft"}.pdf`);
  };
  const handlePreviewOnly = () => { handleDownload(false); };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div>
        <Panel title="Release Details" tag="REQUIRED">
          <Grid3>
            <Field label="Claimant Name" id="rpd-name" value={form.claimantName} onChange={set("claimantName")} placeholder="First Last" required />
            <Field label="Claim Number" id="rpd-claim" value={form.claimNumber} onChange={set("claimNumber")} placeholder="e.g. PF438367" />
            <Field label="Date of Loss" id="rpd-dol" value={form.dateOfLoss} onChange={set("dateOfLoss")} type="date" />
          </Grid3>
          <Grid3 children={<>
            <Field label="Vehicle (Year/Make/Model)" id="rpd-vehicle" value={form.vehicle} onChange={set("vehicle")} placeholder="e.g. 2024 Toyota Camry" />
            <Field label="VIN" id="rpd-vin" value={form.vin} onChange={set("vin")} placeholder="17-character VIN" />
            <Field label="Settlement Amount ($)" id="rpd-amount" value={form.settlementAmount} onChange={set("settlementAmount")} placeholder="e.g. 3500.00" required />
          </>} />
          <div className="mt-3">
            <Field label="Damage Description (for email)" id="rpd-damage" value={form.damageDescription} onChange={set("damageDescription")} placeholder="e.g. front-end collision damage" />
          </div>
        </Panel>
        <Panel title="State & Options">
          <div className="mb-3">
            <label className="block text-xs font-medium text-foreground/70 mb-1">State of Claim</label>
            <select
              value={form.state}
              onChange={(e) => set("state")(e.target.value)}
              className="w-full h-8 rounded-md border border-input bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {WHIP_STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-3 cursor-pointer p-2.5 rounded-md border border-border/50 hover:bg-muted/30 transition-colors">
              <Checkbox checked={form.isMinor} onCheckedChange={(v) => set("isMinor")(!!v)} />
              <div>
                <div className="text-xs font-semibold">Minor Claimant</div>
                <div className="text-xs text-muted-foreground">Adds guardian signature block and minor court-approval notice</div>
              </div>
            </label>
            {form.isMinor && (
              <div className="ml-7">
                <Field label="Guardian / Parent Name" id="rpd-guardian" value={form.minorGuardianName} onChange={set("minorGuardianName")} placeholder="Guardian's full name" />
              </div>
            )}
            <label className="flex items-center gap-3 cursor-pointer p-2.5 rounded-md border border-border/50 hover:bg-muted/30 transition-colors">
              <Checkbox checked={form.isCarrierPayee} onCheckedChange={(v) => set("isCarrierPayee")(!!v)} />
              <div>
                <div className="text-xs font-semibold">Payment Issued to Carrier</div>
                <div className="text-xs text-muted-foreground">Uses the carrier as the property-damage release payee and signer</div>
              </div>
            </label>
            {form.isCarrierPayee && (
              <div className="ml-7">
                <Field label="Carrier Name" id="rpd-carrier" value={form.carrierName} onChange={set("carrierName")} placeholder="Carrier's legal name" />
              </div>
            )}
          </div>
        </Panel>
        <Panel title="Handler Info">
          <Grid2>
            <HandlerSelect value={form.adjusterName} onChange={set("adjusterName")} label="Handler Name" id="rpd-handler" />
            <Field label="Recipient Email" id="rpd-email" value={form.recipientEmail} onChange={set("recipientEmail")} placeholder="claimant@email.com" />
          </Grid2>
        </Panel>
        <Panel title="AI Tools" tag="AI">
          <div className="flex gap-2 flex-wrap mb-3">
            <Button variant="outline" size="sm" className="gap-1.5 border-[#ff6221]/40 text-[#ff6221] hover:bg-[#ff6221]/10" onClick={handleGenerateEmail} disabled={emailLoading}>
              {emailLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
              {emailLoading ? "Generating..." : "Generate Email Draft"}
            </Button>
          </div>
          {emailDraft && (
            <div className="border border-border rounded-md overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b border-border">
                <Mail className="w-3.5 h-3.5 text-[#ff6221]" />
                <span className="text-xs font-semibold flex-1">Email Draft</span>
                <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs" onClick={() => { navigator.clipboard.writeText(emailDraft); toast.success("Copied"); }}>
                  <Copy className="w-3 h-3" /> Copy
                </Button>
                <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs text-[#ff6221]" onClick={handleGenerateEmail} disabled={emailLoading}>
                  <RefreshCw className="w-3 h-3" /> Regen
                </Button>
              </div>
              <pre className="p-3 text-xs font-mono whitespace-pre-wrap text-foreground/80 max-h-[300px] overflow-y-auto">{emailDraft}</pre>
            </div>
          )}
        </Panel>
      </div>
      <PreviewPanel
        text={releaseText}
        onCopy={() => { navigator.clipboard.writeText(releaseText); toast.success("Copied"); }}
        onDownload={handleDownload}
      
        pdfUrl={previewPdfUrl}
      
        onPreview={handlePreviewOnly}/>
    </div>
  );
}

// ─── Tab: TL Settlement & Release ─────────────────────────────────────────────
function TLSettlementTab() {
  const WHIP_STATES = ["MD", "VA", "PA", "FL", "IL", "GA", "MA", "TX"];
  const [form, setForm] = useState({
    claimantName: "",
    claimantAddress: "",
    claimNumber: "",
    dateOfLoss: "",
    vehicle: "",
    vin: "",
    market: "MD",
    acv: "",
    storage: "",
    adminFee: "",
    salesTax: "",
    titleRegFees: "",
    tearDown: "",
    salvageDeducted: "",
    priorPayment: "",
    lienHolder: "",
    lienPayoff: "",
    storageDeducted: "",
    rentalCutoffDate: "",
    adjusterName: "",
    additionalNotes: "",
    settlementOpening: "",
    settlementClosing: "",
  });
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [releasePreviewPdfUrl, setReleasePreviewPdfUrl] = useState<string | null>(null);
  const [activeOutput, setActiveOutput] = useState<"settlement" | "release">("settlement");
  const [otherDeductions, setOtherDeductions] = useState<{label: string; amount: string}[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [cccFile, setCccFile] = useState<File | null>(null);
  const [cccParsing, setCccParsing] = useState(false);
  const [cccSummary, setCccSummary] = useState<{
    reportReference: string;
    baseVehicleValue: string;
    priorDamage: string;
    adjustedVehicleValue: string;
    taxRateLabel: string;
    salesTax: string;
    titleRegFees: string;
    salvageDeducted: string;
    cccTotal: string;
  } | null>(null);
  const aiMutation = trpc.docgen.generateTLSettlementLetter.useMutation();
  const parseCccValuationMutation = trpc.docgen.parseCccValuation.useMutation();

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const parseCccValuation = async (file = cccFile) => {
    if (!file) { toast.error("Choose a CCC valuation PDF first"); return; }
    if (file.type && file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
      toast.error("Upload a CCC valuation PDF");
      return;
    }
    setCccFile(file);
    setCccParsing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const upload = await fetch("/api/upload/document", { method: "POST", body: fd });
      const payload = await upload.json().catch(() => ({})) as { url?: string; signedUrl?: string; key?: string; error?: string };
      if (!upload.ok) throw new Error(payload.error || `Upload failed: ${file.name}`);
      const fileUrl = payload.signedUrl || payload.url;
      if (!fileUrl || !payload.key || !/^https?:\/\//i.test(fileUrl)) throw new Error("Upload did not return a readable CCC document");
      const parsed = await parseCccValuationMutation.mutateAsync({
        fileUrl,
        fileName: file.name,
        storageKey: payload.key,
        mimeType: file.type || "application/pdf",
      });
      setForm((p) => ({
        ...p,
        claimantName: parsed.claimantName || p.claimantName,
        claimantAddress: parsed.claimantAddress || p.claimantAddress,
        claimNumber: parsed.claimNumber || p.claimNumber,
        dateOfLoss: parsed.dateOfLoss || p.dateOfLoss,
        vehicle: parsed.vehicle || p.vehicle,
        vin: parsed.vin || p.vin,
        market: parsed.market || p.market,
        // CCC's Adjusted Vehicle Value already includes condition/prior-damage adjustments.
        // It is the ACV for this settlement; do not deduct Prior Damage again.
        acv: parsed.adjustedVehicleValue || p.acv,
        salesTax: parsed.salesTax || p.salesTax,
        titleRegFees: parsed.titleRegFees || p.titleRegFees,
        salvageDeducted: parsed.salvageDeducted || p.salvageDeducted,
      }));
      setCccSummary({
        reportReference: parsed.reportReference,
        baseVehicleValue: parsed.baseVehicleValue,
        priorDamage: parsed.priorDamage,
        adjustedVehicleValue: parsed.adjustedVehicleValue,
        taxRateLabel: parsed.taxRateLabel,
        salesTax: parsed.salesTax,
        titleRegFees: parsed.titleRegFees,
        salvageDeducted: parsed.salvageDeducted,
        cccTotal: parsed.cccTotal,
      });
      toast.success(`CCC valuation applied${parsed.cccTotal ? ` — reported total $${parsed.cccTotal}` : ""}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read the CCC valuation");
    } finally {
      setCccParsing(false);
    }
  };

  const netAmount = (() => {
    const acv = parseFloat(form.acv) || 0;
    const storage = parseFloat(form.storage) || 0;
    const adminFee = parseFloat(form.adminFee) || 0;
    const salesTax = parseFloat(form.salesTax) || 0;
    const titleRegFees = parseFloat(form.titleRegFees) || 0;
    const tearDown = parseFloat(form.tearDown) || 0;
    const salvage = parseFloat(form.salvageDeducted) || 0;
    const prior = parseFloat(form.priorPayment) || 0;
    const lien = parseFloat(form.lienPayoff) || 0;
    const storageDeducted = parseFloat(form.storageDeducted) || 0;
    const other = otherDeductions.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);
    const net = acv + storage + adminFee + salesTax + titleRegFees + tearDown - salvage - prior - lien - storageDeducted - other;
    return net > 0 ? net.toFixed(2) : "0.00";
  })();

  const today = new Date().toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });

  const deductionLines = [];
  if (form.priorPayment && parseFloat(form.priorPayment) > 0) deductionLines.push(`Less: Prior Payment to Claimant:          ($${parseFloat(form.priorPayment).toFixed(2)})`);
  if (form.lienHolder && form.lienPayoff && parseFloat(form.lienPayoff) > 0) deductionLines.push(`Less: Loan Payoff — ${form.lienHolder}:  ($${parseFloat(form.lienPayoff).toFixed(2)})`);
  if (form.storageDeducted && parseFloat(form.storageDeducted) > 0) deductionLines.push(`Less: Storage — Reasonable & Customary:   ($${parseFloat(form.storageDeducted).toFixed(2)})`);
  for (const d of otherDeductions) if (d.label && d.amount && parseFloat(d.amount) > 0) deductionLines.push(`Less: ${d.label}:  ($${parseFloat(d.amount).toFixed(2)})`);

  const damageRows = [
    { label: "Vehicle Valuation (ACV)", amount: parseFloat(form.acv) || 0, required: true },
    { label: "Sales Tax", amount: parseFloat(form.salesTax) || 0 },
    { label: "Title & Registration Fees", amount: parseFloat(form.titleRegFees) || 0 },
    { label: "Admin Fee", amount: parseFloat(form.adminFee) || 0 },
    { label: "Tear Down", amount: parseFloat(form.tearDown) || 0 },
    { label: "Storage", amount: parseFloat(form.storage) || 0 },
    { label: "Salvage (deducted)", amount: parseFloat(form.salvageDeducted) || 0, deducted: true },
  ];
  const visibleDamageRows = damageRows.filter((row) => row.required || row.amount > 0);
  const formatSettlementAmount = (amount: number, deducted = false) =>
    deducted ? `($${amount.toFixed(2)})` : `$${amount.toFixed(2)}`;
  const itemizationPreview = [
    "ITEMIZATION OF DAMAGES",
    ...visibleDamageRows.map((row) => `${row.label}: ${formatSettlementAmount(row.amount, row.deducted)}`),
    ...deductionLines,
    `Total: $${netAmount}`,
  ].join("\n");
  const claimantReleaseText = buildPropertyDamageReleaseText({
    releasorDescription: `${form.claimantName || "[Claimant Full Name]"} ("Claimant")`,
    settlementAmount: netAmount,
    dateOfLoss: form.dateOfLoss,
    state: form.market,
  });

  const preview = [
    "TOTAL LOSS SETTLEMENT OFFER",
    `Claim #: ${form.claimNumber || "[Claim Number]"}`,
    `Date: ${today}`,
    "",
    `Claimant: ${form.claimantName || "[Claimant Name]"}`,
    `Date of Loss: ${form.dateOfLoss || "[Date of Loss]"}`,
    `Vehicle: ${form.vehicle || "[Vehicle]"} | VIN: ${form.vin || "[VIN]"}`,
    `Market: ${form.market}`,
    "",
    itemizationPreview,
    ...(form.lienHolder && form.lienPayoff ? [`Loan Payoff — ${form.lienHolder}:  $${parseFloat(form.lienPayoff).toFixed(2)}`] : []),
    "",
    ...(form.rentalCutoffDate ? [`Rental Review Cutoff: ${form.rentalCutoffDate}`, ""] : []),
    ...(form.additionalNotes ? [`Notes: ${form.additionalNotes}`, ""] : []),
    "Prepared by:",
    form.adjusterName || "[Handler Name]",
    "Whip Claims Management",
  ].join("\n");

  const handleGenerateLetter = async () => {
    if (!form.claimantName || !form.claimNumber || !form.acv) {
      toast.error("Fill in Claimant Name, Claim Number, and ACV first");
      return;
    }
    setAiLoading(true);
    try {
      const result = await aiMutation.mutateAsync({
        claimantName: form.claimantName,
        claimNumber: form.claimNumber,
        dateOfLoss: form.dateOfLoss,
        vehicle: form.vehicle,
        vin: form.vin,
        market: form.market,
        acv: form.acv,
        priorPayment: form.priorPayment,
        lienHolder: form.lienHolder,
        lienPayoff: form.lienPayoff,
        storageDeducted: form.storageDeducted,
        storage: form.storage,
        adminFee: form.adminFee,
        salesTax: form.salesTax,
        titleRegFees: form.titleRegFees,
        tearDown: form.tearDown,
        salvageDeducted: form.salvageDeducted,
        otherDeductions: otherDeductions.filter(d => d.label && d.amount),
        netAmount,
        adjusterName: form.adjusterName,
        rentalCutoffDate: form.rentalCutoffDate,
        additionalNotes: form.additionalNotes,
      });
      setForm((current) => ({ ...current, settlementOpening: result.letter }));
      toast.success("Editable settlement language added");
    } catch (e: unknown) {
      toast.error((e as Error).message || "AI error");
    } finally {
      setAiLoading(false);
    }
  };

  const handleDownload = (shouldDownload = true) => {
    if (!form.claimantName || !form.claimNumber || !form.acv) {
      toast.error("Fill in Claimant Name, Claim Number, and ACV first");
      return;
    }
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const left = 14;
    const right = W - 14;
    const bottom = H - 20;
    let y = addWhipLetterhead(doc);
    doc.setTextColor(35, 35, 35);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.2);

    const nextPage = () => {
      addLetterFooter(doc);
      doc.addPage();
      y = addWhipLetterhead(doc);
      doc.setTextColor(35, 35, 35);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.2);
    };
    const ensure = (needed: number) => {
      if (y + needed > bottom) nextPage();
    };
    const paragraph = (text: string, after = 4) => {
      if (!text.trim()) return;
      const lines = doc.splitTextToSize(text.trim(), right - left) as string[];
      ensure(lines.length * 4.65 + after);
      doc.text(lines, left, y, { lineHeightFactor: 1.12 });
      y += lines.length * 4.65 + after;
    };
    const fieldLine = (label: string, value: string) => {
      ensure(5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(95, 95, 95);
      doc.text(label, left, y);
      doc.setTextColor(25, 25, 25);
      doc.text(value || "—", left + 31, y);
      y += 5;
    };
    const firstName = form.claimantName.split(/\s+/)[0] || form.claimantName;
    const todayStr = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    paragraph(todayStr, 6);
    paragraph(form.claimantName, 1);
    for (const addressLine of form.claimantAddress.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)) paragraph(addressLine, 1);
    y += 3;
    fieldLine("Our claim no.", form.claimNumber);
    fieldLine("Date of loss", formatReleaseDate(form.dateOfLoss));
    fieldLine("Vehicle", form.vehicle);
    fieldLine("VIN", form.vin);
    y += 3;
    paragraph(`Dear ${firstName},`, 6);

    const defaultOpening = `Your ${form.vehicle || "vehicle"} has been determined to be a total loss. The valuation materials supporting our evaluation are enclosed for your review.`;
    paragraph(form.settlementOpening || defaultOpening, 5);

    const settlementRows: Array<{ label: string; amount: number; deducted?: boolean; required?: boolean }> = [
      { label: "Vehicle valuation", amount: parseFloat(form.acv) || 0, required: true },
      { label: "Vehicular / sales tax", amount: parseFloat(form.salesTax) || 0 },
      { label: "Transfer, title & registration fees", amount: parseFloat(form.titleRegFees) || 0 },
      { label: "Administration fee", amount: parseFloat(form.adminFee) || 0 },
      { label: "Tear-down charge", amount: parseFloat(form.tearDown) || 0 },
      { label: "Storage", amount: parseFloat(form.storage) || 0 },
      { label: "Salvage", amount: parseFloat(form.salvageDeducted) || 0, deducted: true },
      { label: "Prior payment to claimant", amount: parseFloat(form.priorPayment) || 0, deducted: true },
      { label: form.lienHolder ? `Loan payoff — ${form.lienHolder}` : "Loan payoff", amount: parseFloat(form.lienPayoff) || 0, deducted: Boolean(form.lienPayoff) },
      { label: "Disallowed storage", amount: parseFloat(form.storageDeducted) || 0, deducted: true },
      ...otherDeductions.filter((deduction) => deduction.label && Number(deduction.amount) > 0).map((deduction) => ({ label: deduction.label, amount: Number(deduction.amount), deducted: true })),
    ].filter((row) => row.required || row.amount > 0);

    ensure(13 + settlementRows.length * 5.6);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.6);
    doc.text("SETTLEMENT BREAKDOWN", left, y);
    y += 3;
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.25);
    doc.line(left, y, right, y);
    y += 5;
    const settlementRow = (label: string, amount: number, deducted = false, emphasized = false) => {
      doc.setFont("helvetica", emphasized ? "bold" : "normal");
      doc.setFontSize(9.2);
      doc.setTextColor(25, 25, 25);
      doc.text(label, left, y);
      doc.setFont("helvetica", emphasized ? "bold" : "normal");
      doc.text(`${deducted ? "(" : ""}$${amount.toFixed(2)}${deducted ? ")" : ""}`, right, y, { align: "right" });
      y += 5.5;
    };
    settlementRows.forEach((row) => settlementRow(row.label, row.amount, Boolean(row.deducted)));
    doc.setDrawColor(80, 80, 80);
    doc.setLineWidth(0.35);
    doc.line(left, y - 1.5, right, y - 1.5);
    y += 3;
    settlementRow("Actual cash value / amount tendered", Number(netAmount), false, true);
    y += 1.5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.2);

    const standardTender = form.lienHolder && parseFloat(form.lienPayoff) > 0
      ? `A loan payoff of $${parseFloat(form.lienPayoff).toFixed(2)} will be issued directly to ${form.lienHolder}. The remaining $${netAmount} will be issued to you after the required settlement documents are received and reviewed.`
      : `The actual cash value of your vehicle is $${netAmount}, and we are tendering that amount in settlement of your property damage claim. Payment will be issued directly to you after the required settlement documents are received and reviewed.`;
    paragraph(standardTender, 4);
    if (form.rentalCutoffDate) {
      paragraph(`Rental reimbursement is reviewed separately. Charges incurred through ${formatReleaseDate(form.rentalCutoffDate)} may be considered upon receipt of supporting documentation; later charges remain subject to review.`, 4);
    }
    paragraph(form.settlementClosing || "To accept this settlement, sign below and return this letter together with the enclosed General Release of All Claims. The valuation materials are enclosed for your records. Please contact the undersigned with any questions.", 5);

    ensure(42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.6);
    doc.text("SETTLEMENT ACCEPTANCE", left, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.2);
    paragraph(`I accept the total loss settlement of $${netAmount}, payable as described above, in full and final resolution of my property damage claims arising from this loss.`, 8);
    ensure(21);
    const signatureEnd = left + 88;
    const dateX = right - 76;
    doc.setDrawColor(65, 65, 65);
    doc.setLineWidth(0.2);
    doc.line(left, y, signatureEnd, y);
    doc.line(dateX, y, right, y);
    doc.setFontSize(7.6);
    doc.text("Signature", left, y + 4);
    doc.text("Date", dateX, y + 4);
    y += 12;
    doc.line(left, y, signatureEnd, y);
    doc.text("Printed Name", left, y + 4);
    addLetterFooter(doc);
    setPreviewPdfUrl(getPDFDataUrl(doc));
    setActiveOutput("settlement");
    if (shouldDownload) downloadPDF(doc, `Whip_TLSettlement_${form.claimNumber || "Draft"}.pdf`);
  };
  const handleClaimantRelease = (shouldDownload = true) => {
    if (!form.claimantName || !form.dateOfLoss || !form.acv) {
      toast.error("Fill in Claimant Name, Date of Loss, and the settlement calculation first");
      return;
    }
    const doc = new jsPDF();
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    writeReleaseText(doc, claimantReleaseText, {
      signerName: form.claimantName,
      signerType: "claimant",
    });
    setReleasePreviewPdfUrl(getPDFDataUrl(doc));
    setActiveOutput("release");
    if (shouldDownload) downloadPDF(doc, `Whip_TLClaimantRelease_${form.claimNumber || "Draft"}.pdf`);
  };
  const handlePreviewOnly = () => { handleDownload(false); };
  const activeOutputText = activeOutput === "release"
    ? claimantReleaseText
    : preview;
  const activeOutputPdfUrl = activeOutput === "release" ? releasePreviewPdfUrl : previewPdfUrl;
  const handleActiveOutput = (shouldDownload = true) => {
    if (activeOutput === "release") handleClaimantRelease(shouldDownload);
    else handleDownload(shouldDownload);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div>
        <Panel title="CCC Market Valuation" tag="CLAIMANT SETTLEMENT">
          <section
            aria-label="CCC valuation upload and prefill"
            className="rounded-lg border border-dashed border-foreground/25 bg-muted/20 px-4 py-4 transition-colors hover:border-foreground/45"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files?.[0]; if (file) void parseCccValuation(file); }}
          >
            <input id="tls-ccc-upload" type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) setCccFile(file); }} />
            <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><Upload className="h-4 w-4" /> CCC valuation PDF</div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Upload a CCC ONE Market Valuation PDF to prefill key claimant and settlement values. Review before issuance.</p>
                {cccFile && <p className="mt-1 truncate text-[11px] font-medium text-foreground/75">Selected: {cccFile.name}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <label htmlFor="tls-ccc-upload" className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted">
                  <Upload className="h-3.5 w-3.5" /> {cccFile ? "Replace" : "Choose PDF"}
                </label>
                <Button type="button" size="sm" className="h-9 bg-[#171b31] text-xs text-white hover:bg-[#171b31]/90" disabled={!cccFile || cccParsing} onClick={() => void parseCccValuation()}>
                  {cccParsing ? <RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin" /> : <FileCheck className="mr-1 h-3.5 w-3.5" />}
                  {cccParsing ? "Reading CCC…" : "Read & pre-fill"}
                </Button>
              </div>
            </div>
          </section>
          {cccSummary && (
            <div className="mt-3 rounded-md border border-border bg-background p-3 text-xs">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold text-foreground">CCC report values applied{cccSummary.reportReference ? ` · Ref. ${cccSummary.reportReference}` : ""}</span>
                <span className={`font-semibold ${cccSummary.cccTotal && cccSummary.cccTotal === netAmount ? "text-emerald-700" : "text-foreground"}`}>
                  CCC total {cccSummary.cccTotal ? `$${cccSummary.cccTotal}` : "—"} · settlement total ${netAmount}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground sm:grid-cols-5">
                <span>Base: <strong className="text-foreground">{cccSummary.baseVehicleValue ? `$${cccSummary.baseVehicleValue}` : "—"}</strong></span>
                <span>Prior damage: <strong className="text-foreground">{cccSummary.priorDamage ? `($${cccSummary.priorDamage})` : "—"}</strong></span>
                <span>Adjusted ACV: <strong className="text-foreground">{cccSummary.adjustedVehicleValue ? `$${cccSummary.adjustedVehicleValue}` : "—"}</strong></span>
                <span>Tax {cccSummary.taxRateLabel}: <strong className="text-foreground">{cccSummary.salesTax ? `$${cccSummary.salesTax}` : "—"}</strong></span>
                <span>Transfer fees: <strong className="text-foreground">{cccSummary.titleRegFees ? `$${cccSummary.titleRegFees}` : "—"}</strong></span>
              </div>
              <p className="mt-2 text-[11px] leading-4 text-muted-foreground">Prior damage is informational only because CCC has already reflected it in the adjusted ACV. Add title, registration, storage, lien, or other claim-specific amounts manually when applicable.</p>
            </div>
          )}
        </Panel>
        <Panel title="Claim Details" tag="REQUIRED">
          <Grid3>
            <Field label="Claimant Name" id="tls-name" value={form.claimantName} onChange={set("claimantName")} placeholder="First Last" required />
            <Field label="Claim Number" id="tls-claim" value={form.claimNumber} onChange={set("claimNumber")} placeholder="e.g. PF438367" />
            <Field label="Date of Loss" id="tls-dol" value={form.dateOfLoss} onChange={set("dateOfLoss")} type="date" />
          </Grid3>
          <div className="mt-3"><TextareaField label="Claimant Mailing Address" id="tls-address" value={form.claimantAddress} onChange={set("claimantAddress")} placeholder={'Street address\nCity, State ZIP'} rows={2} /></div>
          <Grid3 children={<>
            <Field label="Vehicle (Year/Make/Model)" id="tls-vehicle" value={form.vehicle} onChange={set("vehicle")} placeholder="e.g. 2024 Toyota Camry" />
            <Field label="VIN" id="tls-vin" value={form.vin} onChange={set("vin")} placeholder="17-character VIN" />
            <div>
              <label className="block text-xs font-medium text-foreground/70 mb-1">Market (Member's Home State)</label>
              <select value={form.market} onChange={(e) => set("market")(e.target.value)}
                className="w-full h-8 rounded-md border border-input bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-ring">
                {WHIP_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </>} />
        </Panel>
        <Panel title="Settlement Breakdown">
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Enter the components that apply. The total adds ACV, sales tax, title and registration fees, admin fee, tear down, and storage, then deducts salvage and any additional deductions.</p>
            <Grid2 children={<>
              <Field label="Vehicle Valuation (ACV) ($)" id="tls-acv" value={form.acv} onChange={set("acv")} placeholder="e.g. 23496.00" />
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="tls-sales-tax" className="text-xs font-semibold text-foreground/80">Sales Tax ($)</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[10px] font-semibold"
                    onClick={() => {
                      const acv = parseFloat(form.acv);
                      if (!Number.isFinite(acv) || acv <= 0) {
                        toast.error("Enter a vehicle valuation before calculating sales tax");
                        return;
                      }
                      set("salesTax")((acv * 0.06).toFixed(2));
                    }}
                  >
                    Auto-calc 6%
                  </Button>
                </div>
                <Input id="tls-sales-tax" inputMode="decimal" value={form.salesTax} onChange={(e) => set("salesTax")(e.target.value)} placeholder="e.g. 1527.24" className="text-sm h-8" />
                <p className="text-[10px] text-muted-foreground">Total loss only; calculated from ACV when applicable.</p>
              </div>
              <Field label="Title & Reg Fees ($) — MD only" id="tls-title-reg" value={form.titleRegFees} onChange={set("titleRegFees")} placeholder="e.g. 185.00" />
              <Field label="Admin Fee ($)" id="tls-admin-fee" value={form.adminFee} onChange={set("adminFee")} placeholder="e.g. 295.00" />
              <Field label="Tear Down ($)" id="tls-tear-down" value={form.tearDown} onChange={set("tearDown")} placeholder="e.g. 450.00" />
              <Field label="Storage ($)" id="tls-storage-charge" value={form.storage} onChange={set("storage")} placeholder="e.g. 1260.00" />
              <Field label="Salvage (Deducted) ($)" id="tls-salvage" value={form.salvageDeducted} onChange={set("salvageDeducted")} placeholder="e.g. 6720.00" />
              <Field label="Less: Prior Payment to Claimant ($)" id="tls-prior" value={form.priorPayment} onChange={set("priorPayment")} placeholder="e.g. 0.00" />
            </>} />
            <Grid2 children={<>
              <Field label="Lienholder Name" id="tls-lien-name" value={form.lienHolder} onChange={set("lienHolder")} placeholder="e.g. Toyota Financial" />
              <Field label="Loan Payoff Amount ($)" id="tls-lien-amt" value={form.lienPayoff} onChange={set("lienPayoff")} placeholder="e.g. 12000.00" />
            </>} />
            <Field label="Less: Storage Deducted ($)" id="tls-storage" value={form.storageDeducted} onChange={set("storageDeducted")} placeholder="e.g. 350.00" />
            {otherDeductions.map((d, i) => (
              <div key={i} className="flex gap-2 items-end">
                <div className="flex-1">
                  <Field label={`Other Deduction ${i + 1} — Label`} id={`tls-ded-label-${i}`} value={d.label} onChange={(v) => setOtherDeductions(prev => prev.map((x, j) => j === i ? {...x, label: v} : x))} placeholder="e.g. Betterment" />
                </div>
                <div className="w-32">
                  <Field label="Amount ($)" id={`tls-ded-amt-${i}`} value={d.amount} onChange={(v) => setOtherDeductions(prev => prev.map((x, j) => j === i ? {...x, amount: v} : x))} placeholder="0.00" />
                </div>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive mb-0.5" onClick={() => setOtherDeductions(prev => prev.filter((_, j) => j !== i))}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7" onClick={() => setOtherDeductions(prev => [...prev, {label: "", amount: ""}])}>
              <Plus className="w-3 h-3" /> Add Deduction
            </Button>
          </div>
          <div className="mt-4 p-3 rounded-lg bg-[#ff6221]/5 border border-[#ff6221]/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground/70">Net Amount Payable to Claimant</span>
              <span className="text-lg font-bold text-[#ff6221]">${netAmount}</span>
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-border bg-background overflow-hidden" aria-label="Itemization of Damages preview">
            <div className="px-3 py-2 border-b border-border bg-muted/30 text-xs font-bold tracking-wide">ITEMIZATION OF DAMAGES</div>
            <div className="px-3 py-2.5 space-y-1.5 text-sm">
              {visibleDamageRows.map((row) => (
                <div key={row.label} className="grid grid-cols-[auto_1fr_auto] items-baseline gap-2">
                  <span>{row.label}</span>
                  <span className="border-b border-dotted border-muted-foreground/45 translate-y-[-2px]" />
                  <span className="tabular-nums">{formatSettlementAmount(row.amount, row.deducted)}</span>
                </div>
              ))}
              <div className="mt-2 pt-2 border-t border-foreground/55 grid grid-cols-[auto_1fr_auto] items-baseline gap-2 font-bold">
                <span>Total</span><span /><span className="tabular-nums">${netAmount}</span>
              </div>
            </div>
          </div>
        </Panel>
        <Panel title="Settlement Offer Letter" tag="CLAIMANT">
          <p className="text-xs leading-5 text-muted-foreground">Generate the claimant-facing settlement offer separately from the release. The document uses the calculated total and itemization above, then includes a claimant acceptance block.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="gap-1.5 border-foreground/25 text-foreground hover:bg-muted" onClick={() => handleDownload(false)}>
              <Eye className="w-3.5 h-3.5" /> Preview Settlement Offer
            </Button>
            <Button type="button" variant="outline" size="sm" className="gap-1.5 border-foreground/25 text-foreground hover:bg-muted" onClick={() => handleDownload(true)}>
              <Download className="w-3.5 h-3.5" /> Download Settlement Offer
            </Button>
          </div>
        </Panel>
        <Panel title="Claimant Property-Damage Release" tag="INCLUDED">
          <p className="text-xs leading-5 text-muted-foreground">Create the matching unbranded general property-damage release from this settlement. It uses the claimant, net settlement amount, date of loss, and market selected above, with claimant and witness signature lines.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="gap-1.5 border-foreground/25 text-foreground hover:bg-muted" onClick={() => handleClaimantRelease(false)}>
              <Eye className="w-3.5 h-3.5" /> Preview Claimant Release
            </Button>
            <Button type="button" variant="outline" size="sm" className="gap-1.5 border-foreground/25 text-foreground hover:bg-muted" onClick={() => handleClaimantRelease(true)}>
              <Download className="w-3.5 h-3.5" /> Download Claimant Release
            </Button>
          </div>
          <p className="mt-2 text-[11px] leading-4 text-muted-foreground">Release consideration: <strong className="text-foreground">${netAmount}</strong> · State law: <strong className="text-foreground">{RELEASE_STATE_NAMES[form.market] || form.market}</strong></p>
        </Panel>
        <Panel title="Additional Details">
          <Grid2 children={<>
            <Field label="Rental Cutoff Date" id="tls-rental" value={form.rentalCutoffDate} onChange={set("rentalCutoffDate")} type="date" />
            <HandlerSelect value={form.adjusterName} onChange={set("adjusterName")} label="Handler Name" id="tls-handler" />
          </>} />
          <div className="mt-3">
            <Field label="Additional Notes" id="tls-notes" value={form.additionalNotes} onChange={set("additionalNotes")} placeholder="Any additional context for the letter..." />
          </div>
        </Panel>
        <Panel title="Settlement Letter Language" tag="EDITABLE">
          <p className="mb-3 text-xs leading-5 text-muted-foreground">Use the standard compact letter or edit the opening and acceptance instructions for the situation. The calculation table, acceptance block, and claimant details stay controlled by the fields above.</p>
          <TextareaField label="Custom opening (optional)" id="tls-opening" value={form.settlementOpening} onChange={set("settlementOpening")} placeholder="For example: This letter replaces our prior settlement letter of [date]. Your vehicle has been determined to be a total loss…" rows={4} />
          <div className="mt-3"><TextareaField label="Custom payment / acceptance instructions (optional)" id="tls-closing" value={form.settlementClosing} onChange={set("settlementClosing")} placeholder="For example: Payment will issue after receipt of the signed letter and enclosed release…" rows={3} /></div>
          <div className="mt-3">
          <Button variant="outline" size="sm" className="gap-1.5 border-[#ff6221]/40 text-[#ff6221] hover:bg-[#ff6221]/10" onClick={handleGenerateLetter} disabled={aiLoading}>
            {aiLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
            {aiLoading ? "Generating..." : "✨ Draft editable opening with AI"}
          </Button>
          </div>
        </Panel>
      </div>
      <PreviewPanel
        text={activeOutputText}
        onCopy={() => { navigator.clipboard.writeText(activeOutputText); toast.success("Copied"); }}
        onDownload={handleActiveOutput}
        pdfUrl={activeOutputPdfUrl}
        onPreview={() => handleActiveOutput(false)}/>
    </div>
  );
}

// ─── Tab: Subro Demand Letter ─────────────────────────────────────────────────
function SubroDemandTab({ onNavigate, louHandoff, onLouHandoffConsumed }: { onNavigate?: (tab: DocGenTab) => void; louHandoff?: LouDemandHandoff | null; onLouHandoffConsumed?: (id: string) => void }) {
  const [form, setForm] = useState({
    carrier: "",
    adjusterName: "",
    carrierAddress: "",
    advClaim: "",
    ourClaim: "",
    dol: "",
    driver: "",
    vehicle: "",
    vin: "",
    attachments: "Estimate, Image Report, Police Report",
    deadline: "15",
    demandType: "repair",
    repair: "",
    tow: "",
	    storage: "",
	    adminFee: "",
	    salesTax: "",
	    salvageDeducted: "",
	    dv: "",
    lou: "",
    valuation: "",
    openingParagraph: "",
  });
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [handlerName, setHandlerName] = useState("");
  const [handlerExtension, setHandlerExtension] = useState("");
  const [claimEmail, setClaimEmail] = useState("");
  const [vinDecoding, setVinDecoding] = useState(false);
  const [louRepairStart, setLouRepairStart] = useState("");
  const [louRepairEnd, setLouRepairEnd] = useState("");
  const [louDailyRate, setLouDailyRate] = useState("");
  const [louMarketCode, setLouMarketCode] = useState("DC");
  const [louVehicleClass, setLouVehicleClass] = useState("");
  const [louRepairFacility, setLouRepairFacility] = useState("Total Recon");
  const [louRoNumber, setLouRoNumber] = useState("");
  const [louRegisteredOwner, setLouRegisteredOwner] = useState("Metrocars Leasing Corp.");
  const [louSupportEnabled, setLouSupportEnabled] = useState(true);
  const [estimateFile, setEstimateFile] = useState<File | null>(null);
  const [estimateParsing, setEstimateParsing] = useState(false);
  const parseEstimateMutation = trpc.docgen.parseEstimate.useMutation();
  const { data: louMarketsData } = trpc.lou.getMarketPricing.useQuery(undefined, { staleTime: 300_000 });
  const louMarkets = Array.isArray(louMarketsData) ? louMarketsData : [];
  const louMarket = louMarkets.find((market) => market.code === louMarketCode);
  const louMarketName = louMarket?.name || louMarketCode;
  const louVehicleOptions = louMarket?.vehicles || [];
  const louPublishedRate = louVehicleOptions.find((vehicle) => vehicle.model === louVehicleClass);
  const louUsesPublishedRate = !!louPublishedRate && Number(louDailyRate) === louPublishedRate.dailyRate;
  useEffect(() => {
    if (!louMarketsData || !louVehicleClass) return;
    const migrated = findLouVehicleRate(louMarketCode, louVehicleClass);
    const selected = louVehicleOptions.find((vehicle) => vehicle.model === migrated?.model);
    if (selected) { setLouVehicleClass(selected.model); setLouDailyRate(selected.dailyRate.toFixed(2)); }
    else setLouDailyRate("");
  }, [louVehicleClass, louMarketCode, louMarketsData]);
  const { data: louUtilRowsData, isFetching: louUtilizationLoading } = trpc.lou.getUtilRows.useQuery(
    { marketCode: louMarketCode, dropOff: louRepairStart, pickUp: louRepairEnd },
    { enabled: Boolean(louRepairStart && louRepairEnd && louRepairStart < louRepairEnd), staleTime: 300_000 },
  );
  // Attachment checkboxes
  const ATTACHMENT_OPTIONS = [
    "Estimate",
    "Image Report",
    "Police Report",
    "Total Loss Valuation",
    "Medical Records",
    "Rental Invoice",
    "Tow Invoice",
    "Recorded Statement",
  ];
  const [selectedAttachments, setSelectedAttachments] = useState<string[]>(["Estimate", "Image Report", "Police Report"]);
  const toggleAttachment = (att: string) => {
    setSelectedAttachments(prev =>
      prev.includes(att) ? prev.filter(a => a !== att) : [...prev, att]
    );
  };
  const attachmentsText = selectedAttachments.join(", ");
  const louRepairDays = louRepairStart && louRepairEnd
    ? Math.max(0, Math.round((new Date(`${louRepairEnd}T00:00:00`).getTime() - new Date(`${louRepairStart}T00:00:00`).getTime()) / 86_400_000))
    : 0;
  const louCalculatedTotal = louRepairDays * (parseFloat(louDailyRate) || 0);
  const louUtilizationRows: LouUtilizationRow[] = (louUtilRowsData || []).map((row) => ({
    date: new Date(`${row.date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    fleetCount: row.fleet || 0,
    rentCount: row.rented || 0,
    availableCount: row.available || 0,
    utilization: row.dataStatus === "unavailable" ? "—" : formatLouUtilization(row.utilization),
    sourceMonth: row.sourceMonth,
    dataStatus: row.dataStatus,
  }));
  const louUtilizationSnapshots = summarizeLouUtilizationRows(louUtilizationRows);
  const buildLouSupportingSchedule = (): LouSupportingSchedule | null => {
    if (!louSupportEnabled || louRepairDays <= 0 || louCalculatedTotal <= 0) return null;
    return {
      claimNumber: form.ourClaim,
      adverseClaimNumber: form.advClaim,
      dateOfLoss: form.dol,
      adverseCarrier: form.carrier,
      adjuster: form.adjusterName,
      vehicle: form.vehicle,
      vin: form.vin,
      memberDriver: form.driver,
      registeredOwner: louRegisteredOwner,
      vehicleStatus: "Actively leased / Revenue-generating",
      vehicleClass: louVehicleClass || form.vehicle || "Vehicle",
      marketName: louMarketName,
      repairFacility: louRepairFacility,
      roNumber: louRoNumber,
      repairStart: louRepairStart,
      repairEnd: louRepairEnd,
      days: louRepairDays,
      dailyRate: parseFloat(louDailyRate) || 0,
      total: louCalculatedTotal,
      weeklyRate: louUsesPublishedRate ? louPublishedRate!.weeklyRate : undefined,
      rateSource: louUsesPublishedRate && louMarket ? `${louRateSourceLabel(louMarket)} Source cell: ${louPublishedRate!.sourceCell}.` : undefined,
      customRate: !louUsesPublishedRate,
      letterDate: formatNorthAmericanLetterDate(today),
      handlerExtension,
      handlerEmail: "claims@drivewhip.com",
      handlerName,
      handlerTitle: "Claims Resolution Specialist",
      utilizationRows: louUtilizationRows,
    };
  };
  const applyLouCalculation = () => {
    if (louRepairDays <= 0 || louCalculatedTotal <= 0) {
      toast.error("Enter a valid repair period and daily rental rate to calculate LOU.");
      return;
    }
    setForm((current) => ({ ...current, lou: louCalculatedTotal.toFixed(2) }));
    setLouSupportEnabled(true);
    toast.success(`LOU of $${louCalculatedTotal.toFixed(2)} added to this demand.`);
  };
  const decodeVin = async () => {
    const vin = form.vin.trim();
    if (vin.length !== 17) { toast.error("VIN must be exactly 17 characters"); return; }
    setVinDecoding(true);
    try {
      const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`);
      const data = await res.json() as { Results: Array<{ Variable: string; Value: string | null }> };
      const get = (v: string) => data.Results.find(r => r.Variable === v)?.Value || "";
      const year = get("Model Year");
      const make = get("Make");
      const model = get("Model");
      const trim = get("Trim");
      const ymmt = [year, make, model, trim].filter(Boolean).join(" ");
      if (ymmt) {
        setForm(p => ({ ...p, vehicle: ymmt }));
        toast.success(`Decoded: ${ymmt}`);
      } else {
        toast.error("Could not decode VIN — check the number and try again");
      }
    } catch {
      toast.error("VIN decode failed — check your connection");
    } finally {
      setVinDecoding(false);
    }
  };

  const appliedLouHandoffRef = useRef<string | null>(null);

  // Apply the parent handoff whenever this tab opens. Session storage remains a
  // recovery path for a reload, while the in-memory contract prevents the
  // transfer from depending on mount timing.
  useEffect(() => {
    const handoff = louHandoff ?? readLouDemandHandoff();
    if (handoff && appliedLouHandoffRef.current !== handoff.id) {
      appliedLouHandoffRef.current = handoff.id;
      setForm(p => ({
        ...p,
        lou: handoff.total,
        ...(handoff.claimNumber ? { ourClaim: handoff.claimNumber } : {}),
        ...(handoff.adverseClaimNumber ? { advClaim: handoff.adverseClaimNumber } : {}),
        ...(handoff.dateOfLoss ? { dol: handoff.dateOfLoss } : {}),
        ...(handoff.adverseCarrier ? { carrier: handoff.adverseCarrier } : {}),
        ...(handoff.adjuster ? { adjusterName: handoff.adjuster } : {}),
        ...(handoff.vehicle ? { vehicle: handoff.vehicle } : {}),
        ...(handoff.vin ? { vin: handoff.vin } : {}),
      }));
      setLouRepairStart(handoff.repairStart);
      setLouRepairEnd(handoff.repairEnd);
      setLouDailyRate(handoff.dailyRate);
      setLouMarketCode(handoff.marketCode || "DC");
      setLouVehicleClass(handoff.vehicleClass);
      setLouRepairFacility("Total Recon");
      setLouRoNumber(handoff.roNumber);
      setLouRegisteredOwner(handoff.registeredOwner || "Metrocars Leasing Corp.");
      setLouSupportEnabled(true);
      sessionStorage.removeItem(LOU_DEMAND_HANDOFF_KEY);
      sessionStorage.removeItem("lou_total");
      sessionStorage.removeItem("lou_claim");
      sessionStorage.removeItem("lou_days");
      sessionStorage.removeItem("lou_rate");
      onLouHandoffConsumed?.(handoff.id);
      toast.success(`LOU of $${handoff.total} added to this demand.`);
    }
  }, [louHandoff, onLouHandoffConsumed]);

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const parseEstimateFile = async (file = estimateFile) => {
    if (!file) { toast.error("Select an estimate first"); return; }
    setEstimateFile(file);
    setEstimateParsing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const upload = await fetch("/api/upload/document", { method: "POST", body: fd });
      if (!upload.ok) throw new Error(`Upload failed: ${file.name}`);
      const payload = await upload.json() as { url?: string; signedUrl?: string; key?: string };
      const fileUrl = payload.signedUrl || payload.url;
      if (!fileUrl || !/^https?:\/\//i.test(fileUrl)) throw new Error("Upload did not return a readable document URL");
      const parsed = await parseEstimateMutation.mutateAsync({ fileUrl, fileName: file.name, storageKey: payload.key, mimeType: file.type || undefined });
      setForm(p => ({
        ...p,
        repair: parsed.repairTotal || p.repair,
        vehicle: parsed.vehicle || p.vehicle,
        vin: parsed.vin || p.vin,
        // An estimate may display both parties' claim numbers. Only carry an explicitly
        // identified Whip/member/repair-file reference into the "our" claim field.
        ourClaim: parsed.claimNumberRole !== "adverse" ? (parsed.claimNumber || p.ourClaim) : p.ourClaim,
        dol: parsed.dateOfLoss || p.dol,
        carrier: parsed.insurerName || p.carrier,
        carrierAddress: parsed.carrierAddress || p.carrierAddress,
        driver: parsed.claimantName || p.driver,
        adjusterName: parsed.adjusterName || p.adjusterName,
      }));
      setLouRepairStart((current) => parsed.repairStart || current);
      setLouRepairEnd((current) => parsed.repairEnd || current);
      setLouRoNumber((current) => parsed.roNumber || current);
      setLouRepairFacility((current) => current || "Total Recon");
      setSelectedAttachments(prev => prev.includes("Estimate") ? prev : ["Estimate", ...prev]);
      toast.success(parsed.repairTotal ? `Estimate read — $${parsed.repairTotal} added to the demand` : "Estimate read — review the pre-filled fields");
    } catch (error: unknown) {
      toast.error((error as Error).message || "Could not read the estimate");
    } finally {
      setEstimateParsing(false);
    }
  };

	  const total = (() => {
	    const r = parseFloat(form.repair) || 0;
	    const t = parseFloat(form.tow) || 0;
	    const s = parseFloat(form.storage) || 0;
	    const admin = parseFloat(form.adminFee) || 0;
	    const tax = parseFloat(form.salesTax) || 0;
	    const salvage = parseFloat(form.salvageDeducted) || 0;
	    const d = parseFloat(form.dv) || 0;
	    const l = parseFloat(form.lou) || 0;
	    if (form.demandType === "total-loss") {
	      const v = parseFloat(form.valuation) || 0;
	      return (v + t + s + admin + tax + d + l - salvage).toFixed(2);
    }
    return (r + t + s + d + l).toFixed(2);
  })();

  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const claimEmailAddress = claimEmail.trim();
  const claimEmailInstruction = claimEmailAddress
    ? `For claim-specific correspondence about this demand, please email ${claimEmailAddress}.`
    : "";
  const handlerContactLine = `Phone: (855) 906-5949${handlerExtension.trim() ? ` ext. ${handlerExtension.trim()}` : ""}  |  claims@drivewhip.com`;

  const preview = `${today}

Whip Claims Management
P.O. Box 10622
Rockville, MD 20849
claims@drivewhip.com

${form.carrier || "[Insurance Company]"}
Attn: ${form.adjusterName || "[Adjuster Name]"}
${form.carrierAddress || "[Carrier Mailing Address]"}

RE: Subrogation Demand — Whip Claim No. ${form.ourClaim || "[Our Claim #]"} / Your Claim No. ${form.advClaim || "[Their Claim #]"}
Date of Loss: ${form.dol || "[Date of Loss]"}
Vehicle: ${form.vehicle || "[Vehicle]"} — VIN ${form.vin || "[VIN]"}
Our Insured: Metrocars Leasing Corp. (Driver: ${form.driver || "[Driver Name]"})

Dear ${form.adjusterName || form.carrier || "[Carrier / Adjuster]"},

This office represents Metrocars Leasing Corp., the owner of the above-referenced vehicle, in connection with the loss that occurred on ${form.dol || "[Date of Loss]"}. Based on our investigation — including our review of the available police report, vehicle damage documentation, photographs, and supporting records — we have determined that your insured bears sole liability for this loss. Your insured's negligent operation of their vehicle was the direct and proximate cause of the damage sustained to the ${form.vehicle || "[Vehicle]"} described above, a vehicle owned by and registered to Metrocars Leasing Corp.

We accordingly submit this formal demand for reimbursement of the damages set forth below, pursuant to the doctrine of contractual and equitable subrogation, and request that this matter be resolved directly between our respective offices.

ITEMIZATION OF DAMAGES
─────────────────────────────────────────
${form.demandType === "total-loss" ? `Vehicle Valuation (ACV)          $${form.valuation || "0.00"}` : `Estimate                         $${form.repair || "0.00"}`}
	${form.tow ? `Towing / Transport               $${form.tow}` : ""}
	${form.demandType === "total-loss" && form.salesTax ? `Sales Tax                          $${form.salesTax}` : ""}
	${form.demandType === "total-loss" && form.adminFee ? `Admin Fee                          $${form.adminFee}` : ""}
	${form.storage ? `Storage                            $${form.storage}` : ""}
	${form.demandType === "total-loss" && form.salvageDeducted ? `Salvage (deducted)               ($${form.salvageDeducted})` : ""}
	${form.dv ? `Diminished Value                 $${form.dv}` : ""}
${form.lou ? `Rental Reimbursement             $${form.lou}` : ""}
─────────────────────────────────────────
Total Subrogation Demand         $${total}

ENCLOSURES
${attachmentsText || "Estimate, Image Report, Police Report"}
DEMAND FOR PAYMENT
Please remit payment in full within ${form.deadline || "15"} days of the date of this letter. If we do not receive payment or a substantive response within this timeframe, this office reserves the right to pursue recovery through Arbitration Forums, Inc., the applicable state Department of Insurance, or civil litigation, and to seek recovery of any interest, costs, and fees permitted under applicable law.
This demand is made without waiver of any rights or remedies available to Metrocars Leasing Corp. or Whip Claims Management, all of which are expressly reserved.
PAYMENT INSTRUCTIONS
Payment should be made payable to Whip Claims Management and mailed to P.O. Box 10622, Rockville, MD 20849. If paying by EFT, please contact the undersigned for wire instructions. Please reference Whip Claim No. ${form.ourClaim || "[Our Claim #]"} on all correspondence and payments.
${claimEmailInstruction}
Respectfully,
${handlerName || ""}
Whip Claims Management
${handlerContactLine}`;

  const buildSubroDoc = () => {
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    const louSupportingSchedule = buildLouSupportingSchedule();
    let y = addWhipLetterhead(doc) - 2;
    // A 0.7-inch text frame reads more like standard legal correspondence than
    // the earlier narrow 0.55-inch frame, while the logo/header stays aligned.
    const lm = 18, rm = W - 18, tw = W - 36;
    const compactFont = 8.8;
    const compactLeading = 4.25;
    const nl = (n = compactLeading) => { y += n; };
    const checkPage = (needed = 20) => {
      if (y + needed > doc.internal.pageSize.getHeight() - 25) {
        doc.addPage(); y = 20;
      }
    };
    const startContinuationPage = () => {
      doc.addPage();
      y = addWhipLetterhead(doc);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(`Subrogation Demand — Whip Claim No. ${form.ourClaim || "[Our Claim #]"} (continued)`, lm, y);
      nl(5);
    };

    // ── Date (left-aligned, no "For Settlement Purposes Only") ──
    doc.setFontSize(compactFont); doc.setFont("helvetica", "normal"); doc.setTextColor(60, 60, 60);
    doc.text(new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }), lm, y);
    nl(5);

    // ── Carrier address block ──
    doc.setFontSize(compactFont); doc.setFont("helvetica", "normal");
    doc.text(form.carrier || "[Insurance Company]", lm, y); nl();
    doc.text(`Attn: ${form.adjusterName || "[Adjuster Name]"}`, lm, y); nl();
    const recipientAddress = doc.splitTextToSize(form.carrierAddress || "[Carrier Mailing Address]", tw) as string[];
    doc.text(recipientAddress, lm, y); y += recipientAddress.length * compactLeading + 3;

    // ── RE block ──
    doc.setFont("helvetica", "bold");
    doc.text("RE:", lm, y);
    doc.setFont("helvetica", "normal");
    const reStart = lm + 8;
    const reText = `Subrogation Demand — Whip Claim No. ${form.ourClaim || "[Our Claim #]"} / Your Claim No. ${form.advClaim || "[Their Claim #]"}`;
    const reLines = doc.splitTextToSize(reText, tw - 8);
    doc.text(reLines, reStart, y);
    y += reLines.length * compactLeading;
    doc.text(`Date of Loss: ${form.dol ? new Date(form.dol + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "[Date of Loss]"}`, reStart, y); nl();
    doc.text(`Vehicle: ${form.vehicle || "[Vehicle]"} — VIN ${form.vin || "[VIN]"}`, reStart, y); nl();
    doc.text(`Our Insured: Metrocars Leasing Corp. (Driver: ${form.driver || "[Driver Name]"})`, reStart, y); nl(7);

    // ── Salutation ──
    doc.text(`Dear ${form.adjusterName || form.carrier || "[Carrier / Adjuster]"},`, lm, y); nl(5);

    // ── Opening paragraph (editable) ──
    const openingText = form.openingParagraph ||
      `This office represents Metrocars Leasing Corp., the owner of the above-referenced vehicle, in connection with the loss that occurred on ${form.dol ? new Date(form.dol + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "[Date of Loss]"}. Based on our investigation — including our review of the available police report, vehicle damage documentation, photographs, and supporting records — we have determined that your insured bears sole liability for this loss. Your insured's negligent operation of their vehicle was the direct and proximate cause of the damage sustained to the ${form.vehicle || "[Vehicle]"} described above, a vehicle owned by and registered to Metrocars Leasing Corp.

We accordingly submit this formal demand for reimbursement of the damages set forth below, pursuant to the doctrine of contractual and equitable subrogation, and request that this matter be resolved directly between our respective offices.`;
    const openLines = doc.splitTextToSize(openingText, tw);
    checkPage(openLines.length * compactLeading + 14);
    doc.text(openLines, lm, y);
    y += openLines.length * compactLeading + 4;

    // ── ITEMIZATION OF DAMAGES ──
    checkPage(48);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.text("ITEMIZATION OF DAMAGES", lm, y); nl(1.5);
    // Correspondence stays printer-neutral: keep the Whip logo in color but
    // use only grayscale rules and text throughout the body.
    doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.5);
    doc.line(lm, y, rm, y); nl(4);

    // Table rows
    const rows: [string, string][] = [];
    if (form.demandType === "total-loss") {
      if (form.valuation) rows.push(["Vehicle Valuation (ACV)", `$${parseFloat(form.valuation).toFixed(2)}`]);
    } else {
      if (form.repair) rows.push(["Estimate", `$${parseFloat(form.repair).toFixed(2)}`]);
    }
    if (form.tow) rows.push(["Towing / Transport", `$${parseFloat(form.tow).toFixed(2)}`]);
    const storageAmt = parseFloat(form.storage || "0");
	    if (storageAmt > 0) rows.push(["Storage", `$${storageAmt.toFixed(2)}`]);
	    if (form.demandType === "total-loss") {
	      const salesTax = parseFloat(form.salesTax || "0");
	      const adminFee = parseFloat(form.adminFee || "0");
	      const salvage = parseFloat(form.salvageDeducted || "0");
	      if (salesTax > 0) rows.push(["Sales Tax", `$${salesTax.toFixed(2)}`]);
	      if (adminFee > 0) rows.push(["Admin Fee", `$${adminFee.toFixed(2)}`]);
	      if (salvage > 0) rows.push(["Salvage (deducted)", `($${salvage.toFixed(2)})`]);
	    }
    if (form.dv) rows.push(["Diminished Value", `$${parseFloat(form.dv).toFixed(2)}`]);
    if (form.lou) rows.push(["Rental Reimbursement (LOU)", `$${parseFloat(form.lou).toFixed(2)}`]);

    doc.setFontSize(compactFont); doc.setFont("helvetica", "normal");
    const col2x = rm - 30;
    rows.forEach(([label, amt]) => {
      checkPage(6);
      doc.text(label, lm + 4, y);
      doc.text(amt, col2x, y, { align: "right" });
      nl(4.5);
    });
    // Divider + total
    doc.setDrawColor(150, 150, 150); doc.line(lm, y, rm, y); nl(4);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.text("Total Subrogation Demand", lm + 4, y);
    doc.text(`$${total}`, col2x, y, { align: "right" });
    // Keep the demand heading visually distinct from the damages total while
    // retaining the compact single-page correspondence layout.
    nl(9);

    const demandText = `Please remit payment in full within ${form.deadline || "15"} days of the date of this letter. If we do not receive payment or a substantive response within this timeframe, this office reserves the right to pursue recovery through Arbitration Forums, Inc., the applicable state Department of Insurance, or civil litigation, and to seek recovery of any interest, costs, and fees permitted under applicable law.

	This demand is made without waiver of any rights or remedies available to Metrocars Leasing Corp. or Whip Claims Management, all of which are expressly reserved.

	Please make payment payable to Whip Claims Management and mail it to P.O. Box 10622, Rockville, MD 20849. For EFT instructions, contact the undersigned. Reference Whip Claim No. ${form.ourClaim || "[Our Claim #]"} on all correspondence and payments.${claimEmailInstruction ? ` ${claimEmailInstruction}` : ""}`;
    const demandLines = doc.splitTextToSize(demandText, tw) as string[];
    const paymentAndSignatureHeight = 6 + demandLines.length * compactLeading + 5 + (handlerName ? 21 : 17);

    // Enclosures remain as selected attachments in the packet; they are not
    // repeated inside the correspondence. This lets the letter stay compact.
    if (y + paymentAndSignatureHeight > doc.internal.pageSize.getHeight() - 25) startContinuationPage();

    // ── DEMAND FOR PAYMENT ──
    doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.text("DEMAND FOR PAYMENT", lm, y); nl(1.5);
    doc.setDrawColor(150, 150, 150); doc.line(lm, y, rm, y); nl(4);
    doc.setFont("helvetica", "normal"); doc.setFontSize(compactFont);
    // Page breaks here are a last-resort safeguard for unusually long custom text.
    // Standard payment, remittance, and non-waiver language stays in one section.
    checkPage(demandLines.length * compactLeading + 24);
    doc.text(demandLines, lm, y);
    y += demandLines.length * compactLeading + 5;

    // ── Signature block ──
    doc.setFont("helvetica", "normal"); doc.setFontSize(compactFont);
    doc.text("Respectfully,", lm, y); nl(6);
    if (handlerName) { doc.setFont("helvetica", "bold"); doc.text(handlerName, lm, y); nl(); doc.setFont("helvetica", "normal"); }
    doc.text("Claims Resolution Specialist", lm, y); nl();
    doc.text("Whip Claims Management", lm, y); nl();
    doc.text(handlerContactLine, lm, y);

    addSOLNotice(doc);
    addLetterFooter(doc);
    if (louSupportingSchedule) appendLouSupportingSchedule(doc, louSupportingSchedule);
    return doc;
  };
  const handlePreview = () => {
    const doc = buildSubroDoc();
    setPreviewPdfUrl(getPDFDataUrl(doc));
  };
  const handleDownload = (shouldDownload = true) => {
    const doc = buildSubroDoc();
    setPreviewPdfUrl(getPDFDataUrl(doc));
    if (shouldDownload) downloadPDF(doc, `Whip_SubroDemand_${form.ourClaim || "Draft"}.pdf`);
  };

  return (
    <div className="space-y-4">
      {/* Quick Links card */}
      <div className="rounded-lg border border-border bg-card/50 px-4 py-3 flex items-center gap-3 flex-wrap">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quick Links</span>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => onNavigate?.("lou-calculator")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[#171b31] hover:bg-[#1e2340] text-white transition-colors border border-[#171b31]/20"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            Full LOU Packet
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.("dv-calculator")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[#ff6221] hover:bg-[#e5541a] text-white transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" /></svg>
            DV Calculator
          </button>
        </div>
        <span className="text-xs text-muted-foreground ml-auto hidden sm:block">Enter calculated amounts in the fields below</span>
      </div>
      <section
        aria-label="Repair estimate upload and prefill"
        className="rounded-lg border-2 border-dashed border-[#ff6221]/35 bg-[#ff6221]/[0.035] px-4 py-4 transition-colors hover:border-[#ff6221]/65"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files?.[0]; if (file) void parseEstimateFile(file); }}
      >
        <input id="sd-estimate-upload" type="file" accept="application/pdf,.pdf,.png,.jpg,.jpeg" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) setEstimateFile(file); }} />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#171b31] dark:text-[#ff9c73]">1. Start with the repair estimate</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Drop a PDF or image here, then read it to pre-fill the claim, carrier, vehicle, VIN, claimant, loss date, and repair amount below.</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <label htmlFor="sd-estimate-upload" className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-[#ff6221]/50 px-3 text-xs font-medium text-[#d84f18] hover:bg-[#ff6221]/10">
              <Upload className="h-3.5 w-3.5" /> {estimateFile ? "Replace" : "Choose file"}
            </label>
            <Button type="button" size="sm" className="h-9 bg-[#ff6221] text-xs text-white hover:bg-[#e5541a]" disabled={!estimateFile || estimateParsing} onClick={() => void parseEstimateFile()}>
              {estimateParsing ? <RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />} {estimateParsing ? "Reading…" : "Read & pre-fill"}
            </Button>
          </div>
        </div>
        {estimateFile && <p className="mt-2 truncate text-[11px] font-medium text-foreground/75">Selected: {estimateFile.name}</p>}
      </section>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div>
        <Panel title="Claim Information" tag="REQUIRED">
          <p className="mb-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-4 text-slate-600">Recipient information below is for <strong>their third-party carrier and handling adjuster</strong>. Keep Whip’s full Snapsheet file number in the Whip claim field.</p>
          <Grid2>
            <ThirdPartyCarrierSelect value={form.carrier} onChange={set("carrier")} onAddressChange={set("carrierAddress")} />
            <Field label="Their Adjuster Name" id="sd-adjuster" value={form.adjusterName} onChange={set("adjusterName")} placeholder="Their handling adjuster, e.g. John Smith" />
          </Grid2>
          <div className="mt-3"><Field label="Their Claim #" id="sd-advclaim" value={form.advClaim} onChange={set("advClaim")} placeholder="e.g. 2091T657S" /></div>
          <div className="mt-3">
            <TextareaField label="Their Claims / Subrogation Mailing Address" id="sd-carrier-address" value={form.carrierAddress} onChange={set("carrierAddress")} placeholder={'Carrier name\nClaims or subrogation mailing address\nCity, State ZIP'} rows={3} />
            <p className="mt-1 text-[10px] leading-4 text-muted-foreground">A verified carrier preset or a mailing address printed on the estimate pre-fills here. Verify claim-specific routing before sending—many national carriers use state or claim-specific addresses.</p>
          </div>
          <Grid2 children={<>
            <div className="space-y-1">
              <Field label="Whip Snapsheet Claim #" id="sd-claim" value={form.ourClaim} onChange={set("ourClaim")} placeholder="XXX-1234-123456-123456" />
              <p className="text-[10px] leading-3 text-muted-foreground">Always enter the complete Snapsheet claim number.</p>
            </div>
            <Field label="Date of Loss" id="sd-dol" value={form.dol} onChange={set("dol")} type="date" />
          </>} />
          <div className="mt-3"><Field label="Driver / Claimant Name" id="sd-driver" value={form.driver} onChange={set("driver")} placeholder="First Last" /></div>
          <Grid2 children={<>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-foreground/80">VIN — decode first</Label>
              <div className="flex gap-1.5">
                <Input
                  id="sd-vin"
                  value={form.vin}
                  onChange={(e) => set("vin")(e.target.value.toUpperCase())}
                  placeholder="17-character VIN"
                  maxLength={17}
                  className="text-sm h-8 font-mono flex-1"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2 text-xs border-[#ff6221]/40 text-[#ff6221] hover:bg-[#ff6221]/10 whitespace-nowrap"
                  onClick={decodeVin}
                  disabled={vinDecoding || form.vin.length !== 17}
                  title="Decode VIN to get Year/Make/Model"
                >
                  {vinDecoding ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                  <span className="ml-1">Decode</span>
                </Button>
              </div>
            </div>
            <Field label="Vehicle (Year / Make / Model / Trim)" id="sd-vehicle" value={form.vehicle} onChange={set("vehicle")} placeholder="Decoded from VIN or enter manually" />
          </>} />
          <div className="mt-3 space-y-1">
            <Label className="text-xs font-semibold">Response Deadline</Label>
            <Select value={form.deadline} onValueChange={set("deadline")}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["10","14","15","20"].map(v => <SelectItem key={v} value={v}>{v} days</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </Panel>
        <Panel title="Claim-Specific Reply-To Email" tag="PRINTS ON LETTER">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
            <div className="flex items-start gap-2">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-800">Reply-to address for this claim file</p>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-600">Enter the claim-specific email address recipients should use for this loss. It prints as a clear correspondence instruction in the demand body; the signature contact line remains claims@drivewhip.com. This field does not send, forward, queue, or add anything to Mailroom.</p>
              </div>
            </div>
          </div>
          <div className="mt-3 space-y-1">
            <Label htmlFor="sd-claim-email" className="text-xs font-semibold text-foreground/80">Claim email address</Label>
            <Input id="sd-claim-email" type="email" className="h-8 text-sm" value={claimEmail} onChange={(event) => setClaimEmail(event.target.value)} placeholder="claim-specific@example.com" />
          </div>
        </Panel>
        <Panel title="Opening Paragraph" tag="EDITABLE">
          <div className="space-y-1">
            <Label className="text-xs font-medium text-foreground/70">Edit the opening paragraph (leave blank to use default language)</Label>
            <textarea
              className="w-full min-h-[90px] rounded-md border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring resize-y"
              value={form.openingParagraph}
              onChange={(e) => set("openingParagraph")(e.target.value)}
              placeholder="This office represents Metrocars Leasing Corp., the owner of the above-referenced vehicle, in connection with the loss that occurred on [Date of Loss]..."
            />
          </div>
        </Panel>
        <Panel title="Demand Type & Damages">
          <div className="space-y-1 mb-3">
            <Label className="text-xs font-semibold">Demand Type</Label>
            <Select value={form.demandType} onValueChange={set("demandType")}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="repair">Repair Demand</SelectItem>
                <SelectItem value="total-loss">Total Loss Demand</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <section className="mb-4 rounded-lg border border-slate-300 bg-slate-50/70 p-3" aria-label="LOU calculator for this demand">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground"><Calculator className="h-3.5 w-3.5" /> Loss of Use calculator</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Uses the same market pricing and utilization data as the Full LOU Packet. When enabled, the complete LOU support schedule is appended to this demand PDF.</p>
              </div>
              {form.lou && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800">Demand LOU: ${parseFloat(form.lou || "0").toFixed(2)}</span>}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="sd-lou-market" className="text-xs font-semibold text-foreground/80">Market / Location</Label>
                <select id="sd-lou-market" value={louMarketCode} onChange={(event) => { setLouMarketCode(event.target.value); setLouVehicleClass(""); setLouDailyRate(""); }} className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs">
                  {louMarkets.map((market) => <option key={market.code} value={market.code}>{market.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="sd-lou-vehicle-class" className="text-xs font-semibold text-foreground/80">Vehicle Class / Rate Basis</Label>
                <select id="sd-lou-vehicle-class" value={louVehicleClass} onChange={(event) => { const selected = louVehicleOptions.find((vehicle) => vehicle.model === event.target.value); setLouVehicleClass(event.target.value); setLouDailyRate(selected?.dailyRate.toFixed(2) || ""); }} className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs">
                  <option value="">Select vehicle type / model year…</option>
                  {louVehicleClass && !louPublishedRate && <option value={louVehicleClass} disabled>{louVehicleClass} — no published rate; reselect</option>}
                  {louVehicleOptions.map((vehicle) => <option key={vehicle.model} value={vehicle.model}>{vehicle.model} — ${vehicle.weeklyRate.toFixed(2)}/week · ${vehicle.dailyRate.toFixed(2)}/day</option>)}
                </select>
              </div>
            </div>
            {louMarket && <p id="sd-lou-rate-source" className="mt-2 text-[11px] leading-4 text-muted-foreground">{louRateSourceLabel(louMarket)} Blank / not-offered cells are excluded. Confirm applicability to this repair period.</p>}
            {louVehicleClass && !louPublishedRate && <p role="alert" className="mt-2 text-xs text-destructive">No published rate for this vehicle/model-year in this market. Select an offered type or enter a documented manual daily rate; no other market's rate is substituted.</p>}
            <div className="mt-3 grid gap-2 border-t border-slate-200 pt-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Repair Facility" id="sd-lou-facility" value={louRepairFacility} onChange={setLouRepairFacility} placeholder="e.g. Total Recon — Laurel" />
              <Field label="RO Number (from estimate)" id="sd-lou-ro" value={louRoNumber} onChange={setLouRoNumber} placeholder="Pre-fills from estimate when available" />
              <div className="rounded-md border border-dashed border-slate-300 bg-white px-2 py-1.5 text-[11px] text-muted-foreground">
                <p className="font-semibold text-foreground/80">Utilization support</p>
                <p>{louUtilizationLoading ? "Loading market utilization…" : louUtilizationSnapshots.length ? `${louUtilizationSnapshots.length} monthly snapshot${louUtilizationSnapshots.length === 1 ? "" : "s"} · ${louUtilizationSnapshots.find((snapshot) => snapshot.utilization !== "—")?.utilization || "rate unavailable"}` : "Enter a valid repair range to retrieve utilization."}</p>
              </div>
              <Field label="Repair Start" id="sd-lou-start" value={louRepairStart} onChange={setLouRepairStart} type="date" />
              <Field label="Repair End" id="sd-lou-end" value={louRepairEnd} onChange={setLouRepairEnd} type="date" />
              <Field label="Daily Rental Rate ($)" id="sd-lou-rate" value={louDailyRate} onChange={setLouDailyRate} placeholder="0.00" type="number" />
              <Field label="Registered Owner" id="sd-lou-owner" value={louRegisteredOwner} onChange={setLouRegisteredOwner} placeholder="e.g. Metrocars Leasing Corp." />
              <div className="flex items-end gap-2">
                <div className="min-w-[86px] rounded-md border bg-background px-2 py-1.5 text-right">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{louRepairDays} days</p>
                  <output className="block text-sm font-bold text-foreground">${louCalculatedTotal.toFixed(2)}</output>
                </div>
                <Button type="button" size="sm" className="h-8 whitespace-nowrap bg-[#171b31] text-xs text-white hover:bg-[#1e2340]" onClick={applyLouCalculation}>Add to demand</Button>
              </div>
            </div>
            <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-foreground/80">
              <Checkbox checked={louSupportEnabled} onCheckedChange={(checked) => setLouSupportEnabled(checked === true)} className="mt-0.5 h-3.5 w-3.5" />
              <span><strong>Include full LOU support schedule in this settlement packet.</strong> The PDF will append repair-period details, reconciled monthly utilization snapshots, rate basis, calculation, and support narrative.</span>
            </label>
          </section>
          <Grid2 children={<>
            {form.demandType === "repair" ? (
              <Field label="Repair Estimate ($)" id="sd-repair" value={form.repair} onChange={set("repair")} placeholder="0.00" />
            ) : (
              <Field label="Vehicle Valuation (ACV) ($)" id="sd-val" value={form.valuation} onChange={set("valuation")} placeholder="0.00" />
            )}
            <Field label="Towing / Transport ($)" id="sd-tow" value={form.tow} onChange={set("tow")} placeholder="0.00" />
            <Field label="Diminished Value ($)" id="sd-dv" value={form.dv} onChange={set("dv")} placeholder="0.00" />
            <Field label="Loss of Use / Rental ($)" id="sd-lou" value={form.lou} onChange={set("lou")} placeholder="0.00" />
          </>} />
	          <div className="mt-3">
	            <Field label="Storage ($)" id="sd-storage" value={form.storage} onChange={set("storage")} placeholder="0.00" />
	          </div>
	          {form.demandType === "total-loss" && (
	            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
	              <Field label="Sales Tax ($)" id="sd-sales-tax" value={form.salesTax} onChange={set("salesTax")} placeholder="0.00" />
	              <Field label="Admin Fee ($)" id="sd-admin-fee" value={form.adminFee} onChange={set("adminFee")} placeholder="0.00" />
	              <Field label="Salvage (Deducted) ($)" id="sd-salvage" value={form.salvageDeducted} onChange={set("salvageDeducted")} placeholder="0.00" />
	            </div>
	          )}
          <div className="mt-3 p-2 bg-[#ff6221]/10 rounded border border-[#ff6221]/20">
            <div className="text-xs font-mono font-bold text-[#ff6221]">TOTAL DEMAND: ${total}</div>
          </div>
          <div className="mt-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-foreground/80">Attachments (select all that apply)</Label>
              <div className="grid grid-cols-2 gap-1.5 mt-1">
                {ATTACHMENT_OPTIONS.map(att => (
                  <label key={att} className="flex items-center gap-2 cursor-pointer select-none">
                    <Checkbox
                      checked={selectedAttachments.includes(att)}
                      onCheckedChange={() => toggleAttachment(att)}
                      className="h-3.5 w-3.5"
                    />
                    <span className="text-xs text-foreground/80">{att}</span>
                  </label>
                ))}
              </div>
              {selectedAttachments.length > 0 && (
                <p className="text-[10px] text-muted-foreground mt-1">Will print: {attachmentsText}</p>
              )}
            </div>
          </div>
          <div className="mt-3">
            <Grid2>
              <HandlerSelect
                value={handlerName}
                onChange={setHandlerName}
                onHandlerChange={(handler) => setHandlerExtension(handler.extension ?? "")}
                label="Handler / Signatory"
                id="sd-handler"
              />
              <Field label="Handler Phone Extension" id="sd-handler-extension" value={handlerExtension} onChange={setHandlerExtension} placeholder="e.g. 1234" />
            </Grid2>
            <p className="mt-1 text-[10px] leading-4 text-muted-foreground">Selecting a Whip handler automatically fills the extension from the IVR directory. You may edit it when a claim requires a different contact extension.</p>
            <Button type="button" variant="outline" size="sm" className="mt-2 h-8 w-full gap-1.5 border-[#ff6221]/50 text-xs text-[#ff6221] hover:bg-[#ff6221]/10" onClick={handlePreview}>
              <Eye className="h-3.5 w-3.5" /> Preview formatted demand PDF
            </Button>
          </div>
        </Panel>
      </div>
      <PreviewPanel
        text={preview}
        onCopy={() => { navigator.clipboard.writeText(preview); toast.success("Copied"); }}
        onPreview={handlePreview}
        onDownload={handleDownload}
        pdfUrl={previewPdfUrl}
      />
    </div>
    </div>
  );
}

// ─── Tab: Carrier Rebuttal ────────────────────────────────────────────────────
interface RebuttalLineItem {
  item: string;
  ours: string;
  theirs: string;
  reason: string;
}

type CarrierRebuttalCategory = "scan" | "structure" | "calibration" | "parts" | "other";
type CarrierRebuttalLine = {
  id: string;
  category: CarrierRebuttalCategory;
  item: string;
  ours: string;
  theirs: string;
  carrierReason: string;
  ourLine: string;
  carrierLine: string;
  exhibitLetter: string;
  exhibitMarkedPage: string;
  basis: string;
  sourceKey: string;
  evidenceConfirmed: boolean;
};
type CarrierRebuttalExhibit = {
  id: string;
  letter: string;
  title: string;
  source: string;
  revisionDate: string;
  markedPage: string;
};

type CarrierRebuttalForm = {
  letterDate: string;
  claimNumber: string;
  theirClaimNumber: string;
  dateOfLoss: string;
  vehicle: string;
  vehicleYear: string;
  vehicleMake: string;
  vehicleModel: string;
  vin: string;
  carrier: string;
  adjuster: string;
  insuredName: string;
  liabilityStatus: "accepted" | "not_disputed";
  oem: "tesla" | "toyota" | "lexus" | "other";
  repairFacility: string;
  repairFacilityLocation: string;
  roNumber: string;
  ourEstimateDate: string;
  carrierEstimateDate: string;
  whipEstimateTotal: string;
  carrierEstimateTotal: string;
  responseDays: string;
  dopAttached: boolean;
  handlerName: string;
  handlerTitle: string;
  handlerEmail: string;
  handlerExt: string;
  stateRuleCitation: string;
  stateRuleText: string;
  stateRuleVerified: boolean;
};

const CARRIER_REBUTTAL_STORAGE_KEY = "whip_carrier_rebuttal_v2";
const carrierCategories: Array<{ value: CarrierRebuttalCategory; label: string }> = [
  { value: "scan", label: "Scan / diagnostic" },
  { value: "structure", label: "Structure / restraint" },
  { value: "calibration", label: "Calibration" },
  { value: "parts", label: "Parts / corrosion" },
  { value: "other", label: "Other operation" },
];
const emptyCarrierLine = (): CarrierRebuttalLine => ({
  id: crypto.randomUUID(), category: "other", item: "", ours: "", theirs: "", carrierReason: "", ourLine: "", carrierLine: "", exhibitLetter: "", exhibitMarkedPage: "", basis: "", sourceKey: "", evidenceConfirmed: false,
});
const emptyCarrierExhibit = (): CarrierRebuttalExhibit => ({
  id: crypto.randomUUID(), letter: "", title: "", source: "", revisionDate: "", markedPage: "",
});
const initialCarrierForm = (): CarrierRebuttalForm => ({
  letterDate: new Date().toISOString().slice(0, 10), claimNumber: "", theirClaimNumber: "", dateOfLoss: "", vehicle: "", vehicleYear: "", vehicleMake: "", vehicleModel: "", vin: "", carrier: "", adjuster: "", insuredName: "",
  liabilityStatus: "accepted", oem: "tesla", repairFacility: "Total Recon", repairFacilityLocation: "", roNumber: "", ourEstimateDate: "", carrierEstimateDate: "", whipEstimateTotal: "", carrierEstimateTotal: "",
  responseDays: "10", dopAttached: true, handlerName: "", handlerTitle: "Claims Representative", handlerEmail: "claims@drivewhip.com", handlerExt: "",
  stateRuleCitation: "", stateRuleText: "", stateRuleVerified: false,
});
const carrierMoney = (value: string) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toLocaleString("en-US", { style: "currency", currency: "USD" }) : "$0.00";
};
const carrierDate = (value: string) => {
  if (!value) return "[Date]";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};

function CarrierRebuttalTab() {
  const [form, setForm] = useState<CarrierRebuttalForm>(initialCarrierForm);
  const [lineItems, setLineItems] = useState<CarrierRebuttalLine[]>([emptyCarrierLine()]);
  const [exhibits, setExhibits] = useState<CarrierRebuttalExhibit[]>([]);
  const [narrative, setNarrative] = useState("");
  const [ourEstimate, setOurEstimate] = useState<File | null>(null);
  const [supportingEvidence, setSupportingEvidence] = useState<File | null>(null);
  const [carrierResponse, setCarrierResponse] = useState<File | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisWarnings, setAnalysisWarnings] = useState<string[]>([]);
  const [selectedClaimSourceIds, setSelectedClaimSourceIds] = useState<string[]>([]);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [polishLoading, setPolishLoading] = useState(false);
  const [claudeReview, setClaudeReview] = useState<{ reviewId: number; status: string; modelId: string; output: { factGaps?: Array<{ field: string; message: string }>; citationApplicabilityWarnings?: string[]; neutralDisputeRows?: Array<{ lineId: string; wording: string }>; draftNarrative?: string; handlerVerificationRequired?: boolean } } | null>(null);
  const polishMutation = trpc.docgen.polishRebuttal.useMutation();
  const claudeReviewMutation = trpc.docgen.reviewCarrierRebuttalWithClaude.useMutation();
  const claimSourceAnalysisMutation = trpc.docgen.analyzeCarrierRebuttalClaimSource.useMutation();
  const vehicleYearNumber = Number(form.vehicleYear);
  const sourceQueryInput = useMemo(() => ({
    vehicleYear: Number.isInteger(vehicleYearNumber) ? vehicleYearNumber : 1900,
    vehicleMake: form.vehicleMake.trim() || "Tesla",
    vehicleModel: form.vehicleModel.trim() || "Model 3",
  }), [vehicleYearNumber, form.vehicleMake, form.vehicleModel]);
  const oemSourcesQuery = trpc.docgen.carrierRebuttalOemSources.useQuery(sourceQueryInput, {
    enabled: form.oem === "tesla" && Number.isInteger(vehicleYearNumber) && vehicleYearNumber >= 2017 && Boolean(form.vehicleMake.trim()) && Boolean(form.vehicleModel.trim()),
    staleTime: 5 * 60_000,
  });
  const claimSourcesQuery = trpc.docgen.carrierRebuttalClaimSources.useQuery({ claimNumber: form.claimNumber.trim() }, {
    enabled: Boolean(form.claimNumber.trim()),
    staleTime: 30_000,
  });
  const claudeAvailabilityQuery = trpc.docgen.carrierRebuttalClaudeAvailability.useQuery(undefined, {
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CARRIER_REBUTTAL_STORAGE_KEY) || "{}") as Partial<{ form: CarrierRebuttalForm; lineItems: CarrierRebuttalLine[]; exhibits: CarrierRebuttalExhibit[]; narrative: string; selectedClaimSourceIds: string[] }>;
      if (saved.form) setForm({ ...initialCarrierForm(), ...saved.form, oem: "tesla" });
      if (Array.isArray(saved.lineItems) && saved.lineItems.length) setLineItems(saved.lineItems.map((line) => ({ ...emptyCarrierLine(), ...line })));
      if (Array.isArray(saved.exhibits)) setExhibits(saved.exhibits);
      if (typeof saved.narrative === "string") setNarrative(saved.narrative);
      if (Array.isArray(saved.selectedClaimSourceIds)) setSelectedClaimSourceIds(saved.selectedClaimSourceIds.filter((id) => /^mail:\d+:(body|file:\d+)$/.test(id)).slice(0, 12));
    } catch { /* malformed local draft is safely ignored */ }
  }, []);
  useEffect(() => {
    localStorage.setItem(CARRIER_REBUTTAL_STORAGE_KEY, JSON.stringify({ form, lineItems, exhibits, narrative, selectedClaimSourceIds }));
  }, [form, lineItems, exhibits, narrative, selectedClaimSourceIds]);

  const set = <K extends keyof CarrierRebuttalForm>(key: K) => (value: CarrierRebuttalForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const updateLine = <K extends keyof CarrierRebuttalLine>(id: string, key: K, value: CarrierRebuttalLine[K]) => setLineItems((current) => current.map((line) => line.id === id ? { ...line, [key]: value } : line));
  const updateExhibit = (id: string, key: keyof CarrierRebuttalExhibit, value: string) => setExhibits((current) => current.map((exhibit) => exhibit.id === id ? { ...exhibit, [key]: value } : exhibit));
  const disputedLines = lineItems.filter((line) => Number(line.ours) > Number(line.theirs));
  const lineWhipTotal = disputedLines.reduce((sum, line) => sum + (Number(line.ours) || 0), 0);
  const lineCarrierTotal = disputedLines.reduce((sum, line) => sum + (Number(line.theirs) || 0), 0);
  const lineGap = lineWhipTotal - lineCarrierTotal;
  const whipTotal = Number(form.whipEstimateTotal);
  const carrierTotal = Number(form.carrierEstimateTotal);
  const gap = whipTotal - carrierTotal;
  const estimateTotalsValid = Number.isFinite(whipTotal) && Number.isFinite(carrierTotal) && whipTotal > 0 && carrierTotal >= 0;

  const validationErrors = () => {
    const missing: string[] = [];
    (["letterDate", "claimNumber", "theirClaimNumber", "dateOfLoss", "vehicle", "vin", "carrier", "adjuster", "insuredName", "repairFacility", "roNumber", "ourEstimateDate", "carrierEstimateDate", "whipEstimateTotal", "carrierEstimateTotal", "handlerName", "handlerTitle", "handlerEmail"] as Array<keyof CarrierRebuttalForm>).forEach((key) => {
      if (!String(form[key] || "").trim()) missing.push(key);
    });
    if (missing.length) return ["Complete all required case, repair, estimate-total, carrier, and handler fields before generating."];
    if (form.liabilityStatus !== "accepted" && form.liabilityStatus !== "not_disputed") return ["This letter is available only when liability is accepted or not disputed. Route all other liability positions to the liability desk."];
    if (form.oem !== "tesla") return ["The current source-aware Carrier Rebuttal library is limited to Tesla Model 3 and Model Y. Toyota/TIS remains pending authorized source material."];
    if (!estimateTotalsValid) return ["Enter valid full carrier and Whip repair-estimate totals."];
    if (!disputedLines.length) return ["Add at least one disputed operation with our amount greater than the carrier allowance."];
    const lineGaps = disputedLines.filter((line) => !line.item || !line.ourLine || !line.carrierLine || !line.exhibitLetter || !line.exhibitMarkedPage || !line.basis);
    if (lineGaps.length) return ["Each disputed operation needs both estimate-line references, an exhibit letter/marked page, and a factual basis."];
    const unlisted = disputedLines.filter((line) => !exhibits.some((exhibit) => exhibit.letter.toUpperCase() === line.exhibitLetter.toUpperCase() && exhibit.markedPage === line.exhibitMarkedPage));
    if (unlisted.length) return ["Each disputed operation must point to an Exhibit Schedule entry with the same letter and marked page."];
    if (Math.abs(lineGap - gap) > 0.01) return [`The disputed-line difference (${carrierMoney(lineGap.toFixed(2))}) does not equal Whip total minus carrier total (${carrierMoney(gap.toFixed(2))}). Explain the gap outside this letter or correct the lines/totals.`];
    const anyStateRule = Boolean(form.stateRuleCitation || form.stateRuleText || form.stateRuleVerified);
    if (anyStateRule && (!form.stateRuleCitation || !form.stateRuleText || !form.stateRuleVerified)) return ["A state-rule paragraph requires a verified citation, the exact rule text, and the confirmation checkbox."];
    if (form.oem === "tesla") {
      if (!Number.isInteger(vehicleYearNumber) || !form.vehicleMake.trim() || !form.vehicleModel.trim()) return ["Confirm the Tesla year, make, and model before selecting procedure support."];
      if (oemSourcesQuery.data?.coverageGap) return [oemSourcesQuery.data.coverageGap];
      if (!oemSourcesQuery.data?.applicableSources?.length) return ["No exact active Tesla collision-procedure family is available for this confirmed vehicle. Do not use a generic Tesla citation."];
      if (disputedLines.some((line) => !line.sourceKey || !line.evidenceConfirmed)) return ["Each disputed Tesla operation requires an exact official procedure source and the handler verification checkbox."];
      const applicableKeys = new Set(oemSourcesQuery.data.applicableSources.map((source) => source.sourceKey));
      if (disputedLines.some((line) => !applicableKeys.has(line.sourceKey))) return ["A selected procedure source no longer matches the confirmed vehicle. Re-select the exact year/model family source and verify the marked evidence again."];
    }
    return [];
  };

  const buildNarrative = () => {
    const errors = validationErrors();
    if (errors.length) { toast.error(errors[0]); return; }
    setNarrative(`The marked exhibits identify the line-specific support for this request: ${disputedLines.map((line) => `${line.item} (Whip line ${line.ourLine}; carrier line ${line.carrierLine}; Exhibit ${line.exhibitLetter}, marked page ${line.exhibitMarkedPage})`).join("; ")}.`);
    toast.success("Verified line-specific notes prepared — review before previewing.");
  };

  const polishNarrative = async () => {
    if (!narrative.trim()) { toast.error("Generate or enter a claim-specific narrative first."); return; }
    setPolishLoading(true);
    try {
      const result = await polishMutation.mutateAsync({ draft: narrative, claimNumber: form.claimNumber, vehicle: form.vehicle, carrier: form.carrier, adjuster: form.adjuster, dateOfLoss: form.dateOfLoss });
      setNarrative(result.polished);
      toast.success("Narrative polished without adding unsupported authority.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not polish the narrative. Keep or edit it manually.");
    } finally { setPolishLoading(false); }
  };

  const setVehicleSourceField = (key: "vehicleYear" | "vehicleMake" | "vehicleModel") => (value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setLineItems((current) => current.map((line) => ({ ...line, sourceKey: "", evidenceConfirmed: false })));
    setClaudeReview(null);
  };

  const requestClaudeReview = async () => {
    const errors = validationErrors();
    if (errors.length) { toast.error(errors[0]); return; }
    try {
      const result = await claudeReviewMutation.mutateAsync({
        claimNumber: form.claimNumber,
        vehicleYear: vehicleYearNumber,
        vehicleMake: form.vehicleMake,
        vehicleModel: form.vehicleModel,
        vin: form.vin,
        carrier: form.carrier,
        adjuster: form.adjuster,
        dateOfLoss: form.dateOfLoss,
        selectedSourceKeys: Array.from(new Set(disputedLines.map((line) => line.sourceKey))),
        selectedClaimSourceIds,
        disputedLines: disputedLines.map((line) => ({
          id: line.id,
          item: line.item,
          carrierReason: line.carrierReason,
          ourLine: line.ourLine,
          carrierLine: line.carrierLine,
          sourceKey: line.sourceKey,
          exhibitLetter: line.exhibitLetter,
          exhibitMarkedPage: line.exhibitMarkedPage,
          basis: line.basis,
          evidenceConfirmed: line.evidenceConfirmed as true,
        })),
        existingNarrative: narrative,
      });
      setClaudeReview(result);
      toast.success(result.status === "claude_completed" ? "Claude review saved for team verification." : "Manual-review fallback saved; no substitute model was used.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the source-aware review.");
    }
  };

  const applyCarrierAnalysis = (data: {
    estimate?: { repairTotal?: string; vehicle?: string; vin?: string; claimNumber?: string; claimNumberRole?: string; dateOfLoss?: string; repairFacility?: string; repairFacilityLocation?: string; roNumber?: string; estimateDate?: string; claimantName?: string; lineItems?: Array<{ description: string; amount: string; estimateLine: string }> };
    carrier?: { carrierName?: string; carrierClaimNumber?: string; adjusterName?: string; estimateDate?: string; offerTotal?: string; denialReasons?: string; lineItems?: Array<{ description: string; offer: string; reason: string; estimateLine: string }> };
    evidenceSuggestions?: Array<{ title: string; source: string; revisionDate: string; markedPage: string; note: string }>;
    warnings?: string[];
  }) => {
    setAnalysisWarnings(data.warnings || []);
    const detectedVehicle = (data.estimate?.vehicle || "").match(/\b(20\d{2}|19\d{2})\s+(Tesla)\s+(Model\s*[3Y])\b/i);
    setForm((current) => ({
      ...current,
      vehicle: data.estimate?.vehicle || current.vehicle,
      vehicleYear: detectedVehicle?.[1] || current.vehicleYear,
      vehicleMake: detectedVehicle?.[2] || current.vehicleMake,
      vehicleModel: detectedVehicle?.[3]?.replace(/\s+/g, " ") || current.vehicleModel,
      vin: data.estimate?.vin || current.vin,
      claimNumber: data.estimate?.claimNumberRole === "our" ? (data.estimate.claimNumber || current.claimNumber) : current.claimNumber,
      dateOfLoss: data.estimate?.dateOfLoss || current.dateOfLoss,
      repairFacility: data.estimate?.repairFacility || current.repairFacility,
      repairFacilityLocation: data.estimate?.repairFacilityLocation || current.repairFacilityLocation,
      roNumber: data.estimate?.roNumber || current.roNumber,
      ourEstimateDate: data.estimate?.estimateDate || current.ourEstimateDate,
      insuredName: data.estimate?.claimantName || current.insuredName,
      carrier: data.carrier?.carrierName || current.carrier,
      theirClaimNumber: data.carrier?.carrierClaimNumber || current.theirClaimNumber,
      adjuster: data.carrier?.adjusterName || current.adjuster,
      carrierEstimateDate: data.carrier?.estimateDate || current.carrierEstimateDate,
      whipEstimateTotal: data.estimate?.repairTotal || current.whipEstimateTotal,
      carrierEstimateTotal: data.carrier?.offerTotal || current.carrierEstimateTotal,
    }));
    const ourLines = data.estimate?.lineItems || [];
    const carrierLines = data.carrier?.lineItems || [];
    if (ourLines.length || carrierLines.length) {
      const rows = ourLines.length ? ourLines.map((line, index) => {
        const match = carrierLines.find((carrier) => carrier.description.toLowerCase() === line.description.toLowerCase()) || carrierLines[index];
        return { ...emptyCarrierLine(), item: line.description, ours: line.amount, theirs: match?.offer || "", carrierReason: match?.reason || data.carrier?.denialReasons || "", ourLine: line.estimateLine, carrierLine: match?.estimateLine || "" };
      }) : carrierLines.map((line) => ({ ...emptyCarrierLine(), item: line.description, theirs: line.offer, carrierReason: line.reason, carrierLine: line.estimateLine }));
      setLineItems(rows.length ? rows : [emptyCarrierLine()]);
    }
    if (data.evidenceSuggestions?.length) {
      setExhibits((current) => [...current, ...data.evidenceSuggestions!.map((item, index) => ({ ...emptyCarrierExhibit(), letter: String.fromCharCode(65 + Math.min(25, current.length + index)), title: item.title, source: item.source, revisionDate: item.revisionDate, markedPage: item.markedPage }))]);
    }
  };

  const analyzeSources = async () => {
    if (!ourEstimate && !supportingEvidence && !carrierResponse) { toast.error("Add at least one supported source document first."); return; }
    setAnalysisLoading(true); setAnalysisWarnings([]);
    try {
      const payload = new FormData();
      if (ourEstimate) payload.append("ourEstimate", ourEstimate);
      if (supportingEvidence) payload.append("supportingEvidence", supportingEvidence);
      if (carrierResponse) payload.append("carrierResponse", carrierResponse);
      const response = await fetch("/api/carrier-rebuttal/analyze", { method: "POST", body: payload });
      const data = await response.json() as {
        estimate?: { repairTotal?: string; vehicle?: string; vin?: string; claimNumber?: string; claimNumberRole?: string; dateOfLoss?: string; repairFacility?: string; repairFacilityLocation?: string; roNumber?: string; estimateDate?: string; claimantName?: string; lineItems?: Array<{ description: string; amount: string; estimateLine: string }> };
        carrier?: { carrierName?: string; carrierClaimNumber?: string; adjusterName?: string; estimateDate?: string; offerTotal?: string; denialReasons?: string; lineItems?: Array<{ description: string; offer: string; reason: string; estimateLine: string }> };
        evidenceSuggestions?: Array<{ title: string; source: string; revisionDate: string; markedPage: string; note: string }>;
        warnings?: string[]; error?: string;
      };
      if (!response.ok) throw new Error(data.error || "Could not analyze sources.");
      applyCarrierAnalysis(data);
      toast.success("Source facts were read in memory. Verify every field, line reference, exhibit, and marked page before generating.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not analyze the source documents.");
    } finally { setAnalysisLoading(false); }
  };

  const analyzeClaimSource = async (sourceId: string, kind: "ourEstimate" | "supportingEvidence" | "carrierResponse") => {
    if (!form.claimNumber.trim()) { toast.error("Enter the Whip claim number before selecting claim source material."); return; }
    setAnalysisLoading(true); setAnalysisWarnings([]);
    try {
      const data = await claimSourceAnalysisMutation.mutateAsync({ claimNumber: form.claimNumber.trim(), sourceId, kind });
      applyCarrierAnalysis(data);
      setSelectedClaimSourceIds((current) => current.includes(sourceId) ? current : [...current, sourceId].slice(0, 12));
      toast.success("Selected claim source was read in request memory. Verify every field, line reference, exhibit, and marked page before generating.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not analyze the selected claim source.");
    } finally { setAnalysisLoading(false); }
  };

  const oemStandard = (): string => "The disputed lines below identify the handler-selected, vehicle-matched Tesla procedure-family source and the marked case exhibit supporting the stated factual basis. This request is limited to those identified lines and exhibits; please address each line in writing if a reduction is maintained.";
  const liabilityText = form.liabilityStatus === "accepted" ? "Liability is accepted." : "Liability is not disputed.";
  const openingParagraph = () => `Your insured’s vehicle struck our vehicle on ${carrierDate(form.dateOfLoss)}. ${liabilityText} Your estimate dated ${carrierDate(form.carrierEstimateDate)} totals ${carrierMoney(carrierTotal.toFixed(2))}. The estimate prepared by ${form.repairFacility} after inspecting the vehicle, dated ${carrierDate(form.ourEstimateDate)}, totals ${carrierMoney(whipTotal.toFixed(2))}. The difference is ${carrierMoney(gap.toFixed(2))} across ${disputedLines.length} line${disputedLines.length === 1 ? "" : "s"}. Each line is listed below with the support for it.`;
  const revisedPayment = () => `Revise your estimate to ${carrierMoney(whipTotal.toFixed(2))}, the total of ours, and pay the difference of ${carrierMoney(gap.toFixed(2))}. If you maintain a reduction on any line, send the written basis for that line, naming the procedure, document or fact you rely on. A general statement that the estimate is not supported does not answer a line-item dispute. Please respond within ${form.responseDays || "10"} days of receipt.`;
  const paymentParagraph = () => "Metrocars Leasing Corp. owns the vehicle. Issue payment as directed in the attached Direction of Pay and Vehicle Ownership Notice.";
  const reservationParagraph = () => "Please reference both claim numbers on all correspondence and send it to claims@drivewhip.com. This letter does not waive any right or remedy of Metrocars Leasing Corp. or Whip Claims Management, and does not concede any position on coverage, liability or the amount of loss.";
  const sortedLines = () => [...disputedLines].sort((a, b) => carrierCategories.findIndex((category) => category.value === a.category) - carrierCategories.findIndex((category) => category.value === b.category));
  const cleanSource = (source: string) => source.replace(/\?utm_[^\s]*/gi, "").trim();
  const enclosureText = () => [
    ...exhibits.filter((exhibit) => exhibit.letter && exhibit.title).map((exhibit) => `Exhibit ${exhibit.letter}: ${exhibit.title}`),
    `${form.repairFacility} repair estimate`,
    "Photos",
    ...(form.dopAttached ? ["Direction of Pay and Vehicle Ownership Notice"] : []),
  ].join("; ");

  const createLetterPdf = () => {
    const errors = validationErrors();
    if (errors.length) { toast.error(errors[0]); return null; }
    // The user-supplied reference is A4, with a restrained first-page Whip
    // letterhead and a compact second-page close. Keep these measurements local
    // so this rebuttal stays faithful without changing other generators.
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth(); const H = doc.internal.pageSize.getHeight();
    const left = 25.4; const right = W - 25.4; const textWidth = right - left;
    const tableRight = W - 19; const tableWidth = tableRight - left;
    const footerRuleY = H - 18; const safeBottom = footerRuleY - 6.5;
    let y = 43; let page = 1;
    const header = () => {
      // This source asset carries a transparent alpha channel. Do not substitute
      // typed text: the reference requires the actual orange Whip mark.
      doc.addImage(`data:image/png;base64,${WHIP_LOGO_B64}`, "PNG", left, 17, 18, 11.92);
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(26, 26, 26);
      doc.text("Whip Claims Management", right, 18, { align: "right" });
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(92, 92, 92);
      doc.text("P.O. Box 10622  Rockville, MD 20849-0622", right, 21.9, { align: "right" });
      doc.text("(855) 906-5949  |  claims@drivewhip.com", right, 25.8, { align: "right" });
      doc.setDrawColor(190, 190, 190); doc.setLineWidth(.25); doc.line(left, 36, right, 36);
    };
    const footer = () => {
      doc.setDrawColor(190, 190, 190); doc.setLineWidth(.25); doc.line(left, footerRuleY, right, footerRuleY);
      doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(100, 100, 100);
      doc.text("Whip Claims Management  |  PO BOX 10622 Rockville, MD 20850  |  (855) 906-5949", W / 2, H - 14, { align: "center" });
    };
    const addPage = () => { footer(); doc.addPage(); page += 1; y = 20; };
    const ensure = (height: number) => { if (y + height > safeBottom) addPage(); };
    const prose = (text: string, options: { keep?: boolean } = {}) => {
      const lines = doc.splitTextToSize(text, textWidth) as string[]; const lineHeight = 5.15;
      if (options.keep && y + lines.length * lineHeight + 3 > safeBottom) addPage();
      let offset = 0;
      while (offset < lines.length) {
        const count = Math.max(1, Math.floor((safeBottom - y) / lineHeight));
        const part = lines.slice(offset, offset + count);
        doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(24, 24, 24);
        doc.text(part, left, y, { lineHeightFactor: 1.5 });
        y += part.length * lineHeight; offset += part.length;
        if (offset < lines.length) addPage();
      }
      y += 2.7;
    };
    const idRow = (label: string, value: string) => {
      ensure(4.7); doc.setFont("helvetica", "bold"); doc.setFontSize(9.3); doc.setTextColor(25, 25, 25); doc.text(label, left, y);
      doc.setFont("helvetica", "normal"); doc.text(value, left + 39.5, y); y += 4.25;
    };
    const sectionHeading = (label: string, body: string) => {
      // The table uses a smaller type size than the prose. Restore the body font
      // before measuring so a complete section moves together instead of leaving
      // one line stranded at the top of the continuation page.
      doc.setFont("helvetica", "normal"); doc.setFontSize(10);
      const lines = doc.splitTextToSize(body, textWidth) as string[]; const height = 4.4 + lines.length * 5.15 + 2.7;
      if (y + height > safeBottom) addPage();
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(24, 24, 24); doc.text(label, left, y); y += 5.15;
      prose(body);
    };
    const exhibitSupport = (line: CarrierRebuttalLine) => {
      const exhibit = exhibits.find((item) => item.letter.toUpperCase() === line.exhibitLetter.toUpperCase() && item.markedPage === line.exhibitMarkedPage);
      const source = exhibit ? [exhibit.source, exhibit.title, exhibit.revisionDate].filter(Boolean).join("; ") : "";
      return `Exhibit ${line.exhibitLetter}: ${[source, line.basis, `Estimate line ${line.ourLine}.`].filter(Boolean).join(" ")}`;
    };
    const formatRange = (letters: string[]) => {
      const unique = Array.from(new Set(letters.filter(Boolean).map((letter) => letter.toUpperCase())));
      if (!unique.length) return "";
      if (unique.length === 1) return `Exhibit ${unique[0]}`;
      return `Exhibits ${unique[0]}–${unique[unique.length - 1]}`;
    };
    header();
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(24, 24, 24); doc.text(carrierDate(form.letterDate), left, y); y += 8;
    prose(`Re: Claim #${form.claimNumber} — Carrier Claim No. ${form.theirClaimNumber} — Date of Loss: ${carrierDate(form.dateOfLoss)}`, { keep: true });
    prose(`To:  ${form.adjuster}, ${form.carrier}`, { keep: true });
    ensure(8); doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(18, 18, 18); doc.text("Request for Reconsideration of Repair Estimate", left, y); y += 6.2;
    idRow("Your insured", form.insuredName);
    idRow("Vehicle owner", "Metrocars Leasing Corp.");
    idRow("Vehicle", `${form.vehicle} / VIN ${form.vin}`);
    idRow("Repair facility", `${form.repairFacility}${form.repairFacilityLocation ? `, ${form.repairFacilityLocation}` : ""} — RO ${form.roNumber}, estimate dated ${carrierDate(form.ourEstimateDate)}`);
    y += 1.8;
    prose(openingParagraph(), { keep: true });
    prose(oemStandard());
    if (narrative.trim()) prose(narrative.trim());
    if (form.stateRuleCitation && form.stateRuleText) prose(`${form.stateRuleCitation}: ${form.stateRuleText}`);

    const col = [left, left + 8.5, left + 43.8, left + 64.1, left + 86.1, left + 105.5, tableRight];
    const headerHeight = 9.3;
    const drawCellBorders = (top: number, height: number) => {
      doc.setDrawColor(130, 130, 130); doc.setLineWidth(.18); doc.rect(left, top, tableWidth, height);
      col.slice(1, -1).forEach((x) => doc.line(x, top, x, top + height));
    };
    const tableHeader = () => {
      if (y + headerHeight > safeBottom) addPage();
      doc.setFillColor(231, 231, 231); doc.rect(left, y, tableWidth, headerHeight, "F"); drawCellBorders(y, headerHeight);
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.6); doc.setTextColor(25, 25, 25);
      const headings = ["#", "Operation", ["Your", "estimate"], ["Our", "estimate"], "Difference", "Support (attached)"];
      headings.forEach((heading, index) => {
        const x = col[index] + 1.2;
        if (Array.isArray(heading)) doc.text(heading, x, y + 3.6, { lineHeightFactor: 1.05 });
        else doc.text(heading, x, y + 4.8);
      });
      y += headerHeight;
    };
    tableHeader();
    const linesForOutput = sortedLines();
    linesForOutput.forEach((line, index) => {
      const operation = doc.splitTextToSize(line.item, col[2] - col[1] - 2.4) as string[];
      const support = doc.splitTextToSize(exhibitSupport(line), col[6] - col[5] - 2.4) as string[];
      const minimumLines = Math.max(operation.length, support.length, 1);
      const rowHeight = Math.max(10.5, minimumLines * 3.45 + 3.7);
      if (y + rowHeight > safeBottom) { addPage(); tableHeader(); }
      drawCellBorders(y, rowHeight);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.15); doc.setTextColor(24, 24, 24);
      doc.text(String(index + 1), col[0] + 1.2, y + 4);
      doc.text(operation, col[1] + 1.2, y + 4, { lineHeightFactor: 1.18 });
      doc.text(carrierMoney(line.theirs), col[2] + 1.2, y + 4);
      doc.text(carrierMoney(line.ours), col[3] + 1.2, y + 4);
      doc.text(carrierMoney((Number(line.ours) - Number(line.theirs)).toFixed(2)), col[4] + 1.2, y + 4);
      doc.setFontSize(7.8); doc.text(support, col[5] + 1.2, y + 3.8, { lineHeightFactor: 1.16 });
      y += rowHeight;
    });
    const totalHeight = 8.4;
    if (y + totalHeight > safeBottom) { addPage(); tableHeader(); }
    drawCellBorders(y, totalHeight);
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.15); doc.setTextColor(24, 24, 24);
    doc.text("Total in dispute", col[1] + 1.2, y + 5.2);
    doc.text(carrierMoney(lineCarrierTotal.toFixed(2)), col[2] + 1.2, y + 5.2);
    doc.text(carrierMoney(lineWhipTotal.toFixed(2)), col[3] + 1.2, y + 5.2);
    doc.text(carrierMoney(lineGap.toFixed(2)), col[4] + 1.2, y + 5.2);
    y += totalHeight + 4;
    sectionHeading("Revised payment", revisedPayment());
    if (form.dopAttached) sectionHeading("Payment", paymentParagraph());
    prose(reservationParagraph());
    const signatureHeight = 38;
    if (y + signatureHeight > safeBottom) addPage();
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(24, 24, 24); doc.text("Sincerely,", left, y); y += 12;
    doc.text(form.handlerName, left, y); y += 4.4;
    doc.text(form.handlerTitle, left, y); y += 6.2;
    doc.text("Whip Claims Management", left, y); y += 4.4;
    doc.text("P.O. Box 10622, Rockville, MD 20849", left, y); y += 4.4;
    doc.text(`Phone: (855) 906-5949${form.handlerExt ? ` ext. ${form.handlerExt}` : ""}`, left, y); y += 4.4;
    doc.text(form.handlerEmail, left, y); y += 6.2;
    const enclosureLabel = `${formatRange(linesForOutput.map((line) => line.exhibitLetter))}${linesForOutput.length ? "; " : ""}${form.repairFacility} estimate and photos${form.dopAttached ? "; Direction of Pay and Vehicle Ownership Notice" : ""}`;
    doc.setFont("helvetica", "bold"); doc.text("Enclosures:", left, y); const enclosureOffset = doc.getTextWidth("Enclosures: "); doc.setFont("helvetica", "normal");
    const enclosureLines = doc.splitTextToSize(enclosureLabel, textWidth - enclosureOffset) as string[];
    doc.text(enclosureLines[0] || "", left + enclosureOffset, y);
    if (enclosureLines.length > 1) doc.text(enclosureLines.slice(1), left, y + 5.15, { lineHeightFactor: 1.5 });
    footer();
    if (page > 3) { toast.error("This rebuttal would exceed the three-page limit. Reduce optional notes or resolve the unsupported items before generating."); return null; }
    return doc;
  };

  const writePdf = (download: boolean) => {
    const doc = createLetterPdf(); if (!doc) return;
    setPreviewPdfUrl(getPDFDataUrl(doc));
    if (download) downloadPDF(doc, `Whip Carrier Reconsideration - ${form.claimNumber} - ${form.carrier || "Carrier"}.pdf`);
  };

  const downloadWord = async () => {
    const errors = validationErrors(); if (errors.length) { toast.error(errors[0]); return; }
    const wordRun = (text: string, bold = false, size = 20, color = "1A1A1A") => new TextRun({ text, bold, font: "Arial", size, color });
    const para = (children: TextRun[], options: { after?: number; before?: number; pageBreakBefore?: boolean; bold?: boolean } = {}) => new Paragraph({ children, spacing: { after: options.after ?? 120, before: options.before ?? 0, line: 360 }, pageBreakBefore: options.pageBreakBefore, alignment: AlignmentType.LEFT });
    const plain = (text: string, after = 120) => para([wordRun(text)], { after });
    const heading = (text: string) => para([wordRun(text, true)], { after: 80, before: 80 });
    const logoBytes = Uint8Array.from(atob(WHIP_LOGO_B64), (character) => character.charCodeAt(0));
    const cellBorders = { top: { style: BorderStyle.SINGLE, size: 4, color: "888888" }, bottom: { style: BorderStyle.SINGLE, size: 4, color: "888888" }, left: { style: BorderStyle.SINGLE, size: 4, color: "888888" }, right: { style: BorderStyle.SINGLE, size: 4, color: "888888" } };
    const tableWidths = [463, 1929, 1108, 1205, 1060, 3261];
    const wordCell = (text: string, width: number, bold = false, shaded = false) => new TableCell({ width: { size: width, type: WidthType.DXA }, shading: shaded ? { type: ShadingType.CLEAR, fill: "E7E7E7" } : undefined, margins: { top: 60, bottom: 60, left: 70, right: 70 }, borders: cellBorders, children: [new Paragraph({ children: [wordRun(text, bold, 18)], spacing: { after: 0, line: 240 } })] });
    const claimRows = [
      ["Your insured", form.insuredName], ["Vehicle owner", "Metrocars Leasing Corp."], ["Vehicle", `${form.vehicle} / VIN ${form.vin}`], ["Repair facility", `${form.repairFacility}${form.repairFacilityLocation ? `, ${form.repairFacilityLocation}` : ""} — RO ${form.roNumber}, estimate dated ${carrierDate(form.ourEstimateDate)}`],
    ].map(([label, value]) => new TableRow({ children: [new TableCell({ width: { size: 2200, type: WidthType.DXA }, borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }, children: [new Paragraph({ children: [wordRun(label, true)], spacing: { after: 0, line: 240 } })] }), new TableCell({ width: { size: 6826, type: WidthType.DXA }, borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }, children: [new Paragraph({ children: [wordRun(value)], spacing: { after: 0, line: 240 } })] })] }));
    const referenceLines = sortedLines();
    const support = (line: CarrierRebuttalLine) => {
      const exhibit = exhibits.find((item) => item.letter.toUpperCase() === line.exhibitLetter.toUpperCase() && item.markedPage === line.exhibitMarkedPage);
      const sourceText = exhibit ? [exhibit.source, exhibit.title, exhibit.revisionDate].filter(Boolean).join("; ") : "";
      return `Exhibit ${line.exhibitLetter}: ${[sourceText, line.basis, `Estimate line ${line.ourLine}.`].filter(Boolean).join(" ")}`;
    };
    const disputeRows = referenceLines.map((line, index) => new TableRow({ cantSplit: true, children: [wordCell(String(index + 1), tableWidths[0]), wordCell(line.item, tableWidths[1]), wordCell(carrierMoney(line.theirs), tableWidths[2]), wordCell(carrierMoney(line.ours), tableWidths[3]), wordCell(carrierMoney((Number(line.ours) - Number(line.theirs)).toFixed(2)), tableWidths[4]), wordCell(support(line), tableWidths[5])] }));
    disputeRows.push(new TableRow({ cantSplit: true, children: [wordCell("", tableWidths[0], true), wordCell("Total in dispute", tableWidths[1], true), wordCell(carrierMoney(lineCarrierTotal.toFixed(2)), tableWidths[2], true), wordCell(carrierMoney(lineWhipTotal.toFixed(2)), tableWidths[3], true), wordCell(carrierMoney(lineGap.toFixed(2)), tableWidths[4], true), wordCell("", tableWidths[5], true)] }));
    const exhibitLetters = Array.from(new Set(referenceLines.map((line) => line.exhibitLetter.toUpperCase()).filter(Boolean)));
    const exhibitRange = exhibitLetters.length === 1 ? `Exhibit ${exhibitLetters[0]}` : exhibitLetters.length ? `Exhibits ${exhibitLetters[0]}–${exhibitLetters[exhibitLetters.length - 1]}` : "";
    const firstHeader = new Header({ children: [
      new Table({ width: { size: 9026, type: WidthType.DXA }, borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } }, rows: [new TableRow({ children: [new TableCell({ width: { size: 3000, type: WidthType.DXA }, borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }, children: [new Paragraph({ children: [new ImageRun({ data: logoBytes, type: "png", transformation: { width: 70, height: 47 } })], spacing: { after: 0 } })] }), new TableCell({ width: { size: 6026, type: WidthType.DXA }, borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [wordRun("Whip Claims Management", true, 18)], spacing: { after: 0 } }), new Paragraph({ alignment: AlignmentType.RIGHT, children: [wordRun("P.O. Box 10622  Rockville, MD 20849-0622", false, 15, "666666")], spacing: { after: 0 } }), new Paragraph({ alignment: AlignmentType.RIGHT, children: [wordRun("(855) 906-5949  |  claims@drivewhip.com", false, 15, "666666")], spacing: { after: 0 } })] })] })] }),
      new Paragraph({ children: [], border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "BEBEBE", space: 8 } }, spacing: { after: 120 } }),
    ] });
    const footer = new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, border: { top: { style: BorderStyle.SINGLE, size: 4, color: "BEBEBE", space: 8 } }, children: [wordRun("Whip Claims Management  |  PO BOX 10622 Rockville, MD 20850  |  (855) 906-5949", false, 14, "666666")], spacing: { before: 100, after: 0 } })] });
    const word = new WordDocument({ sections: [{ properties: { titlePage: true, page: { size: { width: 11906, height: 16838 }, margin: { top: 1000, right: 1440, bottom: 1000, left: 1440, header: 708, footer: 708 } } }, headers: { first: firstHeader, default: new Header({ children: [] }) }, footers: { default: footer, first: footer }, children: [
      plain(carrierDate(form.letterDate), 180),
      plain(`Re: Claim #${form.claimNumber} — Carrier Claim No. ${form.theirClaimNumber} — Date of Loss: ${carrierDate(form.dateOfLoss)}`, 80),
      plain(`To:  ${form.adjuster}, ${form.carrier}`, 80),
      para([wordRun("Request for Reconsideration of Repair Estimate", true)], { after: 120 }),
      new Table({ width: { size: 9026, type: WidthType.DXA }, borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } }, rows: claimRows }),
      plain(openingParagraph(), 160), plain(oemStandard(), 160), ...(narrative.trim() ? [plain(narrative.trim(), 160)] : []), ...(form.stateRuleCitation && form.stateRuleText ? [plain(`${form.stateRuleCitation}: ${form.stateRuleText}`, 160)] : []),
      new Table({ width: { size: 9026, type: WidthType.DXA }, columnWidths: tableWidths, rows: [new TableRow({ tableHeader: true, cantSplit: true, children: [wordCell("#", tableWidths[0], true, true), wordCell("Operation", tableWidths[1], true, true), wordCell("Your\nestimate", tableWidths[2], true, true), wordCell("Our\nestimate", tableWidths[3], true, true), wordCell("Difference", tableWidths[4], true, true), wordCell("Support (attached)", tableWidths[5], true, true)] }), ...disputeRows], borders: cellBorders }),
      heading("Revised payment"), plain(revisedPayment(), 160),
      ...(form.dopAttached ? [heading("Payment"), plain(paymentParagraph(), 160)] : []), plain(reservationParagraph(), 180),
      plain("Sincerely,", 360), plain(form.handlerName, 0), plain(form.handlerTitle, 140), plain("Whip Claims Management", 0), plain("P.O. Box 10622, Rockville, MD 20849", 0), plain(`Phone: (855) 906-5949${form.handlerExt ? ` ext. ${form.handlerExt}` : ""}`, 0), plain(form.handlerEmail, 160),
      para([wordRun("Enclosures: ", true), wordRun(`${exhibitRange}${referenceLines.length ? "; " : ""}${form.repairFacility} estimate and photos${form.dopAttached ? "; Direction of Pay and Vehicle Ownership Notice" : ""}`)], { after: 0 }),
    ] }] });
    const blob = await Packer.toBlob(word); const href = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = href; anchor.download = `Whip Carrier Reconsideration - ${form.claimNumber} - ${form.carrier || "Carrier"}.docx`; anchor.click(); URL.revokeObjectURL(href); toast.success("Word letter downloaded.");
  };

  const clearAll = () => {
    setForm(initialCarrierForm()); setLineItems([emptyCarrierLine()]); setExhibits([]); setNarrative(""); setOurEstimate(null); setSupportingEvidence(null); setCarrierResponse(null); setSelectedClaimSourceIds([]); setPreviewPdfUrl(null); setAnalysisWarnings([]); setClaudeReview(null); localStorage.removeItem(CARRIER_REBUTTAL_STORAGE_KEY); toast.success("Carrier Rebuttal inputs cleared. Uploaded source files were never retained.");
  };
  const uploadCard = (label: string, id: string, file: File | null, setter: (file: File | null) => void, required?: boolean) => (
    <label htmlFor={id} className="block rounded-lg border border-dashed border-border bg-muted/20 p-3 cursor-pointer hover:border-primary/50 transition-colors">
      <input id={id} className="hidden" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(event) => setter(event.target.files?.[0] || null)} />
      <div className="flex items-start gap-2"><Upload className="mt-0.5 h-4 w-4 text-muted-foreground" /><div className="min-w-0"><p className="text-xs font-semibold text-foreground">{label}{required ? " *" : ""}</p><p className="mt-0.5 truncate text-[11px] text-muted-foreground">{file ? file.name : "PDF, PNG, JPG, or WEBP — analyzed in memory only"}</p></div></div>
      {file && <Button type="button" variant="ghost" size="sm" className="mt-1 h-6 px-1.5 text-[11px]" onClick={(event) => { event.preventDefault(); setter(null); }}><X className="mr-1 h-3 w-3" />Remove</Button>}
    </label>
  );

  return <div className="space-y-5">
    <div className="rounded-lg border border-slate-300 bg-slate-50 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-bold text-slate-900">Carrier Rebuttal — Evidence-First Repair Estimate Reconsideration</h2><p className="mt-1 max-w-4xl text-xs leading-5 text-slate-700">Use only verified claim facts, estimate lines, marked exhibits, and vehicle-specific procedure support. This workflow does not make blanket OEM, legal, or coverage claims. Uploaded source files are analyzed transiently and are never saved.</p></div><Button type="button" variant="outline" size="sm" onClick={clearAll}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Clear rebuttal</Button></div>
    </div>
    <Panel title="1. Case identity and liability position" tag="REQUIRED">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Field label="Letter Date" id="rb-letter-date" value={form.letterDate} onChange={set("letterDate")} type="date" required />
        <Field label="Whip Claim #" id="rb-claim" value={form.claimNumber} onChange={set("claimNumber")} placeholder="GB-9269-626462-884829" required />
        <Field label="Carrier Claim #" id="rb-theirclaim" value={form.theirClaimNumber} onChange={set("theirClaimNumber")} placeholder="Carrier claim number" required />
        <Field label="Date of Loss" id="rb-dol" value={form.dateOfLoss} onChange={set("dateOfLoss")} type="date" required />
        <Field label="Vehicle description" id="rb-vehicle" value={form.vehicle} onChange={set("vehicle")} placeholder="2025 Tesla Model Y Long Range" required />
        <Field label="Confirmed model year" id="rb-vehicle-year" value={form.vehicleYear} onChange={setVehicleSourceField("vehicleYear")} placeholder="2025" type="number" required />
        <Field label="Confirmed make" id="rb-vehicle-make" value={form.vehicleMake} onChange={setVehicleSourceField("vehicleMake")} placeholder="Tesla" required />
        <Field label="Confirmed model" id="rb-vehicle-model" value={form.vehicleModel} onChange={setVehicleSourceField("vehicleModel")} placeholder="Model 3 or Model Y" required />
        <Field label="VIN" id="rb-vin" value={form.vin} onChange={set("vin")} placeholder="17-character VIN" required />
        <Field label="Insured Driver" id="rb-insured" value={form.insuredName} onChange={set("insuredName")} placeholder="First Last" required />
        <InsuranceCompanySelect label="Adverse Carrier" id="rb-carrier" value={form.carrier} onChange={set("carrier")} />
        <Field label="Adjuster Name" id="rb-adjuster" value={form.adjuster} onChange={set("adjuster")} placeholder="First Last" required />
        <div><Label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Liability position *</Label><Select value={form.liabilityStatus} onValueChange={(value) => set("liabilityStatus")(value as CarrierRebuttalForm["liabilityStatus"])}><SelectTrigger id="rb-liability" className="h-9 text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="accepted">Liability accepted</SelectItem><SelectItem value="not_disputed">Liability not disputed</SelectItem></SelectContent></Select><p className="mt-1 text-[11px] text-muted-foreground">Any other position is routed to the liability desk; this letter is blocked.</p></div>
      </div>
    </Panel>
    <Panel title="2. Transient source analysis" tag="VERIFY EVERY FIELD">
      <p className="mb-3 text-xs leading-5 text-muted-foreground">Add the repair estimate, optional marked support, and the carrier response. This action reads source bytes in memory; no source file, storage key, or uploaded document is retained.</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">{uploadCard("Our repair estimate", "rb-our-estimate", ourEstimate, setOurEstimate, true)}{uploadCard("Marked supporting evidence", "rb-support", supportingEvidence, setSupportingEvidence)}{uploadCard("Carrier estimate / response", "rb-carrier-response", carrierResponse, setCarrierResponse, true)}</div>
      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-semibold text-slate-900">Existing claim exhibits &amp; source material</p><p className="mt-1 max-w-3xl text-[11px] leading-4 text-slate-600">For the Whip claim number above, select only the existing correspondence or attachment you are using. The selected source is read in request memory only; this workflow retains only its opaque claim-record ID in the team review audit, never its bytes, body, URL, or storage key.</p></div><span className="rounded bg-white px-2 py-1 text-[10px] font-semibold text-slate-600">{selectedClaimSourceIds.length}/12 selected</span></div>
        {!form.claimNumber.trim() ? <p className="mt-3 text-xs text-slate-600">Enter the Whip claim number to load claim-linked source material available to you.</p> : claimSourcesQuery.isFetching ? <p className="mt-3 text-xs text-slate-600">Loading claim-linked source material…</p> : claimSourcesQuery.data?.length ? <div className="mt-3 space-y-2">{claimSourcesQuery.data.map((source) => <div key={source.sourceId} className="rounded border border-slate-200 bg-white p-2.5"><div className="flex flex-wrap items-start justify-between gap-2"><label className="flex min-w-0 flex-1 items-start gap-2 text-xs"><Checkbox checked={selectedClaimSourceIds.includes(source.sourceId)} onCheckedChange={(checked) => setSelectedClaimSourceIds((current) => checked ? (current.includes(source.sourceId) ? current : [...current, source.sourceId].slice(0, 12)) : current.filter((id) => id !== source.sourceId))} aria-label={`Select ${source.title} as claim source material`} /><span><span className="font-semibold text-slate-900">{source.title}</span><span className="mt-0.5 block text-[11px] text-slate-600">{source.sourceLabel} · {source.kind === "attachment" ? source.fileName || "Attachment" : "Message body"} · {new Date(source.receivedAt).toLocaleDateString()}</span></span></label><div className="flex shrink-0 flex-wrap gap-1"><Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[10px]" disabled={analysisLoading || claimSourceAnalysisMutation.isPending} onClick={() => void analyzeClaimSource(source.sourceId, "ourEstimate")}>Read as Whip estimate</Button><Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[10px]" disabled={analysisLoading || claimSourceAnalysisMutation.isPending} onClick={() => void analyzeClaimSource(source.sourceId, "carrierResponse")}>Read as carrier response</Button><Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[10px]" disabled={analysisLoading || claimSourceAnalysisMutation.isPending} onClick={() => void analyzeClaimSource(source.sourceId, "supportingEvidence")}>Read as support</Button></div></div><p className="mt-1.5 line-clamp-2 text-[11px] leading-4 text-slate-600">{source.summary || "No summary is available. Confirm the source and marked page manually."}</p></div>)}</div> : <p className="mt-3 text-xs text-slate-600">No claim-linked source material available to your profile was found for this exact claim number. You may use the transient upload controls above.</p>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2"><Button type="button" size="sm" onClick={() => void analyzeSources()} disabled={analysisLoading} className="bg-slate-900 text-white hover:bg-slate-800">{analysisLoading ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}{analysisLoading ? "Reading in memory…" : "Read sources & pre-fill facts"}</Button><span className="self-center text-[11px] text-muted-foreground">Always verify ownership of claim numbers, estimate lines, exhibit titles, and marked pages.</span></div>
      {analysisWarnings.length > 0 && <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">{analysisWarnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}
    </Panel>
    <Panel title="3. Repair estimate and carrier response" tag="REQUIRED">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3"><Field label="Repair Facility" id="rb-facility" value={form.repairFacility} onChange={set("repairFacility")} placeholder="Repair facility" required /><Field label="Facility Location" id="rb-facility-location" value={form.repairFacilityLocation} onChange={set("repairFacilityLocation")} placeholder="City, State" /><Field label="RO #" id="rb-ro" value={form.roNumber} onChange={set("roNumber")} placeholder="Repair order number" required /><Field label="Whip Estimate Date" id="rb-our-est-date" value={form.ourEstimateDate} onChange={set("ourEstimateDate")} type="date" required /><Field label="Carrier Estimate / Response Date" id="rb-carrier-est-date" value={form.carrierEstimateDate} onChange={set("carrierEstimateDate")} type="date" required /><Field label="Whip Estimate Total" id="rb-whip-total" value={form.whipEstimateTotal} onChange={set("whipEstimateTotal")} placeholder="0.00" type="number" required /><Field label="Carrier Estimate Total" id="rb-carrier-total" value={form.carrierEstimateTotal} onChange={set("carrierEstimateTotal")} placeholder="0.00" type="number" required /><div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2"><p className="text-xs font-semibold text-slate-800">Tesla procedure support</p><p className="mt-1 text-[11px] leading-4 text-slate-600">Current safe scope: confirmed Model 3 or Model Y only. Toyota/TIS stays unavailable until authorized materials are supplied.</p></div></div>
    </Panel>
    <Panel title="4. Vehicle-matched Tesla procedure library" tag="OUTBOUND LINKS · NO SOURCE CONTENT STORED">
      <p className="mb-3 text-xs leading-5 text-muted-foreground">Confirm the exact year, make, and model above. The library provides live Tesla links and catalog metadata only — it does not store or reproduce Tesla manuals. Select a source only after reviewing the current live page and marking the case-specific evidence.</p>
      {oemSourcesQuery.isFetching && <p className="text-xs text-muted-foreground">Checking the vehicle-matched source family…</p>}
      {oemSourcesQuery.data?.coverageGap && <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">{oemSourcesQuery.data.coverageGap}</div>}
      {oemSourcesQuery.data?.applicableSources?.length ? <div className="space-y-2">{oemSourcesQuery.data.applicableSources.map((source) => <div key={source.sourceKey} className="rounded-md border border-slate-200 bg-white p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-semibold text-slate-900">{source.title}</p><p className="mt-1 text-[11px] text-slate-600">{source.revisionDisplay} · {source.topic}</p></div>{source.sourceUrl && <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-800 hover:bg-slate-50"><ExternalLink className="h-3 w-3" />Open live Tesla source</a>}</div><p className="mt-2 text-[11px] leading-4 text-slate-600">{source.relevanceNote}</p></div>)}</div> : !oemSourcesQuery.isFetching && <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-600">Enter a confirmed Tesla year, make, and model to view a matching source family.</p>}
      {oemSourcesQuery.data?.referenceSources?.length ? <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-800">Owner-manual reference status</p><p className="mt-1 text-[11px] leading-4 text-slate-600">The supplied owner manual for this year/model bucket is reference-only and non-exportable. It is not a collision-repair procedure and cannot be selected as repair-operation support.</p></div> : null}
    </Panel>
    <Panel title="5. Disputed operations matrix" tag="ESTIMATE LINES + MATCHED SOURCE + EXHIBIT REQUIRED">
      <p className="mb-3 text-xs text-muted-foreground">Only operations with a difference are requested. Every row must cite the printed line on both estimates plus a matching exhibit letter and marked page.</p>
      <div className="overflow-x-auto"><table className="min-w-[1450px] w-full text-xs"><thead><tr className="border-b border-border text-left text-muted-foreground"><th className="pb-2 pr-2">Operation</th><th className="pb-2 pr-2">Category</th><th className="pb-2 pr-2">Our $</th><th className="pb-2 pr-2">Carrier $</th><th className="pb-2 pr-2">Carrier reason</th><th className="pb-2 pr-2">Our line</th><th className="pb-2 pr-2">Carrier line</th><th className="pb-2 pr-2">Exhibit / p.</th><th className="pb-2 pr-2">Tesla source</th><th className="pb-2 pr-2">Checked</th><th className="pb-2 pr-2">Factual basis</th><th /></tr></thead><tbody>{lineItems.map((line) => <tr key={line.id} className="border-b border-border/60 align-top"><td className="py-2 pr-2"><Input value={line.item} onChange={(event) => updateLine(line.id, "item", event.target.value)} className="h-8 min-w-[150px] text-xs" /></td><td className="py-2 pr-2"><Select value={line.category} onValueChange={(value) => updateLine(line.id, "category", value as CarrierRebuttalCategory)}><SelectTrigger className="h-8 w-[125px] text-xs"><SelectValue /></SelectTrigger><SelectContent>{carrierCategories.map((category) => <SelectItem key={category.value} value={category.value}>{category.label}</SelectItem>)}</SelectContent></Select></td><td className="py-2 pr-2"><Input value={line.ours} onChange={(event) => updateLine(line.id, "ours", event.target.value)} type="number" className="h-8 w-[78px] text-xs" /></td><td className="py-2 pr-2"><Input value={line.theirs} onChange={(event) => updateLine(line.id, "theirs", event.target.value)} type="number" className="h-8 w-[78px] text-xs" /></td><td className="py-2 pr-2"><Input value={line.carrierReason} onChange={(event) => updateLine(line.id, "carrierReason", event.target.value)} className="h-8 min-w-[145px] text-xs" /></td><td className="py-2 pr-2"><Input value={line.ourLine} onChange={(event) => updateLine(line.id, "ourLine", event.target.value)} className="h-8 w-[75px] text-xs" /></td><td className="py-2 pr-2"><Input value={line.carrierLine} onChange={(event) => updateLine(line.id, "carrierLine", event.target.value)} className="h-8 w-[75px] text-xs" /></td><td className="py-2 pr-2"><div className="flex gap-1"><Input value={line.exhibitLetter} onChange={(event) => updateLine(line.id, "exhibitLetter", event.target.value.toUpperCase().slice(0, 1))} placeholder="A" className="h-8 w-10 text-xs" /><Input value={line.exhibitMarkedPage} onChange={(event) => updateLine(line.id, "exhibitMarkedPage", event.target.value)} placeholder="p. 1" className="h-8 w-[56px] text-xs" /></div></td><td className="py-2 pr-2"><Select value={line.sourceKey || "__unselected"} onValueChange={(value) => updateLine(line.id, "sourceKey", value === "__unselected" ? "" : value)}><SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue placeholder="Select source" /></SelectTrigger><SelectContent><SelectItem value="__unselected">Select exact source</SelectItem>{(oemSourcesQuery.data?.applicableSources || []).map((source) => <SelectItem key={source.sourceKey} value={source.sourceKey}>{source.title}</SelectItem>)}</SelectContent></Select></td><td className="py-2 pr-2"><label className="flex w-[100px] items-center gap-1.5 text-[10px] leading-3 text-muted-foreground"><Checkbox checked={line.evidenceConfirmed} onCheckedChange={(value) => updateLine(line.id, "evidenceConfirmed", Boolean(value))} aria-label={`I verified the marked evidence for ${line.item || "this operation"}`} />I verified</label></td><td className="py-2 pr-2"><Input value={line.basis} onChange={(event) => updateLine(line.id, "basis", event.target.value)} placeholder="Specific fact supported by the marked exhibit" className="h-8 min-w-[220px] text-xs" /></td><td className="py-2"><Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={() => setLineItems((current) => current.length > 1 ? current.filter((row) => row.id !== line.id) : current)}><Trash2 className="h-3.5 w-3.5" /></Button></td></tr>)}</tbody></table></div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><Button type="button" variant="outline" size="sm" onClick={() => setLineItems((current) => [...current, emptyCarrierLine()])}><Plus className="mr-1 h-3.5 w-3.5" />Add operation</Button><div className="flex flex-wrap gap-4 text-xs"><span>Line total — Whip <strong>{carrierMoney(lineWhipTotal.toFixed(2))}</strong></span><span>Line total — carrier <strong>{carrierMoney(lineCarrierTotal.toFixed(2))}</strong></span><span>Full Whip estimate <strong>{carrierMoney(whipTotal.toFixed(2))}</strong></span><span>Full carrier estimate <strong>{carrierMoney(carrierTotal.toFixed(2))}</strong></span><span className={Math.abs(lineGap - gap) > 0.01 ? "font-semibold text-rose-700" : "font-semibold text-emerald-700"}>{Math.abs(lineGap - gap) > 0.01 ? "Reconciliation required" : `Reconciled difference ${carrierMoney(gap.toFixed(2))}`}</span></div></div>
    </Panel>
    <Panel title="6. Claude evidence review" tag="DRAFT ONLY · HANDLER VERIFICATION REQUIRED">
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="max-w-3xl"><p className="text-xs leading-5 text-muted-foreground">Claude receives only the entered case facts, selected official-source metadata/links, handler-marked evidence fields, and selected claim-record descriptors. It cannot create citations, sections, pages, repair methods, legal authority, coverage conclusions, or final facts. Existing claim-source attachments/bodies are analyzed only in request memory; user uploads and owner-manual content are never sent or retained here.</p><p className={`mt-2 text-[11px] leading-4 ${claudeAvailabilityQuery.data?.available ? "text-emerald-700" : "text-amber-800"}`}>{claudeAvailabilityQuery.isFetching && !claudeAvailabilityQuery.data ? "Checking live Claude availability…" : claudeAvailabilityQuery.data?.detail || "Claude availability has not yet been verified."}</p></div><Button type="button" size="sm" variant="outline" onClick={() => void requestClaudeReview()} disabled={claudeReviewMutation.isPending || !claudeAvailabilityQuery.data?.available}>{claudeReviewMutation.isPending ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}{claudeReviewMutation.isPending ? "Reviewing…" : claudeAvailabilityQuery.data?.available ? "Run Claude evidence review" : "Claude review auto-enables"}</Button></div>
      {claudeReview && <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-slate-900">Review #{claudeReview.reviewId} · {claudeReview.modelId}</p><span className={claudeReview.status === "claude_completed" ? "rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800" : "rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900"}>{claudeReview.status === "claude_completed" ? "Claude draft saved" : "Manual review fallback"}</span></div>{claudeReview.output.citationApplicabilityWarnings?.length ? <div className="mt-3"><p className="font-semibold text-slate-800">Citation / availability warnings</p><ul className="mt-1 list-disc space-y-1 pl-4 text-slate-700">{claudeReview.output.citationApplicabilityWarnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul></div> : null}{claudeReview.output.factGaps?.length ? <div className="mt-3"><p className="font-semibold text-slate-800">Fact gaps</p><ul className="mt-1 list-disc space-y-1 pl-4 text-slate-700">{claudeReview.output.factGaps.map((gap, index) => <li key={`${gap.field}-${index}`}><strong>{gap.field}:</strong> {gap.message}</li>)}</ul></div> : null}{claudeReview.output.neutralDisputeRows?.length ? <div className="mt-3"><p className="font-semibold text-slate-800">Suggested neutral row wording</p><ul className="mt-1 space-y-1 text-slate-700">{claudeReview.output.neutralDisputeRows.map((row) => <li key={row.lineId}><strong>Line:</strong> {row.wording}</li>)}</ul></div> : null}{claudeReview.output.draftNarrative ? <div className="mt-3 rounded border border-slate-200 bg-white p-2"><p className="font-semibold text-slate-800">Suggested draft — review before use</p><p className="mt-1 whitespace-pre-wrap leading-5 text-slate-700">{claudeReview.output.draftNarrative}</p><Button type="button" size="sm" variant="outline" className="mt-2" disabled={Boolean(narrative.trim())} onClick={() => { if (!narrative.trim()) { setNarrative(claudeReview.output.draftNarrative || ""); toast.success("Suggested draft copied into the empty notes field. Review and edit before generating."); } }}>Use in empty notes field</Button>{narrative.trim() ? <p className="mt-2 text-[11px] text-slate-500">Existing handler notes are preserved and cannot be overwritten by this review.</p> : null}</div> : null}</div>}
    </Panel>
    <Panel title="7. Exhibit schedule" tag="ATTACH ONLY WHAT YOU CAN IDENTIFY">
      <div className="space-y-2">{exhibits.map((exhibit) => <div key={exhibit.id} className="grid grid-cols-1 gap-2 rounded-md border border-border/70 p-2 md:grid-cols-[52px_1.4fr_1fr_100px_90px_34px]"><Input value={exhibit.letter} onChange={(event) => updateExhibit(exhibit.id, "letter", event.target.value.toUpperCase().slice(0, 1))} placeholder="A" className="h-8 text-xs" /><Input value={exhibit.title} onChange={(event) => updateExhibit(exhibit.id, "title", event.target.value)} placeholder="Document title" className="h-8 text-xs" /><Input value={exhibit.source} onChange={(event) => updateExhibit(exhibit.id, "source", event.target.value)} placeholder="Source / publisher" className="h-8 text-xs" /><Input value={exhibit.revisionDate} onChange={(event) => updateExhibit(exhibit.id, "revisionDate", event.target.value)} placeholder="Revision/date" className="h-8 text-xs" /><Input value={exhibit.markedPage} onChange={(event) => updateExhibit(exhibit.id, "markedPage", event.target.value)} placeholder="Marked p." className="h-8 text-xs" /><Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={() => setExhibits((current) => current.filter((row) => row.id !== exhibit.id))}><Trash2 className="h-3.5 w-3.5" /></Button></div>)}</div>
      <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setExhibits((current) => [...current, emptyCarrierExhibit()])}><Plus className="mr-1 h-3.5 w-3.5" />Add exhibit</Button>
    </Panel>
    <Panel title="6. Optional state-rule paragraph" tag="THIRD-PARTY VERIFICATION REQUIRED">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2"><Field label="Verified state-rule citation" id="rb-state-citation" value={form.stateRuleCitation} onChange={set("stateRuleCitation")} placeholder="e.g. State regulation / section" /><TextareaField label="Exact verified rule text" id="rb-state-text" value={form.stateRuleText} onChange={set("stateRuleText")} placeholder="Paste only the text independently confirmed for the state of loss." rows={3} /></div>
      <label className="mt-3 flex items-start gap-2 text-xs text-muted-foreground"><Checkbox checked={form.stateRuleVerified} onCheckedChange={(value) => set("stateRuleVerified")(Boolean(value))} /><span>I independently confirmed this citation and exact text against an authoritative third-party source for the state of loss. Leave the fields blank if not verified.</span></label>
    </Panel>
    <Panel title="7. Response, payment direction, and signature" tag="REQUIRED">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3"><Field label="Requested response days" id="rb-response-days" value={form.responseDays} onChange={set("responseDays")} type="number" /><Field label="Handler name" id="rb-handler" value={form.handlerName} onChange={set("handlerName")} required /><Field label="Handler title" id="rb-handler-title" value={form.handlerTitle} onChange={set("handlerTitle")} required /><Field label="Handler email" id="rb-handler-email" value={form.handlerEmail} onChange={set("handlerEmail")} type="email" required /><Field label="Phone extension" id="rb-handler-extension" value={form.handlerExt} onChange={set("handlerExt")} placeholder="Optional" /></div>
      <label className="mt-3 flex items-start gap-2 text-xs text-muted-foreground"><Checkbox checked={form.dopAttached} onCheckedChange={(value) => set("dopAttached")(Boolean(value))} /><span>Direction of Pay is attached. The letter will direct payment according to the enclosed direction and documented vehicle-owner interest.</span></label>
    </Panel>
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2"><Panel title="Optional verified case-specific notes" tag="SEPARATE FROM FIXED LETTER LANGUAGE"><p className="mb-2 text-xs text-muted-foreground">The required thesis, repair standard, table, revised-payment, payment, reservation, signature, and enclosures sections are generated in their required order. Use this optional field only for verified facts that are not already captured elsewhere.</p><Textarea value={narrative} onChange={(event) => setNarrative(event.target.value)} rows={12} className="font-mono text-xs leading-5" placeholder="Optional verified claim-specific facts only. Do not add legal conclusions, unverified procedures, or URLs." /><div className="mt-3 flex flex-wrap gap-2"><Button type="button" size="sm" onClick={buildNarrative} className="bg-slate-900 text-white hover:bg-slate-800"><FileCheck className="mr-1.5 h-3.5 w-3.5" />Prepare verified notes</Button><Button type="button" size="sm" variant="outline" onClick={() => void polishNarrative()} disabled={polishLoading || !narrative.trim()}>{polishLoading ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}{polishLoading ? "Polishing…" : "AI polish without new authority"}</Button><Button type="button" size="sm" variant="outline" onClick={() => writePdf(false)}><Eye className="mr-1.5 h-3.5 w-3.5" />Preview formatted PDF</Button><Button type="button" size="sm" variant="outline" onClick={() => void downloadWord()}><Download className="mr-1.5 h-3.5 w-3.5" />Download Word</Button></div></Panel>
      <PreviewPanel text={narrative || "Complete verified case facts, the line-by-line evidence matrix, and exhibits to prepare the Carrier Rebuttal."} onCopy={() => { navigator.clipboard.writeText(narrative); toast.success("Narrative copied"); }} onDownload={() => writePdf(true)} onPreview={() => writePdf(false)} pdfUrl={previewPdfUrl} />
    </div>
  </div>;
}

// ─── Tab: Towing Invoice (Multi-Provider) ────────────────────────────────────
interface TowingLineItem {
  description: string;
  qty: string;
  rate: string;
}

const TOWING_PROVIDERS = [
  { id: "urgently", name: "Urgently", logo: "URGENTLY", color: "#1a73e8", address: "Urgently, Inc. | 1775 Tysons Blvd, Tysons, VA 22102", phone: "1-800-URGENTLY" },
  { id: "agero", name: "Agero", logo: "AGERO", color: "#003087", address: "Agero, Inc. | 400 Rivers Edge Dr, Medford, MA 02155", phone: "1-800-541-2262" },
  { id: "aaa", name: "AAA", logo: "AAA", color: "#003087", address: "AAA | 1000 AAA Drive, Heathrow, FL 32746", phone: "1-800-222-4357" },
  { id: "copart", name: "Copart", logo: "COPART", color: "#e31837", address: "Copart, Inc. | 14185 Dallas Pkwy, Dallas, TX 75254", phone: "1-800-998-7886" },
  { id: "dark-angel", name: "Dark Angel Towing", logo: "DARK ANGEL", color: "#1a1a2e", address: "Dark Angel Towing | Chicago, IL", phone: "(312) 623-2900" },
  { id: "bar-recovery", name: "Bar Recovery LLC", logo: "BAR RECOVERY", color: "#2d6a4f", address: "Bar Recovery LLC | Atlanta, GA", phone: "barrecoveryllc@gmail.com" },
  { id: "local", name: "Local Tow Company", logo: "LOCAL", color: "#555555", address: "", phone: "" },
  { id: "other", name: "Other Provider", logo: "OTHER", color: "#888888", address: "", phone: "" },
];

function UrgentlyInvoiceTab() {
  const [provider, setProvider] = useState("urgently");
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [form, setForm] = useState({
    invoiceNumber: "",
    invoiceDate: "",
    claimNumber: "",
    dateOfLoss: "",
    vehicleYear: "",
    vehicleMake: "",
    vehicleModel: "",
    vehicleVin: "",
    vehiclePlate: "",
    pickupAddress: "",
    dropoffAddress: "",
    towCompany: "",
    towDriver: "",
    towPhone: "",
    adjusterName: "",
    notes: "",
    customProviderName: "",
    customProviderAddress: "",
    customProviderPhone: "",
  });
  const [lineItems, setLineItems] = useState<TowingLineItem[]>([
    { description: "Towing Service", qty: "1", rate: "" },
    { description: "Storage Fee", qty: "1", rate: "" },
  ]);

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const setItem = (i: number, k: keyof TowingLineItem) => (v: string) =>
    setLineItems((prev) =>
      prev.map((row, idx) => (idx === i ? { ...row, [k]: v } : row))
    );

  const addItem = () =>
    setLineItems((prev) => [...prev, { description: "", qty: "1", rate: "" }]);

  const removeItem = (i: number) =>
    setLineItems((prev) => prev.filter((_, idx) => idx !== i));

  const subtotal = lineItems.reduce(
    (s, r) => s + (parseFloat(r.qty) || 0) * (parseFloat(r.rate) || 0),
    0
  );

  const today = new Date().toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
  const formatCalendarDate = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric",
    });
  };
  const invoiceDateDisplay = form.invoiceDate ? formatCalendarDate(form.invoiceDate) : today;
  const net30DueDate = (() => {
    const [year, month, day] = (form.invoiceDate || new Date().toISOString().slice(0, 10)).split("-").map(Number);
    const dueDate = new Date(year, month - 1, day);
    dueDate.setDate(dueDate.getDate() + 30);
    return dueDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  })();

  const selectedProvider = TOWING_PROVIDERS.find(p => p.id === provider) || TOWING_PROVIDERS[0];
  const providerName = provider === "local" || provider === "other"
    ? (form.customProviderName || selectedProvider.name)
    : (form.towCompany || selectedProvider.name);
  const providerAddress = provider === "local" || provider === "other"
    ? form.customProviderAddress
    : selectedProvider.address;
  const providerPhone = provider === "local" || provider === "other"
    ? form.customProviderPhone
    : (form.towPhone || selectedProvider.phone);

  const lineItemsText = lineItems
    .filter((r) => r.description)
    .map((r) => {
      const total = (parseFloat(r.qty) || 0) * (parseFloat(r.rate) || 0);
      return `  ${r.description.padEnd(35)} ${r.qty.padStart(3)} x $${parseFloat(r.rate || "0").toFixed(2).padStart(8)}  =  $${total.toFixed(2)}`;
    })
    .join("\n");

  const preview = `${providerName.toUpperCase()}
TOWING / ROADSIDE INVOICE
PAYMENT STATUS: PAID IN FULL

Invoice #: ${form.invoiceNumber || "[Invoice Number]"}
Invoice Date: ${invoiceDateDisplay}
Payment Terms: Net 30
Original Due Date: ${net30DueDate}
Claim #: ${form.claimNumber || "[Claim Number]"}
Date of Loss: ${form.dateOfLoss || "[Date of Loss]"}

─────────────────────────────────────────────────────────
VEHICLE
─────────────────────────────────────────────────────────
${form.vehicleYear} ${form.vehicleMake} ${form.vehicleModel}${form.vehicleVin ? `\nVIN: ${form.vehicleVin}` : ""}${form.vehiclePlate ? `\nPlate: ${form.vehiclePlate}` : ""}

─────────────────────────────────────────────────────────
TOW DETAILS
─────────────────────────────────────────────────────────
Pickup: ${form.pickupAddress || "[Pickup Address]"}
Dropoff: ${form.dropoffAddress || "[Dropoff Address]"}${form.towDriver ? `\nDriver: ${form.towDriver}` : ""}${providerPhone ? `\nPhone: ${providerPhone}` : ""}

─────────────────────────────────────────────────────────
CHARGES
─────────────────────────────────────────────────────────
${lineItemsText}
─────────────────────────────────────────────────────────
SUBTOTAL: $${subtotal.toFixed(2)}
─────────────────────────────────────────────────────────
PAYMENT STATUS: PAID IN FULL
${form.notes ? `\nNotes: ${form.notes}\n` : ""}
Authorized By: ${form.adjusterName || "[Adjuster Name]"}
Whip Claims Management`;

  const handleDownload = (shouldDownload = true) => {
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();

    // Provider-branded header
    const provColor = selectedProvider.color;
    const rgb = provColor === "#1a73e8" ? [26, 115, 232] :
                provColor === "#003087" ? [0, 48, 135] :
                provColor === "#e31837" ? [227, 24, 55] :
                provColor === "#555555" ? [85, 85, 85] : [136, 136, 136];
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    doc.rect(0, 0, W, 20, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(providerName.toUpperCase(), 14, 13);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("TOWING / ROADSIDE INVOICE", 14, 18);
    doc.setFontSize(8);
    doc.text(`Invoice #: ${form.invoiceNumber || "N/A"}  |  Claim #: ${form.claimNumber || "N/A"}  |  ${invoiceDateDisplay}`, W - 14, 13, { align: "right" });
    if (providerAddress) {
      doc.setFontSize(6.5);
      doc.text(providerAddress, W - 14, 18, { align: "right" });
    }

    // A towing invoice is a payment record, not an open balance statement.
    // Keep the paid status visible in the final PDF and below the provider header.
    doc.setFillColor(232, 245, 233);
    doc.setDrawColor(46, 125, 50);
    doc.roundedRect(W - 55, 24, 41, 8, 1.5, 1.5, "FD");
    doc.setTextColor(27, 94, 32);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text("PAID IN FULL", W - 34.5, 29.3, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text("Payment terms: Net 30", 14, 27);
    doc.text(`Original due: ${net30DueDate}`, 14, 31);

    let y = 37;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);

    // Vehicle
    doc.setFont("helvetica", "bold");
    doc.text("VEHICLE", 14, y); y += 5;
    doc.setFont("helvetica", "normal");
    doc.text(`${form.vehicleYear} ${form.vehicleMake} ${form.vehicleModel}`, 14, y); y += 5;
    if (form.vehicleVin) { doc.text(`VIN: ${form.vehicleVin}`, 14, y); y += 5; }
    if (form.vehiclePlate) { doc.text(`Plate: ${form.vehiclePlate}`, 14, y); y += 5; }
    y += 3;

    // Tow details
    doc.setFont("helvetica", "bold");
    doc.text("TOW DETAILS", 14, y); y += 5;
    doc.setFont("helvetica", "normal");
    y = wrapText(doc, `Pickup: ${form.pickupAddress || "[Pickup]"}`, 14, y, W - 28, 6.5);
    y = wrapText(doc, `Dropoff: ${form.dropoffAddress || "[Dropoff]"}`, 14, y, W - 28, 6.5);
    if (form.towDriver) { doc.text(`Driver: ${form.towDriver}`, 14, y); y += 5; }
    if (providerPhone) { doc.text(`Phone: ${providerPhone}`, 14, y); y += 5; }
    y += 3;

    // Line items table
    doc.setFont("helvetica", "bold");
    doc.text("CHARGES", 14, y); y += 5;
    // Table header
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    doc.rect(14, y, W - 28, 7, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7.5);
    doc.text("Description", 16, y + 5);
    doc.text("Qty", 120, y + 5);
    doc.text("Rate", 140, y + 5);
    doc.text("Total", 170, y + 5);
    y += 7;
    doc.setFontSize(9);
    doc.setTextColor(40, 40, 40);
    let rowBg = false;
    lineItems.filter(r => r.description).forEach((r) => {
      if (rowBg) { doc.setFillColor(248, 248, 252); doc.rect(14, y, W - 28, 6, "F"); }
      rowBg = !rowBg;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(40, 40, 40);
      doc.text(r.description, 16, y + 4.5);
      doc.text(r.qty, 120, y + 4.5);
      doc.text(`$${parseFloat(r.rate || "0").toFixed(2)}`, 140, y + 4.5);
      const total = (parseFloat(r.qty) || 0) * (parseFloat(r.rate) || 0);
      doc.text(`$${total.toFixed(2)}`, 170, y + 4.5);
      y += 6;
    });
    doc.setDrawColor(220, 220, 220);
    doc.line(14, y, W - 14, y); y += 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(rgb[0], rgb[1], rgb[2]);
    doc.text(`TOTAL: $${subtotal.toFixed(2)}`, 14, y); y += 8;
    doc.setFontSize(8.5);
    doc.setTextColor(27, 94, 32);
    doc.setFont("helvetica", "bold");
    doc.text("PAYMENT STATUS: PAID IN FULL", 14, y); y += 7;
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.setFont("helvetica", "normal");
    if (form.notes) { y = wrapText(doc, `Notes: ${form.notes}`, 14, y, W - 28, 6.5); y += 4; }
    doc.text(`Authorized By: ${form.adjusterName || "[Adjuster Name]"}`, 14, y);

    addSOLNotice(doc);
    addLetterFooter(doc);
    const nextPreviewUrl = getPDFDataUrl(doc);
    setPreviewPdfUrl(previous => {
      if (previous) URL.revokeObjectURL(previous);
      return nextPreviewUrl;
    });
    if (shouldDownload) downloadPDF(doc, `${selectedProvider.id === "local" || selectedProvider.id === "other" ? (form.customProviderName || "Towing") : selectedProvider.name}_Invoice_${form.claimNumber || "Draft"}.pdf`);
  };
  const handlePreviewOnly = () => { handleDownload(false); };

  return (
    <div className="space-y-4">
      {/* Provider Selector */}
      <Panel title="Towing Provider" tag="REQUIRED">
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {TOWING_PROVIDERS.map(p => (
            <button
              key={p.id}
              onClick={() => setProvider(p.id)}
              className={`p-2 rounded-lg border-2 text-xs font-bold transition-all text-center ${
                provider === p.id
                  ? "border-[#ff6221] bg-[#ff6221]/10 text-[#ff6221]"
                  : "border-border bg-muted/30 text-foreground/60 hover:border-border/80 hover:text-foreground"
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
        {(provider === "local" || provider === "other") && (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Provider Name" id="ti-custname" value={form.customProviderName} onChange={set("customProviderName")} placeholder="Company name" />
            <Field label="Provider Address" id="ti-custaddr" value={form.customProviderAddress} onChange={set("customProviderAddress")} placeholder="Address" />
            <Field label="Provider Phone" id="ti-custphone" value={form.customProviderPhone} onChange={set("customProviderPhone")} placeholder="(xxx) xxx-xxxx" />
          </div>
        )}
      </Panel>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div>
          <Panel title="Invoice & Claim Details" tag="REQUIRED">
            <Grid3>
              <Field label="Invoice #" id="ui-inv" value={form.invoiceNumber} onChange={set("invoiceNumber")} placeholder="e.g. INV-2024-001" />
              <Field label="Invoice Date" id="ui-invdate" value={form.invoiceDate} onChange={set("invoiceDate")} type="date" />
              <Field label="Claim #" id="ui-claim" value={form.claimNumber} onChange={set("claimNumber")} placeholder="e.g. PF438367" />
            </Grid3>
            <div className="mt-3">
              <Field label="Date of Loss" id="ui-dol" value={form.dateOfLoss} onChange={set("dateOfLoss")} type="date" />
            </div>
          </Panel>
          <Panel title="Vehicle Information">
            <Grid3>
              <Field label="Year" id="ui-yr" value={form.vehicleYear} onChange={set("vehicleYear")} placeholder="e.g. 2024" />
              <Field label="Make" id="ui-make" value={form.vehicleMake} onChange={set("vehicleMake")} placeholder="e.g. Toyota" />
              <Field label="Model" id="ui-model" value={form.vehicleModel} onChange={set("vehicleModel")} placeholder="e.g. Camry" />
            </Grid3>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="VIN" id="ui-vin" value={form.vehicleVin} onChange={set("vehicleVin")} placeholder="17-char VIN" />
              <Field label="Plate" id="ui-plate" value={form.vehiclePlate} onChange={set("vehiclePlate")} placeholder="e.g. ABC1234" />
            </div>
          </Panel>
          <Panel title="Tow Details">
            <div className="space-y-3">
              <Field label="Pickup Address" id="ui-pickup" value={form.pickupAddress} onChange={set("pickupAddress")} placeholder="Accident scene address" />
              <Field label="Dropoff Address" id="ui-dropoff" value={form.dropoffAddress} onChange={set("dropoffAddress")} placeholder="Tow yard / repair shop address" />
            </div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              {(provider === "local" || provider === "other") ? (
                <Field label="Tow Company Name" id="ui-company" value={form.towCompany} onChange={set("towCompany")} placeholder="Company name" />
              ) : (
                <div className="p-2 rounded-md bg-muted/30 border border-border/50">
                  <p className="text-[10px] text-muted-foreground font-medium uppercase">Provider</p>
                  <p className="text-xs font-semibold">{selectedProvider.name}</p>
                  {selectedProvider.address && <p className="text-[10px] text-muted-foreground">{selectedProvider.address}</p>}
                </div>
              )}
              <Field label="Driver Name" id="ui-driver" value={form.towDriver} onChange={set("towDriver")} placeholder="Driver name" />
            </div>
            {(provider === "local" || provider === "other") && (
              <div className="mt-3">
                <Field label="Phone" id="ui-phone" value={form.towPhone} onChange={set("towPhone")} placeholder="(xxx) xxx-xxxx" />
              </div>
            )}
          </Panel>
        </div>
        <div>
          <Panel title="Charges" tag="REQUIRED">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-1.5 pr-2 font-semibold text-foreground/70 w-[50%]">Description</th>
                    <th className="text-left py-1.5 pr-2 font-semibold text-foreground/70 w-[15%]">Qty</th>
                    <th className="text-left py-1.5 pr-2 font-semibold text-foreground/70 w-[20%]">Rate ($)</th>
                    <th className="text-left py-1.5 pr-2 font-semibold text-foreground/70 w-[10%]">Total</th>
                    <th className="w-[5%]"></th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((row, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-1 pr-2">
                        <Input value={row.description} onChange={(e) => setItem(i, "description")(e.target.value)} placeholder="e.g. Towing Service" className="h-7 text-xs" />
                      </td>
                      <td className="py-1 pr-2">
                        <Input value={row.qty} onChange={(e) => setItem(i, "qty")(e.target.value)} type="number" className="h-7 text-xs" />
                      </td>
                      <td className="py-1 pr-2">
                        <Input value={row.rate} onChange={(e) => setItem(i, "rate")(e.target.value)} placeholder="0.00" type="number" className="h-7 text-xs" />
                      </td>
                      <td className="py-1 pr-2 text-xs font-mono text-foreground/70">
                        ${((parseFloat(row.qty) || 0) * (parseFloat(row.rate) || 0)).toFixed(2)}
                      </td>
                      <td className="py-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => removeItem(i)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7" onClick={addItem}>
                <Plus className="w-3 h-3" /> Add Line Item
              </Button>
              <div className="text-sm font-semibold text-[#ff6221]">
                Total: ${subtotal.toFixed(2)}
              </div>
            </div>
          </Panel>
          <Panel title="Additional Info">
            <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
              Payment terms: Net 30. The original due date is calculated from the invoice date; generated towing invoices show their completed status as PAID IN FULL without inventing a payment-reference number.
            </div>
            <Field label="Authorized By (Adjuster)" id="ui-adjuster" value={form.adjusterName} onChange={set("adjusterName")} placeholder="Adjuster name" />
            <div className="mt-3">
              <TextareaField label="Notes (optional)" id="ui-notes" value={form.notes} onChange={set("notes")} placeholder="Any additional notes..." rows={3} />
            </div>
          </Panel>
          <PreviewPanel
            text={preview}
            onCopy={() => { navigator.clipboard.writeText(preview); toast.success("Copied"); }}
            onDownload={handleDownload}
          
        pdfUrl={previewPdfUrl}
      
        onPreview={handlePreviewOnly}/>
        </div>
      </div>
    </div>
  );
}

// ─── PIP Exhaustion Tab ───────────────────────────────────────────────────────
function MedicalReviewWorkspace() {
  const [workspace, setWorkspace] = useState<"pip" | "demand">("pip");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2">
        <Button size="sm" variant={workspace === "pip" ? "default" : "outline"} onClick={() => setWorkspace("pip")}>PIP Bill Review</Button>
        <Button size="sm" variant={workspace === "demand" ? "default" : "outline"} onClick={() => setWorkspace("demand")}>Medical Demand Review</Button>
        <p className="ml-1 text-xs text-muted-foreground">Switching workspaces does not remove the broader medical-record and demand analysis tools.</p>
      </div>
      {workspace === "pip" ? <PipBillReviewWorkflow addLetterhead={addPipLetterhead} addFooter={addPipLetterFooter} /> : <MedicalBillReviewTab />}
    </div>
  );
}

function PIPExhaustionTab() {
	  const pipSearch = useSearch();
	  const requestedPipState = new URLSearchParams(pipSearch).get("memberState")?.toLowerCase();
	  const initialPipState = (["fl", "pa", "va", "ma"].includes(requestedPipState || "") ? requestedPipState : "fl") as "fl" | "pa" | "va" | "ma";
	  const [state, setState] = useState<"fl" | "pa" | "va" | "ma">(initialPipState);
  const [form, setForm] = useState({
    recipient: "",
    claimNo: "",
    dol: "",
    exhaustionDate: "",
    pipLimit: "",
    totalPaid: "",
    pipMedical: "",
    pipWages: "",
    pipDeath: "N/A",
    adjuster: "",
    contactInfo: "",
    benefitType: "medical expenses",
  });
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (v: string) => setForm((p) => ({ ...p, [k]: v }));
  const [pipDoc, setPipDoc] = useState<File | null>(null);
  const [docUploading, setDocUploading] = useState(false);
  const [aiParsed, setAiParsed] = useState(false);
  const parseMutation = trpc.docgen.parsePIPDocument.useMutation();

  const handleParseDoc = async () => {
    if (!pipDoc) { toast.error("Upload a PIP document first"); return; }
    setDocUploading(true);
    try {
	      const fd = new FormData();
	      fd.append("file", pipDoc);
	      const res = await fetch("/api/upload/document", { method: "POST", body: fd });
	      if (!res.ok) throw new Error("Upload failed");
	      const payload = await res.json() as { url?: string; signedUrl?: string };
	      // The model needs a directly readable object URL.  Prefer the signed
	      // object URL instead of the browser-relative storage URL.
	      const fileUrl = payload.signedUrl || payload.url;
	      if (!fileUrl || !/^https?:\/\//i.test(fileUrl)) {
	        throw new Error("Upload did not return a readable PIP document URL");
	      }
	      setDocUploading(false);
	      toast.info("Parsing document — this may take 20–30 seconds...");
	      const result = await parseMutation.mutateAsync({ fileUrl, state });
      if (result.parsed) {
        const p = result.parsed as Partial<typeof form>;
        setForm(prev => ({
          ...prev,
          ...(p.claimNo && { claimNo: p.claimNo }),
          ...(p.recipient && { recipient: p.recipient }),
          ...(p.dol && { dol: p.dol }),
          ...(p.exhaustionDate && { exhaustionDate: p.exhaustionDate }),
          ...(p.pipLimit && { pipLimit: p.pipLimit }),
          ...(p.totalPaid && { totalPaid: p.totalPaid }),
          ...(p.pipMedical && { pipMedical: p.pipMedical }),
          ...(p.pipWages && { pipWages: p.pipWages }),
          ...(p.adjuster && { adjuster: p.adjuster }),
        }));
        setAiParsed(true);
        toast.success("Document parsed — fields auto-filled");
      }
    } catch (e: unknown) {
      toast.error((e as Error).message || "Parse failed");
    } finally {
      setDocUploading(false);
    }
  };

  const buildPreview = () => {
    const f = form;
    const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    if (state === "fl") {
      return `${today}

${f.recipient || "[Claimant / Attorney Name]"}

Re: Personal Injury Protection (PIP) Benefits — Exhaustion Notice
Claim No.: ${f.claimNo || "[CLAIM NUMBER]"}
Date of Loss: ${f.dol || "[DATE OF LOSS]"}
Claimant: ${f.recipient || "[CLAIMANT NAME]"}

This letter confirms that the Personal Injury Protection (PIP) benefits on the above-referenced claim have been exhausted.

The applicable PIP limit is $10,000. Benefits have been applied as follows:
  Medical/Hospital (80%):        $${f.pipMedical || "[AMOUNT]"}
  Lost Wages (60%):              $${f.pipWages || "[AMOUNT]"}
  Death Benefit (if applicable): ${f.pipDeath || "N/A"}
  Total Paid:                    $${f.totalPaid || "[AMOUNT]"}

Benefits were exhausted as of ${f.exhaustionDate || "[DATE]"}. No further payments will be issued under PIP. Bills received after exhaustion will not be processed.

Note: Under Florida Statute §627.737, if your injuries meet the serious injury threshold (significant/permanent injury, permanent scarring or disfigurement, or death), you may have the right to pursue a claim against the at-fault party. That determination is separate from this notice.

For questions regarding this claim, contact ${f.adjuster || "[HANDLER NAME]"} at ${f.contactInfo || "[CONTACT INFO]"}.

Sincerely,

${f.adjuster || "[HANDLER NAME]"}
Whip Claims Management`;
    } else if (state === "pa") {
      return `${today}

${f.recipient || "[Claimant / Attorney Name]"}

Re: First-Party Medical Benefits — Exhaustion Notice
Claim No.: ${f.claimNo || "[CLAIM NUMBER]"}
Date of Loss: ${f.dol || "[DATE OF LOSS]"}
Claimant: ${f.recipient || "[CLAIMANT NAME]"}

This letter confirms that the first-party medical benefits available under this claim have been exhausted as of ${f.exhaustionDate || "[DATE]"}.

Pennsylvania requires a minimum of $5,000 in first-party medical benefits coverage. The available limit of $${f.pipLimit || "5,000"} has been fully applied to covered medical expenses related to the ${f.dol || "[DATE]"} accident. Total benefits paid: $${f.totalPaid || "[AMOUNT]"}.

No further first-party medical benefit payments will be issued. If the limited tort option applies, please be aware that your ability to recover non-economic damages from a third party may be limited unless your injuries meet the serious injury threshold under Pennsylvania law.

Your health insurance, if applicable, may provide coverage for ongoing medical expenses.

For questions regarding this claim, contact ${f.adjuster || "[HANDLER NAME]"} at ${f.contactInfo || "[CONTACT INFO]"}.

Sincerely,

${f.adjuster || "[HANDLER NAME]"}
Whip Claims Management`;
    } else {
      return `${today}

${f.recipient || "[Claimant / Attorney Name]"}

Re: Personal Injury Protection (PIP) Benefits — Exhaustion Notice
Claim No.: ${f.claimNo || "[CLAIM NUMBER]"}
Date of Loss: ${f.dol || "[DATE OF LOSS]"}
Claimant: ${f.recipient || "[CLAIMANT NAME]"}

This letter confirms that the Personal Injury Protection (PIP) benefits available on the above-referenced claim have been exhausted as of ${f.exhaustionDate || "[DATE]"}.

The applicable PIP limit is $${f.pipLimit || "[LIMIT]"}. Total benefits paid: $${f.totalPaid || "[AMOUNT]"}, applied toward ${f.benefitType || "medical expenses and/or lost wages"} resulting from the ${f.dol || "[DATE]"} accident.

No further PIP payments will be made. Please note that under Virginia law, PIP benefits are not subject to subrogation, and the payment of PIP benefits does not affect your right to pursue a third-party bodily injury claim against the at-fault party.

For questions regarding this claim, contact ${f.adjuster || "[HANDLER NAME]"} at ${f.contactInfo || "[CONTACT INFO]"}.

Sincerely,

${f.adjuster || "[HANDLER NAME]"}
Whip Claims Management`;
    }
  };

  const preview = buildPreview();

  const handleDownload = (shouldDownload = true) => {
    const doc = new jsPDF();
    const stateLabel = state === "fl" ? "Florida" : state === "pa" ? "Pennsylvania" : state === "ma" ? "Massachusetts" : "Virginia";
    let y = addWhipLetterhead(doc, `PIP Exhaustion Notice — ${stateLabel}`, `Claim #${form.claimNo || "[CLAIM NUMBER]"}`);
    const W = doc.internal.pageSize.getWidth();
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(40, 40, 40);
    const lines = preview.split("\n");
    for (const line of lines) {
      if (y > 265) { doc.addPage(); y = 20; }
      if (line.trim() === "") { y += 4; continue; }
      y = wrapText(doc, line, 14, y, W - 28, 5.5);
      y += 1.5;
    }
    addSOLNotice(doc, state.toUpperCase());
    addLetterFooter(doc);
    setPreviewPdfUrl(getPDFDataUrl(doc));
    if (shouldDownload) downloadPDF(doc, `pip-exhaustion-${state}-${form.claimNo || "claim"}.pdf`);
  };
  const handlePreviewOnly = () => { handleDownload(false); };

  const STATE_CHIPS: { id: "fl" | "pa" | "va" | "ma"; label: string; sub: string }[] = [
    { id: "fl", label: "Florida", sub: "§627.736" },
    { id: "pa", label: "Pennsylvania", sub: "First-party medical" },
    { id: "va", label: "Virginia", sub: "Add-on PIP" },
    { id: "ma", label: "Massachusetts", sub: "c.90 §34M" },
  ];

  return (
    <div className="space-y-4 max-w-3xl">
      <Panel title="State Selection">
        <div className="flex gap-2 flex-wrap">
          {STATE_CHIPS.map((chip) => (
            <button
              key={chip.id}
              onClick={() => setState(chip.id)}
              className={`px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                state === chip.id
                  ? "bg-[#ff6221]/10 border-[#ff6221] text-[#ff6221]"
                  : "border-border text-foreground/60 hover:border-foreground/40 hover:text-foreground"
              }`}
            >
              <div className="font-semibold">{chip.label}</div>
              <div className="text-[10px] opacity-70">{chip.sub}</div>
            </button>
          ))}
        </div>
        {state === "fl" && (
          <p className="mt-2 text-xs text-[#ff6221]/80 italic">Use when FL PIP ($10,000) is exhausted. Includes benefit breakdown and §627.737 tort threshold notice.</p>
        )}
        {state === "pa" && (
          <p className="mt-2 text-xs text-[#ff6221]/80 italic">Use when PA first-party medical benefits ($5,000 min) are exhausted. Includes limited tort notice.</p>
        )}
        {state === "va" && (
          <p className="mt-2 text-xs text-[#ff6221]/80 italic">Use when Virginia add-on PIP is exhausted. No subrogation. No impact on third-party rights.</p>
        )}
        {state === "ma" && (
          <p className="mt-2 text-xs text-[#ff6221]/80 italic">Use when Massachusetts PIP ($8,000) is exhausted. M.G.L. c. 90 §34M. Workers&apos; Comp fee schedule. COB applies above $2,000 when claimant has health insurance.</p>
        )}
      </Panel>
      <Panel title="PIP Document Upload (Optional — Auto-fills Fields)" tag="AI">
        <p className="text-xs text-muted-foreground mb-3">Upload a PIP ledger, EOB, or exhaustion letter to automatically extract claim details.</p>
        <div className="border-2 border-dashed border-border rounded-lg p-4 text-center hover:border-[#ff6221]/40 transition-colors">
          <input type="file" id="pip-doc-upload" accept=".pdf,.docx,.doc,.png,.jpg,.jpeg" className="hidden"
            onChange={(e) => { setPipDoc(e.target.files?.[0] || null); setAiParsed(false); }} />
          <label htmlFor="pip-doc-upload" className="cursor-pointer">
            {pipDoc ? (
              <div className="flex items-center justify-center gap-2">
                <FileText className="w-4 h-4 text-[#ff6221]" />
                <span className="text-xs font-medium text-[#ff6221]">{pipDoc.name}</span>
                {aiParsed && <span className="text-xs text-green-500 font-medium">✓ Parsed</span>}
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-muted-foreground" onClick={(e) => { e.preventDefault(); setPipDoc(null); setAiParsed(false); }}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ) : (
              <div>
                <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">Drop PIP document here or <span className="text-[#ff6221]">browse</span></p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">PDF, DOCX, PNG, JPG (Max 50MB)</p>
              </div>
            )}
          </label>
        </div>
        {pipDoc && !aiParsed && (
          <Button size="sm" className="mt-2 gap-1.5 text-xs h-7 bg-[#ff6221] hover:bg-[#e5541a] text-white" disabled={docUploading} onClick={handleParseDoc}>
            {docUploading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {docUploading ? "Parsing..." : "✨ Parse & Auto-Fill Fields"}
          </Button>
        )}
      </Panel>
      <Panel title="Claim Details" tag="AUTO-BUILDS">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Recipient Name" id="pip-recipient" value={form.recipient} onChange={set("recipient")} placeholder="Claimant or Attorney Name" />
          <Field label="Claim Number" id="pip-claim-no" value={form.claimNo} onChange={set("claimNo")} placeholder="e.g. WH-2024-001234" />
          <Field label="Date of Loss" id="pip-dol" value={form.dol} onChange={set("dol")} type="date" />
          <Field label="Exhaustion Date" id="pip-exhaust-date" value={form.exhaustionDate} onChange={set("exhaustionDate")} type="date" />
          <Field label="PIP Limit ($)" id="pip-limit" value={form.pipLimit} onChange={set("pipLimit")} placeholder="e.g. 10000" />
          <Field label="Total Paid ($)" id="pip-paid" value={form.totalPaid} onChange={set("totalPaid")} placeholder="e.g. 10000" />
        </div>
        {state === "fl" && (
          <div className="grid grid-cols-3 gap-3 mt-3">
            <Field label="Medical / Hospital (80%)" id="pip-medical" value={form.pipMedical} onChange={set("pipMedical")} placeholder="e.g. 8000" />
            <Field label="Lost Wages (60%)" id="pip-wages" value={form.pipWages} onChange={set("pipWages")} placeholder="e.g. 2000" />
            <Field label="Death Benefit" id="pip-death" value={form.pipDeath} onChange={set("pipDeath")} placeholder="e.g. N/A" />
          </div>
        )}
        {state === "va" && (
          <div className="mt-3">
            <Field label="Benefit Type" id="pip-benefit-type" value={form.benefitType} onChange={set("benefitType")} placeholder="e.g. medical expenses" />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 mt-3">
          <HandlerSelect value={form.adjuster} onChange={set("adjuster")} label="Handler Name" id="pip-adjuster" />
          <Field label="Contact Info" id="pip-contact" value={form.contactInfo} onChange={set("contactInfo")} placeholder="Phone or email" />
        </div>
      </Panel>
      <PreviewPanel
        text={preview}
        onCopy={() => { navigator.clipboard.writeText(preview); toast.success("Copied"); }}
        onDownload={handleDownload}
      
        pdfUrl={previewPdfUrl}
      
        onPreview={handlePreviewOnly}/>
    </div>
  );
}

// ─── Tab: Limited Liability Release — BI (Georgia) ────────────────────────────
function LimitedLiabilityBITab() {
  const [form, setForm] = useState({
    claimantName: "",
    claimNumber: "",
    dateOfLoss: "",
    vehicle: "",
    settlementAmount: "",
    adjusterName: "",
    recipientEmail: "",
    injuryDescription: "",
    isMinor: false,
    minorGuardianName: "",
    state: "Georgia",
  });
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const emailMutation = trpc.docgen.generateSettlementEmail.useMutation();

  const set = (k: keyof typeof form) => (v: string | boolean) =>
    setForm((p) => ({ ...p, [k]: v }));

  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const releaseText = `LIMITED LIABILITY RELEASE AND SETTLEMENT AGREEMENT

KNOW ALL PERSONS BY THESE PRESENTS, that ${form.isMinor ? `${form.minorGuardianName || "[Parent/Guardian Name]"}, as parent or legal guardian of ${form.claimantName || "[Minor Claimant Name]"}, a minor` : form.claimantName || "[Claimant Name]"} ("Releasor"), for and in consideration of the sum of $${form.settlementAmount || "[Settlement Amount]"}, the receipt and sufficiency of which are hereby acknowledged, releases, acquits, and forever discharges Metrocars Leasing Corp., Whip Inc., Whip Claims Management, and each of their past and present affiliates, members, officers, directors, employees, agents, drivers, insurers, successors, and assigns (collectively, the "Released Parties") from any and all claims, demands, actions, causes of action, damages, costs, expenses, and compensation of every kind, whether known or unknown, arising from the motor vehicle incident occurring on or about ${formatReleaseDate(form.dateOfLoss)} involving ${form.vehicle || "[Vehicle]"}.

This Agreement is intended as a limited settlement and release only to the extent of the consideration stated above. Nothing in this Agreement is an admission of liability by any Released Party. Releasor acknowledges that this settlement resolves the bodily injury claims described in this Agreement, including claimed medical expenses, lost wages, pain and suffering, and other damages arising from the Incident, subject to the terms stated here.

The Releasor represents that no released claim has been sold, assigned, pledged, or otherwise transferred; that Releasor has authority to execute this Agreement; and that Releasor has had the opportunity to consult counsel of Releasor's choosing before signing. ${form.isMinor ? `The undersigned further represents that they have authority to sign for ${form.claimantName || "[Minor Claimant Name]"}; any court approval required by applicable law remains the responsibility of the signing representative.` : ""}

This Agreement shall be construed under the laws of the State of Georgia. The consideration is tendered in compromise of disputed claims and does not constitute an admission of fault or liability.`;

  const handleGenerateEmail = async () => {
    if (!form.claimantName || !form.claimNumber || !form.settlementAmount) {
      toast.error("Fill in Claimant Name, Claim Number, and Settlement Amount first");
      return;
    }
    setEmailLoading(true);
    try {
      const result = await emailMutation.mutateAsync({
        type: "bi",
        claimantName: form.claimantName,
        claimNumber: form.claimNumber,
        dateOfLoss: form.dateOfLoss,
        settlementAmount: form.settlementAmount,
        adjusterName: form.adjusterName,
        recipientEmail: form.recipientEmail,
        injuryDescription: form.injuryDescription,
        additionalNotes: `Georgia Limited Liability Release${form.isMinor ? " — Minor Claimant" : ""}`,
      });
      setEmailDraft(result.email);
      toast.success("Settlement email generated");
    } catch (e: unknown) {
      toast.error((e as Error).message || "AI error");
    } finally {
      setEmailLoading(false);
    }
  };


  const handleDownload = (shouldDownload = true) => {
    const doc = new jsPDF();
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    writeReleaseText(doc, releaseText, {
      signerName: "",
      signerType: form.isMinor ? "guardian" : "claimant",
      minorName: "",
    });
    setPreviewPdfUrl(getPDFDataUrl(doc));
    if (shouldDownload) downloadPDF(doc, `Whip_LimitedLiability_BI_${form.claimNumber || "Draft"}.pdf`);
  };
  const handlePreviewOnly = () => { handleDownload(false); };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div>
        <Panel title="Release Details" tag="REQUIRED">
          <Grid3>
            <Field label="Claimant Name" id="llbi-name" value={form.claimantName} onChange={set("claimantName")} placeholder="First Last" required />
            <Field label="Claim Number" id="llbi-claim" value={form.claimNumber} onChange={set("claimNumber")} placeholder="e.g. PF438367" />
            <Field label="Date of Loss" id="llbi-dol" value={form.dateOfLoss} onChange={set("dateOfLoss")} type="date" />
          </Grid3>
          <Grid2 children={<>
            <Field label="Vehicle (Year/Make/Model)" id="llbi-vehicle" value={form.vehicle} onChange={set("vehicle")} placeholder="e.g. 2024 Toyota Camry" />
            <Field label="Settlement Amount ($)" id="llbi-amount" value={form.settlementAmount} onChange={set("settlementAmount")} placeholder="e.g. 5000.00" required />
          </>} />
          <div className="mt-3">
            <Field label="Injury Description (for email)" id="llbi-injury" value={form.injuryDescription} onChange={set("injuryDescription")} placeholder="e.g. soft tissue injuries to neck and back" />
          </div>
        </Panel>
        <Panel title="Georgia-Specific Options">
          <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800 mb-3">
            <Info className="w-4 h-4 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400">This release uses the approved Georgia limited-liability format. Review the completed document and use the minor option only when a guardian must sign.</p>
          </div>
          <label className="flex items-center gap-3 cursor-pointer p-2.5 rounded-md border border-border/50 hover:bg-muted/30 transition-colors">
            <Checkbox
              checked={form.isMinor}
              onCheckedChange={(v) => set("isMinor")(!!v)}
            />
            <div>
              <div className="text-xs font-semibold">Minor Claimant</div>
              <div className="text-xs text-muted-foreground">Adds guardian signature block and minor court-approval notice</div>
            </div>
          </label>
          {form.isMinor && (
            <div className="mt-3">
              <Field label="Guardian / Parent Name" id="llbi-guardian" value={form.minorGuardianName} onChange={set("minorGuardianName")} placeholder="Guardian's full name" />
            </div>
          )}
        </Panel>
        <Panel title="Handler Info">
          <Grid2>
            <HandlerSelect value={form.adjusterName} onChange={set("adjusterName")} label="Handler Name" id="llbi-handler" />
            <Field label="Recipient Email" id="llbi-email" value={form.recipientEmail} onChange={set("recipientEmail")} placeholder="attorney@lawfirm.com" />
          </Grid2>
        </Panel>
        <Panel title="AI Tools" tag="AI">
          <div className="flex gap-2 flex-wrap mb-3">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-[#ff6221]/40 text-[#ff6221] hover:bg-[#ff6221]/10"
              onClick={handleGenerateEmail}
              disabled={emailLoading}
            >
              {emailLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
              {emailLoading ? "Generating..." : "Generate Email Draft"}
            </Button>
          </div>
          {emailDraft && (
            <div className="border border-border rounded-md overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b border-border">
                <Mail className="w-3.5 h-3.5 text-[#ff6221]" />
                <span className="text-xs font-semibold flex-1">Email Draft</span>
                <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs" onClick={() => { navigator.clipboard.writeText(emailDraft); toast.success("Copied"); }}>
                  <Copy className="w-3 h-3" /> Copy
                </Button>
              </div>
              <pre className="p-3 text-xs font-mono whitespace-pre-wrap text-foreground/80 max-h-[250px] overflow-y-auto">{emailDraft}</pre>
            </div>
          )}
        </Panel>
      </div>
      <PreviewPanel
        text={releaseText}
        onCopy={() => { navigator.clipboard.writeText(releaseText); toast.success("Copied"); }}
        onDownload={handleDownload}
      
        pdfUrl={previewPdfUrl}
      
        onPreview={handlePreviewOnly}/>
    </div>
  );
}

// ─── Tab: LOU Calculator ──────────────────────────────────────────────────────
interface LOUVehicle {
  id: string;
  ymm: string;
  vin: string;
  dailyRate: string;
  startDate: string;
  endDate: string;
  days: number;
  total: number;
}

// Standard LOU rates by vehicle class (Whip standard schedule)
const STANDARD_LOU_RATES = [
  { label: "Economy (e.g. Corolla, Civic)", rate: "30.00" },
  { label: "Compact (e.g. Camry, Accord)", rate: "35.00" },
  { label: "Mid-size Sedan", rate: "40.00" },
  { label: "Full-size Sedan", rate: "45.00" },
  { label: "Compact SUV (e.g. RAV4, CR-V)", rate: "45.00" },
  { label: "Mid-size SUV (e.g. Highlander)", rate: "55.00" },
  { label: "Full-size SUV / Truck", rate: "65.00" },
  { label: "Luxury / Premium", rate: "85.00" },
  { label: "Custom / Enter manually", rate: "" },
];

function LOUCalculatorTab({ initialDraft, onDraftChange }: { initialDraft?: Record<string, unknown>; onDraftChange?: (data: Record<string, unknown>) => void }) {
  // Claim info
  const [claimNumber, setClaimNumber] = useState("");
  const [adverseClaimNo, setAdverseClaimNo] = useState("");
  const [dateOfLoss, setDateOfLoss] = useState("");
  const [adverseCarrier, setAdverseCarrier] = useState("");
  const [adjuster, setAdjuster] = useState("");
  // Vehicle info
  const [ymm, setYmm] = useState("");
  const [vin, setVin] = useState("");
  const [memberDriver, setMemberDriver] = useState("");
  const [registeredOwner, setRegisteredOwner] = useState("Metrocars Leasing Corp.");
  const [vehicleStatus, setVehicleStatus] = useState("Actively leased / Revenue-generating");
  const [vehicleClass, setVehicleClass] = useState("");
  const [marketCode, setMarketCode] = useState("DC");
  // Repair period
  const [repairFacility, setRepairFacility] = useState("");
  const [roNumber, setRoNumber] = useState("");
  const [dropOffDate, setDropOffDate] = useState("");
  const [pickUpDate, setPickUpDate] = useState("");
  // LOU calculation
  const [dailyRate, setDailyRate] = useState("");
  const [customRate, setCustomRate] = useState("");
  const [louHandlerName, setLouHandlerName] = useState("");
  const [handlerTitle, setHandlerTitle] = useState("Claims Resolution Specialist");
  const [directDraft, setDirectDraft] = useState<InsuranceDirectDraft>(initialInsuranceDirectDraft);
  const setDirect = <K extends keyof InsuranceDirectDraft>(key: K, value: InsuranceDirectDraft[K]) => setDirectDraft((current) => ({ ...current, [key]: value }));
  const { hasLou, hasDv } = directDemandItems(directDraft.mode);
  const [workflowStage, setWorkflowStage] = useState<1 | 2 | 3>(1);
  const [dvRequested, setDvRequested] = useState(false);
  const [dvReadyForUpload, setDvReadyForUpload] = useState(false);
  // This verification is deliberately transient. Saved drafts retain inputs, not source approval.
  const [dvSourceConfirmation, setDvSourceConfirmation] = useState("");
  const dvSourceKey = JSON.stringify([claimNumber, vin, directDraft.dvAmount, directDraft.dvMethod, directDraft.prelossValue, directDraft.postlossValue]);
  const dvSourceConfirmed = dvSourceConfirmation === dvSourceKey;
  useEffect(() => { setDvSourceConfirmation(current => current && current !== dvSourceKey ? "" : current); }, [dvSourceKey]);
  const showDemand = workflowStage === 3;
  const setShowDemand = (show: boolean) => setWorkflowStage(show ? 3 : 2);
  const selectDemandMode = (mode: InsuranceDirectDraft["mode"]) => {
    setDirect("mode", mode); setDvSourceConfirmation("");
    if (mode !== "lou" && !dvRequested) setWorkflowStage(1);
  };
  const applyDvReport = (report: DvReportFacts) => {
    const nextClaim = claimNumber.trim() ? claimNumber : report.claimNumberRole === "our" ? report.claimNumber : claimNumber;
    const nextVin = vin.trim() ? vin : report.vin;
    if (!claimNumber.trim() && report.claimNumberRole === "our") setClaimNumber(report.claimNumber);
    if (!vin.trim() && report.vin) setVin(report.vin);
    if (!ymm.trim()) setYmm([report.vehicleYear, report.vehicleMake, report.vehicleModel].filter(Boolean).join(" "));
    if (!dateOfLoss.trim() && report.dateOfLoss) setDateOfLoss(report.dateOfLoss);
    if (!repairFacility.trim() && report.repairFacility) setRepairFacility(report.repairFacility);
    const reference = buildDvReportReference(report);
    setDirectDraft(prev => ({ ...prev, dvAmount: report.dvAmount, prelossValue: report.prelossValue || "", postlossValue: report.postlossValue || "", dvMethod: reference, carfaxReported: false, evidenceConfirmed: false, dopConfirmed: false }));
    setDvSourceConfirmation(JSON.stringify([nextClaim, nextVin, report.dvAmount, reference, report.prelossValue || "", report.postlossValue || ""]));
    setPreviewPdfUrl(null);
    toast.success("Completed DV report reviewed and applied. Carrier, liability, repair dates, and enclosures still require confirmation.");
  };
  const repairReader = trpc.docgen.readInsuranceDirectRepair.useMutation();
  const applyRepairFields = (patch: RepairPrefillPatch) => {
    if (patch.claimNumber !== undefined) setClaimNumber(patch.claimNumber);
    if (patch.vin !== undefined) setVin(patch.vin);
    if (patch.vehicle !== undefined) setYmm(patch.vehicle);
    if (patch.dateOfLoss !== undefined) setDateOfLoss(patch.dateOfLoss);
    if (patch.repairFacility !== undefined) setRepairFacility(patch.repairFacility);
    if (patch.roNumber !== undefined) setRoNumber(patch.roNumber);
    if (patch.repairStart !== undefined) setDropOffDate(patch.repairStart);
    if (patch.returnedToService !== undefined) setPickUpDate(patch.returnedToService);
    setDirectDraft(current => ({ ...current, ...(patch.repairCompleted !== undefined ? { repairCompleted: patch.repairCompleted } : {}), evidenceConfirmed: false, dopConfirmed: false }));
    setPreviewPdfUrl(null);
  };

  const [liabilityExample, setLiabilityExample] = useState("");
  useEffect(() => { document.getElementById("lou-workflow-start")?.scrollIntoView({ block: "start" }); }, [workflowStage]);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [vinDecoding, setVinDecoding] = useState(false);

  // ── tRPC market pricing ──
  const { data: allMarkets } = trpc.lou.getMarketPricing.useQuery(undefined, { staleTime: 300_000 });
  const markets = Array.isArray(allMarkets) ? allMarkets : [];
  const currentMarket = markets.find(m => m.code === marketCode);
  const marketName = currentMarket?.name || marketCode;
  const vehicleOptions = currentMarket?.vehicles || [];
  const publishedRate = vehicleOptions.find(v => v.model === vehicleClass);
  const usesPublishedRate = !customRate.trim() && !!publishedRate && Number(dailyRate) === publishedRate.dailyRate;
  // ── tRPC utilization rows ──
  const { data: utilRowsData } = trpc.lou.getUtilRows.useQuery(
    { marketCode, dropOff: dropOffDate, pickUp: pickUpDate },
    { enabled: !!(dropOffDate && pickUpDate && dropOffDate < pickUpDate), staleTime: 300_000 }
  );
  const utilRows = utilRowsData || [];
  // ── sessionStorage persistence: restore on mount ──
  useEffect(() => {
    const saved = initialDraft && Object.keys(initialDraft).length ? JSON.stringify(initialDraft) : sessionStorage.getItem("lou_calc_state");
    if (saved) {
      try {
        const s = JSON.parse(saved);
        if (s.workflowProgress && typeof s.workflowProgress === "object") {
          const progress = s.workflowProgress;
          const requested = progress.dvRequested === true;
          setDvRequested(requested); setDvReadyForUpload(progress.dvReadyForUpload === true && requested);
          const stage = [1, 2, 3].includes(progress.stage) ? progress.stage : 1;
          setWorkflowStage(s.directDraft?.mode !== "lou" && !requested ? 1 : stage);
        }
        if (s.claimNumber) setClaimNumber(s.claimNumber);
        if (s.adverseClaimNo) setAdverseClaimNo(s.adverseClaimNo);
        if (s.dateOfLoss) setDateOfLoss(s.dateOfLoss);
        if (s.adverseCarrier) setAdverseCarrier(s.adverseCarrier);
        if (s.adjuster) setAdjuster(s.adjuster);
        if (s.ymm) setYmm(s.ymm);
        if (s.vin) setVin(s.vin);
        if (s.memberDriver) setMemberDriver(s.memberDriver);
        if (s.registeredOwner) setRegisteredOwner(s.registeredOwner);
        if (s.vehicleStatus) setVehicleStatus(s.vehicleStatus);
        if (s.vehicleClass) setVehicleClass(s.vehicleClass);
        if (s.marketCode) setMarketCode(s.marketCode);
        if (s.repairFacility) setRepairFacility(s.repairFacility);
        if (s.roNumber) setRoNumber(s.roNumber);
        if (s.dropOffDate) setDropOffDate(s.dropOffDate);
        if (s.pickUpDate) setPickUpDate(s.pickUpDate);
        if (s.dailyRate) setDailyRate(s.dailyRate);
        if (s.customRate) setCustomRate(s.customRate);
        if (s.louHandlerName) setLouHandlerName(s.louHandlerName);
        if (s.handlerTitle) setHandlerTitle(s.handlerTitle);
        if (s.directDraft && typeof s.directDraft === "object") setDirectDraft({ ...initialInsuranceDirectDraft(), ...s.directDraft, mode: ["lou", "dv", "both"].includes(s.directDraft.mode) ? s.directDraft.mode : "lou", evidenceConfirmed: false, dopConfirmed: false, authorityVerified: false });
      } catch { /* ignore */ }
    }
  }, []);
  // ── sessionStorage persistence: save on change ──
  useEffect(() => {
    const draftData = {
      claimNumber, adverseClaimNo, dateOfLoss, adverseCarrier, adjuster,
      ymm, vin, memberDriver, registeredOwner, vehicleStatus, vehicleClass, marketCode,
      repairFacility, roNumber, dropOffDate, pickUpDate, dailyRate, customRate,
      louHandlerName, handlerTitle, directDraft, workflowProgress: { stage: workflowStage, dvRequested, dvReadyForUpload },
    };
    sessionStorage.setItem("lou_calc_state", JSON.stringify(draftData));
    onDraftChange?.(draftData);
  }, [claimNumber, adverseClaimNo, dateOfLoss, adverseCarrier, adjuster, ymm, vin, memberDriver, registeredOwner, vehicleStatus, vehicleClass, marketCode, repairFacility, roNumber, dropOffDate, pickUpDate, dailyRate, customRate, louHandlerName, handlerTitle, directDraft, workflowStage, dvRequested, dvReadyForUpload]);
  // A preview belongs only to the exact current inputs, never a stale prior claim.
  useEffect(() => { setPreviewPdfUrl(null); }, [claimNumber, adverseClaimNo, dateOfLoss, adverseCarrier, adjuster, ymm, vin, memberDriver, registeredOwner, vehicleStatus, vehicleClass, marketCode, repairFacility, roNumber, dropOffDate, pickUpDate, dailyRate, customRate, louHandlerName, handlerTitle, directDraft, showDemand, utilRowsData]);
  useEffect(() => () => { if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl); }, [previewPdfUrl]);
  useEffect(() => { setDirectDraft((current) => ({ ...current, evidenceConfirmed: false, dopConfirmed: false })); }, [claimNumber, adverseClaimNo, dateOfLoss, adverseCarrier, adjuster, ymm, vin, memberDriver, registeredOwner, vehicleStatus, vehicleClass, marketCode, repairFacility, roNumber, dropOffDate, pickUpDate, dailyRate, customRate, directDraft.mode, directDraft.insuredName, directDraft.repairCompleted, directDraft.liabilityStatement, directDraft.dvAmount, directDraft.prelossValue, directDraft.postlossValue, directDraft.dvMethod, directDraft.carfaxReported]);
  // Resolve only this market's published rate; never carry an unavailable model's old price.
  useEffect(() => {
    if (!allMarkets || !vehicleClass) return;
    const migrated = findLouVehicleRate(marketCode, vehicleClass);
    const found = vehicleOptions.find(v => v.model === migrated?.model);
    if (found) { setVehicleClass(found.model); setDailyRate(found.dailyRate.toFixed(2)); }
    else setDailyRate("");
  }, [vehicleClass, marketCode, allMarkets]);
  const decodeVinLou = async () => {
    if (vin.length !== 17) { toast.error("VIN must be exactly 17 characters"); return; }
    setVinDecoding(true);
    try {
      const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`);
      const data = await res.json() as { Results: Array<{ Variable: string; Value: string | null }> };
      const get = (v: string) => data.Results.find(r => r.Variable === v)?.Value || "";
      const year = get("Model Year"); const make = get("Make"); const model = get("Model"); const trim = get("Trim");
      const ymmt = [year, make, model, trim].filter(Boolean).join(" ");
      if (ymmt) { setYmm(ymmt); toast.success(`Decoded: ${ymmt}`); }
      else toast.error("Could not decode VIN");
    } catch { toast.error("VIN decode failed"); }
    finally { setVinDecoding(false); }
  };

  // Calculate days
  const calcDays = () => directRepairDays(dropOffDate, pickUpDate);
  const days = calcDays();
  const effectiveRate = directMoney(customRate || dailyRate || "0");
  const louTotal = (days * effectiveRate).toFixed(2);

  // The server resolves reported workbook Occupancy/Utilization values. Never
  // derive a percentage from the display counts here: the source columns have
  // distinct meanings and that error previously produced 10,000% rates.
  const getUtilizationRows = () => {
    if (utilRows.length > 0) {
      return utilRows.map(r => ({
        date: new Date(r.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        location: marketName,
        vehicleClass: vehicleClass || "Vehicle",
        fleetCount: r.fleet || 0,
        rentCount: r.rented || 0,
        availableCount: r.available || 0,
        utilization: r.dataStatus === "unavailable" ? "—" : formatLouUtilization(r.utilization),
        sourceMonth: r.sourceMonth,
        dataStatus: r.dataStatus,
      }));
    }
    if (!dropOffDate || !pickUpDate || days <= 0) return [];
    const rows: Array<{date: string; location: string; vehicleClass: string; fleetCount: number; rentCount: number; availableCount: number; utilization: string; sourceMonth: string | null; dataStatus: "unavailable"}> = [];
    const start = new Date(dropOffDate);
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      rows.push({
        date: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        location: marketName,
        vehicleClass: vehicleClass || "Vehicle",
        fleetCount: 0,
        rentCount: 0,
        availableCount: 0,
        utilization: "—",
        sourceMonth: null,
        dataStatus: "unavailable" as const,
      });
    }
    return rows;
  };
  const utilizationSnapshots = summarizeLouUtilizationRows(getUtilizationRows());
  const directLou = calculateDirectLou({ days, dailyRate: effectiveRate });
  const dvAmount = directMoney(directDraft.dvAmount);
  const directTotal = directMoney((hasLou ? directLou.amount : 0) + (hasDv ? dvAmount : 0));
  const claimErrors = validateInsuranceDirectDemand({ draft: directDraft, claimNumber, carrierClaimNumber: adverseClaimNo, carrier: adverseCarrier, adjuster, dateOfLoss, vehicle: ymm, vin, driver: memberDriver, repairFacility, repairStart: dropOffDate, repairEnd: pickUpDate, handlerName: louHandlerName, handlerTitle, dailyRate: effectiveRate, louError: directLou.error, louAmount: directLou.amount });

  const dvCompletionErrors = hasDv && !dvSourceConfirmed ? ["DV is pending or unverified. Upload and explicitly apply the completed report in step 3, or confirm its manual source after a genuine reader failure."] : [];
  const directErrors = [...dvCompletionErrors, ...claimErrors];

  const openDirectDemand = () => {
    if (days <= 0 || effectiveRate <= 0) { toast.error("Enter a valid repair period and daily rate before using LOU in the letter."); return; }
    if (directDraft.mode === "dv") setDirect("mode", "both");
    setPreviewPdfUrl(null);
    if (hasDv && !dvRequested) { setWorkflowStage(1); toast.info("Request the DV report first, then prepare LOU while it is pending."); return; }
    setShowDemand(true);
    toast.success(`LOU of $${louTotal} carried into the Insurance Direct letter.`);
  };

  // One source record feeds the normal LOU PDF and the active-claim cover letter.
  const louRecord: StandaloneLouInput = {
    claimNumber, carrierClaimNumber: adverseClaimNo, dateOfLoss: formatNorthAmericanLetterDate(dateOfLoss),
    carrier: adverseCarrier, adjuster, vehicle: ymm, vin, driver: memberDriver,
    registeredOwner, vehicleStatus, vehicleClass, repairFacility, roNumber,
    repairStart: formatNorthAmericanLetterDate(dropOffDate), repairEnd: formatNorthAmericanLetterDate(pickUpDate),
    days, dailyRate: effectiveRate, amount: directLou.amount, customRate: !usesPublishedRate, marketName,
    weeklyRate: usesPublishedRate ? publishedRate!.weeklyRate : undefined,
    rateSource: usesPublishedRate && currentMarket ? `${louRateSourceLabel(currentMarket)} Source cell: ${publishedRate!.sourceCell}.` : undefined,
    letterDate: formatNorthAmericanLetterDate(directDraft.letterDate), handlerName: louHandlerName, handlerTitle,
    handlerExtension: directDraft.handlerExtension, handlerEmail: directDraft.handlerEmail, logoBase64: WHIP_LOGO_B64,
    snapshots: utilizationSnapshots, sourceNote: louUtilizationSourceNote(getUtilizationRows()),
    reconciliation: louUtilizationReconciliation(utilizationSnapshots),
    verifiedAuthority: directDraft.authorityVerified ? directDraft.stateAuthority : "",
  };
  const handleStandaloneLou = (shouldDownload = true) => {
    if (directLou.error || !claimNumber.trim() || !ymm.trim()) { toast.error(directLou.error || "Enter the claim number and vehicle before producing the LOU form."); return; }
    const doc = createStandaloneLouPdf(louRecord);
    setPreviewPdfUrl(getPDFDataUrl(doc));
    if (shouldDownload) downloadPDF(doc, `Whip_LOU_${claimNumber || "Draft"}.pdf`);
  };

  const handleDownload = (shouldDownload = true) => {
    if (directErrors.length) { toast.error(directErrors[0]); return; }
    const doc = createInsuranceDirectPdf({
      letterDate: formatNorthAmericanLetterDate(directDraft.letterDate), claimNumber, carrierClaimNumber: adverseClaimNo,
      dateOfLoss: formatNorthAmericanLetterDate(dateOfLoss), carrier: adverseCarrier, adjuster, insuredName: directDraft.insuredName,
      driver: memberDriver, vehicle: ymm, vin, repairFacility,
      repairCompleted: formatNorthAmericanLetterDate(directDraft.repairCompleted || pickUpDate),
      liabilityStatement: directDraft.liabilityStatement,
      hasLou, hasDv, louDays: days, dailyRate: effectiveRate,
      louAmount: hasLou ? directLou.amount : 0, repairStart: formatNorthAmericanLetterDate(dropOffDate), repairEnd: formatNorthAmericanLetterDate(pickUpDate),
      prelossValue: directDraft.prelossValue.trim() ? directMoney(directDraft.prelossValue) : undefined, postlossValue: directDraft.postlossValue.trim() ? directMoney(directDraft.postlossValue) : undefined,
      dvAmount: hasDv ? dvAmount : 0, dvMethod: directDraft.dvMethod,
      carfaxReported: hasDv && directDraft.carfaxReported,
      stateAuthority: directDraft.authorityVerified ? directDraft.stateAuthority : "",
      handlerName: louHandlerName, handlerTitle, handlerExtension: directDraft.handlerExtension,
      handlerEmail: directDraft.handlerEmail || "claims@drivewhip.com", logoBase64: WHIP_LOGO_B64,
      snapshots: utilizationSnapshots, marketName, sourceNote: louUtilizationSourceNote(getUtilizationRows()),
      reconciliation: louUtilizationReconciliation(utilizationSnapshots), attachLouSchedule: hasLou, louRecord,
    });
    setPreviewPdfUrl(getPDFDataUrl(doc));
    if (shouldDownload) downloadPDF(doc, `Whip_Insurance_Direct_${directDraft.mode.toUpperCase()}_${claimNumber || "Draft"}.pdf`);
  };
  const handlePreviewOnly = () => { handleDownload(false); };

  return (
    <div id="lou-workflow-start" className="space-y-4 max-w-4xl">
      <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
        <h2 className="text-base font-semibold">Insurance Direct: Loss of Use</h2>
        <p className="text-xs leading-5 text-muted-foreground">Request diminished value first because the report takes time. Prepare loss of use while it is pending, then review the completed DV report and create the active-claim demand. LOU-only skips DV. The full standard LOU form and calculation remain unchanged. This is not a subrogation demand.</p>
        <div className="space-y-1"><Label htmlFor="lou-direct-mode" className="text-xs font-semibold">Demand items — select before starting</Label><select id="lou-direct-mode" className="w-full h-9 rounded-md border border-input bg-background px-2 text-xs" value={directDraft.mode} onChange={event => selectDemandMode(event.target.value as InsuranceDirectDraft["mode"])}><option value="lou">Loss of Use only — skip DV</option><option value="both">Loss of Use and Diminished Value</option><option value="dv">Diminished Value only</option></select></div>
        <nav aria-label="Insurance Direct workflow steps" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Button id="lou-step-request" variant={workflowStage === 1 ? "default" : "outline"} size="sm" onClick={() => setWorkflowStage(1)}>1. Start / Request DV</Button>
          <Button id="lou-step-calculator" variant={workflowStage === 2 ? "default" : "outline"} size="sm" disabled={hasDv && !dvRequested} onClick={() => setWorkflowStage(2)}>2. Prepare LOU</Button>
          <Button id="lou-step-letter" variant={showDemand ? "default" : "outline"} size="sm" disabled={hasDv && !dvRequested} onClick={() => setShowDemand(true)}>3. Review & Create Demand</Button>
        </nav>
        <p id="lou-dv-progress" role="status" className="text-xs font-semibold">DV: {!hasDv ? "Not included — LOU-only" : dvSourceConfirmed ? "Completed report reviewed" : dvRequested ? "Requested—waiting" : "Not started"}{hasDv && dvRequested && !dvSourceConfirmed ? " · Your manual indication only; no automatic monitoring." : ""}</p>
      </div>
      {workflowStage === 1 && <Panel title="Step 1 · Start / Request Diminished Value" tag="EXTERNAL CALCULATOR">
        {hasDv ? <div className="space-y-3">
          <p className="text-xs leading-5 text-muted-foreground">Open the dedicated calculator, sign in, and request the report there first. Keep this tab open; your claim inputs are saved in this browser session. Opening the link does not submit a request or confirm completion. No numbers are transferred automatically.</p>
          <Button asChild size="sm" variant="outline"><a id="lou-open-dv-calculator" href="https://dvcalc-unkzbfqd.manus.space/agent-login" target="_blank" rel="noopener noreferrer"><Calculator className="mr-2 h-4 w-4" />Open DV Calculator<ExternalLink className="ml-2 h-3.5 w-3.5" /></a></Button>
          <label className="flex items-start gap-2 text-xs leading-5"><input id="lou-dv-requested" type="checkbox" className="mt-1 shrink-0" checked={dvRequested} onChange={event => { setDvRequested(event.target.checked); if (!event.target.checked) { setDvReadyForUpload(false); setDvSourceConfirmation(""); } }} /><span>I requested the report in the external calculator (or already have a requested report). This is my manual indication, not a verified external status.</span></label>
          <Button id="lou-start-lou" size="sm" disabled={!dvRequested} onClick={() => setWorkflowStage(directDraft.mode === "dv" ? 3 : 2)}>{directDraft.mode === "dv" ? "Continue to Completed Report Review" : "Continue to LOU While DV Is Pending"}</Button>
        </div> : <div className="space-y-3"><p className="text-xs leading-5 text-muted-foreground">DV is not included. Skip the external request and completed DV report review; prepare the usual LOU calculation and cover letter.</p><Button id="lou-skip-dv" size="sm" onClick={() => setWorkflowStage(2)}>Skip DV — Prepare LOU</Button></div>}
      </Panel>}
      {workflowStage === 2 && <div className="rounded-lg border border-border bg-muted/20 p-4 text-xs leading-5"><strong>Step 2 · Prepare Loss of Use</strong><p>{hasDv ? "DV report requested—waiting on the external calculator. Work on the repair facts, rates, and LOU below while it is pending. When your report is complete, go to step 3 to upload and review it." : "Prepare the LOU record below; no DV report is required."}</p><Button id="lou-report-ready-next" size="sm" variant="outline" className="mt-2" onClick={() => setShowDemand(true)}>{hasDv ? "LOU Prepared — Continue to Report Review" : "Continue to LOU-only Demand"}</Button></div>}
      {showDemand && hasDv && <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3 text-xs leading-5">
        <h3 className="text-sm font-semibold">Step 3 · Completed Report & Final Demand</h3>
        <p>{dvSourceConfirmed ? "Completed DV source reviewed. Finish the claim facts and packet checks below to create the demand." : "DV remains pending or unverified. Return to the external calculator to check it yourself. You can keep working on LOU, but cannot download a final DV demand until its completed source is reviewed."}</p>
        {!dvReadyForUpload && <Button id="lou-dv-report-ready" size="sm" variant="outline" onClick={() => setDvReadyForUpload(true)}>My Completed DV Report Is Ready — Review It</Button>}
        <Button size="sm" variant="outline" onClick={() => setWorkflowStage(2)}>Keep Working on LOU</Button>
      </div>}
      {showDemand && hasDv && dvReadyForUpload && <InsuranceDirectDvReview current={{ claimNumber, vin, dvAmount: directDraft.dvAmount, dvMethod: directDraft.dvMethod, prelossValue: directDraft.prelossValue, postlossValue: directDraft.postlossValue }} confirmed={dvSourceConfirmed} onApply={applyDvReport} onInvalidate={() => { setDvSourceConfirmation(""); setPreviewPdfUrl(null); }} onManualConfirm={checked => { setDvSourceConfirmation(checked ? dvSourceKey : ""); setDirectDraft(current => ({ ...current, evidenceConfirmed: false, dopConfirmed: false })); }} />}
      {workflowStage !== 1 && <>
      <InsuranceDirectRepairUpload current={{ claimNumber, vin, vehicle: ymm, dateOfLoss, repairFacility, roNumber, repairStart: dropOffDate, returnedToService: pickUpDate, repairCompleted: directDraft.repairCompleted || pickUpDate }} analyze={input => repairReader.mutateAsync(input)} onApply={applyRepairFields} />
      {showDemand && <Panel title="Active-Claim LOU/DV Cover Letter" tag="REPAIRS COMPLETED · NOT SUBROGATION">
        <p className="mb-3 text-xs leading-5 text-muted-foreground">Use for direct demands to the responsible carrier after the vehicle has been repaired in real time. Choose loss of use, documented diminished value, or both. The letter demands these items in addition to repair costs; it does not demand repair costs again. No letter is sent automatically.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Letter Date" id="lou-letter-date" value={directDraft.letterDate} onChange={(value) => setDirect("letterDate", value)} type="date" required />
          <Field label="Their Insured's Name" id="lou-insured" value={directDraft.insuredName} onChange={(value) => setDirect("insuredName", value)} placeholder="Carrier's insured — not the Whip driver" required />
          <Field label="Repair Completed Date" id="lou-completed" value={directDraft.repairCompleted || pickUpDate} onChange={(value) => setDirect("repairCompleted", value)} type="date" required />
        </div>
        <div className="mt-3 space-y-2">
          <Label htmlFor="lou-liability-example" className="text-xs font-semibold">Liability statement examples — choose a starting point</Label>
          <select id="lou-liability-example" className="w-full h-9 rounded-md border border-input bg-background px-2 text-xs" value={liabilityExample} onChange={(event) => setLiabilityExample(event.target.value)}><option value="">— Choose an example —</option>{LIABILITY_STATEMENT_EXAMPLES.map((example) => <option key={example.id} value={example.id}>{example.label}</option>)}</select>
          {liabilityExample && <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2"><p className="text-xs leading-5 whitespace-pre-wrap">{LIABILITY_STATEMENT_EXAMPLES.find((example) => example.id === liabilityExample)?.text}</p><p className="text-xs text-muted-foreground">{LIABILITY_STATEMENT_EXAMPLES.find((example) => example.id === liabilityExample)?.note}</p><Button id="lou-use-liability-example" variant="outline" size="sm" onClick={() => { const example = LIABILITY_STATEMENT_EXAMPLES.find((item) => item.id === liabilityExample); if (example) setDirect("liabilityStatement", example.text); }}>Use example in editable statement</Button></div>}
          <TextareaField label="Verified Liability Statement" id="lou-liability" value={directDraft.liabilityStatement} onChange={(value) => setDirect("liabilityStatement", value)} placeholder="State the actual verified position and source. Acceptance wording is only appropriate when documented." rows={3} />
          <p className="text-xs leading-5 text-muted-foreground">Replace every bracketed placeholder with verified claim facts and identify the correspondence, note, or exhibit. Selecting an example does not verify liability or insert it automatically. Repair payment alone is not treated as carrier acceptance.</p>
        </div>
      </Panel>}
      <Panel title="Claim Information">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Whip Claim No." id="lou-claim" value={claimNumber} onChange={setClaimNumber} placeholder="XXX-1234-123456-123456" required />
          <Field label="Their Claim No." id="lou-adverse" value={adverseClaimNo} onChange={setAdverseClaimNo} placeholder="Carrier's claim reference" required />
          <Field label="Date of Loss" id="lou-dol" value={dateOfLoss} onChange={setDateOfLoss} type="date" required />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <Field label="Their Insurance Carrier" id="lou-carrier" value={adverseCarrier} onChange={setAdverseCarrier} placeholder="e.g. Farmers Insurance" required />
          <Field label="Their Adjuster" id="lou-adjuster" value={adjuster} onChange={setAdjuster} placeholder="Carrier's handling adjuster" required />
        </div>
      </Panel>

      <Panel title="Vehicle Information">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Year / Make / Model" id="lou-ymm" value={ymm} onChange={setYmm} placeholder="e.g. TOYOTA CAMRY LE 2023" required />
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-foreground/80">VIN</Label>
            <div className="flex gap-1.5">
              <Input
                id="lou-vin"
                value={vin}
                onChange={(e) => setVin(e.target.value.toUpperCase())}
                placeholder="17-character VIN"
                maxLength={17}
                className="text-sm h-8 font-mono flex-1"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-2 text-xs border-[#ff6221]/40 text-[#ff6221] hover:bg-[#ff6221]/10 whitespace-nowrap"
                onClick={decodeVinLou}
                disabled={vinDecoding || vin.length !== 17}
                title="Decode VIN to get Year/Make/Model"
              >
                {vinDecoding ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                <span className="ml-1">Decode</span>
              </Button>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <Field label="Whip Driver" id="lou-driver" value={memberDriver} onChange={setMemberDriver} placeholder="First Last" required />
          <div className="space-y-1"><Label htmlFor="lou-owner" className="text-xs font-semibold">Vehicle Owner</Label><Input id="lou-owner" value="Metrocars Leasing Corp." readOnly className="h-8 text-sm bg-muted/30" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <label className="block text-xs font-medium text-foreground/70 mb-1">Vehicle Status</label>
            <select className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring" value={vehicleStatus} onChange={e => setVehicleStatus(e.target.value)}>
              <option>Actively leased / Revenue-generating</option>
              <option>Owner-operated / Personal use</option>
              <option>Commercial fleet vehicle</option>
              <option>Rideshare / TNC vehicle</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground/70 mb-1">Vehicle Class</label>
            <select className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring" id="lou-vehicle-type" value={vehicleClass} onChange={e => { setVehicleClass(e.target.value); setDailyRate(vehicleOptions.find(v => v.model === e.target.value)?.dailyRate.toFixed(2) || ""); }}>
              <option value="">— Select vehicle type / model year —</option>
              {vehicleClass && !publishedRate && <option value={vehicleClass} disabled>{vehicleClass} — no published rate; reselect</option>}
              {vehicleOptions.map(v => <option key={v.model} value={v.model}>{v.model} — ${v.weeklyRate.toFixed(2)}/week · ${v.dailyRate.toFixed(2)}/day</option>)}
            </select>
          </div>
        </div>
        <div className="mt-3">
          <label className="block text-xs font-medium text-foreground/70 mb-1">Market / Location</label>
          <select className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring" id="lou-market" value={marketCode} onChange={e => setMarketCode(e.target.value)}>
            {markets.map(m => <option key={m.code} value={m.code}>{m.name}</option>)}
          </select>
          {currentMarket && <p id="lou-rate-source" className="mt-2 text-xs leading-5 text-muted-foreground">{louRateSourceLabel(currentMarket)} Blank / not-offered cells are excluded. Confirm applicability to this repair period.</p>}
          {vehicleClass && !publishedRate && <p role="alert" className="mt-2 text-xs text-destructive">No published rate for this vehicle/model-year in this market. Select an offered type or use a documented custom override; no other market's rate is substituted.</p>}
        </div>
      </Panel>

      <Panel title="Completed Repair Period" tag="RETURN DATE EXCLUDED FROM LOU DAYS">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Repair Facility" id="lou-facility" value={repairFacility} onChange={setRepairFacility} placeholder="e.g. Total Recon — Laurel" />
          <Field label="RO Number" id="lou-ro" value={roNumber} onChange={setRoNumber} placeholder="e.g. 1739" />
        </div>
        {(!showDemand || hasLou) && <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
          <Field label="Drop-Off Date" id="lou-dropoff" value={dropOffDate} onChange={setDropOffDate} type="date" required />
          <Field label="Returned to Service" id="lou-pickup" value={pickUpDate} onChange={setPickUpDate} type="date" required />
          <div className="flex flex-col justify-end">
            <div className="p-2 rounded-md bg-muted/40 border border-border text-center">
              <div className="text-xs text-muted-foreground">Days in Repair</div>
              <div className="text-2xl font-bold text-foreground">{days}</div>
            </div>
          </div>
        </div>}
      </Panel>

      {(!showDemand || hasLou) && <Panel title="Daily Rate" tag="AUTO-CALCULATES">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-foreground/70 mb-1">Whip Standard Rate</label>
            <select className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring" id="lou-standard-rate" value={publishedRate ? vehicleClass : ""} onChange={e => { setVehicleClass(e.target.value); const selected = vehicleOptions.find(v => v.model === e.target.value); setDailyRate(selected?.dailyRate.toFixed(2) || ""); }}>
              <option value="">— Select rate —</option>
              {vehicleOptions.map(v => (
                <option key={v.model} value={v.model}>{v.model} — ${v.weeklyRate.toFixed(2)}/week · ${v.dailyRate.toFixed(2)}/day</option>
              ))}
            </select>
          </div>
          <Field label="Custom Rate Override ($)" id="lou-custom" value={customRate} onChange={setCustomRate} placeholder="Leave blank to use standard rate" type="number" />
        </div>
        {(dailyRate || customRate) && (
          <div className="mt-3 p-2 rounded-md bg-muted/30 text-xs text-muted-foreground">
            Rate basis: {vehicleClass || ymm} — {usesPublishedRate ? "Whip Standard Rate" : "Handler-entered custom rate"}, {marketName} market {usesPublishedRate ? `($${publishedRate!.weeklyRate.toFixed(2)}/wk ÷ 7 = $${effectiveRate.toFixed(2)}/day, rounded to cents)` : `($${effectiveRate.toFixed(2)}/day; no published weekly rate represented)`}
          </div>
        )}
        <p className="mt-3 text-xs leading-5 text-muted-foreground">LOU = documented days out of service × selected daily rate. The same calculator amount appears in the demand letter and support schedule. Reported monthly utilization is evidence context, not a multiplier.</p>
      </Panel>}

      {showDemand && hasDv && <Panel title="Diminished Value" tag="MANUAL OR REVIEWED REPORT · NO FORM DEFAULTS">
        <div id="lou-dv-field-guide" className="mb-3 space-y-2 rounded-md border border-border bg-muted/20 p-3 text-xs leading-5">
          <p><strong>Where to look:</strong> On a CarSense report, use <strong>Section 4 · Diminished Value Calculation → TOTAL DIMINISHED VALUE</strong>. The total can continue onto the next page. Use that final dollar opinion—not total repair cost, average comparable value, severity score, or the rounded DV percentage.</p>
          <p><strong>What to write:</strong> Name the appraisal company/appraiser, report ID/date, stated method, and the final-opinion section/page. These are in the report header and Section 4/5. Use the editable starter below; replace every bracketed item with this claim's facts.</p>
          <p><strong>Optional values:</strong> Leave pre-loss/post-repair fields blank unless the report expressly states both. Do not manufacture a post-repair value by subtracting DV from an adjusted value. Confirm any separate CarFax enclosure yourself.</p>
          <div className="flex flex-wrap gap-2"><Button id="lou-dv-use-reference" size="sm" variant="outline" onClick={() => setDirect("dvMethod", DV_REFERENCE_STARTER)}>Use Editable Source Wording</Button><Button id="lou-dv-clear-fields" size="sm" variant="outline" onClick={() => { setDvSourceConfirmation(""); setDvReadyForUpload(false); setDirectDraft(prev => ({ ...prev, dvAmount: "", prelossValue: "", postlossValue: "", dvMethod: "", carfaxReported: false, evidenceConfirmed: false })); }}>Clear DV Fields</Button></div>
        </div>
        <Field label="Report-Supported DV Demand Amount ($)" id="lou-dv-amount" value={directDraft.dvAmount} onChange={(value) => setDirect("dvAmount", value)} type="number" required />
        <details className="mt-3"><summary className="cursor-pointer text-xs font-medium">Optional appraised values · only if both are expressly stated</summary><div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <Field label="Optional Appraised Pre-Loss Value ($)" id="lou-dv-pre" value={directDraft.prelossValue} onChange={(value) => setDirect("prelossValue", value)} type="number" />
          <Field label="Optional Appraised Post-Repair Value ($)" id="lou-dv-post" value={directDraft.postlossValue} onChange={(value) => setDirect("postlossValue", value)} type="number" />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Optional values are for explaining the report only. They never set or change the manual DV amount; if provided, both must agree with it.</p></details>
        <div className="mt-3"><TextareaField label="Appraisal Method / Source Reference" id="lou-dv-method" value={directDraft.dvMethod} onChange={(value) => setDirect("dvMethod", value)} placeholder="Method and exhibit/reference from the actual appraisal" rows={2} /></div>
        <div className="mt-3 flex items-center justify-between gap-3"><label className="flex items-center gap-2 text-xs"><Checkbox checked={directDraft.carfaxReported} onCheckedChange={(checked) => setDirect("carfaxReported", checked === true)} />Loss appears on the Carfax history report being enclosed</label><p className="text-sm font-semibold">Documented DV: ${dvAmount.toFixed(2)}</p></div>
      </Panel>}

      <Panel title="Handler">
        <div className="grid grid-cols-2 gap-3">
          <HandlerSelect value={louHandlerName} onChange={setLouHandlerName} onHandlerChange={(handler) => setDirect("handlerExtension", handler.extension || "")} label="Handler Name" id="lou-handler" />
          <Field label="Title" id="lou-title" value={handlerTitle} onChange={setHandlerTitle} placeholder="e.g. Claims Resolution Specialist" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3"><Field label="Handler Extension" id="lou-handler-ext" value={directDraft.handlerExtension} onChange={(value) => setDirect("handlerExtension", value)} placeholder="Auto-fills from the IVR directory" /><Field label="Handler Email" id="lou-handler-email" value={directDraft.handlerEmail} onChange={(value) => setDirect("handlerEmail", value)} placeholder="claims@drivewhip.com" /></div>
      </Panel>

      {showDemand && <Panel title="Supporting Packet & Optional Authority" tag="HANDLER VERIFIED">
        <TextareaField label="Optional Verified Authority for the Loss State" id="lou-state-authority" value={directDraft.stateAuthority} onChange={(value) => { setDirectDraft((current) => ({ ...current, stateAuthority: value, authorityVerified: false })); }} placeholder="Leave blank unless the exact citation and relevance to this loss state have been verified. No default legal authority is inserted." rows={2} />
        {directDraft.stateAuthority.trim() && <label className="mt-2 flex items-center gap-2 text-xs"><Checkbox checked={directDraft.authorityVerified} onCheckedChange={(checked) => setDirect("authorityVerified", checked === true)} />I verified this authority and its applicability to the loss state.</label>}
        <label className="mt-3 flex items-start gap-2 text-xs leading-5"><Checkbox checked={directDraft.evidenceConfirmed} onCheckedChange={(checked) => setDirect("evidenceConfirmed", checked === true)} /><span>Repairs are completed. The standard LOU form is included automatically when claiming LOU. The claim supports the stated liability position and selected amounts. I will enclose the repair estimate/final bill and image report{hasLou ? ", and any additional fleet logs or claim evidence supporting the LOU record" : ""}{hasDv ? ", and the diminished-value appraisal" : ""}{hasDv && directDraft.carfaxReported ? ", including the Carfax history report" : ""}.</span></label>
        <label className="mt-3 flex items-start gap-2 text-xs leading-5"><Checkbox checked={directDraft.dopConfirmed} onCheckedChange={(checked) => setDirect("dopConfirmed", checked === true)} /><span>The Direction of Pay and Vehicle Ownership Notice for Metrocars Leasing Corp. will be enclosed. This generator does not create or attach those source exhibits automatically.</span></label>
      </Panel>}

      {/* Direct-insurance summary: distinct from the unchanged subrogation handoff. */}
      {!showDemand && <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
        <div><div className="text-xs font-semibold text-muted-foreground uppercase">Standalone LOU Calculator — Total</div><div id="lou-calculator-total" className="text-3xl font-bold">${louTotal}</div><p className="text-xs text-muted-foreground">{days} days × ${effectiveRate.toFixed(2)}/day = ${louTotal}</p></div>
        <div className="flex flex-wrap gap-2"><Button id="lou-use-in-letter" size="sm" onClick={openDirectDemand}>Push LOU to Active-Claim Cover Letter</Button><Button variant="outline" size="sm" onClick={() => { selectDemandMode("dv"); if (dvRequested) setShowDemand(true); }}>Build DV-only Letter</Button><Button id="lou-preview-form" variant="outline" size="sm" onClick={() => handleStandaloneLou(false)}>Preview LOU Form</Button><Button id="lou-download-form" variant="outline" size="sm" onClick={() => handleStandaloneLou()}>Download LOU Form</Button></div>
        <p className="text-xs text-muted-foreground">The usual LOU form can be previewed or downloaded on its own. Push this record to step 3 to fill the cover letter and automatically append that same LOU form. There is no Subro handoff in this active-claim workflow.</p>
      </div>}
      {showDemand && <div className="p-4 rounded-xl border border-border bg-muted/20">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Insurance Direct — Total Demand</div>
            <div className="text-3xl font-bold text-foreground">${directTotal.toFixed(2)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {hasLou ? `LOU: ${days} days × $${effectiveRate.toFixed(2)}/day = $${directLou.amount.toFixed(2)}` : ""}{hasLou && hasDv ? " · " : ""}{hasDv ? `DV: $${dvAmount.toFixed(2)}` : ""}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePreviewOnly}><Eye className="w-3.5 h-3.5" />Preview Cover Letter + LOU Packet</Button>
            <Button id="lou-final-download" disabled={hasDv && !dvSourceConfirmed} size="sm" className="gap-1.5 bg-slate-900 hover:bg-slate-800 text-white" onClick={() => handleDownload()}><Download className="w-3.5 h-3.5" />Download Cover Letter + LOU Packet</Button>
          </div>
        </div>
        <p id="lou-demand-readiness" role="status" className="mt-3 text-xs font-semibold">{directErrors.length ? (hasDv && !dvSourceConfirmed ? "DV pending / source unverified — final demand blocked" : "Complete the remaining claim and packet checks") : "Demand ready — verified inputs and packet checks complete"}</p>
        {directErrors.length > 0 && <details className="mt-3 rounded-md border border-border bg-background p-3 text-xs text-muted-foreground"><summary className="cursor-pointer font-semibold text-foreground">Complete before generating — {directErrors.length} remaining checks</summary><ul className="mt-2 list-disc pl-4 space-y-1">{directErrors.map((error) => <li key={error}>{error}</li>)}</ul></details>}
        <div className="mt-3 rounded-md border border-border bg-background p-3 text-xs leading-5"><strong>Packet order:</strong> active-claim cover letter{hasLou ? " → full Loss of Use / Rental Reimbursement Request → its monthly utilization and supporting basis" : " (DV only; no LOU form)"}. <strong>Attach separately:</strong> {hasDv ? "DV appraisal/report, " : ""}repair estimate/final bill, image report, applicable fleet logs, Direction of Pay/ownership notice, and any additional claim exhibits. Source exhibits are not created or embedded in the packet; completed DV uploads are used only for review by the report reader.</div>
      </div>}

      {/* Monthly Fleet Utilization Preview */}
      {(!showDemand || hasLou) && days > 0 && dropOffDate && pickUpDate && (
        <Panel title="Monthly Fleet Utilization Snapshot Preview" tag="INCLUDED IN PDF">
          <p className="mb-2 text-xs text-muted-foreground">One row is shown for each source reporting month. “Reported unrented” accounts for the unoccupied portion of the report’s rentable-fleet denominator; this is not a daily utilization feed.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#171b31] text-white">
                  <th className="px-2 py-1.5 text-left">Report month</th>
                  <th className="px-2 py-1.5 text-right">Repair days</th>
                  <th className="px-2 py-1.5 text-left">Location</th>
                  <th className="px-2 py-1.5 text-right">Rentable fleet</th>
                  <th className="px-2 py-1.5 text-right">Rented</th>
                  <th className="px-2 py-1.5 text-right">Reported unrented</th>
                  <th className="px-2 py-1.5 text-right">Reported occupancy</th>
                </tr>
              </thead>
              <tbody>
                {utilizationSnapshots.map((snapshot, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-muted/20" : ""}>
                    <td className="px-2 py-1">{snapshot.reportMonth}</td>
                    <td className="px-2 py-1 text-right">{snapshot.repairDays}</td>
                    <td className="px-2 py-1">{marketName}</td>
                    <td className="px-2 py-1 text-right">{snapshot.dataStatus === "unavailable" ? "—" : snapshot.fleetCount}</td>
                    <td className="px-2 py-1 text-right">{snapshot.dataStatus === "unavailable" ? "—" : snapshot.rentCount}</td>
                    <td className="px-2 py-1 text-right">{snapshot.dataStatus === "unavailable" ? "—" : snapshot.availableCount}</td>
                    <td className="px-2 py-1 text-right font-bold text-foreground">{snapshot.utilization}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs font-medium text-foreground/80">{louUtilizationReconciliation(utilizationSnapshots)}</p>
        </Panel>
      )}

      {previewPdfUrl && (
        <PreviewPanel
          text=""
          onCopy={() => toast.info("Copy the PDF from the preview")}
          onDownload={showDemand ? handleDownload : handleStandaloneLou}
          filename={showDemand ? `Whip_Insurance_Direct_${directDraft.mode.toUpperCase()}_${claimNumber || "Draft"}.pdf` : `Whip_LOU_${claimNumber || "Draft"}.pdf`}
          pdfUrl={previewPdfUrl}
        
        onPreview={showDemand ? handlePreviewOnly : () => handleStandaloneLou(false)}/>
      )}
      </>}
    </div>
  );
}

// ─── Tab: Medical Bill Review ──────────────────────────────────────────────────
// State-specific PIP rules (mirrors server-side STATE_PIP_RULES)
const MBR_STATE_PIP: Record<string, { limit: number; pct: number; feeSchedule: string; statute: string; hasPIP: boolean }> = {
  PA: { limit: 5000, pct: 100, feeSchedule: "Act 6 fee schedule (75 Pa.C.S. § 1797)", statute: "75 Pa.C.S. §§ 1701–1799.7", hasPIP: true },
  FL: { limit: 10000, pct: 80, feeSchedule: "200% of Medicare (§ 627.736(5)(a)1)", statute: "Fla. Stat. § 627.736", hasPIP: true },
  MD: { limit: 2500, pct: 100, feeSchedule: "Reasonable standard — no fee schedule (§ 19-505)", statute: "Md. Code Ann., Ins. § 19-505", hasPIP: true },
  MA: { limit: 8000, pct: 80, feeSchedule: "WC fee schedule (114.3 CMR 40.00); first $2k at 100%", statute: "M.G.L. c. 90 § 34M", hasPIP: true },
  NJ: { limit: 15000, pct: 100, feeSchedule: "NJ fee schedule (N.J.A.C. 11:3-29)", statute: "N.J.S.A. 39:6A-4", hasPIP: true },
  NY: { limit: 50000, pct: 80, feeSchedule: "NY No-Fault fee schedule (11 NYCRR Part 68)", statute: "N.Y. Ins. Law § 5102", hasPIP: true },
  MI: { limit: 500000, pct: 100, feeSchedule: "Prevailing charge schedule (MCL 500.3157)", statute: "MCL 500.3101 et seq.", hasPIP: true },
  DC: { limit: 50000, pct: 100, feeSchedule: "Reasonable and customary", statute: "D.C. Code § 31-2404", hasPIP: true },
  VA: { limit: 0, pct: 0, feeSchedule: "N/A", statute: "N/A", hasPIP: false },
  GA: { limit: 0, pct: 0, feeSchedule: "N/A", statute: "N/A", hasPIP: false },
  IL: { limit: 0, pct: 0, feeSchedule: "N/A", statute: "N/A", hasPIP: false },
  TX: { limit: 0, pct: 0, feeSchedule: "N/A", statute: "N/A", hasPIP: false },
};

const MBR_STATES = ["MD","VA","PA","FL","IL","GA","MA","TX","NJ","NY","MI","DC"];

type MBRUploadSlot = {
  key: string;
  label: string;
  hint: string;
  accept: string;
  isImage?: boolean;
};

const MBR_UPLOAD_SLOTS: MBRUploadSlot[] = [
  { key: "demand", label: "Demand Package", hint: "Full demand letter, medical bills, and supporting docs (required)", accept: "application/pdf,.pdf,.doc,.docx" },
  { key: "medicalRecords", label: "Medical Records", hint: "Separate medical records if not included in demand", accept: "application/pdf,.pdf" },
  { key: "insuredVehiclePhotos", label: "Insured Vehicle Damage Photos", hint: "Photos of the Whip/insured vehicle", accept: "image/*,application/pdf,.pdf" },
  { key: "claimantVehiclePhotos", label: "Claimant Vehicle Damage Photos", hint: "Photos of the claimant/third-party vehicle", accept: "image/*,application/pdf,.pdf" },
  { key: "insuredVehicleEstimate", label: "Insured Vehicle Estimate", hint: "Repair estimate for the Whip/insured vehicle", accept: "application/pdf,.pdf" },
  { key: "claimantVehicleEstimate", label: "Claimant Vehicle Estimate", hint: "Repair estimate for the claimant vehicle", accept: "application/pdf,.pdf" },
  { key: "pipApplication", label: "PIP Application", hint: "Completed PIP application (PIP states only)", accept: "application/pdf,.pdf" },
];

type MBRAnalysis = {
  bills: Array<{ provider: string; date: string; cptCode: string; description: string; amount: number; allowedAmount: number; applicable: boolean; reason: string }>;
  diagnoses: Array<{ code: string; description: string; causallyRelated: boolean }>;
  treatmentTimeline: Array<{ date: string; provider: string; treatment: string }>;
  treatmentGaps: Array<{ from: string; to: string; days: number }>;
  cptAnalysis: Array<{ code: string; description: string; applicable: boolean; redFlags: string[] }>;
  mechanismAssessment: string;
  pipExposure: number;
  pipAllowed: number;
  pipRemaining: number;
  biExposure: number;
  umbiExposure: number;
  totalApplicable: number;
  totalNotApplicable: number;
  biSettlementLow: number;
  biSettlementHigh: number;
  biOpeningOffer: number;
  biAuthority: number;
  biRationale: string;
  expertSummary: string;
  responseLetter: string;
  redFlags: string[];
};

function MedicalBillReviewTab() {
  const [state, setState] = React.useState("MD");
  const [coverageType, setCoverageType] = React.useState<"pip" | "bi" | "umbi" | "all">("all");
  const [form, setForm] = React.useState({
    claimNumber: "",
    claimantName: "",
    dateOfLoss: "",
    vehicleDescription: "",
    impactType: "",
    factsOfLoss: "",
    injuryDescription: "",
    liabilityPercent: "100",
  });
  const [uploads, setUploads] = React.useState<Record<string, { file: File; url: string; uploading: boolean } | null>>({});
	  const [analysisResult, setAnalysisResult] = React.useState<MBRAnalysis | null>(null);
	  const [rawResult, setRawResult] = React.useState<string | null>(null);
	  const [responsePdfUrl, setResponsePdfUrl] = React.useState<string | null>(null);
	  const [analyzing, setAnalyzing] = React.useState(false);
  const [activeResultTab, setActiveResultTab] = React.useState<"bills" | "diagnoses" | "timeline" | "pip" | "bi" | "expert" | "letter">("expert");
  const [copiedLetter, setCopiedLetter] = React.useState(false);

  const analyzeMutation = trpc.docgen.analyzeMedicalDemand.useMutation();
  const pipRules = MBR_STATE_PIP[state] ?? { limit: 0, pct: 0, feeSchedule: "N/A", statute: "N/A", hasPIP: false };

  const setField = (k: keyof typeof form) => (v: string) => setForm(p => ({ ...p, [k]: v }));

  const handleUpload = async (slotKey: string, file: File, _isImage: boolean) => {
    setUploads(prev => ({ ...prev, [slotKey]: { file, url: "", uploading: true } }));
    try {
      const fd = new FormData();
      fd.append("file", file);
      // Use the document endpoint: it stores the file and returns a short-lived,
      // model-readable signed URL. /api/upload does not exist in this project.
      const res = await fetch("/api/upload/document", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({})) as { url?: string; signedUrl?: string; error?: string };
      if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
      const fileUrl = data.signedUrl || data.url;
      if (!fileUrl || !/^https?:\/\//i.test(fileUrl)) throw new Error("Upload did not return a readable document URL");
      setUploads(prev => ({ ...prev, [slotKey]: { file, url: fileUrl, uploading: false } }));
    } catch (error: unknown) {
      toast.error((error as Error).message || `Failed to upload ${file.name}`);
      setUploads(prev => ({ ...prev, [slotKey]: null }));
    }
  };

  const handleAnalyze = async () => {
    const demandUpload = uploads["demand"];
    if (!demandUpload?.url) {
      toast.error("Please upload the Demand Package first (required)");
      return;
    }
    setAnalyzing(true);
    setAnalysisResult(null);
    setRawResult(null);
    try {
      const result = await analyzeMutation.mutateAsync({
        demandFileUrl: demandUpload.url,
        medicalRecordsUrl: uploads["medicalRecords"]?.url,
        insuredVehiclePhotosUrl: uploads["insuredVehiclePhotos"]?.url,
        claimantVehiclePhotosUrl: uploads["claimantVehiclePhotos"]?.url,
        insuredVehicleEstimateUrl: uploads["insuredVehicleEstimate"]?.url,
        claimantVehicleEstimateUrl: uploads["claimantVehicleEstimate"]?.url,
        pipApplicationUrl: uploads["pipApplication"]?.url,
        state,
        dateOfLoss: form.dateOfLoss || undefined,
        impactType: form.impactType || undefined,
        injuryDescription: form.injuryDescription || undefined,
        factsOfLoss: form.factsOfLoss || undefined,
        coverageType,
        liabilityPercent: form.liabilityPercent ? parseFloat(form.liabilityPercent) : undefined,
        claimNumber: form.claimNumber || undefined,
        claimantName: form.claimantName || undefined,
        vehicleDescription: form.vehicleDescription || undefined,
      });
      if (result.analysis) {
        setAnalysisResult(result.analysis as MBRAnalysis);
        setActiveResultTab("expert");
        toast.success("Medical review complete");
      } else if (result.raw) {
        setRawResult(result.raw);
        toast.success("Review complete — raw output");
      }
    } catch (e: unknown) {
      toast.error((e as Error).message || "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  const fmt = (n: number) => `$${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const uploadedCount = Object.values(uploads).filter(u => u?.url).length;
  const totalBilled = analysisResult?.bills.reduce((s, b) => s + (b.amount || 0), 0) ?? 0;
	  const totalAllowed = analysisResult?.bills.reduce((s, b) => s + (b.allowedAmount || 0), 0) ?? 0;

	  const buildResponseLetterPdf = (shouldDownload: boolean) => {
	    if (!analysisResult?.responseLetter) {
	      toast.error("Run the medical review before creating the response letter");
	      return null;
	    }
	    const doc = new jsPDF();
	    const W = doc.internal.pageSize.getWidth();
	    const H = doc.internal.pageSize.getHeight();
	    let y = addWhipLetterhead(doc);
	    doc.setFont("helvetica", "normal");
	    doc.setFontSize(9.5);
	    doc.setTextColor(30, 30, 30);
	    for (const paragraph of analysisResult.responseLetter.split(/\n\s*\n/)) {
	      const lines = doc.splitTextToSize(paragraph.trim() || " ", W - 28) as string[];
	      const needed = Math.max(6, lines.length * 5.5 + 4);
	      if (y + needed > H - 23) {
	        doc.addPage();
	        y = addWhipLetterhead(doc);
	        doc.setFont("helvetica", "normal");
	        doc.setFontSize(9.5);
	        doc.setTextColor(30, 30, 30);
	      }
	      if (paragraph.trim()) doc.text(lines, 14, y);
	      y += needed;
	    }
	    addLetterFooter(doc);
	    const url = getPDFDataUrl(doc);
	    setResponsePdfUrl(url);
	    if (shouldDownload) downloadPDF(doc, `Whip_MedicalResponse_${form.claimNumber || "Draft"}.pdf`);
	    return url;
	  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-foreground">Medical Bill Review</h2>
          <p className="text-xs text-muted-foreground mt-0.5">AI-powered medical and injury evaluation — PIP compensability, BI valuation, and expert summary</p>
        </div>
        <Button
          onClick={handleAnalyze}
          disabled={analyzing || !uploads["demand"]?.url}
          className="gap-2 bg-[#171b31] hover:bg-[#171b31]/90 text-white shrink-0"
        >
          {analyzing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {analyzing ? "Analyzing…" : "Run Medical Review"}
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* LEFT COLUMN: Setup */}
        <div className="space-y-4">
          {/* State + Coverage Type */}
          <Panel title="Jurisdiction & Coverage">
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-foreground/70 mb-1.5 block">State of Loss</label>
                <div className="flex flex-wrap gap-1.5">
                  {MBR_STATES.map(s => (
                    <button key={s} type="button" onClick={() => setState(s)}
                      className={`px-2.5 py-1 rounded text-xs font-semibold border transition-colors ${state === s ? "bg-[#171b31] text-white border-[#171b31]" : "bg-muted text-foreground border-border hover:border-[#171b31]/40"}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              {/* PIP info badge */}
              <div className={`rounded-md px-3 py-2 text-xs ${pipRules.hasPIP ? "bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200" : "bg-muted border border-border text-muted-foreground"}`}>
                {pipRules.hasPIP
                  ? <><span className="font-semibold">PIP:</span> ${pipRules.limit.toLocaleString()} limit · {pipRules.pct}% reimbursement · {pipRules.feeSchedule} · {pipRules.statute}</>
                  : <><span className="font-semibold">{state}</span> — No mandatory PIP. All injury claims on tort/BI basis.</>}
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground/70 mb-1.5 block">Coverage Focus</label>
                <div className="flex gap-1.5">
                  {(["all","pip","bi","umbi"] as const).map(ct => (
                    <button key={ct} type="button" onClick={() => setCoverageType(ct)}
                      className={`px-3 py-1 rounded text-xs font-semibold border transition-colors ${coverageType === ct ? "bg-[#ff6221] text-white border-[#ff6221]" : "bg-muted text-foreground border-border hover:border-[#ff6221]/40"}`}>
                      {ct === "all" ? "All" : ct.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Panel>

          {/* Claim Info */}
          <Panel title="Claim Information">
            <Grid2>
              <Field label="Claim Number" id="mbr-claim" value={form.claimNumber} onChange={setField("claimNumber")} placeholder="e.g. MD-1234-567890" />
              <Field label="Claimant Name" id="mbr-claimant" value={form.claimantName} onChange={setField("claimantName")} placeholder="First Last" />
            </Grid2>
            <Grid2>
              <Field label="Date of Loss" id="mbr-dol" value={form.dateOfLoss} onChange={setField("dateOfLoss")} type="date" />
              <Field label="Vehicle" id="mbr-vehicle" value={form.vehicleDescription} onChange={setField("vehicleDescription")} placeholder="2022 Toyota Camry" />
            </Grid2>
            <div className="mt-2">
              <Field label="Liability % (Our Fault)" id="mbr-liability" value={form.liabilityPercent} onChange={setField("liabilityPercent")} placeholder="0–100" />
            </div>
          </Panel>

          {/* Mechanism of Loss */}
          <Panel title="Mechanism of Loss & Facts">
            <div className="space-y-2">
              <div>
                <label className="text-xs font-semibold text-foreground/70 mb-1 block">Impact Type</label>
                <div className="flex flex-wrap gap-1.5">
                  {["Rear-end", "T-bone / Side", "Head-on", "Sideswipe", "Parking lot", "Pedestrian", "Rollover", "Multi-vehicle"].map(t => (
                    <button key={t} type="button" onClick={() => setField("impactType")(t)}
                      className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${form.impactType === t ? "bg-[#171b31] text-white border-[#171b31]" : "bg-muted text-foreground border-border hover:border-[#171b31]/30"}`}>
                      {t}
                    </button>
                  ))}
                </div>
                <input
                  className="mt-1.5 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#171b31]"
                  placeholder="Or describe custom impact type…"
                  value={form.impactType}
                  onChange={e => setField("impactType")(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground/70 mb-1 block">Facts of Loss</label>
                <textarea
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#171b31] resize-none"
                  rows={3}
                  placeholder="Describe how the accident occurred, speed, direction, road conditions, etc."
                  value={form.factsOfLoss}
                  onChange={e => setField("factsOfLoss")(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground/70 mb-1 block">Reported Injuries (if known)</label>
                <textarea
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#171b31] resize-none"
                  rows={2}
                  placeholder="e.g. Cervical strain, lumbar strain, headaches, shoulder pain…"
                  value={form.injuryDescription}
                  onChange={e => setField("injuryDescription")(e.target.value)}
                />
              </div>
            </div>
          </Panel>

          {/* Upload Slots */}
          <Panel title={`Document Uploads (${uploadedCount}/${MBR_UPLOAD_SLOTS.length} uploaded)`}>
            <div className="space-y-2">
              {MBR_UPLOAD_SLOTS.map(slot => {
                const up = uploads[slot.key];
                return (
                  <div key={slot.key} className={`rounded-md border p-2.5 transition-colors ${up?.url ? "border-green-500/50 bg-green-50/30 dark:bg-green-950/20" : "border-border bg-muted/20"}`}>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-foreground">{slot.label}</span>
                          {slot.key === "demand" && <span className="text-[10px] bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded font-semibold">Required</span>}
                          {up?.url && <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                          {up?.uploading && <RefreshCw className="w-3.5 h-3.5 text-[#ff6221] animate-spin shrink-0" />}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{up?.url ? up.file.name : slot.hint}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <label className="cursor-pointer">
                          <input type="file" accept={slot.accept} className="hidden"
                            onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(slot.key, f, !!slot.isImage); e.target.value = ""; }} />
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border border-border bg-background hover:bg-muted transition-colors cursor-pointer">
                            <Upload className="w-3 h-3" />{up?.url ? "Replace" : "Upload"}
                          </span>
                        </label>
                        {up?.url && (
                          <button type="button" onClick={() => setUploads(prev => ({ ...prev, [slot.key]: null }))}
                            className="p-1 rounded border border-border hover:bg-destructive/10 hover:border-destructive/40 transition-colors">
                            <X className="w-3 h-3 text-muted-foreground" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 pt-3 border-t border-border">
              <Button
                onClick={handleAnalyze}
                disabled={analyzing || !uploads["demand"]?.url}
                className="w-full gap-2 bg-[#171b31] hover:bg-[#171b31]/90 text-white"
              >
                {analyzing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {analyzing ? "Analyzing documents… (this may take 30–60 seconds)" : `Run Medical Review${uploadedCount > 1 ? ` (${uploadedCount} documents)` : ""}`}
              </Button>
            </div>
          </Panel>
        </div>

        {/* RIGHT COLUMN: Results */}
        <div className="space-y-4">
          {!analysisResult && !rawResult && !analyzing && (
            <div className="rounded-xl border border-dashed border-border bg-muted/20 p-10 text-center">
              <Stethoscope className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm font-medium text-muted-foreground">Upload the demand package and run the review</p>
              <p className="text-xs text-muted-foreground/60 mt-1">The AI will analyze medical bills, diagnoses, treatment timeline, and provide PIP compensability and BI valuation</p>
            </div>
          )}
          {analyzing && (
            <div className="rounded-xl border border-[#171b31]/20 bg-[#171b31]/5 p-10 text-center">
              <RefreshCw className="w-8 h-8 text-[#171b31] animate-spin mx-auto mb-3" />
              <p className="text-sm font-semibold text-foreground">Analyzing medical documents…</p>
              <p className="text-xs text-muted-foreground mt-1">Extracting bills, diagnoses, evaluating causation, calculating PIP and BI exposure</p>
            </div>
          )}
          {rawResult && !analysisResult && (
            <Panel title="Raw AI Output">
              <pre className="text-xs font-mono whitespace-pre-wrap text-foreground/80 max-h-[600px] overflow-y-auto">{rawResult}</pre>
            </Panel>
          )}
          {analysisResult && (
            <div className="space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border bg-card p-3">
                  <div className="text-xs text-muted-foreground">Total Billed</div>
                  <div className="text-lg font-bold text-foreground">{fmt(totalBilled)}</div>
                </div>
                <div className="rounded-lg border border-border bg-card p-3">
                  <div className="text-xs text-muted-foreground">Total Applicable</div>
                  <div className="text-lg font-bold text-green-600 dark:text-green-400">{fmt(analysisResult.totalApplicable)}</div>
                </div>
                {pipRules.hasPIP && (
                  <>
                    <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-3">
                      <div className="text-xs text-blue-600 dark:text-blue-400">PIP Payable</div>
                      <div className="text-lg font-bold text-blue-700 dark:text-blue-300">{fmt(analysisResult.pipAllowed)}</div>
                      <div className="text-[10px] text-blue-500 dark:text-blue-400">of {fmt(pipRules.limit)} limit · {fmt(analysisResult.pipRemaining)} remaining</div>
                    </div>
                  </>
                )}
                <div className="rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20 p-3">
                  <div className="text-xs text-orange-600 dark:text-orange-400">BI Settlement Range</div>
                  <div className="text-base font-bold text-orange-700 dark:text-orange-300">{fmt(analysisResult.biSettlementLow)} – {fmt(analysisResult.biSettlementHigh)}</div>
                  <div className="text-[10px] text-orange-500 dark:text-orange-400">Opening: {fmt(analysisResult.biOpeningOffer)} · Authority: {fmt(analysisResult.biAuthority)}</div>
                </div>
              </div>

              {/* Red Flags */}
              {analysisResult.redFlags.length > 0 && (
                <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20 p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                    <span className="text-xs font-semibold text-red-700 dark:text-red-300">Red Flags ({analysisResult.redFlags.length})</span>
                  </div>
                  <ul className="space-y-1">
                    {analysisResult.redFlags.map((f, i) => (
                      <li key={i} className="text-xs text-red-700 dark:text-red-300 flex gap-1.5"><span className="shrink-0">•</span>{f}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Result Tabs */}
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="flex overflow-x-auto border-b border-border bg-muted/30">
                  {([
                    { id: "expert", label: "Expert Summary" },
                    { id: "bills", label: `Bills (${analysisResult.bills.length})` },
                    { id: "diagnoses", label: `Diagnoses (${analysisResult.diagnoses.length})` },
                    { id: "timeline", label: "Timeline" },
                    ...(pipRules.hasPIP ? [{ id: "pip", label: "PIP" }] : []),
                    { id: "bi", label: "BI Valuation" },
                    { id: "letter", label: "Response Letter" },
                  ] as { id: string; label: string }[]).map(tab => (
                    <button key={tab.id} type="button"
                      onClick={() => setActiveResultTab(tab.id as typeof activeResultTab)}
                      className={`px-3 py-2 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${activeResultTab === tab.id ? "border-[#ff6221] text-[#ff6221]" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div className="p-4 max-h-[500px] overflow-y-auto">
                  {activeResultTab === "expert" && (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <p className="text-xs leading-relaxed whitespace-pre-wrap text-foreground/80">{analysisResult.expertSummary}</p>
                      {analysisResult.mechanismAssessment && (
                        <div className="mt-4 pt-3 border-t border-border">
                          <div className="text-xs font-semibold text-foreground mb-1">Mechanism of Loss Assessment</div>
                          <p className="text-xs leading-relaxed whitespace-pre-wrap text-foreground/80">{analysisResult.mechanismAssessment}</p>
                        </div>
                      )}
                    </div>
                  )}
                  {activeResultTab === "bills" && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left py-1.5 pr-2 font-semibold text-muted-foreground">Provider</th>
                            <th className="text-left py-1.5 pr-2 font-semibold text-muted-foreground">Date</th>
                            <th className="text-left py-1.5 pr-2 font-semibold text-muted-foreground">Code</th>
                            <th className="text-left py-1.5 pr-2 font-semibold text-muted-foreground">Description</th>
                            <th className="text-right py-1.5 pr-2 font-semibold text-muted-foreground">Billed</th>
                            <th className="text-right py-1.5 pr-2 font-semibold text-muted-foreground">Allowed</th>
                            <th className="text-center py-1.5 font-semibold text-muted-foreground">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analysisResult.bills.map((b, i) => (
                            <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                              <td className="py-1.5 pr-2 text-foreground/80">{b.provider}</td>
                              <td className="py-1.5 pr-2 text-foreground/70 whitespace-nowrap">{b.date}</td>
                              <td className="py-1.5 pr-2 font-mono text-foreground/80">{b.cptCode}</td>
                              <td className="py-1.5 pr-2 text-foreground/70">{b.description}</td>
                              <td className="py-1.5 pr-2 text-right font-mono">{fmt(b.amount)}</td>
                              <td className="py-1.5 pr-2 text-right font-mono">{fmt(b.allowedAmount)}</td>
                              <td className="py-1.5 text-center">
                                <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${b.applicable ? "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300" : "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300"}`}>
                                  {b.applicable ? "✓ OK" : "✗ No"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-border font-semibold">
                            <td colSpan={4} className="py-2 text-xs">Totals</td>
                            <td className="py-2 text-right font-mono text-xs">{fmt(totalBilled)}</td>
                            <td className="py-2 text-right font-mono text-xs text-green-600 dark:text-green-400">{fmt(totalAllowed)}</td>
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                  {activeResultTab === "diagnoses" && (
                    <div className="space-y-2">
                      {analysisResult.diagnoses.map((d, i) => (
                        <div key={i} className={`flex items-start gap-2 p-2 rounded border ${d.causallyRelated ? "border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-950/20" : "border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-950/20"}`}>
                          <span className={`text-xs font-mono font-semibold shrink-0 ${d.causallyRelated ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}>{d.code}</span>
                          <span className="text-xs text-foreground/80 flex-1">{d.description}</span>
                          <span className={`text-[10px] font-semibold shrink-0 ${d.causallyRelated ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>{d.causallyRelated ? "Related" : "Unrelated"}</span>
                        </div>
                      ))}
                      {analysisResult.treatmentGaps.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-border">
                          <div className="text-xs font-semibold text-foreground mb-2">Treatment Gaps</div>
                          {analysisResult.treatmentGaps.map((g, i) => (
                            <div key={i} className="flex items-center gap-2 p-2 rounded border border-yellow-200 dark:border-yellow-800 bg-yellow-50/30 dark:bg-yellow-950/20 mb-1">
                              <AlertTriangle className="w-3 h-3 text-yellow-500 shrink-0" />
                              <span className="text-xs text-foreground/80">{g.from} → {g.to} <span className="font-semibold text-yellow-700 dark:text-yellow-300">({g.days} days)</span></span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {activeResultTab === "timeline" && (
                    <div className="relative pl-4">
                      <div className="absolute left-1.5 top-0 bottom-0 w-0.5 bg-border" />
                      {analysisResult.treatmentTimeline.map((t, i) => (
                        <div key={i} className="relative mb-3 pl-4">
                          <div className="absolute left-[-7px] top-1 w-2.5 h-2.5 rounded-full bg-[#171b31] border-2 border-background" />
                          <div className="text-[10px] font-mono text-muted-foreground">{t.date}</div>
                          <div className="text-xs font-semibold text-foreground">{t.provider}</div>
                          <div className="text-xs text-foreground/70">{t.treatment}</div>
                        </div>
                      ))}
                    </div>
                  )}
	                  {activeResultTab === "pip" && pipRules.hasPIP && (
	                    <div className="space-y-3">
	                      <div className="rounded-md bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-3">
	                        <div className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-2">{state} PIP Rules</div>
	                        <div className="grid grid-cols-2 gap-2 text-xs">
	                          <div><span className="text-muted-foreground">Limit:</span> <span className="font-semibold">{fmt(pipRules.limit)}</span></div>
	                          <div><span className="text-muted-foreground">Rate:</span> <span className="font-semibold">{pipRules.pct}%</span></div>
	                          <div className="col-span-2"><span className="text-muted-foreground">Fee Schedule:</span> <span className="font-semibold">{pipRules.feeSchedule}</span></div>
	                          <div className="col-span-2"><span className="text-muted-foreground">Statute:</span> <span className="font-semibold">{pipRules.statute}</span></div>
	                        </div>
	                      </div>
	                      <div className="grid grid-cols-3 gap-2">
	                        <div className="rounded-md border border-border p-2 text-center">
	                          <div className="text-[10px] text-muted-foreground">Total Billed</div>
	                          <div className="text-sm font-bold">{fmt(totalBilled)}</div>
	                        </div>
	                        <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-950/20 p-2 text-center">
	                          <div className="text-[10px] text-blue-600 dark:text-blue-400">PIP Payable</div>
	                          <div className="text-sm font-bold text-blue-700 dark:text-blue-300">{fmt(analysisResult.pipAllowed)}</div>
	                        </div>
	                        <div className="rounded-md border border-border p-2 text-center">
	                          <div className="text-[10px] text-muted-foreground">Remaining Limit</div>
	                          <div className="text-sm font-bold">{fmt(analysisResult.pipRemaining)}</div>
	                        </div>
	                      </div>
	                      <div className="rounded-md border border-border bg-muted/25 p-3">
	                        <div className="text-xs font-semibold text-foreground">PIP bill review & exhaustion workflow</div>
	                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">This review calculates bill-level PIP applicability and payable amounts. Use the state-specific exhaustion notice after confirming the ledger, benefit limit, and paid total.</p>
	                        {(["FL", "PA", "VA", "MA"].includes(state)) ? (
	                          <Button asChild variant="outline" size="sm" className="mt-2 h-8 text-xs">
	                            <a href={`/doc-generator?tab=pip-exhaustion&memberState=${state}`}>Create {state} PIP exhaustion notice</a>
	                          </Button>
	                        ) : (
	                          <p className="mt-2 text-[11px] text-muted-foreground">The full PIP bill review remains available here. A dedicated exhaustion template is currently provided for FL, PA, VA, and MA.</p>
	                        )}
	                      </div>
	                    </div>
	                  )}
                  {activeResultTab === "bi" && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-md border border-border p-2">
                          <div className="text-[10px] text-muted-foreground">Special Damages</div>
                          <div className="text-sm font-bold">{fmt(analysisResult.totalApplicable)}</div>
                        </div>
                        <div className="rounded-md border border-border p-2">
                          <div className="text-[10px] text-muted-foreground">BI Exposure</div>
                          <div className="text-sm font-bold">{fmt(analysisResult.biExposure)}</div>
                        </div>
                        <div className="rounded-md border border-orange-200 dark:border-orange-800 bg-orange-50/30 dark:bg-orange-950/20 p-2">
                          <div className="text-[10px] text-orange-600 dark:text-orange-400">Settlement Range</div>
                          <div className="text-sm font-bold text-orange-700 dark:text-orange-300">{fmt(analysisResult.biSettlementLow)} – {fmt(analysisResult.biSettlementHigh)}</div>
                        </div>
                        <div className="rounded-md border border-border p-2">
                          <div className="text-[10px] text-muted-foreground">Opening Offer</div>
                          <div className="text-sm font-bold">{fmt(analysisResult.biOpeningOffer)}</div>
                        </div>
                        <div className="rounded-md border border-border p-2 col-span-2">
                          <div className="text-[10px] text-muted-foreground">Recommended Authority</div>
                          <div className="text-sm font-bold">{fmt(analysisResult.biAuthority)}</div>
                        </div>
                      </div>
                      {analysisResult.biRationale && (
                        <div className="rounded-md border border-border p-3">
                          <div className="text-xs font-semibold text-foreground mb-1.5">Valuation Rationale</div>
                          <p className="text-xs leading-relaxed text-foreground/80 whitespace-pre-wrap">{analysisResult.biRationale}</p>
                        </div>
                      )}
                    </div>
                  )}
	                  {activeResultTab === "letter" && (
	                    <div>
	                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
	                        <span className="text-xs font-semibold text-foreground">Response Letter Draft</span>
	                        <div className="flex flex-wrap gap-1.5">
	                          <Button variant="outline" size="sm" className="h-6 gap-1 text-xs" onClick={() => { const url = buildResponseLetterPdf(false); if (url) window.open(url, "_blank", "noopener,noreferrer"); }}><Eye className="w-3 h-3" />Preview PDF</Button>
	                          <Button variant="outline" size="sm" className="h-6 gap-1 text-xs" onClick={() => { buildResponseLetterPdf(true); }}><Download className="w-3 h-3" />Download PDF</Button>
	                          <Button variant="outline" size="sm" className="h-6 gap-1 text-xs"
	                            onClick={() => { navigator.clipboard.writeText(analysisResult.responseLetter); setCopiedLetter(true); setTimeout(() => setCopiedLetter(false), 2000); toast.success("Copied"); }}>
	                            {copiedLetter ? <CheckCircle className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
	                            {copiedLetter ? "Copied" : "Copy"}
	                          </Button>
	                        </div>
	                      </div>
	                      <pre className="text-xs font-mono whitespace-pre-wrap text-foreground/80 leading-relaxed">{analysisResult.responseLetter}</pre>
	                      {responsePdfUrl && <a href={responsePdfUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-xs font-medium underline underline-offset-2">Open the current formatted PDF</a>}
	                    </div>
	                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


const KLUTCH_STATE_RULES: Record<string, {
  biLimits: string; pdLimit: string;
  um: boolean; umLimit: string;
  uim: boolean; uimLimit: string;
  pip: boolean; pipLimit: string;
}> = {
  MD: { biLimits: "$30,000 / $60,000", pdLimit: "$15,000", um: true, umLimit: "$30,000 / $60,000", uim: true, uimLimit: "$30,000 / $60,000", pip: true, pipLimit: "$2,500" },
  VA: { biLimits: "$30,000 / $60,000", pdLimit: "$20,000", um: true, umLimit: "$30,000 / $60,000", uim: true, uimLimit: "$30,000 / $60,000", pip: false, pipLimit: "" },
  FL: { biLimits: "$10,000 / $20,000", pdLimit: "$10,000", um: true, umLimit: "$10,000 / $20,000", uim: false, uimLimit: "", pip: true, pipLimit: "$10,000" },
  GA: { biLimits: "$25,000 / $50,000", pdLimit: "$25,000", um: true, umLimit: "$25,000 / $50,000", uim: true, uimLimit: "$25,000 / $50,000", pip: false, pipLimit: "" },
  IL: { biLimits: "$25,000 / $50,000", pdLimit: "$20,000", um: true, umLimit: "$25,000 / $50,000", uim: true, uimLimit: "$25,000 / $50,000", pip: false, pipLimit: "" },
  MA: { biLimits: "$20,000 / $40,000", pdLimit: "$5,000", um: true, umLimit: "$20,000 / $40,000", uim: true, uimLimit: "$20,000 / $40,000", pip: true, pipLimit: "$8,000" },
  PA: { biLimits: "$15,000 / $30,000", pdLimit: "$5,000", um: true, umLimit: "$15,000 / $30,000", uim: true, uimLimit: "$15,000 / $30,000", pip: true, pipLimit: "$5,000" },
  TX: { biLimits: "$30,000 / $60,000", pdLimit: "$25,000", um: true, umLimit: "$30,000 / $60,000", uim: true, uimLimit: "$30,000 / $60,000", pip: false, pipLimit: "" },
  NY: { biLimits: "$25,000 / $50,000", pdLimit: "$10,000", um: true, umLimit: "$25,000 / $50,000", uim: true, uimLimit: "$25,000 / $50,000", pip: true, pipLimit: "$50,000" },
  NJ: { biLimits: "$15,000 / $30,000", pdLimit: "$5,000", um: true, umLimit: "$15,000 / $30,000", uim: true, uimLimit: "$15,000 / $30,000", pip: true, pipLimit: "$15,000" },
  DC: { biLimits: "$25,000 / $50,000", pdLimit: "$10,000", um: true, umLimit: "$25,000 / $50,000", uim: true, uimLimit: "$25,000 / $50,000", pip: true, pipLimit: "$50,000" },
  NC: { biLimits: "$30,000 / $60,000", pdLimit: "$25,000", um: true, umLimit: "$30,000 / $60,000", uim: true, uimLimit: "$30,000 / $60,000", pip: false, pipLimit: "" },
  SC: { biLimits: "$25,000 / $50,000", pdLimit: "$25,000", um: true, umLimit: "$25,000 / $50,000", uim: true, uimLimit: "$25,000 / $50,000", pip: false, pipLimit: "" },
};
// ─── Tab: Certificate of Insurance (Unified) ─────────────────────────────────
// State rules for both Metrocars (self-insured) and Klutch (insurer)
const COI_STATE_RULES: Record<string, {
  biPP: string; biPO: string; pdLimit: string;
  umPP: string; umPO: string;
  uimPP: string; uimPO: string;
  pip: boolean; pipLimit: string;
  umRejectable: boolean;
  statute: string; authority: string;
}> = {
  MD: { biPP: "$30,000", biPO: "$60,000", pdLimit: "$15,000", umPP: "$30,000", umPO: "$60,000", uimPP: "$30,000", uimPO: "$60,000", pip: true, pipLimit: "$2,500", umRejectable: false, statute: "Maryland Transportation Article § 17-103", authority: "Maryland Motor Vehicle Administration" },
  VA: { biPP: "$30,000", biPO: "$60,000", pdLimit: "$20,000", umPP: "$30,000", umPO: "$60,000", uimPP: "$30,000", uimPO: "$60,000", pip: false, pipLimit: "", umRejectable: true, statute: "Virginia Code § 46.2-472", authority: "Virginia Department of Motor Vehicles" },
  FL: { biPP: "$10,000", biPO: "$20,000", pdLimit: "$10,000", umPP: "$10,000", umPO: "$20,000", uimPP: "", uimPO: "", pip: true, pipLimit: "$10,000", umRejectable: true, statute: "Florida Statute § 627.733", authority: "Florida Department of Highway Safety and Motor Vehicles" },
  GA: { biPP: "$25,000", biPO: "$50,000", pdLimit: "$25,000", umPP: "$25,000", umPO: "$50,000", uimPP: "$25,000", uimPO: "$50,000", pip: false, pipLimit: "", umRejectable: true, statute: "Georgia Code § 33-34-4", authority: "Georgia Department of Revenue" },
  IL: { biPP: "$25,000", biPO: "$50,000", pdLimit: "$20,000", umPP: "$25,000", umPO: "$50,000", uimPP: "$25,000", uimPO: "$50,000", pip: false, pipLimit: "", umRejectable: true, statute: "625 ILCS 5/7-601", authority: "Illinois Secretary of State" },
  MA: { biPP: "$20,000", biPO: "$40,000", pdLimit: "$5,000", umPP: "$20,000", umPO: "$40,000", uimPP: "$20,000", uimPO: "$40,000", pip: true, pipLimit: "$8,000", umRejectable: false, statute: "M.G.L. c. 90 § 34A", authority: "Massachusetts Registry of Motor Vehicles" },
  PA: { biPP: "$15,000", biPO: "$30,000", pdLimit: "$5,000", umPP: "$15,000", umPO: "$30,000", uimPP: "$15,000", uimPO: "$30,000", pip: true, pipLimit: "$5,000", umRejectable: true, statute: "75 Pa.C.S. § 1701", authority: "Pennsylvania Department of Transportation" },
  TX: { biPP: "$30,000", biPO: "$60,000", pdLimit: "$25,000", umPP: "$30,000", umPO: "$60,000", uimPP: "$30,000", uimPO: "$60,000", pip: false, pipLimit: "", umRejectable: true, statute: "Texas Transportation Code § 601.051", authority: "Texas Department of Public Safety" },
  NJ: { biPP: "$15,000", biPO: "$30,000", pdLimit: "$5,000", umPP: "$15,000", umPO: "$30,000", uimPP: "$15,000", uimPO: "$30,000", pip: true, pipLimit: "$15,000", umRejectable: false, statute: "N.J.S.A. § 39:6B-1", authority: "New Jersey Motor Vehicle Commission" },
  NY: { biPP: "$25,000", biPO: "$50,000", pdLimit: "$10,000", umPP: "$25,000", umPO: "$50,000", uimPP: "$25,000", uimPO: "$50,000", pip: true, pipLimit: "$50,000", umRejectable: false, statute: "NY Insurance Law § 3420", authority: "New York DMV" },
  DC: { biPP: "$25,000", biPO: "$50,000", pdLimit: "$10,000", umPP: "$25,000", umPO: "$50,000", uimPP: "$25,000", uimPO: "$50,000", pip: true, pipLimit: "$50,000", umRejectable: false, statute: "D.C. Code § 31-2406", authority: "DC Department of Motor Vehicles" },
};

const COI_STATES = ["MD","VA","FL","GA","IL","MA","PA","TX"];

const KLUTCH_SUBSCRIPTION_START_CUTOFF = "2026-07-01";

export function UnifiedCOITab({
  initialState = "MD",
  carrierMode = "auto",
}: {
  initialState?: string;
  carrierMode?: "auto" | "metrocars";
}) {
  const [state, setState] = React.useState(initialState || "MD");
  const [previewPdfUrl, setPreviewPdfUrl] = React.useState<string | null>(null);
  const [umRejected, setUmRejected] = React.useState(false);
  const [pipWaived, setPipWaived] = React.useState(false);
  const [stillInRentalCOI, setStillInRentalCOI] = React.useState(false);
  const previouslyStillInRentalCOI = React.useRef(false);
  const [form, setForm] = React.useState({
    namedOperator: "",
    insuredAddress: "14670 Southlawn Lane, Rockville, MD 20850",
    vehicleYear: "",
    vehicleMake: "",
    vehicleModel: "",
    vin: "",
    plateNumber: "",
    expirationDate: "",
    dateOfLoss: "",
    subscriptionStartDate: "",
    certNumber: "",
    revisionNumber: "",
    specialProvisions: "",
  });
  const set = (k: keyof typeof form) => (v: string) => setForm(p => ({ ...p, [k]: v }));
  const setCoiIssueAndSubscriptionDate = (value: string) => setForm(p => ({
    ...p,
    subscriptionStartDate: value,
  }));
  // Florida does not carry a separate UIM limit in this form. Georgia permits
  // a named-insured election, so it must remain a handler-controlled choice.
  const isAutomaticUmRejection = state === "FL";
  const isFloridaPipMandatory = state === "FL";
  React.useEffect(() => {
    setUmRejected(isAutomaticUmRejection);
    if (isFloridaPipMandatory) setPipWaived(false);
  }, [isAutomaticUmRejection, isFloridaPipMandatory]);
  // Date Issued and Subscription Start Date are a single COI date.
  const coiCoverage = React.useMemo(() => computeCoverageThrough({
    startDateStr: form.subscriptionStartDate,
    state,
    stillInRental: stillInRentalCOI,
    dateOfLossStr: form.dateOfLoss,
  }), [form.subscriptionStartDate, form.dateOfLoss, state, stillInRentalCOI]);
  React.useEffect(() => {
    if (stillInRentalCOI && coiCoverage.throughDate && !coiCoverage.warning) {
      setForm(p => ({ ...p, expirationDate: formatDateISO(coiCoverage.throughDate!) }));
    }
    const toggledFromProjectedPeriod = previouslyStillInRentalCOI.current;
    if (!stillInRentalCOI && form.dateOfLoss) {
      // A concluded rental uses the editable last-rental date.  Start the
      // handler with Date of Loss, but retain a subsequent manual override.
      setForm(p => (toggledFromProjectedPeriod || !p.expirationDate)
        ? { ...p, expirationDate: p.dateOfLoss }
        : p,
      );
    }
    previouslyStillInRentalCOI.current = stillInRentalCOI;
  }, [stillInRentalCOI, coiCoverage.throughDate, coiCoverage.warning]);
  const [vinDecoding, setVinDecoding] = React.useState(false);
  const decodeVinCOI = async () => {
    const vin = form.vin.trim();
    if (vin.length !== 17) { toast.error("VIN must be exactly 17 characters"); return; }
    setVinDecoding(true);
    try {
      const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`);
      const data = await res.json() as { Results: Array<{ Variable: string; Value: string | null }> };
      const get = (v: string) => data.Results.find(r => r.Variable === v)?.Value || "";
      const year = get("Model Year"); const make = get("Make"); const model = get("Model"); const trim = get("Trim");
      if (year || make || model) {
        setForm(p => ({ ...p, vehicleYear: year || p.vehicleYear, vehicleMake: make || p.vehicleMake, vehicleModel: trim ? `${model} ${trim}` : model || p.vehicleModel }));
        toast.success(`Decoded: ${[year, make, model, trim].filter(Boolean).join(" ")}`);
      } else { toast.error("Could not decode VIN — check the number and try again"); }
    } catch { toast.error("VIN decode failed — check your connection"); }
    finally { setVinDecoding(false); }
  };

  const rules = COI_STATE_RULES[state] || COI_STATE_RULES["MD"];
  // General COIs determine carrier of record by Subscription Start Date. The
  // dedicated Liability-only MetroCars page intentionally fixes the carrier to
  // MetroCars so the handler cannot accidentally issue a Klutch certificate.
  const insurer: "klutch" | "metrocars" = carrierMode === "metrocars"
    ? "metrocars"
    : form.subscriptionStartDate >= KLUTCH_SUBSCRIPTION_START_CUTOFF
      ? "klutch"
      : "metrocars";
  const isKlutch = insurer === "klutch";
  const approvedSignoff = useKlutchSignoff(isKlutch);
  React.useEffect(() => { setPreviewPdfUrl(null); }, [isKlutch, approvedSignoff.identityKey, approvedSignoff.revision]);
  // COIs use one Date Issued / Subscription Start Date. Keep every rendered
  // coverage-period field tied to that single source rather than the legacy,
  // unpopulated effectiveDate form property.
  const coverageStartDate = form.subscriptionStartDate;

  // Auto-generate cert number on mount and when insurer/state changes
  // Klutch: KIS + 4 random digits (e.g. KIS3847)
  // Metrocars: [state]000S0137 + 2-4 random digits (e.g. MD000S013712)
  React.useEffect(() => {
    if (isKlutch) {
      const num = Math.floor(1000 + Math.random() * 9000);
      setForm(p => ({ ...p, certNumber: `KIS${num}` }));
    } else {
      const num = Math.floor(10 + Math.random() * 990);
      setForm(p => ({ ...p, certNumber: `${state}000S0137${num}` }));
    }
  }, [insurer, state]);

  const fmtDate = (d: string) => {
    if (!d) return "—";
    const [y, m, day] = d.split("-");
    return `${m}/${day}/${y}`;
  };
  const fmtDateLong = (d: string) => {
    if (!d) return "—";
    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const [y, m, day] = d.split("-");
    return `${months[parseInt(m)-1]} ${parseInt(day)}, ${y}`;
  };

  const handleDownload = async (shouldDownload = true) => {
    let signoff: Awaited<ReturnType<typeof approvedSignoff.requireApprovedSignoff>> | undefined;
    if (isKlutch) {
      try { signoff = await approvedSignoff.requireApprovedSignoff(); }
      catch (error) { toast.error(error instanceof Error ? error.message : "Unable to load the approved Klutch sign-off."); return; }
    }
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const lm = 12, rm = W - 12;
    const textW = rm - lm;
    let y = 8;

    // ── HEADER ──────────────────────────────────────────────────────────────
    // Left column: logo (constrained to left ~35% to avoid title overlap)
    if (isKlutch) {
      // Transparent 1056 x 372px logo contained within the original 40 x 10mm box.
      try { doc.addImage(KLUTCH_LOGO_B64, "PNG", lm, y + 1, 10 * (1056 / 372), 10); } catch {}
    } else {
      // Metrocars: MCL logo (inverted, white on dark)
      try {
        doc.addImage(MCL_LOGO_B64, "PNG", lm, y + 1, 36, 12);
      } catch {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(0, 0, 0);
        doc.text("METROCARS LEASING CORP", lm, y + 5, { maxWidth: 42 });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(80, 80, 80);
        doc.text("Whip Claims Management", lm, y + 9.5);
      }
    }

    // Center: CERTIFICATE OF INSURANCE
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text("CERTIFICATE OF INSURANCE", W / 2, y + 6, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(80, 80, 80);
    const subtitle = isKlutch
      ? "Issued by Klutch Risk Retention Group\nPursuant to Maryland Transportation Article § 17-103"
      : "Issued by the Maryland Motor Vehicle Administration\nPursuant to Maryland Transportation Article § 17-103";
    doc.text(subtitle, W / 2, y + 11, { align: "center" });

    // Right: Date + Cert No
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text("DATE (MM/DD/YYYY)", rm, y + 3, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text(fmtDate(form.subscriptionStartDate) || new Date().toLocaleDateString("en-US"), rm, y + 7, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text("CERTIFICATE NO.", rm, y + 11, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text(form.certNumber || "—", rm, y + 15, { align: "right" });

    y += 20;
    // Header bottom border
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.8);
    doc.line(lm, y, rm, y);
    y += 4;

    // ── DISCLAIMER BOX ──────────────────────────────────────────────────────
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.6);
    doc.rect(lm, y, textW, 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(0, 0, 0);
    const disclaimerText = isKlutch
      ? "THIS CERTIFICATE IS ISSUED AS PROOF OF FINANCIAL RESPONSIBILITY PURSUANT TO MARYLAND TRANSPORTATION ARTICLE § 17-103. IT DOES NOT AFFIRMATIVELY OR NEGATIVELY AMEND, EXTEND OR ALTER COVERAGE AFFORDED BY THE POLICY ISSUED BY KLUTCH RISK RETENTION GROUP. COVERAGE IS SUBJECT TO ALL TERMS, CONDITIONS, AND EXCLUSIONS OF THE POLICY."
      : "THIS CERTIFICATE IS ISSUED AS PROOF OF FINANCIAL RESPONSIBILITY PURSUANT TO MARYLAND TRANSPORTATION ARTICLE § 17-103. IT DOES NOT AFFIRMATIVELY OR NEGATIVELY AMEND, EXTEND OR ALTER COVERAGE AFFORDED BY THE SELF-INSURANCE PROGRAM. COVERAGE IS SUBJECT TO ALL TERMS, CONDITIONS, AND EXCLUSIONS OF THE PROGRAM.";
    doc.text(disclaimerText, lm + 2, y + 4, { maxWidth: textW - 5 });
    y += 16;

    // ── IMPORTANT BOX ───────────────────────────────────────────────────────
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.3);
    doc.rect(lm, y, textW, 10);
    doc.setFontSize(6.5);
    doc.setTextColor(60, 60, 60);
    const importantText = `IMPORTANT: If coverage under this certificate is extended to an ADDITIONAL INSURED, applicable endorsement provisions apply. If SUBROGATION IS WAIVED, certain conditions may require an endorsement. This certificate does not confer rights to the certificate holder beyond those provided by the ${isKlutch ? "policy issued by Klutch Risk Retention Group" : "self-insurance program"}.`;
    doc.text(importantText, lm + 2, y + 3.5, { maxWidth: textW - 4 });
    y += 12;

    // ── PRODUCER / CONTACT / INSURER GRID ───────────────────────────────────
    const col1W = textW * 0.35;
    const col2W = textW * 0.30;
    const col3W = textW * 0.35;
    const gridH = 22;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.rect(lm, y, textW, gridH);
    doc.line(lm + col1W, y, lm + col1W, y + gridH);
    doc.line(lm + col1W + col2W, y, lm + col1W + col2W, y + gridH);

    // Col 1: Producer
    doc.setFontSize(6.5); doc.setTextColor(100, 100, 100); doc.setFont("helvetica", "bold");
    doc.text("PRODUCER / CARRIER", lm + 2, y + 3.5);
    doc.setFont("helvetica", "normal"); doc.setTextColor(0, 0, 0); doc.setFontSize(7.5);
    if (isKlutch) {
      doc.text("Klutch Risk Retention Group", lm + 2, y + 7);
      doc.text("424 Church Street, Suite 800", lm + 2, y + 10.5);
      doc.text("Nashville, Tennessee 37219", lm + 2, y + 14);
      doc.text("claims@klutchinsurance.com", lm + 2, y + 17.5);
      doc.setFontSize(6.5); doc.setTextColor(100, 100, 100);
      doc.text("CERT. NO:", lm + 2, y + 21);
      doc.setTextColor(0, 0, 0); doc.text(form.certNumber || "—", lm + 14, y + 21);
    } else {
      doc.text("Metrocars Leasing Corp", lm + 2, y + 7);
      doc.text("P.O. Box 10622", lm + 2, y + 10.5);
      doc.text("Rockville, MD 20850", lm + 2, y + 14);
      doc.text("(855) 906-5949", lm + 2, y + 17.5);
      doc.setFontSize(6.5); doc.setTextColor(100, 100, 100);
      doc.text("CERT. NO:", lm + 2, y + 21);
      doc.setTextColor(0, 0, 0); doc.setFontSize(7.5);
      doc.text(form.certNumber || "—", lm + 14, y + 21);
    }

    // Col 2: Contact
    const c2x = lm + col1W + 2;
    doc.setFontSize(6.5); doc.setTextColor(100, 100, 100); doc.setFont("helvetica", "bold");
    doc.text("CONTACT", c2x, y + 3.5);
    doc.setFont("helvetica", "normal"); doc.setTextColor(0, 0, 0); doc.setFontSize(7.5);
    if (isKlutch) {
      doc.text("EMAIL: claims@klutchinsurance.com", c2x, y + 7);
      doc.text("FAX: 877-890-0531", c2x, y + 10.5);
    } else {
      doc.text("PHONE: (855) 906-5949", c2x, y + 7);
      doc.text("FAX: 877-890-0531", c2x, y + 10.5);
      doc.text("EMAIL: claims@drivewhip.com", c2x, y + 14);
    }

    // Col 3: Insurer
    const c3x = lm + col1W + col2W + 2;
    doc.setFontSize(6.5); doc.setTextColor(100, 100, 100); doc.setFont("helvetica", "bold");
    doc.text("INSURER(S) AFFORDING COVERAGE", c3x, y + 3.5);
    doc.setFont("helvetica", "normal"); doc.setTextColor(0, 0, 0); doc.setFontSize(7.5);
    if (isKlutch) {
      doc.setFontSize(6.5); doc.setTextColor(100, 100, 100);
      doc.text("INSURER A:", c3x, y + 7);
      doc.setTextColor(0, 0, 0); doc.setFontSize(7.5);
      doc.text("Klutch Risk Retention Group · NAIC 17966", c3x + 14, y + 7);
      doc.setFontSize(6.5); doc.setTextColor(100, 100, 100);
      doc.text("CERT. NO:", c3x, y + 10.5);
      doc.setTextColor(0, 0, 0); doc.text(form.certNumber || "—", c3x + 14, y + 10.5);
      doc.setFontSize(6.5); doc.setTextColor(100, 100, 100);
      doc.text("INSURER B:", c3x, y + 14);
      doc.text("INSURER C:", c3x, y + 17.5);
      doc.text("INSURER D:", c3x, y + 21);
    } else {
      doc.setFontSize(6.5); doc.setTextColor(100, 100, 100);
      doc.text("INSURER A:", c3x, y + 7);
      doc.setTextColor(0, 0, 0); doc.setFontSize(7.5);
      doc.text("Maryland MVA / Self-Insured", c3x + 14, y + 7);
      doc.setFontSize(6.5); doc.setTextColor(100, 100, 100);
      doc.text("CERT. NO:", c3x, y + 10.5);
      doc.setTextColor(0, 0, 0); doc.text(form.certNumber || "—", c3x + 14, y + 10.5);
      doc.setFontSize(6.5); doc.setTextColor(100, 100, 100);
      doc.text("INSURER B:", c3x, y + 14);
      doc.text("INSURER C:", c3x, y + 17.5);
      doc.text("INSURER D:", c3x, y + 21);
    }
    y += gridH + 3;

    // ── INSURED SECTION ─────────────────────────────────────────────────────
    // Metrocars Leasing Corp is shown as additional insured and the member is shown as renter/named operator.
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    const insuredH = 24;
    doc.rect(lm, y, textW, insuredH);
    // Left cell: Metrocars remains the named insured; the renter is emphasized as additional named insured.
    doc.line(lm + textW * 0.5, y, lm + textW * 0.5, y + insuredH);
    doc.setFontSize(6.1); doc.setTextColor(100, 100, 100); doc.setFont("helvetica", "bold");
    doc.text("NAMED INSURED", lm + 2, y + 3.2);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(0, 0, 0);
    doc.text("Metrocars Leasing Corp", lm + 2, y + 6.6);
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(100, 100, 100);
    doc.text("ADDITIONAL NAMED INSURED / RENTER", lm + 2, y + 10.2);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.6); doc.setTextColor(0, 0, 0);
    doc.text(form.namedOperator || "—", lm + 2, y + 14.7);
    const vehicleStr = [form.vehicleYear, form.vehicleMake, form.vehicleModel].filter(Boolean).join(" ") || "—";
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.6); doc.setTextColor(0, 0, 0);
    doc.text(`RENTAL VEHICLE: ${vehicleStr}  ·  VIN: ${form.vin || "—"}`, lm + 2, y + 18.6);
    if (form.plateNumber) doc.text(`Plate: ${form.plateNumber}`, lm + 2, y + 22);

    // Right cell: coverage period + state
    const rx = lm + textW * 0.5 + 2;
    doc.setFontSize(6.5); doc.setTextColor(100, 100, 100); doc.setFont("helvetica", "bold");
    doc.text("COVERAGE PERIOD", rx, y + 3.5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(0, 0, 0);
    const periodStr = (coverageStartDate && form.expirationDate)
      ? `${fmtDateLong(coverageStartDate)} — ${fmtDateLong(form.expirationDate)}`
      : "—";
    doc.text(periodStr, rx, y + 8);
    doc.setFontSize(6.5); doc.setTextColor(100, 100, 100); doc.setFont("helvetica", "bold");
    doc.text("STATE OF LOSS", rx, y + 13.5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(0, 0, 0);
    doc.text(state, rx, y + 18);
    y += insuredH + 3;

    // ── COVERAGES HEADER ────────────────────────────────────────────────────
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(0, 0, 0);
    doc.text("COVERAGES", lm, y + 4);
    doc.text(`CERTIFICATE NUMBER: ${form.certNumber || "—"}`, lm + 50, y + 4);
    doc.text(`REVISION NUMBER: ${form.revisionNumber || "—"}`, rm, y + 4, { align: "right" });
    y += 9;  // extra spacing before table

    // Preamble
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(60, 60, 60);
    const preamble = `THIS IS TO CERTIFY THAT THE COVERAGES LISTED BELOW HAVE BEEN ISSUED TO THE INSURED NAMED ABOVE FOR THE COVERAGE PERIOD INDICATED. NOTWITHSTANDING ANY REQUIREMENT, TERM OR CONDITION OF ANY CONTRACT OR OTHER DOCUMENT WITH RESPECT TO WHICH THIS CERTIFICATE MAY BE ISSUED OR MAY PERTAIN, THE COVERAGE AFFORDED IS SUBJECT TO ALL TERMS, EXCLUSIONS AND CONDITIONS OF THE POLICY. LIMITS SHOWN MAY HAVE BEEN REDUCED BY PAID CLAIMS.`;
    doc.text(preamble, lm, y, { maxWidth: textW });
    y += 11;

    // ── COVERAGE TABLE ───────────────────────────────────────────────────────
    // Column widths: INSR(8) ADDL(8) SUBR(8) TYPE(55) POLICY#(25) EFF(18) EXP(18) LIMITS(rest)
    // Column widths: total = textW (186mm on letter). Give type more room, tighten others
    const cols = { insr: 11, addl: 6, type: 60, pol: 24, eff: 16, exp: 16 };
    const limW = textW - cols.insr - cols.addl - cols.type - cols.pol - cols.eff - cols.exp;
    const rowH = 8;
    const hdrH = 6;

    // Table header
    doc.setFillColor(240, 240, 240);
    doc.rect(lm, y, textW, hdrH, "F");
    doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.3);
    doc.rect(lm, y, textW, hdrH);
    doc.setFont("helvetica", "bold"); doc.setFontSize(6); doc.setTextColor(0, 0, 0);
    let cx = lm;
    const hdrLabels = [
      { w: cols.insr, t: "INSR\nLTR" },
      { w: cols.addl, t: "ADDL\nINSD" },
      { w: cols.type, t: "TYPE OF INSURANCE" },
      { w: cols.pol, t: "POLICY NUMBER" },
      { w: cols.eff, t: "POLICY EFF\n(MM/DD/YYYY)" },
      { w: cols.exp, t: "POLICY EXP\n(MM/DD/YYYY)" },
      { w: limW, t: "LIMITS" },
    ];
    for (const h of hdrLabels) {
      doc.text(h.t, cx + h.w / 2, y + 2.5, { align: "center", maxWidth: h.w - 1 });
      cx += h.w;
      if (cx < lm + textW) doc.line(cx, y, cx, y + hdrH);
    }
    y += hdrH;

    // Coverage rows
    const policyNo = form.certNumber || "—";
    const effDate = fmtDate(coverageStartDate);
    const expDate = fmtDate(form.expirationDate);

    const coverageRows = [
      {
        insr: "BI", type: "BODILY INJURY LIABILITY",
        limits: `PER PERSON  ${rules.biPP}\nPER OCCURRENCE  ${rules.biPO}`,
      },
      {
        insr: "PD", type: "PROPERTY DAMAGE LIABILITY",
        limits: `PER OCCURRENCE  ${rules.pdLimit}`,
      },
      {
        insr: "UM", type: "UNINSURED MOTORIST (UM)",
        limits: umRejected
          ? "REJECTED BY NAMED INSURED"
          : `PER PERSON  ${rules.umPP}\nPER OCCURRENCE  ${rules.umPO}`,
      },
      {
        insr: "UIM", type: "UNDERINSURED MOTORIST (UIM)",
        limits: umRejected && rules.uimPP
          ? "REJECTED BY NAMED INSURED"
          : (rules.uimPP ? `PER PERSON  ${rules.uimPP}\nPER OCCURRENCE  ${rules.uimPO}` : "NOT APPLICABLE"),
      },
      {
        insr: "PIP", type: "PERSONAL INJURY PROTECTION (PIP)",
        limits: !rules.pip
          ? "NOT REQUIRED IN THIS STATE"
          : (pipWaived && !isFloridaPipMandatory)
            ? "WAIVED BY NAMED INSURED"
            : `PER PERSON — STATUTORY MIN  ${rules.pipLimit}`,
      },
      {
        insr: "COL", type: "PHYSICAL DAMAGE — COLLISION",
        limits: "SUBJECT TO MEMBER AGREEMENT\nINCLUDED",
      },
      {
        insr: "COMP", type: "PHYSICAL DAMAGE — COMPREHENSIVE",
        limits: "SUBJECT TO MEMBER AGREEMENT\nINCLUDED",
      },
    ];
    // Metrocars is additional insured for liability and physical damage. Maryland mandates UM/UIM,
    // so those protections also extend to Metrocars as additional insured on Maryland certificates.
    const additionalInsuredCoverageCodes = new Set(
      state === "MD" ? ["BI", "PD", "UM", "UIM", "COL", "COMP"] : ["BI", "PD", "COL", "COMP"]
    );

    for (const row of coverageRows) {
      const lines = row.limits.split("\n");
      const rH = Math.max(rowH, lines.length * 4.5 + 2);
      doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.2);
      doc.rect(lm, y, textW, rH);
      cx = lm;
      for (const col of [cols.insr, cols.addl, cols.type, cols.pol, cols.eff, cols.exp, limW]) {
        cx += col;
        if (cx < lm + textW) doc.line(cx, y, cx, y + rH);
      }
      // INSR LTR
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(0, 0, 0);
      doc.text(row.insr, lm + cols.insr / 2, y + rH / 2 + 1, { align: "center" });
      // ADDL INSD indicator: applicable liability and physical-damage coverages extend to Metrocars Leasing Corp.
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text(additionalInsuredCoverageCodes.has(row.insr) ? "[X]" : "[ ]", lm + cols.insr + cols.addl / 2, y + rH / 2 + 1.5, { align: "center" });
      // Type — use 7pt and maxWidth to prevent overflow into policy number column
      doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(0, 0, 0);
      const typeX = lm + cols.insr + cols.addl + 2;
      doc.text(row.type, typeX, y + rH / 2 + 1, { maxWidth: cols.type - 3 });
      // Policy No
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
      const polX = lm + cols.insr + cols.addl + cols.type + 2;
      doc.text(policyNo, polX, y + rH / 2 + 1);
      // Eff / Exp dates
      const effX = polX + cols.pol;
      doc.text(effDate, effX + cols.eff / 2, y + rH / 2 + 1, { align: "center" });
      const expX = effX + cols.eff;
      doc.text(expDate, expX + cols.exp / 2, y + rH / 2 + 1, { align: "center" });
      // Limits
      const limX = expX + cols.exp + 2;
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(0, 0, 0);
      for (let li = 0; li < lines.length; li++) {
        doc.text(lines[li], limX, y + 3.5 + li * 4.5);
      }
      y += rH;
    }
    y += 3;

    // ── DESCRIPTION OF OPERATIONS ────────────────────────────────────────────
    doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.3);
    const descH = 30;
    doc.rect(lm, y, textW, descH);
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(80, 80, 80);
    doc.text("DESCRIPTION OF OPERATIONS / LOCATIONS / VEHICLES / SPECIAL CONDITIONS", lm + 2, y + 3.5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(0, 0, 0);
    const desc1 = isKlutch
      ? `1. This certificate is issued by Klutch Risk Retention Group to Metrocars Leasing Corp (named insured/vehicle owner). Coverage applies to the vehicle identified above when operated by the named operator under an active Membership Agreement.`
      : `1. Coverage applies to the vehicle identified above while operated by the named member under an active Membership Agreement with Metrocars Leasing Corp.`;
    const desc2 = isKlutch
      ? `2. Certificate No. ${form.certNumber || "—"} issued pursuant to Maryland Transportation Article § 17-103.`
      : `2. Metrocars Leasing Corp is self-insured pursuant to Certificate No. ${form.certNumber || "—"} issued by the Maryland Motor Vehicle Administration.`;
    const desc3 = `3. During any TNC period in which Uber/Lyft coverage is primary, this certificate provides contingent coverage only to the extent not covered by the TNC carrier.`;
    const desc4 = `4. Unauthorized/unlisted operator exclusion applies. PIP and UM/UIM are provided at statutory minimums only, per applicable state law.`;
    // Increase description box height and add more spacing between items
    doc.text(desc1, lm + 2, y + 6.5, { maxWidth: textW - 4 });
    doc.text(desc2, lm + 2, y + 13.5, { maxWidth: textW - 4 });
    doc.text(desc3, lm + 2, y + 20, { maxWidth: textW - 4 });
    doc.text(desc4, lm + 2, y + 25.5, { maxWidth: textW - 4 });
    y += descH + 3;

    // ── BOTTOM GRID: CERT HOLDER + CANCELLATION ──────────────────────────────
    const botH = 28;
    doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.3);
    doc.rect(lm, y, textW, botH);
    doc.line(lm + textW * 0.4, y, lm + textW * 0.4, y + botH);
    // Cert Holder
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(80, 80, 80);
    doc.text("CERTIFICATE HOLDER", lm + 2, y + 3.5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(0, 0, 0);
    if (isKlutch) {
      doc.text("Metrocars Leasing Corp", lm + 2, y + 8);
      doc.text("P.O. Box 10622", lm + 2, y + 12.5);
      doc.text("Rockville, MD 20850", lm + 2, y + 17);
    } else {
      doc.text("Metrocars Leasing Corp", lm + 2, y + 8);
      doc.text("P.O. Box 10622", lm + 2, y + 12.5);
      doc.text("Rockville, MD 20850", lm + 2, y + 17);
    }
    // Cancellation
    const cx2 = lm + textW * 0.4 + 2;
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(80, 80, 80);
    doc.text("CANCELLATION", cx2, y + 3.5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(0, 0, 0);
    const cancelText = "SHOULD ANY OF THE ABOVE DESCRIBED COVERAGES BE CANCELLED BEFORE THE EXPIRATION DATE THEREOF, NOTICE WILL BE DELIVERED IN ACCORDANCE WITH APPLICABLE MARYLAND STATUTORY REQUIREMENTS AND THE TERMS OF THE MEMBER AGREEMENT.";
    doc.text(cancelText, cx2, y + 8, { maxWidth: textW * 0.6 - 4 });
    if (isKlutch) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
      doc.text(signoff!.name, cx2, y + 19);
      doc.setFont("helvetica", "normal"); doc.setFontSize(6.5);
      doc.text(signoff!.title, cx2, y + 22);
    }
    doc.setFont("helvetica", "italic"); doc.setFontSize(7.5); doc.setTextColor(0, 0, 0);
    const sigLine = isKlutch ? "Authorized Representative, Klutch Risk Retention Group" : "Authorized Representative";
    doc.text(sigLine, cx2, y + 25);
    y += botH + 3;

    // ── FOOTER ───────────────────────────────────────────────────────────────
    doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3);
    doc.line(lm, y, rm, y);
    y += 3;
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(100, 100, 100);
    if (isKlutch) {
      doc.text(`Klutch Risk Retention Group  ·  ${form.certNumber || "—"}  ·  424 Church Street, Suite 800, Nashville, Tennessee 37219  ·  © Klutch Risk Retention Group ${new Date().getFullYear()}`, W / 2, y, { align: "center" });
    } else {
      doc.text(`Metrocars Leasing Corp  ·  ${form.certNumber || "—"}  ·  P.O. Box 10622, Rockville MD 20850  ·  (855) 906-5949  ·  claims@drivewhip.com  ·  © Metrocars Leasing Corp ${new Date().getFullYear()}`, W / 2, y, { align: "center" });
    }

    setPreviewPdfUrl(getPDFDataUrl(doc));
    if (shouldDownload) downloadPDF(doc, `COI_${isKlutch ? "Klutch" : "Metrocars"}_${form.certNumber || "Draft"}_${form.namedOperator || "Operator"}.pdf`);
  };

  const handlePreviewOnly = () => { handleDownload(false); };

  return (
    <div className="space-y-6">
      {carrierMode === "metrocars" ? (
        <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <Shield className="h-4 w-4 shrink-0 text-slate-900" aria-hidden="true" />
          <span><strong className="text-slate-950">Issuing carrier:</strong> MetroCars Leasing Corp. This Liability Team workspace is fixed to MetroCars.</span>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-[#ff6221]" />
            <span className="text-sm font-semibold text-foreground">Issuing Carrier</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div
              className={`flex items-center gap-3 p-3 rounded-lg border-2 text-left ${insurer === "klutch" ? "border-[#171b31] bg-[#171b31]/5" : "border-border"}`}
            >
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${insurer === "klutch" ? "border-[#171b31]" : "border-border"}`}>
                {insurer === "klutch" && <div className="w-2 h-2 rounded-full bg-[#171b31]" />}
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">Klutch Risk Retention Group</div>
                <div className="text-xs text-muted-foreground">Subscription Start Date July 1, 2026 or later</div>
              </div>
            </div>
            <div
              className={`flex items-center gap-3 p-3 rounded-lg border-2 text-left ${insurer === "metrocars" ? "border-[#171b31] bg-[#171b31]/5" : "border-border"}`}
            >
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${insurer === "metrocars" ? "border-[#171b31]" : "border-border"}`}>
                {insurer === "metrocars" && <div className="w-2 h-2 rounded-full bg-[#171b31]" />}
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">Metrocars Leasing Corp</div>
                <div className="text-xs text-muted-foreground">Subscription Start Date before July 1, 2026</div>
              </div>
            </div>
          </div>
          <div className={`mt-2 text-xs rounded px-2 py-1 ${isKlutch ? "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800" : "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800"}`}>
            {!form.subscriptionStartDate
              ? "Enter the Subscription Start Date to determine the issuing carrier. Metrocars applies until a qualifying July 1, 2026 or later subscription start date is entered."
              : isKlutch
                ? "Klutch Risk Retention Group — Issuing carrier for Subscription Start Dates on or after July 1, 2026."
                : "Metrocars Leasing Corp — Issuing carrier for Subscription Start Dates before July 1, 2026."}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="space-y-4">
          {/* State */}
          <Panel title="State of Coverage">
            <div className="flex flex-wrap gap-1.5">
              {COI_STATES.map(s => (
                <button key={s} type="button" onClick={() => setState(s)}
                  className={`px-3 py-1 rounded text-xs font-semibold border transition-colors ${state === s ? "bg-[#171b31] text-white border-[#171b31]" : "bg-muted text-foreground border-border hover:border-[#171b31]/40"}`}>
                  {s}
                </button>
              ))}
            </div>
            {rules && (
              <div className="mt-2 text-xs text-muted-foreground bg-muted/30 rounded p-2">
                <span className="font-semibold">BI:</span> {rules.biPP}/{rules.biPO} &nbsp;·&nbsp;
                <span className="font-semibold">PD:</span> {rules.pdLimit} &nbsp;·&nbsp;
                <span className="font-semibold">UM:</span> {rules.umPP}/{rules.umPO}
                {rules.pip && <> &nbsp;·&nbsp; <span className="font-semibold">PIP:</span> {rules.pipLimit}</>}
              </div>
            )}
          </Panel>

          {/* Named Operator & Vehicle */}
          <Panel title="Named Operator / Member">
            <Field label="Named Operator (Member Name)" id="coi-operator" value={form.namedOperator} onChange={set("namedOperator")} placeholder="First Last" required />
            <Field label="Mailing Address" id="coi-addr" value={form.insuredAddress} onChange={set("insuredAddress")} placeholder="14670 Southlawn Lane, Rockville, MD 20850" />
            <Grid3>
              <Field label="Vehicle Year" id="coi-yr" value={form.vehicleYear} onChange={set("vehicleYear")} placeholder="2024" />
              <Field label="Make" id="coi-make" value={form.vehicleMake} onChange={set("vehicleMake")} placeholder="Toyota" />
              <Field label="Model" id="coi-model" value={form.vehicleModel} onChange={set("vehicleModel")} placeholder="Camry" />
            </Grid3>
            <Grid2>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">VIN</label>
                <div className="flex gap-1.5">
                  <input id="coi-vin" value={form.vin} onChange={e => set("vin")(e.target.value)} placeholder="17-character VIN"
                    className="flex-1 h-9 px-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
                  <button onClick={decodeVinCOI} disabled={vinDecoding || form.vin.length !== 17}
                    className="h-9 px-3 text-xs font-medium rounded-md border border-input bg-muted hover:bg-accent disabled:opacity-40 flex items-center gap-1.5 whitespace-nowrap">
                    {vinDecoding ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                    Decode
                  </button>
                </div>
              </div>
              <Field label="Plate Number" id="coi-plate" value={form.plateNumber} onChange={set("plateNumber")} placeholder="e.g. ABC1234" />
            </Grid2>
          </Panel>

          {/* Policy Period */}
          <Panel title="Coverage Period">
            <div className="mb-3">
              <label className="flex items-center gap-3 cursor-pointer p-2.5 rounded-md border border-border/50 hover:bg-muted/30 transition-colors">
                <Checkbox checked={stillInRentalCOI} onCheckedChange={(v) => setStillInRentalCOI(!!v)} />
                <div>
                  <div className="text-xs font-semibold">Driver is still in the rental</div>
                  <div className="text-xs text-muted-foreground">Auto-computes Coverage Through from the Date Issued / Subscription Start Date + state rules</div>
                </div>
              </label>
            </div>
            {stillInRentalCOI && coiCoverage.warning && (
              <div className="mb-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">⚠️ {coiCoverage.warning}</div>
            )}
            {stillInRentalCOI && coiCoverage.helperText && !coiCoverage.warning && (
              <div className="mb-2 text-xs text-muted-foreground bg-muted/30 rounded px-3 py-2">{coiCoverage.helperText}</div>
            )}
            <Grid2>
              <Field label="Date Issued / Subscription Start Date" id="coi-issue-start-date" value={form.subscriptionStartDate} onChange={setCoiIssueAndSubscriptionDate} type="date" />
              <Field label="Date of Loss" id="coi-dol" value={form.dateOfLoss} onChange={set("dateOfLoss")} type="date" />
            </Grid2>
            <Grid2>
              <Field label="Expiration Date" id="coi-exp" value={form.expirationDate} onChange={set("expirationDate")} type="date" />
            </Grid2>
            <Grid2>
              <Field label="Certificate Number" id="coi-certno" value={form.certNumber} onChange={set("certNumber")} placeholder={isKlutch ? "KIS0000" : `${state}000S0137XX`} />
              <Field label="Revision Number" id="coi-rev" value={form.revisionNumber} onChange={set("revisionNumber")} placeholder="e.g. 0" />
            </Grid2>
          </Panel>

          {/* Coverage Options */}
          <Panel title="Coverage Options">
            <div className="space-y-2">
              {rules.umRejectable && (
                <label className={`flex items-center gap-3 p-2.5 rounded-md border border-border/50 ${isAutomaticUmRejection ? "bg-muted/30" : "cursor-pointer hover:bg-muted/30"}`}>
                  <Checkbox checked={umRejected} disabled={isAutomaticUmRejection} onCheckedChange={(v) => setUmRejected(!!v)} />
                  <div>
                    <div className="text-xs font-semibold">UM / UIM Rejected by Named Insured</div>
                    <div className="text-xs text-muted-foreground">{isAutomaticUmRejection ? "Automatically applied for this state" : 'Shows "REJECTED BY NAMED INSURED" in both applicable UM and UIM rows'}</div>
                  </div>
                </label>
              )}
              {rules.pip && (isFloridaPipMandatory ? (
                <div className="flex items-center gap-3 p-2.5 rounded-md border border-border/50 bg-muted/30">
                  <Checkbox checked disabled />
                  <div>
                    <div className="text-xs font-semibold">PIP Required</div>
                    <div className="text-xs text-muted-foreground">Florida PIP is mandatory at $10,000 and cannot be waived</div>
                  </div>
                </div>
              ) : (
                <label className="flex items-center gap-3 cursor-pointer p-2.5 rounded-md border border-border/50 hover:bg-muted/30 transition-colors">
                  <Checkbox checked={pipWaived} onCheckedChange={(v) => setPipWaived(!!v)} />
                  <div>
                    <div className="text-xs font-semibold">PIP Waived by Named Insured</div>
                    <div className="text-xs text-muted-foreground">Shows "WAIVED BY NAMED INSURED" in PIP row</div>
                  </div>
                </label>
              ))}
            </div>
          </Panel>
        </div>

        <PreviewPanel
          text={[
            `CERTIFICATE OF INSURANCE`,
            `Issuing Carrier: ${isKlutch ? "Klutch Risk Retention Group" : "Metrocars Leasing Corp (Self-Insured)"}`,
            `Certificate No.: ${form.certNumber || "—"}`,
            `Date Issued / Subscription Start Date: ${form.subscriptionStartDate ? new Date(form.subscriptionStartDate + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—"}`,
            ``,
            `Named Operator: ${form.namedOperator || "—"}`,
            `Vehicle: ${[form.vehicleYear, form.vehicleMake, form.vehicleModel].filter(Boolean).join(" ") || "—"}`,
            `VIN: ${form.vin || "—"}`,
            `Coverage Period: ${coverageStartDate && form.expirationDate ? `${new Date(coverageStartDate + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} — ${new Date(form.expirationDate + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}` : "—"}`,
            `State of Loss: ${state}`,
            ``,
            `COVERAGES:`,
            `BI: ${isKlutch ? "Per policy" : `${rules.biPP} / ${rules.biPO}`}`,
            `PD: ${isKlutch ? "Per policy" : rules.pdLimit}`,
            `UM: ${umRejected ? "REJECTED" : (isKlutch ? "Per policy" : `${rules.umPP} / ${rules.umPO}`)}`,
            `UIM: ${umRejected && rules.uimPP ? "REJECTED" : (isKlutch ? "Per policy" : (rules.uimPP || "N/A"))}`,
            `PIP: ${!rules.pip ? "N/A" : (pipWaived && !isFloridaPipMandatory) ? "WAIVED" : (isKlutch ? "Statutory Min" : rules.pipLimit)}`,
            `COL: Subject to Member Agreement`,
            `COMP: Subject to Member Agreement`,
          ].join("\n")}
          onCopy={() => { toast.success("Copied"); }}
          onDownload={handleDownload}
          pdfUrl={isKlutch && !approvedSignoff.ready ? null : previewPdfUrl}
          allowPreviewDownload={!isKlutch || approvedSignoff.ready}
          onPreview={handlePreviewOnly}
        />
      </div>
    </div>
  );
}


function KlutchDecPageTab({ initialState = "MD" }: { initialState?: string }) {
  const approvedSignoff = useKlutchSignoff();
  const DEC_STATE_RULES: Record<string, {
    biPP: string; biPO: string; pdLimit: string;
    umPP: string; umPO: string; uimPP: string; uimPO: string;
    pip: boolean; pipLimit: string;
    umRejectable: boolean; pipWaiverAvailable: boolean; pipAdditionalAvailable: boolean;
    biNotMandated?: boolean;
  }> = {
    MD: { biPP: "$30,000", biPO: "$60,000", pdLimit: "$15,000", umPP: "$30,000", umPO: "$60,000", uimPP: "$30,000", uimPO: "$60,000", pip: true, pipLimit: "$2,500", umRejectable: false, pipWaiverAvailable: true, pipAdditionalAvailable: true },
    VA: { biPP: "$30,000", biPO: "$60,000", pdLimit: "$20,000", umPP: "$30,000", umPO: "$60,000", uimPP: "$30,000", uimPO: "$60,000", pip: false, pipLimit: "", umRejectable: true, pipWaiverAvailable: false, pipAdditionalAvailable: false },
    FL: { biPP: "$10,000", biPO: "$20,000", pdLimit: "$10,000", umPP: "$10,000", umPO: "$20,000", uimPP: "", uimPO: "", pip: true, pipLimit: "$10,000", umRejectable: true, pipWaiverAvailable: false, pipAdditionalAvailable: false, biNotMandated: true },
    GA: { biPP: "$25,000", biPO: "$50,000", pdLimit: "$25,000", umPP: "$25,000", umPO: "$50,000", uimPP: "$25,000", uimPO: "$50,000", pip: false, pipLimit: "", umRejectable: true, pipWaiverAvailable: false, pipAdditionalAvailable: false },
    IL: { biPP: "$25,000", biPO: "$50,000", pdLimit: "$20,000", umPP: "$25,000", umPO: "$50,000", uimPP: "$25,000", uimPO: "$50,000", pip: false, pipLimit: "", umRejectable: true, pipWaiverAvailable: false, pipAdditionalAvailable: false },
    MA: { biPP: "$20,000", biPO: "$40,000", pdLimit: "$5,000", umPP: "$20,000", umPO: "$40,000", uimPP: "$20,000", uimPO: "$40,000", pip: true, pipLimit: "$8,000", umRejectable: false, pipWaiverAvailable: false, pipAdditionalAvailable: false },
    PA: { biPP: "$15,000", biPO: "$30,000", pdLimit: "$5,000", umPP: "$15,000", umPO: "$30,000", uimPP: "$15,000", uimPO: "$30,000", pip: true, pipLimit: "$5,000", umRejectable: false, pipWaiverAvailable: false, pipAdditionalAvailable: false },
    TX: { biPP: "$30,000", biPO: "$60,000", pdLimit: "$25,000", umPP: "$30,000", umPO: "$60,000", uimPP: "$30,000", uimPO: "$60,000", pip: false, pipLimit: "", umRejectable: true, pipWaiverAvailable: false, pipAdditionalAvailable: false },
  };

  const [state, setState] = React.useState(initialState || "MD");
  const [pipWaived, setPipWaived] = React.useState(false);
  const [umRejected, setUmRejected] = React.useState(false);
  // Georgia allows the named operator to elect a UM/UIM rejection; do not
  // silently force that election when the state changes.
  const isAutomaticUmRejection = state === "FL";
  const isFloridaPipMandatory = state === "FL";
  React.useEffect(() => {
    setUmRejected(isAutomaticUmRejection);
    if (isFloridaPipMandatory) setPipWaived(false);
  }, [isAutomaticUmRejection, isFloridaPipMandatory]);
  const [previewPdfUrl, setPreviewPdfUrl] = React.useState<string | null>(null);
  React.useEffect(() => { setPreviewPdfUrl(null); }, [approvedSignoff.identityKey, approvedSignoff.revision]);
  const [form, setForm] = React.useState({
    policyNumber: "",
    memberName: "",
    memberAddress: "14670 Southlawn Lane, Rockville, MD 20850",
    vehicleYear: "",
    vehicleMake: "",
    vehicleModel: "",
    vin: "",
    vehicleType: "Auto",
    effectiveDate: "",
    expirationDate: "",
    dateOfLoss: "",
    weeklyRate: "",
    collisionDeductible: "$1,000",
    compDeductible: "$1,000",
  });
  const set = (k: keyof typeof form) => (v: string) => setForm(p => ({ ...p, [k]: v }));
  const [stillInRentalDec, setStillInRentalDec] = React.useState(false);
  // Auto-compute coverage-through date
  const decCoverage = React.useMemo(() => computeCoverageThrough({
    startDateStr: form.effectiveDate,
    state,
    stillInRental: stillInRentalDec,
    dateOfLossStr: form.dateOfLoss,
  }), [form.effectiveDate, form.dateOfLoss, state, stillInRentalDec]);
  React.useEffect(() => {
    if (stillInRentalDec && decCoverage.throughDate && !decCoverage.warning) {
      setForm(p => ({ ...p, expirationDate: formatDateISO(decCoverage.throughDate!) }));
    }
    if (!stillInRentalDec) {
      setForm(p => ({ ...p, expirationDate: "" }));
    }
  }, [stillInRentalDec, decCoverage.throughDate, decCoverage.warning]);
  const [vinDecoding, setVinDecoding] = React.useState(false);
  const decodeVinDec = async () => {
    const vin = form.vin.trim();
    if (vin.length !== 17) { toast.error("VIN must be exactly 17 characters"); return; }
    setVinDecoding(true);
    try {
      const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`);
      const data = await res.json() as { Results: Array<{ Variable: string; Value: string | null }> };
      const get = (v: string) => data.Results.find(r => r.Variable === v)?.Value || "";
      const year = get("Model Year"); const make = get("Make"); const model = get("Model"); const trim = get("Trim");
      if (year || make || model) {
        setForm(p => ({ ...p, vehicleYear: year || p.vehicleYear, vehicleMake: make || p.vehicleMake, vehicleModel: trim ? `${model} ${trim}` : model || p.vehicleModel }));
        toast.success(`Decoded: ${[year, make, model, trim].filter(Boolean).join(" ")}`);
      } else { toast.error("Could not decode VIN — check the number and try again"); }
    } catch { toast.error("VIN decode failed — check your connection"); }
    finally { setVinDecoding(false); }
  };

  const rules = DEC_STATE_RULES[state] || DEC_STATE_RULES["MD"];

  // Auto-generate policy number when state changes
  React.useEffect(() => {
    setForm(p => ({ ...p, policyNumber: state + "-000S0137" }));
  }, [state]);
  // Toyota preset: if make is Toyota, default deductibles to $500
  React.useEffect(() => {
    if (form.vehicleMake.toLowerCase().trim() === "toyota") {
      setForm(p => ({ ...p, collisionDeductible: "$500", compDeductible: "$500" }));
    }
  }, [form.vehicleMake]);

  const fmtDate = (d: string) => {
    if (!d) return "—";
    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const [y, m, day] = d.split("-");
    return `${months[parseInt(m)-1]} ${parseInt(day)}, ${y}`;
  };
  const fmtDateShort = (d: string) => {
    if (!d) return "—";
    const [y, m, day] = d.split("-");
    return `${m}/${day}/${y}`;
  };

  const calcWeeks = () => {
    if (!form.effectiveDate || !form.expirationDate) return 0;
    const eff = new Date(form.effectiveDate + "T00:00:00");
    const exp = new Date(form.expirationDate + "T00:00:00");
    const diffMs = exp.getTime() - eff.getTime();
    if (diffMs <= 0) return 0;
    return Math.max(1, Math.round(diffMs / (7 * 24 * 60 * 60 * 1000)));
  };

  const calcPremium = (coverage: string) => {
    const weekly = parseFloat(form.weeklyRate) || 0;
    const weeks = calcWeeks();
    if (!weekly || !weeks) return null;
    const base = weekly * weeks;
    const weights: Record<string, number> = { bi: 30, pd: 12, coll: 25, comp: 13, pip: 8, um: 7, uim: 5 };
    if (!rules.pip || (pipWaived && !isFloridaPipMandatory)) weights.pip = 0;
    if (umRejected) { weights.um = 0; weights.uim = 0; }
    const totalW = Object.values(weights).reduce((a, b) => a + b, 0);
    if (!totalW) return null;
    const amt = (weights[coverage] / totalW) * base;
    return amt > 0 ? `$${amt.toFixed(2)}` : null;
  };

  const totalPremium = () => {
    const weekly = parseFloat(form.weeklyRate) || 0;
    const weeks = calcWeeks();
    if (!weekly || !weeks) return null;
    return `$${(weekly * weeks).toFixed(2)}`;
  };

  const handleDownload = async (shouldDownload = true) => {
    let signoff: Awaited<ReturnType<typeof approvedSignoff.requireApprovedSignoff>>;
    try { signoff = await approvedSignoff.requireApprovedSignoff(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Unable to load the approved Klutch sign-off."); return; }
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();

    // ── Exact palette from the approved dec page ──────────────────────────────
    const ACCENT = [26, 63, 111];     // #1A3F6F headings, premiums, total, side bars
    const INK = [17, 17, 17];         // #111111 title, labels, values, body
    const GRAY = [68, 68, 68];        // #444444 small-caps labels, descriptors
    const WHITE = [255, 255, 255];
    const BAND = [245, 245, 245];     // group-band rows + notice-box backgrounds
    const ACCENTBAR = [136, 136, 136];// gray left bar on notice boxes
    const RULE = [204, 204, 204];     // rules + main|sidebar divider
    const BOXBORDER = [221, 221, 221];
    const BOXBG = [250, 250, 250];
    const C = (c: number[]) => doc.setTextColor(c[0], c[1], c[2]);
    const F = (c: number[]) => doc.setFillColor(c[0], c[1], c[2]);
    const D = (c: number[]) => doc.setDrawColor(c[0], c[1], c[2]);

    // ── Geometry: main = 0.75 of usable, sidebar = 0.22, gutter between ────────
    const lm = 14, rm = W - 14;
    const usable = W - 28;
    const mainW = usable * 0.75;
    const gutter = usable * 0.03;
    const sideW = usable * 0.22;
    const sideX = lm + mainW + gutter;
    const dividerX = sideX - gutter / 2;
    // coverage value columns — all RIGHT-aligned to these fixed edges
    const limRX = lm + mainW * 0.636;
    const dedRX = lm + mainW * 0.797;
    const premRX = lm + mainW;
    let y = 10;
    let sy = 0;

    // ── Sidebar helpers ───────────────────────────────────────────────────────
    const sideBar = (title: string) => {
      F(ACCENT); doc.rect(sideX, sy, sideW, 7, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); C(WHITE);
      doc.text(title, sideX + 2.5, sy + 4.8);
      sy += 7;
    };
    const noticeBox = (title: string, body: string) => {
      doc.setFont("helvetica", "normal"); doc.setFontSize(6.8);
      const lines = doc.splitTextToSize(body, sideW - 6);
      const h = 6.5 + lines.length * 3 + 1.5;
      F(BAND); doc.rect(sideX, sy, sideW, h, "F");
      D(BOXBORDER); doc.setLineWidth(0.2); doc.rect(sideX, sy, sideW, h);
      F(ACCENTBAR); doc.rect(sideX, sy, 0.7, h, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); C(INK);
      doc.text(title, sideX + 3, sy + 4);
      doc.setFont("helvetica", "normal"); doc.setFontSize(6.8); C(GRAY);
      doc.text(lines, sideX + 3, sy + 8);
      sy += h + 3;
    };

    // ══ PAGE 1 ════════════════════════════════════════════════════════════════
    // Header
    doc.setFont("helvetica", "bold"); doc.setFontSize(17); C(INK);
    doc.text("Policy Declarations", lm, y + 5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); C(GRAY);
    doc.text("Policy number:", lm, y + 10);
    let lw = doc.getTextWidth("Policy number:  ");
    doc.setFont("helvetica", "bold"); C(INK);
    doc.text(form.policyNumber || "—", lm + lw, y + 10);
    doc.setFont("helvetica", "normal"); C(GRAY);
    doc.text("Policy effective date:", lm, y + 14.5);
    lw = doc.getTextWidth("Policy effective date:  ");
    doc.setFont("helvetica", "bold"); C(INK);
    doc.text(fmtDate(form.effectiveDate), lm + lw, y + 14.5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); C(GRAY);
    doc.text("Page 1 of 2", rm, y + 3, { align: "right" });
    try { doc.addImage(KLUTCH_LOGO_B64, "PNG", rm - 10 * (1056 / 372), y, 10 * (1056 / 372), 10); } catch {}
    y += 22;
    D(RULE); doc.setLineWidth(0.3); doc.line(lm, y, rm, y);
    y += 5;
    const colTop = y;
    D(RULE); doc.setLineWidth(0.3); doc.line(dividerX, colTop, dividerX, H - 14);

    // "What does my policy cover?"
    doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); C(ACCENT);
    doc.text("What does my policy cover?", lm, y);
    y += 5;

    // Named insured / operator box
    const boxH = 22;
    F(BOXBG); doc.rect(lm, y, mainW, boxH, "F");
    D(BOXBORDER); doc.setLineWidth(0.2); doc.rect(lm, y, mainW, boxH);
    D(RULE); doc.line(lm + mainW * 0.5, y, lm + mainW * 0.5, y + boxH);
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.8); C(GRAY);
    doc.text("NAMED INSURED / VEHICLE OWNER & LESSOR", lm + 2.5, y + 4);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); C(INK);
    doc.text("Metrocars Leasing Corp", lm + 2.5, y + 8.5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.8); C(GRAY);
    doc.text("INSURED'S MAILING ADDRESS", lm + 2.5, y + 13);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); C(INK);
    doc.text(form.memberAddress || "14670 Southlawn Lane, Rockville, MD 20850", lm + 2.5, y + 17.5, { maxWidth: mainW * 0.5 - 5 });
    const rx = lm + mainW * 0.5 + 2.5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.8); C(GRAY);
    doc.text("NAMED OPERATOR / LESSEE (MEMBER)", rx, y + 4);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); C(INK);
    doc.text(form.memberName || "—", rx, y + 8.5);
    y += boxH + 4;

    // Vehicle line
    const vehicleStr = [form.vehicleYear, form.vehicleMake, form.vehicleModel].filter(Boolean).join(" ") || "—";
    doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); C(INK);
    doc.text(vehicleStr, lm, y + 4);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); C(GRAY);
    doc.text(`Vehicle Type: ${form.vehicleType || "Auto"}`, premRX, y + 4, { align: "right" });
    y += 7;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); C(GRAY);
    doc.text(`VIN: ${form.vin || "—"}`, lm, y);
    y += 6;

    // Coverage table header — all three value columns right-aligned
    D(RULE); doc.setLineWidth(0.2); doc.line(lm, y, premRX, y);
    y += 3.5;
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); C(INK);
    doc.text("Coverages", lm, y);
    doc.text("Limits", limRX, y, { align: "right" });
    doc.text("Deductible", dedRX, y, { align: "right" });
    doc.text("Premium", premRX, y, { align: "right" });
    y += 3;
    doc.setFont("helvetica", "normal"); doc.setFontSize(6); C(GRAY);
    doc.text("What Klutch pays", limRX, y, { align: "right" });
    doc.text("What you pay", dedRX, y, { align: "right" });
    doc.text("Cost for 6-month policy period", premRX, y, { align: "right" });
    y += 3;
    D(RULE); doc.line(lm, y, premRX, y);
    y += 4;

    // Coverage row — limits wrap on " / ", every value right-aligned to its edge
    const covRow = (label: string, sublabel: string, limits: string, deductible: string, premium: string | null) => {
      doc.setFont("helvetica", "bold"); doc.setFontSize(8); C(INK);
      doc.text(label, lm, y);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); C(INK);
      const limParts = String(limits).split(" / ");
      limParts.forEach((p, i) => doc.text(p, limRX, y + i * 3.4, { align: "right" }));
      doc.text(String(deductible), dedRX, y, { align: "right" });
      if (premium) {
        doc.setFont("helvetica", "bold"); C(ACCENT);
        doc.text(premium, premRX, y, { align: "right" });
      } else {
        C(GRAY); doc.text("—", premRX, y, { align: "right" });
      }
      if (sublabel) {
        doc.setFont("helvetica", "italic"); doc.setFontSize(6.5); C(GRAY);
        doc.text(sublabel, lm, y + 3.6);
      }
      const rowH = Math.max(sublabel ? 8 : 5.5, 1.5 + limParts.length * 3.4);
      y += rowH;
      D([230, 230, 230]); doc.setLineWidth(0.1); doc.line(lm, y - 1.5, premRX, y - 1.5);
      y += 1;
    };
    const sectionHeader = (title: string) => {
      F(BAND); doc.rect(lm, y, mainW, 5.5, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); C(INK);
      doc.text(title, lm + 2, y + 3.8);
      y += 6.5;
    };

    sectionHeader("Coverage for when you're at fault");
    covRow("Liability Coverage - Bodily Injury", "Covers injuries to others when you are at fault", `${rules.biPP} per person / ${rules.biPO} per occurrence`, "Not applicable", calcPremium("bi"));
    covRow("Liability Coverage - Property Damage", "Covers damage to others' property when you are at fault", `${rules.pdLimit} per occurrence`, "Not applicable", calcPremium("pd"));

    sectionHeader("Coverage for you and your vehicle");
    covRow("Collision Coverage", "Damage to the covered vehicle from a collision", "Actual cash value", form.collisionDeductible || "$1,000", calcPremium("coll"));
    covRow("Comprehensive Coverage", "Non-collision losses including theft, fire, and weather", "Actual cash value", form.compDeductible || "$1,000", calcPremium("comp"));

    if (rules.pip) {
      const pipPrem = (pipWaived && !isFloridaPipMandatory) ? null : calcPremium("pip");
      const pipLimits = (pipWaived && !isFloridaPipMandatory) ? "Waived" : `${rules.pipLimit} per person`;
      covRow("Personal Injury Protection (PIP)", (pipWaived && !isFloridaPipMandatory) ? "Waived per Maryland Transportation Article" : "", pipLimits, "Not applicable", pipPrem);
    }

    sectionHeader("Coverage if you're hit by an uninsured or underinsured driver");
    const umPrem = umRejected ? null : calcPremium("um");
    const umLimits = umRejected ? "REJECTED" : `${rules.umPP} per person / ${rules.umPO} per occurrence`;
    covRow("Uninsured Motorist - Bodily Injury", "Applies per state law", umLimits, "Not applicable", umPrem);
    const uimPrem = umRejected ? null : calcPremium("uim");
    const uimLimits = umRejected ? "REJECTED" : (rules.uimPP ? `${rules.uimPP} per person / ${rules.uimPO} per occurrence` : "Not applicable");
    covRow("Underinsured Motorist - Bodily Injury", "Applies per state law", uimLimits, "Not applicable", uimPrem);

    // Total
    y += 2;
    D(ACCENT); doc.setLineWidth(0.6); doc.line(lm, y - 1, premRX, y - 1);
    y += 3.5;
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); C(INK);
    doc.text("Total Premium for Policy Period", lm, y);
    doc.setFontSize(11.5); C(ACCENT);
    doc.text(totalPremium() || "—", premRX, y, { align: "right" });
    y += 7;

    // Footnote
    doc.setFont("helvetica", "italic"); doc.setFontSize(6.3); C(GRAY);
    doc.text("* Coverage limits apply per occurrence. Physical damage deductibles reflect the Member Damage Fee as defined in the Membership Agreement. Premium for all coverages is included in the member's weekly Membership Fee under the active Membership Agreement with Metrocars Leasing Corp. Limits shown may have been reduced by paid claims.", lm, y, { maxWidth: mainW });
    y += 12;

    // "Who is covered?"
    doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); C(ACCENT);
    doc.text("Who is covered?", lm, y);
    y += 5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); C(GRAY);
    const wc = doc.splitTextToSize("Coverage applies to the named operator (lessee) operating the listed vehicle under an active Membership Agreement with Metrocars Leasing Corp. Metrocars Leasing Corp is covered as vehicle owner and lessor. Unauthorized or unlisted operators are excluded.", mainW);
    doc.text(wc, lm, y); y += wc.length * 3.4 + 4;
    const miniHead = (h: string) => { doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); C(INK); doc.text(h, lm, y); y += 4; };
    const miniVal = (v: string) => { doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); C(GRAY); const l = doc.splitTextToSize(v, mainW); doc.text(l, lm, y); y += l.length * 3.6 + 3; };
    miniHead("Named Insured (Vehicle Owner / Lessor)"); miniVal("Metrocars Leasing Corp");
    miniHead("Named Operator / Lessee on this policy"); miniVal(form.memberName || "—");
    miniHead("Excluded operators"); miniVal("Any operator not named above or not authorized under the Membership Agreement");

    // ── Sidebar page 1 ────────────────────────────────────────────────────────
    sy = colTop;
    sideBar("Summary");
    const sumH = 84;
    F(BOXBG); doc.rect(sideX, sy, sideW, sumH, "F");
    D(BOXBORDER); doc.setLineWidth(0.2); doc.rect(sideX, sy, sideW, sumH);
    let syi = sy + 5;
    const sumLine = (label: string, value: string) => {
      doc.setFont("helvetica", "bold"); doc.setFontSize(6.3); C(GRAY);
      doc.text(label.toUpperCase(), sideX + 3, syi); syi += 3.4;
      doc.setFont("helvetica", "bold"); doc.setFontSize(8); C(INK);
      const vs = doc.splitTextToSize(value, sideW - 6);
      doc.text(vs, sideX + 3, syi); syi += vs.length * 3.4 + 2.5;
    };
    sumLine("Named Insured", "Metrocars Leasing Corp");
    sumLine("Named Operator / Lessee", form.memberName || "—");
    sumLine("Policy Number", form.policyNumber || "—");
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.3); C(GRAY);
    doc.text("CONTACT INFORMATION", sideX + 3, syi); syi += 3.4;
    doc.setFont("helvetica", "bold"); doc.setFontSize(7); C(INK);
    doc.text("Klutch Risk Retention Group", sideX + 3, syi); syi += 3.2;
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); C(GRAY);
    doc.text("424 Church Street, Suite 800", sideX + 3, syi); syi += 3;
    doc.text("Nashville, Tennessee 37219", sideX + 3, syi); syi += 4;
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.3); C(GRAY);
    doc.text("POLICY PERIOD (MEMBERSHIP TERM)", sideX + 3, syi); syi += 3.4;
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.2); C(INK);
    if (form.effectiveDate && form.expirationDate) {
      doc.text(`Effective: ${fmtDateShort(form.effectiveDate)}`, sideX + 3, syi); syi += 3.2;
      doc.text(`Expiration: ${fmtDateShort(form.expirationDate)}`, sideX + 3, syi); syi += 4;
    } else { doc.text("—", sideX + 3, syi); syi += 4; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.3); C(GRAY);
    doc.text("YOUR POLICY IS WRITTEN BY", sideX + 3, syi); syi += 3.4;
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.2); C(INK);
    doc.text(doc.splitTextToSize("Klutch Risk Retention Group · NAIC 17966", sideW - 6), sideX + 3, syi);
    sy += sumH + 4;

    sideBar("How to Report a Claim");
    const rptH = 36;
    F(BOXBG); doc.rect(sideX, sy, sideW, rptH, "F");
    D(BOXBORDER); doc.setLineWidth(0.2); doc.rect(sideX, sy, sideW, rptH);
    let ry = sy + 4.5;
    const rptLine = (lbl: string, val: string, link = false) => {
      doc.setFont("helvetica", "bold"); doc.setFontSize(6.3); C(GRAY);
      doc.text(lbl, sideX + 3, ry); ry += 3.3;
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.2); C(link ? ACCENT : INK);
      doc.text(val, sideX + 3, ry); ry += 4.5;
    };
    rptLine("ONLINE", "klutchinsurance.com/claims", true);
    rptLine("EMAIL", "claims@klutchinsurance.com");
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.3); C(GRAY);
    doc.text("MAILING", sideX + 3, ry); ry += 3.3;
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.2); C(INK);
    doc.text("Klutch Risk Retention Group", sideX + 3, ry); ry += 3.1;
    doc.setFontSize(6.8); C(GRAY);
    doc.text(["424 Church Street, Suite 800", "Nashville, Tennessee 37219"], sideX + 3, ry);
    sy += rptH + 4;

    noticeBox("Cancellation notice", "Coverage under this policy will terminate upon cancellation or non-renewal of your Membership Agreement. Written notice will be provided in accordance with applicable statutory requirements.");
    noticeBox("Fraud warning", "Any person who knowingly and willfully presents false information on this declaration or in connection with any claim for the purpose of defrauding an insurer may be subject to civil penalties and criminal prosecution under applicable state law.");
    noticeBox("Renewal", "This policy renews for successive terms coinciding with your active Membership Agreement unless cancelled. Coverage terms and limits are subject to change upon renewal.");

    // Footer page 1
    D(RULE); doc.setLineWidth(0.3); doc.line(lm, H - 10, rm, H - 10);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); C([120, 120, 120]);
    doc.text("Klutch Risk Retention Group  ·  424 Church Street, Suite 800, Nashville, Tennessee 37219", lm, H - 6);
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); C(ACCENT);
    doc.text("KLUTCH RISK RETENTION GROUP", rm, H - 6, { align: "right" });

    // ══ PAGE 2 ════════════════════════════════════════════════════════════════
    doc.addPage();
    y = 10;
    doc.setFont("helvetica", "bold"); doc.setFontSize(17); C(INK);
    doc.text("Policy Declarations", lm, y + 5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); C(GRAY);
    doc.text("Policy number:", lm, y + 10);
    lw = doc.getTextWidth("Policy number:  ");
    doc.setFont("helvetica", "bold"); C(INK);
    doc.text(form.policyNumber || "—", lm + lw, y + 10);
    doc.setFont("helvetica", "normal"); C(GRAY);
    doc.text("Policy effective date:", lm, y + 14.5);
    lw = doc.getTextWidth("Policy effective date:  ");
    doc.setFont("helvetica", "bold"); C(INK);
    doc.text(fmtDate(form.effectiveDate), lm + lw, y + 14.5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); C(GRAY);
    doc.text("2 of 2", rm, y + 3, { align: "right" });
    try { doc.addImage(KLUTCH_LOGO_B64, "PNG", rm - 10 * (1056 / 372), y, 10 * (1056 / 372), 10); } catch {}
    y += 22;
    D(RULE); doc.setLineWidth(0.3); doc.line(lm, y, rm, y);
    y += 5;
    const colTop2 = y;
    D(RULE); doc.setLineWidth(0.3); doc.line(dividerX, colTop2, dividerX, H - 14);

    doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); C(ACCENT);
    doc.text("Policy conditions & important notices", lm, y);
    y += 5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); C(GRAY);
    const intro = doc.splitTextToSize("The following conditions govern coverage under this policy. All terms are subject to the master policy and applicable state law.", mainW);
    doc.text(intro, lm, y); y += intro.length * 3.4 + 4;

    const condition = (num: string, title: string, text: string) => {
      doc.setFont("helvetica", "bold"); doc.setFontSize(8); C(INK);
      doc.text("•", lm, y);
      doc.text(`${num}. ${title}`, lm + 4, y);
      y += 3.8;
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.6); C(GRAY);
      const ls = doc.splitTextToSize(text, mainW - 4);
      doc.text(ls, lm + 4, y);
      y += ls.length * 3.3 + 3;
    };
  condition("1", "Insuring Agreement.", "This policy is issued by Klutch Risk Retention Group to Metrocars Leasing Corp (named insured and vehicle owner/lessor). The named operator is an insured while operating the covered vehicle pursuant to an active Membership Agreement with Metrocars Leasing Corp.");
  condition("2", "Premium.", "Premium for all coverages is included in the member's weekly Membership Fee paid to Metrocars Leasing Corp. No separate premium invoice is issued.");
  condition("3", "Physical Damage Deductibles.", "Collision and comprehensive deductibles correspond to the Member Damage Fee defined in the Membership Agreement between the named operator and Metrocars Leasing Corp.");
  condition("4", "Personal Injury Protection (PIP).", "PIP is provided only in states where required by law. In Maryland, the named operator may execute a PIP waiver or elect Enhanced PIP in accordance with the Maryland Transportation Article. Where PIP is not mandated, this coverage does not apply.");
  condition("5", "Uninsured/Underinsured Motorist (UM/UIM).", "UM and UIM coverages are provided only where required by applicable state law. In states permitting rejection (e.g., Georgia), these coverages do not apply unless elected. Limits equal the statutory minimum for the state of vehicle operation at the time of loss.");
  condition("6", "Authorized Operators Only.", "Coverage applies exclusively to the named operator listed on this declarations page. Unauthorized or unlisted operators are excluded from all coverages.");
  condition("7", "Other Insurance.", "If other valid and collectible coverage applies to a covered loss, this policy coordinates with such coverage in accordance with applicable law and the Membership Agreement.");
  condition("8", "Continuity of Coverage.", "Coverage is contingent upon an active Membership Agreement. Termination or cancellation of the Membership Agreement immediately terminates all coverage under this policy.");

  y += 4;
  doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); C(ACCENT);
  doc.text("Authorized representative", lm, y);
  y += 5;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); C(GRAY);
  const arls = doc.splitTextToSize("This Policy Declarations Page is issued by Klutch Risk Retention Group. Coverage is provided pursuant to the master policy issued to Metrocars Leasing Corp and the terms of the named operator's Membership Agreement.", mainW);
  doc.text(arls, lm, y); y += arls.length * 3.4 + 8;

  doc.setFont("helvetica", "bold"); doc.setFontSize(9); C(INK);
  doc.text(signoff.name, lm, y + 8);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); C(GRAY);
  doc.text(signoff.title, lm, y + 13);
  D(INK); doc.line(lm + 75, y + 10, lm + 120, y + 10);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); C(INK);
  doc.text(fmtDate(form.effectiveDate), lm + 75, y + 8);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); C(GRAY);
  doc.text("Date Issued", lm + 75, y + 14);

  // ── Sidebar page 2 ────────────────────────────────────────────────────────
  sy = colTop2;
  sideBar("Vehicle Summary");
  const vsH = 60;
  F(BOXBG); doc.rect(sideX, sy, sideW, vsH, "F");
  D(BOXBORDER); doc.setLineWidth(0.2); doc.rect(sideX, sy, sideW, vsH);
  let vsyi = sy + 5;
  const vsLine = (label: string, value: string) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.3); C(GRAY);
    doc.text(label.toUpperCase(), sideX + 3, vsyi); vsyi += 3.4;
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); C(INK);
    const vs = doc.splitTextToSize(value, sideW - 6);
    doc.text(vs, sideX + 3, vsyi); vsyi += vs.length * 3.4 + 2.5;
  };
  vsLine("Vehicle", vehicleStr);
  vsLine("VIN", form.vin || "—");
  vsLine("Named Insured", "Metrocars Leasing Corp");
  vsLine("Named Operator / Lessee", form.memberName || "—");
  vsLine("Policy Period", (form.effectiveDate && form.expirationDate) ? `${fmtDateShort(form.effectiveDate)} – ${fmtDateShort(form.expirationDate)}` : "—");
  sy += vsH + 4;

  noticeBox("Territory & garaged", "Coverage applies in all U.S. states and territories while the named operator's Membership Agreement is active. The covered vehicle is registered in the state shown on this declaration.");
  noticeBox("If information is not correct", "This declaration reflects the coverages and vehicle on file for your membership. If any information is incorrect, notify Klutch Risk Retention Group immediately at claims@klutchinsurance.com. Corrections will be made on a going-forward basis.");
  noticeBox("Premium notice", "All premiums for coverages listed on this declaration are included in the member's Membership Fee as defined in the Membership Agreement with Metrocars Leasing Corp. No separate premium payment is required.");

  // Footer page 2
  D(RULE); doc.setLineWidth(0.3); doc.line(lm, H - 10, rm, H - 10);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); C([120, 120, 120]);
  doc.text("Klutch Risk Retention Group  ·  424 Church Street, Suite 800, Nashville, Tennessee 37219", lm, H - 6);
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); C(ACCENT);
  doc.text("KLUTCH RISK RETENTION GROUP", rm, H - 6, { align: "right" });

  setPreviewPdfUrl(getPDFDataUrl(doc));
  if (shouldDownload) downloadPDF(doc, `KlutchDecPage_${form.policyNumber || "Draft"}_${form.memberName || "Member"}.pdf`);
};


  const DEC_STATES = ["MD","VA","FL","GA","IL","MA","PA","TX"];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="space-y-4">
          <Panel title="State of Coverage">
            <div className="flex flex-wrap gap-1.5">
              {DEC_STATES.map(s => (
                <button key={s} type="button" onClick={() => setState(s)}
                  className={`px-3 py-1 rounded text-xs font-semibold border transition-colors ${state === s ? "bg-[#171b31] text-white border-[#171b31]" : "bg-muted text-foreground border-border hover:border-[#171b31]/40"}`}>
                  {s}
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Named Operator (Member)">
            <Field label="Member Full Name" id="dp-member" value={form.memberName} onChange={set("memberName")} placeholder="First Last" required />
            <Field label="Mailing Address" id="dp-addr" value={form.memberAddress} onChange={set("memberAddress")} placeholder="14670 Southlawn Lane, Rockville, MD 20850" />
          </Panel>

          <Panel title="Vehicle">
            <Grid3>
              <Field label="Year" id="dp-yr" value={form.vehicleYear} onChange={set("vehicleYear")} placeholder="2024" />
              <Field label="Make" id="dp-make" value={form.vehicleMake} onChange={set("vehicleMake")} placeholder="Toyota" />
              <Field label="Model" id="dp-model" value={form.vehicleModel} onChange={set("vehicleModel")} placeholder="Camry" />
            </Grid3>
            <Grid2>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">VIN</label>
                <div className="flex gap-1.5">
                  <input id="dp-vin" value={form.vin} onChange={e => set("vin")(e.target.value)} placeholder="17-character VIN"
                    className="flex-1 h-9 px-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
                  <button onClick={decodeVinDec} disabled={vinDecoding || form.vin.length !== 17}
                    className="h-9 px-3 text-xs font-medium rounded-md border border-input bg-muted hover:bg-accent disabled:opacity-40 flex items-center gap-1.5 whitespace-nowrap">
                    {vinDecoding ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                    Decode
                  </button>
                </div>
              </div>
            </Grid2>
          </Panel>

          <Panel title="Policy Period & Premium">
            <div className="mb-3">
              <label className="flex items-center gap-3 cursor-pointer p-2.5 rounded-md border border-border/50 hover:bg-muted/30 transition-colors">
                <Checkbox checked={stillInRentalDec} onCheckedChange={(v) => setStillInRentalDec(!!v)} />
                <div>
                  <div className="text-xs font-semibold">Driver is still in the rental</div>
                  <div className="text-xs text-muted-foreground">Auto-computes Expiration Date from the Date Issued / Subscription Start Date + state rules</div>
                </div>
              </label>
            </div>
            {stillInRentalDec && decCoverage.warning && (
              <div className="mb-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">⚠️ {decCoverage.warning}</div>
            )}
            {stillInRentalDec && decCoverage.helperText && !decCoverage.warning && (
              <div className="mb-2 text-xs text-muted-foreground bg-muted/30 rounded px-3 py-2">{decCoverage.helperText}</div>
            )}
            <Grid2>
              <Field label="Date Issued / Subscription Start Date" id="dp-eff" value={form.effectiveDate} onChange={set("effectiveDate")} type="date" />
              <Field label="Expiration Date" id="dp-exp" value={form.expirationDate} onChange={set("expirationDate")} type="date" />
            </Grid2>
            <Grid3>
              <Field label="Policy Number" id="dp-polnum" value={form.policyNumber} onChange={set("policyNumber")} placeholder="MD-000S0137" />
              <Field label="Weekly Rate ($)" id="dp-weekly" value={form.weeklyRate} onChange={set("weeklyRate")} placeholder="35.00" />
              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Coverage Weeks</Label>
                <div className="h-9 px-3 flex items-center text-sm bg-muted/30 rounded-md border border-border text-muted-foreground">
                  {calcWeeks() || "—"} weeks
                </div>
              </div>
            </Grid3>
            {totalPremium() && (
              <div className="mt-2 p-2 bg-[#171b31]/5 rounded-lg border border-[#171b31]/20">
                <span className="text-xs text-muted-foreground">Total Premium: </span>
                <span className="text-sm font-bold text-[#171b31]">{totalPremium()}</span>
              </div>
            )}
          </Panel>

          <Panel title="Deductibles & Coverage Options">
            <Grid2>
              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Collision Deductible</Label>
                <Select value={form.collisionDeductible} onValueChange={set("collisionDeductible")}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="$500">$500</SelectItem>
                    <SelectItem value="$1,000">$1,000</SelectItem>
                    <SelectItem value="$2,500">$2,500</SelectItem>
                    <SelectItem value="$5,000">$5,000</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Comprehensive Deductible</Label>
                <Select value={form.compDeductible} onValueChange={set("compDeductible")}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="$500">$500</SelectItem>
                    <SelectItem value="$1,000">$1,000</SelectItem>
                    <SelectItem value="$2,500">$2,500</SelectItem>
                    <SelectItem value="$5,000">$5,000</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Grid2>
            <div className="space-y-2 mt-2">
              {rules.pipWaiverAvailable && (
                <label className="flex items-center gap-3 cursor-pointer p-2.5 rounded-md border border-border/50 hover:bg-muted/30">
                  <Checkbox checked={pipWaived} onCheckedChange={(v) => setPipWaived(!!v)} />
                  <div><div className="text-xs font-semibold">PIP Waived by Named Operator</div></div>
                </label>
              )}
              {rules.umRejectable && (
                <label className="flex items-center gap-3 cursor-pointer p-2.5 rounded-md border border-border/50 hover:bg-muted/30">
                  <Checkbox checked={umRejected} onCheckedChange={(v) => setUmRejected(!!v)} />
                  <div><div className="text-xs font-semibold">UM/UIM Rejected by Named Operator</div></div>
                </label>
              )}
            </div>
          </Panel>
        </div>

        <PreviewPanel
          text={[
            `KLUTCH RISK RETENTION GROUP`,
            `POLICY DECLARATIONS — PAGE 1 OF 2`,
            ``,
            `Policy Number: ${form.policyNumber || "—"}`,
            `Effective: ${fmtDate(form.effectiveDate)}  |  Expiration: ${fmtDate(form.expirationDate)}`,
            ``,
            `Named Insured: Metrocars Leasing Corp`,
            `Named Operator: ${form.memberName || "—"}`,
            `Vehicle: ${[form.vehicleYear, form.vehicleMake, form.vehicleModel].filter(Boolean).join(" ") || "—"}`,
            `VIN: ${form.vin || "—"}`,
            ``,
            `COVERAGES:`,
            `BI: ${rules.biPP}/${rules.biPO}`,
            `PD: ${rules.pdLimit} per occurrence`,
            `Collision: ACV, deductible ${form.collisionDeductible}`,
            `Comprehensive: ACV, deductible ${form.compDeductible}`,
            `PIP: ${!rules.pip ? "N/A" : pipWaived ? "Waived" : rules.pipLimit}`,
            `UM: ${umRejected ? "Rejected" : `${rules.umPP}/${rules.umPO}`}`,
            `UIM: ${umRejected ? "Rejected" : (rules.uimPP || "N/A")}`,
            ``,
            `Total Premium: ${totalPremium() || "—"}`,
          ].join("\n")}
          onCopy={() => { toast.success("Copied"); }}
          onDownload={handleDownload}
          pdfUrl={approvedSignoff.ready ? previewPdfUrl : null}
          allowPreviewDownload={approvedSignoff.ready}
          onPreview={() => handleDownload(false)}
        />
      </div>
    </div>
  );
}

function DVCalculatorTab() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Diminished Value Calculator</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Opens the DV Calculator portal in a new window. Complete the valuation there, then manually enter the supported DV amount in Insurance Direct: Loss of Use. No numbers are transferred automatically.
          </p>
        </div>
        <a
          href="https://dvcalc-unkzbfqd.manus.space/agent-login"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#ff6221] hover:bg-[#e5541a] text-white text-sm font-medium transition-colors"
        >
          <TrendingDown className="w-4 h-4" />
          Open DV Calculator
        </a>
      </div>

      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <h3 className="font-semibold text-foreground">How to use the DV Calculator</h3>
        <ol className="space-y-3 text-sm text-muted-foreground">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#ff6221]/10 text-[#ff6221] flex items-center justify-center text-xs font-bold">1</span>
            <span>Click <strong className="text-foreground">Open DV Calculator</strong> above — it opens in a new window. Log in with your agent credentials.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#ff6221]/10 text-[#ff6221] flex items-center justify-center text-xs font-bold">2</span>
            <span>From the portal, go to the <strong className="text-foreground">Database</strong> and select <strong className="text-foreground">Calculator</strong> from the sidebar.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#ff6221]/10 text-[#ff6221] flex items-center justify-center text-xs font-bold">3</span>
            <span>Upload the combined estimate and image report as a <strong className="text-foreground">single PDF</strong> (estimate first, images after). The system will parse the document automatically.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#ff6221]/10 text-[#ff6221] flex items-center justify-center text-xs font-bold">4</span>
            <span>Once parsed, verify and enter the correct <strong className="text-foreground">mileage</strong>, then click <strong className="text-foreground">Confirmed</strong>. This triggers the valuation and market comparisons.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#ff6221]/10 text-[#ff6221] flex items-center justify-center text-xs font-bold">5</span>
            <span>Review the comparable vehicles and all line items for accuracy. Check all multipliers and review the <strong className="text-foreground">suggested intangible value score</strong> — apply as appropriate.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#ff6221]/10 text-[#ff6221] flex items-center justify-center text-xs font-bold">6</span>
            <span>Click <strong className="text-foreground">Generate Report</strong>. Save the case for easy lookup later, then download the PDF.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#ff6221]/10 text-[#ff6221] flex items-center justify-center text-xs font-bold">7</span>
            <span>Confirm the printed report is correct and all information is accurate before proceeding.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#ff6221]/10 text-[#ff6221] flex items-center justify-center text-xs font-bold">8</span>
            <span>Return to <strong className="text-foreground">Insurance Direct: Loss of Use → Demand Letter</strong>, select DV or both, and manually enter the verified DV amount and report reference. For an actual subrogation claim, the separate Subro Demand Letter remains available. DV will <strong className="text-foreground">not push automatically</strong> into either form.</span>
          </li>
        </ol>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4">
        <div className="flex gap-3">
          <div className="text-amber-600 dark:text-amber-400 mt-0.5">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Manual entry required — DV amount does not push automatically</p>
            <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
              The DV Calculator produces a separate standalone report. After downloading and confirming the PDF, navigate to the
              <strong> Insurance Direct: Loss of Use → Demand Letter</strong> step and enter the DV amount and report reference manually. The separate Subro Demand Letter is for actual subrogation claims.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DocGenerator({ initialTab: directInitialTab }: { initialTab?: DocGenTab }) {
  const search = useSearch();
  const [, navigate] = useLocation();
  const initialTab = (() => {
    if (directInitialTab) return normalizeDocGeneratorTab(directInitialTab);
    const params = new URLSearchParams(search);
    return normalizeDocGeneratorTab(params.get("tab"));
  })();
  const initialMemberState = (() => {
    const params = new URLSearchParams(search);
    const s = (params.get("memberState") || "").toUpperCase();
    const WHIP_STATES = ["MD","VA","PA","FL","IL","GA","MA","TX"];
    return WHIP_STATES.includes(s) ? s : "MD";
  })();
  const [activeTab, setActiveTab] = useState<DocGenTab>(initialTab);
  useEffect(() => {
    if (activeTab === "klutch-policy-documents") {
      navigate("/kb/klutch-policy-documents");
    }
  }, [activeTab, navigate]);
  const [louDemandHandoff, setLouDemandHandoff] = useState<LouDemandHandoff | null>(null);
  const [formResetKey, setFormResetKey] = useState(0);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showRecentDocs, setShowRecentDocs] = useState(false);
  const [showMyDocs, setShowMyDocs] = useState(false);
  const [showSharedTemplates, setShowSharedTemplates] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareToUserId, setShareToUserId] = useState<number | null>(null);
  const [shareTemplateName, setShareTemplateName] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [currentFormData, setCurrentFormData] = useState<Record<string, unknown>>({});
  const [currentDraftId, setCurrentDraftId] = useState<number | undefined>(undefined);
  const [fullScreenPreview, setFullScreenPreview] = useState(false);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);

  const favoritesQ = trpc.docgen.getFavorites.useQuery();
  const recentDocsQ = trpc.docgen.getRecentDocs.useQuery();
  const draftsQ = trpc.docgen.getDrafts.useQuery();
  const sharedTemplatesQ = trpc.docgen.getSharedTemplates.useQuery();
  const usersQ = trpc.docgen.listUsers.useQuery();
  const toggleFavMut = trpc.docgen.toggleFavorite.useMutation({ onSuccess: () => favoritesQ.refetch() });
  const saveDraftMut = trpc.docgen.saveDraft.useMutation({ onSuccess: (d) => { setCurrentDraftId(d.id); draftsQ.refetch(); toast.success("Draft saved"); } });
  const deleteDraftMut = trpc.docgen.deleteDraft.useMutation({ onSuccess: () => draftsQ.refetch() });
  const addRecentMut = trpc.docgen.addRecentDoc.useMutation({ onSuccess: () => recentDocsQ.refetch() });
  const shareTemplateMut = trpc.docgen.shareTemplate.useMutation({ onSuccess: () => { setShareModalOpen(false); toast.success("Template shared"); } });
  const markReadMut = trpc.docgen.markTemplateRead.useMutation({ onSuccess: () => sharedTemplatesQ.refetch() });

  const favTabKeys = (favoritesQ.data ?? []).map(f => f.tabKey);
  const allItems = NAV_GROUPS.flatMap(g => g.items);
  const activeLabel = allItems.find(i => i.id === activeTab)?.label || "";
  const isFavorite = favTabKeys.includes(activeTab);
  const unreadShared = (sharedTemplatesQ.data ?? []).filter(t => !t.isRead).length;
  const handleLouDemandHandoff = useCallback((handoff: LouDemandHandoff) => {
    setLouDemandHandoff(handoff);
  }, []);
  const handleLouHandoffConsumed = useCallback((id: string) => {
    setLouDemandHandoff((current) => current?.id === id ? null : current);
  }, []);

  const handleToggleFavorite = () => {
    toggleFavMut.mutate({ tabKey: activeTab, tabLabel: activeLabel });
  };

  const handleClearForm = () => {
    if (activeTab === "lou-calculator") {
      sessionStorage.removeItem("lou_calc_state");
      sessionStorage.removeItem(LOU_DEMAND_HANDOFF_KEY);
      sessionStorage.removeItem("lou_total");
      sessionStorage.removeItem("lou_claim");
      sessionStorage.removeItem("lou_days");
      sessionStorage.removeItem("lou_rate");
      setLouDemandHandoff(null);
    }
    setFormResetKey((key) => key + 1);
    setCurrentFormData({});
    setCurrentDraftId(undefined);
    setPreviewPdfUrl(null);
    setFullScreenPreview(false);
    toast.success(`${activeLabel} form cleared`);
  };

  const handleSaveDraft = () => {
    saveDraftMut.mutate({ tabKey: activeTab, tabLabel: activeLabel, formData: currentFormData, draftId: currentDraftId });
  };

  const handleLoadDraft = (draft: { id: number; tabKey: string; formData: unknown }) => {
    setActiveTab(normalizeDocGeneratorTab(draft.tabKey));
    setCurrentDraftId(draft.id);
    setCurrentFormData(draft.formData as Record<string, unknown>);
    if (["lou-calculator", "payment-receipt", "denial", "pending-closure"].includes(draft.tabKey)) setFormResetKey((key) => key + 1);
    setShowMyDocs(false);
    toast.info("Draft loaded — fill in the form and generate");
  };

  const handleShareTemplate = () => {
    if (!shareToUserId || !shareTemplateName.trim()) { toast.error("Select a recipient and enter a template name"); return; }
    shareTemplateMut.mutate({ toUserId: shareToUserId, tabKey: activeTab, tabLabel: activeLabel, templateName: shareTemplateName, formData: currentFormData, message: shareMessage });
  };

  const handleLoadSharedTemplate = (t: { id: number; tabKey: string; formData: unknown }) => {
    setActiveTab(normalizeDocGeneratorTab(t.tabKey));
    setCurrentFormData(t.formData as Record<string, unknown>);
    if (["lou-calculator", "payment-receipt", "denial", "pending-closure"].includes(t.tabKey)) setFormResetKey((key) => key + 1);
    markReadMut.mutate({ templateId: t.id });
    setShowSharedTemplates(false);
    toast.info("Shared template loaded");
  };

  const renderTab = () => {
    switch (activeTab) {
      case "blank-letterhead": return <BlankLetterheadTab />;
      case "claimant-contact": return <ClaimantContactTab />;
      case "pending-closure": return <PendingClosureForm initialDraft={currentFormData} onDraftChange={setCurrentFormData} logoBase64={WHIP_LOGO_B64} />;
      case "failed-contact": return <FailedContactTab />;
      case "storage-mitigation": return <StorageMitigationTab />;

      case "coverage-tnc": return <CoverageTNCTab />;
      case "denial": return <DenialTab onNavigate={setActiveTab} initialDraft={currentFormData} onDraftChange={setCurrentFormData} initialTemplate={new URLSearchParams(search).get("template") === UAD_DENIAL_TYPE ? UAD_DENIAL_TYPE : undefined} />;
      case "damage-denial": return <DamageDenialTab />;
      case "ror": return <RORTab />;
      case "release-bi": return <ReleaseBITab />;
      case "release-pd": return <ReleasePDTab />;
      case "tl-settlement": return <TLSettlementTab />;
      case "subro-demand": return <SubroDemandTab onNavigate={setActiveTab} louHandoff={louDemandHandoff} onLouHandoffConsumed={handleLouHandoffConsumed} />;
      case "carrier-rebuttal": return <CarrierRebuttalTab />;
      case "payment-receipt": return <TotalReconReceiptForm initialDraft={currentFormData} onDraftChange={setCurrentFormData} />;
      case "urgently-invoice": return <UrgentlyInvoiceTab />;
      case "pip-exhaustion": return <PIPExhaustionTab />;
      case "limited-liability-bi": return <LimitedLiabilityBITab />;
      case "lou-calculator": return <LOUCalculatorTab initialDraft={currentFormData.directDraft ? currentFormData : undefined} onDraftChange={setCurrentFormData} />;
      case "pip-bill-review": return <MedicalReviewWorkspace />;
      case "coi-whip": return <UnifiedCOITab initialState={initialMemberState} />;
      case "coi-klutch": return <UnifiedCOITab initialState={initialMemberState} />;
      case "klutch-policy-declarations": return <iframe src="/klutch-policy-declarations.html" title="Klutch Policy Declarations" className="w-full min-h-[calc(100vh-7rem)] border-0 bg-[#d0d0d0]" />;
      case "dv-calculator": return <DVCalculatorTab />;
      default: return null;
    }
  };

  // Historical Document Generator URLs are retained for staff bookmarks and
  // recent-document links. They immediately move to the dedicated Knowledge
  // Base page rather than showing the policy workspace inside Document Gen.
  if (activeTab === "klutch-policy-documents") {
    return (
      <WhipLayout>
        <div className="flex min-h-full items-center justify-center bg-muted/20 p-6 text-sm text-muted-foreground">
          Opening Klutch Policy Documents…
        </div>
      </WhipLayout>
    );
  }

  return (
    <WhipLayout>
      <div className="document-neutral flex h-full min-h-0">
        {/* Sidebar Nav */}
        <aside className="hidden md:flex w-56 shrink-0 border-r border-border bg-muted/20 overflow-y-auto flex-col">
          <div className="p-3 border-b border-border">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#ff6221]" />
              <span className="text-sm font-bold text-foreground">Document Generator</span>
            </div>
          </div>

          {/* Favorites section */}
          {favTabKeys.length > 0 && (
            <div className="p-2 border-b border-border">
              <p className="text-[10px] font-bold uppercase tracking-wider text-foreground/40 px-2 mb-1 flex items-center gap-1">
                <Star className="w-3 h-3 text-amber-400 fill-amber-400" /> Favorites
              </p>
              {allItems.filter(i => favTabKeys.includes(i.id)).map(item => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button key={item.id} onClick={() => setActiveTab(item.id)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors text-left ${isActive ? "bg-[#ff6221]/10 text-[#ff6221] font-semibold" : "text-foreground/70 hover:bg-muted hover:text-foreground"}`}>
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="leading-tight">{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          <nav className="p-2 space-y-3 flex-1">
            {NAV_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-foreground/40 px-2 mb-1">
                  {group.label}
                </p>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  const isFav = favTabKeys.includes(item.id);
                  return (
                    <button key={item.id} onClick={() => setActiveTab(item.id)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors text-left ${isActive ? "bg-[#ff6221]/10 text-[#ff6221] font-semibold" : "text-foreground/70 hover:bg-muted hover:text-foreground"}`}>
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span className="leading-tight flex-1">{item.label}</span>
                      {isFav && <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* Bottom nav items */}
          <div className="p-2 border-t border-border space-y-0.5">
            <button onClick={() => setShowMyDocs(!showMyDocs)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-foreground/70 hover:bg-muted hover:text-foreground transition-colors">
              <FolderOpen className="w-3.5 h-3.5 shrink-0" />
              <span>My Documents</span>
              {(draftsQ.data?.length ?? 0) > 0 && (
                <span className="ml-auto text-[10px] bg-muted rounded px-1">{draftsQ.data?.length}</span>
              )}
            </button>
            <button onClick={() => setShowSharedTemplates(!showSharedTemplates)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-foreground/70 hover:bg-muted hover:text-foreground transition-colors">
              <Inbox className="w-3.5 h-3.5 shrink-0" />
              <span>Shared with Me</span>
              {unreadShared > 0 && (
                <span className="ml-auto text-[10px] bg-[#ff6221] text-white rounded-full px-1.5">{unreadShared}</span>
              )}
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="md:hidden shrink-0 border-b border-border bg-muted/20 px-4 py-3 space-y-2">
            <Label htmlFor="docgen-mobile-form" className="text-xs font-semibold">Document Generator — Select Form</Label>
            <select id="docgen-mobile-form" className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm" value={activeTab} onChange={(event) => setActiveTab(event.target.value as DocGenTab)}>{NAV_GROUPS.map((group) => <optgroup key={group.label} label={group.label}>{group.items.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</optgroup>)}</select>
            <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setShowMyDocs(!showMyDocs)}>My Documents</Button><Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setShowSharedTemplates(!showSharedTemplates)}>Shared with Me</Button></div>
          </div>
          {/* Header bar */}
          <div className="px-4 md:px-6 py-3 border-b border-border flex flex-wrap items-center gap-3 bg-background shrink-0">
            <div className="hidden md:flex items-center gap-1.5 text-sm">
              <span className="text-foreground/50 font-medium">Document Generator</span>
              <ChevronRight className="w-3.5 h-3.5 text-foreground/30" />
              <span className="font-bold text-foreground">{activeLabel}</span>
            </div>
            <button onClick={handleToggleFavorite} title={isFavorite ? "Remove from favorites" : "Add to favorites"}
              className={`ml-0.5 transition-colors ${isFavorite ? "text-amber-400" : "text-foreground/30 hover:text-amber-400"}`}>
              <Star className={`w-4 h-4 ${isFavorite ? "fill-amber-400" : ""}`} />
            </button>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {activeTab !== "klutch-policy-declarations" && (
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleClearForm} title="Clear all fields and the preview for this generator">
                  <RotateCcw className="w-3.5 h-3.5" /> Clear Form
                </Button>
              )}
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleSaveDraft} disabled={saveDraftMut.isPending}>
                <Save className="w-3.5 h-3.5" />
                {saveDraftMut.isPending ? "Saving..." : "Save Draft"}
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setShareModalOpen(true)}>
                <Share2 className="w-3.5 h-3.5" />
                Share Template
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setShowRecentDocs(!showRecentDocs)}>
                <Clock className="w-3.5 h-3.5" />
                Recent
              </Button>
            </div>
          </div>

          {/* Recent Docs Panel */}
          {showRecentDocs && (
            <div className="border-b border-border bg-muted/10 px-6 py-3 shrink-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-foreground/70 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Recent Documents</span>
                <button onClick={() => setShowRecentDocs(false)} className="text-foreground/40 hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
              </div>
              {(recentDocsQ.data?.length ?? 0) === 0 ? (
                <p className="text-xs text-muted-foreground">No recent documents yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-foreground/40 border-b border-border">
                        <th className="text-left pb-1 font-medium">Document Name</th>
                        <th className="text-left pb-1 font-medium">Template</th>
                        <th className="text-left pb-1 font-medium">Claim #</th>
                        <th className="text-left pb-1 font-medium">Date</th>
                        <th className="text-left pb-1 font-medium">Status</th>
                        <th className="text-left pb-1 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentDocsQ.data?.map(doc => (
                        <tr key={doc.id} className="border-b border-border/50 hover:bg-muted/20">
                          <td className="py-1.5 pr-3 font-medium text-foreground">{doc.documentName}</td>
                          <td className="py-1.5 pr-3 text-foreground/60">{doc.tabLabel}</td>
                          <td className="py-1.5 pr-3 text-foreground/60">{doc.claimNumber || "—"}</td>
                          <td className="py-1.5 pr-3 text-foreground/50">{new Date(doc.createdAt).toLocaleDateString()}</td>
                          <td className="py-1.5 pr-3">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${doc.status === "finalized" ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400" : doc.status === "sent" ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400" : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"}`}>
                              {doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}
                            </span>
                          </td>
                          <td className="py-1.5">
                            <button onClick={() => { setActiveTab(normalizeDocGeneratorTab(doc.tabKey)); setShowRecentDocs(false); }} className="text-[#ff6221] hover:underline text-[10px]">Open</button>
                            {doc.pdfDataUrl && (
                              <button onClick={() => { setPreviewPdfUrl(doc.pdfDataUrl!); setFullScreenPreview(true); }} className="ml-2 text-foreground/50 hover:text-foreground text-[10px]">Preview</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* My Documents / Drafts Panel */}
          {showMyDocs && (
            <div className="border-b border-border bg-muted/10 px-6 py-3 shrink-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-foreground/70 flex items-center gap-1.5"><FolderOpen className="w-3.5 h-3.5" /> My Documents & Drafts</span>
                <button onClick={() => setShowMyDocs(false)} className="text-foreground/40 hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
              </div>
              {(draftsQ.data?.length ?? 0) === 0 ? (
                <p className="text-xs text-muted-foreground">No saved drafts yet. Use "Save Draft" to save your work.</p>
              ) : (
                <div className="space-y-1">
                  {draftsQ.data?.map(draft => (
                    <div key={draft.id} className="flex items-center gap-3 p-2 rounded-lg bg-background border border-border hover:border-[#ff6221]/30 transition-colors">
                      <FileText className="w-4 h-4 text-[#ff6221] shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{draft.tabLabel}{draft.claimNumber ? ` — ${draft.claimNumber}` : ""}</p>
                        <p className="text-[10px] text-foreground/50">{new Date(draft.updatedAt).toLocaleString()}</p>
                      </div>
                      <button onClick={() => handleLoadDraft(draft)} className="text-xs text-[#ff6221] hover:underline shrink-0">Load</button>
                      <button onClick={() => deleteDraftMut.mutate({ draftId: draft.id })} className="text-xs text-foreground/40 hover:text-red-500 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Shared Templates Panel */}
          {showSharedTemplates && (
            <div className="border-b border-border bg-muted/10 px-6 py-3 shrink-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-foreground/70 flex items-center gap-1.5"><Inbox className="w-3.5 h-3.5" /> Shared with Me</span>
                <button onClick={() => setShowSharedTemplates(false)} className="text-foreground/40 hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
              </div>
              {(sharedTemplatesQ.data?.length ?? 0) === 0 ? (
                <p className="text-xs text-muted-foreground">No templates have been shared with you yet.</p>
              ) : (
                <div className="space-y-1">
                  {sharedTemplatesQ.data?.map(t => (
                    <div key={t.id} className={`flex items-center gap-3 p-2 rounded-lg border transition-colors ${!t.isRead ? "bg-[#ff6221]/5 border-[#ff6221]/20" : "bg-background border-border"}`}>
                      <Share2 className="w-4 h-4 text-[#ff6221] shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{t.templateName} <span className="text-foreground/50 font-normal">({t.tabLabel})</span></p>
                        {t.message && <p className="text-[10px] text-foreground/50 truncate">{t.message}</p>}
                        <p className="text-[10px] text-foreground/40">{new Date(t.createdAt).toLocaleString()}</p>
                      </div>
                      {!t.isRead && <span className="text-[10px] bg-[#ff6221] text-white rounded-full px-1.5 py-0.5 shrink-0">New</span>}
                      <button onClick={() => handleLoadSharedTemplate(t)} className="text-xs text-[#ff6221] hover:underline shrink-0">Use</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-3 sm:p-6">
              <div key={`${activeTab}-${formResetKey}`}>
                {renderTab()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Share Template Modal */}
      {shareModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-foreground flex items-center gap-2"><Share2 className="w-4 h-4 text-[#ff6221]" /> Share Template</h3>
              <button onClick={() => setShareModalOpen(false)} className="text-foreground/40 hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-muted-foreground">Share the current <strong>{activeLabel}</strong> template with another handler.</p>
            <div className="space-y-3">
              <div>
                <Label className="text-xs font-semibold">Template Name</Label>
                <Input value={shareTemplateName} onChange={e => setShareTemplateName(e.target.value)} placeholder="e.g. Standard Subro Demand" className="mt-1 h-8 text-xs" />
              </div>
              <div>
                <Label className="text-xs font-semibold">Send To</Label>
                <Select onValueChange={v => setShareToUserId(Number(v))}>
                  <SelectTrigger className="mt-1 h-8 text-xs">
                    <SelectValue placeholder="Select handler..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(usersQ.data ?? []).map(u => (
                      <SelectItem key={u.id} value={String(u.id)}>{u.name || u.email || `User #${u.id}`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold">Message (optional)</Label>
                <Textarea value={shareMessage} onChange={e => setShareMessage(e.target.value)} placeholder="Add a note for the recipient..." className="mt-1 text-xs" rows={2} />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShareModalOpen(false)}>Cancel</Button>
              <Button size="sm" className="bg-[#ff6221] hover:bg-[#ff6221]/90 text-white gap-1.5" onClick={handleShareTemplate} disabled={shareTemplateMut.isPending}>
                <Send className="w-3.5 h-3.5" />
                {shareTemplateMut.isPending ? "Sharing..." : "Share"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Full Screen PDF Preview Modal */}
      {fullScreenPreview && previewPdfUrl && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
          <div className="flex items-center justify-between px-4 py-2 bg-background/10 border-b border-white/10">
            <span className="text-white text-sm font-medium">Document Preview</span>
            <div className="flex items-center gap-2">
              <a href={previewPdfUrl} download className="text-white/70 hover:text-white text-xs flex items-center gap-1"><Download className="w-3.5 h-3.5" /> Download</a>
              <button onClick={() => { setFullScreenPreview(false); setPreviewPdfUrl(null); }} className="text-white/70 hover:text-white ml-2"><X className="w-5 h-5" /></button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <iframe src={previewPdfUrl} className="w-full h-full" title="PDF Preview" />
          </div>
        </div>
      )}
    </WhipLayout>
  );
}
