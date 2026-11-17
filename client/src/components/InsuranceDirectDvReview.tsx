import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { buildDvReportReference, dvReportConflicts, type DvReportFacts } from "@shared/insuranceDirectDv";

export interface InsuranceDirectDvReviewProps {
  current: { claimNumber: string; vin: string; dvAmount: string; dvMethod: string; prelossValue: string; postlossValue: string };
  confirmed: boolean;
  onApply: (report: DvReportFacts) => void;
  onInvalidate: () => void;
  onManualConfirm: (checked: boolean) => void;
}

/** Mounted only in final review. Files/results remain transient; there is no external-job polling. */
export default function InsuranceDirectDvReview({ current, confirmed, onApply, onInvalidate, onManualConfirm }: InsuranceDirectDvReviewProps) {
  const [report, setReport] = useState<DvReportFacts | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [manualAllowed, setManualAllowed] = useState(false);
  const requestId = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const identity = `${current.claimNumber}|${current.vin}`;
  const conflicts = report ? dvReportConflicts(current, report) : [];
  useEffect(() => {
    requestId.current += 1; controller.current?.abort();
    setReport(null); setReviewed(false); setBusy(false); setError(""); setManualAllowed(false);
    return () => { requestId.current += 1; controller.current?.abort(); };
  }, [identity]);
  useEffect(() => { setReviewed(false); }, [current.dvAmount, current.dvMethod, current.prelossValue, current.postlossValue]);

  const clear = () => {
    requestId.current += 1; controller.current?.abort();
    setReport(null); setReviewed(false); setBusy(false); setError(""); setManualAllowed(false);
    if (input.current) input.current.value = "";
    onInvalidate();
  };
  const readReport = async (file: File) => {
    clear();
    if (!file.size || file.size > 20 * 1024 * 1024 || !["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("Choose a nonempty completed DV report: PDF, PNG, JPG, or WEBP, up to 20 MB. A repair bill is not a DV appraisal."); return;
    }
    const id = ++requestId.current;
    const abort = new AbortController(); controller.current = abort;
    setBusy(true);
    const payload = new FormData(); payload.append("file", file); payload.append("claimNumber", current.claimNumber.trim());
    try {
      const response = await fetch("/api/insurance-direct/dv-report/analyze", { method: "POST", credentials: "include", body: payload, signal: abort.signal });
      if (id !== requestId.current) return;
      if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("The reader is unavailable. Retry after signing in; no report values were applied.");
      const result = await response.json() as { report?: DvReportFacts; currency?: string; amountUnit?: string; error?: string };
      if (id !== requestId.current) return;
      if (!response.ok || !result.report) {
        // Authentication, invalid uploads, and malformed contracts are not a parser-failure bypass.
        const sourceRejected = /repair (?:invoice|bill|estimate)|multiple.*(?:VIN|vehicle)|different.*(?:VIN|vehicle)|ambiguous.*(?:VIN|vehicle)|file type|contents are invalid|nonempty|1–30 pages|not a (?:DV|diminished)/i.test(result.error || "");
        setManualAllowed((response.status === 422 || response.status === 500) && !!result.error && !result.report && !sourceRejected);
        throw new Error(result.error || "The report could not be read. Retry with the completed appraisal.");
      }
      if (result.currency !== "USD" || result.amountUnit !== "dollars" || !/^(?:0|[1-9]\d*)\.\d{2}$/.test(result.report.dvAmount) || Number(result.report.dvAmount) <= 0 || !["prelossValue", "postlossValue", "adjustedVehicleValue"].every(key => { const value = result.report![key as keyof DvReportFacts]; return value === "" || (typeof value === "string" && /^(?:0|[1-9]\d*)\.\d{2}$/.test(value)); })) throw new Error("The reader returned unverified currency units. Retry; no values were applied.");
      setReport(result.report);
    } catch (failure) {
      if (id === requestId.current) setError(failure instanceof Error ? failure.message : "The reader failed. Retry; your form was not changed.");
    } finally {
      payload.delete("file");
      if (id === requestId.current) { setBusy(false); if (input.current) input.current.value = ""; }
    }
  };

  return <section id="lou-dv-final-review" className="rounded-lg border border-border p-4 space-y-3">
    <h3 className="text-sm font-semibold">Completed DV Report · Review & Apply</h3>
    <p className="text-xs leading-5 text-muted-foreground">Only upload once the external report is complete. This is a DV appraisal, not a repair invoice. Opening the calculator does not submit a request, and this page does not monitor it. Nothing is imported automatically. Source files are processed transiently, not stored; the existing reader records structured review outcomes.</p>
    <input ref={input} id="lou-dv-report-file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden" onChange={event => { const file = event.currentTarget.files?.[0]; if (file) void readReport(file); }} />
    <div className="flex flex-wrap gap-2"><Button id="lou-dv-read-report" size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Reading completed report…" : "Upload Completed DV Report"}</Button><Button id="lou-dv-reset-review" size="sm" variant="outline" onClick={clear}>Reset Report Review</Button></div>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    {report && <div className="rounded-md border border-border bg-muted/20 p-3 space-y-3 text-xs leading-5">
      <div className="grid gap-2 sm:grid-cols-2"><p><strong>Reported final DV:</strong> ${report.dvAmount}</p><p><strong>Source:</strong> {report.dvSourcePage || "Locate final opinion in report"}</p><p><strong>Report:</strong> {report.reportId || "Not stated"} · {report.reportDate || "Date not stated"}</p><p><strong>Vehicle:</strong> {[report.vehicleYear, report.vehicleMake, report.vehicleModel].filter(Boolean).join(" ") || "Not stated"}</p><p className="break-all"><strong>VIN:</strong> {report.vin || "Not stated — verify source yourself"}</p><p className="break-all"><strong>Claim:</strong> {report.claimNumber || "Not stated"} {report.claimNumberRole !== "our" ? "(role unknown; not assigned to Whip)" : ""}</p><p><strong>Report claimant:</strong> {report.claimantName || "Not stated"} (role must be verified; not automatically the driver or insured)</p></div>
      {report.adjustedVehicleValue && <p>Adjusted calculation basis: ${report.adjustedVehicleValue}. Not automatically treated as a pre-loss/post-repair appraisal pair.</p>}
      <p className="break-words">{buildDvReportReference(report)}</p>
      {report.carfaxReported === true && <p>The appraisal describes a Carfax-reported incident. This does not confirm a separate Carfax enclosure.</p>}
      {report.warnings.map((warning, index) => <p key={index}>{warning}</p>)}
      {conflicts.map(conflict => <p role="alert" className="text-destructive" key={conflict}>{conflict}</p>)}
      <label className="flex items-start gap-2"><input id="lou-dv-reviewed" type="checkbox" className="mt-1 shrink-0" checked={reviewed} disabled={!!conflicts.length} onChange={event => setReviewed(event.target.checked)} /><span>I matched this completed report to this VIN/Whip claim and verified the final DV opinion and source. Apply replaces only reviewed DV fields and fills blank report-supported identity facts.</span></label>
      <Button id="lou-dv-apply-report" size="sm" disabled={!reviewed || !!conflicts.length} onClick={() => { if (reviewed && !conflicts.length) onApply(report); }}>Apply Reviewed Report to This Form</Button>
    </div>}
    {manualAllowed && <div id="lou-dv-manual-fallback" className="rounded-md border border-border p-3 text-xs leading-5 space-y-2"><p><strong>Reader failed — manual source verification</strong></p><p>Use the field guide below to enter the completed report's final DV amount and source. This is not permission to use an estimate or a still-pending report.</p><label className="flex items-start gap-2"><input id="lou-dv-manual-confirmed" type="checkbox" className="mt-1 shrink-0" checked={confirmed} onChange={event => onManualConfirm(event.target.checked)} /><span>I have the completed DV appraisal, matched its VIN/Whip claim, and personally verified the manually entered final DV amount and source reference. I will enclose that report.</span></label></div>}
    {confirmed && <p id="lou-dv-source-confirmed" role="status" className="text-xs font-semibold">Completed report reviewed. Reconfirm if the claim, VIN, DV amount, or source changes.</p>}
  </section>;
}
