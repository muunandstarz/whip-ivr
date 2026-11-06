import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Copy, Download, Eye, RotateCcw } from "lucide-react";
import {
  PENDING_CLOSURE_FIELD_META, emptyPendingClosureFields, restorePendingClosureFields,
  validatePendingClosureFields, buildPendingClosureText, buildPendingClosureEmail,
  type PendingClosureFields,
} from "@shared/pendingClosure";
import {
  PENDING_CLOSURE_SOL_REFERENCE, PENDING_CLOSURE_SOL_SOURCE, PENDING_CLOSURE_SOL_WARNING,
  pendingClosureSolReference,
} from "@shared/pendingClosureSol";
import { createPendingClosurePdf } from "@/lib/pendingClosurePdf";
import { downloadReceipt as downloadBrowserPdf } from "@/lib/receiptBrowser";

type Draft = Record<string, unknown>;
const draftObject = (value: unknown): Draft => value && typeof value === "object" && !Array.isArray(value) ? value as Draft : {};
const initialData = (value: unknown) => {
  const data = draftObject(value);
  return {
    fields: restorePendingClosureFields(data.pendingClosureFields),
    state: typeof data.solReferenceState === "string" && pendingClosureSolReference(data.solReferenceState) ? data.solReferenceState : "",
    emailSubject: typeof data.emailSubjectOverride === "string" ? data.emailSubjectOverride : "",
    emailBody: typeof data.emailBodyOverride === "string" ? data.emailBodyOverride : "",
  };
};

