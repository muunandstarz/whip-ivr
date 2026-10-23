import { useEffect, useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import { AlertTriangle, BadgeCheck, Building2, CheckCircle2, Download, Eye, FileCheck2, FileText, Landmark, Loader2, Printer, RefreshCw, ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { KLUTCH_DOCUMENT_LABELS, TNC_PERIODS, type KlutchDocumentType, type KlutchState } from "@shared/klutchPolicy";

const KLUTCH_LOGO_URL = "/manus-storage/klutch-insurance-logo_c2ff6576.png";
const NAVY = "#003B40";
const LIME = "#CBEA4B";
const GREY = "#6B7280";
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
  memberAddress?: string;
  memberStreet?: string;
  memberCity?: string;
  memberState?: KlutchState;
  memberZip?: string;
  memberEmail?: string;
  vehicle: string;
  vin?: string;
  effectiveOn: string;
  expiresOn: string;
  state: KlutchState;
  coverages: CoverageRow[];
  totalPremium: number;
  tncUseNote: string;
};

type CoverageRow = { label: string; limit: string; deductible?: string; premium: number };

type DocForm = {
  claimNumber: string;
  dateOfLoss: string;
  tncName: string;
  tncPeriod: string;
  supportingRecords: string;
  tncCarrierName: string;
  tncCarrierClaimNumber: string;
  carrierName: string;
  carrierAddress: string;
  adjusterName: string;
  carrierClaimNumber: string;
  cancellationDate: string;
  carrierRequestEvidence: string;
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

function defaultLimits(state: KlutchState) {
  const rules: Record<KlutchState, { bi: string; pd: string; pip?: string; umRejectable?: boolean }> = {
    MD: { bi: "$30,000 / $60,000", pd: "$15,000", pip: "$2,500" },
    VA: { bi: "$25,000 / $50,000", pd: "$20,000", umRejectable: true },
    PA: { bi: "$15,000 / $30,000", pd: "$5,000", pip: "$5,000" },
    FL: { bi: "$10,000 / $20,000", pd: "$10,000", pip: "$10,000" },
    IL: { bi: "$25,000 / $50,000", pd: "$20,000", umRejectable: true },
    GA: { bi: "$25,000 / $50,000", pd: "$25,000", umRejectable: true },
    MA: { bi: "$20,000 / $40,000", pd: "$5,000", pip: "$8,000" },
    TX: { bi: "$30,000 / $60,000", pd: "$25,000", umRejectable: true },
  };
  return rules[state];
}

function buildCoverages(state: KlutchState, annualPremium: number, pipWaived: boolean, umRejected: boolean): CoverageRow[] {
  const rule = defaultLimits(state);
  const raw: Array<Omit<CoverageRow, "premium"> & { weight: number }> = [
    { label: "Bodily Injury Liability", limit: rule.bi, weight: 30 },
    { label: "Property Damage Liability", limit: rule.pd, weight: 12 },
    { label: "Personal Injury Protection", limit: rule.pip ? (pipWaived ? "Waived" : rule.pip) : "Waived", weight: rule.pip && !pipWaived ? 8 : 0 },
    { label: "Uninsured Motorist", limit: umRejected && rule.umRejectable ? "Rejected" : rule.bi, weight: umRejected && rule.umRejectable ? 0 : 7 },
    { label: "Underinsured Motorist", limit: umRejected && rule.umRejectable ? "Rejected" : rule.bi, weight: umRejected && rule.umRejectable ? 0 : 5 },
    { label: "UMPD", limit: "Not included", weight: 0 },
    { label: "Collision", limit: "Actual Cash Value", deductible: "$500", weight: 25 },
    { label: "Comprehensive", limit: "Actual Cash Value", deductible: "$500", weight: 13 },
  ];
  const activeWeight = raw.reduce((total, item) => total + item.weight, 0) || 1;
  let allocated = 0;
  const activeRows = raw.filter((row) => row.weight > 0);
  return raw.map((row) => {
    let premium = 0;
    if (row.weight > 0) {
      premium = row === activeRows[activeRows.length - 1]
        ? Math.max(0, Math.round((annualPremium - allocated) * 100) / 100)
        : Math.round((annualPremium * row.weight / activeWeight) * 100) / 100;
      allocated = Math.round((allocated + premium) * 100) / 100;
    }
    return { label: row.label, limit: row.limit, deductible: row.deductible, premium };
  });
}

function addDraftPreviewNotice(doc: jsPDF) {
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);
    doc.setDrawColor("#F59E0B");
    doc.setFillColor("#FFFBEB");
    doc.roundedRect(66, 266, 83, 5.5, 1.5, 1.5, "FD");
    doc.setTextColor("#92400E");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.6);
    doc.text("DRAFT PREVIEW — NOT SAVED OR SENT", 107.5, 269.6, { align: "center" });
  }
  doc.setTextColor("#111827");
}

