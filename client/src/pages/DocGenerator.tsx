import { useState, useCallback, useEffect, useRef } from "react";
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

import { jsPDF } from "jspdf";
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
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type DocGenTab =
  | "blank-letterhead"
  | "claimant-contact"
  | "failed-contact"
  | "storage-mitigation"
  | "cert-of-coverage"
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
  | "coi-klutch";

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
      { id: "failed-contact", label: "Failed Contact", icon: Phone },
      { id: "storage-mitigation", label: "Storage Mitigation", icon: AlertTriangle },
    ],
  },
  {
    label: "Coverage",
    items: [
      { id: "cert-of-coverage", label: "Certificate of Coverage", icon: Shield },
      { id: "coverage-tnc", label: "Coverage Position — TNC Primary", icon: Shield },
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
      { id: "payment-receipt", label: "Payment Receipt", icon: Receipt },
      { id: "urgently-invoice", label: "Towing Invoice", icon: Truck },
      { id: "lou-calculator", label: "LOU Calculator", icon: Scale },
    ],
  },
  {
    label: "Medical Review",
    items: [
      { id: "pip-exhaustion", label: "PIP Exhaustion (FL/PA/VA)", icon: AlertTriangle },
      { id: "pip-bill-review", label: "Medical Bills Review", icon: FileText },
    ],
  },
  {
    label: "Coverage Docs",
    items: [
      { id: "coi-whip", label: "Whip COI", icon: Shield },
      { id: "coi-klutch", label: "Klutch COI", icon: Shield },
    ],
  },
];

// ─── PDF Helpers ──────────────────────────────────────────────────────────────
const WHIP_ORANGE: [number, number, number] = [255, 98, 33];
const WHIP_DARK: [number, number, number] = [23, 27, 49];

function addWhipLetterhead(doc: jsPDF, title: string, subtitle?: string) {
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(...WHIP_DARK);
  doc.rect(0, 0, W, 28, "F");
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("WHIP", 14, 18);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Claims Management", 14, 24);
  doc.setFillColor(...WHIP_ORANGE);
  doc.rect(0, 28, W, 2, "F");
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...WHIP_DARK);
  doc.text(title, 14, 42);
  if (subtitle) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(subtitle, 14, 50);
  }
  doc.setDrawColor(220, 220, 220);
  doc.line(14, subtitle ? 55 : 47, W - 14, subtitle ? 55 : 47);
  return subtitle ? 62 : 54;
}

function addLetterFooter(doc: jsPDF) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  doc.setFillColor(...WHIP_DARK);
  doc.rect(0, H - 18, W, 18, "F");
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 180, 180);
  doc.text(
    "Whip Claims Management · P.O. Box 10622, Rockville, MD 20849 · claims@drivewhip.com",
    W / 2,
    H - 9,
    { align: "center" }
  );
}

// Statute of limitations notice — rendered above footer in smaller italic text
function addSOLNotice(doc: jsPDF, state?: string) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const solText = state
    ? `STATUTE OF LIMITATIONS NOTICE: The applicable statute of limitations in ${state} may limit the time within which legal action may be commenced. Failure to file suit within the applicable limitations period may permanently bar your right to recovery. This notice does not constitute legal advice. Consult an attorney for guidance specific to your jurisdiction.`
    : "STATUTE OF LIMITATIONS NOTICE: The applicable statute of limitations may limit the time within which legal action may be commenced. Failure to file suit within the applicable limitations period may permanently bar your right to recovery. This notice does not constitute legal advice.";
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(130, 130, 130);
  const lines = doc.splitTextToSize(solText, W - 28);
  const lineH = 3.5;
  const blockH = lines.length * lineH + 4;
  const yStart = H - 18 - blockH - 2;
  doc.text(lines, 14, yStart);
}

function wrapText(doc: jsPDF, text: string, x: number, y: number, maxW: number, lineH: number): number {
  const lines = doc.splitTextToSize(text, maxW);
  doc.text(lines, x, y);
  return y + lines.length * lineH;
}

function downloadPDF(doc: jsPDF, filename: string) {
  doc.save(filename);
}

function getPDFDataUrl(doc: jsPDF): string {
  return doc.output("datauristring");
}

// ─── Denial Templates ─────────────────────────────────────────────────────────
const DENIAL_TEMPLATES: Record<
  string,
  { label: string; hint: string; fields: string[]; build: (f: Record<string, string>) => string }
> = {
  tnc_pip: {
    label: "TNC PIP Denial (Rideshare)",
    hint: "Use when the member was in active rideshare/TNC activity and is claiming PIP benefits.",
    fields: ["recipient", "claimant", "dol", "tnc", "period", "adjuster"],
    build: (f) =>
      `Hello ${f.recipient || "[Recipient Name: Member/Counsel]"},\n\nWe are in receipt of notice that ${f.claimant || "[Member Name]"} has reported bodily injuries arising from the above-referenced incident.\n\nPlease be advised that Personal Injury Protection (PIP) benefits are not available under this claim. Our investigation confirms that at the time of loss (Date of Loss: ${f.dol || "[Date of Loss]"}), the vehicle was engaged in Transportation Network Company (TNC) activity with ${f.tnc || "[Uber/Lyft]"} during Period ${f.period || "[1/2/3]"}.\n\nPer the applicable Whip Member Agreement and Terms of Service, first-party injury benefits, including PIP, are excluded when the vehicle is being operated in connection with rideshare or delivery activity. During active TNC periods, the TNC platform's insurance carrier is the primary insurer for bodily injury claims.\n\nAccordingly, PIP benefits are denied for this claim.\n\nFor reference, coverage may be available through the TNC platform's insurance carrier:\nTNC Insurance Carrier: ${f.tnc_carrier || "[TNC Carrier Name]"}\nClaim Number (if known): ${f.tnc_claim || "[TNC Claim Number]"}\n\nPlease contact our office if you have questions.\n\nRegards,\n${f.adjuster || "[Adjuster Name]"}\nWhip Claims Management`,
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
      `Hello ${f.recipient || "[Claimant/Carrier]"},\n\nWe have completed our review of the liability coverage portion of this claim.\n\nOur investigation confirms that at the time of loss (Date of Loss: ${f.dol || "[Date of Loss]"}), the vehicle was engaged in Transportation Network Company (TNC) activity with ${f.tnc || "[Uber/Lyft]"} during Period ${f.period || "[1/2/3]"}. Based on the applicable Whip Member Agreement and Terms of Service, liability coverage does not apply when the vehicle is being used in connection with rideshare or delivery activity.\n\nAccordingly, liability coverage is denied for this claim.\n\nIf you believe this determination is incorrect, please provide documentation showing the driver was not engaged in TNC activity at the time of loss.\n\nFor reference, coverage may be available through the TNC platform's insurance carrier during active rideshare periods:\nTNC Insurance Carrier: ${f.tnc_carrier || "[TNC Carrier Name]"}\nClaim Number (if known): ${f.tnc_claim || "[TNC Claim Number]"}\nCarrier Contact Information: ${f.tnc_contact || "[Carrier Contact Info]"}\n\nThis determination applies to liability coverage only. All other coverages, if any, are evaluated separately.\n\nPlease let us know if you have any questions.\n\nRegards,\nWhip Claims Management`,
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
    build: (f) =>
      `Hello ${f.recipient || "[Member Name]"},\n\nWe are writing in connection with the above-referenced claim arising from the incident on ${f.dol || "[Date of Loss]"}.\n\nOur investigation has determined that at the time of loss, the vehicle was being operated in connection with ${f.platform || "[Empower/Unauthorized Platform]"}, a transportation network company that is not authorized under your Vehicle Membership Agreement with Whip/Metrocars Leasing Corp.\n\nPer the terms of your membership agreement, coverage is not available for losses occurring while the vehicle is being used in connection with unauthorized third-party platforms or services. Accordingly, we are unable to extend coverage for this claim.\n\nIf you believe this determination is in error, please provide documentation demonstrating the vehicle was not engaged in unauthorized platform activity at the time of loss.\n\nRegards,\n${f.adjuster || "[Adjuster Name]"}\nWhip Claims Management`,
  },
  empower_claimant: {
    label: "Empower Denial — Claimant (Unauthorized Platform Use)",
    hint: "Use when a third-party claimant is seeking coverage and the vehicle was on an unauthorized platform.",
    fields: ["recipient", "dol", "platform", "adjuster"],
    build: (f) =>
      `Dear ${f.recipient || "[Claimant/Carrier/Counsel]"},\n\nWe have completed our review of the coverage available for the above-referenced claim arising from the incident on ${f.dol || "[Date of Loss]"}.\n\nOur investigation has determined that at the time of loss, the vehicle was being operated in connection with ${f.platform || "[Empower/Unauthorized Platform]"}, a transportation network company that is not authorized under the applicable Vehicle Membership Agreement. Per the terms of the membership agreement, coverage is not available for losses occurring while the vehicle is being used in connection with unauthorized third-party platforms or services.\n\nAccordingly, we are unable to extend coverage for this claim.\n\nIf you believe this determination is in error, please provide documentation demonstrating the vehicle was not engaged in unauthorized platform activity at the time of loss.\n\nRegards,\n${f.adjuster || "[Adjuster Name]"}\nWhip Claims Management`,
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
      <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/40 border-b border-border">
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
  onDownload,
  filename,
  extra,
}: {
  text: string;
  onCopy: () => void;
  onDownload: () => void;
  filename?: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/40 border-b border-border">
        <FileText className="w-3.5 h-3.5 text-[#ff6221]" />
        <h3 className="text-sm font-semibold text-foreground flex-1">Preview</h3>
        {extra}
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={onCopy}>
          <Copy className="w-3 h-3" /> Copy
        </Button>
        <Button
          size="sm"
          className="h-7 gap-1.5 text-xs bg-[#ff6221] hover:bg-[#e5541a] text-white"
          onClick={onDownload}
        >
          <Download className="w-3 h-3" /> PDF
        </Button>
      </div>
      <pre className="p-4 text-xs font-mono whitespace-pre-wrap text-foreground/80 max-h-[500px] overflow-y-auto bg-background">
        {text || "(Fill in the fields above to generate a preview)"}
      </pre>
    </div>
  );
}

// ─── Tab: Blank Letterhead ────────────────────────────────────────────────────
function BlankLetterheadTab() {
  const [form, setForm] = useState({
    claimNumber: "",
    dateOfLoss: "",
    recipient: "",
    recipientAddress: "",
    subject: "",
    body: "",
  });
  const [aiLoading, setAiLoading] = useState(false);
  const improveMutation = trpc.docgen.improveWithAI.useMutation();

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const preview = [
    today,
    "",
    form.recipient || "[Recipient Name]",
    form.recipientAddress || "[Recipient Address]",
    "",
    `Re: Claim #${form.claimNumber || "[Claim Number]"}${form.dateOfLoss ? ` — Date of Loss: ${form.dateOfLoss}` : ""}`,
    form.subject ? `     ${form.subject}` : "",
    "",
    "Dear " + (form.recipient || "[Recipient]") + ",",
    "",
    form.body || "[Letter body will appear here]",
    "",
    "Sincerely,",
    "",
    "[Handler Name]",
    "Whip Claims Management",
    "P.O. Box 10622, Rockville, MD 20849",
    "claims@drivewhip.com",
  ]
    .filter((l) => l !== undefined)
    .join("\n");

  const handleImprove = async () => {
    if (!form.body.trim()) {
      toast.error("Enter a letter body first");
      return;
    }
    setAiLoading(true);
    try {
      const result = await improveMutation.mutateAsync({
        body: form.body,
        claimNumber: form.claimNumber,
        recipient: form.recipient,
      });
      set("body")(result.improved);
      toast.success("Letter improved with AI");
    } catch (e: unknown) {
      toast.error((e as Error).message || "AI error");
    } finally {
      setAiLoading(false);
    }
  };

  const handleDownload = () => {
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    let y = addWhipLetterhead(doc, "CORRESPONDENCE", form.subject || "");
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    y = wrapText(doc, today, 14, y, W - 28, 5);
    y += 6;
    if (form.recipient) y = wrapText(doc, form.recipient, 14, y, W - 28, 5);
    if (form.recipientAddress) y = wrapText(doc, form.recipientAddress, 14, y, W - 28, 5);
    y += 4;
    y = wrapText(
      doc,
      `Re: Claim #${form.claimNumber || "[Claim Number]"}${form.dateOfLoss ? ` — Date of Loss: ${form.dateOfLoss}` : ""}`,
      14,
      y,
      W - 28,
      5
    );
    y += 6;
    y = wrapText(doc, `Dear ${form.recipient || "[Recipient]"},`, 14, y, W - 28, 5);
    y += 4;
    y = wrapText(doc, form.body || "[Letter body]", 14, y, W - 28, 5);
    y += 8;
    doc.text("Sincerely,", 14, y);
    y += 10;
    doc.text("[Handler Name]", 14, y);
    y += 5;
    doc.text("Whip Claims Management", 14, y);
    addSOLNotice(doc);
    addLetterFooter(doc);
    downloadPDF(doc, `Whip_Letter_${form.claimNumber || "Draft"}.pdf`);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div>
        <Panel title="Letter Details" tag="REQUIRED">
          <Grid3>
            <Field label="Claim Number" id="bl-claim" value={form.claimNumber} onChange={set("claimNumber")} placeholder="e.g. PF438367" />
            <Field label="Date of Loss" id="bl-dol" value={form.dateOfLoss} onChange={set("dateOfLoss")} type="date" />
            <Field label="Recipient Name" id="bl-recipient" value={form.recipient} onChange={set("recipient")} placeholder="e.g. John Smith" />
          </Grid3>
          <div className="mt-3">
            <Field label="Recipient Address" id="bl-addr" value={form.recipientAddress} onChange={set("recipientAddress")} placeholder="123 Main St, City, ST 00000" />
          </div>
          <div className="mt-3">
            <Field label="Subject Line (optional)" id="bl-subject" value={form.subject} onChange={set("subject")} placeholder="e.g. Claim Status Update" />
          </div>
        </Panel>
        <Panel title="Letter Body">
          <TextareaField
            label="Body"
            id="bl-body"
            value={form.body}
            onChange={set("body")}
            placeholder="Type your letter body here..."
            rows={10}
          />
          <div className="mt-3 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-[#ff6221]/40 text-[#ff6221] hover:bg-[#ff6221]/10"
              onClick={handleImprove}
              disabled={aiLoading}
            >
              {aiLoading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              {aiLoading ? "Improving..." : "Improve with AI"}
            </Button>
          </div>
        </Panel>
      </div>
      <PreviewPanel
        text={preview}
        onCopy={() => { navigator.clipboard.writeText(preview); toast.success("Copied"); }}
        onDownload={handleDownload}
        filename={`Whip_Letter_${form.claimNumber || "Draft"}.pdf`}
      />
    </div>
  );
}

// ─── Tab: Claimant Contact ────────────────────────────────────────────────────
function ClaimantContactTab() {
  const [form, setForm] = useState({
    claimantName: "",
    claimNumber: "",
    dateOfLoss: "",
    vehicle: "",
    adjusterName: "",
    adjusterPhone: "",
    adjusterEmail: "",
    contactType: "initial",
    additionalNotes: "",
  });

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

  const handleDownload = () => {
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    let y = addWhipLetterhead(doc, `${contactTypeLabel[form.contactType] || "CONTACT LETTER"}`, `Claim #${form.claimNumber || "[Claim Number]"} — DOL: ${form.dateOfLoss || "[Date of Loss]"}`);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    y = wrapText(doc, preview, 14, y, W - 28, 5);
    addSOLNotice(doc);
    addLetterFooter(doc);
    downloadPDF(doc, `Whip_Contact_${form.claimNumber || "Draft"}.pdf`);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div>
        <Panel title="Claim Details" tag="REQUIRED">
          <Grid3>
            <Field label="Claimant Name" id="cc-name" value={form.claimantName} onChange={set("claimantName")} placeholder="Last, First" required />
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
            <Field label="Handler Name" id="cc-handler" value={form.adjusterName} onChange={set("adjusterName")} placeholder="e.g. Jane Smith" />
            <Field label="Handler Phone" id="cc-phone" value={form.adjusterPhone} onChange={set("adjusterPhone")} placeholder="(xxx) xxx-xxxx" />
            <Field label="Handler Email" id="cc-email" value={form.adjusterEmail} onChange={set("adjusterEmail")} placeholder="handler@drivewhip.com" />
          </Grid3>
        </Panel>
      </div>
      <PreviewPanel
        text={preview}
        onCopy={() => { navigator.clipboard.writeText(preview); toast.success("Copied"); }}
        onDownload={handleDownload}
      />
    </div>
  );
}

// ─── Tab: Failed Contact ──────────────────────────────────────────────────────
function FailedContactTab() {
  const [form, setForm] = useState({
    claimantName: "",
    claimNumber: "",
    dateOfLoss: "",
    vehicle: "",
    adjusterName: "",
    adjusterPhone: "",
    adjusterEmail: "",
    attemptCount: "3",
    lastAttemptDate: "",
    deadline: "10",
  });

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
Whip Claims Management`;

  const handleDownload = () => {
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    let y = addWhipLetterhead(doc, "NOTICE OF FAILED CONTACT", `Claim #${form.claimNumber || "[Claim Number]"}`);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    y = wrapText(doc, preview, 14, y, W - 28, 5);
    addSOLNotice(doc);
    addLetterFooter(doc);
    downloadPDF(doc, `Whip_FailedContact_${form.claimNumber || "Draft"}.pdf`);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div>
        <Panel title="Claim Details" tag="REQUIRED">
          <Grid3>
            <Field label="Claimant Name" id="fc-name" value={form.claimantName} onChange={set("claimantName")} placeholder="Last, First" required />
            <Field label="Claim Number" id="fc-claim" value={form.claimNumber} onChange={set("claimNumber")} placeholder="e.g. PF438367" />
            <Field label="Date of Loss" id="fc-dol" value={form.dateOfLoss} onChange={set("dateOfLoss")} type="date" />
          </Grid3>
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
            <Field label="Handler Name" id="fc-handler" value={form.adjusterName} onChange={set("adjusterName")} placeholder="e.g. Jane Smith" />
            <Field label="Handler Phone" id="fc-phone" value={form.adjusterPhone} onChange={set("adjusterPhone")} placeholder="(xxx) xxx-xxxx" />
            <Field label="Handler Email" id="fc-email" value={form.adjusterEmail} onChange={set("adjusterEmail")} placeholder="handler@drivewhip.com" />
          </Grid3>
        </Panel>
      </div>
      <PreviewPanel
        text={preview}
        onCopy={() => { navigator.clipboard.writeText(preview); toast.success("Copied"); }}
        onDownload={handleDownload}
      />
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

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const preview = `${today}

Re: URGENT — Storage Mitigation Notice
    Claim #${form.claimNumber || "[Claim Number]"}
    Vehicle: ${form.vehicle || "[Vehicle]"} | VIN: ${form.vin || "[VIN]"}
    Date of Loss: ${form.dateOfLoss || "[Date of Loss]"}

Dear ${form.recipientName || "[Recipient Name]"},

This letter is to notify you that the above-referenced vehicle is currently in storage at:

${form.storageFacility || "[Storage Facility Name]"}
${form.storageAddress || "[Storage Address]"}
${form.storagePhone ? `Phone: ${form.storagePhone}` : ""}

The vehicle has been in storage since ${form.towDate || "[Tow Date]"}${form.dailyRate ? ` at a rate of $${form.dailyRate}/day` : ""}. Storage charges are accruing daily.

You are hereby notified that you have ${form.deadline || "5"} business days from the date of this letter to make arrangements for the vehicle. Failure to act within this timeframe may result in the following:

• Storage charges being assessed against any settlement proceeds
• The vehicle being deemed abandoned per applicable state law
• Additional administrative and disposal fees

Please contact our office immediately to coordinate vehicle release or provide authorization for vehicle disposition.

${form.adjusterName || "[Adjuster Name]"}
Whip Claims Management
Phone: ${form.adjusterPhone || "(xxx) xxx-xxxx"}
Email: ${form.adjusterEmail || "claims@drivewhip.com"}`;

  const handleDownload = () => {
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    let y = addWhipLetterhead(doc, "STORAGE MITIGATION NOTICE", `Claim #${form.claimNumber || "[Claim Number]"} — URGENT`);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    y = wrapText(doc, preview, 14, y, W - 28, 5);
    addSOLNotice(doc);
    addLetterFooter(doc);
    downloadPDF(doc, `Whip_StorageMitigation_${form.claimNumber || "Draft"}.pdf`);
  };

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
            <Field label="Handler Name" id="sm-handler" value={form.adjusterName} onChange={set("adjusterName")} placeholder="e.g. Jane Smith" />
            <Field label="Handler Phone" id="sm-hphone" value={form.adjusterPhone} onChange={set("adjusterPhone")} placeholder="(xxx) xxx-xxxx" />
            <Field label="Handler Email" id="sm-hemail" value={form.adjusterEmail} onChange={set("adjusterEmail")} placeholder="handler@drivewhip.com" />
          </Grid3>
        </Panel>
      </div>
      <PreviewPanel
        text={preview}
        onCopy={() => { navigator.clipboard.writeText(preview); toast.success("Copied"); }}
        onDownload={handleDownload}
      />
    </div>
  );
}

