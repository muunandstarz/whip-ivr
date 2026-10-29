import { useEffect, useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import { AlertTriangle, BadgeCheck, Building2, CheckCircle2, Download, Eye, FileCheck2, FileText, Landmark, Loader2, Printer, RefreshCw, ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import {
  DEFAULT_KLUTCH_WEEKLY_MEMBERSHIP_FEE,
  KLUTCH_COVERAGE_RULES,
  KLUTCH_DOCUMENT_LABELS,
  TNC_PERIODS,
  calculateKlutchPremium,
  type KlutchDocumentType,
  type KlutchState,
} from "@shared/klutchPolicy";

const KLUTCH_LOGO_URL = "/manus-storage/klutch-insurance-logo_c2ff6576.png";
const NAVY = "#003B40";
const SUPPORTED_STATES: KlutchState[] = ["MD", "VA", "PA", "FL", "IL", "GA", "MA", "TX"];

type PolicyRecord = {
  id: number;
  policyNumber: string;
  leaseId: string;
  state: KlutchState;
  effectiveOn: string;
  expiresOn: string;
  status: "active" | "cancelled" | "expired";
  cancelledOn: string | null;
  cancellationReason: string | null;
  terms: PolicyTerms;
};

type PolicyTerms = {
  leaseId: string;
  memberName: string;
  memberNumber: string;
  memberAddress?: string;
  memberStreet?: string;
  memberCity?: string;
  memberState?: KlutchState;
  memberZip?: string;
  memberEmail?: string;
  vehicle: string;
  vin: string;
  effectiveOn: string;
  expiresOn: string;
  state: KlutchState;
  termMonths: 6 | 12;
  transactionType: "new" | "renewal" | "correction";
  coverages: CoverageRow[];
  totalPremium: number;
  weeklyMembershipFee?: number;
  coverageWeeks?: number;
  pipWaived?: boolean;
  umRejected?: boolean;
  tncUseNote: string;
};

type CoverageRow = { label: string; limit: string; deductible?: string; premium: number };

type DocForm = {
  claimNumber: string;
  dateOfLoss: string;
  carrierLetterDate: string;
  tncName: string;
  tncPeriod: string;
  supportingRecords: string;
  tncCarrierName: string;
  tncCarrierClaimNumber: string;
  carrierName: string;
  carrierAddress: string;
  adjusterName: string;
  adjusterTitle: string;
  carrierClaimNumber: string;
  cancellationDate: string;
  handlerName: string;
  handlerTitle: string;
};

const today = () => new Date().toISOString().slice(0, 10);
const addYear = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return "";
  const lastDay = new Date(year + 1, month, 0).getDate();
  return `${year + 1}-${String(month).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
};
const prettyDate = (value: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—";
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);
const cleanFilename = (value: string) => value.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "Klutch_Document";
const memberMailingLines = (terms: PolicyTerms) => {
  const cityStateZip = [terms.memberCity, terms.memberState].filter(Boolean).join(", ");
  const locality = [cityStateZip, terms.memberZip].filter(Boolean).join(" ");
  const structured = [terms.memberStreet, locality].filter(Boolean) as string[];
  return structured.length ? structured : (terms.memberAddress || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
};

function openPdf(doc: jsPDF, filename: string, mode: "preview" | "download", setPreview: (value: string | null) => void) {
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  if (mode === "download") {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${filename}.pdf`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } else {
    setPreview(url);
  }
}

async function addReferenceLogo(doc: jsPDF, x = 15, y = 11, width = 38) {
  try {
    const response = await fetch(KLUTCH_LOGO_URL);
    if (!response.ok) throw new Error("logo unavailable");
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      response.blob().then((blob) => reader.readAsDataURL(blob), reject);
    });
    doc.addImage(dataUrl, "PNG", x, y, width, width * 0.354);
  } catch {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(NAVY);
    doc.setFontSize(14);
    doc.text("KLUTCH", x, y + 10);
  }
  doc.setTextColor("#111827");
}

function addReferenceFooter(doc: jsPDF, text = "Klutch Insurance Company | 424 Church Street, Suite 800, Nashville, Tennessee 37219") {
  doc.setTextColor("#9CA3AF");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.1);
  doc.text(text, 107.5, 280, { align: "center" });
  doc.setTextColor("#111827");
}

function writeReferenceParagraph(doc: jsPDF, text: string, x: number, y: number, width = 180, fontSize = 8.8, leading = 5.25) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(fontSize);
  const lines = doc.splitTextToSize(text, width) as string[];
  doc.text(lines, x, y, { lineHeightFactor: Math.max(1.2, leading / (fontSize * 0.3528)) });
  return y + lines.length * leading;
}

function writeReferenceLines(doc: jsPDF, lines: string[], x: number, y: number, fontSize = 8.8, leading = 5.1) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(fontSize);
  doc.text(lines, x, y, { lineHeightFactor: Math.max(1.2, leading / (fontSize * 0.3528)) });
  return y + lines.length * leading;
}

function writeMemberMailingAddress(doc: jsPDF, terms: PolicyTerms, y: number) {
  const lines = [terms.memberName, ...memberMailingLines(terms)].filter(Boolean);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.2);
  doc.text(lines, 15, y, { lineHeightFactor: 1.45 });
  return y + Math.max(13, lines.length * 5.8) + 4;
}

