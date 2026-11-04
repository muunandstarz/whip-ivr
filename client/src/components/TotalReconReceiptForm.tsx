import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { totalReconReceiptSchema, receiptBalances, receiptDollars, type TotalReconReceiptFields } from "@shared/totalReconReceipt";
import { createTotalReconReceiptPdf, loadTotalReconReceiptTemplate } from "@/lib/totalReconReceiptPdf";

function blankReceipt(): TotalReconReceiptFields {
  const now = new Date(); const receiptDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return { receiptDate, owner: "", vehicle: "", vin: "", licensePlate: "", color: "", claimNumber: "", roNumber: "", receivedFrom: "", paymentMethod: "check", referenceNumber: "", paymentDate: "", amountReceived: "", receivedBy: "", totalBalanceDue: "", priorPayments: "0.00" };
}
function initialFields(draft?: Record<string, unknown>): TotalReconReceiptFields {
  const fields = blankReceipt();
  if (draft?.receiptTemplateVersion === "total-recon-v1") {
    for (const key of Object.keys(fields) as (keyof TotalReconReceiptFields)[]) if (typeof draft[key] === "string") (fields as Record<string, string>)[key] = draft[key] as string;
  }
  return fields;
}
function fileUrl(bytes: Uint8Array): string { return URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer], { type: "application/pdf" })); }
function download(url: string, name: string) { const a = document.createElement("a"); a.href = url; a.download = name; a.click(); }