/** Prepares documents only; no mail integration, claim-status mutation, legal deadline inference or PDF retention. */
export default function PendingClosureForm({ initialDraft, onDraftChange, logoBase64 }: {
  initialDraft?: unknown; onDraftChange?: (value: Draft) => void; logoBase64?: string;
}) {
  const [initial] = useState(() => initialData(initialDraft));
  const [fields, setFields] = useState(initial.fields);
  const [state, setState] = useState(initial.state);
  const [emailSubjectOverride, setEmailSubjectOverride] = useState(initial.emailSubject);
  const [emailBodyOverride, setEmailBodyOverride] = useState(initial.emailBody);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const pdfRef = useRef<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"letter" | "email">("letter");
  const [showRequirements, setShowRequirements] = useState(false);
  const reference = pendingClosureSolReference(state);
  const text = buildPendingClosureText(fields);
  const email = buildPendingClosureEmail(fields);
  const errors = validatePendingClosureFields(fields);
  const subject = emailSubjectOverride || email.subject;
  const body = emailBodyOverride || email.body;
  const filename = `Whip_Pending_Closure_${fields.claim_number.trim().replace(/[^a-zA-Z0-9_-]/g, "_") || "Draft"}.pdf`;

  useEffect(() => {
    onDraftChange?.({ pendingClosureFields: fields, solReferenceState: state, emailSubjectOverride, emailBodyOverride });
  }, [fields, state, emailSubjectOverride, emailBodyOverride, onDraftChange]);
  useEffect(() => {
    if (pdfRef.current) URL.revokeObjectURL(pdfRef.current);
    pdfRef.current = null;
    setPdfUrl(null);
  }, [fields]);
  useEffect(() => () => { if (pdfRef.current) URL.revokeObjectURL(pdfRef.current); }, []);

  const update = (key: keyof PendingClosureFields, value: string) => {
    setFields(previous => ({ ...previous, [key]: value }));
    // Claim changes must not leave another claimant's customized email behind.
    setEmailSubjectOverride("");
    setEmailBodyOverride("");
  };
  const clear = () => {
    setFields(emptyPendingClosureFields()); setState("");
    setEmailSubjectOverride(""); setEmailBodyOverride(""); setShowRequirements(false);
    toast.success("Pending Closure Letter form cleared");
  };
  const copy = async (value: string, label: string) => {
    try { await navigator.clipboard.writeText(value); toast.success(`${label} copied`); }
    catch { toast.error("Could not copy. Select the text and copy it manually."); }
  };
  const renderPdf = (download: boolean) => {
    if (download && errors.length) {
      setShowRequirements(true); toast.error("Complete the required fields before downloading the final letter."); return;
    }
    try {
      const doc = createPendingClosurePdf(fields, { logoBase64, draft: !download });
      const url = URL.createObjectURL(doc.output("blob"));
      if (pdfRef.current) URL.revokeObjectURL(pdfRef.current);
      pdfRef.current = url; setPdfUrl(url); setPreviewMode("letter");
      if (download) downloadBrowserPdf(url, filename);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not prepare the letter."); }
  };

  return <div className="grid grid-cols-1 xl:grid-cols-2 gap-6" aria-label="Pending Closure Letter workspace">
    <div className="min-w-0 space-y-4">
      <section className="rounded-lg border border-border bg-background p-4">
        <h2 className="text-sm font-semibold">Pending Closure Letter</h2>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">Request a response before administrative closure. This letter is not a denial. Verify the last contact and applicable notice requirements before use. Preparing or downloading it does not close a claim, schedule a closure, or send a letter/email.</p>
      </section>
      <section className="rounded-lg border border-border bg-background p-4" aria-label="Pending closure inputs">
        <h3 className="mb-3 text-sm font-semibold">Letter & claim details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {PENDING_CLOSURE_FIELD_META.map(meta => {
            const id = `pc-${meta.key}`;
            const required = !("optional" in meta);
            const common = {
              id, name: meta.key, value: fields[meta.key], autoComplete: "off",
              "aria-required": required,
              onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => update(meta.key, event.target.value),
            };
            return <div key={meta.key} className={`space-y-1 ${"multiline" in meta ? "md:col-span-2" : ""}`}>
              <Label htmlFor={id} className="text-xs font-semibold">{meta.label}{required ? " *" : ""}</Label>
              {"multiline" in meta ? <Textarea {...common} rows={meta.key === "sol_language" ? 5 : 3} className="text-sm resize-y" placeholder={`{{${meta.key}}}`} />
                : <Input {...common} type={"type" in meta ? meta.type : "text"} min={meta.key === "response_days" ? 1 : undefined} max={meta.key === "response_days" ? 365 : undefined} step={meta.key === "response_days" ? 1 : undefined} className="h-9 text-sm" placeholder={`{{${meta.key}}}`} />}
            </div>;
          })}
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">Response days are the administrative response window in the supplied letter—not a statute of limitations. Dates print in Month Day, Year format. The optional additional-information request is omitted when blank.</p>
      </section>
      <section className="rounded-lg border border-border bg-background p-4" aria-label="SOL reference only">
        <h3 className="text-sm font-semibold">Time-limits reference — requires verification</h3>
        <p className="mt-2 text-xs leading-5 text-muted-foreground" role="note">{PENDING_CLOSURE_SOL_WARNING}</p>
        <Label htmlFor="pc-sol-state" className="mt-3 mb-1 block text-xs font-semibold">View a supplied state reference (does not change the letter)</Label>
        <select id="pc-sol-state" value={state} onChange={event => setState(event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground">
          <option value="">Choose a state…</option>
          {PENDING_CLOSURE_SOL_REFERENCE.map(row => <option key={row.abbr} value={row.abbr}>{row.state} ({row.abbr})</option>)}
        </select>
        {reference && <div className="mt-3 rounded-md border border-border p-3 text-xs leading-5 space-y-2">
          <p className="font-semibold">{reference.state} — source status: {reference.status}{reference.status === "OK" ? " (secondary sources agree; not counsel-approved)" : ""}</p>
          <p>Supplied BI period: {reference.bodily_injury_years} years · Supplied PD period: {reference.property_damage_years} years</p>
          <p>Supplied citation: {reference.citation}</p>
          {reference.notes && <p className="font-medium">Source caution: {reference.notes}</p>}
          <details><summary className="cursor-pointer underline">View unconfirmed source wording</summary><p className="mt-2">{reference.letter_language}</p></details>
          <p>Nothing is inserted automatically. Enter only verified, claim-specific wording in the Time-limits paragraph above. Generic wording remains available while the state rule is unconfirmed.</p>
        </div>}
        <p className="mt-3 text-[11px] leading-4 text-muted-foreground">{PENDING_CLOSURE_SOL_SOURCE}</p>
      </section>
      {showRequirements && errors.length > 0 && <section className="rounded-lg border border-border p-3" role="alert"><h3 className="text-sm font-semibold">Complete before final download</h3><ul className="mt-2 list-disc pl-5 text-xs leading-5">{errors.map(error => <li key={error}>{error}</li>)}</ul></section>}
      <Button type="button" variant="outline" onClick={clear} className="gap-2"><RotateCcw className="h-4 w-4" />Clear this form</Button>
    </div>
    <div className="min-w-0 xl:sticky xl:top-4 xl:self-start space-y-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Pending closure output">
        <Button type="button" variant={previewMode === "letter" ? "default" : "outline"} onClick={() => setPreviewMode("letter")}>Letter</Button>
        <Button type="button" variant={previewMode === "email" ? "default" : "outline"} onClick={() => setPreviewMode("email")}>Accompanying email</Button>
      </div>
      {previewMode === "letter" ? <section className="rounded-lg border border-border overflow-hidden">
        <div className="flex flex-wrap gap-2 border-b border-border p-3">
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => renderPdf(false)}><Eye className="h-3.5 w-3.5" />Preview letter</Button>
          <Button type="button" size="sm" className="gap-1.5" onClick={() => renderPdf(true)}><Download className="h-3.5 w-3.5" />Download PDF</Button>
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => copy(text, "Letter")}><Copy className="h-3.5 w-3.5" />Copy letter</Button>
        </div>
        {pdfUrl ? <><div className="px-3 py-2 text-xs"><a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="underline">Open PDF in a new tab</a></div><iframe title="Pending Closure Letter PDF preview" src={pdfUrl} className="w-full border-0 bg-white" style={{ height: "640px" }} /></>
          : <pre className="max-h-[680px] overflow-auto whitespace-pre-wrap break-words bg-background p-4 text-xs leading-5 text-foreground/80">{text}</pre>}
        <p className="p-3 text-xs leading-5 text-muted-foreground">Preview accepts partial drafts with visible placeholders. Final download requires the marked fields. No completed PDF is stored.</p>
      </section> : <section className="rounded-lg border border-border bg-background p-4 space-y-3">
        <h3 className="text-sm font-semibold">Accompanying email — editable, copy only</h3>
        <p className="text-xs leading-5 text-muted-foreground">This template says a separate letter is being sent. Use it only when that reflects your delivery plan. Nothing is sent here. Editing a letter field resets customized email wording to the updated template.</p>
        <div className="space-y-1"><Label htmlFor="pc-email-subject" className="text-xs font-semibold">Email subject</Label><Input id="pc-email-subject" value={subject} onChange={event => setEmailSubjectOverride(event.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="pc-email-body" className="text-xs font-semibold">Email body</Label><Textarea id="pc-email-body" value={body} onChange={event => setEmailBodyOverride(event.target.value)} rows={18} className="text-sm leading-6 resize-y" /></div>
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" className="gap-2" onClick={() => copy(`Subject: ${subject}\n\n${body}`, "Email")}><Copy className="h-4 w-4" />Copy email</Button><Button type="button" variant="outline" onClick={() => { setEmailSubjectOverride(""); setEmailBodyOverride(""); }}>Restore email template</Button></div>
      </section>}
    </div>
  </div>;
}