export default function KlutchPolicyDocumentsWorkspace({ initialState = "MD" }: { initialState?: string }) {
  const utils = trpc.useUtils();
  const policiesQuery = trpc.klutchPolicies.list.useQuery({ limit: 100 });
  const issueMutation = trpc.klutchPolicies.issue.useMutation({ onSuccess: () => utils.klutchPolicies.list.invalidate() });
  const documentMutation = trpc.klutchPolicies.recordDocument.useMutation();
  const cancellationMutation = trpc.klutchPolicies.cancelAndRecord.useMutation({ onSuccess: () => utils.klutchPolicies.list.invalidate() });
  const [documentType, setDocumentType] = useState<KlutchDocumentType>("declarations");
  const [selectedPolicyId, setSelectedPolicyId] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFilename, setPreviewFilename] = useState("Klutch_Document");
  const [issueKey] = useState(() => crypto.randomUUID());
  const policyDetailQuery = trpc.klutchPolicies.get.useQuery({ policyId: selectedPolicyId ?? 1 }, { enabled: Boolean(selectedPolicyId) });
  const normalizedInitialState = SUPPORTED_STATES.includes(initialState as KlutchState) ? initialState as KlutchState : "MD";
  const [issueForm, setIssueForm] = useState({
    leaseId: "",
    state: normalizedInitialState,
    effectiveOn: today(),
    memberName: "",
    memberStreet: "",
    memberCity: "",
    memberState: normalizedInitialState,
    memberZip: "",
    memberEmail: "",
    vehicle: "",
    vin: "",
    weeklyMembershipFee: String(DEFAULT_KLUTCH_WEEKLY_MEMBERSHIP_FEE),
    pipWaived: false,
    umRejected: false,
  });
  const [docForm, setDocForm] = useState<DocForm>({
    claimNumber: "",
    dateOfLoss: "",
    carrierLetterDate: "",
    tncName: "",
    tncPeriod: "",
    supportingRecords: "",
    tncCarrierName: "",
    tncCarrierClaimNumber: "",
    carrierName: "",
    carrierAddress: "",
    adjusterName: "",
    adjusterTitle: "",
    carrierClaimNumber: "",
    cancellationDate: "",
    handlerName: "",
    handlerTitle: "",
  });
  const activePolicy = useMemo(() => (policiesQuery.data ?? []).find((policy) => policy.id === selectedPolicyId) as PolicyRecord | undefined, [policiesQuery.data, selectedPolicyId]);
  const signer = docForm.handlerName;
  const signerTitle = docForm.handlerTitle;
  const expiresOn = addYear(issueForm.effectiveOn);
  const weeklyMembershipFee = DEFAULT_KLUTCH_WEEKLY_MEMBERSHIP_FEE;
  const premiumCalculation = calculateKlutchPremium({
    state: issueForm.state,
    effectiveOn: issueForm.effectiveOn,
    expiresOn,
    pipWaived: issueForm.pipWaived,
    umRejected: issueForm.umRejected,
  });
  const issueCoverages = premiumCalculation.coverages;

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  useEffect(() => {
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }, [documentType]);

  const setIssue = <K extends keyof typeof issueForm>(key: K, value: (typeof issueForm)[K]) => setIssueForm((current) => ({ ...current, [key]: value }));
  const setDocument = <K extends keyof DocForm>(key: K, value: DocForm[K]) => setDocForm((current) => ({ ...current, [key]: value }));

  const buildDraftPolicy = (): PolicyRecord => ({
    id: 0,
    policyNumber: "",
    leaseId: issueForm.leaseId || "",
    state: issueForm.state,
    effectiveOn: issueForm.effectiveOn,
    expiresOn,
    status: "active",
    cancelledOn: null,
    cancellationReason: null,
    terms: {
      leaseId: issueForm.leaseId || "",
      memberName: issueForm.memberName,
      memberNumber: issueForm.leaseId || "",
      memberStreet: issueForm.memberStreet,
      memberCity: issueForm.memberCity,
      memberState: issueForm.memberState,
      memberZip: issueForm.memberZip,
      memberEmail: issueForm.memberEmail,
      vehicle: issueForm.vehicle,
      vin: issueForm.vin,
      effectiveOn: issueForm.effectiveOn,
      expiresOn,
      state: issueForm.state,
      termMonths: 12,
      transactionType: "new",
      coverages: issueCoverages,
      totalPremium: premiumCalculation.totalPremium,
      weeklyMembershipFee: premiumCalculation.weeklyMembershipFee,
      coverageWeeks: premiumCalculation.coverageWeeks,
      pipWaived: issueForm.pipWaived,
      umRejected: issueForm.umRejected,
      tncUseNote: "",
    },
  });

  async function issuePolicy() {
    if (!issueForm.leaseId || !issueForm.memberName || !issueForm.vehicle || !Number.isFinite(weeklyMembershipFee) || weeklyMembershipFee <= 0 || !premiumCalculation.coverageWeeks) {
      toast.error("Whip claim number, member name, vehicle, valid effective date, and weekly membership fee are required before issuing a policy.");
      return;
    }
    try {
      const terms: PolicyTerms = {
        leaseId: issueForm.leaseId,
        memberName: issueForm.memberName,
        memberNumber: issueForm.leaseId,
        memberStreet: issueForm.memberStreet,
        memberCity: issueForm.memberCity,
        memberState: issueForm.memberState,
        memberZip: issueForm.memberZip,
        memberEmail: issueForm.memberEmail,
        vehicle: issueForm.vehicle,
        vin: issueForm.vin,
        effectiveOn: issueForm.effectiveOn,
        expiresOn,
        state: issueForm.state,
        termMonths: 12,
        transactionType: "new",
        coverages: issueCoverages,
        totalPremium: premiumCalculation.totalPremium,
        weeklyMembershipFee: premiumCalculation.weeklyMembershipFee,
        coverageWeeks: premiumCalculation.coverageWeeks,
        pipWaived: issueForm.pipWaived,
        umRejected: issueForm.umRejected,
        tncUseNote: "This policy applies during permitted Transportation Network Company use, subject to its terms, conditions, and endorsements.",
      };
      const issued = await issueMutation.mutateAsync({ issueRequestKey: issueKey, leaseId: issueForm.leaseId, state: issueForm.state, effectiveOn: issueForm.effectiveOn, expiresOn, referenceOn: new Date().toISOString().slice(0, 10), terms });
      setSelectedPolicyId(issued.policy.id);
      toast.success(`Policy ${issued.policy.policyNumber} issued and saved. No document was sent.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to issue policy.");
    }
  }

  async function previewDraftDeclarations() {
    if (!issueForm.memberName || !issueForm.vehicle || !Number.isFinite(weeklyMembershipFee) || weeklyMembershipFee <= 0 || !premiumCalculation.coverageWeeks) {
      toast.error("Enter the member name, vehicle, valid effective date, and weekly membership fee to preview the declaration.");
      return;
    }
    try {
      const document = await buildPdf("declarations", buildDraftPolicy());
      const filename = cleanFilename(`Klutch_Policy_Declarations_${issueForm.memberName}`);
      setPreviewFilename(filename);
      openPdf(document, filename, "preview", setPreviewUrl);
      toast.success("Declaration preview is ready to open, print, or download.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to build the declaration preview.");
    }
  }

  const buildPdf = async (kind: KlutchDocumentType, policy: PolicyRecord, klutchClaimNumber?: string | null) => {
    const doc = new jsPDF({ unit: "mm", format: "letter" });
    const terms = policy.terms;
    const vehicleText = `${terms.vehicle}${terms.vin ? ` (${terms.vin})` : ""}`;
    const activity = ({ "1": "waiting for a ride request", "2": "traveling to pick up a passenger", "3": "transporting a passenger" } as Record<string, string>)[docForm.tncPeriod] || "";
    const coverage = (label: string) => terms.coverages.find((entry) => entry.label === label) || { label, limit: "", deductible: "", premium: 0 };
    const referenceFooter = (formPage?: number) => addReferenceFooter(doc, formPage ? `Klutch Insurance Company | Form KIC-END-002 (Ed. 07/26) | Page ${formPage} of 2` : undefined);

    if (kind === "declarations") {
      await addReferenceLogo(doc, 145, 11, 38);
      writeReferenceLines(doc, ["Klutch Insurance Company", "NAIC 17966", "424 Church Street, Suite 800", "Nashville, Tennessee 37219", "claims@klutchinsurance.com"], 145, 30, 6.5, 4.2);
      let y = 72;
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.8); doc.text(`Policy number ${policy.policyNumber}`, 15, y);
      y += 11;
      doc.setFontSize(14); doc.text("Auto insurance policy declarations", 15, y);
      y += 10;
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.6);
      doc.text(`Your coverage begins on ${prettyDate(policy.effectiveOn)} at 12:01am. It expires on ${prettyDate(policy.expiresOn)} at 12:01am.`, 15, y);
      y += 13;
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.3); doc.text("Named insured", 15, y); doc.text("Vehicles", 108, y);
      y += 7;
      doc.setFont("helvetica", "normal"); doc.setFontSize(8);
      doc.text([terms.memberName, ...memberMailingLines(terms)], 15, y, { lineHeightFactor: 1.38 });
      doc.text(vehicleText, 108, y);
      y += 27;
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("Coverage premiums, limits and deductibles", 15, y);
      y += 7;
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.7); doc.text("The following coverages apply to the vehicle shown unless otherwise noted.", 15, y);
      y += 10;
      const rows: Array<{ label: string; detail: string; premium?: number }> = [
        { label: "Bodily injury liability *", detail: coverage("Bodily Injury Liability").limit, premium: coverage("Bodily Injury Liability").premium },
        { label: "Property damage liability *", detail: coverage("Property Damage Liability").limit, premium: coverage("Property Damage Liability").premium },
        { label: "Personal injury protection *", detail: coverage("Personal Injury Protection").limit },
        { label: "Uninsured motorist bodily injury *", detail: coverage("Uninsured Motorist").limit, premium: coverage("Uninsured Motorist").premium },
        { label: "Underinsured motorist bodily injury *", detail: coverage("Underinsured Motorist").limit, premium: coverage("Underinsured Motorist").premium },
        { label: "Uninsured motorist property damage", detail: "Not included" },
        { label: "Comprehensive *", detail: `${coverage("Comprehensive").deductible || "$500"} deductible. Limit of actual cash value.`, premium: coverage("Comprehensive").premium },
        { label: "Collision *", detail: `${coverage("Collision").deductible || "$500"} deductible. Limit of actual cash value.`, premium: coverage("Collision").premium },
      ];
      rows.forEach((row) => {
        doc.setFont("helvetica", "bold"); doc.setFontSize(7.8); doc.text(row.label, 15, y);
        doc.setFont("helvetica", "normal"); doc.text(row.detail, 107, y);
        y += 4.5;
        if (row.premium) { doc.setFontSize(7.3); doc.text(`Premium: ${money(row.premium)}`, 15, y); y += 3.7; }
        doc.setDrawColor("#D1D5DB"); doc.setLineWidth(0.18); doc.line(15, y + 1.6, 200, y + 1.6); y += 5;
      });
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.9); doc.text("Total premium for policy period", 15, y); doc.text(money(terms.totalPremium), 107, y);
      doc.setDrawColor("#9CA3AF"); doc.line(15, y + 3, 200, y + 3);
      doc.setDrawColor("#D1D5DB"); doc.line(15, 275, 200, 275);
      addReferenceFooter(doc);

      doc.addPage();
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.4); doc.text(`Policy number ${policy.policyNumber}`, 200, 18, { align: "right" }); doc.text(terms.memberName, 200, 23, { align: "right" });
      y = 52;
      doc.setFontSize(9); doc.text("Vehicle lessor", 15, y);
      y += 10;
      doc.setFont("helvetica", "normal"); doc.setFontSize(8);
      doc.text([terms.vehicle, terms.vin || ""].filter(Boolean), 15, y, { lineHeightFactor: 1.45 });
      doc.text(["Metrocars Leasing Corp", "14670 Southlawn Lane", "Rockville, MD 20850"], 107, y, { lineHeightFactor: 1.45 });
      y += 25;
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("Policy Documents", 15, y);
      y += 8;
      y = writeReferenceParagraph(doc, "These declarations summarize your coverage. Refer to your policy for complete terms, conditions, limits, and exclusions. For policy documents or to report a claim, email claims@klutchinsurance.com.", 15, y, 185, 8, 5.1);
      doc.setTextColor("#9CA3AF"); doc.setFontSize(5.8); doc.text("Coverage applies to the vehicle(s) listed in these declarations during the applicable policy period, subject to the terms of the lessor’s agreement and the policy’s terms, conditions, and endorsements.", 15, 258, { maxWidth: 180 }); doc.setTextColor("#111827");
      doc.setDrawColor("#D1D5DB"); doc.line(15, 275, 200, 275);
      addReferenceFooter(doc);
      return doc;
    }

    if (kind === "tnc_denial") {
      await addReferenceLogo(doc);
      let y = 35;
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.8); doc.text(prettyDate(today()), 15, y);
      y = writeMemberMailingAddress(doc, terms, y + 10);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
      doc.text(["RE: Coverage Determination – Denial of Claim", `Policy Number: ${policy.policyNumber}`, `Claim Number: ${klutchClaimNumber || "[Klutch claim number]"}`, `Date of Loss: ${prettyDate(docForm.dateOfLoss)}`, `Vehicle: ${vehicleText}`], 15, y, { lineHeightFactor: 1.35 });
      y += 31;
      y = writeReferenceParagraph(doc, `Dear ${terms.memberName}:`, 15, y, 180, 8.8, 5.2) + 5;
      y = writeReferenceParagraph(doc, "We have completed our review of this claim. Based on the circumstances of the loss and the applicable policy exclusion, Klutch Insurance Company denies liability and physical damage coverage for this loss.", 15, y, 180, 8.8, 5.2) + 5;
      y = writeReferenceParagraph(doc, `Our review of the ${docForm.tncName} trip and activity records for the date of loss confirms that, at the time of the loss, you were logged on to the ${docForm.tncName} platform and ${activity}.`, 15, y, 180, 8.8, 5.2) + 5;
      y = writeReferenceParagraph(doc, "Your policy includes the following exclusion under the Transportation Network Company and Commercial Use Exclusion Endorsement, Form KIC-END-002 (Ed. 07/26), Section B:", 15, y, 180, 8.8, 5.2) + 4;
      y = writeReferenceParagraph(doc, "“We do not provide coverage under this policy for any loss, damage, injury, or liability, or for any claim, suit, defense, or expense, arising out of or occurring while the covered vehicle is being used, operated, or made available: 1. while the operator is logged on to a transportation network company platform or digital network, whether waiting for a request, en route to a rider or pickup location, or carrying a passenger or property …”", 25, y, 160, 8.3, 4.9) + 5;
      y = writeReferenceParagraph(doc, "Because the loss occurred while you were logged on to the platform, the exclusion applies and coverage is unavailable for this claim.", 15, y, 180, 8.8, 5.2) + 5;
      y = writeReferenceParagraph(doc, `This decision concerns coverage under your Klutch policy only. It does not determine whether coverage is available through ${docForm.tncName} or another insurer.`, 15, y, 180, 8.8, 5.2) + 5;
      const insurerReference = [
        docForm.tncCarrierName ? `TNC insurer: ${docForm.tncCarrierName}` : "",
        docForm.tncCarrierClaimNumber ? `TNC insurer claim number: ${docForm.tncCarrierClaimNumber}` : "",
      ].filter(Boolean);
      if (insurerReference.length) {
        y = writeReferenceParagraph(doc, `For reference only, the following TNC insurer information was provided: ${insurerReference.join("; ")}. This information does not state or imply a coverage determination by that insurer.`, 15, y, 180, 8.4, 5) + 5;
      }
      y = writeReferenceParagraph(doc, "If you believe our findings are incorrect or have additional information that may affect this decision, please send it to claims@klutchinsurance.com for review.", 15, y, 180, 8.8, 5.2) + 9;
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.8); doc.text(["Sincerely,", "", signer, signerTitle, "Klutch Insurance Company", "claims@klutchinsurance.com", "", "cc: Metrocars Leasing Corp"], 15, y, { lineHeightFactor: 1.35 });
      addReferenceFooter(doc);
      return doc;
    }

    if (kind === "carrier_position") {
      await addReferenceLogo(doc);
      let y = 35;
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.8); doc.text(prettyDate(today()), 15, y);
      y += 11;
      y = writeReferenceLines(doc, [`${docForm.carrierName} Claims`, `Attn: ${[docForm.adjusterName, docForm.adjusterTitle].filter(Boolean).join(", ")}`, ...(docForm.carrierAddress || "").split(/\r?\n/).filter(Boolean)], 15, y, 8.8, 5.2) + 6;
      doc.text(["RE: Coverage Position", `Your Claim Number: ${docForm.carrierClaimNumber}`, `Policy Number: ${policy.policyNumber}`, `Our Claim Number: ${klutchClaimNumber || "[Klutch claim number]"}`, `Date of Loss: ${prettyDate(docForm.dateOfLoss)}`, `Our Insured: ${terms.memberName}`, `Vehicle: ${vehicleText}`], 15, y, { lineHeightFactor: 1.32 });
      y += 38;
      y = writeReferenceParagraph(doc, `Dear ${docForm.adjusterName}:`, 15, y, 180, 8.6, 5.05) + 5;
      y = writeReferenceParagraph(doc, `This responds to your letter of ${docForm.carrierLetterDate ? prettyDate(docForm.carrierLetterDate) : "[date of carrier letter]"} on the above loss. Klutch Insurance Company insures the above vehicle under a policy issued to ${terms.memberName}. Our coverage position is set out below.`, 15, y, 180, 8.6, 5.05) + 5;
      y = writeReferenceParagraph(doc, "The Klutch policy includes the Transportation Network Company and Commercial Use Exclusion Endorsement, Form KIC-END-002 (Ed. 07/26). Section B of that endorsement excludes coverage for any loss arising out of or occurring while the operator is logged on to a transportation network company platform, whether waiting for a request, en route to a rider or pickup location, or carrying a passenger or property.", 15, y, 180, 8.6, 5.05) + 5;
      y = writeReferenceParagraph(doc, `Our investigation determined that ${terms.memberName} was driving in period ${docForm.tncPeriod} on the ${docForm.tncName} platform at the time of the loss, based on ${docForm.supportingRecords}. Klutch has denied coverage for this loss to its insured. The Klutch policy is not available as other insurance for this loss, and Klutch will not be contributing to any payment.`, 15, y, 180, 8.6, 5.05) + 5;
      y = writeReferenceParagraph(doc, "Please direct all communications about the repair of the vehicle and the payment of any physical damage loss to Whip Claims Management at claims@drivewhip.com and reference the claim numbers above.", 15, y, 180, 8.6, 5.05) + 5;
      y = writeReferenceParagraph(doc, "Copies of the policy declarations and the denial are enclosed. Please contact our office with any questions.", 15, y, 180, 8.6, 5.05) + 8;
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.6); doc.text(["Sincerely,", "", signer, signerTitle, "Klutch Insurance Company", "claims@klutchinsurance.com", "", "Enclosures: Policy Declarations; Coverage Denial"], 15, y, { lineHeightFactor: 1.33 });
      addReferenceFooter(doc);
      return doc;
    }

    if (kind === "cancellation_notice") {
      await addReferenceLogo(doc);
      let y = 35;
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.8); doc.text(prettyDate(today()), 15, y);
      y = writeMemberMailingAddress(doc, terms, y + 10);
      doc.text(["RE: Notice of Policy Cancellation", `Policy Number: ${policy.policyNumber}`, `Vehicle: ${vehicleText}`, `Cancellation Effective Date: ${prettyDate(docForm.cancellationDate)}`], 15, y, { lineHeightFactor: 1.35 });
      y += 26;
      y = writeReferenceParagraph(doc, `Dear ${terms.memberName}:`, 15, y, 180, 8.8, 5.2) + 5;
      y = writeReferenceParagraph(doc, `Our records show that your lease of the vehicle listed above has been terminated. Under the terms of your lease with Metrocars Leasing Corp, coverage under your Klutch policy ends when the lease ends. Your policy is cancelled effective ${prettyDate(docForm.cancellationDate)}.`, 15, y, 180, 8.8, 5.2) + 7;
      y = writeReferenceParagraph(doc, "As of the cancellation effective date:", 15, y, 180, 8.8, 5.2) + 5;
      ["All coverage under this policy ends.", "Coverage applied only to the vehicle listed above. No coverage applies to you in any other vehicle.", "No coverage applies to any loss, liability, or claim arising from an occurrence after that date."].forEach((line, index) => { y = writeReferenceParagraph(doc, `${index + 1}.  ${line}`, 25, y, 160, 8.7, 5.1) + 3; });
      y += 2;
      y = writeReferenceParagraph(doc, "This cancellation does not affect coverage for covered losses that occurred before the cancellation effective date.", 15, y, 180, 8.8, 5.2) + 5;
      y = writeReferenceParagraph(doc, "If you believe this notice is in error, please contact us at claims@klutchinsurance.com.", 15, y, 180, 8.8, 5.2) + 10;
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.8); doc.text(["Sincerely,", "", "Policy Services", "Klutch Insurance Company", "claims@klutchinsurance.com", "", "cc: Metrocars Leasing Corp"], 15, y, { lineHeightFactor: 1.35 });
      addReferenceFooter(doc);
      return doc;
    }

    await addReferenceLogo(doc);
    let y = 35;
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.3); doc.text("ENDORSEMENT NO. KIC-END-002", 15, y);
    y += 6;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.1); doc.text(`Policy Number: ${policy.policyNumber}`, 15, y); doc.text("Endorsement Effective Date: July 1, 2026", 102, y);
    y += 6;
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.1); doc.text("THIS ENDORSEMENT CHANGES THE POLICY. PLEASE READ IT CAREFULLY.", 15, y); doc.setDrawColor("#9CA3AF"); doc.line(15, y + 3, 200, y + 3);
    y += 12;
    doc.setFontSize(8.7); doc.text(["TRANSPORTATION NETWORK COMPANY AND COMMERCIAL USE EXCLUSION", "ENDORSEMENT"], 107.5, y, { align: "center", lineHeightFactor: 1.2 });
    y += 15;
    y = writeReferenceParagraph(doc, "This endorsement modifies the insurance provided under the Klutch Insurance Company policy to which it is attached. It applies to every coverage part of the policy, including liability, personal injury protection, uninsured and underinsured motorist, comprehensive, and collision coverage. Where this endorsement conflicts with any other provision of the policy, this endorsement controls.", 15, y, 185, 8.3, 4.9) + 8;
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.text("A. Definitions", 15, y); y += 7;
    y = writeReferenceParagraph(doc, "The following definitions apply to this endorsement. Words defined elsewhere in the policy keep their meaning unless defined here.", 15, y, 185, 8.3, 4.9) + 6;
    const definitions = [
      "“Transportation network company” or “TNC” means any person or entity that uses a digital network or software application to connect riders, customers, or shippers with drivers for transportation of passengers or delivery of goods, including, without limitation, Uber, Lyft, and their affiliates.",
      "“Digital network” means any online-enabled application, website, or system, whether operated by a TNC or any other person, that is used to offer, arrange, or dispatch transportation, delivery, or other for-hire services.",
      "“Logged on” means signed in to, or otherwise active on, a digital network or TNC platform in a manner that makes the operator available to receive, or that allows the operator to accept or perform, a request. The operator remains logged on until fully logged off, whether or not any request has been received or accepted.",
      "“Delivery services” means the transportation of food, groceries, packages, goods, or other property for a fee, tip, or other compensation, whether arranged through a digital network or otherwise.",
      "“For-hire use” means carrying persons or property for compensation of any kind, including use as a taxi, livery, limousine, shuttle, ride-share, ride-hail, charter, or courier vehicle.",
      "“Cargo” means any property, goods, or materials carried in or on the covered vehicle for commercial purposes or for compensation.",
      "“Business use” means any use of the covered vehicle in connection with a trade, business, profession, or occupation, other than commuting to and from a place of work.",
    ];
    definitions.forEach((definition, index) => { doc.setFont("helvetica", "normal"); doc.setFontSize(8.1); doc.text(`${index + 1}.`, 19, y); y = writeReferenceParagraph(doc, definition, 25, y, 171, 8.1, 4.75) + 3; });
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.text("B. Exclusion", 15, y); y += 7;
    writeReferenceParagraph(doc, "We do not provide coverage under this policy for any loss, damage, injury, or liability, or for any claim, suit, defense, or expense, arising out of or occurring while the covered vehicle is being used, operated, or made available:", 15, y, 185, 8.2, 4.85);
    referenceFooter(1);

    doc.addPage();
    y = 22;
    const exclusions = [
      "while the operator is logged on to a transportation network company platform or digital network, whether waiting for a request, en route to a rider or pickup location, or carrying a passenger or property;",
      "for for-hire use, including taxi, livery, limousine, shuttle, ride-share, or ride-hail service;",
      "for delivery services;",
      "to carry cargo; or",
      "for any other business use.",
    ];
    exclusions.forEach((line, index) => { doc.setFont("helvetica", "normal"); doc.setFontSize(8.3); doc.text(`${index + 1}.`, 19, y); y = writeReferenceParagraph(doc, line, 25, y, 171, 8.3, 5) + 4; });
    y += 4;
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.text("C. How This Exclusion Applies", 15, y); y += 8;
    const application = [
      "This exclusion applies to the named insured, to any operator of the covered vehicle, and to any other person or organization seeking coverage. It does not limit the rights of a lessor or loss payee shown in the Declarations under the loss payable provision of the policy, and any such rights exist only as that provision states.",
      "This exclusion applies whether or not the use of the vehicle caused or contributed to the loss, and whether or not a passenger, cargo, or delivery item is in the vehicle at the time, to the extent permitted by applicable law.",
      "We have no duty to defend or indemnify any claim or suit that is excluded by this endorsement.",
      "This exclusion applies even if a TNC, another insurer, or any other person provides, denies, or fails to provide coverage for the same loss. This policy is not other insurance available to contribute to that loss.",
      "If the law of the state governing this policy requires coverage that this exclusion would otherwise remove, this exclusion applies only to the extent the law permits, and coverage is limited to the minimum amount that law requires.",
    ];
    application.forEach((line, index) => { doc.setFont("helvetica", "normal"); doc.setFontSize(8.2); doc.text(`${index + 1}.`, 19, y); y = writeReferenceParagraph(doc, line, 25, y, 171, 8.2, 4.95) + 4; });
    y += 3;
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.text("D. All Other Terms", 15, y); y += 8;
    writeReferenceParagraph(doc, "All other terms, conditions, and exclusions of the policy remain unchanged.", 15, y, 185, 8.3, 5);
    referenceFooter(2);
    return doc;
  };

  function validatePreviewInputs() {
    if (!activePolicy) { toast.error("Issue or select a Klutch policy first."); return false; }
    return true;
  }

  async function previewDocument() {
    if (!validatePreviewInputs() || !activePolicy) return;
    try {
      const sourceClaimNumber = docForm.claimNumber || activePolicy.leaseId;
      const matchingClaim = policyDetailQuery.data?.claims?.find((claim) => claim.snapsheetClaimNumber === sourceClaimNumber.trim().toUpperCase());
      const document = await buildPdf(documentType, activePolicy, matchingClaim?.klutchClaimNumber);
      const filename = cleanFilename(`Klutch_${KLUTCH_DOCUMENT_LABELS[documentType]}_${activePolicy.policyNumber}_${matchingClaim?.klutchClaimNumber || "Preview"}`);
      setPreviewFilename(filename);
      openPdf(document, filename, "preview", setPreviewUrl);
      toast.success("Document preview is ready to open, print, or download. No audit record was created.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to build the document preview.");
    }
  }

  async function createDocument(mode: "download") {
    if (!activePolicy) { toast.error("Issue or select a Klutch policy first."); return; }
    const sourceClaimNumber = docForm.claimNumber || activePolicy.leaseId;
    if (documentType === "cancellation_notice" && !docForm.cancellationDate) { toast.error("Enter the lease-termination effective date."); return; }
    try {
      let result: { klutchClaimNumber?: string | null; deliveryStatus: string } | undefined;
      const snapshot = { ...docForm, sourceClaimNumber, policyNumber: activePolicy.policyNumber, whipClaimNumber: activePolicy.leaseId, signer, signerTitle };
      if (documentType === "cancellation_notice") {
        result = await cancellationMutation.mutateAsync({ policyId: activePolicy.id, cancelledOn: docForm.cancellationDate, claimNumber: sourceClaimNumber || undefined, documentSnapshot: snapshot });
        activePolicy.status = "cancelled";
      } else result = await documentMutation.mutateAsync({ policyId: activePolicy.id, documentType, claimNumber: sourceClaimNumber || undefined, snapshot });
      const document = await buildPdf(documentType, activePolicy, result?.klutchClaimNumber);
      const filename = cleanFilename(`Klutch_${KLUTCH_DOCUMENT_LABELS[documentType]}_${activePolicy.policyNumber}_${result?.klutchClaimNumber || sourceClaimNumber || "Policy"}`);
      setPreviewFilename(filename);
      openPdf(document, filename, mode, setPreviewUrl);
      await utils.klutchPolicies.get.invalidate({ policyId: activePolicy.id });
      toast.success(`${KLUTCH_DOCUMENT_LABELS[documentType]} saved to the Klutch claim-file audit as created, not sent.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create the Klutch document.");
    }
  }

  return (
    <div className="space-y-5 pb-8">
      <section className="overflow-hidden rounded-2xl border border-[#0B5458]/20 bg-white shadow-sm">
        <div className="relative bg-[#003B40] px-5 py-5 text-white md:px-7">
          <div className="absolute right-0 top-0 h-full w-1/3 bg-[linear-gradient(120deg,transparent_0%,rgba(203,234,75,.16)_55%,rgba(203,234,75,.08)_100%)]" />
          <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <img src={KLUTCH_LOGO_URL} alt="Klutch Insurance" className="h-11 w-auto rounded bg-white/95 px-2 py-1" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#CBEA4B]">Policy document workspace</p>
                <h2 className="mt-1 text-xl font-semibold">Klutch Policy Documents</h2>
                <p className="mt-1 text-sm text-white/75">Issue, retain, and prepare policy documents with a permanent created-not-sent audit.</p>
              </div>
            </div>
            <div className="rounded-full border border-[#CBEA4B]/40 bg-[#CBEA4B]/15 px-3 py-1.5 text-xs font-semibold text-[#E7F78B]">NAIC 17966</div>
          </div>
        </div>
        <div className="grid gap-3 bg-[#F5F8F7] p-4 md:grid-cols-3">
          <div className="flex gap-3 rounded-lg bg-white p-3 shadow-sm"><FileCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-[#0B5458]" /><p className="text-sm text-slate-700"><strong className="block text-slate-900">Start with the Whip claim</strong>Enter the Whip / SnapSheet claim number once. The server assigns the separate Klutch policy number and, for claim documents, creates or reuses the Klutch claim number.</p></div>
          <div className="flex gap-3 rounded-lg bg-white p-3 shadow-sm"><Eye className="mt-0.5 h-5 w-5 shrink-0 text-[#0B5458]" /><p className="text-sm text-slate-700"><strong className="block text-slate-900">Preview before you issue</strong>Inspect and print/save the declaration PDF before creating a policy, document audit record, email, or delivery.</p></div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-[#0B5458]">Step 1</p><h3 className="text-lg font-semibold text-slate-900">Issue or select a policy</h3></div><span className="text-xs text-slate-500">12-month terms only</span></div>
        <div className="mb-5 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <div><Label htmlFor="klutch-existing-policy">Existing Klutch policy</Label><Select value={selectedPolicyId ? String(selectedPolicyId) : "new"} onValueChange={(value) => setSelectedPolicyId(value === "new" ? null : Number(value))}><SelectTrigger id="klutch-existing-policy"><SelectValue placeholder="Issue a new policy below" /></SelectTrigger><SelectContent><SelectItem value="new">Issue a new policy</SelectItem>{(policiesQuery.data ?? []).map((policy) => <SelectItem key={policy.id} value={String(policy.id)}>{policy.policyNumber} · {policy.terms.memberName} · {policy.status}</SelectItem>)}</SelectContent></Select></div>
          <Button variant="outline" onClick={() => policiesQuery.refetch()} disabled={policiesQuery.isFetching}><RefreshCw className="mr-2 h-4 w-4" />Refresh policies</Button>
        </div>
        {activePolicy ? <div className="rounded-lg border border-[#0B5458]/20 bg-[#F5F8F7] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-[#0B5458]">Active policy record</p><p className="mt-1 text-lg font-semibold text-slate-900">{activePolicy.policyNumber}</p><p className="text-sm text-slate-600">{activePolicy.terms.memberName} · Whip claim {activePolicy.leaseId} · {prettyDate(activePolicy.effectiveOn)} — {prettyDate(activePolicy.expiresOn)}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${activePolicy.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>{activePolicy.status}</span></div>{policyDetailQuery.data?.documents?.length ? <div className="mt-4 border-t border-[#0B5458]/15 pt-3"><p className="text-xs font-semibold uppercase tracking-wide text-[#0B5458]">Created-not-sent audit</p><div className="mt-2 flex flex-wrap gap-2">{policyDetailQuery.data.documents.slice(0, 6).map((document) => <span key={document.id} className="rounded-full border border-[#0B5458]/20 bg-white px-2.5 py-1 text-xs text-slate-700">{KLUTCH_DOCUMENT_LABELS[document.documentType as KlutchDocumentType]} · {document.deliveryStatus}</span>)}</div></div> : <p className="mt-3 border-t border-[#0B5458]/15 pt-3 text-xs text-slate-600">No documents have been created for this policy yet.</p>}</div> : <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-4 md:grid-cols-3"><div><Label htmlFor="klutch-lease-id">Whip claim number</Label><Input id="klutch-lease-id" value={issueForm.leaseId} onChange={(event) => setIssue("leaseId", event.target.value)} placeholder="GB-0000-000000-000000" /><p className="mt-1 text-xs text-slate-500">Source claim reference only. The server issues the separate Klutch policy and Klutch claim numbers.</p></div><div><Label htmlFor="klutch-state">Garaging state</Label><Select value={issueForm.state} onValueChange={(value) => { setIssue("state", value as KlutchState); setIssue("memberState", value as KlutchState); }}><SelectTrigger id="klutch-state"><SelectValue /></SelectTrigger><SelectContent>{SUPPORTED_STATES.map((state) => <SelectItem key={state} value={state}>{state}</SelectItem>)}</SelectContent></Select></div><div><Label htmlFor="klutch-effective">Lease / policy effective date</Label><Input id="klutch-effective" type="date" value={issueForm.effectiveOn} onChange={(event) => setIssue("effectiveOn", event.target.value)} /><p className="mt-1 text-xs text-slate-500">Expiration: {prettyDate(expiresOn)}</p></div></div>
          <div className="grid gap-4 md:grid-cols-2"><div><Label htmlFor="klutch-member">Member / named insured</Label><Input id="klutch-member" value={issueForm.memberName} onChange={(event) => setIssue("memberName", event.target.value)} /></div><div><Label htmlFor="klutch-email">Member email (record only)</Label><Input id="klutch-email" type="email" value={issueForm.memberEmail} onChange={(event) => setIssue("memberEmail", event.target.value)} /></div></div>
          <div className="grid gap-4 md:grid-cols-[2fr_1fr_0.75fr_0.75fr]"><div><Label htmlFor="klutch-address-street">Street address</Label><Input id="klutch-address-street" value={issueForm.memberStreet} onChange={(event) => setIssue("memberStreet", event.target.value)} /></div><div><Label htmlFor="klutch-address-city">City</Label><Input id="klutch-address-city" value={issueForm.memberCity} onChange={(event) => setIssue("memberCity", event.target.value)} /></div><div><Label htmlFor="klutch-address-state">State</Label><Select value={issueForm.memberState} onValueChange={(value) => setIssue("memberState", value as KlutchState)}><SelectTrigger id="klutch-address-state"><SelectValue /></SelectTrigger><SelectContent>{SUPPORTED_STATES.map((state) => <SelectItem key={state} value={state}>{state}</SelectItem>)}</SelectContent></Select></div><div><Label htmlFor="klutch-address-zip">ZIP code</Label><Input id="klutch-address-zip" inputMode="numeric" value={issueForm.memberZip} onChange={(event) => setIssue("memberZip", event.target.value)} /></div></div>
          <div className="grid gap-4 md:grid-cols-3"><div className="md:col-span-2"><Label htmlFor="klutch-vehicle">Vehicle</Label><Input id="klutch-vehicle" placeholder="Year Make Model Trim" value={issueForm.vehicle} onChange={(event) => setIssue("vehicle", event.target.value)} /></div><div><Label htmlFor="klutch-vin">VIN</Label><Input id="klutch-vin" value={issueForm.vin} onChange={(event) => setIssue("vin", event.target.value)} /></div></div>
          <div className="rounded-lg border border-[#0B5458]/20 bg-[#F5F8F7] p-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div><Label htmlFor="klutch-weekly-membership-fee">Weekly membership fee ($)</Label><Input id="klutch-weekly-membership-fee" inputMode="decimal" value={issueForm.weeklyMembershipFee} onChange={(event) => setIssue("weeklyMembershipFee", event.target.value)} /><p className="mt-1 text-xs text-slate-600">The legacy declaration model defaults to $35.00 per coverage week.</p></div>
              <div className="rounded-md border border-[#0B5458]/15 bg-white px-3 py-2"><p className="text-xs font-semibold uppercase tracking-wide text-[#0B5458]">Coverage weeks</p><p className="mt-1 text-lg font-semibold text-slate-900">{premiumCalculation.coverageWeeks || "—"} weeks</p><p className="text-xs text-slate-500">Calculated from {prettyDate(issueForm.effectiveOn)} through {prettyDate(expiresOn)}.</p></div>
              <div className="rounded-md border border-[#0B5458]/15 bg-white px-3 py-2"><p className="text-xs font-semibold uppercase tracking-wide text-[#0B5458]">Policy-period premium</p><p className="mt-1 text-lg font-semibold text-slate-900">{money(premiumCalculation.totalPremium)}</p><p className="text-xs text-slate-500">{money(premiumCalculation.weeklyMembershipFee)} × {premiumCalculation.coverageWeeks || 0} weeks</p></div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2"><div className="flex items-center gap-2"><Checkbox id="klutch-pip-waived" checked={issueForm.pipWaived} onCheckedChange={(checked) => setIssue("pipWaived", Boolean(checked))} disabled={issueForm.state !== "MD"} /><Label htmlFor="klutch-pip-waived" className="text-sm">PIP waived (MD only)</Label></div><div className="flex items-center gap-2"><Checkbox id="klutch-um-rejected" checked={issueForm.umRejected} onCheckedChange={(checked) => setIssue("umRejected", Boolean(checked))} disabled={!KLUTCH_COVERAGE_RULES[issueForm.state].umRejectable} /><Label htmlFor="klutch-um-rejected" className="text-sm">UM / UIM rejected where eligible</Label></div></div>
            <p className="mt-3 text-xs text-slate-600">The policy-period total is apportioned across elected coverages using the prior declaration weights: BI 30, PD 12, Collision 25, Comprehensive 13, PIP 8, UM 7, and UIM 5. Unavailable, waived, or rejected coverages receive no allocation and the remaining elected coverages are rebalanced.</p>
          </div>
          <div className="overflow-x-auto rounded-md border border-slate-200 bg-white"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-[#003B40] text-white"><tr><th className="px-3 py-2 font-semibold">Coverage</th><th className="px-3 py-2 font-semibold">Limit / election</th><th className="px-3 py-2 font-semibold">Deductible</th><th className="px-3 py-2 text-right font-semibold">Policy-period premium</th></tr></thead><tbody>{issueCoverages.map((coverage) => <tr key={coverage.label} className="border-t border-slate-100"><td className="px-3 py-2">{coverage.label}</td><td className="px-3 py-2">{coverage.limit}</td><td className="px-3 py-2">{coverage.deductible || "—"}</td><td className="px-3 py-2 text-right">{coverage.premium ? money(coverage.premium) : "—"}</td></tr>)}<tr className="border-t-2 border-[#003B40] font-semibold"><td colSpan={3} className="px-3 py-2 text-right">Total policy-period premium</td><td className="px-3 py-2 text-right">{money(premiumCalculation.totalPremium)}</td></tr></tbody></table></div>
          <div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-2xl text-xs text-slate-500">Preview the declaration as often as needed before issuing. A preview does not create a policy number, audit record, email, or delivery. Issuing creates the permanent server record; then all five document actions become available below.</p><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={previewDraftDeclarations}><Eye className="mr-2 h-4 w-4" />Preview declaration</Button><Button className="bg-[#003B40] hover:bg-[#0B5458]" onClick={issuePolicy} disabled={issueMutation.isPending}>{issueMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Issue 12-month policy</Button></div></div>
        </div>}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4"><p className="text-xs font-semibold uppercase tracking-wide text-[#0B5458]">Step 2</p><h3 className="text-lg font-semibold text-slate-900">Choose a Klutch document</h3><p className="mt-1 text-sm text-slate-600">All five documents are saved as created-not-sent claim-file audit records with the policy and Klutch claim identifiers.</p></div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">{(Object.keys(KLUTCH_DOCUMENT_LABELS) as KlutchDocumentType[]).map((kind) => <button type="button" key={kind} onClick={() => setDocumentType(kind)} className={`rounded-lg border p-3 text-left transition ${documentType === kind ? "border-[#0B5458] bg-[#EDF7F3] ring-1 ring-[#0B5458]" : "border-slate-200 bg-white hover:border-[#0B5458]/50"}`}><span className="mb-2 flex h-7 w-7 items-center justify-center rounded bg-[#003B40] text-[#CBEA4B]">{kind === "declarations" ? <FileText className="h-4 w-4" /> : kind === "tnc_denial" ? <ShieldAlert className="h-4 w-4" /> : kind === "carrier_position" ? <Building2 className="h-4 w-4" /> : kind === "cancellation_notice" ? <Landmark className="h-4 w-4" /> : <BadgeCheck className="h-4 w-4" />}</span><span className="text-sm font-semibold text-slate-900">{KLUTCH_DOCUMENT_LABELS[kind]}</span></button>)}</div>
        {!activePolicy ? <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle className="mr-2 inline h-4 w-4" />Issue or select a policy before preparing a document.</div> : <div className="mt-5 space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-4 md:grid-cols-4"><div><Label htmlFor="klutch-claim-number">Whip / SnapSheet claim number</Label><Input id="klutch-claim-number" value={docForm.claimNumber || activePolicy.leaseId} onChange={(event) => setDocument("claimNumber", event.target.value)} placeholder="GB-0000-000000-000000" /><p className="mt-1 text-xs text-slate-500">When entered, the server maps this source claim to a separate Klutch claim number.</p></div><div><Label htmlFor="klutch-loss-date">Date of loss</Label><Input id="klutch-loss-date" type="date" value={docForm.dateOfLoss} onChange={(event) => setDocument("dateOfLoss", event.target.value)} /></div><div><Label htmlFor="klutch-handler-name">Handler name</Label><Input id="klutch-handler-name" value={docForm.handlerName} onChange={(event) => setDocument("handlerName", event.target.value)} placeholder="Enter the handling adjuster" /></div><div><Label htmlFor="klutch-handler-title">Handler title</Label><Input id="klutch-handler-title" value={docForm.handlerTitle} onChange={(event) => setDocument("handlerTitle", event.target.value)} placeholder="Claims adjuster" /></div></div>
          {(["tnc_denial", "carrier_position"] as KlutchDocumentType[]).includes(documentType) && <>
            <div className="grid gap-4 md:grid-cols-2">
              <div><Label htmlFor="klutch-tnc-name">TNC platform</Label><Input id="klutch-tnc-name" value={docForm.tncName} onChange={(event) => setDocument("tncName", event.target.value)} placeholder="Uber, Lyft, or other platform" /></div>
              <div><Label htmlFor="klutch-tnc-period">TNC period</Label><Select value={docForm.tncPeriod} onValueChange={(value) => setDocument("tncPeriod", value)}><SelectTrigger id="klutch-tnc-period"><SelectValue placeholder="Select the documented period" /></SelectTrigger><SelectContent><SelectItem value="0">0 — Personal use</SelectItem>{Object.entries(TNC_PERIODS).map(([key, value]) => <SelectItem key={key} value={key}>{key} — {value}</SelectItem>)}</SelectContent></Select></div>
            </div>
            {documentType === "tnc_denial" && <div className="rounded-lg border border-[#0B5458]/15 bg-white p-3"><p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#0B5458]">Optional TNC insurer reference</p><div className="grid gap-4 md:grid-cols-2"><div><Label htmlFor="klutch-tnc-carrier">TNC insurer name</Label><Input id="klutch-tnc-carrier" value={docForm.tncCarrierName} onChange={(event) => setDocument("tncCarrierName", event.target.value)} placeholder="Platform insurer, if known" /></div><div><Label htmlFor="klutch-tnc-carrier-claim">TNC insurer claim number</Label><Input id="klutch-tnc-carrier-claim" value={docForm.tncCarrierClaimNumber} onChange={(event) => setDocument("tncCarrierClaimNumber", event.target.value)} placeholder="If known" /></div></div><p className="mt-2 text-xs text-slate-500">These references print only when entered; they do not state or imply a coverage determination by that insurer.</p></div>}
            <div><Label htmlFor="klutch-supporting-records">Supporting-record reference</Label><Textarea id="klutch-supporting-records" rows={2} value={docForm.supportingRecords} onChange={(event) => setDocument("supportingRecords", event.target.value)} placeholder="Identify the trip/activity record, statement, report, or other supporting records reviewed." /></div>
          </>}
          {documentType === "carrier_position" && <div className="grid gap-4 md:grid-cols-2"><div><Label htmlFor="klutch-carrier-name">Carrier name</Label><Input id="klutch-carrier-name" value={docForm.carrierName} onChange={(event) => setDocument("carrierName", event.target.value)} /></div><div><Label htmlFor="klutch-adjuster">Carrier adjuster</Label><Input id="klutch-adjuster" value={docForm.adjusterName} onChange={(event) => setDocument("adjusterName", event.target.value)} /></div><div><Label htmlFor="klutch-adjuster-title">Adjuster title</Label><Input id="klutch-adjuster-title" value={docForm.adjusterTitle} onChange={(event) => setDocument("adjusterTitle", event.target.value)} placeholder="Claims adjuster" /></div><div><Label htmlFor="klutch-carrier-letter-date">Date of carrier letter</Label><Input id="klutch-carrier-letter-date" type="date" value={docForm.carrierLetterDate} onChange={(event) => setDocument("carrierLetterDate", event.target.value)} /></div><div><Label htmlFor="klutch-carrier-claim">Carrier claim number</Label><Input id="klutch-carrier-claim" value={docForm.carrierClaimNumber} onChange={(event) => setDocument("carrierClaimNumber", event.target.value)} /></div><div><Label htmlFor="klutch-carrier-address">Carrier address</Label><Textarea id="klutch-carrier-address" rows={2} value={docForm.carrierAddress} onChange={(event) => setDocument("carrierAddress", event.target.value)} /></div><p className="md:col-span-2 text-xs text-slate-500">Preview and the created-not-sent record are available without a linked declarations or denial document.</p></div>}
          {documentType === "cancellation_notice" && <div className="grid gap-4 md:grid-cols-2"><div><Label htmlFor="klutch-cancellation-date">Lease terminated — effective date <span className="text-rose-600">*</span></Label><Input id="klutch-cancellation-date" type="date" value={docForm.cancellationDate} onChange={(event) => setDocument("cancellationDate", event.target.value)} /></div><div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><strong>Only allowed cancellation reason:</strong> Lease terminated. Creating the notice atomically marks the policy cancelled and stores the effective date.</div></div>}
          {documentType === "endorsement" && <div className="rounded-md border border-[#0B5458]/20 bg-white p-3 text-sm text-slate-700">KIC-END-002 is available for preview and created-not-sent recording without a manager-approval or carrier-evidence requirement.</div>}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4"><p className="text-sm text-slate-600"><CheckCircle2 className="mr-1 inline h-4 w-4 text-emerald-600" />Preview opens an on-page PDF with <strong>Open/Print</strong> and <strong>Download</strong> controls without changing policy or audit records. The separate record action logs <strong>CREATED_NOT_SENT</strong>; it never sends the document.</p><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={previewDocument} disabled={documentMutation.isPending || cancellationMutation.isPending}><Eye className="mr-2 h-4 w-4" />Preview PDF</Button><Button className="bg-[#003B40] hover:bg-[#0B5458]" onClick={() => createDocument("download")} disabled={documentMutation.isPending || cancellationMutation.isPending}><Download className="mr-2 h-4 w-4" />Create record & download</Button></div></div>
        </div>}
      </section>

      {previewUrl && <section className="rounded-xl border border-[#0B5458]/25 bg-white p-4 shadow-sm"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-[#0B5458]">PDF preview</p><h3 className="font-semibold text-slate-900">{KLUTCH_DOCUMENT_LABELS[documentType]}</h3><p className="mt-1 text-xs text-slate-600">Use <strong>Open / Print</strong> for the browser’s native print dialog, including Save to PDF.</p></div><div className="flex flex-wrap gap-2"><a href={previewUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-md border border-[#0B5458] px-3 text-sm font-medium text-[#003B40] transition hover:bg-[#EDF7F3]"><Printer className="mr-2 h-4 w-4" />Open / Print</a><a href={previewUrl} download={`${previewFilename}.pdf`} className="inline-flex h-9 items-center rounded-md bg-[#003B40] px-3 text-sm font-medium text-white transition hover:bg-[#0B5458]"><Download className="mr-2 h-4 w-4" />Download PDF</a><Button variant="outline" size="sm" onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }}><X className="mr-2 h-4 w-4" />Close preview</Button></div></div><iframe title="Klutch policy document preview" src={previewUrl} className="h-[780px] w-full rounded border border-slate-200" /></section>}
    </div>
  );
}
