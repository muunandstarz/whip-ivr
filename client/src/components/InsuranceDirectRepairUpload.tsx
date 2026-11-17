import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Upload } from "lucide-react";
import { insuranceDirectRepairFactsSchema, REPAIR_PREFILL_FIELDS, repairDocumentConflicts, reviewedRepairPatch, type InsuranceDirectRepairFacts, type RepairPrefillField, type RepairPrefillPatch } from "@shared/insuranceDirectRepair";

type Current = Record<RepairPrefillField, string>;
type Result = { facts?: InsuranceDirectRepairFacts; modelId: string; error?: string; warnings?: string[] };
type RepairMime = "application/pdf" | "image/png" | "image/jpeg" | "image/webp";
type Props = {
  current: Current;
  analyze: (input: { fileBase64: string; fileName: string; mimeType: RepairMime }) => Promise<Result>;
  onApply: (patch: RepairPrefillPatch) => void;
};
const dateFields = new Set<RepairPrefillField>(["dateOfLoss", "repairStart", "returnedToService", "repairCompleted"]);
function display(value: string, date = false): string {
  if (!value) return "Not stated";
  return date && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value.slice(5, 7)}/${value.slice(8)}/${value.slice(0, 4)}` : value;
}

export default function InsuranceDirectRepairUpload({ current, analyze, onApply }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const reader = useRef<FileReader | null>(null);
  const nonce = useRef(0);
  const lastIdentity = useRef(`${current.claimNumber}|${current.vin}`);
  const latestCurrent = useRef(current); latestCurrent.current = current;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [facts, setFacts] = useState<InsuranceDirectRepairFacts | null>(null);
  const [selected, setSelected] = useState<RepairPrefillField[]>([]);
  const [reviewed, setReviewed] = useState(false);
  const [applied, setApplied] = useState(false);
  const fingerprint = REPAIR_PREFILL_FIELDS.map(([key]) => current[key]).join("|");
  useEffect(() => { setReviewed(false); }, [fingerprint]);
  useEffect(() => {
    const identity = `${current.claimNumber}|${current.vin}`;
    if (lastIdentity.current !== identity) {
      lastIdentity.current = identity;
      nonce.current += 1; reader.current?.abort(); setBusy(false); setReviewed(false);
    }
  }, [current.claimNumber, current.vin]);
  useEffect(() => () => { nonce.current += 1; reader.current?.abort(); }, []);
  const conflicts = facts ? repairDocumentConflicts(current, facts) : [];
  const clear = () => {
    nonce.current += 1; reader.current?.abort(); reader.current = null;
    setBusy(false); setFacts(null); setSelected([]); setReviewed(false); setApplied(false); setError("");
    if (input.current) input.current.value = "";
  };
  const read = async (file: File) => {
    clear(); const request = ++nonce.current; setBusy(true);
    let base64 = "";
    try {
      if (!file.size || file.size > 20 * 1024 * 1024) throw new Error("Choose one nonempty repair PDF or image up to 20 MB.");
      const mimeType = file.type || (/\.pdf$/i.test(file.name) ? "application/pdf" : /\.png$/i.test(file.name) ? "image/png" : /\.jpe?g$/i.test(file.name) ? "image/jpeg" : /\.webp$/i.test(file.name) ? "image/webp" : "");
      if (!["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(mimeType)) throw new Error("Use a repair PDF, PNG, JPG or WEBP image.");
      base64 = await new Promise<string>((resolve, reject) => {
        const fileReader = new FileReader(); reader.current = fileReader;
        fileReader.onload = () => { const value = String(fileReader.result || ""); resolve(value.slice(value.indexOf(",") + 1)); };
        fileReader.onerror = () => reject(new Error("The repair file could not be read. Try uploading it again."));
        fileReader.onabort = () => reject(new Error("Upload cancelled."));
        fileReader.readAsDataURL(file);
      });
      if (request !== nonce.current) return;
      const result = await analyze({ fileBase64: base64, fileName: file.name, mimeType: mimeType as RepairMime });
      if (request !== nonce.current) return;
      if (result.error || !result.facts) throw new Error(result.error || "No usable repair fields were found. Enter the repair details manually.");
      const parsed = insuranceDirectRepairFactsSchema.safeParse(result.facts);
      if (!parsed.success) throw new Error("The repair reader returned an invalid result. Your form was not changed.");
      if (parsed.data.documentKind === "dv_appraisal") throw new Error("This is a DV appraisal, not a repair bill. Select a DV demand and use Upload & Read DV Report below.");
      if (!["repair_invoice", "repair_estimate"].includes(parsed.data.documentKind)) throw new Error("This could not be identified as a repair invoice or estimate. Your form was not changed.");
      setFacts(parsed.data);
      const now = latestCurrent.current;
      setSelected(REPAIR_PREFILL_FIELDS.filter(([key]) => parsed.data[key] && !now[key].trim() && (key !== "claimNumber" || parsed.data.claimNumberRole === "our")).map(([key]) => key));
    } catch (reason) {
      if (request === nonce.current) setError(reason instanceof Error ? reason.message : "The repair reader is unavailable. Your form was not changed; enter the repair details manually.");
    } finally {
      base64 = "";
      if (request === nonce.current) { reader.current = null; setBusy(false); if (input.current) input.current.value = ""; }
    }
  };
  const apply = () => {
    if (!facts || !reviewed || conflicts.length || !selected.length) return;
    onApply(reviewedRepairPatch(facts, selected)); setReviewed(false); setApplied(true);
  };

  return <section id="lou-repair-upload" aria-labelledby="lou-repair-upload-heading" className="rounded-lg border border-border bg-card text-card-foreground p-4 space-y-3">
    <div><h3 id="lou-repair-upload-heading" className="text-sm font-semibold">Final Repair Bill / Estimate · Optional Prefill</h3>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">Use this upload for the repair invoice or estimate—not the DV appraisal reader. Review and choose the fields to apply. The bill total is repair cost, not diminished value or loss of use. Source files are processed temporarily, not stored or automatically attached to the packet.</p></div>
    <input id="lou-repair-file" ref={input} type="file" accept="application/pdf,image/png,image/jpeg,image/webp,.pdf,.png,.jpg,.jpeg,.webp" className="hidden" onChange={event => { const file = event.currentTarget.files?.[0]; if (file) void read(file); }} />
    <div className="flex flex-wrap gap-2"><Button id="lou-repair-read" type="button" size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}{busy ? "Reading Repair Document…" : "Upload & Read Final Repair Bill / Estimate"}</Button>{(facts || error || busy) && <Button id="lou-repair-clear" type="button" size="sm" variant="outline" onClick={clear}>{busy ? "Cancel Reading" : "Clear Repair Review"}</Button>}</div>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    {facts && <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
      <div className="grid gap-2 text-xs sm:grid-cols-2"><p><strong>Document:</strong> {facts.documentKind === "repair_invoice" ? "Repair invoice / final bill" : "Repair estimate"}</p><p><strong>Invoice / RO:</strong> {facts.invoiceNumber || facts.roNumber || "Not stated"}</p><p><strong>Invoice date:</strong> {display(facts.invoiceDate, true)} — not a return date</p><p><strong>Repair total (reference only):</strong> {facts.repairTotal ? `$${facts.repairTotal}` : "Not stated"}{facts.sourcePages.repairTotal ? ` · page ${facts.sourcePages.repairTotal}` : ""}</p></div>
      {facts.claimNumber && facts.claimNumberRole === "unknown" && <p className="text-xs text-muted-foreground">Reported claim reference: {facts.claimNumber}. Ownership is not confirmed; it will not be entered as the Whip claim number.</p>}
      <p className="text-xs leading-5 text-muted-foreground">Only blank fields start selected. Selecting an existing field explicitly replaces its current value. Missing dates stay blank: invoice dates and labor hours never become repair or return dates. No bill amount is added to the demand.</p>
      <div className="space-y-2">{REPAIR_PREFILL_FIELDS.filter(([key]) => key !== "claimNumber" || facts.claimNumberRole === "our").map(([key, label]) => <label key={key} className="flex min-h-11 items-start gap-2 text-xs leading-5"><input id={`lou-repair-select-${key}`} type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-current" disabled={!facts[key] || !!conflicts.length} checked={selected.includes(key)} onChange={event => { setReviewed(false); setApplied(false); setSelected(prev => event.target.checked ? [...prev, key] : prev.filter(field => field !== key)); }} /><span className="min-w-0 break-words"><strong>{label}:</strong> {display(facts[key], dateFields.has(key))}{facts.sourcePages[key] ? ` · page ${facts.sourcePages[key]}` : ""}{current[key] && facts[key] && current[key] !== facts[key] && <span className="block text-muted-foreground">Current: {display(current[key], dateFields.has(key))} — replaces only if selected</span>}</span></label>)}</div>
      {facts.warnings.map((warning, index) => <p key={index} className="text-xs leading-5 text-muted-foreground">{warning}</p>)}
      {conflicts.map(conflict => <p key={conflict} role="alert" className="text-xs text-destructive">{conflict}</p>)}
      <label className="flex min-h-11 items-start gap-2 text-xs leading-5"><input id="lou-repair-reviewed" type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-current" disabled={!!conflicts.length || !selected.length} checked={reviewed} onChange={event => setReviewed(event.target.checked)} /><span>I matched this repair document to the claim/vehicle and verified the selected fields against the source. Document dates do not establish liability, payment or returned-to-service status unless expressly stated.</span></label>
      <Button id="lou-repair-apply" type="button" size="sm" disabled={!reviewed || !!conflicts.length || !selected.length} onClick={apply}>Apply Selected Repair Fields</Button>
      {applied && <p role="status" className="text-xs">Selected repair fields applied. DV, rates, liability and enclosure confirmations were not changed.</p>}
    </div>}
  </section>;
}