function openPdf(doc: jsPDF, filename: string, mode: "preview" | "download", setPreview: (value: string | null) => void, isDraft = false) {
  if (isDraft) addDraftPreviewNotice(doc);
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

async function addKlutchHeader(doc: jsPDF, title: string, showPage = true) {
  try {
    const response = await fetch(KLUTCH_LOGO_URL);
    if (!response.ok) throw new Error("logo unavailable");
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      response.blob().then((blob) => reader.readAsDataURL(blob), reject);
    });
    doc.addImage(dataUrl, "PNG", 15, 11, 43, 15.2);
  } catch {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(NAVY);
    doc.setFontSize(16);
    doc.text("KLUTCH INSURANCE", 15, 20);
  }
  doc.setDrawColor(NAVY);
  doc.setLineWidth(0.35);
  doc.line(15, 31, 200, 31);
  doc.setTextColor(NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(title.toUpperCase(), 15, 41);
  doc.setTextColor("#111827");
  if (showPage) addKlutchFooter(doc);
}

function addKlutchFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  const page = doc.getCurrentPageInfo().pageNumber;
  doc.setDrawColor("#D1D5DB");
  doc.setLineWidth(0.25);
  doc.line(15, 275, 200, 275);
  doc.setTextColor(GREY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text("Klutch Insurance Company  •  NAIC 17966  •  Created for policy or claim handling — not sent", 15, 281);
  doc.text(`Page ${page} of ${pageCount}`, 200, 281, { align: "right" });
  doc.setTextColor("#111827");
}

function addFooterAllPages(doc: jsPDF) {
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);
    doc.setDrawColor("#D1D5DB");
    doc.setLineWidth(0.25);
    doc.line(15, 275, 200, 275);
    doc.setTextColor(GREY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text("Klutch Insurance Company  •  NAIC 17966  •  Created for policy or claim handling — not sent", 15, 281);
    doc.text(`Page ${page} of ${total}`, 200, 281, { align: "right" });
  }
  doc.setTextColor("#111827");
}

function writeBody(doc: jsPDF, text: string, x: number, y: number, width = 180, lineHeight = 7) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.2);
  const lines = doc.splitTextToSize(text, width) as string[];
  // jsPDF's lineHeightFactor is relative to the font's physical height, not
  // its point size. Use the requested millimetre leading so multi-line legal
  // text never collapses into overlapping lines.
  const lineHeightFactor = Math.max(1.2, lineHeight / (10.2 * 0.3528));
  doc.text(lines, x, y, { lineHeightFactor });
  return y + lines.length * lineHeight;
}

function box(doc: jsPDF, title: string, rows: Array<[string, string]>, y: number) {
  const height = 10 + Math.ceil(rows.length / 2) * 12;
  doc.setFillColor("#F8FAFC");
  doc.setDrawColor("#D1D5DB");
  doc.roundedRect(15, y, 185, height, 2, 2, "FD");
  doc.setTextColor(NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(title.toUpperCase(), 20, y + 7);
  rows.forEach(([label, value], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = col === 0 ? 20 : 110;
    const itemY = y + 14 + row * 12;
    doc.setTextColor(GREY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(label.toUpperCase(), x, itemY);
    doc.setTextColor("#111827");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.7);
    doc.text(String(value || "—"), x, itemY + 5);
  });
  doc.setTextColor("#111827");
  return y + height + 7;
}

function addSignature(doc: jsPDF, name: string, title: string, y: number) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Sincerely,", 15, y);
  doc.setFont("helvetica", "bold");
  doc.text(name, 15, y + 16);
  doc.setFont("helvetica", "normal");
  doc.text(title, 15, y + 22);
  doc.text("Klutch Insurance Company", 15, y + 28);
}

function writeMemberMailingAddress(doc: jsPDF, terms: PolicyTerms, y: number) {
  const lines = [terms.memberName, ...memberMailingLines(terms)].filter(Boolean);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.2);
  doc.text(lines, 15, y, { lineHeightFactor: 1.45 });
  return y + Math.max(13, lines.length * 5.8) + 4;
}

