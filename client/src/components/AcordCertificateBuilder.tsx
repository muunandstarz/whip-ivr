import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useKlutchSignoff } from "@/hooks/useKlutchSignoff";
import { renderAcordCertificatePdf } from "@/lib/acordCertificatePdf";
import type { AcordCertificateData } from "@shared/acordCertificate";
import {
  ACORD_STATES, ACORD_PRESETS, ACORD_MINIMUM_REFERENCES,
  emptyAcordDraft, restoreAcordDraft, applyAcordPreset, validateAcordDraft,
  acordFilename, acordOperatorDescription, validAcordDate,
  type AcordDraft, type AcordPreset, type AcordState, type AcordScope,
} from "@shared/acordPresets";

export interface AcordCertificateBuilderProps {
  /** Plain certificate inputs only. Verification and generated PDFs are never restored. */
  initialDraft?: unknown;
  /** Starting point for a fresh standalone form only; a supplied draft takes precedence. */
  initialPreset?: AcordPreset;
  /** Fresh non-Uber standalone forms start with MD unless explicitly specified. */
  initialState?: AcordState;
  /** Dedicated certificate pages may lock the preset, including restored legacy inputs. */
  lockedPreset?: AcordPreset;
  onDraftChange?: (value: Record<string, unknown>) => void;
  /** Adds a second, permanent sample watermark; never removes the draft watermark. */
  sampleMode?: boolean;
}

type Consent = { source: boolean; scope: boolean; inForce: boolean; authority: boolean; csl: boolean; both: boolean; uberCombined: boolean };
const noConsent = (): Consent => ({ source: false, scope: false, inForce: false, authority: false, csl: false, both: false, uberCombined: false });
const lines = (value: string) => value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const fingerprint = (value: unknown) => {
  try { return JSON.stringify(value); } catch { return "invalid-draft"; }
};
const scopes: [AcordScope, string][] = [["scheduled", "Scheduled autos"], ["owned", "Owned autos only"], ["hired", "Hired autos only"], ["nonOwned", "Non-owned autos only"], ["any", "Any auto (only if policy supports it)"]];
const inputClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-lg border border-border bg-card p-4 text-card-foreground"><h3 className="mb-3 text-sm font-semibold">{title}</h3>{children}</section>;
}

