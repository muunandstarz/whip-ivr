import crypto from "node:crypto";
import { KLUTCH_STATES } from "@shared/klutchPolicy";

/** Source-backed correspondence only: deliberately has no database or issuance imports. */
export type ExistingPoiFacts = {
  policyNumber: string; memberName: string; memberNumber: string; vin: string;
  state: string; effectiveOn: string; expiresOn: string;
};
export type ExistingPoiSource = ExistingPoiFacts & {
  kind: "external" | "recorded"; issuer: string; reference: string; issuedOn: string;
  attested: true;
};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
export function validPoiDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value + "T00:00:00Z")) && new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;
}
export function existingPoiNumber(value: unknown) {
  const number = text(value);
  if (!/^[A-Za-z0-9][A-Za-z0-9./-]{2,63}$/.test(number) || /^(DRAFT|TEST|SAMPLE|PENDING|UNKNOWN|N\/A)(?:\b|[-/])/i.test(number)) {
    throw new Error("Enter the actual existing policy number shown on the POI (3–64 letters, numbers, dots, slashes or hyphens); draft or placeholder numbers are not accepted.");
  }
  return number;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Existing POI facts and source are required.");
  return value as Record<string, unknown>;
}
function facts(value: unknown): ExistingPoiFacts {
  const f = object(value);
  const result = {
    policyNumber: existingPoiNumber(f.policyNumber), memberName: text(f.memberName), memberNumber: text(f.memberNumber),
    vin: text(f.vin).toUpperCase(), state: text(f.state), effectiveOn: text(f.effectiveOn), expiresOn: text(f.expiresOn),
  };
  if (!result.memberName || !result.memberNumber || result.memberName.length > 160 || result.memberNumber.length > 100) throw new Error("The POI must identify the member name and member number.");
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(result.vin)) throw new Error("The POI must identify a valid full 17-character VIN.");
  if (!(KLUTCH_STATES as readonly string[]).includes(result.state)) throw new Error("Choose a supported garaging state matching the POI.");
  if (!validPoiDate(result.effectiveOn) || !validPoiDate(result.expiresOn) || result.effectiveOn >= result.expiresOn) throw new Error("Enter the exact valid POI effective and expiration dates. No term or renewal is inferred.");
  return result;
}
export function validateExistingPoi(input: unknown, today = new Date().toISOString().slice(0, 10)) {
  const body = object(input), source = object(body.source), requested = facts(body.facts), recorded = facts(source);
  if (body.stateConfirmed !== true) throw new Error("Confirm the member's garaging state before using an existing POI.");
  for (const key of Object.keys(requested) as (keyof ExistingPoiFacts)[]) {
    if (requested[key] !== recorded[key]) throw new Error(`Existing POI ${key} does not match the member / vehicle / state / term in this document. Review the original source.`);
  }
  if (source.kind !== "external" && source.kind !== "recorded") throw new Error("Choose external POI or the exact shared-register record as the source.");
  if (source.attested !== true) throw new Error("Attest that the member already has an authentic issued POI and that every fact was checked against the original source.");
  const issuer = text(source.issuer), reference = text(source.reference), issuedOn = text(source.issuedOn);
  if (issuer !== "Klutch Risk Retention Group") throw new Error("This workspace accepts POI issued by Klutch Risk Retention Group only; verify the actual issuer.");
  if (reference.length < 5 || reference.length > 300 || /^(none|unknown|pending|n\/?a|test|sample)$/i.test(reference)) throw new Error("Enter a specific retained POI source reference / file ID (5–300 characters).");
  if (!validPoiDate(issuedOn) || issuedOn > today) throw new Error("Enter the authentic POI issuance / source-document date, not a future date.");
  if (requested.effectiveOn > today) throw new Error("This correspondence mode requires an already-effective POI; future coverage is not inferred.");
  const cleanSource: ExistingPoiSource = { ...recorded, kind: source.kind, issuer, reference, issuedOn, attested: true };
  return { facts: requested, source: cleanSource };
}
export function assertRecordedPoiMatch(verified: ReturnType<typeof validateExistingPoi>, policy: any) {
  const f = verified.facts;
  if (!policy || policy.policyNumber !== f.policyNumber || policy.memberName !== f.memberName || policy.memberNumber !== f.memberNumber || policy.vin !== f.vin || policy.state !== f.state) {
    throw new Error("No exact matching issued policy exists in the shared register. Nothing was registered or changed.");
  }
  const term = (policy.termsHistory || []).find((t: any) => t.effectiveOn === f.effectiveOn && t.expiresOn === f.expiresOn && t.terms?.memberName === f.memberName && t.terms?.memberNumber === f.memberNumber && t.terms?.vin === f.vin && t.terms?.state === f.state);
  if (!term) throw new Error("The entered POI term does not match an issued historical term in the shared register.");
  return term;
}
const signature = (payload: string, secret: string) => crypto.createHmac("sha256", secret).update(payload).digest("base64url");
function secretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("Source verification is unavailable. Do not use unverified POI correspondence.");
  return secret;
}
export function signExistingPoi(verified: ReturnType<typeof validateExistingPoi>, userId: number, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ purpose: "klutch-existing-poi-correspondence-v1", userId, expiresAt: now + 30 * 60 * 1000, ...verified })).toString("base64url");
  return `${payload}.${signature(payload, secretKey())}`;
}
export function authorizeExistingPoiOutput(input: unknown, userId: number, now = Date.now()) {
  const body = object(input), token = text(body.verificationToken), [payload, sig, extra] = token.split(".");
  const expected = signature(payload || "", secretKey());
  if (!payload || !sig || extra || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new Error("Verify the authentic existing POI source before preparing correspondence.");
  let bound: any;
  try { bound = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch { throw new Error("The POI verification is invalid."); }
  if (bound.purpose !== "klutch-existing-poi-correspondence-v1" || bound.userId !== userId || !Number.isFinite(bound.expiresAt) || bound.expiresAt <= now) throw new Error("The POI verification expired or belongs to another operator. Verify the original source again.");
  const verified = validateExistingPoi(body);
  if (JSON.stringify(verified.facts) !== JSON.stringify(bound.facts) || JSON.stringify(verified.source) !== JSON.stringify(bound.source)) throw new Error("The verified POI number, member, VIN, state, term or source changed. Reverify the original source.");
  if (body.documentType !== "car") throw new Error("Existing external POI supports source-backed coverage correspondence only. It cannot issue declarations, endorsements, denials, renewals or cancellation notices.");
  const lossOn = text(body.lossOn), position = text(body.position), positionReference = text(body.positionReference);
  if (!validPoiDate(lossOn) || lossOn < verified.facts.effectiveOn || lossOn >= verified.facts.expiresOn) throw new Error("The date of loss must fall within the exact verified POI term. No historical coverage or renewal is invented.");
  if (body.positionConfirmed !== true || position.length < 20 || position.length > 5000 || positionReference.length < 5 || positionReference.length > 300) throw new Error("Enter the reviewed coverage position and its specific retained source reference, and attest to the determination. POI alone does not establish coverage or a denial.");
  return { ...verified, lossOn, position, positionReference, documentType: "car" as const, mode: "source_backed_correspondence" as const, issued: false, recorded: false, sent: false };
}