// ─── Tab: Certificate of Coverage ────────────────────────────────────────────
function CertOfCoverageTab() {
  const [form, setForm] = useState({
    memberName: "",
    claimNumber: "",
    dateOfLoss: "",
    vehicle: "",
    vin: "",
    licensePlate: "",
    coverageType: "liability",
    coverageLimits: "",
    policyPeriod: "",
    adjusterName: "",
    adjusterPhone: "",
    adjusterEmail: "",
    requestedBy: "",
  });

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const coverageLabels: Record<string, string> = {
    liability: "Liability (PD & BI)",
    pip: "Personal Injury Protection (PIP)",
    comprehensive: "Comprehensive",
    collision: "Collision",
    full: "Full Coverage (Liability + Comp/Collision)",
  };

  const preview = `${today}

CERTIFICATE OF COVERAGE

To: ${form.requestedBy || "[Requesting Party]"}
Re: Claim #${form.claimNumber || "[Claim Number]"}
    Date of Loss: ${form.dateOfLoss || "[Date of Loss]"}

INSURED / MEMBER INFORMATION:
Member Name: ${form.memberName || "[Member Name]"}
Vehicle: ${form.vehicle || "[Vehicle Year/Make/Model]"}
VIN: ${form.vin || "[VIN]"}
License Plate: ${form.licensePlate || "[License Plate]"}

COVERAGE INFORMATION:
Coverage Type: ${coverageLabels[form.coverageType] || form.coverageType}
${form.coverageLimits ? `Coverage Limits: ${form.coverageLimits}` : ""}
${form.policyPeriod ? `Policy Period: ${form.policyPeriod}` : ""}

This certificate is issued as a matter of information only and confers no rights upon the certificate holder. This certificate does not amend, extend, or alter the coverage afforded by the Vehicle Membership Agreement.

Issued by:
${form.adjusterName || "[Adjuster Name]"}
Whip Claims Management
Phone: ${form.adjusterPhone || "(xxx) xxx-xxxx"}
Email: ${form.adjusterEmail || "claims@drivewhip.com"}`;

  const handleDownload = () => {
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    let y = addWhipLetterhead(doc, "CERTIFICATE OF COVERAGE", `Claim #${form.claimNumber || "[Claim Number]"}`);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    y = wrapText(doc, preview, 14, y, W - 28, 5);
    addSOLNotice(doc);
    addLetterFooter(doc);
    downloadPDF(doc, `Whip_CertOfCoverage_${form.claimNumber || "Draft"}.pdf`);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div>
        <Panel title="Claim & Member Details" tag="REQUIRED">
          <Grid3>
            <Field label="Member Name" id="coc-member" value={form.memberName} onChange={set("memberName")} placeholder="Last, First" required />
            <Field label="Claim Number" id="coc-claim" value={form.claimNumber} onChange={set("claimNumber")} placeholder="e.g. PF438367" />
            <Field label="Date of Loss" id="coc-dol" value={form.dateOfLoss} onChange={set("dateOfLoss")} type="date" />
          </Grid3>
          <Grid3 children={<>
            <Field label="Vehicle (Year/Make/Model)" id="coc-vehicle" value={form.vehicle} onChange={set("vehicle")} placeholder="e.g. 2024 Toyota Camry" />
            <Field label="VIN" id="coc-vin" value={form.vin} onChange={set("vin")} placeholder="17-character VIN" />
            <Field label="License Plate" id="coc-plate" value={form.licensePlate} onChange={set("licensePlate")} placeholder="e.g. ABC1234" />
          </>} />
        </Panel>
        <Panel title="Coverage Details">
          <div className="space-y-1 mb-3">
            <Label className="text-xs font-semibold">Coverage Type</Label>
            <Select value={form.coverageType} onValueChange={set("coverageType")}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="liability">Liability (PD & BI)</SelectItem>
                <SelectItem value="pip">Personal Injury Protection (PIP)</SelectItem>
                <SelectItem value="comprehensive">Comprehensive</SelectItem>
                <SelectItem value="collision">Collision</SelectItem>
                <SelectItem value="full">Full Coverage</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Grid2 children={<>
            <Field label="Coverage Limits" id="coc-limits" value={form.coverageLimits} onChange={set("coverageLimits")} placeholder="e.g. $100K/$300K/$50K" />
            <Field label="Policy Period" id="coc-period" value={form.policyPeriod} onChange={set("policyPeriod")} placeholder="e.g. 01/01/2024 – 12/31/2024" />
          </>} />
          <div className="mt-3">
            <Field label="Requested By" id="coc-reqby" value={form.requestedBy} onChange={set("requestedBy")} placeholder="e.g. State Farm Insurance" />
          </div>
        </Panel>
        <Panel title="Handler Info">
          <Grid3>
            <Field label="Handler Name" id="coc-handler" value={form.adjusterName} onChange={set("adjusterName")} placeholder="e.g. Jane Smith" />
            <Field label="Handler Phone" id="coc-phone" value={form.adjusterPhone} onChange={set("adjusterPhone")} placeholder="(xxx) xxx-xxxx" />
            <Field label="Handler Email" id="coc-email" value={form.adjusterEmail} onChange={set("adjusterEmail")} placeholder="handler@drivewhip.com" />
          </Grid3>
        </Panel>
      </div>
      <PreviewPanel
        text={preview}
        onCopy={() => { navigator.clipboard.writeText(preview); toast.success("Copied"); }}
        onDownload={handleDownload}
      />
    </div>
  );
}

// ─── Tab: Coverage Position — TNC Primary ────────────────────────────────────
function CoverageTNCTab() {
  const [form, setForm] = useState({
    recipientName: "",
    claimNumber: "",
    dateOfLoss: "",
    vehicle: "",
    vin: "",
    tncPlatform: "Uber",
    tncPeriod: "2",
    tncCarrier: "",
    tncClaimNumber: "",
    tncContact: "",
    adjusterName: "",
    adjusterPhone: "",
    adjusterEmail: "",
  });

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const preview = `${today}

Re: Coverage Position — TNC Primary Coverage
    Claim #${form.claimNumber || "[Claim Number]"}
    Date of Loss: ${form.dateOfLoss || "[Date of Loss]"}
    Vehicle: ${form.vehicle || "[Vehicle]"} | VIN: ${form.vin || "[VIN]"}

Dear ${form.recipientName || "[Recipient Name]"},

We are writing to advise you of the applicable coverage position for the above-referenced claim.

Our investigation has confirmed that at the time of loss, the vehicle was engaged in active Transportation Network Company (TNC) activity with ${form.tncPlatform || "[TNC Platform]"} during Period ${form.tncPeriod || "2"}. During this period, the TNC platform's insurance is the primary coverage for third-party claims.

APPLICABLE TNC COVERAGE:
TNC Platform: ${form.tncPlatform || "[TNC Platform]"}
TNC Period: ${form.tncPeriod || "2"}
TNC Insurance Carrier: ${form.tncCarrier || "[TNC Carrier Name]"}
TNC Claim Number: ${form.tncClaimNumber || "[TNC Claim Number]"}
TNC Carrier Contact: ${form.tncContact || "[TNC Carrier Contact]"}

We recommend directing your claim to the TNC platform's insurance carrier as the primary insurer for this loss.

Whip Claims Management will cooperate with the TNC carrier's investigation and provide any documentation in our possession upon request.

Sincerely,

${form.adjusterName || "[Adjuster Name]"}
Whip Claims Management
Phone: ${form.adjusterPhone || "(xxx) xxx-xxxx"}
Email: ${form.adjusterEmail || "claims@drivewhip.com"}`;

  const handleDownload = () => {
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    let y = addWhipLetterhead(doc, "COVERAGE POSITION — TNC PRIMARY", `Claim #${form.claimNumber || "[Claim Number]"}`);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    y = wrapText(doc, preview, 14, y, W - 28, 5);
    addSOLNotice(doc);
    addLetterFooter(doc);
    downloadPDF(doc, `Whip_CoveragePosition_${form.claimNumber || "Draft"}.pdf`);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div>
        <Panel title="Claim Details" tag="REQUIRED">
          <Grid3>
            <Field label="Recipient Name" id="tnc-recipient" value={form.recipientName} onChange={set("recipientName")} placeholder="Carrier / Claimant / Counsel" required />
            <Field label="Claim Number" id="tnc-claim" value={form.claimNumber} onChange={set("claimNumber")} placeholder="e.g. PF438367" />
            <Field label="Date of Loss" id="tnc-dol" value={form.dateOfLoss} onChange={set("dateOfLoss")} type="date" />
          </Grid3>
          <Grid2 children={<>
            <Field label="Vehicle (Year/Make/Model)" id="tnc-vehicle" value={form.vehicle} onChange={set("vehicle")} placeholder="e.g. 2024 Toyota Camry" />
            <Field label="VIN" id="tnc-vin" value={form.vin} onChange={set("vin")} placeholder="17-character VIN" />
          </>} />
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
            <Field label="Handler Name" id="tnc-handler" value={form.adjusterName} onChange={set("adjusterName")} placeholder="e.g. Jane Smith" />
            <Field label="Handler Phone" id="tnc-phone" value={form.adjusterPhone} onChange={set("adjusterPhone")} placeholder="(xxx) xxx-xxxx" />
            <Field label="Handler Email" id="tnc-email" value={form.adjusterEmail} onChange={set("adjusterEmail")} placeholder="handler@drivewhip.com" />
          </Grid3>
        </Panel>
      </div>
      <PreviewPanel
        text={preview}
        onCopy={() => { navigator.clipboard.writeText(preview); toast.success("Copied"); }}
        onDownload={handleDownload}
      />
    </div>
  );
}