/** Client-only document preparation. No policy issuance, sending, shared save, or coverage determination. */
export default function AcordCertificateBuilder({ initialDraft, initialPreset, initialState = "MD", lockedPreset, onDraftChange, sampleMode = false }: AcordCertificateBuilderProps) {
  const enforcePreset = (value: AcordDraft) => lockedPreset && value.preset !== lockedPreset
    ? applyAcordPreset(value, lockedPreset, initialState) : value;
  const incomingDraft = () => enforcePreset(initialDraft == null && (lockedPreset || initialPreset)
    ? applyAcordPreset(emptyAcordDraft(today()), (lockedPreset || initialPreset)!, initialState)
    : restoreAcordDraft(initialDraft, today()));
  const [draft, setDraft] = useState(incomingDraft);
  const [consent, setConsent] = useState<Consent>(noConsent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState<"preview" | "download" | null>(null);
  const [pdf, setPdf] = useState<{ url: string; filename: string; draft: boolean; warnings: string[] } | null>(null);
  const signoff = useKlutchSignoff(draft.preset !== "metrocars-minimum");
  const urlRef = useRef<string | null>(null);
  const epoch = useRef(0);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const sourceFingerprint = fingerprint(initialDraft);
  const lastIncoming = useRef(sourceFingerprint);
  const lastEmitted = useRef("");
  const callbackRef = useRef(onDraftChange);
  callbackRef.current = onDraftChange;
  const signoffKey = draft.preset === "metrocars-minimum" ? "metrocars" : fingerprint([signoff.identityKey, signoff.revision]);
  const lastSignoffKey = useRef(signoffKey);

  function invalidateOutput() {
    epoch.current += 1;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setPdf(null);
  }
  function invalidate() {
    invalidateOutput();
    setConsent(noConsent());
    setPendingAction(null);
    setError("");
  }
  function replace(next: AcordDraft) { invalidate(); setDraft(enforcePreset(next)); }
  function update<K extends keyof AcordDraft>(key: K, value: AcordDraft[K]) { replace({ ...draft, [key]: value }); }

  // Parent save feedback is not a restore. An externally loaded draft revokes every confirmation.
  useEffect(() => {
    if (sourceFingerprint === lastIncoming.current) return;
    lastIncoming.current = sourceFingerprint;
    if (sourceFingerprint === lastEmitted.current) return;
    const next = incomingDraft();
    lastEmitted.current = fingerprint(next);
    replace(next);
  }, [sourceFingerprint]);
  useEffect(() => {
    const value = { ...draft, autoScopes: [...draft.autoScopes] };
    lastEmitted.current = fingerprint(value);
    callbackRef.current?.(value);
  }, [draft]);
  useEffect(() => {
    if (lastSignoffKey.current !== signoffKey) {
      lastSignoffKey.current = signoffKey;
      invalidate();
    }
  }, [signoffKey]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      epoch.current += 1;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    };
  }, []);
  useEffect(() => { invalidate(); }, [sampleMode]);

  function validationErrors(value: AcordDraft) {
    const errors = [...validateAcordDraft(value)];
    for (const [key, label] of [["producerAddress", "Producer address"], ["contactName", "Producer contact name"], ["phone", "Producer contact phone"]] as const) {
      if (!value[key].trim() && !errors.includes(label)) errors.push(label);
    }
    const currentDate = today();
    if (value.preset === "klutch-fl-uber-black" && validAcordDate(value.effectiveDate) && validAcordDate(value.expirationDate)
      && (value.effectiveDate > currentDate || value.expirationDate <= currentDate)) {
      errors.push("Uber Black coverage must be currently active in Florida (verify today's date)");
    }
    return errors;
  }
  const missing = validationErrors(draft);
  if (!consent.source) missing.push("Confirm the actual policy / self-insurance source and limits");
  if (!consent.scope) missing.push("Confirm the actual covered-auto scope and any endorsement status");
  if (!consent.inForce) missing.push("Confirm the stated coverage is in force for the supplied dates");
  if (!consent.authority) missing.push("Confirm authority to prepare this certificate");
  if (draft.limitBasis === "csl" && !consent.csl) missing.push("Confirm actual policy documentation expressly states a combined single limit");
  if (draft.limitBasis === "both" && !consent.both) missing.push("Actual policy documentation must confirm both CSL and split limits");
  if (draft.preset === "klutch-fl-uber-black" && !consent.uberCombined) missing.push("Verify documented policy satisfies Uber Black's $300,000 combined BI + PD requirement");
  if (draft.preset !== "metrocars-minimum" && !signoff.ready) missing.push("Fresh approved Klutch representative name and title");

  function download(url: string, filename: string) {
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = filename;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
  }

  async function renderPdf(action: "preview" | "download", isDraft: boolean) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError(""); setPendingAction(null);
    const requestEpoch = epoch.current;
    const snapshot = draft;
    const checks = consent;
    try {
      if (!isDraft && missing.length) throw new Error("Complete every listed requirement and reconfirm before preparing a final PDF.");
      let representativeName = snapshot.metrocarsRepresentative;
      let representativeTitle = snapshot.metrocarsRepresentativeTitle;
      if (snapshot.preset !== "metrocars-minimum") {
        const fresh = await signoff.requireApprovedSignoff();
        if (requestEpoch !== epoch.current || !mounted.current) return;
        if (fresh.revision !== signoff.revision) {
          invalidate();
          throw new Error("The approved Klutch sign-off changed. Review the updated representative and confirm again before preparing a PDF.");
        }
        representativeName = fresh.name;
        representativeTitle = fresh.title;
      }
      if (requestEpoch !== epoch.current || !mounted.current) return;
      if (!isDraft && validationErrors(snapshot).length) throw new Error("The coverage dates or certificate details are no longer valid. Review the current requirements before preparing a final PDF.");
      const actualBoth = snapshot.limitBasis === "both" && checks.both;
      // Unselected limits, or an unconfirmed 'both', print blank in a draft rather than asserting coverage.
      const showCsl = snapshot.limitBasis === "csl" && checks.csl || actualBoth;
      const showSplit = snapshot.limitBasis === "split" || actualBoth;
      const data: AcordCertificateData = {
        issueDate: isDraft && !validAcordDate(snapshot.issueDate) ? "" : snapshot.issueDate, producerName: snapshot.producerName,
        producerAddressLines: lines(snapshot.producerAddress), contactName: snapshot.contactName,
        phone: snapshot.phone, fax: snapshot.fax, email: snapshot.email,
        insuredLines: [snapshot.insuredOrganization, ...lines(snapshot.insuredOrganizationAddress), snapshot.namedOperator ? `Named operator: ${snapshot.namedOperator}` : ""].filter(Boolean),
        insurerName: snapshot.preset === "metrocars-minimum" ? "MetroCars — Self-insured (not an insurance carrier)" : "Klutch Risk Retention Group",
        selfInsured: snapshot.preset === "metrocars-minimum",
        naic: snapshot.preset === "metrocars-minimum" ? undefined : "17966",
        certificateNumber: snapshot.certificateNumber, revisionNumber: snapshot.revisionNumber,
        policyNumber: snapshot.policyNumber,
        effectiveDate: isDraft && !validAcordDate(snapshot.effectiveDate) ? "" : snapshot.effectiveDate,
        expirationDate: isDraft && !validAcordDate(snapshot.expirationDate) ? "" : snapshot.expirationDate,
        limitBasis: actualBoth ? "both" : showSplit ? "split" : "csl", bothLimitsConfirmed: actualBoth,
        combinedSingleLimit: showCsl ? snapshot.combinedSingleLimit : undefined,
        biPerson: showSplit ? snapshot.biPerson : undefined, biAccident: showSplit ? snapshot.biAccident : undefined,
        propertyDamage: showSplit ? snapshot.propertyDamage : undefined,
        autoScopes: [...snapshot.autoScopes],
        additionalInsured: snapshot.additionalInsured && Boolean(snapshot.endorsementReference.trim()),
        subrogationWaived: snapshot.subrogationWaived && Boolean(snapshot.endorsementReference.trim()),
        endorsementNotes: snapshot.endorsementReference,
        vehicle: [snapshot.vehicleYear, snapshot.vehicleMake, snapshot.vehicleModel].filter(Boolean).join(" "), vin: snapshot.vin.toUpperCase(),
        description: [acordOperatorDescription(snapshot), snapshot.plate ? `Plate: ${snapshot.plate}` : "", snapshot.preset === "metrocars-minimum" ? "MetroCars self-insured auto liability; not a policy issued by an insurance carrier. Subject to the self-insurance authorization and applicable agreement." : "", snapshot.description, snapshot.coverageReference ? `Policy / self-insurance source: ${snapshot.coverageReference}` : ""].filter(Boolean).join("\n"),
        holderLines: [snapshot.holderName, ...lines(snapshot.holderAddress)].filter(Boolean),
        representativeName, representativeTitle,
      };
      const result = await renderAcordCertificatePdf(data, { draft: isDraft, sample: sampleMode, missingDetails: isDraft ? [...missing] : [] });
      if (requestEpoch !== epoch.current || !mounted.current) return;
      if (!isDraft && validationErrors(snapshot).length) throw new Error("The coverage dates or certificate details changed validity while preparing the PDF. Review them and prepare a new certificate.");
      const url = URL.createObjectURL(new Blob([new Uint8Array(result.bytes)], { type: "application/pdf" }));
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;
      const filename = acordFilename(snapshot, isDraft);
      setPdf({ url, filename, draft: isDraft, warnings: result.warnings });
      if (action === "download") download(url, filename);
    } catch (cause) {
      if (mounted.current && (requestEpoch === epoch.current || cause instanceof Error && cause.message.includes("sign-off changed"))) {
        setError(cause instanceof Error ? cause.message : "Could not prepare the certificate PDF. Please retry.");
      }
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function request(action: "preview" | "download") {
    if (busyRef.current) return;
    setError("");
    if (missing.length) setPendingAction(action);
    else void renderPdf(action, action === "preview");
  }
  function clear() {
    const blank = emptyAcordDraft();
    for (const key of Object.keys(blank) as (keyof AcordDraft)[]) {
      if (typeof blank[key] === "string" && key !== "preset" && key !== "state") {
        (blank as unknown as Record<string, unknown>)[key] = "";
      }
    }
    blank.preset = lockedPreset || draft.preset;
    blank.state = lockedPreset ? lockedPreset === "klutch-fl-uber-black" ? "FL" : initialState : draft.state;
    replace(blank);
  }
  function field(key: keyof AcordDraft, label: string, multiline = false, type = "text") {
    const id = `acord-${key}`;
    const common = { id, name: key, value: String(draft[key]), autoComplete: "off", onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => update(key, event.target.value as never) };
    return <div key={key} className={`space-y-1 ${multiline ? "sm:col-span-2" : ""}`}><label htmlFor={id} className="text-xs font-medium">{label}</label>{multiline ? <Textarea {...common} rows={3} className="resize-y text-sm" /> : <Input {...common} type={type} className="h-9 text-sm" />}</div>;
  }
  function confirmation(key: keyof Consent, label: string) {
    return <label key={key} className="flex items-start gap-2 text-xs leading-5"><input id={`acord-confirm-${key}`} type="checkbox" className="mt-1 shrink-0 accent-primary" checked={consent[key]} onChange={event => { invalidateOutput(); setConsent(previous => ({ ...previous, [key]: event.target.checked })); }} />{label}</label>;
  }
  const reference = ACORD_MINIMUM_REFERENCES[draft.state];

  return <div className="space-y-4 text-foreground" aria-label="ACORD 25 certificate builder">
    <section className="rounded-lg border border-border bg-muted/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold">ACORD 25 · Certificate builder</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Prepare evidence from verified records, not a new policy. Nothing is issued or sent here.</p></div><Button type="button" variant="outline" size="sm" onClick={clear}>Clear certificate</Button></div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1"><label htmlFor="acord-preset" className="text-xs font-medium">Certificate preset</label><select id="acord-preset" className={inputClass} value={draft.preset} disabled={Boolean(lockedPreset)} onChange={event => replace(applyAcordPreset(draft, lockedPreset || event.target.value as AcordPreset))}>{Object.entries(ACORD_PRESETS).filter(([key]) => !lockedPreset || key === lockedPreset).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
        <div className="space-y-1"><label htmlFor="acord-state" className="text-xs font-medium">Reference state</label><select id="acord-state" className={inputClass} value={draft.state} disabled={draft.preset === "klutch-fl-uber-black"} onChange={event => replace(applyAcordPreset(draft, draft.preset, event.target.value as AcordState))}>{ACORD_STATES.map(state => <option key={state} value={state}>{state}</option>)}</select></div>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">{draft.preset === "klutch-fl-uber-black" ? "Owner-provided Florida Uber Black requirements (not independently confirmed platform guidance): Sunbeam Fleet named insured, active Florida coverage, policy number and NAIC 17966, BI at least $125,000 per person / $250,000 per accident and PD at least $50,000. Separately verify the documented policy satisfies the supplied $300,000 combined BI + PD requirement. Split-limit arithmetic does not establish a $300,000 CSL. A CSL-only policy still requires verification of the separate BI / PD requirements. These are starting points, not proof of coverage or platform acceptance." : `${draft.state} starting-point reference: BI $${reference.biPerson.toLocaleString()} / $${reference.biAccident.toLocaleString()}; PD $${reference.propertyDamage.toLocaleString()}. ${reference.note}`}</p>
      {reference.sources.length > 0 && <details className="mt-2 text-xs"><summary className="cursor-pointer underline">State reference sources (verify applicability and effective dates)</summary><ul className="mt-2 space-y-1">{reference.sources.map(source => <li key={source}><a href={source} target="_blank" rel="noopener noreferrer" className="break-all underline">{source}</a></li>)}</ul></details>}
      {draft.preset === "metrocars-minimum" && <p className="mt-2 text-xs font-medium">MetroCars self-insurance only — no insurance carrier, fabricated NAIC, or MVA-as-insurer attribution. Verify the actual authorization and applicable agreement.</p>}
    </section>

    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Panel title="Producer & named insured"><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {field("producerName", "Producer / organization")}{field("contactName", "Producer contact")}{field("producerAddress", "Producer address", true)}
          {field("phone", "Phone")}{field("fax", "Fax")}{field("email", "Email", false, "email")}{field("insuredOrganization", "Named insured organization")}
          {field("insuredOrganizationAddress", "Named insured organization address", true)}{field("namedOperator", "Named operator")}{field("operatorAddress", "Operator address", true)}
        </div></Panel>
        <Panel title="Policy / self-insurance record"><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {field("policyNumber", draft.preset === "metrocars-minimum" ? "Self-insurance certificate / record number" : "Policy number")}{field("certificateNumber", "Certificate ID")}{field("revisionNumber", "Revision ID")}
          {field("issueDate", "Certificate date", false, "date")}{field("effectiveDate", "Effective date", false, "date")}{field("expirationDate", "Expiration date", false, "date")}
          {field("coverageReference", "Actual policy / self-insurance source reference", true)}
        </div><p className="mt-3 text-xs leading-5 text-muted-foreground">Enter a traceable issued-policy, declarations / endorsement, or self-insurance authorization reference. Preset source links alone are not evidence of actual coverage.</p></Panel>
        <Panel title="Vehicle & certificate holder"><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {field("vehicleYear", "Vehicle year")}{field("vehicleMake", "Vehicle make")}{field("vehicleModel", "Vehicle model")}{field("vin", "VIN (17 characters)")}{field("plate", "License plate")}{field("holderName", "Certificate holder")}{field("holderAddress", "Certificate holder address", true)}
        </div></Panel>
      </div>
      <div className="space-y-4">
        <Panel title="Actual liability limits & covered-auto scope">
          <div className="space-y-1"><label htmlFor="acord-limitBasis" className="text-xs font-medium">Verified limit format</label><select id="acord-limitBasis" className={inputClass} value={draft.limitBasis} onChange={event => update("limitBasis", event.target.value as AcordDraft["limitBasis"])}><option value="">Select actual policy format…</option><option value="csl">{draft.preset === "klutch-fl-uber-black" ? "Combined single limit (Uber reference $300,000)" : "Combined single limit"}</option><option value="split">{draft.preset === "klutch-fl-uber-black" ? "Split limits (Uber reference $125k / $250k / $50k)" : "Split limits"}</option><option value="both">Both — only if actual policy documentation confirms both</option></select></div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">{(draft.limitBasis === "csl" || draft.limitBasis === "both") && field("combinedSingleLimit", "Combined single limit (USD)")}{(draft.limitBasis === "split" || draft.limitBasis === "both") && <>{field("biPerson", "BI per person (USD)")}{field("biAccident", "BI per accident (USD)")}{field("propertyDamage", "Property damage (USD)")}</>}</div>
          {draft.limitBasis === "both" && <div className="mt-3 rounded-md border border-border p-3">{confirmation("both", "I verified that the actual policy documentation expressly provides both CSL and split limits; this is not a preset assumption.")}</div>}
          {draft.limitBasis === "csl" && <div className="mt-3 rounded-md border border-border p-3">{confirmation("csl", "I verified the actual policy documentation expressly states this combined single limit. It is not calculated from separate BI and PD limits.")}</div>}
          <fieldset className="mt-4 space-y-2"><legend className="mb-2 text-xs font-medium">Covered autos — select only the actual record's scope</legend>{scopes.map(([value, label]) => <label key={value} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={draft.autoScopes.includes(value)} onChange={event => update("autoScopes", event.target.checked ? value === "any" ? ["any"] : [...draft.autoScopes.filter(scope => scope !== "any"), value] : draft.autoScopes.filter(scope => scope !== value))} />{label}</label>)}</fieldset>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">Scheduled means listed on the actual coverage schedule, not that this COI must list every auto. Non-owned is a distinct scope, not an unlisted vehicle; it excludes autos the insured owns, leases, hires, rents or borrows. Owned or Any auto may be broader only if the source supports it. Verify every selection against the issued policy or, for MetroCars, the self-insurance authorization; Scheduled is only a preset starting point.</p>
        </Panel>
        <Panel title="Endorsement status & manual coverage notes">
          <div className="space-y-2"><label className="flex items-center gap-2 text-xs"><input id="acord-additionalInsured" type="checkbox" checked={draft.additionalInsured} onChange={event => update("additionalInsured", event.target.checked)} />Additional-insured status explicitly supported by actual provision</label><label className="flex items-center gap-2 text-xs"><input id="acord-subrogationWaived" type="checkbox" checked={draft.subrogationWaived} onChange={event => update("subrogationWaived", event.target.checked)} />Subrogation waiver explicitly supported by actual provision</label></div>
          <div className="mt-3 grid gap-3">{field("endorsementReference", "Actual provision / endorsement reference", true)}{field("description", "Description / manual UM, PIP or other coverage notes", true)}</div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">Additional-insured and waiver boxes start unchecked; a request or certificate cannot create an endorsement. UM, PIP, physical damage and other coverages are not filled or certified automatically. Enter only verified facts, with references, in the description.</p>
        </Panel>
        <Panel title="Authorized representative">
          {draft.preset === "metrocars-minimum" ? <><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{field("metrocarsRepresentative", "MetroCars representative name")}{field("metrocarsRepresentativeTitle", "MetroCars representative title")}</div><p className="mt-2 text-xs leading-5 text-muted-foreground">Enter the expressly authorized MetroCars representative. Your login is not used to fill these fields.</p></> : <><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div><label htmlFor="acord-klutch-name" className="text-xs font-medium">Approved Klutch representative</label><Input id="acord-klutch-name" value={signoff.signoff?.name ?? ""} readOnly className="mt-1 h-9 bg-muted text-sm" /></div><div><label htmlFor="acord-klutch-title" className="text-xs font-medium">Approved title</label><Input id="acord-klutch-title" value={signoff.signoff?.title ?? ""} readOnly className="mt-1 h-9 bg-muted text-sm" /></div></div><p className="mt-2 text-xs leading-5 text-muted-foreground">Read-only canonical sign-off; freshly checked before every PDF, including drafts. This text is not a digital signature.</p>{!signoff.ready && <p className="mt-2 text-xs" role="status">The approved Klutch sign-off is unavailable or refreshing. Reload it before preparing a PDF.</p>}<Button type="button" variant="outline" size="sm" className="mt-2" disabled={busy} onClick={() => { invalidate(); void signoff.refetch().catch(() => setError("Could not reload the approved Klutch sign-off. Please retry.")); }}>Reload approved sign-off</Button></>}
        </Panel>
      </div>
    </div>

    <Panel title="Verify before final PDF">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {confirmation("source", "I checked the actual source reference and entered the actual coverage limits, not just a preset or state minimum.")}
        {confirmation("scope", "I verified covered-auto scope and any additional-insured / waiver status against the actual policy or self-insurance authorization.")}
        {confirmation("inForce", "I verified the stated coverage is in force for the supplied effective and expiration dates, including any coverage described in notes.")}
        {confirmation("authority", "I am authorized to prepare this certificate from those records. It does not issue coverage, amend terms or create an endorsement.")}
      </div>
      {draft.preset === "klutch-fl-uber-black" && <div className="mt-3">{confirmation("uberCombined", "I verified the policy applies in Florida for this use, is currently active, and meets the supplied Uber Black $300,000 combined BI/PD requirement and separate BI/PD thresholds. Split-limit arithmetic alone is not proof of CSL.")}</div>}
      <p className="mt-3 text-xs leading-5 text-muted-foreground">Confirmations are session-only and reset on every input, preset, state, restored draft or sign-off revision change. Saving a draft saves only inputs, never these confirmations or a PDF.</p>
      <div className="mt-4 flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => request("preview")}>Preview draft</Button><Button type="button" disabled={busy} onClick={() => request("download")}>Download final PDF</Button>{busy && <span role="status" className="self-center text-xs">Preparing PDF…</span>}</div>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    </Panel>

    {pendingAction && <section role="dialog" aria-modal="false" aria-labelledby="acord-missing-title" aria-describedby="acord-missing-help" className="rounded-lg border-2 border-border bg-background p-4">
      <h3 id="acord-missing-title" className="text-sm font-semibold">Certificate incomplete — choose a watermarked draft</h3><p id="acord-missing-help" className="mt-2 text-xs leading-5">Final output requires every item below. You may prepare an incomplete draft marked DRAFT — NOT VALID FOR PROOF OF INSURANCE. Missing details stay visible; no manager approval is needed. Klutch's approved representative must still be available and freshly verified.</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">{missing.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
      <div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setPendingAction(null)}>Return to editing</Button><Button type="button" disabled={busy || draft.preset !== "metrocars-minimum" && !signoff.ready} onClick={() => void renderPdf(pendingAction, true)}>{pendingAction === "preview" ? "Preview watermarked draft" : "Download watermarked draft"}</Button></div>
    </section>}

    {pdf && <section className="overflow-hidden rounded-lg border border-border" aria-label="Certificate PDF preview">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/40 p-3"><div><h3 className="text-sm font-semibold">{pdf.draft ? "DRAFT — NOT VALID FOR PROOF OF INSURANCE" : "Prepared certificate — not sent"}</h3><p className="mt-1 break-all text-xs text-muted-foreground">{pdf.filename}{sampleMode ? " · SAMPLE — NOT VALID FOR PROOF OF INSURANCE" : ""}</p></div><div className="flex flex-wrap gap-3 text-xs"><a href={pdf.url} target="_blank" rel="noopener noreferrer" className="underline">Open PDF in a new tab</a><a href={pdf.url} download={pdf.filename} className="underline">Download this {pdf.draft ? "draft" : "PDF"}</a></div></div>
      {pdf.warnings.length > 0 && <ul role="status" className="list-disc px-6 py-3 text-xs">{pdf.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}
      <iframe title={`${draft.preset === "metrocars-minimum" ? "MetroCars" : "Klutch"} ACORD 25 PDF preview`} src={pdf.url} className="h-[680px] w-full border-0 bg-white" />
    </section>}
    <p className="text-[11px] leading-5 text-muted-foreground">ACORD forms and marks are subject to ACORD licensing requirements; use only with the appropriate authorization. This certificate is information only, confers no rights, and does not affirmatively or negatively amend, extend or alter coverage. It is not a policy, coverage determination, endorsement, binder or delivery confirmation.</p>
  </div>;
}
