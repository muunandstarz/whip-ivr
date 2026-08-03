import { useState, useCallback } from "react";
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
import {
  FileText,
  Sparkles,
  Download,
  Copy,
  RefreshCw,
  Plus,
  Trash2,
  ChevronRight,
  Mail,
  FileCheck,
  AlertTriangle,
  Shield,
  Scale,
  Truck,
  Receipt,
  Phone,
} from "lucide-react";
import { jsPDF } from "jspdf";

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
  | "tl-settlement"
  | "subro-demand"
  | "carrier-rebuttal"
  | "payment-receipt"
  | "urgently-invoice"
  | "pip-exhaustion";

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
      { id: "pip-exhaustion", label: "PIP Exhaustion (FL/PA/VA)", icon: AlertTriangle },
    ],
  },
  {
    label: "Settlements",
    items: [
      { id: "release-bi", label: "General Release — BI", icon: FileCheck },
      { id: "release-pd", label: "General Release — PD", icon: FileCheck },
      { id: "tl-settlement", label: "TL Settlement & Release", icon: FileCheck },
    ],
  },
  {
    label: "Subrogation",
    items: [
      { id: "subro-demand", label: "Subro Demand Letter", icon: Scale },
      { id: "carrier-rebuttal", label: "Carrier Rebuttal", icon: Scale },
      { id: "payment-receipt", label: "Payment Receipt", icon: Receipt },
      { id: "urgently-invoice", label: "Towing Invoice (Urgently)", icon: Truck },
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

function wrapText(doc: jsPDF, text: string, x: number, y: number, maxW: number, lineH: number): number {
  const lines = doc.splitTextToSize(text, maxW);
  doc.text(lines, x, y);
  return y + lines.length * lineH;
}

function downloadPDF(doc: jsPDF, filename: string) {
  doc.save(filename);
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
  });
  const [emailDraft, setEmailDraft] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const emailMutation = trpc.docgen.generateSettlementEmail.useMutation();

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const releaseText = `GENERAL RELEASE OF ALL CLAIMS — BODILY INJURY
FOR SETTLEMENT PURPOSES ONLY

Date: ${today}

Claimant: ${form.claimantName || "[Claimant Name]"}
Claim Number: ${form.claimNumber || "[Claim Number]"}
Date of Loss: ${form.dateOfLoss || "[Date of Loss]"}
Vehicle: ${form.vehicle || "[Vehicle]"}
Settlement Amount: $${form.settlementAmount || "[Amount]"}

In consideration of the payment of ${form.settlementAmount ? `$${form.settlementAmount}` : "[Settlement Amount]"} ("Settlement Amount"), the receipt and sufficiency of which are hereby acknowledged, the undersigned Releasor(s) hereby release and forever discharge Metrocars Leasing Corp d/b/a Whip, Whip Claims Management, their officers, directors, employees, agents, successors, and assigns (collectively "Released Parties") from any and all claims, demands, actions, causes of action, damages, losses, costs, and expenses of any kind or nature whatsoever, known or unknown, arising out of or related to the incident described above, including but not limited to all bodily injury claims, medical expenses, lost wages, pain and suffering, and any other damages of any kind.

This Release is intended to be a full and final settlement of all claims arising from the above-referenced incident. The Releasor acknowledges that this settlement is a compromise of a disputed claim and does not constitute an admission of liability by any of the Released Parties.

The Releasor represents and warrants that: (1) they have the full legal authority to execute this Release; (2) they have not assigned or transferred any claims released herein; and (3) they have had the opportunity to consult with legal counsel prior to executing this Release.

RELEASOR SIGNATURE:

_________________________________    Date: _______________
${form.claimantName || "[Claimant Name]"}

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

  const handleDownload = () => {
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    let y = addWhipLetterhead(doc, "GENERAL RELEASE — BODILY INJURY", `Claim #${form.claimNumber || "[Claim Number]"} — FOR SETTLEMENT PURPOSES ONLY`);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    y = wrapText(doc, releaseText, 14, y, W - 28, 5);
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
        <Panel title="Handler Info">
          <Grid2>
            <Field label="Handler Name" id="rbi-handler" value={form.adjusterName} onChange={set("adjusterName")} placeholder="e.g. Jane Smith" />
            <Field label="Recipient Email (for email)" id="rbi-email" value={form.recipientEmail} onChange={set("recipientEmail")} placeholder="attorney@lawfirm.com" />
          </Grid2>
        </Panel>
        <Panel title="Settlement Email" tag="AI">
          <p className="text-xs text-muted-foreground mb-3">Generate a professional settlement offer email to accompany the release.</p>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-[#ff6221]/40 text-[#ff6221] hover:bg-[#ff6221]/10 mb-3"
            onClick={handleGenerateEmail}
            disabled={emailLoading}
          >
            {emailLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
            {emailLoading ? "Generating..." : "✨ Generate Email Draft"}
          </Button>
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
  });
  const [emailDraft, setEmailDraft] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const emailMutation = trpc.docgen.generateSettlementEmail.useMutation();

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const releaseText = `GENERAL RELEASE OF ALL CLAIMS — PROPERTY DAMAGE
FOR SETTLEMENT PURPOSES ONLY

Date: ${today}

Claimant: ${form.claimantName || "[Claimant Name]"}
Claim Number: ${form.claimNumber || "[Claim Number]"}
Date of Loss: ${form.dateOfLoss || "[Date of Loss]"}
Vehicle: ${form.vehicle || "[Vehicle]"} | VIN: ${form.vin || "[VIN]"}
Settlement Amount: $${form.settlementAmount || "[Amount]"}

In consideration of the payment of ${form.settlementAmount ? `$${form.settlementAmount}` : "[Settlement Amount]"} ("Settlement Amount"), the receipt and sufficiency of which are hereby acknowledged, the undersigned Releasor(s) hereby release and forever discharge Metrocars Leasing Corp d/b/a Whip, Whip Claims Management, their officers, directors, employees, agents, successors, and assigns (collectively "Released Parties") from any and all claims, demands, actions, causes of action, damages, losses, costs, and expenses of any kind or nature whatsoever, known or unknown, arising out of or related to the incident described above, including but not limited to all property damage claims, repair costs, diminished value, loss of use, and any other damages of any kind.

This Release is intended to be a full and final settlement of all property damage claims arising from the above-referenced incident. No title transfer is required. The Releasor acknowledges that this settlement is a compromise of a disputed claim and does not constitute an admission of liability by any of the Released Parties.

RELEASOR SIGNATURE:

_________________________________    Date: _______________
${form.claimantName || "[Claimant Name]"}

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

  const handleDownload = () => {
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    let y = addWhipLetterhead(doc, "GENERAL RELEASE — PROPERTY DAMAGE", `Claim #${form.claimNumber || "[Claim Number]"} — FOR SETTLEMENT PURPOSES ONLY`);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    y = wrapText(doc, releaseText, 14, y, W - 28, 5);
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
        <Panel title="Handler Info">
          <Grid2>
            <Field label="Handler Name" id="rpd-handler" value={form.adjusterName} onChange={set("adjusterName")} placeholder="e.g. Jane Smith" />
            <Field label="Recipient Email (for email)" id="rpd-email" value={form.recipientEmail} onChange={set("recipientEmail")} placeholder="claimant@email.com" />
          </Grid2>
        </Panel>
        <Panel title="Settlement Email" tag="AI">
          <p className="text-xs text-muted-foreground mb-3">Generate a professional settlement offer email to accompany the release.</p>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-[#ff6221]/40 text-[#ff6221] hover:bg-[#ff6221]/10 mb-3"
            onClick={handleGenerateEmail}
            disabled={emailLoading}
          >
            {emailLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
            {emailLoading ? "Generating..." : "✨ Generate Email Draft"}
          </Button>
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
  const [form, setForm] = useState({
    claimantName: "",
    claimNumber: "",
    dateOfLoss: "",
    vehicle: "",
    vin: "",
    acv: "",
    priorDamage: "",
    deductible: "",
    netSettlement: "",
    adjusterName: "",
    lienHolder: "",
  });

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const netAmt = (() => {
    if (form.netSettlement) return form.netSettlement;
    const acv = parseFloat(form.acv) || 0;
    const pd = parseFloat(form.priorDamage) || 0;
    const ded = parseFloat(form.deductible) || 0;
    const net = acv - pd - ded;
    return net > 0 ? net.toFixed(2) : "";
  })();

  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const preview = `TOTAL LOSS SETTLEMENT & RELEASE
FOR SETTLEMENT PURPOSES ONLY

Date: ${today}

Claimant: ${form.claimantName || "[Claimant Name]"}
Claim Number: ${form.claimNumber || "[Claim Number]"}
Date of Loss: ${form.dateOfLoss || "[Date of Loss]"}
Vehicle: ${form.vehicle || "[Vehicle]"} | VIN: ${form.vin || "[VIN]"}

SETTLEMENT BREAKDOWN:
Actual Cash Value (ACV):        $${form.acv || "[ACV]"}
${form.priorDamage ? `Prior Damage Deduction:         -$${form.priorDamage}` : ""}
${form.deductible ? `Deductible:                     -$${form.deductible}` : ""}
NET SETTLEMENT AMOUNT:          $${netAmt || "[Net Amount]"}

${form.lienHolder ? `Lienholder: ${form.lienHolder}\nPayment will be issued jointly to the claimant and lienholder.\n` : ""}
In consideration of the payment of $${netAmt || "[Net Amount]"}, the undersigned Releasor(s) hereby release and forever discharge Metrocars Leasing Corp d/b/a Whip, Whip Claims Management, their officers, directors, employees, agents, successors, and assigns from any and all claims arising out of or related to the total loss of the above-referenced vehicle.

The Releasor agrees to cooperate with the transfer of title and any other documentation required to complete the total loss settlement. No further claims for the above-referenced vehicle will be made against the Released Parties.

RELEASOR SIGNATURE:

_________________________________    Date: _______________
${form.claimantName || "[Claimant Name]"}

_________________________________
Printed Name

Accepted by:
${form.adjusterName || "[Adjuster Name]"}
Whip Claims Management`;

  const handleDownload = () => {
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    let y = addWhipLetterhead(doc, "TOTAL LOSS SETTLEMENT & RELEASE", `Claim #${form.claimNumber || "[Claim Number]"} — FOR SETTLEMENT PURPOSES ONLY`);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    y = wrapText(doc, preview, 14, y, W - 28, 5);
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
          <Grid2 children={<>
            <Field label="Vehicle (Year/Make/Model)" id="tls-vehicle" value={form.vehicle} onChange={set("vehicle")} placeholder="e.g. 2024 Toyota Camry" />
            <Field label="VIN" id="tls-vin" value={form.vin} onChange={set("vin")} placeholder="17-character VIN" />
          </>} />
        </Panel>
        <Panel title="Settlement Breakdown">
          <Grid3>
            <Field label="ACV ($)" id="tls-acv" value={form.acv} onChange={set("acv")} placeholder="e.g. 18500.00" />
            <Field label="Prior Damage Deduction ($)" id="tls-pd" value={form.priorDamage} onChange={set("priorDamage")} placeholder="e.g. 500.00" />
            <Field label="Deductible ($)" id="tls-ded" value={form.deductible} onChange={set("deductible")} placeholder="e.g. 0.00" />
          </Grid3>
          <div className="mt-3">
            <Field label="Net Settlement (override, optional)" id="tls-net" value={form.netSettlement} onChange={set("netSettlement")} placeholder={`Auto-calculated: $${netAmt || "0.00"}`} />
          </div>
          <div className="mt-3">
            <Field label="Lienholder (if any)" id="tls-lien" value={form.lienHolder} onChange={set("lienHolder")} placeholder="e.g. Toyota Financial Services" />
          </div>
        </Panel>
        <Panel title="Handler Info">
          <Field label="Handler Name" id="tls-handler" value={form.adjusterName} onChange={set("adjusterName")} placeholder="e.g. Jane Smith" />
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

// ─── Tab: Urgently / Towing Invoice ──────────────────────────────────────────
interface TowingLineItem {
  description: string;
  qty: string;
  rate: string;
}

function UrgentlyInvoiceTab() {
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
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const lineItemsText = lineItems
    .filter((r) => r.description)
    .map((r) => {
      const total = (parseFloat(r.qty) || 0) * (parseFloat(r.rate) || 0);
      return `  ${r.description.padEnd(35)} ${r.qty.padStart(3)} x $${parseFloat(r.rate || "0").toFixed(2).padStart(8)}  =  $${total.toFixed(2)}`;
    })
    .join("\n");

  const preview = `WHIP CLAIMS MANAGEMENT
TOWING / URGENTLY INVOICE

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
Dropoff: ${form.dropoffAddress || "[Dropoff Address]"}${form.towCompany ? `\nTow Company: ${form.towCompany}` : ""}${form.towDriver ? `\nDriver: ${form.towDriver}` : ""}${form.towPhone ? `\nPhone: ${form.towPhone}` : ""}

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
    let y = addWhipLetterhead(doc, "TOWING INVOICE", `Claim #${form.claimNumber || "[Claim Number]"} — Invoice #${form.invoiceNumber || "N/A"}`);
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
    if (form.towCompany) { doc.text(`Tow Company: ${form.towCompany}`, 14, y); y += 5; }
    y += 3;

    // Line items table
    doc.setFont("helvetica", "bold");
    doc.text("CHARGES", 14, y); y += 5;
    doc.setFont("helvetica", "normal");
    lineItems.filter(r => r.description).forEach((r) => {
      const total = (parseFloat(r.qty) || 0) * (parseFloat(r.rate) || 0);
      doc.text(r.description, 14, y);
      doc.text(`${r.qty} x $${parseFloat(r.rate || "0").toFixed(2)}`, 120, y);
      doc.text(`$${total.toFixed(2)}`, 170, y);
      y += 5;
    });
    doc.setDrawColor(220, 220, 220);
    doc.line(14, y, W - 14, y); y += 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...WHIP_ORANGE);
    doc.text(`TOTAL: $${subtotal.toFixed(2)}`, 14, y); y += 8;
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.setFont("helvetica", "normal");
    if (form.notes) { y = wrapText(doc, `Notes: ${form.notes}`, 14, y, W - 28, 5); y += 4; }
    doc.text(`Authorized By: ${form.adjusterName || "[Adjuster Name]"}`, 14, y);

    addLetterFooter(doc);
    downloadPDF(doc, `Whip_TowingInvoice_${form.claimNumber || "Draft"}.pdf`);
  };

  return (
    <div className="space-y-4">
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
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Tow Company" id="ui-company" value={form.towCompany} onChange={set("towCompany")} placeholder="Company name" />
              <Field label="Driver Name" id="ui-driver" value={form.towDriver} onChange={set("towDriver")} placeholder="Driver name" />
              <Field label="Phone" id="ui-phone" value={form.towPhone} onChange={set("towPhone")} placeholder="(xxx) xxx-xxxx" />
            </div>
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

// ─── Main DocGenerator Page ───────────────────────────────────────────────────
export default function DocGenerator() {
  const [activeTab, setActiveTab] = useState<DocGenTab>("blank-letterhead");

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
      default: return null;
    }
  };

  const activeLabel = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.id === activeTab)?.label || "";

  return (
    <WhipLayout>
      <div className="flex h-full min-h-0">
        {/* Sidebar Nav */}
        <aside className="w-52 shrink-0 border-r border-border bg-muted/20 overflow-y-auto">
          <div className="p-3 border-b border-border">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#ff6221]" />
              <span className="text-sm font-bold text-foreground">Document Generator</span>
            </div>
          </div>
          <nav className="p-2 space-y-3">
            {NAV_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-foreground/40 px-2 mb-1">
                  {group.label}
                </p>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors text-left ${
                        isActive
                          ? "bg-[#ff6221]/10 text-[#ff6221] font-semibold"
                          : "text-foreground/70 hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span className="leading-tight">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          <div className="p-6">
            <div className="mb-5 flex items-center gap-2">
              <ChevronRight className="w-3.5 h-3.5 text-foreground/40" />
              <h1 className="text-lg font-bold text-foreground">{activeLabel}</h1>
            </div>
            {renderTab()}
          </div>
        </div>
      </div>
    </WhipLayout>
  );
}