export default function KlutchPolicyDocumentsWorkspace({ initialState = "MD" }: { initialState?: string }) {
  const { user } = useAuth();
  const { impersonating } = useImpersonation();
  const utils = trpc.useUtils();
  const policiesQuery = trpc.klutchPolicies.list.useQuery({ limit: 100 });
  const issueMutation = trpc.klutchPolicies.issue.useMutation({ onSuccess: () => utils.klutchPolicies.list.invalidate() });
  const documentMutation = trpc.klutchPolicies.recordDocument.useMutation();
  const cancellationMutation = trpc.klutchPolicies.cancelAndRecord.useMutation({ onSuccess: () => utils.klutchPolicies.list.invalidate() });
  const approvalMutation = trpc.klutchPolicies.approveEndorsement.useMutation();
  const [documentType, setDocumentType] = useState<KlutchDocumentType>("declarations");
  const [selectedPolicyId, setSelectedPolicyId] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFilename, setPreviewFilename] = useState("Klutch_Document");
  const [previewIsDraft, setPreviewIsDraft] = useState(false);
  const [issueKey] = useState(() => crypto.randomUUID());
  const policyDetailQuery = trpc.klutchPolicies.get.useQuery({ policyId: selectedPolicyId ?? 1 }, { enabled: Boolean(selectedPolicyId) });
  const documentRequiresClaim = (["tnc_denial", "carrier_position", "endorsement"] as KlutchDocumentType[]).includes(documentType);
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
    annualPremium: "",
    pipWaived: false,
    umRejected: false,
  });
  const [docForm, setDocForm] = useState<DocForm>({
    claimNumber: "",
    dateOfLoss: "",
    tncName: "",
    tncPeriod: "",
    supportingRecords: "",
    tncCarrierName: "",
    tncCarrierClaimNumber: "",
    carrierName: "",
    carrierAddress: "",
    adjusterName: "",
    carrierClaimNumber: "",
    cancellationDate: "",
    carrierRequestEvidence: "",
  });
  const activePolicy = useMemo(() => (policiesQuery.data ?? []).find((policy) => policy.id === selectedPolicyId) as PolicyRecord | undefined, [policiesQuery.data, selectedPolicyId]);
  const signer = impersonating?.name || user?.name || user?.email || "Klutch Claims Handler";
  const signerTitle = impersonating ? "Claim Handler" : user?.role === "admin" ? "Claims Administration" : "Claim Handler";
  const expiresOn = addYear(issueForm.effectiveOn);
  const annualPremium = Number(issueForm.annualPremium) || 0;
  const issueCoverages = buildCoverages(issueForm.state, annualPremium, issueForm.pipWaived, issueForm.umRejected);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const setIssue = <K extends keyof typeof issueForm>(key: K, value: (typeof issueForm)[K]) => setIssueForm((current) => ({ ...current, [key]: value }));
  const setDocument = <K extends keyof DocForm>(key: K, value: DocForm[K]) => setDocForm((current) => ({ ...current, [key]: value }));

  const buildDraftPolicy = (): PolicyRecord => ({
    id: 0,
    policyNumber: "DRAFT — NOT ISSUED",
    leaseId: issueForm.leaseId || "Not issued",
    state: issueForm.state,
    effectiveOn: issueForm.effectiveOn,
    expiresOn,
    status: "active",
    cancelledOn: null,
    cancellationReason: null,
    terms: {
      leaseId: issueForm.leaseId || "Not issued",
      memberName: issueForm.memberName || "Draft member",
      memberStreet: issueForm.memberStreet,
      memberCity: issueForm.memberCity,
      memberState: issueForm.memberState,
      memberZip: issueForm.memberZip,
      memberEmail: issueForm.memberEmail,
      vehicle: issueForm.vehicle || "Draft vehicle",
      vin: issueForm.vin,
      effectiveOn: issueForm.effectiveOn,
      expiresOn,
      state: issueForm.state,
      coverages: issueCoverages,
      totalPremium: issueCoverages.reduce((sum, row) => sum + row.premium, 0),
      tncUseNote: "Draft preview only — no policy has been issued.",
    },
  });

  async function issuePolicy() {
    if (!issueForm.leaseId || !issueForm.memberName || !issueForm.vehicle || !annualPremium) {
      toast.error("Whip claim number, member name, vehicle, and annual premium are required before issuing a policy.");
      return;
    }
    try {
      const terms: PolicyTerms = {
        leaseId: issueForm.leaseId,
        memberName: issueForm.memberName,
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
        coverages: issueCoverages,
        totalPremium: issueCoverages.reduce((sum, row) => sum + row.premium, 0),
        tncUseNote: "This policy applies during permitted Transportation Network Company use, subject to its terms, conditions, and endorsements.",
      };
      const policy = await issueMutation.mutateAsync({ issueRequestKey: issueKey, leaseId: issueForm.leaseId, state: issueForm.state, effectiveOn: issueForm.effectiveOn, expiresOn, terms });
      setSelectedPolicyId(policy.id);
      toast.success(`Policy ${policy.policyNumber} issued and saved. No document was sent.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to issue policy.");
    }
  }

  async function previewDraftDeclarations() {
    if (!issueForm.memberName || !issueForm.vehicle || !annualPremium) {
      toast.error("Enter the member name, vehicle, and annual premium to preview a draft declaration.");
      return;
    }
    try {
      const document = await buildPdf("declarations", buildDraftPolicy());
      const filename = cleanFilename(`Klutch_Draft_Policy_Declarations_${issueForm.memberName}`);
      setPreviewFilename(filename);
      setPreviewIsDraft(true);
      openPdf(document, filename, "preview", setPreviewUrl, true);
      toast.info("Draft preview only — no policy number, audit record, email, or delivery was created.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to build the draft declaration preview.");
    }
  }

  const buildPdf = async (kind: KlutchDocumentType, policy: PolicyRecord, klutchClaimNumber?: string | null) => {
    const doc = new jsPDF({ unit: "mm", format: "letter" });
    const terms = policy.terms;
    const policyRows: Array<[string, string]> = [["Policy number", policy.policyNumber], ["Policy term", `${prettyDate(policy.effectiveOn)} — ${prettyDate(policy.expiresOn)}`], ["Named insured", terms.memberName], ["Vehicle", terms.vehicle], ["Whip claim reference", policy.leaseId], ["NAIC", "17966"]];
    if (kind === "declarations") {
      await addKlutchHeader(doc, "Policy Declarations");
      let y = box(doc, "Policy summary", policyRows, 49);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.2);
      const note = "Carrier / investigation use only. This declaration is created for the policy file and is not sent to the member. It does not replace the policy contract.";
      doc.setTextColor(GREY);
      doc.text(doc.splitTextToSize(note, 180), 15, y, { lineHeightFactor: 1.45 });
      doc.setTextColor("#111827");
      y += 18;
      doc.setFillColor(NAVY);
      doc.rect(15, y, 185, 8, "F");
      doc.setTextColor("#FFFFFF");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text("COVERAGE", 19, y + 5.2);
      doc.text("LIMIT / ELECTION", 84, y + 5.2);
      doc.text("DEDUCTIBLE", 138, y + 5.2);
      doc.text("PREMIUM", 196, y + 5.2, { align: "right" });
      doc.setTextColor("#111827");
      y += 8;
      terms.coverages.forEach((coverage, index) => {
        const rowHeight = 9;
        if (index % 2 === 0) { doc.setFillColor("#F8FAFC"); doc.rect(15, y, 185, rowHeight, "F"); }
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.4);
        doc.text(coverage.label, 19, y + 5.7);
        doc.text(coverage.limit, 84, y + 5.7);
        doc.text(coverage.deductible || "—", 138, y + 5.7);
        doc.text(coverage.premium ? money(coverage.premium) : "—", 196, y + 5.7, { align: "right" });
        y += rowHeight;
      });
      doc.setDrawColor(NAVY); doc.setLineWidth(0.35); doc.line(15, y + 1, 200, y + 1);
      doc.setFont("helvetica", "bold"); doc.setFontSize(9.4); doc.text("TOTAL ANNUAL PREMIUM", 138, y + 8); doc.text(money(terms.totalPremium), 196, y + 8, { align: "right" });
      doc.addPage();
      await addKlutchHeader(doc, "Policy Declarations — Continued", false);
      y = 50;
      y = box(doc, "Policy conditions", [["Lessor / Loss Payee", "Metrocars Leasing Corp"], ["TNC use", "Permitted subject to policy terms"], ["Policy documents", "Declarations, applicable endorsements, and policy contract"], ["Status", policy.status === "active" ? "Active" : policy.status]], y);
      y = writeBody(doc, "This declaration summarizes selected coverages for the stated 12-month policy term. It is not a bill, a coverage verification for a third party, or an instruction to release payment. Policy terms, conditions, exclusions, endorsements, and applicable law control.", 15, y + 4, 180, 7);
      y += 12;
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("Authorized signature", 15, y);
      doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.text("Bobby Taheri", 15, y + 15); doc.text("Authorized Representative", 15, y + 21); doc.text("Klutch Insurance Company", 15, y + 27);
      addFooterAllPages(doc);
      return doc;
    }

    if (kind === "tnc_denial") {
      await addKlutchHeader(doc, "TNC Coverage Denial");
      let y = writeMemberMailingAddress(doc, terms, 49);
      const denialRows: Array<[string, string]> = [...policyRows.slice(0, 2), ["Date of loss", prettyDate(docForm.dateOfLoss)], ["Klutch claim", klutchClaimNumber || "Created with claim-file record"], ["TNC platform", docForm.tncName], ["TNC period", `${docForm.tncPeriod} — ${TNC_PERIODS[docForm.tncPeriod as keyof typeof TNC_PERIODS]}`]];
      if (docForm.tncCarrierName) denialRows.push(["TNC insurer", docForm.tncCarrierName]);
      if (docForm.tncCarrierClaimNumber) denialRows.push(["TNC insurer claim", docForm.tncCarrierClaimNumber]);
      y = box(doc, "Claim and policy details", denialRows, y);
      y = writeBody(doc, `Dear ${terms.memberName},`, 15, y + 5);
      y += 6;
      y = writeBody(doc, `We reviewed the supporting records identified in the claim file concerning the incident on ${prettyDate(docForm.dateOfLoss)}. Those records identify ${docForm.tncName} activity during Period ${docForm.tncPeriod}: ${TNC_PERIODS[docForm.tncPeriod as keyof typeof TNC_PERIODS]}.`, 15, y, 180, 7);
      y += 7;
      y = writeBody(doc, "Based on the policy terms and the reported Transportation Network Company activity, Klutch first-party coverage is not available for this loss. The Transportation Network Company platform’s insurance carrier may be the primary source of coverage for bodily-injury-related benefits during the applicable period.", 15, y, 180, 7);
      if (docForm.tncCarrierName || docForm.tncCarrierClaimNumber) {
        y += 7;
        y = writeBody(doc, `For claim-file reference, the reported TNC insurer is ${docForm.tncCarrierName || "not yet identified"}${docForm.tncCarrierClaimNumber ? `, claim number ${docForm.tncCarrierClaimNumber}` : ""}.`, 15, y, 180, 7);
      }
      y += 7;
      y = writeBody(doc, "This notice is created for the claim file and is not sent to the member by this workspace. It is addressed to the member for the record and copied to Metrocars Leasing Corp. No payment determination or response deadline is stated in this notice.", 15, y, 180, 7);
      addSignature(doc, signer, signerTitle, Math.min(y + 12, 242));
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(GREY); doc.text("cc: Metrocars Leasing Corp", 15, 264); doc.setTextColor("#111827");
      return doc;
    }

    if (kind === "carrier_position") {
      await addKlutchHeader(doc, "Coverage Position — TNC Activity");
      let y = box(doc, "Claim and policy details", [["Policy number", policy.policyNumber], ["Klutch claim", klutchClaimNumber || "Created with claim-file record"], ["Date of loss", prettyDate(docForm.dateOfLoss)], ["TNC period", `${docForm.tncPeriod} — ${TNC_PERIODS[docForm.tncPeriod as keyof typeof TNC_PERIODS]}`]], 49);
      doc.setFont("helvetica", "normal"); doc.setFontSize(10.2); doc.text(docForm.carrierName, 15, y + 4); y += 10;
      doc.text((docForm.carrierAddress || "").split("\n"), 15, y, { lineHeightFactor: 1.5 }); y += Math.max(14, docForm.carrierAddress.split("\n").length * 6) + 5;
      y = writeBody(doc, `Re: ${terms.memberName} | Your claim: ${docForm.carrierClaimNumber} | Klutch policy: ${policy.policyNumber}`, 15, y, 180, 7);
      y += 5;
      y = writeBody(doc, `Dear ${docForm.adjusterName || "Claims Adjuster"},`, 15, y);
      y += 7;
      y = writeBody(doc, `Klutch Insurance Company provides this coverage position concerning the ${docForm.tncName} activity reported for ${prettyDate(docForm.dateOfLoss)}. The supporting records identify Period ${docForm.tncPeriod}: ${TNC_PERIODS[docForm.tncPeriod as keyof typeof TNC_PERIODS]}. Klutch first-party coverage is not available during this documented TNC activity; please evaluate the platform coverage applicable to the reported period.`, 15, y, 180, 7);
      y += 7;
      y = writeBody(doc, "Enclosed are the current Klutch policy declarations and the TNC coverage denial generated for this same claim. This position is created for the claim file and is not sent by this workspace.", 15, y, 180, 7);
      addSignature(doc, signer, signerTitle, Math.min(y + 12, 238));
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(GREY); doc.text("Enclosures: Klutch Policy Declarations; TNC Coverage Denial", 15, 264); doc.setTextColor("#111827");
      return doc;
    }

    if (kind === "cancellation_notice") {
      await addKlutchHeader(doc, "Policy Cancellation Notice");
      let y = writeMemberMailingAddress(doc, terms, 49);
      y = box(doc, "Policy details", [["Policy number", policy.policyNumber], ["Whip claim reference", policy.leaseId], ["Effective cancellation", prettyDate(docForm.cancellationDate)], ["Reason", "Lease terminated"]], y);
      y = writeBody(doc, `Dear ${terms.memberName},`, 15, y + 5);
      y += 7;
      y = writeBody(doc, `This notice confirms that Klutch policy ${policy.policyNumber} is cancelled effective ${prettyDate(docForm.cancellationDate)} because the underlying lease has terminated. The policy is subject to all applicable terms, conditions, and legal requirements.`, 15, y, 180, 7);
      y += 7;
      y = writeBody(doc, "This notice is created for the policy file and is not sent to the member by this workspace. A copy is addressed for the record to Metrocars Leasing Corp. No payment instruction or hard payment date is included.", 15, y, 180, 7);
      addSignature(doc, signer, signerTitle, Math.min(y + 15, 240));
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(GREY); doc.text("cc: Metrocars Leasing Corp", 15, 264); doc.setTextColor("#111827");
      return doc;
    }

    await addKlutchHeader(doc, "Endorsement KIC-END-002");
    let y = box(doc, "Endorsement details", [["Policy number", policy.policyNumber], ["Form", "KIC-END-002"], ["Edition", "Ed. 07/26"], ["Effective", "July 1, 2026"]], 49);
    y = writeBody(doc, "This endorsement is attached to and forms part of the policy identified above. Except as expressly modified by this endorsement, all other policy terms, conditions, limitations, and exclusions remain unchanged.", 15, y + 6, 180, 7);
    y += 8;
    y = writeBody(doc, "This form is issued only in response to a documented carrier request after verified manager approval. It is created for the policy or claim file and is not sent by this workspace.", 15, y, 180, 7);
    addSignature(doc, signer, signerTitle, Math.min(y + 16, 240));
    return doc;
  };

  async function createDocument(mode: "preview" | "download") {
    if (!activePolicy) { toast.error("Issue or select a Klutch policy first."); return; }
    const sourceClaimNumber = docForm.claimNumber || activePolicy.leaseId;
    if (documentRequiresClaim && !sourceClaimNumber) { toast.error("Enter the Whip / SnapSheet claim number before creating this claim document."); return; }
    if (documentType === "cancellation_notice" && !docForm.cancellationDate) { toast.error("Enter the lease-termination effective date."); return; }
    try {
      let result: { klutchClaimNumber?: string | null; deliveryStatus: string } | undefined;
      const snapshot = { ...docForm, sourceClaimNumber, policyNumber: activePolicy.policyNumber, whipClaimNumber: activePolicy.leaseId, signer, signerTitle };
      if (documentType === "cancellation_notice") {
        result = await cancellationMutation.mutateAsync({ policyId: activePolicy.id, cancelledOn: docForm.cancellationDate, claimNumber: sourceClaimNumber || undefined, documentSnapshot: snapshot });
        activePolicy.status = "cancelled";
      } else {
        if (documentType === "endorsement") {
          if (user?.role !== "admin") { toast.error("Only a verified manager can approve KIC-END-002."); return; }
          await approvalMutation.mutateAsync({ policyId: activePolicy.id, claimNumber: sourceClaimNumber, carrierRequestEvidence: docForm.carrierRequestEvidence });
        }
        result = await documentMutation.mutateAsync({ policyId: activePolicy.id, documentType, claimNumber: sourceClaimNumber || undefined, snapshot });
      }
      const document = await buildPdf(documentType, activePolicy, result?.klutchClaimNumber);
      const filename = cleanFilename(`Klutch_${KLUTCH_DOCUMENT_LABELS[documentType]}_${activePolicy.policyNumber}_${result?.klutchClaimNumber || sourceClaimNumber || "Policy"}`);
      setPreviewFilename(filename);
      setPreviewIsDraft(false);
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
          <div className="flex gap-3 rounded-lg bg-white p-3 shadow-sm"><Eye className="mt-0.5 h-5 w-5 shrink-0 text-[#0B5458]" /><p className="text-sm text-slate-700"><strong className="block text-slate-900">Preview before you issue</strong>Use the draft declaration preview to inspect and print/save a PDF without creating a policy, document audit record, email, or delivery.</p></div>
          <div className="flex gap-3 rounded-lg bg-white p-3 shadow-sm"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-[#0B5458]" /><p className="text-sm text-slate-700"><strong className="block text-slate-900">Created is not sent</strong>After issuance, document actions retain a created-not-sent audit only. Verify facts, supporting records, and any separate delivery step before communicating with a member or carrier.</p></div>
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
          <div className="grid gap-4 md:grid-cols-3"><div><Label htmlFor="klutch-premium">Annual premium ($)</Label><Input id="klutch-premium" inputMode="decimal" value={issueForm.annualPremium} onChange={(event) => setIssue("annualPremium", event.target.value)} /><p className="mt-1 text-xs text-slate-500">Allocated across active coverages and stored with the issued term.</p></div><div className="flex items-end gap-2 pb-2"><Checkbox id="klutch-pip-waived" checked={issueForm.pipWaived} onCheckedChange={(checked) => setIssue("pipWaived", Boolean(checked))} disabled={issueForm.state !== "MD"} /><Label htmlFor="klutch-pip-waived" className="text-sm">PIP waived (MD only)</Label></div><div className="flex items-end gap-2 pb-2"><Checkbox id="klutch-um-rejected" checked={issueForm.umRejected} onCheckedChange={(checked) => setIssue("umRejected", Boolean(checked))} disabled={!defaultLimits(issueForm.state).umRejectable} /><Label htmlFor="klutch-um-rejected" className="text-sm">UM / UIM rejected where eligible</Label></div></div>
          <div className="overflow-x-auto rounded-md border border-slate-200 bg-white"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-[#003B40] text-white"><tr><th className="px-3 py-2 font-semibold">Coverage</th><th className="px-3 py-2 font-semibold">Limit / election</th><th className="px-3 py-2 font-semibold">Deductible</th><th className="px-3 py-2 text-right font-semibold">Premium</th></tr></thead><tbody>{issueCoverages.map((coverage) => <tr key={coverage.label} className="border-t border-slate-100"><td className="px-3 py-2">{coverage.label}</td><td className="px-3 py-2">{coverage.limit}</td><td className="px-3 py-2">{coverage.deductible || "—"}</td><td className="px-3 py-2 text-right">{coverage.premium ? money(coverage.premium) : "—"}</td></tr>)}<tr className="border-t-2 border-[#003B40] font-semibold"><td colSpan={3} className="px-3 py-2 text-right">Total annual premium</td><td className="px-3 py-2 text-right">{money(issueCoverages.reduce((sum, coverage) => sum + coverage.premium, 0))}</td></tr></tbody></table></div>
          <div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-2xl text-xs text-slate-500">Preview the declaration as often as needed before issuing. A draft preview does not create a policy number, audit record, email, or delivery. Issuing creates the permanent server record; then all five document actions become available below.</p><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={previewDraftDeclarations}><Eye className="mr-2 h-4 w-4" />Preview draft declaration</Button><Button className="bg-[#003B40] hover:bg-[#0B5458]" onClick={issuePolicy} disabled={issueMutation.isPending}>{issueMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Issue 12-month policy</Button></div></div>
        </div>}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4"><p className="text-xs font-semibold uppercase tracking-wide text-[#0B5458]">Step 2</p><h3 className="text-lg font-semibold text-slate-900">Choose a Klutch document</h3><p className="mt-1 text-sm text-slate-600">All five documents are saved as created-not-sent claim-file audit records with the policy and Klutch claim identifiers.</p></div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">{(Object.keys(KLUTCH_DOCUMENT_LABELS) as KlutchDocumentType[]).map((kind) => <button type="button" key={kind} onClick={() => setDocumentType(kind)} className={`rounded-lg border p-3 text-left transition ${documentType === kind ? "border-[#0B5458] bg-[#EDF7F3] ring-1 ring-[#0B5458]" : "border-slate-200 bg-white hover:border-[#0B5458]/50"}`}><span className="mb-2 flex h-7 w-7 items-center justify-center rounded bg-[#003B40] text-[#CBEA4B]">{kind === "declarations" ? <FileText className="h-4 w-4" /> : kind === "tnc_denial" ? <ShieldAlert className="h-4 w-4" /> : kind === "carrier_position" ? <Building2 className="h-4 w-4" /> : kind === "cancellation_notice" ? <Landmark className="h-4 w-4" /> : <BadgeCheck className="h-4 w-4" />}</span><span className="text-sm font-semibold text-slate-900">{KLUTCH_DOCUMENT_LABELS[kind]}</span></button>)}</div>
        {!activePolicy ? <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle className="mr-2 inline h-4 w-4" />Issue or select a policy before preparing a document.</div> : <div className="mt-5 space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-4 md:grid-cols-3"><div><Label htmlFor="klutch-claim-number">Whip / SnapSheet claim number {documentRequiresClaim && <span className="text-rose-600">*</span>}</Label><Input id="klutch-claim-number" value={docForm.claimNumber || activePolicy.leaseId} onChange={(event) => setDocument("claimNumber", event.target.value)} placeholder="GB-0000-000000-000000" /><p className="mt-1 text-xs text-slate-500">The server maps this source claim to a separate Klutch claim number.</p></div><div><Label htmlFor="klutch-loss-date">Date of loss {(["tnc_denial", "carrier_position"] as KlutchDocumentType[]).includes(documentType) && <span className="text-rose-600">*</span>}</Label><Input id="klutch-loss-date" type="date" value={docForm.dateOfLoss} onChange={(event) => setDocument("dateOfLoss", event.target.value)} /></div><div className="rounded-md border border-[#0B5458]/20 bg-white px-3 py-2 text-sm"><p className="text-xs font-semibold uppercase tracking-wide text-[#0B5458]">Signer</p><p className="font-medium text-slate-900">{signer}</p><p className="text-xs text-slate-600">{signerTitle}</p></div></div>
          {(["tnc_denial", "carrier_position"] as KlutchDocumentType[]).includes(documentType) && <>
            <div className="grid gap-4 md:grid-cols-2">
              <div><Label htmlFor="klutch-tnc-name">TNC platform <span className="text-rose-600">*</span></Label><Input id="klutch-tnc-name" value={docForm.tncName} onChange={(event) => setDocument("tncName", event.target.value)} placeholder="Uber, Lyft, or other platform" /></div>
              <div><Label htmlFor="klutch-tnc-period">TNC period <span className="text-rose-600">*</span></Label><Select value={docForm.tncPeriod} onValueChange={(value) => setDocument("tncPeriod", value)}><SelectTrigger id="klutch-tnc-period"><SelectValue placeholder="Select the documented period" /></SelectTrigger><SelectContent><SelectItem value="0">0 — Personal use (cannot generate a denial)</SelectItem>{Object.entries(TNC_PERIODS).map(([key, value]) => <SelectItem key={key} value={key}>{key} — {value}</SelectItem>)}</SelectContent></Select></div>
            </div>
            {documentType === "tnc_denial" && <div className="rounded-lg border border-[#0B5458]/15 bg-white p-3"><p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#0B5458]">Optional TNC insurer reference</p><div className="grid gap-4 md:grid-cols-2"><div><Label htmlFor="klutch-tnc-carrier">TNC insurer name</Label><Input id="klutch-tnc-carrier" value={docForm.tncCarrierName} onChange={(event) => setDocument("tncCarrierName", event.target.value)} placeholder="Platform insurer, if known" /></div><div><Label htmlFor="klutch-tnc-carrier-claim">TNC insurer claim number</Label><Input id="klutch-tnc-carrier-claim" value={docForm.tncCarrierClaimNumber} onChange={(event) => setDocument("tncCarrierClaimNumber", event.target.value)} placeholder="If known" /></div></div><p className="mt-2 text-xs text-slate-500">These references print only when entered; they do not state or imply a coverage determination by that insurer.</p></div>}
            <div><Label htmlFor="klutch-supporting-records">Supporting-record reference <span className="text-rose-600">*</span></Label><Textarea id="klutch-supporting-records" rows={2} value={docForm.supportingRecords} onChange={(event) => setDocument("supportingRecords", event.target.value)} placeholder="Identify the trip/activity record, statement, report, or other supporting records reviewed." /></div>
            {docForm.tncPeriod === "0" && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900"><ShieldAlert className="mr-2 inline h-4 w-4" />Period 0 is personal use. This workflow blocks TNC denial creation and saves no document or delivery record.</div>}
          </>}
          {documentType === "carrier_position" && <div className="grid gap-4 md:grid-cols-2"><div><Label htmlFor="klutch-carrier-name">Carrier name <span className="text-rose-600">*</span></Label><Input id="klutch-carrier-name" value={docForm.carrierName} onChange={(event) => setDocument("carrierName", event.target.value)} /></div><div><Label htmlFor="klutch-adjuster">Carrier adjuster <span className="text-rose-600">*</span></Label><Input id="klutch-adjuster" value={docForm.adjusterName} onChange={(event) => setDocument("adjusterName", event.target.value)} /></div><div><Label htmlFor="klutch-carrier-claim">Carrier claim number <span className="text-rose-600">*</span></Label><Input id="klutch-carrier-claim" value={docForm.carrierClaimNumber} onChange={(event) => setDocument("carrierClaimNumber", event.target.value)} /></div><div><Label htmlFor="klutch-carrier-address">Carrier address <span className="text-rose-600">*</span></Label><Textarea id="klutch-carrier-address" rows={2} value={docForm.carrierAddress} onChange={(event) => setDocument("carrierAddress", event.target.value)} /></div><p className="md:col-span-2 text-xs text-slate-500">The carrier position letter is available only after a current declarations page and TNC denial are created for this same policy and SnapSheet claim. It lists both as enclosures; nothing is sent automatically.</p></div>}
          {documentType === "cancellation_notice" && <div className="grid gap-4 md:grid-cols-2"><div><Label htmlFor="klutch-cancellation-date">Lease terminated — effective date <span className="text-rose-600">*</span></Label><Input id="klutch-cancellation-date" type="date" value={docForm.cancellationDate} onChange={(event) => setDocument("cancellationDate", event.target.value)} /></div><div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><strong>Only allowed cancellation reason:</strong> Lease terminated. Creating the notice atomically marks the policy cancelled and stores the effective date.</div></div>}
          {documentType === "endorsement" && <div className="space-y-3"><div><Label htmlFor="klutch-endorsement-evidence">Carrier-request evidence <span className="text-rose-600">*</span></Label><Textarea id="klutch-endorsement-evidence" rows={3} value={docForm.carrierRequestEvidence} onChange={(event) => setDocument("carrierRequestEvidence", event.target.value)} placeholder="Paste or identify the carrier request. A verified manager approval is recorded server-side before KIC-END-002 can be created." /></div><div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><strong>Manager approval required.</strong> The fixed KIC-END-002 form may be created only after a documented carrier request and server-recorded approval. It is never automatically attached to another document.</div></div>}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4"><p className="text-sm text-slate-600"><CheckCircle2 className="mr-1 inline h-4 w-4 text-emerald-600" />Preview opens an on-page PDF with <strong>Open/Print</strong> and <strong>Download</strong> controls. This action saves inputs and audit metadata as <strong>CREATED_NOT_SENT</strong>.</p><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => createDocument("preview")} disabled={documentMutation.isPending || cancellationMutation.isPending || approvalMutation.isPending}><Eye className="mr-2 h-4 w-4" />Preview PDF & save audit</Button><Button className="bg-[#003B40] hover:bg-[#0B5458]" onClick={() => createDocument("download")} disabled={documentMutation.isPending || cancellationMutation.isPending || approvalMutation.isPending}><Download className="mr-2 h-4 w-4" />Download PDF & save audit</Button></div></div>
        </div>}
      </section>

      {previewUrl && <section className="rounded-xl border border-[#0B5458]/25 bg-white p-4 shadow-sm"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-[#0B5458]">{previewIsDraft ? "Draft preview — not issued or saved" : "Created preview"}</p><h3 className="font-semibold text-slate-900">{previewIsDraft ? "Policy Declarations" : KLUTCH_DOCUMENT_LABELS[documentType]}</h3><p className="mt-1 text-xs text-slate-600">Use <strong>Open / Print</strong> for the browser’s native print dialog, including Save to PDF.</p></div><div className="flex flex-wrap gap-2"><a href={previewUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-md border border-[#0B5458] px-3 text-sm font-medium text-[#003B40] transition hover:bg-[#EDF7F3]"><Printer className="mr-2 h-4 w-4" />Open / Print</a><a href={previewUrl} download={`${previewFilename}.pdf`} className="inline-flex h-9 items-center rounded-md bg-[#003B40] px-3 text-sm font-medium text-white transition hover:bg-[#0B5458]"><Download className="mr-2 h-4 w-4" />Download PDF</a><Button variant="outline" size="sm" onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }}><X className="mr-2 h-4 w-4" />Close preview</Button></div></div><iframe title="Klutch policy document preview" src={previewUrl} className="h-[780px] w-full rounded border border-slate-200" /></section>}
    </div>
  );
}