// ─── Tab: Denial & Acknowledgment ────────────────────────────────────────────
function DenialTab() {
  const [selectedTemplate, setSelectedTemplate] = useState<string>("tnc_pip");
  const [claimNumber, setClaimNumber] = useState("");
  const [dateOfLoss, setDateOfLoss] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});

  const template = DENIAL_TEMPLATES[selectedTemplate];

  const setField = (k: string) => (v: string) =>
    setFields((p) => ({ ...p, [k]: v }));

  const FIELD_LABELS: Record<string, { label: string; placeholder: string; type?: string }> = {
    recipient: { label: "Recipient Name", placeholder: "Member / Counsel / Carrier" },
    claimant: { label: "Claimant / Member Name", placeholder: "Last, First" },
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

  const preview = template
    ? `CLAIM #${claimNumber || "[Claim Number]"} — DATE OF LOSS: ${dateOfLoss || "[Date of Loss]"}\n\n${template.build({ ...fields, dol: fields.dol || dateOfLoss })}`
    : "";

  const handleDownload = () => {
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    let y = addWhipLetterhead(doc, template?.label?.toUpperCase() || "DENIAL", `Claim #${claimNumber || "[Claim Number]"} — DOL: ${dateOfLoss || "[Date of Loss]"}`);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    const body = template?.build({ ...fields, dol: fields.dol || dateOfLoss }) || "";
    y = wrapText(doc, body, 14, y, W - 28, 5);
    addSOLNotice(doc);
    addLetterFooter(doc);
    downloadPDF(doc, `Whip_Denial_${claimNumber || "Draft"}.pdf`);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div>
        <Panel title="Template Selection" tag="REQUIRED">
          <div className="space-y-1 mb-3">
            <Label className="text-xs font-semibold">Denial Type</Label>
            <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(DENIAL_TEMPLATES).map(([key, t]) => (
                  <SelectItem key={key} value={key}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {template && (
            <div className="text-xs text-muted-foreground bg-muted/40 rounded p-2 border border-border/50">
              <span className="font-semibold text-[#ff6221]">When to use:</span> {template.hint}
            </div>
          )}
        </Panel>
        <Panel title="Claim Details" tag="REQUIRED">
          <Grid2>
            <Field label="Claim Number" id="den-claim" value={claimNumber} onChange={setClaimNumber} placeholder="e.g. PF438367" />
            <Field label="Date of Loss" id="den-dol" value={dateOfLoss} onChange={setDateOfLoss} type="date" />
          </Grid2>
        </Panel>
        {template && (
          <Panel title="Template Fields">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {template.fields.map((f) => {
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
      </div>
      <PreviewPanel
        text={preview}
        onCopy={() => { navigator.clipboard.writeText(preview); toast.success("Copied"); }}
        onDownload={handleDownload}
      />
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

  const handleDownload = () => {
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    let y = addWhipLetterhead(doc, "DAMAGE DENIAL", `Claim #${form.claimNumber || "[Claim Number]"} — DOL: ${form.dateOfLoss || "[Date of Loss]"}`);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    y = wrapText(doc, preview, 14, y, W - 28, 5);
    addSOLNotice(doc);
    addLetterFooter(doc);
    downloadPDF(doc, `Whip_DamageDenial_${form.claimNumber || "Draft"}.pdf`);
  };

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
            <Field label="Handler Name" id="dd-handler" value={form.adjusterName} onChange={set("adjusterName")} placeholder="e.g. Jane Smith" />
            <Field label="Handler Phone" id="dd-phone" value={form.adjusterPhone} onChange={set("adjusterPhone")} placeholder="(xxx) xxx-xxxx" />
            <Field label="Handler Email" id="dd-email" value={form.adjusterEmail} onChange={set("adjusterEmail")} placeholder="handler@drivewhip.com" />
          </Grid3>
        </Panel>
      </div>
      <PreviewPanel
        text={preview}
        onCopy={() => { navigator.clipboard.writeText(preview); toast.success("Copied"); }}
        onDownload={handleDownload}
      />
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

  const handleDownload = () => {
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    let y = addWhipLetterhead(doc, "RESERVATION OF RIGHTS", `Claim #${form.claimNumber || "[Claim Number]"}`);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    y = wrapText(doc, preview, 14, y, W - 28, 5);
    addSOLNotice(doc);
    addLetterFooter(doc);
    downloadPDF(doc, `Whip_ROR_${form.claimNumber || "Draft"}.pdf`);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div>
        <Panel title="Claim Details" tag="REQUIRED">
          <Grid3>
            <Field label="Member Name" id="ror-member" value={form.memberName} onChange={set("memberName")} placeholder="Last, First" required />
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
            <Field label="Handler Name" id="ror-handler" value={form.handlerName} onChange={set("handlerName")} placeholder="e.g. Jane Smith" />
            <Field label="Handler Phone" id="ror-phone" value={form.handlerPhone} onChange={set("handlerPhone")} placeholder="(xxx) xxx-xxxx" />
            <Field label="Handler Email" id="ror-email" value={form.handlerEmail} onChange={set("handlerEmail")} placeholder="handler@drivewhip.com" />
          </Grid3>
        </Panel>
      </div>
      <PreviewPanel
        text={preview}
        onCopy={() => { navigator.clipboard.writeText(preview); toast.success("Copied"); }}
        onDownload={handleDownload}
      />
    </div>
  );
}

// ─── Tab: General Release — BI ────────────────────────────────────────────────
function ReleaseBITab() {
  const WHIP_STATES = ["MD", "VA", "PA", "FL", "IL", "GA", "MA", "DC", "NJ", "NY"];
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
  const [emailDraft, setEmailDraft] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [aiValidation, setAiValidation] = useState("");
  const [aiValidating, setAiValidating] = useState(false);
  const emailMutation = trpc.docgen.generateSettlementEmail.useMutation();
  const validateMutation = trpc.docgen.validateReleaseLanguage.useMutation();

  const set = (k: keyof typeof form) => (v: string | boolean) =>
    setForm((p) => ({ ...p, [k]: v }));

  const today = new Date().toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });

  const minorLine = form.isMinor ? ` (Minor, by Guardian: ${form.minorGuardianName || "[Guardian Name]"})` : "";
  const minorBlock = form.isMinor
    ? `MINOR CLAIMANT PROVISION: The undersigned Guardian/Parent represents that they have the legal authority to execute this release on behalf of the minor claimant, ${form.claimantName || "[Minor's Name]"}, and that this settlement is in the best interest of the minor. Court approval may be required under applicable state law for settlements involving minors.\n\n`
    : "";
  const minorSig = form.isMinor ? `\n_________________________________\n${form.minorGuardianName || "[Guardian Name]"} — Guardian/Parent\n` : "";

  const releaseText = [
    "GENERAL RELEASE OF ALL CLAIMS — BODILY INJURY",
    "FOR SETTLEMENT PURPOSES ONLY",
    "",
    `Date: ${today}`,
    "",
    `Claimant: ${form.claimantName || "[Claimant Name]"}${minorLine}`,
    `Claim Number: ${form.claimNumber || "[Claim Number]"}`,
    `Date of Loss: ${form.dateOfLoss || "[Date of Loss]"}`,
    `Vehicle: ${form.vehicle || "[Vehicle]"}`,
    `Settlement Amount: $${form.settlementAmount || "[Amount]"}`,
    `State: ${form.state}`,
    "",
    `In consideration of the payment of ${form.settlementAmount ? "$" + form.settlementAmount : "[Settlement Amount]"} ("Settlement Amount"), the receipt and sufficiency of which are hereby acknowledged, the undersigned Releasor(s) hereby release and forever discharge Metrocars Leasing Corp d/b/a Whip, Whip Claims Management, their officers, directors, employees, agents, successors, and assigns (collectively "Released Parties") from any and all claims, demands, actions, causes of action, damages, losses, costs, and expenses of any kind or nature whatsoever, known or unknown, arising out of or related to the incident described above, including but not limited to all bodily injury claims, medical expenses, lost wages, pain and suffering, and any other damages of any kind.`,
    "",
    `This Release is intended to be a full and final settlement of all claims arising from the above-referenced incident. The Releasor acknowledges that this settlement is a compromise of a disputed claim and does not constitute an admission of liability by any of the Released Parties.`,
    "",
    minorBlock + "The Releasor represents and warrants that: (1) they have the full legal authority to execute this Release; (2) they have not assigned or transferred any claims released herein; and (3) they have had the opportunity to consult with legal counsel prior to executing this Release.",
    "",
    "RELEASOR SIGNATURE:",
    "",
    "_________________________________    Date: _______________",
    form.claimantName || "[Claimant Name]",
    minorSig,
    "_________________________________",
    "Printed Name",
    "",
    "_________________________________",
    "Address",
    "",
    "Accepted by:",
    form.adjusterName || "[Adjuster Name]",
    "Whip Claims Management",
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

  const handleValidate = async () => {
    if (!form.claimantName || !form.settlementAmount) {
      toast.error("Fill in Claimant Name and Settlement Amount first");
      return;
    }
    setAiValidating(true);
    try {
      const result = await validateMutation.mutateAsync({
        releaseType: "bi",
        state: form.state,
        claimantName: form.claimantName,
        settlementAmount: form.settlementAmount,
        isMinor: form.isMinor,
        guardianName: form.minorGuardianName,
        isCarrierPayee: form.isCarrierPayee,
        carrierName: form.carrierName,
      });
      setAiValidation(result.review);
      toast.success("AI validation complete");
    } catch (e: unknown) {
      toast.error((e as Error).message || "AI error");
    } finally {
      setAiValidating(false);
    }
  };

  const handleDownload = () => {
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    let y = addWhipLetterhead(doc, "GENERAL RELEASE — BODILY INJURY", `Claim #${form.claimNumber || "[Claim Number]"} — FOR SETTLEMENT PURPOSES ONLY`);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    y = wrapText(doc, releaseText, 14, y, W - 28, 5);
    addSOLNotice(doc, form.state);
    addLetterFooter(doc);
    downloadPDF(doc, `Whip_Release_BI_${form.claimNumber || "Draft"}.pdf`);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div>
        <Panel title="Release Details" tag="REQUIRED">
          <Grid3>
            <Field label="Claimant Name" id="rbi-name" value={form.claimantName} onChange={set("claimantName")} placeholder="Last, First" required />
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
            <label className="flex items-center gap-3 cursor-pointer p-2.5 rounded-md border border-border/50 hover:bg-muted/30 transition-colors">
              <Checkbox checked={form.isCarrierPayee} onCheckedChange={(v) => set("isCarrierPayee")(!!v)} />
              <div>
                <div className="text-xs font-semibold">Carrier / Subrogation Payee</div>
                <div className="text-xs text-muted-foreground">Payment issued to carrier, not claimant directly</div>
              </div>
            </label>
            {form.isCarrierPayee && (
              <div className="ml-7">
                <Field label="Carrier Name" id="rbi-carrier" value={form.carrierName} onChange={set("carrierName")} placeholder="e.g. GEICO" />
              </div>
            )}
          </div>
        </Panel>
        <Panel title="Handler Info">
          <Grid2>
            <Field label="Handler Name" id="rbi-handler" value={form.adjusterName} onChange={set("adjusterName")} placeholder="e.g. Jane Smith" />
            <Field label="Recipient Email" id="rbi-email" value={form.recipientEmail} onChange={set("recipientEmail")} placeholder="attorney@lawfirm.com" />
          </Grid2>
        </Panel>
        <Panel title="AI Tools" tag="AI">
          <div className="flex gap-2 flex-wrap mb-3">
            <Button variant="outline" size="sm" className="gap-1.5 border-[#ff6221]/40 text-[#ff6221] hover:bg-[#ff6221]/10" onClick={handleValidate} disabled={aiValidating}>
              {aiValidating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
              {aiValidating ? "Validating..." : "✨ Validate Release Language"}
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 border-[#ff6221]/40 text-[#ff6221] hover:bg-[#ff6221]/10" onClick={handleGenerateEmail} disabled={emailLoading}>
              {emailLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
              {emailLoading ? "Generating..." : "Generate Email Draft"}
            </Button>
          </div>
          {aiValidation && (
            <div className="border border-border rounded-md overflow-hidden mb-3">
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b border-border">
                <CheckCircle className="w-3.5 h-3.5 text-[#ff6221]" />
                <span className="text-xs font-semibold flex-1">AI Language Validation</span>
                <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs" onClick={() => { navigator.clipboard.writeText(aiValidation); toast.success("Copied"); }}>
                  <Copy className="w-3 h-3" /> Copy
                </Button>
              </div>
              <pre className="p-3 text-xs whitespace-pre-wrap text-foreground/80 max-h-[250px] overflow-y-auto">{aiValidation}</pre>
            </div>
          )}
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
      />
    </div>
  );
}

// ─── Tab: General Release — PD ────────────────────────────────────────────────
function ReleasePDTab() {
  const WHIP_STATES = ["MD", "VA", "PA", "FL", "IL", "GA", "MA", "DC", "NJ", "NY"];
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
  const [emailDraft, setEmailDraft] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [aiValidation, setAiValidation] = useState("");
  const [aiValidating, setAiValidating] = useState(false);
  const emailMutation = trpc.docgen.generateSettlementEmail.useMutation();
  const validateMutation = trpc.docgen.validateReleaseLanguage.useMutation();

  const set = (k: keyof typeof form) => (v: string | boolean) =>
    setForm((p) => ({ ...p, [k]: v }));

  const today = new Date().toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });

  const minorLine = form.isMinor ? ` (Minor, by Guardian: ${form.minorGuardianName || "[Guardian Name]"})` : "";
  const minorBlock = form.isMinor
    ? `MINOR CLAIMANT PROVISION: The undersigned Guardian/Parent represents that they have the legal authority to execute this release on behalf of the minor claimant, ${form.claimantName || "[Minor's Name]"}, and that this settlement is in the best interest of the minor. Court approval may be required under applicable state law for settlements involving minors.\n\n`
    : "";
  const minorSig = form.isMinor ? `\n_________________________________\n${form.minorGuardianName || "[Guardian Name]"} — Guardian/Parent\n` : "";

  const releaseText = [
    "GENERAL RELEASE OF ALL CLAIMS — PROPERTY DAMAGE",
    "FOR SETTLEMENT PURPOSES ONLY",
    "",
    `Date: ${today}`,
    "",
    `Claimant: ${form.claimantName || "[Claimant Name]"}${minorLine}`,
    `Claim Number: ${form.claimNumber || "[Claim Number]"}`,
    `Date of Loss: ${form.dateOfLoss || "[Date of Loss]"}`,
    `Vehicle: ${form.vehicle || "[Vehicle]"} | VIN: ${form.vin || "[VIN]"}`,
    `Settlement Amount: $${form.settlementAmount || "[Amount]"}`,
    `State: ${form.state}`,
    "",
    `In consideration of the payment of ${form.settlementAmount ? "$" + form.settlementAmount : "[Settlement Amount]"} ("Settlement Amount"), the receipt and sufficiency of which are hereby acknowledged, the undersigned Releasor(s) hereby release and forever discharge Metrocars Leasing Corp d/b/a Whip, Whip Claims Management, their officers, directors, employees, agents, successors, and assigns (collectively "Released Parties") from any and all claims, demands, actions, causes of action, damages, losses, costs, and expenses of any kind or nature whatsoever, known or unknown, arising out of or related to the incident described above, including but not limited to all property damage claims, repair costs, diminished value, loss of use, and any other damages of any kind.`,
    "",
    "This Release is intended to be a full and final settlement of all property damage claims arising from the above-referenced incident. No title transfer is required. The Releasor acknowledges that this settlement is a compromise of a disputed claim and does not constitute an admission of liability by any of the Released Parties.",
    "",
    minorBlock + "The Releasor represents and warrants that: (1) they have the full legal authority to execute this Release; (2) they have not assigned or transferred any claims released herein; and (3) they have had the opportunity to consult with legal counsel prior to executing this Release.",
    "",
    "RELEASOR SIGNATURE:",
    "",
    "_________________________________    Date: _______________",
    form.claimantName || "[Claimant Name]",
    minorSig,
    "_________________________________",
    "Printed Name",
    "",
    "_________________________________",
    "Address",
    "",
    "Accepted by:",
    form.adjusterName || "[Adjuster Name]",
    "Whip Claims Management",
  ].join("\n");

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

  const handleValidate = async () => {
    if (!form.claimantName || !form.settlementAmount) {
      toast.error("Fill in Claimant Name and Settlement Amount first");
      return;
    }
    setAiValidating(true);
    try {
      const result = await validateMutation.mutateAsync({
        releaseType: "pd",
        state: form.state,
        claimantName: form.claimantName,
        settlementAmount: form.settlementAmount,
        isMinor: form.isMinor,
        guardianName: form.minorGuardianName,
        isCarrierPayee: form.isCarrierPayee,
        carrierName: form.carrierName,
      });
      setAiValidation(result.review);
      toast.success("AI validation complete");
    } catch (e: unknown) {
      toast.error((e as Error).message || "AI error");
    } finally {
      setAiValidating(false);
    }
  };

  const handleDownload = () => {
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    let y = addWhipLetterhead(doc, "GENERAL RELEASE — PROPERTY DAMAGE", `Claim #${form.claimNumber || "[Claim Number]"} — FOR SETTLEMENT PURPOSES ONLY`);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    y = wrapText(doc, releaseText, 14, y, W - 28, 5);
    addSOLNotice(doc, form.state);
    addLetterFooter(doc);
    downloadPDF(doc, `Whip_Release_PD_${form.claimNumber || "Draft"}.pdf`);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div>
        <Panel title="Release Details" tag="REQUIRED">
          <Grid3>
            <Field label="Claimant Name" id="rpd-name" value={form.claimantName} onChange={set("claimantName")} placeholder="Last, First" required />
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
                <div className="text-xs font-semibold">Carrier / Subrogation Payee</div>
                <div className="text-xs text-muted-foreground">Payment issued to carrier, not claimant directly</div>
              </div>
            </label>
            {form.isCarrierPayee && (
              <div className="ml-7">
                <Field label="Carrier Name" id="rpd-carrier" value={form.carrierName} onChange={set("carrierName")} placeholder="e.g. GEICO" />
              </div>
            )}
          </div>
        </Panel>
        <Panel title="Handler Info">
          <Grid2>
            <Field label="Handler Name" id="rpd-handler" value={form.adjusterName} onChange={set("adjusterName")} placeholder="e.g. Jane Smith" />
            <Field label="Recipient Email" id="rpd-email" value={form.recipientEmail} onChange={set("recipientEmail")} placeholder="claimant@email.com" />
          </Grid2>
        </Panel>
        <Panel title="AI Tools" tag="AI">
          <div className="flex gap-2 flex-wrap mb-3">
            <Button variant="outline" size="sm" className="gap-1.5 border-[#ff6221]/40 text-[#ff6221] hover:bg-[#ff6221]/10" onClick={handleValidate} disabled={aiValidating}>
              {aiValidating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
              {aiValidating ? "Validating..." : "✨ Validate Release Language"}
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 border-[#ff6221]/40 text-[#ff6221] hover:bg-[#ff6221]/10" onClick={handleGenerateEmail} disabled={emailLoading}>
              {emailLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
              {emailLoading ? "Generating..." : "Generate Email Draft"}
            </Button>
          </div>
          {aiValidation && (
            <div className="border border-border rounded-md overflow-hidden mb-3">
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b border-border">
                <CheckCircle className="w-3.5 h-3.5 text-[#ff6221]" />
                <span className="text-xs font-semibold flex-1">AI Language Validation</span>
                <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs" onClick={() => { navigator.clipboard.writeText(aiValidation); toast.success("Copied"); }}>
                  <Copy className="w-3 h-3" /> Copy
                </Button>
              </div>
              <pre className="p-3 text-xs whitespace-pre-wrap text-foreground/80 max-h-[250px] overflow-y-auto">{aiValidation}</pre>
            </div>
          )}
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
      />
    </div>
  );
}

// ─── Tab: TL Settlement & Release ─────────────────────────────────────────────
function TLSettlementTab() {
  const WHIP_STATES = ["MD", "VA", "PA", "FL", "IL", "GA", "MA", "DC", "NJ", "NY"];
  const [form, setForm] = useState({
    claimantName: "",
    claimNumber: "",
    dateOfLoss: "",
    vehicle: "",
    vin: "",
    market: "MD",
    acv: "",
    priorPayment: "",
    lienHolder: "",
    lienPayoff: "",
    storageDeducted: "",
    rentalCutoffDate: "",
    adjusterName: "",
    additionalNotes: "",
  });
  const [otherDeductions, setOtherDeductions] = useState<{label: string; amount: string}[]>([]);
  const [aiLetter, setAiLetter] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const aiMutation = trpc.docgen.generateTLSettlementLetter.useMutation();

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const netAmount = (() => {
    const acv = parseFloat(form.acv) || 0;
    const prior = parseFloat(form.priorPayment) || 0;
    const lien = parseFloat(form.lienPayoff) || 0;
    const storage = parseFloat(form.storageDeducted) || 0;
    const other = otherDeductions.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);
    const net = acv - prior - lien - storage - other;
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
    "SETTLEMENT BREAKDOWN:",
    `Actual Cash Value (ACV):                  $${form.acv || "[ACV]"}`,
    ...deductionLines,
    "─────────────────────────────────────────────────",
    `Net Amount Payable to Claimant:           $${netAmount}`,
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
        otherDeductions: otherDeductions.filter(d => d.label && d.amount),
        netAmount,
        adjusterName: form.adjusterName,
        rentalCutoffDate: form.rentalCutoffDate,
        additionalNotes: form.additionalNotes,
      });
      setAiLetter(result.letter);
      toast.success("Felsenburg letter generated");
    } catch (e: unknown) {
      toast.error((e as Error).message || "AI error");
    } finally {
      setAiLoading(false);
    }
  };

  const handleDownload = () => {
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    let y = addWhipLetterhead(doc, "TOTAL LOSS SETTLEMENT OFFER", `Claim #${form.claimNumber || "[Claim Number]"} — FOR SETTLEMENT PURPOSES ONLY`);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    const textToRender = aiLetter || preview;
    y = wrapText(doc, textToRender, 14, y, W - 28, 5);
    addSOLNotice(doc);
    addLetterFooter(doc);
    downloadPDF(doc, `Whip_TLSettlement_${form.claimNumber || "Draft"}.pdf`);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div>
        <Panel title="Claim Details" tag="REQUIRED">
          <Grid3>
            <Field label="Claimant Name" id="tls-name" value={form.claimantName} onChange={set("claimantName")} placeholder="Last, First" required />
            <Field label="Claim Number" id="tls-claim" value={form.claimNumber} onChange={set("claimNumber")} placeholder="e.g. PF438367" />
            <Field label="Date of Loss" id="tls-dol" value={form.dateOfLoss} onChange={set("dateOfLoss")} type="date" />
          </Grid3>
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
        <Panel title="Settlement Breakdown (Felsenburg Format)">
          <div className="space-y-3">
            <Field label="ACV / Gross Settlement ($)" id="tls-acv" value={form.acv} onChange={set("acv")} placeholder="e.g. 18500.00" />
            <Field label="Less: Prior Payment to Claimant ($)" id="tls-prior" value={form.priorPayment} onChange={set("priorPayment")} placeholder="e.g. 0.00" />
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
        </Panel>
        <Panel title="Additional Details">
          <Grid2 children={<>
            <Field label="Rental Cutoff Date" id="tls-rental" value={form.rentalCutoffDate} onChange={set("rentalCutoffDate")} type="date" />
            <Field label="Handler Name" id="tls-handler" value={form.adjusterName} onChange={set("adjusterName")} placeholder="e.g. Jane Smith" />
          </>} />
          <div className="mt-3">
            <Field label="Additional Notes" id="tls-notes" value={form.additionalNotes} onChange={set("additionalNotes")} placeholder="Any additional context for the letter..." />
          </div>
        </Panel>
        <Panel title="AI Letter Generation" tag="AI">
          <p className="text-xs text-muted-foreground mb-3">Generate a professional Felsenburg-format total loss settlement letter with the breakdown above.</p>
          <Button variant="outline" size="sm" className="gap-1.5 border-[#ff6221]/40 text-[#ff6221] hover:bg-[#ff6221]/10 mb-3" onClick={handleGenerateLetter} disabled={aiLoading}>
            {aiLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
            {aiLoading ? "Generating..." : "✨ Generate Felsenburg Letter"}
          </Button>
          {aiLetter && (
            <div className="border border-border rounded-md overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b border-border">
                <FileText className="w-3.5 h-3.5 text-[#ff6221]" />
                <span className="text-xs font-semibold flex-1">AI Letter Draft</span>
                <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs" onClick={() => { navigator.clipboard.writeText(aiLetter); toast.success("Copied"); }}>
                  <Copy className="w-3 h-3" /> Copy
                </Button>
                <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs text-[#ff6221]" onClick={handleGenerateLetter} disabled={aiLoading}>
                  <RefreshCw className="w-3 h-3" /> Regen
                </Button>
              </div>
              <pre className="p-3 text-xs whitespace-pre-wrap text-foreground/80 max-h-[300px] overflow-y-auto">{aiLetter}</pre>
            </div>
          )}
        </Panel>
      </div>
      <PreviewPanel
        text={aiLetter || preview}
        onCopy={() => { navigator.clipboard.writeText(aiLetter || preview); toast.success("Copied"); }}
        onDownload={handleDownload}
      />
    </div>
  );
}

// ─── Tab: Subro Demand Letter ─────────────────────────────────────────────────
function SubroDemandTab() {
  const [form, setForm] = useState({
    carrier: "",
    adjusterName: "",
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
    dv: "",
    lou: "",
    valuation: "",
  });

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const total = (() => {
    const r = parseFloat(form.repair) || 0;
    const t = parseFloat(form.tow) || 0;
    const d = parseFloat(form.dv) || 0;
    const l = parseFloat(form.lou) || 0;
    if (form.demandType === "total-loss") {
      const v = parseFloat(form.valuation) || 0;
      return (v + t + d + l).toFixed(2);
    }
    return (r + t + d + l).toFixed(2);
  })();

  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const preview = `${today}

Whip Claims Management
P.O. Box 10622
Rockville, MD 20849
claims@drivewhip.com

${form.carrier || "[Insurance Company]"}
Attn: ${form.adjusterName || "[Adjuster Name]"}

Re: SUBROGATION DEMAND — FOR SETTLEMENT PURPOSES ONLY
    Our Claim #: ${form.ourClaim || "[Our Claim #]"}
    Your Claim #: ${form.advClaim || "[Their Claim #]"}
    Date of Loss: ${form.dol || "[Date of Loss]"}
    Driver / Claimant: ${form.driver || "[Driver Name]"}
    Vehicle: ${form.vehicle || "[Vehicle]"} | VIN: ${form.vin || "[VIN]"}

Dear ${form.adjusterName || "[Adjuster Name]"},

Please be advised that this office represents Metrocars Leasing Corp d/b/a Whip Claims Management with respect to the above-referenced claim. We are writing to demand reimbursement for damages sustained as a result of the above-referenced incident.

DEMAND SUMMARY:
${form.demandType === "total-loss" ? `Vehicle Valuation (ACV):        $${form.valuation || "0.00"}` : `Repair Estimate:                $${form.repair || "0.00"}`}
${form.tow ? `Towing / Transport:             $${form.tow}` : ""}
${form.dv ? `Diminished Value:               $${form.dv}` : ""}
${form.lou ? `Loss of Use / Rental:           $${form.lou}` : ""}
─────────────────────────────────────────
TOTAL DEMAND:                   $${total}

Please respond to this demand and remit payment within ${form.deadline || "15"} days of the date of this letter.

ATTACHMENTS: ${form.attachments || "Estimate, Image Report, Police Report"}

Sincerely,

Whip Claims Management
P.O. Box 10622, Rockville, MD 20849
claims@drivewhip.com`;

  const handleDownload = () => {
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    let y = addWhipLetterhead(doc, "SUBROGATION DEMAND", "FOR SETTLEMENT PURPOSES ONLY");
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    y = wrapText(doc, preview, 14, y, W - 28, 5);
    addSOLNotice(doc);
    addLetterFooter(doc);
    downloadPDF(doc, `Whip_SubroDemand_${form.ourClaim || "Draft"}.pdf`);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div>
        <Panel title="Claim Information" tag="REQUIRED">
          <Grid3>
            <Field label="Insurance Company" id="sd-carrier" value={form.carrier} onChange={set("carrier")} placeholder="e.g. State Farm" required />
            <Field label="Adjuster Name" id="sd-adjuster" value={form.adjusterName} onChange={set("adjusterName")} placeholder="e.g. John Smith" />
            <Field label="Their Claim #" id="sd-advclaim" value={form.advClaim} onChange={set("advClaim")} placeholder="e.g. 2091T657S" />
          </Grid3>
          <Grid3 children={<>
            <Field label="Our Claim # (Whip)" id="sd-claim" value={form.ourClaim} onChange={set("ourClaim")} placeholder="e.g. PF438367" />
            <Field label="Date of Loss" id="sd-dol" value={form.dol} onChange={set("dol")} type="date" />
            <Field label="Driver / Claimant Name" id="sd-driver" value={form.driver} onChange={set("driver")} placeholder="Last, First" />
          </>} />
          <Grid3 children={<>
            <Field label="Vehicle (Year/Make/Model)" id="sd-vehicle" value={form.vehicle} onChange={set("vehicle")} placeholder="e.g. 2024 Tesla Model 3" />
            <Field label="VIN" id="sd-vin" value={form.vin} onChange={set("vin")} placeholder="17-character VIN" />
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Response Deadline</Label>
              <Select value={form.deadline} onValueChange={set("deadline")}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["10","14","15","20"].map(v => <SelectItem key={v} value={v}>{v} days</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </>} />
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
          <div className="mt-3 p-2 bg-[#ff6221]/10 rounded border border-[#ff6221]/20">
            <div className="text-xs font-mono font-bold text-[#ff6221]">TOTAL DEMAND: ${total}</div>
          </div>
          <div className="mt-3">
            <Field label="Attachments" id="sd-attachments" value={form.attachments} onChange={set("attachments")} placeholder="e.g. Estimate, Image Report, Police Report" />
          </div>
        </Panel>
      </div>
      <PreviewPanel
        text={preview}
        onCopy={() => { navigator.clipboard.writeText(preview); toast.success("Copied"); }}
        onDownload={handleDownload}
      />
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

function CarrierRebuttalTab() {
  const [form, setForm] = useState({
    claimNumber: "",
    theirClaimNumber: "",
    vehicle: "",
    dateOfLoss: "",
    carrier: "",
    adjuster: "",
    accidentType: "",
  });
  const [lineItems, setLineItems] = useState<RebuttalLineItem[]>([
    { item: "", ours: "", theirs: "", reason: "" },
  ]);
  const [draft, setDraft] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [polishLoading, setPolishLoading] = useState(false);
  const [carrierDoc, setCarrierDoc] = useState<File | null>(null);
  const [docUploading, setDocUploading] = useState(false);
  const generateMutation = trpc.docgen.generateRebuttal.useMutation();
  const polishMutation = trpc.docgen.polishRebuttal.useMutation();

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const setItem = (i: number, k: keyof RebuttalLineItem) => (v: string) =>
    setLineItems((prev) =>
      prev.map((row, idx) => (idx === i ? { ...row, [k]: v } : row))
    );

  const addItem = () =>
    setLineItems((prev) => [...prev, { item: "", ours: "", theirs: "", reason: "" }]);

  const removeItem = (i: number) =>
    setLineItems((prev) => prev.filter((_, idx) => idx !== i));

  const totalOurs = lineItems.reduce((s, r) => s + (parseFloat(r.ours) || 0), 0);
  const totalTheirs = lineItems.reduce((s, r) => s + (parseFloat(r.theirs) || 0), 0);
  const totalGap = totalOurs - totalTheirs;

  const handleGenerate = async () => {
    if (!form.claimNumber || !form.vehicle || !form.carrier) {
      toast.error("Fill in Claim #, Vehicle, and Carrier first");
      return;
    }
    setAiLoading(true);
    try {
      const result = await generateMutation.mutateAsync({
        ...form,
        lineItems: lineItems.map((r) => ({
          item: r.item,
          ours: parseFloat(r.ours) || 0,
          theirs: parseFloat(r.theirs) || 0,
          reason: r.reason,
        })),
      });
      setDraft(result.letter);
      toast.success("Rebuttal generated");
    } catch (e: unknown) {
      toast.error((e as Error).message || "AI error");
    } finally {
      setAiLoading(false);
    }
  };

  const handlePolish = async () => {
    if (!draft.trim()) {
      toast.error("Generate or enter a draft first");
      return;
    }
    setPolishLoading(true);
    try {
      const result = await polishMutation.mutateAsync({
        draft,
        ...form,
      });
      setDraft(result.polished);
      toast.success("Draft polished");
    } catch (e: unknown) {
      toast.error((e as Error).message || "AI error");
    } finally {
      setPolishLoading(false);
    }
  };

  const handleDownload = () => {
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    let y = addWhipLetterhead(doc, "CARRIER REBUTTAL", `Claim #${form.claimNumber || "[Claim Number]"} — ${form.carrier || "[Carrier]"}`);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    y = wrapText(doc, draft || "(No draft yet)", 14, y, W - 28, 5);
    addSOLNotice(doc);
    addLetterFooter(doc);
    downloadPDF(doc, `Whip_Rebuttal_${form.claimNumber || "Draft"}.pdf`);
  };

  return (
    <div className="space-y-4">
      <Panel title="Claim Details" tag="REQUIRED">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Our Claim #" id="rb-claim" value={form.claimNumber} onChange={set("claimNumber")} placeholder="e.g. PF438367" required />
          <Field label="Their Claim #" id="rb-theirclaim" value={form.theirClaimNumber} onChange={set("theirClaimNumber")} placeholder="Carrier's claim number" />
          <Field label="Date of Loss" id="rb-dol" value={form.dateOfLoss} onChange={set("dateOfLoss")} type="date" />
          <Field label="Vehicle" id="rb-vehicle" value={form.vehicle} onChange={set("vehicle")} placeholder="e.g. 2024 Toyota Camry" required />
          <Field label="Adverse Carrier" id="rb-carrier" value={form.carrier} onChange={set("carrier")} placeholder="e.g. GEICO" required />
          <Field label="Adjuster Name" id="rb-adjuster" value={form.adjuster} onChange={set("adjuster")} placeholder="e.g. Jane Smith" />
        </div>
        <div className="mt-3">
          <Field label="Accident Type (optional)" id="rb-type" value={form.accidentType} onChange={set("accidentType")} placeholder="e.g. Rear-end, T-bone, Sideswipe" />
        </div>
      </Panel>

      <Panel title="Carrier Document Upload (Optional)">
        <p className="text-xs text-muted-foreground mb-3">Upload the carrier's estimate, denial letter, or valuation report to let AI extract disputed items automatically.</p>
        <div className="border-2 border-dashed border-border rounded-lg p-4 text-center hover:border-[#ff6221]/40 transition-colors">
          <input
            type="file"
            id="cr-doc-upload"
            accept=".pdf,.docx,.doc,.png,.jpg,.jpeg"
            className="hidden"
            onChange={(e) => setCarrierDoc(e.target.files?.[0] || null)}
          />
          <label htmlFor="cr-doc-upload" className="cursor-pointer">
            {carrierDoc ? (
              <div className="flex items-center justify-center gap-2">
                <FileText className="w-4 h-4 text-[#ff6221]" />
                <span className="text-xs font-medium text-[#ff6221]">{carrierDoc.name}</span>
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-muted-foreground" onClick={(e) => { e.preventDefault(); setCarrierDoc(null); }}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ) : (
              <div>
                <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">Drop carrier document here or <span className="text-[#ff6221]">browse</span></p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">PDF, DOCX, PNG, JPG (Max 50MB)</p>
              </div>
            )}
          </label>
        </div>
        {carrierDoc && (
          <Button
            size="sm"
            className="mt-2 gap-1.5 text-xs h-7 bg-[#ff6221] hover:bg-[#e5541a] text-white"
            disabled={docUploading || aiLoading}
            onClick={async () => {
              setDocUploading(true);
              try {
                const fd = new FormData();
                fd.append("file", carrierDoc);
                const res = await fetch("/api/upload/document", { method: "POST", body: fd });
                if (!res.ok) throw new Error("Upload failed");
                const { url } = await res.json() as { url: string };
                setDocUploading(false);
                setAiLoading(true);
                const result = await generateMutation.mutateAsync({
                  ...form,
                  lineItems: lineItems.map((r) => ({ item: r.item, ours: parseFloat(r.ours) || 0, theirs: parseFloat(r.theirs) || 0, reason: r.reason })),
                  carrierDocUrl: url,
                });
                setDraft(result.letter);
                toast.success("Rebuttal generated from uploaded document");
              } catch (e: unknown) {
                toast.error((e as Error).message || "Upload or generation failed");
              } finally {
                setDocUploading(false);
                setAiLoading(false);
              }
            }}
          >
            {(docUploading || aiLoading) ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {docUploading ? "Uploading..." : aiLoading ? "Analyzing..." : "Upload & Generate Rebuttal"}
          </Button>
        )}
      </Panel>

      <Panel title="Disputed Line Items">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-1.5 pr-2 font-semibold text-foreground/70 w-[30%]">Line Item</th>
                <th className="text-left py-1.5 pr-2 font-semibold text-foreground/70 w-[15%]">Our Amount</th>
                <th className="text-left py-1.5 pr-2 font-semibold text-foreground/70 w-[15%]">Their Offer</th>
                <th className="text-left py-1.5 pr-2 font-semibold text-foreground/70 w-[30%]">Carrier Reason</th>
                <th className="w-[10%]"></th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((row, i) => (
                <tr key={i} className="border-b border-border/50">
                  <td className="py-1 pr-2">
                    <Input value={row.item} onChange={(e) => setItem(i, "item")(e.target.value)} placeholder="e.g. Labor — Frame" className="h-7 text-xs" />
                  </td>
                  <td className="py-1 pr-2">
                    <Input value={row.ours} onChange={(e) => setItem(i, "ours")(e.target.value)} placeholder="0.00" type="number" className="h-7 text-xs" />
                  </td>
                  <td className="py-1 pr-2">
                    <Input value={row.theirs} onChange={(e) => setItem(i, "theirs")(e.target.value)} placeholder="0.00" type="number" className="h-7 text-xs" />
                  </td>
                  <td className="py-1 pr-2">
                    <Input value={row.reason} onChange={(e) => setItem(i, "reason")(e.target.value)} placeholder="e.g. Betterment applied" className="h-7 text-xs" />
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
          <div className="text-xs text-foreground/60 space-x-4">
            <span>Our total: <strong className="text-foreground">${totalOurs.toFixed(2)}</strong></span>
            <span>Their offer: <strong className="text-foreground">${totalTheirs.toFixed(2)}</strong></span>
            <span>Gap: <strong className="text-[#ff6221]">${totalGap.toFixed(2)}</strong></span>
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div>
          <Panel title="Draft Rebuttal" tag="AI">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="AI-generated rebuttal will appear here. You can also type or paste a draft to polish."
              rows={14}
              className="text-xs font-mono resize-y"
            />
            <div className="mt-3 flex gap-2 flex-wrap">
              <Button
                size="sm"
                className="gap-1.5 text-xs h-7 bg-[#ff6221] hover:bg-[#e5541a] text-white"
                onClick={handleGenerate}
                disabled={aiLoading}
              >
                {aiLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {aiLoading ? "Generating..." : "AI Generate"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs h-7 border-[#ff6221]/40 text-[#ff6221] hover:bg-[#ff6221]/10"
                onClick={handlePolish}
                disabled={polishLoading}
              >
                {polishLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {polishLoading ? "Polishing..." : "AI Polish Draft"}
              </Button>
            </div>
          </Panel>
        </div>
        <PreviewPanel
          text={draft}
          onCopy={() => { navigator.clipboard.writeText(draft); toast.success("Copied"); }}
          onDownload={handleDownload}
        />
      </div>
    </div>
  );
}

// ─── Tab: Payment Receipt ─────────────────────────────────────────────────────
function PaymentReceiptTab() {
  const [form, setForm] = useState({
    claimNumber: "",
    dateOfLoss: "",
    paymentDate: "",
    payeeName: "",
    payeeAddress: "",
    paymentAmount: "",
    paymentMethod: "check",
    checkNumber: "",
    paymentPurpose: "property_damage",
    adjusterName: "",
    notes: "",
  });

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const purposeLabels: Record<string, string> = {
    property_damage: "Property Damage Settlement",
    bodily_injury: "Bodily Injury Settlement",
    total_loss: "Total Loss Settlement",
    rental: "Rental Reimbursement",
    towing: "Towing & Storage",
    medical: "Medical Expense Reimbursement",
    other: "Other",
  };

  const methodLabels: Record<string, string> = {
    check: "Check",
    ach: "ACH / Direct Deposit",
    wire: "Wire Transfer",
    zelle: "Zelle",
    venmo: "Venmo",
  };

  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const preview = `WHIP CLAIMS MANAGEMENT
PAYMENT RECEIPT / PROOF OF PAYMENT

Date: ${form.paymentDate || today}
Claim Number: ${form.claimNumber || "[Claim Number]"}
Date of Loss: ${form.dateOfLoss || "[Date of Loss]"}

─────────────────────────────────────────────────────────
PAYEE INFORMATION
─────────────────────────────────────────────────────────
Name: ${form.payeeName || "[Payee Name]"}
Address: ${form.payeeAddress || "[Payee Address]"}

─────────────────────────────────────────────────────────
PAYMENT DETAILS
─────────────────────────────────────────────────────────
Payment Purpose: ${purposeLabels[form.paymentPurpose] || form.paymentPurpose}
Payment Amount: $${form.paymentAmount || "0.00"}
Payment Method: ${methodLabels[form.paymentMethod] || form.paymentMethod}${form.checkNumber ? `\nCheck / Reference #: ${form.checkNumber}` : ""}

─────────────────────────────────────────────────────────
This document confirms that the above payment has been issued by Whip Claims Management / Metrocars Leasing Corp in connection with the referenced claim. This payment is issued in full and final settlement of the above-referenced claim and does not constitute an admission of liability.
${form.notes ? `\nAdditional Notes:\n${form.notes}` : ""}

─────────────────────────────────────────────────────────
Authorized By: ${form.adjusterName || "[Adjuster Name]"}
Whip Claims Management
P.O. Box 10622, Rockville, MD 20849
claims@drivewhip.com`;

  const handleDownload = () => {
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    let y = addWhipLetterhead(doc, "PAYMENT RECEIPT", `Claim #${form.claimNumber || "[Claim Number]"} — ${form.paymentDate || today}`);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);

    // Payee section
    doc.setFont("helvetica", "bold");
    doc.text("PAYEE INFORMATION", 14, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.text(`Name: ${form.payeeName || "[Payee Name]"}`, 14, y); y += 5;
    doc.text(`Address: ${form.payeeAddress || "[Payee Address]"}`, 14, y); y += 8;

    // Payment section
    doc.setFont("helvetica", "bold");
    doc.text("PAYMENT DETAILS", 14, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.text(`Purpose: ${purposeLabels[form.paymentPurpose] || form.paymentPurpose}`, 14, y); y += 5;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...WHIP_ORANGE);
    doc.text(`$${form.paymentAmount || "0.00"}`, 14, y); y += 7;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    doc.text(`Method: ${methodLabels[form.paymentMethod] || form.paymentMethod}`, 14, y); y += 5;
    if (form.checkNumber) { doc.text(`Check / Reference #: ${form.checkNumber}`, 14, y); y += 5; }
    y += 4;

    // Disclaimer
    const disclaimer = "This document confirms that the above payment has been issued by Whip Claims Management / Metrocars Leasing Corp in connection with the referenced claim. This payment is issued in full and final settlement of the above-referenced claim and does not constitute an admission of liability.";
    y = wrapText(doc, disclaimer, 14, y, W - 28, 5);
    y += 6;
    if (form.notes) { y = wrapText(doc, `Notes: ${form.notes}`, 14, y, W - 28, 5); y += 4; }

    doc.setFont("helvetica", "bold");
    doc.text(`Authorized By: ${form.adjusterName || "[Adjuster Name]"}`, 14, y); y += 5;
    doc.setFont("helvetica", "normal");
    doc.text("Whip Claims Management", 14, y);

    addSOLNotice(doc);
    addLetterFooter(doc);
    downloadPDF(doc, `Whip_PaymentReceipt_${form.claimNumber || "Draft"}.pdf`);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div>
        <Panel title="Claim & Payment Details" tag="REQUIRED">
          <Grid3>
            <Field label="Claim Number" id="pr-claim" value={form.claimNumber} onChange={set("claimNumber")} placeholder="e.g. PF438367" required />
            <Field label="Date of Loss" id="pr-dol" value={form.dateOfLoss} onChange={set("dateOfLoss")} type="date" />
            <Field label="Payment Date" id="pr-date" value={form.paymentDate} onChange={set("paymentDate")} type="date" />
          </Grid3>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Payee Name" id="pr-payee" value={form.payeeName} onChange={set("payeeName")} placeholder="Full legal name" required />
            <Field label="Payee Address" id="pr-addr" value={form.payeeAddress} onChange={set("payeeAddress")} placeholder="123 Main St, City, ST 00000" />
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-foreground/80">Payment Purpose</Label>
              <Select value={form.paymentPurpose} onValueChange={set("paymentPurpose")}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(purposeLabels).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Field label="Payment Amount ($)" id="pr-amount" value={form.paymentAmount} onChange={set("paymentAmount")} placeholder="0.00" type="number" required />
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-foreground/80">Payment Method</Label>
              <Select value={form.paymentMethod} onValueChange={set("paymentMethod")}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(methodLabels).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Field label="Check / Reference #" id="pr-check" value={form.checkNumber} onChange={set("checkNumber")} placeholder="e.g. 10042" />
          </div>
          <div className="mt-3">
            <Field label="Authorized By (Adjuster)" id="pr-adjuster" value={form.adjusterName} onChange={set("adjusterName")} placeholder="Adjuster name" />
          </div>
          <div className="mt-3">
            <TextareaField label="Additional Notes (optional)" id="pr-notes" value={form.notes} onChange={set("notes")} placeholder="Any additional notes about this payment..." rows={3} />
          </div>
        </Panel>
      </div>
      <PreviewPanel
        text={preview}
        onCopy={() => { navigator.clipboard.writeText(preview); toast.success("Copied"); }}
        onDownload={handleDownload}
      />
    </div>
  );
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
  { id: "local", name: "Local Tow Company", logo: "LOCAL", color: "#555555", address: "", phone: "" },
  { id: "other", name: "Other Provider", logo: "OTHER", color: "#888888", address: "", phone: "" },
];

function UrgentlyInvoiceTab() {
  const [provider, setProvider] = useState("urgently");
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

Invoice #: ${form.invoiceNumber || "[Invoice Number]"}
Invoice Date: ${form.invoiceDate || today}
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
${form.notes ? `\nNotes: ${form.notes}\n` : ""}
Authorized By: ${form.adjusterName || "[Adjuster Name]"}
Whip Claims Management`;

  const handleDownload = () => {
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
    doc.text(`Invoice #: ${form.invoiceNumber || "N/A"}  |  Claim #: ${form.claimNumber || "N/A"}  |  ${form.invoiceDate || today}`, W - 14, 13, { align: "right" });
    if (providerAddress) {
      doc.setFontSize(6.5);
      doc.text(providerAddress, W - 14, 18, { align: "right" });
    }

    let y = 28;
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
    y = wrapText(doc, `Pickup: ${form.pickupAddress || "[Pickup]"}`, 14, y, W - 28, 5);
    y = wrapText(doc, `Dropoff: ${form.dropoffAddress || "[Dropoff]"}`, 14, y, W - 28, 5);
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
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.setFont("helvetica", "normal");
    if (form.notes) { y = wrapText(doc, `Notes: ${form.notes}`, 14, y, W - 28, 5); y += 4; }
    doc.text(`Authorized By: ${form.adjusterName || "[Adjuster Name]"}`, 14, y);

    addSOLNotice(doc);
    addLetterFooter(doc);
    downloadPDF(doc, `${selectedProvider.id === "local" || selectedProvider.id === "other" ? (form.customProviderName || "Towing") : selectedProvider.name}_Invoice_${form.claimNumber || "Draft"}.pdf`);
  };

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
            <Field label="Authorized By (Adjuster)" id="ui-adjuster" value={form.adjusterName} onChange={set("adjusterName")} placeholder="Adjuster name" />
            <div className="mt-3">
              <TextareaField label="Notes (optional)" id="ui-notes" value={form.notes} onChange={set("notes")} placeholder="Any additional notes..." rows={3} />
            </div>
          </Panel>
          <PreviewPanel
            text={preview}
            onCopy={() => { navigator.clipboard.writeText(preview); toast.success("Copied"); }}
            onDownload={handleDownload}
          />
        </div>
      </div>
    </div>
  );
}

// ─── PIP Exhaustion Tab ───────────────────────────────────────────────────────
function PIPExhaustionTab() {
  const [state, setState] = useState<"fl" | "pa" | "va">("fl");
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
      const { url } = await res.json() as { url: string };
      setDocUploading(false);
      toast.info("Parsing document — this may take 20–30 seconds...");
      const result = await parseMutation.mutateAsync({ fileUrl: url, state });
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

  const handleDownload = () => {
    const doc = new jsPDF();
    const stateLabel = state === "fl" ? "Florida" : state === "pa" ? "Pennsylvania" : "Virginia";
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
    downloadPDF(doc, `pip-exhaustion-${state}-${form.claimNo || "claim"}.pdf`);
  };

  const STATE_CHIPS: { id: "fl" | "pa" | "va"; label: string; sub: string }[] = [
    { id: "fl", label: "Florida", sub: "§627.736" },
    { id: "pa", label: "Pennsylvania", sub: "First-party medical" },
    { id: "va", label: "Virginia", sub: "Add-on PIP" },
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
          <Field label="Handler Name" id="pip-adjuster" value={form.adjuster} onChange={set("adjuster")} placeholder="Handler name" />
          <Field label="Contact Info" id="pip-contact" value={form.contactInfo} onChange={set("contactInfo")} placeholder="Phone or email" />
        </div>
      </Panel>
      <PreviewPanel
        text={preview}
        onCopy={() => { navigator.clipboard.writeText(preview); toast.success("Copied"); }}
        onDownload={handleDownload}
      />
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
    additionalContext: "",
  });
  const [emailDraft, setEmailDraft] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [aiValidation, setAiValidation] = useState("");
  const [aiValidating, setAiValidating] = useState(false);
  const emailMutation = trpc.docgen.generateSettlementEmail.useMutation();
  const validateMutation = trpc.docgen.validateReleaseLanguage.useMutation();

  const set = (k: keyof typeof form) => (v: string | boolean) =>
    setForm((p) => ({ ...p, [k]: v }));

  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const releaseText = `LIMITED LIABILITY RELEASE — BODILY INJURY
FOR SETTLEMENT PURPOSES ONLY — GEORGIA

Date: ${today}

Claimant: ${form.claimantName || "[Claimant Name]"}${form.isMinor ? ` (Minor, by Guardian: ${form.minorGuardianName || "[Guardian Name]"})` : ""}
Claim Number: ${form.claimNumber || "[Claim Number]"}
Date of Loss: ${form.dateOfLoss || "[Date of Loss]"}
Vehicle: ${form.vehicle || "[Vehicle]"}
Settlement Amount: $${form.settlementAmount || "[Amount]"}

In consideration of the payment of ${form.settlementAmount ? `$${form.settlementAmount}` : "[Settlement Amount]"} ("Settlement Amount"), the receipt and sufficiency of which are hereby acknowledged, the undersigned Releasor(s) hereby release and forever discharge Metrocars Leasing Corp d/b/a Whip, Whip Claims Management, their officers, directors, employees, agents, successors, and assigns (collectively "Released Parties") from any and all claims, demands, actions, causes of action, damages, losses, costs, and expenses of any kind or nature whatsoever, known or unknown, arising out of or related to the incident described above, including but not limited to all bodily injury claims, medical expenses, lost wages, pain and suffering, and any other damages of any kind.

GEORGIA LIMITED LIABILITY PROVISION: This release is executed pursuant to O.C.G.A. § 33-7-11 and applicable Georgia law. The Released Parties' liability, if any, is limited to the applicable policy limits. This release does not constitute an admission of liability by any Released Party.

${form.isMinor ? `MINOR CLAIMANT PROVISION: The undersigned Guardian/Parent represents that they have the legal authority to execute this release on behalf of the minor claimant, ${form.claimantName || "[Minor's Name]"}, and that this settlement is in the best interest of the minor. Court approval may be required under Georgia law for settlements involving minors. Consult with an attorney to confirm whether court approval is required in this matter.\n\n` : ""}The Releasor represents and warrants that: (1) they have the full legal authority to execute this Release; (2) they have not assigned or transferred any claims released herein; and (3) they have had the opportunity to consult with legal counsel prior to executing this Release.

RELEASOR SIGNATURE:

_________________________________    Date: _______________
${form.claimantName || "[Claimant Name]"}
${form.isMinor ? `\n_________________________________\n${form.minorGuardianName || "[Guardian Name]"} — Guardian/Parent\n` : ""}
_________________________________
Printed Name

_________________________________
Address

Accepted by:
${form.adjusterName || "[Adjuster Name]"}
Whip Claims Management`;

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

  const handleValidate = async () => {
    if (!form.claimantName || !form.settlementAmount) {
      toast.error("Fill in Claimant Name and Settlement Amount first");
      return;
    }
    setAiValidating(true);
    try {
      const result = await validateMutation.mutateAsync({
        releaseType: "limited_bi",
        state: form.state || "Georgia",
        claimantName: form.claimantName,
        settlementAmount: form.settlementAmount,
        isMinor: form.isMinor,
      });
      setAiValidation(result.review);
      toast.success("AI validation complete");
    } catch (e: unknown) {
      toast.error((e as Error).message || "AI error");
    } finally {
      setAiValidating(false);
    }
  };

  const handleDownload = () => {
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    let y = addWhipLetterhead(doc, "LIMITED LIABILITY RELEASE — BI", `Claim #${form.claimNumber || "[Claim Number]"} — GEORGIA — FOR SETTLEMENT PURPOSES ONLY`);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    y = wrapText(doc, releaseText, 14, y, W - 28, 5);
    addSOLNotice(doc, "Georgia");
    addLetterFooter(doc);
    downloadPDF(doc, `Whip_LimitedLiability_BI_${form.claimNumber || "Draft"}.pdf`);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div>
        <Panel title="Release Details" tag="REQUIRED">
          <Grid3>
            <Field label="Claimant Name" id="llbi-name" value={form.claimantName} onChange={set("claimantName")} placeholder="Last, First" required />
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
            <p className="text-xs text-amber-700 dark:text-amber-400">This release includes Georgia limited liability language per O.C.G.A. § 33-7-11. Use the AI validator to confirm language is appropriate for the specific claim.</p>
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
          <div className="mt-3">
            <Field label="Additional Context (for AI validation)" id="llbi-context" value={form.additionalContext} onChange={set("additionalContext")} placeholder="e.g. claimant represented by attorney, disputed liability..." />
          </div>
        </Panel>
        <Panel title="Handler Info">
          <Grid2>
            <Field label="Handler Name" id="llbi-handler" value={form.adjusterName} onChange={set("adjusterName")} placeholder="e.g. Jane Smith" />
            <Field label="Recipient Email" id="llbi-email" value={form.recipientEmail} onChange={set("recipientEmail")} placeholder="attorney@lawfirm.com" />
          </Grid2>
        </Panel>
        <Panel title="AI Tools" tag="AI">
          <div className="flex gap-2 flex-wrap mb-3">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-[#ff6221]/40 text-[#ff6221] hover:bg-[#ff6221]/10"
              onClick={handleValidate}
              disabled={aiValidating}
            >
              {aiValidating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
              {aiValidating ? "Validating..." : "✨ Validate Release Language"}
            </Button>
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
          {aiValidation && (
            <div className="border border-border rounded-md overflow-hidden mb-3">
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b border-border">
                <CheckCircle className="w-3.5 h-3.5 text-[#ff6221]" />
                <span className="text-xs font-semibold flex-1">AI Language Validation</span>
                <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs" onClick={() => { navigator.clipboard.writeText(aiValidation); toast.success("Copied"); }}>
                  <Copy className="w-3 h-3" /> Copy
                </Button>
              </div>
              <pre className="p-3 text-xs whitespace-pre-wrap text-foreground/80 max-h-[250px] overflow-y-auto">{aiValidation}</pre>
            </div>
          )}
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
      />
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

function LOUCalculatorTab() {
  const [vehicles, setVehicles] = useState<LOUVehicle[]>([
    { id: "1", ymm: "", vin: "", dailyRate: "", startDate: "", endDate: "", days: 0, total: 0 },
  ]);
  const [claimNumber, setClaimNumber] = useState("");
  const [carrier, setCarrier] = useState("");
  const [adjuster, setAdjuster] = useState("");
  const [pushedToDemand, setPushedToDemand] = useState(false);
  const [louTotal, setLouTotal] = useState("0.00");

  const calcDays = (start: string, end: string): number => {
    if (!start || !end) return 0;
    const s = new Date(start).getTime();
    const e = new Date(end).getTime();
    const diff = Math.ceil((e - s) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  };

  const updateVehicle = (id: string, field: keyof LOUVehicle, value: string) => {
    setVehicles((prev) => {
      const updated = prev.map((v) => {
        if (v.id !== id) return v;
        const next = { ...v, [field]: value };
        if (field === "startDate" || field === "endDate" || field === "dailyRate") {
          const days = calcDays(
            field === "startDate" ? value : next.startDate,
            field === "endDate" ? value : next.endDate
          );
          const rate = parseFloat(field === "dailyRate" ? value : next.dailyRate) || 0;
          next.days = days;
          next.total = days * rate;
        }
        return next;
      });
      const total = updated.reduce((s, v) => s + v.total, 0);
      setLouTotal(total.toFixed(2));
      return updated;
    });
  };

  const addVehicle = () => {
    setVehicles((prev) => [
      ...prev,
      { id: Date.now().toString(), ymm: "", vin: "", dailyRate: "", startDate: "", endDate: "", days: 0, total: 0 },
    ]);
  };

  const removeVehicle = (id: string) => {
    if (vehicles.length === 1) return;
    const updated = vehicles.filter((v) => v.id !== id);
    const total = updated.reduce((s, v) => s + v.total, 0);
    setLouTotal(total.toFixed(2));
    setVehicles(updated);
  };

  const handlePushToDemand = () => {
    // Store LOU total in sessionStorage so SubroDemandTab can pick it up
    sessionStorage.setItem("lou_push_total", louTotal);
    sessionStorage.setItem("lou_push_claim", claimNumber);
    setPushedToDemand(true);
    toast.success(`LOU total $${louTotal} ready — open Subro Demand Letter and click "Pull from LOU Calc"`);
    setTimeout(() => setPushedToDemand(false), 4000);
  };

  const handleDownload = () => {
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    let y = addWhipLetterhead(doc, "LOSS OF USE CALCULATION", `Claim #${claimNumber || "[Claim Number]"}`);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(40, 40, 40);
    if (carrier) { doc.text(`Carrier: ${carrier}${adjuster ? ` — ${adjuster}` : ""}`, 14, y); y += 7; }
    // Table header
    doc.setFillColor(23, 27, 49);
    doc.rect(14, y, W - 28, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7.5);
    doc.text("Vehicle", 16, y + 5.5);
    doc.text("VIN", 70, y + 5.5);
    doc.text("Rate/Day", 110, y + 5.5);
    doc.text("Start", 130, y + 5.5);
    doc.text("End", 152, y + 5.5);
    doc.text("Days", 170, y + 5.5);
    doc.text("Total", 185, y + 5.5);
    y += 8;
    // Table rows
    let rowBg = false;
    for (const v of vehicles) {
      if (rowBg) { doc.setFillColor(245, 245, 250); doc.rect(14, y, W - 28, 7, "F"); }
      rowBg = !rowBg;
      doc.setTextColor(40, 40, 40);
      doc.setFont("helvetica", "normal");
      doc.text(v.ymm || "—", 16, y + 5);
      doc.text(v.vin ? v.vin.slice(-8) : "—", 70, y + 5);
      doc.text(v.dailyRate ? `$${parseFloat(v.dailyRate).toFixed(2)}` : "—", 110, y + 5);
      doc.text(v.startDate || "—", 130, y + 5);
      doc.text(v.endDate || "—", 152, y + 5);
      doc.text(String(v.days), 170, y + 5);
      doc.text(`$${v.total.toFixed(2)}`, 185, y + 5);
      y += 7;
    }
    // Total row
    doc.setFillColor(255, 98, 33);
    doc.rect(14, y, W - 28, 9, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("TOTAL LOSS OF USE DEMAND:", 16, y + 6);
    doc.text(`$${louTotal}`, 185, y + 6);
    y += 15;
    addSOLNotice(doc);
    addLetterFooter(doc);
    downloadPDF(doc, `Whip_LOU_${claimNumber || "Draft"}.pdf`);
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <Panel title="Claim Information">
        <Grid3>
          <Field label="Claim Number" id="lou-claim" value={claimNumber} onChange={setClaimNumber} placeholder="e.g. PF438367" />
          <Field label="Adverse Carrier" id="lou-carrier" value={carrier} onChange={setCarrier} placeholder="e.g. State Farm" />
          <Field label="Adjuster" id="lou-adjuster" value={adjuster} onChange={setAdjuster} placeholder="e.g. John Smith" />
        </Grid3>
      </Panel>
      <Panel title="Vehicle Rental Periods" tag="AUTO-CALCULATES">
        <div className="space-y-3">
          {vehicles.map((v, idx) => (
            <div key={v.id} className="p-3 rounded-lg border border-border bg-muted/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-foreground/60">Vehicle {idx + 1}</span>
                {vehicles.length > 1 && (
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive hover:text-destructive" onClick={() => removeVehicle(v.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <Field label="Year/Make/Model" id={`lou-ymm-${v.id}`} value={v.ymm} onChange={(val) => updateVehicle(v.id, "ymm", val)} placeholder="e.g. 2024 Toyota Camry" />
                <Field label="VIN" id={`lou-vin-${v.id}`} value={v.vin} onChange={(val) => updateVehicle(v.id, "vin", val)} placeholder="17-character VIN" />
              </div>
              <div className="grid grid-cols-4 gap-2 items-end">
                <div>
                  <label className="block text-xs font-medium text-foreground/70 mb-1">Daily Rate ($)</label>
                  <select
                    className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring mb-1"
                    value={STANDARD_LOU_RATES.find(r => r.rate === v.dailyRate)?.rate ?? ""}
                    onChange={(e) => {
                      if (e.target.value) updateVehicle(v.id, "dailyRate", e.target.value);
                    }}
                  >
                    <option value="">— Select rate —</option>
                    {STANDARD_LOU_RATES.map(r => (
                      <option key={r.label} value={r.rate}>{r.label}{r.rate ? ` ($${r.rate}/day)` : ""}</option>
                    ))}
                  </select>
                  <Input
                    value={v.dailyRate}
                    onChange={(e) => updateVehicle(v.id, "dailyRate", e.target.value)}
                    placeholder="Custom rate"
                    type="number"
                    className="h-7 text-xs"
                  />
                </div>
                <Field label="Rental Start" id={`lou-start-${v.id}`} value={v.startDate} onChange={(val) => updateVehicle(v.id, "startDate", val)} type="date" />
                <Field label="Rental End" id={`lou-end-${v.id}`} value={v.endDate} onChange={(val) => updateVehicle(v.id, "endDate", val)} type="date" />
                <div className="p-2 rounded-md bg-[#ff6221]/10 border border-[#ff6221]/20 text-center">
                  <div className="text-[10px] text-[#ff6221]/70 font-medium">{v.days} days</div>
                  <div className="text-sm font-bold text-[#ff6221]">${v.total.toFixed(2)}</div>
                </div>
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" className="gap-1.5 w-full" onClick={addVehicle}>
            <Plus className="w-3.5 h-3.5" /> Add Vehicle
          </Button>
        </div>
      </Panel>
      <div className="p-4 rounded-xl border-2 border-[#ff6221]/30 bg-[#ff6221]/5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-[#ff6221]/70 font-medium uppercase tracking-wider">Total LOU Demand</div>
            <div className="text-3xl font-bold text-[#ff6221]">${louTotal}</div>
            <div className="text-xs text-muted-foreground mt-1">{vehicles.length} vehicle{vehicles.length !== 1 ? "s" : ""} · {vehicles.reduce((s, v) => s + v.days, 0)} total rental days</div>
          </div>
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              size="sm"
              className={`gap-1.5 ${pushedToDemand ? "border-green-500 text-green-600" : "border-[#ff6221]/40 text-[#ff6221] hover:bg-[#ff6221]/10"}`}
              onClick={handlePushToDemand}
            >
              {pushedToDemand ? <CheckCircle className="w-3.5 h-3.5" /> : <Calculator className="w-3.5 h-3.5" />}
              {pushedToDemand ? "Pushed!" : "Push to Demand Letter"}
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleDownload}>
              <Download className="w-3.5 h-3.5" /> Download PDF
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Medical Bills Review ────────────────────────────────────────────────
function MedicalBillsReviewTab() {
  const [state, setState] = useState("MD");
  const [dateOfLoss, setDateOfLoss] = useState("");
  const [impactType, setImpactType] = useState("");
  const [injuryDescription, setInjuryDescription] = useState("");
  const [factsOfLoss, setFactsOfLoss] = useState("");
  const [coverageType, setCoverageType] = useState<"pip" | "bi" | "umbi" | "all">("all");
  const [demandFile, setDemandFile] = useState<File | null>(null);
  const [demandFileName, setDemandFileName] = useState("");
  const [vehiclePhoto1, setVehiclePhoto1] = useState<File | null>(null);
  const [vehiclePhoto2, setVehiclePhoto2] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analysis, setAnalysis] = useState<{
    bills: Array<{provider: string; date: string; cptCode: string; description: string; amount: number; applicable: boolean; reason: string}>;
    cptAnalysis: Array<{code: string; description: string; applicable: boolean; redFlags: string[]}>;
    mechanismAssessment: string;
    pipExposure: number;
    biExposure: number;
    umbiExposure: number;
    totalApplicable: number;
    totalNotApplicable: number;
    expertSummary: string;
    responseLetter: string;
    redFlags: string[];
  } | null>(null);
  const [activeResultTab, setActiveResultTab] = useState<"bills" | "summary" | "letter">("bills");
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"report" | "letter">("report");

  const analyzeMutation = trpc.docgen.analyzeMedicalDemand.useMutation();

  const STATES = ["MD","DC","VA","FL","GA","IL","MA","PA","NJ","TX","NY","NC","DE","OH"];
  const IMPACT_TYPES = ["Rear-end (low speed)", "Rear-end (moderate)", "Rear-end (high speed)", "Side impact (T-bone)", "Head-on", "Sideswipe", "Hit pedestrian", "Single vehicle", "Parking lot"];

  const uploadFile = async (file: File): Promise<string> => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload/document", { method: "POST", body: fd });
    if (!res.ok) throw new Error("Upload failed");
    const data = await res.json() as { url: string };
    return data.url;
  };

  const handleAnalyze = async () => {
    if (!demandFile) {
      toast.error("Please upload a demand package PDF first");
      return;
    }
    setUploading(true);
    try {
      const demandUrl = await uploadFile(demandFile);
      let photo1Url: string | undefined;
      let photo2Url: string | undefined;
      if (vehiclePhoto1) photo1Url = await uploadFile(vehiclePhoto1);
      if (vehiclePhoto2) photo2Url = await uploadFile(vehiclePhoto2);
      setUploading(false);
      toast.info("Analyzing demand package — this may take 30–60 seconds for large files...");
      const result = await analyzeMutation.mutateAsync({
        demandFileUrl: demandUrl,
        vehiclePhoto1Url: photo1Url,
        vehiclePhoto2Url: photo2Url,
        state,
        dateOfLoss,
        impactType,
        injuryDescription,
        factsOfLoss,
        coverageType,
      });
      if (result.analysis) {
        setAnalysis(result.analysis as typeof analysis);
        toast.success("Analysis complete");
      } else {
        toast.error("Analysis returned no structured data");
      }
    } catch (e: unknown) {
      setUploading(false);
      toast.error((e as Error).message || "Analysis failed");
    }
  };

  const handleDownloadReport = () => {
    if (!analysis) return;
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    let y = addWhipLetterhead(doc, "MEDICAL DEMAND ANALYSIS REPORT", `State: ${state} | Coverage: ${coverageType.toUpperCase()} | DOL: ${dateOfLoss || "N/A"}`);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(40, 40, 40);

    // Summary box
    doc.setFillColor(245, 245, 245);
    doc.roundedRect(14, y, W - 28, 22, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(`Total Applicable: $${analysis.totalApplicable.toFixed(2)}`, 18, y + 7);
    doc.text(`Total Not Applicable: $${analysis.totalNotApplicable.toFixed(2)}`, 18, y + 13);
    doc.text(`PIP Exposure: $${analysis.pipExposure.toFixed(2)}`, 80, y + 7);
    doc.text(`BI Exposure: $${analysis.biExposure.toFixed(2)}`, 80, y + 13);
    doc.text(`UMBI Exposure: $${analysis.umbiExposure.toFixed(2)}`, 140, y + 7);
    y += 28;

    // Bills table
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("BILL-BY-BILL ANALYSIS", 14, y);
    y += 6;
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setFillColor(23, 27, 49);
    doc.setTextColor(255, 255, 255);
    doc.rect(14, y - 4, W - 28, 6, "F");
    doc.text("Provider", 16, y);
    doc.text("Date", 60, y);
    doc.text("CPT", 82, y);
    doc.text("Amount", 100, y);
    doc.text("Status", 120, y);
    doc.text("Reason", 140, y);
    y += 4;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(40, 40, 40);
    for (const bill of analysis.bills) {
      if (y > 260) { doc.addPage(); y = 20; }
      if (bill.applicable) { doc.setFillColor(240, 255, 240); } else { doc.setFillColor(255, 240, 240); }
      doc.rect(14, y - 3, W - 28, 5.5, "F");
      doc.text(bill.provider.substring(0, 20), 16, y);
      doc.text(bill.date, 60, y);
      doc.text(bill.cptCode, 82, y);
      doc.text(`$${bill.amount.toFixed(2)}`, 100, y);
      if (bill.applicable) { doc.setTextColor(0, 120, 0); } else { doc.setTextColor(180, 0, 0); }
      doc.text(bill.applicable ? "APPLICABLE" : "NOT APPLICABLE", 120, y);
      doc.setTextColor(40, 40, 40);
      doc.text(bill.reason.substring(0, 35), 140, y);
      y += 6;
    }

    y += 6;
    if (y > 230) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("EXPERT SUMMARY", 14, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    y = wrapText(doc, analysis.expertSummary, 14, y, W - 28, 4.5);

    addSOLNotice(doc, state);
    addLetterFooter(doc);
    const reportUrl = getPDFDataUrl(doc);
    setPreviewPdfUrl(reportUrl);
    setPreviewMode("report");
    downloadPDF(doc, `Whip_MedicalAnalysis_${state}_${dateOfLoss || "Draft"}.pdf`);
  };

  const handleDownloadLetter = () => {
    if (!analysis) return;
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    let y = addWhipLetterhead(doc, "MEDICAL DEMAND RESPONSE LETTER", `State: ${state} | Claim DOL: ${dateOfLoss || "N/A"}`);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(40, 40, 40);
    y = wrapText(doc, analysis.responseLetter, 14, y, W - 28, 5);
    addSOLNotice(doc, state);
    addLetterFooter(doc);
    const letterUrl = getPDFDataUrl(doc);
    setPreviewPdfUrl(letterUrl);
    setPreviewMode("letter");
    downloadPDF(doc, `Whip_DemandResponse_${state}_${dateOfLoss || "Draft"}.pdf`);
  };

  const totalBilled = analysis?.bills.reduce((s, b) => s + b.amount, 0) ?? 0;
  const isLoading = uploading || analyzeMutation.isPending;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div className="space-y-4">
        <Panel title="Claim Context">
          <div className="mb-3">
            <Label className="text-xs font-semibold mb-1.5 block">State of Loss</Label>
            <div className="flex flex-wrap gap-1.5">
              {STATES.map((s) => (
                <button key={s} onClick={() => setState(s)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${state === s ? "bg-[#ff6221] text-white" : "bg-muted text-foreground/60 hover:bg-muted/80 hover:text-foreground"}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <Grid2 children={<>
            <Field label="Date of Loss" id="mbr-dol" value={dateOfLoss} onChange={setDateOfLoss} type="date" />
            <div>
              <Label className="text-xs font-semibold mb-1.5 block">Coverage Focus</Label>
              <Select value={coverageType} onValueChange={(v) => setCoverageType(v as typeof coverageType)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All (PIP + BI + UMBI)</SelectItem>
                  <SelectItem value="pip">PIP Only</SelectItem>
                  <SelectItem value="bi">BI Only</SelectItem>
                  <SelectItem value="umbi">UMBI Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>} />
          <div className="mt-3">
            <Label className="text-xs font-semibold mb-1.5 block">Impact Type / Mechanism of Loss</Label>
            <Select value={impactType} onValueChange={setImpactType}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select impact type..." /></SelectTrigger>
              <SelectContent>
                {IMPACT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="mt-3">
            <Label className="text-xs font-semibold mb-1.5 block">Reported Injuries</Label>
            <Input className="h-8 text-xs" placeholder="e.g. cervical strain, lumbar sprain, headaches" value={injuryDescription} onChange={e => setInjuryDescription(e.target.value)} />
          </div>
          <div className="mt-3">
            <Label className="text-xs font-semibold mb-1.5 block">Facts of Loss</Label>
            <Textarea className="text-xs h-20 resize-none" placeholder="Brief narrative of the accident..." value={factsOfLoss} onChange={e => setFactsOfLoss(e.target.value)} />
          </div>
        </Panel>

        <Panel title="Demand Package Upload" tag="REQUIRED">
          <label className={`flex items-center gap-3 cursor-pointer p-4 rounded-lg border-2 border-dashed transition-colors ${demandFile ? "border-[#ff6221]/60 bg-[#ff6221]/5" : "border-border hover:border-[#ff6221]/40"}`}>
            <Upload className="w-5 h-5 text-muted-foreground flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold">{demandFile ? demandFileName : "Upload Medical Demand Package (PDF)"}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{demandFile ? `${(demandFile.size / 1024 / 1024).toFixed(1)} MB — ready to analyze` : "Up to 200 pages, 50MB max"}</p>
            </div>
            <input type="file" className="hidden" accept=".pdf,.PDF" onChange={e => {
              const f = e.target.files?.[0];
              if (f) { setDemandFile(f); setDemandFileName(f.name); }
            }} />
          </label>
        </Panel>

        <Panel title="Vehicle Photos (Optional — improves mechanism analysis)">
          <div className="grid grid-cols-2 gap-3">
            <label className={`flex flex-col items-center gap-2 cursor-pointer p-3 rounded-lg border-2 border-dashed transition-colors ${vehiclePhoto1 ? "border-[#ff6221]/60 bg-[#ff6221]/5" : "border-border hover:border-[#ff6221]/40"}`}>
              <Upload className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-center font-medium">{vehiclePhoto1 ? vehiclePhoto1.name.substring(0, 20) + "..." : "Whip Vehicle Photo"}</span>
              <input type="file" className="hidden" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) setVehiclePhoto1(f); }} />
            </label>
            <label className={`flex flex-col items-center gap-2 cursor-pointer p-3 rounded-lg border-2 border-dashed transition-colors ${vehiclePhoto2 ? "border-[#ff6221]/60 bg-[#ff6221]/5" : "border-border hover:border-[#ff6221]/40"}`}>
              <Upload className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-center font-medium">{vehiclePhoto2 ? vehiclePhoto2.name.substring(0, 20) + "..." : "Claimant Vehicle Photo"}</span>
              <input type="file" className="hidden" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) setVehiclePhoto2(f); }} />
            </label>
          </div>
        </Panel>

        <Button
          className="w-full gap-2 bg-[#ff6221] hover:bg-[#ff6221]/90 text-white h-11"
          onClick={handleAnalyze}
          disabled={isLoading || !demandFile}
        >
          {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
          {uploading ? "Uploading files..." : analyzeMutation.isPending ? "Analyzing demand package..." : "✨ Run AI Medical Demand Analysis"}
        </Button>
      </div>

      <div>
        {analysis ? (
          <div className="space-y-4">
            {/* Exposure Summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                <p className="text-xs text-muted-foreground">Applicable Medical</p>
                <p className="text-lg font-bold text-green-700 dark:text-green-400">${analysis.totalApplicable.toFixed(2)}</p>
              </div>
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                <p className="text-xs text-muted-foreground">Not Applicable</p>
                <p className="text-lg font-bold text-red-700 dark:text-red-400">${analysis.totalNotApplicable.toFixed(2)}</p>
              </div>
              <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                <p className="text-xs text-muted-foreground">Total Billed</p>
                <p className="text-lg font-bold text-blue-700 dark:text-blue-400">${totalBilled.toFixed(2)}</p>
              </div>
              <div className="p-3 rounded-xl bg-muted/40 border border-border">
                <p className="text-xs text-muted-foreground">BI Exposure</p>
                <p className="text-lg font-bold">${analysis.biExposure.toFixed(2)}</p>
              </div>
            </div>

            {/* Red Flags */}
            {analysis.redFlags.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span className="text-xs font-bold text-amber-700 dark:text-amber-400">Red Flags ({analysis.redFlags.length})</span>
                </div>
                <ul className="space-y-1">
                  {analysis.redFlags.map((f, i) => (
                    <li key={i} className="text-xs text-amber-700 dark:text-amber-400">• {f}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Result Tabs */}
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="flex border-b border-border bg-muted/30">
                {(["bills", "summary", "letter"] as const).map(tab => (
                  <button key={tab} onClick={() => setActiveResultTab(tab)}
                    className={`flex-1 py-2 text-xs font-semibold capitalize transition-colors ${activeResultTab === tab ? "bg-background border-b-2 border-[#ff6221] text-[#ff6221]" : "text-muted-foreground hover:text-foreground"}`}>
                    {tab === "bills" ? "Bill Analysis" : tab === "summary" ? "Expert Summary" : "Response Letter"}
                  </button>
                ))}
              </div>
              <div className="p-4 max-h-[500px] overflow-y-auto">
                {activeResultTab === "bills" && (
                  <div className="space-y-2">
                    {analysis.bills.map((bill, i) => (
                      <div key={i} className={`p-3 rounded-lg border text-xs ${bill.applicable ? "border-green-200 bg-green-50 dark:bg-green-950/20" : "border-red-200 bg-red-50 dark:bg-red-950/20"}`}>
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="font-semibold">{bill.provider}</div>
                          <div className={`px-2 py-0.5 rounded text-xs font-bold flex-shrink-0 ${bill.applicable ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
                            {bill.applicable ? "✓ APPLICABLE" : "✗ NOT APPLICABLE"}
                          </div>
                        </div>
                        <div className="text-muted-foreground">
                          {bill.date} · CPT {bill.cptCode} — {bill.description} · <span className="font-semibold text-foreground">${bill.amount.toFixed(2)}</span>
                        </div>
                        <div className="mt-1 text-muted-foreground italic">{bill.reason}</div>
                      </div>
                    ))}
                  </div>
                )}
                {activeResultTab === "summary" && (
                  <div className="text-xs text-foreground/85 leading-relaxed whitespace-pre-wrap">{analysis.expertSummary}</div>
                )}
                {activeResultTab === "letter" && (
                  <div className="text-xs text-foreground/85 leading-relaxed whitespace-pre-wrap font-mono">{analysis.responseLetter}</div>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1.5 flex-1" onClick={handleDownloadReport}>
                <Download className="w-3.5 h-3.5" /> Full Analysis PDF
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 flex-1" onClick={handleDownloadLetter}>
                <FileText className="w-3.5 h-3.5" /> Response Letter PDF
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { navigator.clipboard.writeText(analysis.responseLetter); toast.success("Letter copied"); }}>
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </div>

            {/* Inline PDF Preview */}
            {previewPdfUrl && (
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border">
                  <span className="text-xs font-semibold text-foreground/70 flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5" />
                    Preview — {previewMode === "report" ? "Full Analysis Report" : "Response Letter"}
                  </span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => window.open(previewPdfUrl, "_blank")} className="text-xs text-[#ff6221] hover:underline flex items-center gap-1">
                      <Maximize2 className="w-3 h-3" /> Full Screen
                    </button>
                    <button onClick={() => setPreviewPdfUrl(null)} className="text-foreground/40 hover:text-foreground">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <iframe src={previewPdfUrl} className="w-full h-[500px]" title="PDF Preview" />
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-80 rounded-xl border-2 border-dashed border-border text-center p-8">
            <Brain className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <p className="text-sm font-semibold text-muted-foreground">Medical Demand Analysis</p>
            <p className="text-xs text-muted-foreground/60 mt-2 max-w-xs">Upload a demand package PDF and fill in the claim context, then run the AI analysis to get a full bill-by-bill breakdown, CPT code review, mechanism of loss assessment, and response letter.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Whip COI ─────────────────────────────────────────────────────────────
function WhipCOITab() {
  const [state, setState] = useState("MD");
  const [form, setForm] = useState({
    memberName: "",
    memberAddress: "",
    memberCity: "",
    memberState: "",
    memberZip: "",
    vehicleYear: "",
    vehicleMake: "",
    vehicleModel: "",
    vin: "",
    plateNumber: "",
    weeklyRate: "",
    certDate: "",
    effectiveDate: "",
    expirationDate: "",
    policyNumber: "WH-AUTO-" + new Date().getFullYear(),
    holderName: "",
    holderAddress: "",
    holderCity: "",
    holderState: "",
    holderZip: "",
    additionalInsured: false,
    waiverOfSubrogation: false,
  });

  const set = (k: keyof typeof form) => (v: string | boolean) => setForm(f => ({ ...f, [k]: v }));
  const rules = KLUTCH_STATE_RULES[state] || KLUTCH_STATE_RULES["MD"];
  const STATES = Object.keys(KLUTCH_STATE_RULES);

  const handleDownload = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();

    // Header bar - Whip orange
    doc.setFillColor(255, 98, 33);
    doc.rect(0, 0, W, 18, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("WHIP", 10, 12);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("CERTIFICATE OF COVERAGE", 10, 16.5);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("CERTIFICATE OF AUTOMOBILE INSURANCE", W / 2, 11, { align: "center" });
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(`State: ${state}  |  Policy: ${form.policyNumber}  |  Date: ${form.certDate || new Date().toLocaleDateString()}`, W / 2, 15.5, { align: "center" });

    const col1 = 8;
    const col2 = W / 2 + 4;
    const colW = W / 2 - 12;
    let y = 24;

    const box = (title: string, x: number, startY: number, h: number) => {
      doc.setDrawColor(200, 200, 200);
      doc.setFillColor(248, 249, 252);
      doc.roundedRect(x, startY, colW, h, 1.5, 1.5, "FD");
      doc.setFillColor(255, 98, 33);
      doc.rect(x, startY, colW, 5, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.text(title, x + 2, startY + 3.5);
      doc.setTextColor(40, 40, 40);
      doc.setFont("helvetica", "normal");
      return startY + 7;
    };

    const row = (label: string, value: string, x: number, rowY: number) => {
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(100, 100, 100);
      doc.text(label.toUpperCase(), x + 2, rowY);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(20, 20, 20);
      doc.text(value || "—", x + 2, rowY + 3.5);
      return rowY + 7;
    };

    let ly = box("INSURED MEMBER", col1, y, 38);
    ly = row("Name", form.memberName, col1, ly);
    ly = row("Address", `${form.memberAddress}, ${form.memberCity}, ${form.memberState} ${form.memberZip}`, col1, ly);
    ly = row("Insurer", "Metrocars Leasing Corp d/b/a Whip", col1, ly);
    ly = row("Policy Number", form.policyNumber, col1, ly);

    ly = y + 42;
    ly = box("COVERED VEHICLE", col1, ly, 38);
    ly = row("Vehicle", `${form.vehicleYear} ${form.vehicleMake} ${form.vehicleModel}`, col1, ly);
    ly = row("VIN", form.vin, col1, ly);
    ly = row("Plate", form.plateNumber, col1, ly);
    ly = row("Weekly Rate", form.weeklyRate ? `$${form.weeklyRate}/week` : "—", col1, ly);

    ly = y + 84;
    ly = box("POLICY PERIOD", col1, ly, 20);
    ly = row("Effective Date", form.effectiveDate, col1, ly);
    ly = row("Expiration Date", form.expirationDate, col1, ly);

    let ry = box("COVERAGE LIMITS", col2, y, 80);
    const coverageRows = [
      ["Bodily Injury Liability", rules.biLimits],
      ["Property Damage Liability", rules.pdLimit],
      ...(rules.pip ? [["Personal Injury Protection (PIP)", rules.pipLimit]] : []),
      ...(rules.um ? [["Uninsured Motorist", rules.umLimit]] : []),
      ...(rules.uim ? [["Underinsured Motorist", rules.uimLimit]] : []),
    ];
    for (const [label, value] of coverageRows) {
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(40, 40, 40);
      doc.text(label, col2 + 2, ry);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(255, 98, 33);
      doc.text(value, col2 + colW - 2, ry, { align: "right" });
      doc.setDrawColor(220, 220, 220);
      doc.line(col2 + 2, ry + 1.5, col2 + colW - 2, ry + 1.5);
      ry += 7;
    }

    ry = y + 84;
    ry = box("CERTIFICATE HOLDER", col2, ry, 30);
    ry = row("Name", form.holderName, col2, ry);
    ry = row("Address", `${form.holderAddress}${form.holderCity ? ", " + form.holderCity : ""}${form.holderState ? ", " + form.holderState : ""} ${form.holderZip}`, col2, ry);
    if (form.additionalInsured) {
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 98, 33);
      doc.text("✓ ADDITIONAL INSURED", col2 + 2, ry);
      ry += 4;
    }
    if (form.waiverOfSubrogation) {
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 98, 33);
      doc.text("✓ WAIVER OF SUBROGATION", col2 + 2, ry);
      ry += 4;
    }

    // Footer
    doc.setFillColor(245, 245, 248);
    doc.rect(0, H - 18, W, 18, "F");
    doc.setDrawColor(200, 200, 200);
    doc.line(0, H - 18, W, H - 18);
    doc.setFontSize(6);
    doc.setTextColor(100, 100, 100);
    doc.setFont("helvetica", "italic");
    doc.text(
      "This certificate is issued as a matter of information only and confers no rights upon the certificate holder. This certificate does not amend, extend, or alter the coverage afforded by the policies below.",
      W / 2, H - 13, { align: "center", maxWidth: W - 20 }
    );
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 98, 33);
    doc.text("Metrocars Leasing Corp d/b/a Whip  |  P.O. Box 10622, Rockville, MD 20849  |  Authorized Representative", W / 2, H - 6, { align: "center" });

    downloadPDF(doc, `Whip_COI_${form.memberName.replace(/\s+/g, "_") || "Member"}_${state}.pdf`);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div className="space-y-4">
        <Panel title="State of Coverage (Member's Home Market)">
          <div className="flex flex-wrap gap-1.5">
            {STATES.map(s => (
              <button key={s} onClick={() => setState(s)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${state === s ? "bg-[#ff6221] text-white" : "bg-muted text-foreground/60 hover:bg-muted/80 hover:text-foreground"}`}>
                {s}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-start gap-1.5 p-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
            <Info className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-snug">
              <strong>Market-based:</strong> Select the state where the <strong>member originates</strong> (home market), not where the accident occurred. Whip markets: MD (Glen Burnie, Rockville), VA, PA, FL, IL, GA, MA.
            </p>
          </div>
        </Panel>
        <Panel title="Member Information">
          <Field label="Member Name" id="wcoi-name" value={form.memberName} onChange={set("memberName")} placeholder="Last, First" required />
          <div className="mt-2">
            <Field label="Address" id="wcoi-addr" value={form.memberAddress} onChange={set("memberAddress")} placeholder="Street address" />
          </div>
          <Grid3 children={<>
            <Field label="City" id="wcoi-city" value={form.memberCity} onChange={set("memberCity")} placeholder="City" />
            <Field label="State" id="wcoi-mstate" value={form.memberState} onChange={set("memberState")} placeholder="e.g. MD" />
            <Field label="ZIP" id="wcoi-zip" value={form.memberZip} onChange={set("memberZip")} placeholder="e.g. 20850" />
          </>} />
        </Panel>
        <Panel title="Covered Vehicle">
          <Grid3 children={<>
            <Field label="Year" id="wcoi-yr" value={form.vehicleYear} onChange={set("vehicleYear")} placeholder="2024" />
            <Field label="Make" id="wcoi-make" value={form.vehicleMake} onChange={set("vehicleMake")} placeholder="Toyota" />
            <Field label="Model" id="wcoi-model" value={form.vehicleModel} onChange={set("vehicleModel")} placeholder="Camry" />
          </>} />
          <Grid2 children={<>
            <Field label="VIN" id="wcoi-vin" value={form.vin} onChange={set("vin")} placeholder="17-character VIN" />
            <Field label="Plate Number" id="wcoi-plate" value={form.plateNumber} onChange={set("plateNumber")} placeholder="e.g. ABC1234" />
          </>} />
          <div className="mt-2">
            <Field label="Weekly Rate ($)" id="wcoi-rate" value={form.weeklyRate} onChange={set("weeklyRate")} placeholder="e.g. 350" />
          </div>
        </Panel>
        <Panel title="Policy Period">
          <Grid3 children={<>
            <Field label="Certificate Date" id="wcoi-certdate" value={form.certDate} onChange={set("certDate")} type="date" />
            <Field label="Effective Date" id="wcoi-eff" value={form.effectiveDate} onChange={set("effectiveDate")} type="date" />
            <Field label="Expiration Date" id="wcoi-exp" value={form.expirationDate} onChange={set("expirationDate")} type="date" />
          </>} />
        </Panel>
        <Panel title="Certificate Holder">
          <Field label="Holder Name" id="wcoi-holder" value={form.holderName} onChange={set("holderName")} placeholder="e.g. Toyota Financial Services" />
          <div className="mt-2">
            <Field label="Address" id="wcoi-haddr" value={form.holderAddress} onChange={set("holderAddress")} placeholder="Street address" />
          </div>
          <Grid3 children={<>
            <Field label="City" id="wcoi-hcity" value={form.holderCity} onChange={set("holderCity")} placeholder="City" />
            <Field label="State" id="wcoi-hstate" value={form.holderState} onChange={set("holderState")} placeholder="e.g. MD" />
            <Field label="ZIP" id="wcoi-hzip" value={form.holderZip} onChange={set("holderZip")} placeholder="e.g. 20850" />
          </>} />
          <div className="mt-3 space-y-2">
            <label className="flex items-center gap-3 cursor-pointer p-2.5 rounded-md border border-border/50 hover:bg-muted/30 transition-colors">
              <Checkbox checked={form.additionalInsured} onCheckedChange={(v) => set("additionalInsured")(!!v)} />
              <div className="text-xs font-semibold">Additional Insured</div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer p-2.5 rounded-md border border-border/50 hover:bg-muted/30 transition-colors">
              <Checkbox checked={form.waiverOfSubrogation} onCheckedChange={(v) => set("waiverOfSubrogation")(!!v)} />
              <div className="text-xs font-semibold">Waiver of Subrogation</div>
            </label>
          </div>
        </Panel>
      </div>
      <div className="space-y-4">
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="bg-[#ff6221] text-white px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold">WHIP</p>
              <p className="text-xs opacity-80">Certificate of Coverage — {state}</p>
            </div>
            <div className="text-right">
              <p className="text-xs opacity-80">Policy</p>
              <p className="text-xs font-mono">{form.policyNumber}</p>
            </div>
          </div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-muted-foreground font-semibold uppercase text-[10px]">Member</p>
                <p className="font-medium">{form.memberName || "—"}</p>
                <p className="text-muted-foreground">{form.memberAddress || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground font-semibold uppercase text-[10px]">Vehicle</p>
                <p className="font-medium">{[form.vehicleYear, form.vehicleMake, form.vehicleModel].filter(Boolean).join(" ") || "—"}</p>
                <p className="text-muted-foreground font-mono text-[10px]">{form.vin || "VIN not entered"}</p>
              </div>
            </div>
            <div className="border-t border-border pt-3">
              <p className="text-muted-foreground font-semibold uppercase text-[10px] mb-2">Coverage Limits — {state}</p>
              <div className="space-y-1.5">
                {[
                  ["Bodily Injury", rules.biLimits],
                  ["Property Damage", rules.pdLimit],
                  ...(rules.pip ? [["PIP", rules.pipLimit]] : []),
                  ...(rules.um ? [["Uninsured Motorist", rules.umLimit]] : []),
                  ...(rules.uim ? [["Underinsured Motorist", rules.uimLimit]] : []),
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-semibold text-[#ff6221]">{value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="text-xs border-t border-border pt-3">
              <p className="text-muted-foreground font-semibold uppercase text-[10px]">Insurer</p>
              <p className="font-medium">Metrocars Leasing Corp d/b/a Whip</p>
              <p className="text-muted-foreground">P.O. Box 10622, Rockville, MD 20849</p>
            </div>
          </div>
        </div>
        <Button className="w-full gap-2 bg-[#ff6221] hover:bg-[#ff6221]/90 text-white" onClick={handleDownload}>
          <Download className="w-4 h-4" /> Download Whip COI (PDF — Landscape)
        </Button>
        <p className="text-xs text-muted-foreground italic text-center">Prints in standard landscape COI format. Insurer: Metrocars Leasing Corp d/b/a Whip.</p>
      </div>
    </div>
  );
}

// ─── Tab: Klutch COI ──────────────────────────────────────────────────────────
// State-specific coverage rules from KlutchCOI.html source
const KLUTCH_STATE_RULES: Record<string, {
  biLimits: string; pdLimit: string; pip: boolean; pipLimit: string;
  um: boolean; umLimit: string; uim: boolean; uimLimit: string;
  medPay: boolean; medPayLimit: string;
}> = {
  MD: { biLimits: "$30,000/$60,000", pdLimit: "$15,000", pip: true, pipLimit: "$2,500", um: true, umLimit: "$30,000/$60,000", uim: true, uimLimit: "$30,000/$60,000", medPay: false, medPayLimit: "" },
  DC: { biLimits: "$25,000/$50,000", pdLimit: "$10,000", pip: true, pipLimit: "$50,000", um: true, umLimit: "$25,000/$50,000", uim: true, uimLimit: "$25,000/$50,000", medPay: false, medPayLimit: "" },
  VA: { biLimits: "$30,000/$60,000", pdLimit: "$20,000", pip: false, pipLimit: "", um: true, umLimit: "$30,000/$60,000", uim: true, uimLimit: "$30,000/$60,000", medPay: false, medPayLimit: "" },
  FL: { biLimits: "$10,000/$20,000", pdLimit: "$10,000", pip: true, pipLimit: "$10,000", um: true, umLimit: "$10,000/$20,000", uim: false, uimLimit: "", medPay: false, medPayLimit: "" },
  GA: { biLimits: "$25,000/$50,000", pdLimit: "$25,000", pip: false, pipLimit: "", um: true, umLimit: "$25,000/$50,000", uim: true, uimLimit: "$25,000/$50,000", medPay: false, medPayLimit: "" },
  IL: { biLimits: "$25,000/$50,000", pdLimit: "$20,000", pip: false, pipLimit: "", um: true, umLimit: "$25,000/$50,000", uim: true, uimLimit: "$25,000/$50,000", medPay: false, medPayLimit: "" },
  MA: { biLimits: "$20,000/$40,000", pdLimit: "$5,000", pip: true, pipLimit: "$8,000", um: true, umLimit: "$20,000/$40,000", uim: true, uimLimit: "$20,000/$40,000", medPay: false, medPayLimit: "" },
  PA: { biLimits: "$15,000/$30,000", pdLimit: "$5,000", pip: true, pipLimit: "$5,000", um: true, umLimit: "$15,000/$30,000", uim: true, uimLimit: "$15,000/$30,000", medPay: false, medPayLimit: "" },
  NJ: { biLimits: "$15,000/$30,000", pdLimit: "$5,000", pip: true, pipLimit: "$15,000", um: true, umLimit: "$15,000/$30,000", uim: true, uimLimit: "$15,000/$30,000", medPay: false, medPayLimit: "" },
  TX: { biLimits: "$30,000/$60,000", pdLimit: "$25,000", pip: false, pipLimit: "", um: true, umLimit: "$30,000/$60,000", uim: true, uimLimit: "$30,000/$60,000", medPay: false, medPayLimit: "" },
  NY: { biLimits: "$25,000/$50,000", pdLimit: "$10,000", pip: true, pipLimit: "$50,000", um: true, umLimit: "$25,000/$50,000", uim: false, uimLimit: "", medPay: false, medPayLimit: "" },
  NC: { biLimits: "$30,000/$60,000", pdLimit: "$25,000", pip: false, pipLimit: "", um: true, umLimit: "$30,000/$60,000", uim: true, uimLimit: "$30,000/$60,000", medPay: false, medPayLimit: "" },
  DE: { biLimits: "$25,000/$50,000", pdLimit: "$10,000", pip: true, pipLimit: "$15,000", um: true, umLimit: "$25,000/$50,000", uim: true, uimLimit: "$25,000/$50,000", medPay: false, medPayLimit: "" },
  OH: { biLimits: "$25,000/$50,000", pdLimit: "$25,000", pip: false, pipLimit: "", um: true, umLimit: "$25,000/$50,000", uim: true, uimLimit: "$25,000/$50,000", medPay: false, medPayLimit: "" },
};

function KlutchCOITab() {
  const [state, setState] = useState("MD");
  const [form, setForm] = useState({
    memberName: "",
    memberAddress: "",
    memberCity: "",
    memberState: "",
    memberZip: "",
    vehicleYear: "",
    vehicleMake: "",
    vehicleModel: "",
    vin: "",
    plateNumber: "",
    weeklyRate: "",
    certDate: "",
    effectiveDate: "",
    expirationDate: "",
    policyNumber: "KLT-AUTO-" + new Date().getFullYear(),
    holderName: "",
    holderAddress: "",
    holderCity: "",
    holderState: "",
    holderZip: "",
    additionalInsured: false,
    waiverOfSubrogation: false,
    specialProvisions: "",
  });

  const set = (k: keyof typeof form) => (v: string | boolean) => setForm(f => ({ ...f, [k]: v }));
  const rules = KLUTCH_STATE_RULES[state] || KLUTCH_STATE_RULES["MD"];
  const STATES = Object.keys(KLUTCH_STATE_RULES);

  const handleDownload = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();

    // Header bar
    doc.setFillColor(23, 27, 49);
    doc.rect(0, 0, W, 18, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("KLUTCH", 10, 12);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("CERTIFICATE OF COVERAGE", 10, 16.5);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("CERTIFICATE OF AUTOMOBILE INSURANCE", W / 2, 11, { align: "center" });
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(`State: ${state}  |  Policy: ${form.policyNumber}  |  Date: ${form.certDate || new Date().toLocaleDateString()}`, W / 2, 15.5, { align: "center" });

    // Two-column layout
    const col1 = 8;
    const col2 = W / 2 + 4;
    const colW = W / 2 - 12;
    let y = 24;

    // Box helper
    const box = (title: string, x: number, startY: number, h: number) => {
      doc.setDrawColor(200, 200, 200);
      doc.setFillColor(248, 249, 252);
      doc.roundedRect(x, startY, colW, h, 1.5, 1.5, "FD");
      doc.setFillColor(23, 27, 49);
      doc.rect(x, startY, colW, 5, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.text(title, x + 2, startY + 3.5);
      doc.setTextColor(40, 40, 40);
      doc.setFont("helvetica", "normal");
      return startY + 7;
    };

    const row = (label: string, value: string, x: number, rowY: number) => {
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(100, 100, 100);
      doc.text(label.toUpperCase(), x + 2, rowY);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(20, 20, 20);
      doc.text(value || "—", x + 2, rowY + 3.5);
      return rowY + 7;
    };

    // Left column
    let ly = box("INSURED MEMBER", col1, y, 38);
    ly = row("Name", form.memberName, col1, ly);
    ly = row("Address", `${form.memberAddress}, ${form.memberCity}, ${form.memberState} ${form.memberZip}`, col1, ly);
    ly = row("Insurer", "Klutch Insurance Group", col1, ly);
    ly = row("Policy Number", form.policyNumber, col1, ly);

    ly = y + 42;
    ly = box("COVERED VEHICLE", col1, ly, 38);
    ly = row("Vehicle", `${form.vehicleYear} ${form.vehicleMake} ${form.vehicleModel}`, col1, ly);
    ly = row("VIN", form.vin, col1, ly);
    ly = row("Plate", form.plateNumber, col1, ly);
    ly = row("Weekly Rate", form.weeklyRate ? `$${form.weeklyRate}/week` : "—", col1, ly);

    ly = y + 84;
    ly = box("POLICY PERIOD", col1, ly, 20);
    ly = row("Effective Date", form.effectiveDate, col1, ly);
    ly = row("Expiration Date", form.expirationDate, col1, ly);

    // Right column — coverage
    let ry = box("COVERAGE LIMITS", col2, y, 80);
    const coverageRows = [
      ["Bodily Injury Liability", rules.biLimits],
      ["Property Damage Liability", rules.pdLimit],
      ...(rules.pip ? [["Personal Injury Protection (PIP)", rules.pipLimit]] : []),
      ...(rules.um ? [["Uninsured Motorist", rules.umLimit]] : []),
      ...(rules.uim ? [["Underinsured Motorist", rules.uimLimit]] : []),
    ];
    for (const [label, value] of coverageRows) {
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(40, 40, 40);
      doc.text(label, col2 + 2, ry);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(23, 27, 49);
      doc.text(value, col2 + colW - 2, ry, { align: "right" });
      doc.setDrawColor(220, 220, 220);
      doc.line(col2 + 2, ry + 1.5, col2 + colW - 2, ry + 1.5);
      ry += 7;
    }

    ry = y + 84;
    ry = box("CERTIFICATE HOLDER", col2, ry, 30);
    ry = row("Name", form.holderName, col2, ry);
    ry = row("Address", `${form.holderAddress}${form.holderCity ? ", " + form.holderCity : ""}${form.holderState ? ", " + form.holderState : ""} ${form.holderZip}`, col2, ry);
    if (form.additionalInsured) {
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 98, 33);
      doc.text("✓ ADDITIONAL INSURED", col2 + 2, ry);
      ry += 4;
    }
    if (form.waiverOfSubrogation) {
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 98, 33);
      doc.text("✓ WAIVER OF SUBROGATION", col2 + 2, ry);
      ry += 4;
    }

    // Footer
    doc.setFillColor(245, 245, 248);
    doc.rect(0, H - 18, W, 18, "F");
    doc.setDrawColor(200, 200, 200);
    doc.line(0, H - 18, W, H - 18);
    doc.setFontSize(6);
    doc.setTextColor(100, 100, 100);
    doc.setFont("helvetica", "italic");
    doc.text(
      "This certificate is issued as a matter of information only and confers no rights upon the certificate holder. This certificate does not amend, extend, or alter the coverage afforded by the policies below.",
      W / 2, H - 13, { align: "center", maxWidth: W - 20 }
    );
    doc.setFont("helvetica", "bold");
    doc.setTextColor(23, 27, 49);
    doc.text("Klutch Insurance Group  |  Authorized Representative", W / 2, H - 6, { align: "center" });

    downloadPDF(doc, `Klutch_COI_${form.memberName.replace(/\s+/g, "_") || "Member"}_${state}.pdf`);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div className="space-y-4">
        <Panel title="State of Coverage (Member's Home Market)">
          <div className="flex flex-wrap gap-1.5">
            {STATES.map(s => (
              <button key={s} onClick={() => setState(s)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${state === s ? "bg-[#ff6221] text-white" : "bg-muted text-foreground/60 hover:bg-muted/80 hover:text-foreground"}`}>
                {s}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-start gap-1.5 p-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
            <Info className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-snug">
              <strong>Market-based:</strong> Select the state where the <strong>member originates</strong> (home market), not where the accident occurred. Whip markets: MD (Glen Burnie, Rockville), VA, PA, FL, IL, GA, MA.
            </p>
          </div>
        </Panel>

        <Panel title="Member Information">
          <Field label="Member Name" id="kcoi-name" value={form.memberName} onChange={set("memberName")} placeholder="Last, First" required />
          <div className="mt-2">
            <Field label="Address" id="kcoi-addr" value={form.memberAddress} onChange={set("memberAddress")} placeholder="Street address" />
          </div>
          <Grid3 children={<>
            <Field label="City" id="kcoi-city" value={form.memberCity} onChange={set("memberCity")} placeholder="City" />
            <Field label="State" id="kcoi-mstate" value={form.memberState} onChange={set("memberState")} placeholder="e.g. MD" />
            <Field label="ZIP" id="kcoi-zip" value={form.memberZip} onChange={set("memberZip")} placeholder="e.g. 20850" />
          </>} />
        </Panel>

        <Panel title="Covered Vehicle">
          <Grid3 children={<>
            <Field label="Year" id="kcoi-yr" value={form.vehicleYear} onChange={set("vehicleYear")} placeholder="2024" />
            <Field label="Make" id="kcoi-make" value={form.vehicleMake} onChange={set("vehicleMake")} placeholder="Toyota" />
            <Field label="Model" id="kcoi-model" value={form.vehicleModel} onChange={set("vehicleModel")} placeholder="Camry" />
          </>} />
          <Grid2 children={<>
            <Field label="VIN" id="kcoi-vin" value={form.vin} onChange={set("vin")} placeholder="17-character VIN" />
            <Field label="Plate Number" id="kcoi-plate" value={form.plateNumber} onChange={set("plateNumber")} placeholder="e.g. ABC1234" />
          </>} />
          <div className="mt-2">
            <Field label="Weekly Rate ($)" id="kcoi-rate" value={form.weeklyRate} onChange={set("weeklyRate")} placeholder="e.g. 350" />
          </div>
        </Panel>

        <Panel title="Policy Period">
          <Grid3 children={<>
            <Field label="Certificate Date" id="kcoi-certdate" value={form.certDate} onChange={set("certDate")} type="date" />
            <Field label="Effective Date" id="kcoi-eff" value={form.effectiveDate} onChange={set("effectiveDate")} type="date" />
            <Field label="Expiration Date" id="kcoi-exp" value={form.expirationDate} onChange={set("expirationDate")} type="date" />
          </>} />
        </Panel>

        <Panel title="Certificate Holder">
          <Field label="Holder Name" id="kcoi-holder" value={form.holderName} onChange={set("holderName")} placeholder="e.g. Toyota Financial Services" />
          <div className="mt-2">
            <Field label="Address" id="kcoi-haddr" value={form.holderAddress} onChange={set("holderAddress")} placeholder="Street address" />
          </div>
          <Grid3 children={<>
            <Field label="City" id="kcoi-hcity" value={form.holderCity} onChange={set("holderCity")} placeholder="City" />
            <Field label="State" id="kcoi-hstate" value={form.holderState} onChange={set("holderState")} placeholder="e.g. MD" />
            <Field label="ZIP" id="kcoi-hzip" value={form.holderZip} onChange={set("holderZip")} placeholder="e.g. 20850" />
          </>} />
          <div className="mt-3 space-y-2">
            <label className="flex items-center gap-3 cursor-pointer p-2.5 rounded-md border border-border/50 hover:bg-muted/30 transition-colors">
              <Checkbox checked={form.additionalInsured} onCheckedChange={(v) => set("additionalInsured")(!!v)} />
              <div className="text-xs font-semibold">Additional Insured</div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer p-2.5 rounded-md border border-border/50 hover:bg-muted/30 transition-colors">
              <Checkbox checked={form.waiverOfSubrogation} onCheckedChange={(v) => set("waiverOfSubrogation")(!!v)} />
              <div className="text-xs font-semibold">Waiver of Subrogation</div>
            </label>
          </div>
        </Panel>
      </div>

      <div className="space-y-4">
        {/* Coverage Preview */}
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="bg-[#171b31] text-white px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold">KLUTCH</p>
              <p className="text-xs opacity-70">Certificate of Coverage — {state}</p>
            </div>
            <div className="text-right">
              <p className="text-xs opacity-70">Policy</p>
              <p className="text-xs font-mono">{form.policyNumber}</p>
            </div>
          </div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-muted-foreground font-semibold uppercase text-[10px]">Member</p>
                <p className="font-medium">{form.memberName || "—"}</p>
                <p className="text-muted-foreground">{form.memberAddress || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground font-semibold uppercase text-[10px]">Vehicle</p>
                <p className="font-medium">{[form.vehicleYear, form.vehicleMake, form.vehicleModel].filter(Boolean).join(" ") || "—"}</p>
                <p className="text-muted-foreground font-mono text-[10px]">{form.vin || "VIN not entered"}</p>
              </div>
            </div>
            <div className="border-t border-border pt-3">
              <p className="text-muted-foreground font-semibold uppercase text-[10px] mb-2">Coverage Limits — {state}</p>
              <div className="space-y-1.5">
                {[
                  ["Bodily Injury", rules.biLimits],
                  ["Property Damage", rules.pdLimit],
                  ...(rules.pip ? [["PIP", rules.pipLimit]] : []),
                  ...(rules.um ? [["Uninsured Motorist", rules.umLimit]] : []),
                  ...(rules.uim ? [["Underinsured Motorist", rules.uimLimit]] : []),
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-semibold text-[#ff6221]">{value}</span>
                  </div>
                ))}
              </div>
            </div>
            {form.holderName && (
              <div className="border-t border-border pt-3 text-xs">
                <p className="text-muted-foreground font-semibold uppercase text-[10px] mb-1">Certificate Holder</p>
                <p className="font-medium">{form.holderName}</p>
                {form.additionalInsured && <p className="text-amber-600 font-medium text-[10px]">✓ Additional Insured</p>}
                {form.waiverOfSubrogation && <p className="text-amber-600 font-medium text-[10px]">✓ Waiver of Subrogation</p>}
              </div>
            )}
          </div>
        </div>

        <Button className="w-full gap-2 bg-[#ff6221] hover:bg-[#ff6221]/90 text-white" onClick={handleDownload}>
          <Download className="w-4 h-4" /> Download Klutch COI (PDF — Landscape)
        </Button>
        <p className="text-xs text-muted-foreground italic text-center">Prints in standard landscape COI format with state-specific coverage limits auto-populated.</p>
      </div>
    </div>
  );
}

// ─── Main DocGenerator Page ───────────────────────────────────────────────────
export default function DocGenerator() {
  const [activeTab, setActiveTab] = useState<DocGenTab>("blank-letterhead");
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

  const handleToggleFavorite = () => {
    toggleFavMut.mutate({ tabKey: activeTab, tabLabel: activeLabel });
  };

  const handleSaveDraft = () => {
    saveDraftMut.mutate({ tabKey: activeTab, tabLabel: activeLabel, formData: currentFormData, draftId: currentDraftId });
  };

  const handleLoadDraft = (draft: { id: number; tabKey: string; formData: unknown }) => {
    setActiveTab(draft.tabKey as DocGenTab);
    setCurrentDraftId(draft.id);
    setCurrentFormData(draft.formData as Record<string, unknown>);
    setShowMyDocs(false);
    toast.info("Draft loaded — fill in the form and generate");
  };

  const handleShareTemplate = () => {
    if (!shareToUserId || !shareTemplateName.trim()) { toast.error("Select a recipient and enter a template name"); return; }
    shareTemplateMut.mutate({ toUserId: shareToUserId, tabKey: activeTab, tabLabel: activeLabel, templateName: shareTemplateName, formData: currentFormData, message: shareMessage });
  };

  const handleLoadSharedTemplate = (t: { id: number; tabKey: string; formData: unknown }) => {
    setActiveTab(t.tabKey as DocGenTab);
    setCurrentFormData(t.formData as Record<string, unknown>);
    markReadMut.mutate({ templateId: t.id });
    setShowSharedTemplates(false);
    toast.info("Shared template loaded");
  };

  const renderTab = () => {
    switch (activeTab) {
      case "blank-letterhead": return <BlankLetterheadTab />;
      case "claimant-contact": return <ClaimantContactTab />;
      case "failed-contact": return <FailedContactTab />;
      case "storage-mitigation": return <StorageMitigationTab />;
      case "cert-of-coverage": return <CertOfCoverageTab />;
      case "coverage-tnc": return <CoverageTNCTab />;
      case "denial": return <DenialTab />;
      case "damage-denial": return <DamageDenialTab />;
      case "ror": return <RORTab />;
      case "release-bi": return <ReleaseBITab />;
      case "release-pd": return <ReleasePDTab />;
      case "tl-settlement": return <TLSettlementTab />;
      case "subro-demand": return <SubroDemandTab />;
      case "carrier-rebuttal": return <CarrierRebuttalTab />;
      case "payment-receipt": return <PaymentReceiptTab />;
      case "urgently-invoice": return <UrgentlyInvoiceTab />;
      case "pip-exhaustion": return <PIPExhaustionTab />;
      case "limited-liability-bi": return <LimitedLiabilityBITab />;
      case "lou-calculator": return <LOUCalculatorTab />;
      case "pip-bill-review": return <MedicalBillsReviewTab />;
      case "coi-whip": return <WhipCOITab />;
      case "coi-klutch": return <KlutchCOITab />;
      default: return null;
    }
  };

  return (
    <WhipLayout>
      <div className="flex h-full min-h-0">
        {/* Sidebar Nav */}
        <aside className="w-56 shrink-0 border-r border-border bg-muted/20 overflow-y-auto flex flex-col">
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
          {/* Header bar */}
          <div className="px-6 py-3 border-b border-border flex items-center gap-3 bg-background shrink-0">
            <div className="flex items-center gap-1.5 text-sm">
              <span className="text-foreground/50 font-medium">Document Generator</span>
              <ChevronRight className="w-3.5 h-3.5 text-foreground/30" />
              <span className="font-bold text-foreground">{activeLabel}</span>
            </div>
            <button onClick={handleToggleFavorite} title={isFavorite ? "Remove from favorites" : "Add to favorites"}
              className={`ml-0.5 transition-colors ${isFavorite ? "text-amber-400" : "text-foreground/30 hover:text-amber-400"}`}>
              <Star className={`w-4 h-4 ${isFavorite ? "fill-amber-400" : ""}`} />
            </button>
            <div className="ml-auto flex items-center gap-2">
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
                            <button onClick={() => { setActiveTab(doc.tabKey as DocGenTab); setShowRecentDocs(false); }} className="text-[#ff6221] hover:underline text-[10px]">Open</button>
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
            <div className="p-6">
              {renderTab()}
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
