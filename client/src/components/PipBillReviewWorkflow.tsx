import React, { useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { jsPDF } from "jspdf";
import { AlertTriangle, CheckCircle, Download, Eye, FileText, Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { toast } from "sonner";
import {
  defaultPipLimit, money, parsePipMoney, PIP_STATE_CONFIG, reviewPipBills,
  type PipBillLine, type PipProviderType, type PipReviewResult, type PipState,
} from "@/lib/pipBillReviewRules";

type PdfKind = "payment" | "provider-eor" | "internal-eor" | "pip-log";
type PdfPreview = { title: string; filename: string; url: string };

type Props = { addLetterhead: (doc: jsPDF) => number; addFooter: (doc: jsPDF) => void };

const today = () => new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
const safeName = (value: string) => value.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "PIP";
const blankLine = (): PipBillLine => ({
  id: crypto.randomUUID(), provider: "", providerType: "medical", dos: "", pos: "", cpt: "", modifier: "", units: 1, billed: 0, dxPointer: "",
});
const asNumber = (value: string) => Number(value.replace(/[^0-9.-]/g, "")) || 0;

function PdfOutput({ value, emptyText }: { value?: PdfPreview; emptyText: string }) {
  if (!value) return <p className="text-xs text-muted-foreground">{emptyText}</p>;
  return <div className="space-y-2"><div className="flex items-center justify-between gap-2"><span className="text-xs font-medium truncate">{value.title}</span><a href={value.url} download={value.filename} className="shrink-0 text-xs underline underline-offset-2">Download</a></div><iframe title={value.title} src={value.url} className="h-[380px] w-full rounded border bg-white" /></div>;
}

export default function PipBillReviewWorkflow({ addLetterhead, addFooter }: Props) {
  const { user } = useAuth();
  const { impersonating } = useImpersonation();
  const { data: handlers } = trpc.handlers.list.useQuery();
  const fileInput = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<PipState>("PA");
  const [claimNumber, setClaimNumber] = useState("");
  const [memberName, setMemberName] = useState("");
  const [dateOfLoss, setDateOfLoss] = useState("");
  const [pipLimit, setPipLimit] = useState("5000");
  const [pipUsed, setPipUsed] = useState("0");
  const [locality, setLocality] = useState("01");
  const [emcStatus, setEmcStatus] = useState<"yes" | "no" | "unknown">("yes");
  const [cobStatus, setCobStatus] = useState<"none" | "primary">("none");
  const [files, setFiles] = useState<File[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [extractionMessage, setExtractionMessage] = useState("");
  const [lines, setLines] = useState<PipBillLine[]>([blankLine()]);
  const [result, setResult] = useState<PipReviewResult | null>(null);
  const [previews, setPreviews] = useState<Partial<Record<PdfKind, PdfPreview>>>({});

  const config = PIP_STATE_CONFIG[state];
  const effectiveHandler = useMemo(() => {
    if (impersonating) return { name: impersonating.name, email: impersonating.email || "", title: "Claims Handler" };
    const linked = user?.handlerProfileId ? handlers?.find((handler) => handler.id === user.handlerProfileId) : null;
    return { name: linked?.name || user?.name || user?.email || "Assigned Claims Handler", email: linked?.email || user?.email || "", title: "Claims Handler" };
  }, [handlers, impersonating, user]);

  useEffect(() => {
    const nextConfig = PIP_STATE_CONFIG[state];
    setLocality(nextConfig.localities[0]!.value);
    setPipLimit(String(defaultPipLimit(state, emcStatus)));
    setResult(null);
  }, [state]);
  useEffect(() => { if (state === "FL") setPipLimit(String(defaultPipLimit("FL", emcStatus))); }, [emcStatus, state]);
  useEffect(() => () => Object.values(previews).forEach((preview) => preview && URL.revokeObjectURL(preview.url)), [previews]);

  const updateLine = (id: string, patch: Partial<PipBillLine>) => { setLines((current) => current.map((line) => line.id === id ? { ...line, ...patch } : line)); setResult(null); };
  const removeLine = (id: string) => { setLines((current) => current.length === 1 ? [blankLine()] : current.filter((line) => line.id !== id)); setResult(null); };

  const acceptFiles = async (incoming: FileList | File[]) => {
    const supported: File[] = [];
    for (const file of Array.from(incoming)) {
      if (file.name.toLowerCase().endsWith(".zip")) {
        try {
          const zip = await JSZip.loadAsync(file);
          for (const entry of Object.values(zip.files)) {
            if (entry.dir || entry.name.startsWith("__MACOSX/") || entry.name.includes("/\.")) continue;
            const lower = entry.name.toLowerCase();
            if (!/\.(pdf|png|jpe?g)$/.test(lower)) continue;
            const type = lower.endsWith(".pdf") ? "application/pdf" : lower.endsWith(".png") ? "image/png" : "image/jpeg";
            supported.push(new File([await entry.async("blob")], entry.name.split("/").pop() || "bill", { type }));
          }
        } catch { /* Invalid archives remain out of the intake queue. */ }
      } else if (/\.(pdf|png|jpe?g)$/i.test(file.name)) supported.push(file);
    }
    setFiles((current) => [...current, ...supported]);
    setExtractionMessage(supported.length ? "Ready to extract. Files are analyzed in memory and are not saved to document storage." : "No supported PDF, PNG, JPG, or ZIP files were added.");
  };

  const extractBills = async () => {
    if (!files.length) return;
    setExtracting(true);
    setExtractionMessage("Reading the uploaded bill packet…");
    try {
      const body = new FormData();
      body.append("state", state);
      files.forEach((file) => body.append("files", file));
      const response = await fetch("/api/pip-bill-review/extract", { method: "POST", body });
      const payload = await response.json().catch(() => ({})) as {
        lines?: Array<Partial<PipBillLine>>;
        warning?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Could not extract bill lines from this upload.");
      const extracted = (payload.lines ?? []).map((line, index) => ({
        id: `extracted-${index}-${crypto.randomUUID()}`,
        provider: line.provider || "",
        providerType: "medical" as PipProviderType,
        dos: line.dos || "",
        pos: line.pos || "",
        cpt: line.cpt || "",
        modifier: line.modifier || "",
        units: Number(line.units) || 1,
        billed: Number(line.billed) || 0,
        dxPointer: "",
      }));
      if (!extracted.length) {
        const message = payload.warning || "No billed service lines were found. Add or correct bill lines below.";
        setExtractionMessage(message);
        toast.warning(message);
        return;
      }
      setLines(extracted);
      setResult(reviewPipBills({ state, locality, pipLimit: asNumber(pipLimit), pipUsed: asNumber(pipUsed), dateOfLoss, emcStatus, cobStatus, lines: extracted }));
      const message = `Extracted ${extracted.length} bill line${extracted.length === 1 ? "" : "s"}; the PIP review is ready below. Review and correct every line before creating documents.`;
      setExtractionMessage(message);
      toast.success(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not extract bill lines from this upload.";
      setExtractionMessage(message);
      toast.error(message);
    } finally {
      setExtracting(false);
    }
  };

  const runReview = () => setResult(reviewPipBills({ state, locality, pipLimit: asNumber(pipLimit), pipUsed: asNumber(pipUsed), dateOfLoss, emcStatus, cobStatus, lines }));
  const bodyWidth = (doc: jsPDF) => doc.internal.pageSize.getWidth() - 72;
  const metadata = () => ({ claim: claimNumber || "[Claim Number]", member: memberName || "[Member]", dol: dateOfLoss || "[DOL]" });

  const drawMeta = (doc: jsPDF, y: number, landscape = false) => {
    const meta = metadata(); const x = 36;
    doc.setFont("helvetica", "bold"); doc.setTextColor(35, 35, 35); doc.setFontSize(8);
    doc.text("Claim:", x, y); doc.text("Member:", x + 185, y); doc.text("Date of loss:", x + 365, y);
    doc.setFont("helvetica", "normal"); doc.text(meta.claim, x + 36, y); doc.text(meta.member, x + 228, y); doc.text(meta.dol, x + 425, y);
    if (landscape) { doc.setFont("helvetica", "bold"); doc.text("PIP limit:", x + 560, y); doc.setFont("helvetica", "normal"); doc.text(money(asNumber(pipLimit)), x + 605, y); }
    return y + 18;
  };
  const footerAllPages = (doc: jsPDF) => { const count = doc.getNumberOfPages(); for (let page = 1; page <= count; page++) { doc.setPage(page); addFooter(doc); doc.setFontSize(7); doc.setTextColor(100); doc.text(`Page ${page} of ${count} · ${config.statute}`, doc.internal.pageSize.getWidth() - 36, doc.internal.pageSize.getHeight() - 18, { align: "right" }); } };
  const createPdf = (kind: PdfKind, provider?: string) => {
    if (!result) return null;
    const landscape = kind === "pip-log";
    const doc = new jsPDF({ unit: "pt", format: "letter", orientation: landscape ? "landscape" : "portrait" });
    const pageW = doc.internal.pageSize.getWidth(), pageH = doc.internal.pageSize.getHeight(), margin = 36;
    let y = addLetterhead(doc);
    const heading = kind === "payment" ? "PIP PAYMENT DETERMINATION" : kind === "provider-eor" || kind === "internal-eor" ? "EXPLANATION OF REVIEW" : "PIP PAYMENT LOG";
    doc.setTextColor(25, 25, 25); doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.text(heading, margin, y); if (kind === "internal-eor") { doc.setFontSize(8); doc.text("INTERNAL — DO NOT DISTRIBUTE", margin + 190, y); }
    y += 18; doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(80); doc.text(today(), margin, y); y = drawMeta(doc, y + 17, landscape);
    const displayLines = provider ? result.lines.filter((line) => (line.provider || "Unknown Provider") === provider) : result.lines;
    if (kind === "payment") {
      const billed = displayLines.reduce((sum, line) => sum + line.billed, 0), allowed = displayLines.reduce((sum, line) => sum + line.allowed, 0);
      doc.setFont("helvetica", "bold"); doc.setTextColor(25); doc.text("To:", margin, y); doc.setFont("helvetica", "normal"); doc.text(provider || "Provider", margin + 24, y); y += 24;
      const text = `Whip has completed its review of the bills submitted by your office under Personal Injury Protection coverage. ${config.letterClause}\n\nBills reviewed: ${displayLines.length} line item${displayLines.length === 1 ? "" : "s"}\nTotal billed: ${money(billed)}\nTotal allowed: ${money(allowed)}\nTotal reduction: ${money(billed - allowed)}\n\nPayment in the amount of ${money(allowed)} is being processed under separate cover. A line-by-line Explanation of Review accompanies this determination.\n\n${config.paymentInFullClause}\n\nIf you have questions, please contact the assigned claims handler listed below.`;
      doc.setFontSize(10); doc.setTextColor(40); const body = doc.splitTextToSize(text, bodyWidth(doc)); doc.text(body, margin, y); y += body.length * 13 + 22;
      doc.setFont("helvetica", "normal"); doc.text("Sincerely,", margin, y); y += 28; doc.setFont("helvetica", "bold"); doc.text(effectiveHandler.name, margin, y); y += 12; doc.setFont("helvetica", "normal"); doc.text(effectiveHandler.title, margin, y); if (effectiveHandler.email) { y += 12; doc.text(effectiveHandler.email, margin, y); }
    } else {
      doc.setFillColor(245, 245, 245); doc.rect(margin, y, pageW - margin * 2, 28, "F"); doc.setTextColor(30); doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text(`Total billed: ${money(result.totalBilled)}`, margin + 8, y + 12); doc.text(`Total allowed: ${money(result.totalAllowed)}`, margin + 190, y + 12); doc.text(`Remaining PIP: ${money(result.pipRemaining)}`, margin + 370, y + 12); y += 40;
      const columns = landscape ? [{ label: "DOS", x: margin, w: 58 }, { label: "Provider", x: margin + 58, w: 150 }, { label: "CPT", x: margin + 208, w: 45 }, { label: "Units", x: margin + 253, w: 40 }, { label: "Billed", x: margin + 293, w: 70 }, { label: "Paid", x: margin + 363, w: 70 }, { label: "Denied / pend.", x: margin + 433, w: 88 }, { label: "Notes", x: margin + 521, w: pageW - margin - (margin + 521) }] : [{ label: "DOS", x: margin, w: 52 }, { label: "CPT", x: margin + 52, w: 44 }, { label: "Units", x: margin + 96, w: 36 }, { label: "Billed", x: margin + 132, w: 56 }, { label: "Schedule", x: margin + 188, w: 60 }, { label: "Allowed", x: margin + 248, w: 58 }, { label: "Status", x: margin + 306, w: 52 }, { label: "Reason", x: margin + 358, w: pageW - margin - (margin + 358) }];
      const header = () => { doc.setFillColor(60, 60, 60); doc.rect(margin, y, pageW - margin * 2, 16, "F"); doc.setFont("helvetica", "bold"); doc.setTextColor(255); doc.setFontSize(7); columns.forEach((column) => doc.text(column.label, column.x + 3, y + 11)); y += 16; };
      const nextPage = () => { if (y <= pageH - 78) return; doc.addPage(); y = addLetterhead(doc) + 18; header(); };
      header(); doc.setFont("helvetica", "normal");
      displayLines.forEach((line, index) => { nextPage(); const rowH = landscape ? 24 : 31; if (index % 2 === 0) { doc.setFillColor(249, 249, 249); doc.rect(margin, y, pageW - margin * 2, rowH, "F"); } doc.setTextColor(40); doc.setFontSize(7); if (landscape) { doc.text(line.dos || "—", columns[0]!.x + 3, y + 12); doc.text((line.provider || "—").slice(0, 25), columns[1]!.x + 3, y + 12); doc.text(line.cpt, columns[2]!.x + 3, y + 12); doc.text(String(line.units), columns[3]!.x + 3, y + 12); doc.text(money(line.billed), columns[4]!.x + 3, y + 12); doc.text(money(line.allowed), columns[5]!.x + 3, y + 12); doc.text(money(line.billed - line.allowed), columns[6]!.x + 3, y + 12); doc.text((line.status === "allowed" ? "Paid" : line.status === "partial" ? "Reduced" : "Denied") + " — see EOR", columns[7]!.x + 3, y + 12); } else { doc.text(line.dos || "—", columns[0]!.x + 3, y + 11); doc.setFont("helvetica", "bold"); doc.text(line.cpt, columns[1]!.x + 3, y + 11); doc.setFont("helvetica", "normal"); doc.text(String(line.units), columns[2]!.x + 3, y + 11); doc.text(money(line.billed), columns[3]!.x + 3, y + 11); doc.text(line.scheduleCap === null ? "—" : money(line.scheduleCap), columns[4]!.x + 3, y + 11); doc.text(money(line.allowed), columns[5]!.x + 3, y + 11); doc.text(line.status.toUpperCase(), columns[6]!.x + 3, y + 11); const reason = doc.splitTextToSize(line.reason, columns[7]!.w - 5); doc.text(reason.slice(0, 3), columns[7]!.x + 3, y + 9); } y += rowH; });
      if (kind === "internal-eor" && result.flags.length) { doc.addPage(); y = addLetterhead(doc); doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(25); doc.text("Internal Review Notes", margin, y); y += 20; result.flags.forEach((flag) => { const titleLines = doc.splitTextToSize(`• ${flag.title}`, bodyWidth(doc)); const detailLines = doc.splitTextToSize(flag.detail, bodyWidth(doc) - 12); if (y + titleLines.length * 11 + detailLines.length * 10 > pageH - 58) { doc.addPage(); y = addLetterhead(doc); } doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text(titleLines, margin, y); y += titleLines.length * 11; doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.text(detailLines, margin + 10, y); y += detailLines.length * 10 + 10; }); }
    }
    footerAllPages(doc); return doc;
  };

  const build = (kind: PdfKind, download = false) => {
    if (!result) return;
    const firstProvider = result.providerSummaries[0]?.provider;
    if (kind === "payment") {
      result.providerSummaries.forEach((summary, index) => { const doc = createPdf("payment", summary.provider); if (!doc) return; const filename = `PIP_Payment_Letter_${safeName(claimNumber)}_${safeName(summary.provider)}.pdf`; if (download) doc.save(filename); if (index === 0) { const url = URL.createObjectURL(doc.output("blob")); setPreviews((current) => ({ ...current, payment: { title: `Payment Letter — ${summary.provider}`, filename, url } })); } });
    } else { const doc = createPdf(kind); if (!doc) return; const filename = `${kind === "provider-eor" ? "Provider_EOR" : kind === "internal-eor" ? "Internal_EOR" : "PIP_Log"}_${safeName(claimNumber)}.pdf`; if (download) doc.save(filename); const url = URL.createObjectURL(doc.output("blob")); setPreviews((current) => ({ ...current, [kind]: { title: kind === "provider-eor" ? "Provider EOR" : kind === "internal-eor" ? "Internal EOR" : "Attorney PIP Log", filename, url } })); }
  };
  const generateAll = () => { (["payment", "provider-eor", "internal-eor", "pip-log"] as PdfKind[]).forEach((kind) => build(kind, true)); };

  return <div className="space-y-5">
    <div className="rounded-lg border border-border bg-card p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-foreground">PIP Bill Review</h2><p className="mt-1 text-sm text-muted-foreground">Five-step bill review, editable before calculation and document output.</p></div><div className="rounded border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"><span className="font-semibold text-foreground">Prepared by:</span> {effectiveHandler.name}{effectiveHandler.email ? ` · ${effectiveHandler.email}` : ""}</div></div></div>
    <section className="rounded-lg border border-border bg-card p-4"><div className="mb-3 flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">1</span><h3 className="font-semibold">Claim setup</h3></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div><Label>State</Label><Select value={state} onValueChange={(value) => setState(value as PipState)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(["PA", "MD", "FL", "MA"] as PipState[]).map((value) => <SelectItem key={value} value={value}>{PIP_STATE_CONFIG[value].name}</SelectItem>)}</SelectContent></Select></div><div><Label>Claim number</Label><Input value={claimNumber} onChange={(event) => setClaimNumber(event.target.value)} placeholder="WH-2026-XXXX" /></div><div><Label>Member name</Label><Input value={memberName} onChange={(event) => setMemberName(event.target.value)} placeholder="Last, First" /></div><div><Label>Date of loss</Label><Input type="date" value={dateOfLoss} onChange={(event) => setDateOfLoss(event.target.value)} /></div><div><Label>PIP limit</Label><Input inputMode="decimal" value={pipLimit} onChange={(event) => setPipLimit(event.target.value)} /></div><div><Label>PIP used to date</Label><Input inputMode="decimal" value={pipUsed} onChange={(event) => setPipUsed(event.target.value)} /></div><div><Label>Locality</Label><Select value={locality} onValueChange={setLocality}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{config.localities.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>{state === "FL" && <div><Label>EMC determination</Label><Select value={emcStatus} onValueChange={(value) => setEmcStatus(value as typeof emcStatus)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="yes">Yes — full $10,000 PIP</SelectItem><SelectItem value="no">No — $2,500 limit</SelectItem><SelectItem value="unknown">Unknown / pending</SelectItem></SelectContent></Select></div>}{state === "MA" && <div><Label>Health-insurance coordination</Label><Select value={cobStatus} onValueChange={(value) => setCobStatus(value as typeof cobStatus)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No health insurance — full PIP</SelectItem><SelectItem value="primary">Health insurance primary above $2,000</SelectItem></SelectContent></Select></div>}</div><p className="mt-3 border-l-2 border-muted-foreground/40 pl-3 text-xs leading-relaxed text-muted-foreground"><span className="font-semibold text-foreground">{config.name} · {config.statute}.</span> {config.notice}</p></section>
    <section className="rounded-lg border border-border bg-card p-4"><div className="mb-3 flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">2</span><h3 className="font-semibold">Upload bills</h3></div><input ref={fileInput} className="hidden" type="file" accept=".pdf,.png,.jpg,.jpeg,.zip" multiple onChange={(event) => { if (event.target.files) void acceptFiles(event.target.files); event.target.value = ""; }} /><div role="button" tabIndex={0} onClick={() => fileInput.current?.click()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") fileInput.current?.click(); }} onDrop={(event) => { event.preventDefault(); void acceptFiles(event.dataTransfer.files); }} onDragOver={(event) => event.preventDefault()} className="cursor-pointer rounded-md border border-dashed border-muted-foreground/40 bg-muted/20 px-4 py-5 text-center"><Upload className="mx-auto h-5 w-5 text-muted-foreground" /><p className="mt-2 text-sm font-medium">Drop HCFA-1500s, scans, or a ZIP archive</p><p className="mt-1 text-xs text-muted-foreground">PDF, PNG, JPG, and ZIP are accepted. Multiple source files are consolidated into this claim.</p></div>{files.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{files.map((file, index) => <span key={`${file.name}-${index}`} className="inline-flex items-center gap-1 rounded border bg-background px-2 py-1 text-xs"><FileText className="h-3 w-3" />{file.name}<button aria-label={`Remove ${file.name}`} onClick={() => setFiles((current) => current.filter((_, candidate) => candidate !== index))}><X className="h-3 w-3" /></button></span>)}</div>}<div className="mt-3 flex flex-wrap gap-2"><Button onClick={extractBills} disabled={!files.length || extracting} variant="outline">{extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{extracting ? "Extracting bills…" : "Extract uploaded bills"}</Button><Button onClick={() => { setFiles([]); setLines([blankLine()]); setResult(null); setExtractionMessage(""); }} variant="ghost">Clear</Button></div>{extractionMessage && <p role="status" className="mt-2 rounded border border-muted-foreground/20 bg-muted/20 px-3 py-2 text-xs leading-relaxed text-muted-foreground">{extractionMessage}</p>}<p className="mt-2 text-xs text-muted-foreground">Extraction is a convenience. Review and correct every editable line below before using an output.</p></section>
    <section className="rounded-lg border border-border bg-card p-4"><div className="mb-3 flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">3</span><h3 className="font-semibold">Review editable bill lines</h3></div><div className="overflow-x-auto"><table className="min-w-[1040px] w-full text-xs"><thead className="border-b text-left text-muted-foreground"><tr><th className="pb-2 pr-2">Provider</th><th className="pb-2 pr-2">Type</th><th className="pb-2 pr-2">DOS</th><th className="pb-2 pr-2">POS</th><th className="pb-2 pr-2">CPT</th><th className="pb-2 pr-2">Mod.</th><th className="pb-2 pr-2">Units</th><th className="pb-2 pr-2">Billed</th><th className="pb-2 pr-2">DX ptr.</th><th className="pb-2" /></tr></thead><tbody>{lines.map((line) => <tr key={line.id} className="border-b border-border/60"><td className="py-1 pr-2"><Input className="h-8 min-w-40" value={line.provider} onChange={(event) => updateLine(line.id, { provider: event.target.value })} /></td><td className="py-1 pr-2"><Select value={line.providerType} onValueChange={(value) => updateLine(line.id, { providerType: value as PipProviderType })}><SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger><SelectContent>{(["medical", "chiro", "therapy", "imaging", "hospital", "other"] as PipProviderType[]).map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select></td><td className="py-1 pr-2"><Input className="h-8 w-32" type="date" value={line.dos} onChange={(event) => updateLine(line.id, { dos: event.target.value })} /></td><td className="py-1 pr-2"><Input className="h-8 w-14" value={line.pos} onChange={(event) => updateLine(line.id, { pos: event.target.value })} /></td><td className="py-1 pr-2"><Input className="h-8 w-18" value={line.cpt} onChange={(event) => updateLine(line.id, { cpt: event.target.value })} /></td><td className="py-1 pr-2"><Input className="h-8 w-16" value={line.modifier} onChange={(event) => updateLine(line.id, { modifier: event.target.value })} /></td><td className="py-1 pr-2"><Input className="h-8 w-16" type="number" min="1" value={line.units} onChange={(event) => updateLine(line.id, { units: Number(event.target.value) || 1 })} /></td><td className="py-1 pr-2"><Input className="h-8 w-24" inputMode="decimal" value={line.billed || ""} onChange={(event) => updateLine(line.id, { billed: Number(event.target.value) || 0 })} /></td><td className="py-1 pr-2"><Input className="h-8 w-16" value={line.dxPointer} onChange={(event) => updateLine(line.id, { dxPointer: event.target.value })} /></td><td className="py-1"><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeLine(line.id)} aria-label="Remove bill line"><Trash2 className="h-3.5 w-3.5" /></Button></td></tr>)}</tbody></table></div><div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" onClick={() => setLines((current) => [...current, blankLine()])}><Plus className="h-4 w-4" />Add line</Button><Button onClick={runReview}><CheckCircle className="h-4 w-4" />Run PIP bill review</Button></div></section>
    {result && <><section className="rounded-lg border border-border bg-card p-4"><div className="mb-3 flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">4</span><h3 className="font-semibold">Bill review results</h3></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="rounded border p-3"><p className="text-[11px] text-muted-foreground">Total billed</p><p className="font-semibold">{money(result.totalBilled)}</p></div><div className="rounded border p-3"><p className="text-[11px] text-muted-foreground">Total allowed</p><p className="font-semibold">{money(result.totalAllowed)}</p></div><div className="rounded border p-3"><p className="text-[11px] text-muted-foreground">Reduced / denied</p><p className="font-semibold">{money(result.totalReduced)}</p></div><div className="rounded border p-3"><p className="text-[11px] text-muted-foreground">PIP remaining</p><p className="font-semibold">{money(result.pipRemaining)}</p></div></div><div className="mt-4 overflow-x-auto"><table className="min-w-[850px] w-full text-xs"><thead className="border-b text-left text-muted-foreground"><tr><th className="pb-2">Provider</th><th className="pb-2">DOS</th><th className="pb-2">CPT</th><th className="pb-2 text-right">Billed</th><th className="pb-2 text-right">Schedule</th><th className="pb-2 text-right">Allowed</th><th className="pb-2">Status</th><th className="pb-2">Reason</th></tr></thead><tbody>{result.lines.map((line) => <tr key={line.id} className="border-b border-border/60 align-top"><td className="py-2 pr-2">{line.provider || "—"}</td><td className="py-2 pr-2">{line.dos || "—"}</td><td className="py-2 pr-2 font-mono">{line.cpt || "—"}</td><td className="py-2 pr-2 text-right">{money(line.billed)}</td><td className="py-2 pr-2 text-right">{line.scheduleCap === null ? "—" : money(line.scheduleCap)}</td><td className="py-2 pr-2 text-right font-medium">{money(line.allowed)}</td><td className="py-2 pr-2"><span className="rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase">{line.status}</span></td><td className="py-2 text-muted-foreground">{line.reason}</td></tr>)}</tbody></table></div>{result.flags.length > 0 && <div className="mt-4 space-y-2"><h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Flags and notices</h4>{result.flags.map((flag, index) => <div key={`${flag.title}-${index}`} className="flex gap-2 rounded border p-3"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><div><p className="text-xs font-semibold">{flag.title}</p><p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{flag.detail}</p></div></div>)}</div>}</section>
    <section className="rounded-lg border border-border bg-card p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">5</span><h3 className="font-semibold">Standardized PIP outputs</h3></div><Button variant="outline" onClick={generateAll}><Download className="h-4 w-4" />Generate all</Button></div><p className="mb-4 text-xs text-muted-foreground">Neutral black/gray documents use the approved Whip logo. Every output identifies the active handler, including handler-view context.</p><div className="grid gap-4 xl:grid-cols-2">{([ ["payment", `Payment letter (${result.providerSummaries.length} provider${result.providerSummaries.length === 1 ? "" : "s"})`], ["provider-eor", "EOR — provider version"], ["internal-eor", "EOR — internal version"], ["pip-log", "PIP log — attorney version"] ] as Array<[PdfKind, string]>).map(([kind, label]) => <div key={kind} className="rounded border p-3"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold">{label}</h4><div className="flex gap-1.5"><Button size="sm" variant="outline" onClick={() => build(kind)}><Eye className="h-3.5 w-3.5" />Preview</Button><Button size="sm" variant="outline" onClick={() => build(kind, true)}><Download className="h-3.5 w-3.5" />Download</Button></div></div><PdfOutput value={previews[kind]} emptyText="Build a preview to review this PDF in the workspace." /></div>)}</div></section></>}
  </div>;
}