export default function TotalReconReceiptForm({ initialDraft, onDraftChange }: {
  initialDraft?: Record<string, unknown>; onDraftChange?: (draft: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState(() => initialFields(initialDraft));
  const [paymentVerified, setPaymentVerified] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [issuedNumber, setIssuedNumber] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);
  const pendingRequest = useRef<{ key: string; fingerprint: string } | null>(null);
  const issue = trpc.docgen.issueTotalReconReceipt.useMutation();
  useEffect(() => { onDraftChange?.({ ...form, receiptTemplateVersion: "total-recon-v1" }); }, [form, onDraftChange]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  const update = (key: keyof TotalReconReceiptFields, value: string) => {
    setForm(p => ({ ...p, [key]: value })); setPaymentVerified(false); setPreviewUrl(null); setIssuedNumber(null); setError(null); pendingRequest.current = null;
  };
  const render = async (issueReceipt: boolean) => {
    if (locked.current) return;
    const parsed = totalReconReceiptSchema.safeParse(form);
    if (!parsed.success) { setError(parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join(" · ")); return; }
    if (issueReceipt && !paymentVerified) { setError("Confirm that the payment was actually received and the details were verified."); return; }
    locked.current = true; setBusy(true); setError(null);
    try {
      const template = await loadTotalReconReceiptTemplate();
      // Fit all fields before allocating a number. Preview never writes an issued record.
      let bytes = await createTotalReconReceiptPdf(template, parsed.data, "PREVIEW");
      let number: string | null = null;
      if (issueReceipt) {
        const fingerprint = JSON.stringify(parsed.data);
        if (!pendingRequest.current || pendingRequest.current.fingerprint !== fingerprint) pendingRequest.current = { key: crypto.randomUUID(), fingerprint };
        const result = await issue.mutateAsync({ requestKey: pendingRequest.current.key, fields: parsed.data, paymentVerified: true });
        number = result.receiptNumber;
        bytes = await createTotalReconReceiptPdf(template, result.fields, number);
        // Clear only after PDF generation succeeds. A failed retry reuses the allocated number.
        pendingRequest.current = null;
      }
      const url = fileUrl(bytes); setPreviewUrl(url); setIssuedNumber(number);
      if (number) { download(url, `Total_Recon_Payment_Receipt_${number}.pdf`); toast.success(`Receipt ${number} generated`); }
    } catch (e) { setError(e instanceof Error ? e.message : "The receipt could not be generated. Please retry."); }
    finally { locked.current = false; setBusy(false); }
  };
  const balances = form.amountReceived && form.totalBalanceDue && /^\d+(\.\d{1,2})?$/.test(form.amountReceived) && /^\d+(\.\d{1,2})?$/.test(form.totalBalanceDue) && /^\d+(\.\d{1,2})?$/.test(form.priorPayments) ? receiptBalances(form) : null;
  const field = (key: keyof TotalReconReceiptFields, label: string, type = "text", required = true) => (
    <div className="space-y-1" key={key}>
      <Label htmlFor={`tr-${key}`} className="text-xs">{label}{required ? " *" : ""}</Label>
      <Input id={`tr-${key}`} value={form[key]} onChange={e => update(key, e.target.value)} type={type} disabled={busy} className="h-9" autoComplete="off" {...(type === "number" ? { min: "0", step: "0.01" } : {})} />
    </div>
  );
  return <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
    <div className="space-y-4">
      <Card><CardHeader className="pb-3"><CardTitle className="text-base">Receipt information</CardTitle></CardHeader><CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">Uses the supplied Total Recon template. Each new receipt receives a short, unique server-issued number (no more than 10 digits). Preview is unissued and does not reserve a number.</p>
        {field("receiptDate", "Receipt date", "date")}
        <div className="rounded-md bg-muted p-3 text-sm">Receipt number: <strong>{issuedNumber || "Assigned when generated"}</strong></div>
      </CardContent></Card>
      <Card><CardHeader className="pb-3"><CardTitle className="text-base">Owner & vehicle</CardTitle></CardHeader><CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {field("owner", "Owner")}{field("vehicle", "Year / make / model")}{field("vin", "VIN (17 characters)")}{field("licensePlate", "License plate (or N/A)")}{field("color", "Color (or N/A)")}{field("claimNumber", "Full claim number")}{field("roNumber", "RO number")}
      </CardContent></Card>
      <Card><CardHeader className="pb-3"><CardTitle className="text-base">Payment details</CardTitle></CardHeader><CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {field("receivedFrom", "Received from")}
        <div className="space-y-1"><Label htmlFor="tr-paymentMethod" className="text-xs">Payment method *</Label><select id="tr-paymentMethod" value={form.paymentMethod} onChange={e => update("paymentMethod", e.target.value)} disabled={busy} className="h-9 w-full rounded-md border border-input bg-background text-foreground px-3 text-sm"><option value="check">Check</option><option value="ach">ACH</option><option value="wire">Wire</option><option value="card">Card</option></select></div>
        {field("referenceNumber", "Check / reference number", "text", form.paymentMethod === "check")}{field("paymentDate", "Payment date", "date")}{field("amountReceived", "Amount received this payment ($)", "number")}{field("receivedBy", "Received by")}
      </CardContent></Card>
      <Card><CardHeader className="pb-3"><CardTitle className="text-base">Payment summary</CardTitle></CardHeader><CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{field("totalBalanceDue", "Total balance due before payments ($)", "number")}{field("priorPayments", "Prior payments, excluding this payment ($)", "number")}</div>
        <p className="text-xs text-muted-foreground">Payments received = prior payments + this payment. Remaining balance = total balance due − payments received.</p>
        <dl className="grid grid-cols-2 gap-2 text-sm"><dt>Payments received</dt><dd className="text-right">{balances ? `$${receiptDollars(balances.paymentsCents)}` : "—"}</dd><dt className="font-semibold">Remaining balance</dt><dd className="text-right font-semibold">{balances ? `$${receiptDollars(balances.remainingCents)}` : "—"}</dd></dl>
        <div className="flex items-start gap-2"><Checkbox id="tr-verified" checked={paymentVerified} onCheckedChange={v => setPaymentVerified(v === true)} disabled={busy} /><Label htmlFor="tr-verified" className="text-xs leading-relaxed">I verified that Total Recon actually received this payment and that the payer, reference, amounts and receiver are correct. This receipt does not initiate a payment or verify bank settlement.</Label></div>
      </CardContent></Card>
    </div>
    <div className="space-y-3 xl:sticky xl:top-4 self-start">
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => render(false)} disabled={busy}><Eye className="size-4 mr-2" />Preview receipt</Button><Button onClick={() => render(true)} disabled={busy || !paymentVerified}>{busy ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Download className="size-4 mr-2" />}Generate new receipt & download</Button></div>
      {error && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 text-destructive p-3 text-sm">{error}</div>}
      {issuedNumber && <p className="text-xs text-muted-foreground">{issuedNumber}. Generating again creates a different receipt number. <button className="underline" onClick={() => previewUrl && download(previewUrl, `Total_Recon_Payment_Receipt_${issuedNumber}.pdf`)}>Re-download this receipt</button></p>}
      {previewUrl ? <iframe title="Total Recon Payment Receipt PDF preview" src={previewUrl} className="w-full h-[75vh] min-h-[480px] rounded-lg border bg-white" /> : <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Fill the template fields, then preview the one-page receipt. The PDF preserves the supplied Total Recon logo, contact block, tables and footer.</div>}
    </div>
  </div>;
}
