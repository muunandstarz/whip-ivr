import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  PDFDocument, PDFPage, PDFFont, PDFImage, PDFName, StandardFonts,
  PDFRawStream, PDFArray, decodePDFRawStream,
  rgb, grayscale, pushGraphicsState, popGraphicsState,
  concatTransformationMatrix,
} from "pdf-lib";
import {
  RENTAL_FORM_VERSION, DEFAULT_RENTAL_RATES, CONDITION_AREAS,
  ASSET_KINDS, eligibleOptions, rentalDraftSchema, rentalReturnSchema,
  calculateRentalCharges,
  type RentalDraft, type RentalVehicle, type RentalLocation,
  type RentalRates, type LaunchSettings, type RentalReturn,
} from "../shared/rentalHandoff";
import { storageGetSignedUrl } from "./storage";

export { rentalAgreementSections } from "../shared/rentalAgreement";
export const RENTAL_PDF_FORM_VERSION = RENTAL_FORM_VERSION;
/** Owner-approved exceptions to the original wording. No other legal edits. */
export const RENTAL_PDF_AUTHORIZED_REVISIONS = {
  registration: "Rental vehicle notice — keep this page in the vehicle.",
  cardholderLabel: "Cardholder signature",
  signatureInstructions: "Renter-cardholders may sign electronically. A different cardholder must sign in ink in person and show government photo ID.",
} as const;
/** Immutable originals, not regenerated legal text. No upload paths in production. */
export const RENTAL_PDF_TEMPLATE_KEYS = {
  packet: "ClaimantRentalPacket-DRAFTv7_68b8dad8.pdf",
  vehicleInformation: "RentalVehicleInformationPage-DRAFT_f48ca1fd.pdf",
} as const;
const TEMPLATE_SHA256 = {
  packet: "dbbc0d2fa123e3ac7422af40596ed80989aa93312f9889ba35303a9b5de5b1f4",
  vehicleInformation: "d3b41271afb1c5b2cf8c86b2c06a407040532ebe7254e644d55fa1602e3cd2be",
};
export type RentalPdfTemplates = { packet: Uint8Array; vehicleInformation: Uint8Array };
export type RentalPdfTemplateLoader = () => Promise<RentalPdfTemplates>;
export type RentalPdfAsset = {
  id: number; kind: string; signerName?: string | null; createdAt?: number; bytes?: Buffer;
};
export type RentalPacketInput = {
  rentalId: number; version: number | string; draft: RentalDraft;
  vehicle: RentalVehicle; location: RentalLocation; rates: RentalRates;
  assets: RentalPdfAsset[]; settings: LaunchSettings;
  /** Test/local injection only; still verified against the exact original checksums. */
  templates?: RentalPdfTemplates;
  templateLoader?: RentalPdfTemplateLoader;
  /** The dedicated signature assets represent this packet's signing transaction.
   * Set false if a caller collected a signature for a different scope. */
  samePacketSigning?: { renter: boolean; representative: boolean };
};
export type RentalReturnPacketInput = RentalPacketInput & {
  returnData: RentalReturn; charges: ReturnType<typeof calculateRentalCharges>;
};
export class RentalPdfValidationError extends Error {
  constructor(public field: string, message: string) {
    super(`${field}: ${message}`); this.name = "RentalPdfValidationError";
  }
}
const fail = (field: string, message: string): never => { throw new RentalPdfValidationError(field, message); };
const LIMITS = { templateBytes: 2 * 1024 * 1024, assetBytes: 10 * 1024 * 1024, totalAssetBytes: 64 * 1024 * 1024, assetCount: 48, imagePixels: 20_000_000 };
/** All text is measured, never clipped or silently truncated. Coordinates are
 * original A4 points, top-left origin, from pdftotext -bbox + PDF border paths.
 * The original CONTENT frame (not the A4 media box) maps onto half-inch Letter
 * margins. Text matrices compensate the frame transform: embedded source fonts
 * keep their original point sizes and proportions, and no legal text is retyped. */
export const RENTAL_PDF_FILL_LIMITS = {
  ...LIMITS, pageWidth: 612, pageHeight: 792, margin: 36,
  fieldFontPoints: 10, minimumFieldFontPoints: 8.5,
  leftCell: { x: 186, width: 116, maxLines: 1 },
  rightCell: { x: 410, width: 126, maxLines: 1 },
  vehicleInfoCell: { x: 220, width: 309, maxLines: 1 },
  initials: { x: 483, width: 57, maxLines: 1, labelGapPoints: 4 },
  printedName: { x: 307, width: 105, maxLines: 2 },
  conditionNote: { width: 111, maxLines: 1 },
  overflowPolicy: "Names and narrative fields use a referenced continuation schedule; other overflows throw. No font auto-shrinking.",
} as const;
// Include outer table strokes and the source fonts' actual ascent/descent.
const SOURCE = { width: 595.303937, height: 841.889764, left: 71.5, top: 34.5, widthInside: 469, heightInside: 773 };
const MARGIN = RENTAL_PDF_FILL_LIMITS.margin;
const FRAME_WIDTH = 612 - 2 * MARGIN;
const SCALE_X = FRAME_WIDTH / SOURCE.widthInside;
const SCALE_Y = (792 - 2 * MARGIN) / SOURCE.heightInside;
const sourceLeft = new WeakMap<PDFPage, number>();
const pageX = (page: PDFPage, x: number) => MARGIN + (x - (sourceLeft.get(page) ?? SOURCE.left)) * SCALE_X;
const pageY = (top: number) => 792 - MARGIN - (top - SOURCE.top) * SCALE_Y;
const BLACK = rgb(0, 0, 0);
const blankTemplateCache = new Map<string, Buffer>(); // Only checksum-pinned blank templates.

async function fetchBounded(url: string, max: number): Promise<Buffer> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") fail("template", "storage must return an HTTPS URL");
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok || !response.body) fail("template", `download failed (${response.status})`);
  if (Number(response.headers.get("content-length")) > max) { await response.body!.cancel(); fail("template", "download exceeds byte limit"); }
  const reader = response.body!.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > max) fail("template", "download exceeds byte limit"); chunks.push(value);
    }
    return Buffer.concat(chunks, size);
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
function verifyTemplate(name: keyof RentalPdfTemplates, bytes: Uint8Array) {
  if (!bytes.length || bytes.length > LIMITS.templateBytes) fail(`templates.${name}`, "invalid template size");
  if (createHash("sha256").update(bytes).digest("hex") !== TEMPLATE_SHA256[name]) fail(`templates.${name}`, "does not match the approved original PDF");
}
export const loadRentalPdfTemplates: RentalPdfTemplateLoader = async () => {
  const result = {} as RentalPdfTemplates;
  for (const name of ["packet", "vehicleInformation"] as const) {
    const key = RENTAL_PDF_TEMPLATE_KEYS[name]; let bytes = blankTemplateCache.get(key);
    if (!bytes) { bytes = await fetchBounded(await storageGetSignedUrl(key), LIMITS.templateBytes); verifyTemplate(name, bytes); blankTemplateCache.set(key, bytes); }
    result[name] = new Uint8Array(bytes); // Caller cannot mutate the cached blank.
  }
  return result;
};

/** NUL is sanitized; unsupported Unicode fails explicitly. No replacement glyphs. */
export function sanitizeRentalPdfText(value: unknown, field = "text"): string {
  const text = String(value ?? "").replace(/\0/g, "").replace(/\r\n?/g, "\n");
  if (/[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text)) fail(field, "contains unsupported control characters");
  if (/[^\x09\x0a\x20-\x7e\xa0-\xff\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u2026]/.test(text)) fail(field, "contains characters unsupported by the PDF Helvetica font; correct the value before signing");
  return text.replace(/\t/g, "    ");
}
function rejectPan(text: string, field: string) {
  // Full PAN/CVV never belongs in any overlay/narrative. lastFour is separately validated.
  if (/(?:\d[ -]?){13,19}/.test(text)) fail(field, "possible full payment-card number; record only last four digits");
  if (/\b(?:cvv|cvc|security code)\s*[:=]?\s*\d{3,4}\b/i.test(text)) fail(field, "payment security codes must not be included");
}
function validateTextTree(value: unknown, field: string): void {
  if (typeof value === "string") { rejectPan(sanitizeRentalPdfText(value, field), field); }
  else if (Array.isArray(value)) value.forEach((v, n) => validateTextTree(v, `${field}.${n}`));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) validateTextTree(v, `${field}.${k}`);
}
function validateInput(input: RentalPacketInput) {
  const d = rentalDraftSchema.parse(input.draft); validateTextTree(d, "draft");
  validateTextTree(input.vehicle, "vehicle"); validateTextTree(input.location, "location");
  validateTextTree(input.settings.financialResponsibilityReference, "settings.financialResponsibilityReference");
  if (!input.settings.counselApproved) fail("settings.counselApproved", "v7 requires counsel launch approval");
  // e1 owner-approved rental notice does not assert a separate registration copy exists.
  if (!input.settings.financialResponsibilityReference.trim() && !input.settings.omitFinancialReference) fail("settings.financialResponsibilityReference", "reference or owner-authorized omission required");
  for (const [key, value] of Object.entries(DEFAULT_RENTAL_RATES)) {
    if (input.rates[key as keyof RentalRates] !== value || input.settings.rates[key as keyof RentalRates] !== value) fail("rates", "must match the fixed v7 source rates");
  }
  if (!Number.isSafeInteger(input.rentalId) || input.rentalId < 1) fail("rentalId", "must be a positive integer");
  if (!String(input.version).trim()) fail("version", "is required");
  sanitizeRentalPdfText(input.version, "version");
  if (d.vehicleId !== input.vehicle.id || d.locationId !== input.location.id || input.vehicle.locationId !== input.location.id) fail("vehicle/location", "does not match the rental assignment");
  if (!eligibleOptions(d).some(o => o.option === d.election && o.allowed)) fail("election", "is not eligible under v7");
  if (d.election === "B" && d.additionalDrivers.length) fail("additionalDrivers", "Option B permits only the renter");
  if (d.payment.lastFour && !/^\d{4}$/.test(d.payment.lastFour)) fail("payment.lastFour", "must contain exactly four digits, never a full PAN");
  if (d.payment.isRenter && d.payment.cardholderName.trim().toLocaleLowerCase() !== d.renterName.trim().toLocaleLowerCase()) fail("payment.cardholderName", "must match renter when marked same person");
  if (d.condition.length !== CONDITION_AREAS.length || CONDITION_AREAS.some(area => d.condition.filter(c => c.area === area).length !== 1)) fail("condition", "requires exactly one record for each of the 12 source areas");
  if (input.assets.length > LIMITS.assetCount) fail("assets", "too many assets");
  let total = 0; const ids = new Set<number>(); const signatures = new Set<string>();
  for (const asset of input.assets) {
    if (!(ASSET_KINDS as readonly string[]).includes(asset.kind)) fail("assets.kind", "unknown asset type");
    if (!Number.isSafeInteger(asset.id) || asset.id < 1 || ids.has(asset.id)) fail("assets.id", "must be unique positive integers"); ids.add(asset.id);
    if (asset.createdAt !== undefined && !Number.isFinite(asset.createdAt)) fail("assets.createdAt", "must be a finite epoch timestamp");
    if (asset.signerName) validateTextTree(asset.signerName, "asset.signerName");
    if (!asset.bytes?.length) fail(`asset.${asset.id}`, "load asset bytes before PDF generation");
    if (asset.bytes!.length > LIMITS.assetBytes) fail(`asset.${asset.id}`, "exceeds 10 MiB limit"); total += asset.bytes!.length;
    if (/Signature$/.test(asset.kind)) { if (signatures.has(asset.kind)) fail(asset.kind, "ambiguous duplicate signature"); signatures.add(asset.kind); }
  }
  if (total > LIMITS.totalAssetBytes) fail("assets", "combined bytes exceed 64 MiB limit");
  if (input.assets.some(a => a.kind === "signedPayment") && !(d.payment.photoIdChecked && d.payment.authorizationAcknowledged)) fail("signedPayment", "in-person ID check and retained-original acknowledgment required");
  // Validate the location timezone even when all visible dates are blank.
  new Intl.DateTimeFormat("en-US", { timeZone: input.location.timezone });
}
function date(value: string | number | undefined, zone: string, includeTime = false): string {
  if (value === undefined || value === "") return "";
  const parsed = new Date(value); if (!Number.isFinite(parsed.getTime())) fail("date", "invalid date/time");
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", ...(includeTime ? { hour: "2-digit", minute: "2-digit", hour12: false } as const : {}) }).formatToParts(parsed);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  return `${get("month")}/${get("day")}/${get("year")}${includeTime ? ` ${get("hour")}:${get("minute")}` : ""}`;
}
const money = (value: number) => { if (!Number.isFinite(value) || value < 0) fail("amount", "invalid amount"); return `$${value.toFixed(2)}`; };

type Continuation = { id: number; field: string; text: string };
type CellOptions = { lines?: number; continuation?: boolean; size?: number };
function continuationLabel(field: string): string {
  const condition = field.match(/^RP4\.(pickup|return)\.(.+)$/);
  if (condition) return `${condition[1] === "pickup" ? "Pick-up" : "Return"} condition - ${condition[2]}`;
  const driver = field.match(/^RP1\.additionalDriver(\d+)\.(name|licenseState)$/);
  if (driver) return `Additional driver ${driver[1]} ${driver[2] === "name" ? "name" : "license / state"}`;
  const signature = field.match(/^(.+Signature)\.printedName$/);
  if (signature) return `${({ renterSignature: "Renter", representativeSignature: "Representative", returnRenterSignature: "Return renter", returnRepresentativeSignature: "Return representative" } as Record<string, string>)[signature[1]] ?? "Signer"} printed name`;
  const key = field.replace(/^RP\d\./, "");
  const labels: Record<string, string> = {
    vehicle: "Rental vehicle", plateState: "Rental license plate / state", plate: "Rental license plate / state", renter: "Renter name", renterName: "Renter name", claim: "Claim number", claimNumber: "Claim number",
    licenseState: "Driver license / state", additionalDrivers: "Additional drivers", location: "Rental location", financialReference: "Evidence of financial responsibility", insurerPolicy: "Renter insurer / policy",
    phone: "Phone number", insurer: "Insurer", policy: "Policy number", verifiedWith: "Verified with", verifiedByDate: "Verified by / date", vehiclePlate: "Rental vehicle / plate", cardholder: "Cardholder name",
    billingAddress: "Billing address", relationship: "Relationship to renter", chargedWhen: "Charges timing", cardholderPrintedName: "Cardholder printed name", witness: "Signature witness", contact: "Insurer contact name",
    verifiedAt: "Date / time verified", verifiedBy: "Verified by", limits: "Liability limits", deductible: "Comprehensive / collision deductible", notes: "Coverage verification notes", pickupPhotos: "Pick-up photos", returnPhotos: "Return photos",
  };
  return labels[key] ?? "Entered field";
}
class Overlay {
  readonly continuations: Continuation[] = [];
  constructor(readonly doc: PDFDocument, readonly font: PDFFont) {}
  cell(page: PDFPage, field: string, value: unknown, x: number, top: number, width: number, height: number, options: CellOptions = {}): void {
    const text = sanitizeRentalPdfText(value, field); if (!text.trim()) return;
    const size = options.size ?? RENTAL_PDF_FILL_LIMITS.fieldFontPoints;
    const maxLines = options.lines ?? 1; const leading = size + 1;
    const lines = this.wrap(text, width * SCALE_X, size, field);
    const physicalHeight = height * SCALE_Y;
    if (lines.length > maxLines || size + (lines.length - 1) * leading > physicalHeight - 2) {
      if (!options.continuation) fail(field, `value exceeds ${width.toFixed(1)}pt source cell / ${maxLines} line(s); use a shorter value or an approved continuation field`);
      const id = this.continuations.length + 1; this.continuations.push({ id, field, text });
      const reference = `See schedule ${id}`;
      return this.cell(page, field, reference, x, top, width, height, { size });
    }
    const baseline = (physicalHeight - (size + (lines.length - 1) * leading)) / 2 + size * 0.8;
    lines.forEach((line, i) => page.drawText(line, { x: pageX(page, x), y: pageY(top) - baseline - i * leading, size, font: this.font, color: BLACK }));
  }
  /** The pinned source label is 8pt Helvetica, 22.656pt wide. Use its actual
   * text baseline, not the separate underline or a vertically centered cell. */
  initials(page: PDFPage, field: string, value: unknown, labelX: number, baselineTop: number) {
    const text = sanitizeRentalPdfText(value, field); if (!text.trim()) return;
    const x = pageX(page, labelX) + 22.656 + RENTAL_PDF_FILL_LIMITS.initials.labelGapPoints;
    const right = pageX(page, 540) - 2;
    const size = RENTAL_PDF_FILL_LIMITS.fieldFontPoints;
    if (text.includes("\n") || this.font.widthOfTextAtSize(text, size) > right - x) fail(field, "initials value exceeds the space beside the original Initials label");
    page.drawText(text, { x, y: pageY(baselineTop), size, font: this.font, color: BLACK });
  }
  wrap(text: string, width: number, size: number, field: string): string[] {
    const lines: string[] = [];
    for (const paragraph of text.split("\n")) {
      if (!paragraph) { lines.push(""); continue; }
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        let wordWidth: number; try { wordWidth = this.font.widthOfTextAtSize(word, size); } catch { return fail(field, "character cannot be encoded in Helvetica"); }
        if (wordWidth > width) { // Return an overflow line; caller schedules or fails, never splits a VIN/name silently.
          if (line) lines.push(line); lines.push(word); line = ""; continue;
        }
        const next = line ? `${line} ${word}` : word;
        if (this.font.widthOfTextAtSize(next, size) > width) { lines.push(line); line = word; } else line = next;
      }
      if (line) lines.push(line);
    }
    // An oversized single word must be an overflow, not a clipped one-line field.
    if (lines.some(line => this.font.widthOfTextAtSize(line, size) > width)) lines.push(" ");
    return lines;
  }
  check(page: PDFPage, x: number, top: number, checked: boolean, edge = 8) {
    if (!checked) return; const inset = 1;
    const point = (px: number, py: number) => ({ x: pageX(page, px), y: pageY(py) });
    page.drawLine({ start: point(x + inset, top + inset), end: point(x + edge - inset, top + edge - inset), thickness: 0.8, color: BLACK });
    page.drawLine({ start: point(x + inset, top + edge - inset), end: point(x + edge - inset, top + inset), thickness: 0.8, color: BLACK });
  }
  async signature(page: PDFPage, input: RentalPacketInput, kind: string, expected: string, x: number, top: number, width: number, height: number) {
    const asset = input.assets.find(a => a.kind === kind); if (!asset) return;
    if (asset.signerName && asset.signerName.trim() !== expected.trim()) fail(kind, "signer does not match the named signer");
    if (kind === "renterSignature" && input.samePacketSigning?.renter === false) fail(kind, "signature not authorized for this packet");
    if (kind === "representativeSignature" && input.samePacketSigning?.representative === false) fail(kind, "signature not authorized for this packet");
    const image = await embedGrayImage(this.doc, asset);
    const fit = image.scaleToFit(width * SCALE_X, height * SCALE_Y);
    page.drawImage(image, { x: pageX(page, x), y: pageY(top + height), ...fit });
  }
  appendContinuations(input: RentalPacketInput) {
    let page: PDFPage | undefined; let y = 0;
    const newPage = () => { page = this.doc.addPage([612, 792]); y = 703; header(page, this.font, "RENTAL FIELD CONTINUATION SCHEDULE", input); };
    for (const item of this.continuations) {
      const lines = this.wrap(item.text, FRAME_WIDTH, 10, item.field);
      if (!page || y < 80) newPage();
      const label = `Schedule ${item.id} - ${continuationLabel(item.field)}`;
      if (this.font.widthOfTextAtSize(label, 10) > FRAME_WIDTH) fail(item.field, "schedule heading exceeds physical margins");
      page!.drawText(label, { x: MARGIN, y, size: 10, font: this.font, color: BLACK }); y -= 17;
      for (const line of lines) { if (y < MARGIN + 10) newPage(); if (this.font.widthOfTextAtSize(line, 10) > FRAME_WIDTH) fail(item.field, "single word exceeds continuation width"); page!.drawText(line, { x: MARGIN, y, size: 10, font: this.font, color: BLACK }); y -= 14; } y -= 14;
    }
  }
}

/** Native server image decoder is an existing pdf-parse dependency; no browser.
 * It is used only to transform pixels, not render any form/legal wording. */
const require = createRequire(import.meta.url);
function imageDimensions(bytes: Buffer): { width: number; height: number } {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at = 2;
    while (at + 4 < bytes.length) {
      if (bytes[at++] !== 0xff) fail("image", "malformed JPEG marker");
      let marker = bytes[at++]; while (marker === 0xff && at < bytes.length) marker = bytes[at++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      const length = bytes.readUInt16BE(at); if (length < 2 || at + length > bytes.length) fail("image", "malformed JPEG length");
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) { if (length < 8) fail("image", "malformed JPEG dimensions"); return { width: bytes.readUInt16BE(at + 5), height: bytes.readUInt16BE(at + 3) }; }
      at += length;
    }
  }
  return fail("image", "only PNG/JPEG images are supported");
}
async function embedGrayImage(doc: PDFDocument, asset: RentalPdfAsset): Promise<PDFImage> {
  const { width, height } = imageDimensions(asset.bytes!);
  if (!width || !height || width * height > LIMITS.imagePixels) fail(`asset.${asset.id}`, "image dimensions exceed pixel limit");
  const decoderRequire = createRequire(require.resolve("pdf-parse"));
  const { createCanvas, loadImage } = decoderRequire("@napi-rs/canvas") as {
    createCanvas: (w: number, h: number) => any; loadImage: (bytes: Buffer) => Promise<any>;
  };
  // Retain only a bounded private copy. Caller owns and must clear original bytes.
  const copy = Buffer.from(asset.bytes!); let pixels: any; let encoded: Buffer | undefined;
  const canvas = createCanvas(width, height);
  try {
    const image = await loadImage(copy); const context = canvas.getContext("2d"); context.drawImage(image, 0, 0, width, height);
    pixels = context.getImageData(0, 0, width, height);
    for (let i = 0; i < pixels.data.length; i += 4) { const gray = Math.round(pixels.data[i] * 0.299 + pixels.data[i+1] * 0.587 + pixels.data[i+2] * 0.114); pixels.data[i] = pixels.data[i+1] = pixels.data[i+2] = gray; }
    context.putImageData(pixels, 0, 0); encoded = canvas.toBuffer("image/png");
    const embedded = await doc.embedPng(encoded!); await embedded.embed(); return embedded;
  } finally { copy.fill(0); pixels?.data.fill(0); encoded?.fill(0); canvas.width = 1; canvas.height = 1; }
}
function header(page: PDFPage, font: PDFFont, title: string, input: RentalPacketInput) {
  page.drawText(title, { x: MARGIN, y: 746, size: 12, font, color: BLACK });
  const subtitle = sanitizeRentalPdfText(`Rental ${input.rentalId} | Packet version ${input.version} | ${RENTAL_PDF_FORM_VERSION}`, "header");
  if (font.widthOfTextAtSize(subtitle, 10) > FRAME_WIDTH) fail("version", "header exceeds physical margins");
  page.drawText(subtitle, { x: MARGIN, y: 729, size: 10, font, color: BLACK });
  page.drawLine({ start: { x: MARGIN, y: 720 }, end: { x: 612 - MARGIN, y: 720 }, thickness: 0.6, color: BLACK });
}
/** Remove only the exact approved BT/ET blocks, not merely hide searchable
 * contradictory text under white rectangles. SHA256 + expected block counts
 * make this fail closed if the original layout ever changes. */
function removeAuthorizedText(page: PDFPage, kind: "registration" | "signature") {
  const contents = page.node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray().map(ref => page.doc.context.lookup(ref) as PDFRawStream) : [contents as PDFRawStream];
  let removed = 0;
  const text = streams.map(stream => Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1")).join("\n").replace(/BT\s[\s\S]*?ET/g, block => {
    const td = block.match(/([\d.-]+) ([\d.-]+) Td/); if (!td) return block;
    const x = Number(td[1]), top = SOURCE.height - Number(td[2]);
    const match = kind === "registration" ? x > 219 && x < 222 && top > 242 && top < 245 : x > 71 && x < 73 && ((top > 173 && top < 175) || (top > 194 && top < 224));
    if (!match) return block; removed++; return "";
  });
  if (removed !== (kind === "registration" ? 1 : 4)) fail("authorizedRevision", "approved source text-zone count mismatch");
  page.node.set(PDFName.of("Contents"), page.doc.context.register(page.doc.context.flateStream(Buffer.from(text,"latin1"))));
}
/** Each elected option starts with separate bold/regular source text runs.
 * Expanding their origins while retaining the original font widths otherwise
 * inserts a large gap after the bold lead. Counter-space only the three regular
 * run origins; retain every original glyph, font, TJ operand and baseline. The
 * checksum-pinned source and exact match count make this presentation-only. */
function alignProtectionOptionText(page: PDFPage) {
  const contents = page.node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  const origins = new Map([
    ["302.9 281.639", 302.9],
    ["421.95 208.489", 421.95],
    ["165.8 135.339", 165.8],
  ]);
  let aligned = 0;
  const text = refs.map(ref => Buffer.from(decodePDFRawStream(page.doc.context.lookup(ref) as PDFRawStream).decode()).toString("latin1")).join("\n").replace(/BT\s[\s\S]*?ET/g, block =>
    block.replace(/([\d.]+) ([\d.]+) Td/, (operator, x, y) => {
      const originalX = origins.get(`${x} ${y}`);
      if (originalX === undefined) return operator;
      aligned++;
      return `${94.6 + (originalX - 94.6) / SCALE_X} ${y} Td`;
    }));
  if (aligned !== 3) fail("template", "protection-option source text-origin count mismatch");
  page.node.set(PDFName.of("Contents"), page.doc.context.register(page.doc.context.flateStream(Buffer.from(text, "latin1"))));
}
/** Move source origins/table paths into the wider Letter frame, but counteract
 * the anisotropic frame transform in EACH text matrix and logo matrix. This is
 * positioning/re-spacing only: original glyph strings, TJ kerning, font sizes,
 * clauses, footers and resources are retained. Checksum validation happens first.
 * The only source Tm overrides are unit matrices for the original checkboxes. */
function preserveSourceTypography(page: PDFPage) {
  const contents = page.node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  const number = "(-?\\d+(?:\\.\\d+)?)";
  const td = new RegExp(`${number} ${number} Td`);
  const tm = new RegExp(`1 0 0 1 ${number} ${number} Tm`, "g");
  let blocks = 0;
  const text = refs.map(ref => Buffer.from(decodePDFRawStream(page.doc.context.lookup(ref) as PDFRawStream).decode()).toString("latin1")).join("\n").replace(/BT\s[\s\S]*?ET/g, block => {
    if ((block.match(/\bTd\b/g) ?? []).length !== 1 || !td.test(block)) fail("template", "unexpected original text positioning");
    if ((block.match(/\bTm\b/g) ?? []).length !== (block.match(tm) ?? []).length) fail("template", "unexpected original text matrix");
    blocks++;
    const compensated = block.replace(tm, (_, x, y) => `${1 / SCALE_X} 0 0 ${1 / SCALE_Y} ${x} ${y} Tm`);
    return compensated.replace(td, (operator, x, y) => `${operator}\n${1 / SCALE_X} 0 0 ${1 / SCALE_Y} ${x} ${y} Tm`);
  }).replace(/q (127\.5) 0 0 (43\.5) (65|72) ([\d.]+) cm\n(\/Im\d+ Do Q)/g,
    // RP0's source logo sits five points higher than the packet's logos. Move
    // this image and its clip down 4 physical points; never crop the logo.
    (_, w, h, x, y, draw) => `q ${Number(w) / SCALE_X} 0 0 ${Number(h) / SCALE_Y} ${x} ${Number(y) - (x === "65" ? 4 / SCALE_Y : 0)} cm\n${draw}`)
    .replace(/(65|72) (760\.389|765\.389) 127\.5 43\.5 re/g,
      (_, x, y) => `${x} ${Number(y) - (x === "65" ? 4 / SCALE_Y : 0)} ${127.5 / SCALE_X} ${43.5 / SCALE_Y} re`);
  if (!blocks) fail("template", "missing original text blocks");
  page.node.set(PDFName.of("Contents"), page.doc.context.register(page.doc.context.flateStream(Buffer.from(text, "latin1"))));
}
async function sourcePages(input: RentalPacketInput, returnOnly: boolean) {
  validateInput(input);
  const templates = input.templates ?? await (input.templateLoader ?? loadRentalPdfTemplates)();
  verifyTemplate("packet", templates.packet); verifyTemplate("vehicleInformation", templates.vehicleInformation);
  const packet = await PDFDocument.load(templates.packet), vehicle = await PDFDocument.load(templates.vehicleInformation);
  if (packet.getPageCount() !== 8 || vehicle.getPageCount() !== 1) fail("templates", "expected original 8 + 1 pages");
  const doc = await PDFDocument.create(); doc.setTitle(returnOnly ? "Rental return packet" : "Claimant rental handoff packet"); doc.setAuthor("Metrocars Leasing Corp.");
  if (!returnOnly) { removeAuthorizedText(vehicle.getPage(0), "registration"); removeAuthorizedText(packet.getPage(5), "signature"); }
  if (!returnOnly) alignProtectionOptionText(packet.getPage(0));
  const source = returnOnly ? [packet.getPage(7)] : [vehicle.getPage(0), ...packet.getPages()];
  // Modify new packet copies only. No originals/cache/stored signed PDFs change.
  // Text stays searchable; original signature rules remain on their pages.
  for (const src of source) {
    const [page] = await doc.copyPages(src.doc, [src.doc.getPages().indexOf(src)]); doc.addPage(page);
    if (Math.abs(page.getWidth() - SOURCE.width) > 0.1 || Math.abs(page.getHeight() - SOURCE.height) > 0.1) fail("templates", "unexpected original page geometry");
    const left = src.doc === vehicle ? 64.5 : SOURCE.left;
    sourceLeft.set(page, left); preserveSourceTypography(page);
    page.setSize(612, 792); page.setCropBox(0, 0, 612, 792);
    // wrapContentStreams only handles arrays; originals have a single stream.
    page.node.normalize();
    const x = MARGIN - left * SCALE_X;
    const y = 792 - MARGIN - (SOURCE.height - SOURCE.top) * SCALE_Y;
    if (!page.node.wrapContentStreams(doc.context.register(doc.context.contentStream([pushGraphicsState(), concatTransformationMatrix(SCALE_X, 0, 0, SCALE_Y, x, y)])), doc.context.register(doc.context.contentStream([popGraphicsState()])))) fail("template", "unable to transform source content");
    // A copied original must not carry stale metadata annotations/forms into the generated packet.
    page.node.delete(PDFName.of("Annots"));
  }
  const font = await doc.embedFont(StandardFonts.Helvetica); return { doc, overlay: new Overlay(doc, font), pages: doc.getPages() };
}
const narrative = { continuation: true };
function grid(o: Overlay, p: PDFPage, row: number, top: number, leftField: string, left: unknown, rightField: string, right: unknown, height = 20, allowLeft = true, allowRight = true) {
  o.cell(p, leftField, left, 186, top + row * height + 1, 116, height - 2, allowLeft ? narrative : {});
  o.cell(p, rightField, right, 410, top + row * height + 1, 126, height - 2, allowRight ? narrative : {});
}
async function signatureRow(o: Overlay, p: PDFPage, input: RentalPacketInput, kind: string, name: string, when: string, lineTop: number) {
  await o.signature(p, input, kind, name, 74, lineTop - 28, 214, 26);
  o.cell(p, `${kind}.printedName`, name, 307, lineTop - 26, 105, 24, { lines: 2, continuation: true });
  o.cell(p, `${kind}.date`, when, 430, lineTop - 18, 107, 16);
}
function conditionOverlay(o: Overlay, p: PDFPage, input: RentalPacketInput, returned?: RentalReturn) {
  const d = input.draft;
  grid(o,p,0,152.65,"RP4.renterName",d.renterName,"RP4.claimNumber",d.claimNumber);
  grid(o,p,1,152.65,"RP4.vehicle",input.vehicle.ymm,"RP4.plate",input.vehicle.plate);
  grid(o,p,2,152.65,"RP4.VIN",input.vehicle.vin,"RP4.location",input.location.name,20,false);
  CONDITION_AREAS.forEach((area, index) => {
    const pickup = d.condition.find(c => c.area === area), ret = returned?.condition.find(c => c.area === area); const top = 263.75 + index * 19;
    o.check(p,224.05,top+5.5,Boolean(pickup?.ok),7.6); o.check(p,274.05,top+5.5,Boolean(ret?.ok),7.6);
    const keyNote = area === "Keys / fobs (count)" ? [`${d.keysOut} out`, pickup?.note].filter(Boolean).join("; ") : pickup?.note;
    o.cell(p,`RP4.pickup.${area}`,keyNote,306,top+1,111,17,narrative);
    o.cell(p,`RP4.return.${area}`,ret?.note,425,top+1,111,17,narrative);
  });
  grid(o,p,0,509.75,"RP4.odometerOut",d.odometerOut ?? "","RP4.odometerReturn",returned?.odometer ?? "",20,false,false);
  grid(o,p,1,509.75,"RP4.fuelOut",d.fuelOut,"RP4.fuelReturn",returned?.fuel ?? "",20,false,false);
  const count = (prefix: string) => input.assets.filter(a => prefix === "return" ? /^return(Front|Rear|Driver|Passenger|Extra)$/.test(a.kind) : /^(front|rear|driver|passenger|extra)$/.test(a.kind)).length;
  grid(o,p,2,509.75,"RP4.pickupPhotos",count("pickup") ? `${count("pickup")} attached` : "","RP4.returnPhotos",returned && count("return") ? `${count("return")} attached` : "");
}
async function conditionSignatures(o: Overlay,p: PDFPage,input: RentalPacketInput,returned?: RentalReturn) {
  const zone = input.location.timezone;
  await signatureRow(o,p,input,"renterSignature",input.draft.renterName,date(input.draft.pickupAt,zone),632.6);
  // Representative images, not typed signatures, fit above the original inline rules.
  await o.signature(p,input,"representativeSignature",input.draft.representativeName,227,695,108,14);
  if (returned) {
    await signatureRow(o,p,input,"returnRenterSignature",input.draft.renterName,date(returned.returnedAt,zone),679.2);
    await o.signature(p,input,"returnRepresentativeSignature",returned.representativeName,394,695,102,14);
  }
}

export async function buildRentalPacket(input: RentalPacketInput): Promise<Buffer> {
  const {doc,overlay:o,pages:p} = await sourcePages(input,false); const d=input.draft,zone=input.location.timezone;
  const start=date(d.pickupAt,zone), startTime=date(d.pickupAt,zone,true), expected=date(d.expectedReturn,zone,true);
  // Tiny additive audit marker; original source version labels and all footers stay intact.
  for(const page of [p[0],p[5],p[6]]) o.cell(page,"formRevision","e1 owner-approved",430,781,106,14,{size:8.5});
  // RP0. Registered owner is the original text; registration row is the narrow e1 revision.
  const rp0=(field:string,value:unknown,top:number,allow=true)=>o.cell(p[0],field,value,220,top,309,16.5,allow?narrative:{});
  rp0("RP0.vehicle",input.vehicle.ymm,175.1);rp0("RP0.VIN",input.vehicle.vin,193.6,false);rp0("RP0.plateState",input.vehicle.plate,212.1);
  rp0("RP0.registrationNotice",RENTAL_PDF_AUTHORIZED_REVISIONS.registration,230.6,false);
  rp0("RP0.renter",d.renterName,322.25);rp0("RP0.licenseState",[d.license,d.licenseState].filter(Boolean).join(" / "),340.75);
  rp0("RP0.start",start,359.25,false);rp0("RP0.expectedReturn",expected,377.75,false);
  rp0("RP0.additionalDrivers",d.additionalDrivers.map(a=>a.name).join("; "),396.25);rp0("RP0.location",`${input.location.name}${input.location.address?` - ${input.location.address}`:""}`,414.75);
  rp0("RP0.financialReference",input.settings.financialResponsibilityReference,506.4);
  o.check(p[0],220.3,531.1,d.election==="A");o.check(p[0],288.067,531.1,d.election==="B");o.check(p[0],355.834,531.1,d.election==="Decline");
  rp0("RP0.insurerPolicy",[d.insurance.insurer,d.insurance.policy].filter(Boolean).join(" / "),543.4);
  // RP1 page 1: two real value columns, not a text layer over the labels.
  const rows:[string,unknown,string,unknown][]=[
    ["renter",d.renterName,"claim",d.claimNumber],["licenseState",[d.license,d.licenseState].filter(Boolean).join(" / "),"phone",d.mobile],
    ["vehicle",input.vehicle.ymm,"VIN",input.vehicle.vin],["plate",input.vehicle.plate,"odometer",d.odometerOut??""],
    ["location",input.location.name,"fuel",d.fuelOut],["pickup",startTime,"expected",expected],
    ["insurer",d.insurance.insurer,"policy",d.insurance.policy],["verifiedWith",d.insurance.contact,"verifiedByDate",[d.insurance.verifiedBy,date(d.insurance.verifiedAt,zone)].filter(Boolean).join(" / ")],
  ];rows.forEach(([lf,lv,rf,rv],n)=>grid(o,p[1],n,128.85,`RP1.${lf}`,lv,`RP1.${rf}`,rv,20,true,rf!=="VIN"));
  const electionTop={A:552,B:625.15,Decline:698.3};
  const electionBaseline={A:SOURCE.height-232.489,B:SOURCE.height-159.339,Decline:SOURCE.height-70.589};
  o.check(p[1],72.1,electionTop[d.election as "A"|"B"|"Decline"],true,10);
  o.initials(p[1],"RP1.electionInitials",d.initials.election,460.1,electionBaseline[d.election as "A"|"B"|"Decline"]);
  for(const [page,key,labelX,sourceY,applies] of [[p[2],"5",460.1,319.439,d.election!=="Decline"],[p[2],"6",460.1,185.139,d.election==="B"],[p[2],"7",460.1,50.839,true],[p[3],"8",460.1,689.139,true],[p[3],"9",460.35,421.339,true],[p[3],"10",460.1,208.539,true]] as const) if(applies)o.initials(page,`RP1.section${key}Initials`,d.initials[key],labelX,SOURCE.height-sourceY);
  d.additionalDrivers.forEach((a,n)=>{
    const top=355.35+n*26;o.cell(p[3],`RP1.additionalDriver${n+1}.name`,a.name,76,top+1,152,24,{lines:2,continuation:true});
    o.cell(p[3],`RP1.additionalDriver${n+1}.licenseState`,[a.license,a.state].filter(Boolean).join(" / "),236,top+1,127,24,{lines:2,continuation:true});
    o.cell(p[3],`RP1.additionalDriver${n+1}.onPolicy`,a.onPolicy?"Y":"N",395,top+1,30,24);
    o.cell(p[3],`RP1.additionalDriver${n+1}.verified`,a.verified?"Yes":"No",457,top+1,78,24);
  });
  await signatureRow(o,p[4],input,"renterSignature",d.renterName,start,255.4);
  await signatureRow(o,p[4],input,"representativeSignature",d.representativeName,start,302);
  // RP2 e1: same renter/cardholder may e-sign with acknowledgment; a different
  // cardholder's digital image is never used on the cardholder line.
  const daily=d.election==="A"?input.rates.optionA:d.election==="B"?input.rates.optionB:0;
  grid(o,p[5],0,141.75,"RP2.renter",d.renterName,"RP2.claim",d.claimNumber);
  grid(o,p[5],1,141.75,"RP2.vehiclePlate",`${input.vehicle.ymm} / ${input.vehicle.plate}`,"RP2.pickup",start);
  grid(o,p[5],2,141.75,"RP2.option",d.election,"RP2.dailyRate",money(daily));
  o.cell(p[5],"RP2.cardholder",d.payment.cardholderName,186,230.55,116,29,{lines:2,continuation:true});
  o.cell(p[5],"RP2.zip",d.payment.zip,410,230.55,126,29);
  grid(o,p[5],0,260.65,"RP2.billingAddress",d.payment.billingAddress,"RP2.phone",d.payment.phone,19);
  grid(o,p[5],1,260.65,"RP2.cardType",d.payment.cardType,"RP2.lastFour",d.payment.lastFour,19,false,false);
  grid(o,p[5],2,260.65,"RP2.expiration",d.payment.expiration,"RP2.relationship",d.payment.relationship,19,false,true);
  grid(o,p[5],0,612.55,"RP2.estimatedDays",d.payment.estimatedDays,"RP2.estimatedDailyRate",money(daily),19,false,false);
  grid(o,p[5],1,612.55,"RP2.estimatedTotal",money(d.payment.estimatedDays*daily),"RP2.chargedWhen",d.payment.chargedWhen,19,false,true);
  o.check(p[6],72.1,57.5,d.payment.isRenter,10);o.check(p[6],72.1,76.6,!d.payment.isRenter,10);
  o.cell(p[6],"RP2.signatureLabel",RENTAL_PDF_AUTHORIZED_REVISIONS.cardholderLabel,72.1,163.2,214,15,{size:8.5});
  o.cell(p[6],"RP2.signatureInstructions",RENTAL_PDF_AUTHORIZED_REVISIONS.signatureInstructions,72.1,183.5,468,40,{lines:3});
  if(d.payment.isRenter && !input.settings.forceInkForRenter && d.payment.authorizationAcknowledged) {
    await signatureRow(o,p[6],input,"renterSignature",d.renterName,start,159.7);
  } else if(input.assets.some(a=>a.kind==="signedPayment")) {
    o.cell(p[6],"RP2.originalInkRecord","Original ink form retained — see signed authorization appendix",74,133,214,26,{lines:2,size:8.5});
    o.cell(p[6],"RP2.cardholderPrintedName",d.payment.cardholderName,307,137,105,21,{lines:2,continuation:true});
    o.cell(p[6],"RP2.inkDate",start,430,141,107,16);
  }
  if(d.payment.authorizationAcknowledged) await signatureRow(o,p[6],input,"renterSignature",d.renterName,start,316.5);
  // Contract has no entered-by or ID-type metadata: leave those cells blank rather than invent facts.
  grid(o,p[6],1,351.15,"RP2.witness",d.payment.witness,"RP2.witnessDate",d.payment.witness?start:"",17.3);
  // Preserve the captured identity facts in RP2's existing unused office-use
  // space, not in a separate routine metadata schedule or the in-vehicle notice.
  for (const [label, field, value, x] of [["Renter date of birth", "RP2.dob", d.dob, 74], ["Driver license expiration", "RP2.licenseExpiration", d.licenseExpiration, 310]] as const) {
    if (!value) continue;
    p[6].drawText(label, { x: pageX(p[6], x), y: pageY(426), size: 8.5, font: o.font, color: BLACK });
    o.cell(p[6], field, value, x, 430, 224, 20);
  }
  d.additionalDrivers.forEach((driver, n) => {
    if (!driver.expiration) return;
    const text = `Additional driver ${n + 1} license expiration: ${driver.expiration}`;
    o.cell(p[6], `RP2.additionalDriver${n + 1}Expiration`, text, 74, 457 + n * 22, 462, 20);
  });
  // RP3 insurer confirmation, with each factual checkbox bound to actual captured metadata.
  [["renter",d.renterName,"claim",d.claimNumber],["insurer",d.insurance.insurer,"policy",d.insurance.policy],["contact",d.insurance.contact,"phone",d.insurance.phone],["verifiedAt",date(d.insurance.verifiedAt,zone,true),"verifiedBy",d.insurance.verifiedBy]].forEach(([lf,lv,rf,rv],n)=>grid(o,p[7],n,141.75,`RP3.${lf}`,lv,`RP3.${rf}`,rv));
  const startDay=d.pickupAt?new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(d.pickupAt)):"";
  const birth=d.dob?new Date(`${d.dob}T00:00:00Z`):undefined;const pickup=d.pickupAt?new Date(d.pickupAt):undefined;
  const adult=Boolean(birth&&pickup&&Number.isFinite(birth.getTime())&&Number.isFinite(pickup.getTime())&&Number(startDay.slice(0,4))-birth.getUTCFullYear()-(startDay.slice(5)<d.dob.slice(5)?1:0)>=25);
  const requirements=adult&&Boolean(d.license&&d.licenseState&&d.licenseExpiration>=startDay)&&input.assets.some(a=>a.kind==="licenseFront")&&input.assets.some(a=>a.kind==="licenseBack");
  const checks:[number,boolean][]=[[253.6,requirements],[270.5,d.payment.holdEntered],[312.1,d.insurance.level==="none"],[329,d.insurance.level==="liability"],[345.9,d.insurance.level==="full"],[387.6,d.insurance.checks.active],[404.5,d.insurance.checks.liability],[435.8,d.insurance.checks.comprehensive],[481.5,d.insurance.checks.additional],[512.8,d.insurance.checks.notRestricted],[568.8,eligibleOptions(d).find(e=>e.option==="Decline")!.allowed],[585.7,!eligibleOptions(d).find(e=>e.option==="Decline")!.allowed]];
  checks.forEach(([top,checked])=>o.check(p[7],72.1,top,checked,10));
  o.cell(p[7],"RP3.limits",d.insurance.limits,122,414.1,80,14,narrative);o.cell(p[7],"RP3.deductible",d.insurance.deductible,282,445.4,78,14,narrative);
  o.cell(p[7],"RP3.notes",d.insurance.notes,74,669,463,36,{lines:3,continuation:true});
  await signatureRow(o,p[7],input,"representativeSignature",d.representativeName,date(d.insurance.verifiedAt,zone)||start,748.1);
  conditionOverlay(o,p[8],input); await conditionSignatures(o,p[8],input);
  // Routine metadata remains in the rental record, not on forced PDF schedules.
  // Only genuine source-cell overflows add referenced continuation pages.
  o.appendContinuations(input); await appendAssets(o,input,false);
  return Buffer.from(await doc.save());
}
async function appendAssets(o:Overlay,input:RentalPacketInput,returnOnly:boolean) {
  // Each scan/photo is evidence, never represented as a substitute for original ink.
  // License front/back remain private verification records, not claimant packet pages.
  const kinds=returnOnly?["returnFront","returnRear","returnDriver","returnPassenger","returnExtra"]:["signedPayment","front","rear","driver","passenger","extra","declarations","coverageConfirmation"];
  const selected=input.assets.filter(a=>kinds.includes(a.kind)).sort((a,b)=>kinds.indexOf(a.kind)-kinds.indexOf(b.kind)||a.id-b.id);
  for(const asset of selected) {
    const page=o.doc.addPage([612,792]);header(page,o.font,asset.kind==="signedPayment"?"SIGNED AUTHORIZATION APPENDIX":"RENTAL EVIDENCE APPENDIX",input);
    const label=`Asset ${asset.id} | ${asset.kind}${asset.createdAt!==undefined?` | ${date(asset.createdAt,input.location.timezone,true)}`:""}`;
    if(o.font.widthOfTextAtSize(label,10)>FRAME_WIDTH)fail("asset.label","exceeds physical margins");
    page.drawText(label,{x:MARGIN,y:702,size:10,font:o.font,color:BLACK});
    if(asset.kind==="signedPayment") {
      page.drawText("Retained-original evidence only. This scan is not an electronic authorization.",{x:MARGIN,y:685,size:10,font:o.font,color:BLACK});
      page.drawText("The original ink form must remain retained; RP2 signature rules are unchanged.",{x:MARGIN,y:670,size:10,font:o.font,color:BLACK});
    }
    const image=await embedGrayImage(o.doc,asset);const imageHeight=asset.kind==="signedPayment"?620:650;const size=image.scaleToFit(FRAME_WIDTH,imageHeight);
    page.drawImage(image,{x:MARGIN+(FRAME_WIDTH-size.width)/2,y:MARGIN+imageHeight-size.height,...size});
  }
}
function chargesStatement(o:Overlay,input:RentalReturnPacketInput) {
  const page=o.doc.addPage([612,792]);header(page,o.font,"RENTAL RETURN CHARGES STATEMENT",input);const c=input.charges;
  const rows:[string,string][]=[
    ["Renter",input.draft.renterName],["Claim",input.draft.claimNumber],["Returned",date(input.returnData.returnedAt,input.location.timezone,true)],
    [`Protection (${c.days} day(s) x ${money(c.daily)})`,money(c.protection)],[`Late return (${c.lateDays} calendar day(s))`,money(c.late)],
    ["Tolls",money(c.tolls)],["Parking",money(c.parking)],["Tickets / citations / fines",money(c.fines)],[`Research / processing (${input.returnData.researchEvents} event(s))`,money(c.research)],
    ["Cleaning / deodorizing (entered actual cost)",money(c.cleaning)],["Renter-caused roadside service (entered cost)",money(c.roadside)],[`Loss of use (${input.returnData.lossOfUseResponsible?input.returnData.lossOfUseDays:0} responsible day(s))`,money(c.lossOfUse)],
    ["Damage automatically charged",money(c.damageAutoCharged)],["TOTAL CALCULATED CHARGES",money(c.total)],["Security hold (not included in total)",money(c.securityHold)],
    ["Charges settled (staff record)",input.returnData.chargesSettled?"Yes":"No"],
  ];let y=697;
  for(const [label,value] of rows) {
    const lines=o.wrap(sanitizeRentalPdfText(value,label),236,10,label);if(lines.length>2||lines.some(l=>o.font.widthOfTextAtSize(l,10)>236))fail(label,"charges statement value exceeds two lines");
    if(o.font.widthOfTextAtSize(label,10)>290)fail(label,"charges statement label exceeds physical column");
    page.drawText(label,{x:MARGIN,y,size:10,font:o.font,color:BLACK});lines.forEach((l,n)=>page.drawText(l,{x:340,y:y-n*12,size:10,font:o.font,color:BLACK}));
    y-=lines.length>1?32:24;
  }
  const notes=[
    input.returnData.chargesSettled?"Hold eligible for release after settlement; release not confirmed by this PDF.":"Hold remains pending settlement; no release is confirmed by this PDF.",
    "Bank timing controls availability after release. No payment or hold action is performed here.",
    "Damage is not automatically charged. Any claim requires notice and its stated basis under RP1/RP2.",
  ];y-=10;
  for(const text of notes)for(const line of o.wrap(text,FRAME_WIDTH,10,"charges.notes")){if(y<MARGIN+10)fail("charges.notes","exceeds physical page");page.drawText(line,{x:MARGIN,y,size:10,font:o.font,color:BLACK});y-=14;}
}
export async function buildRentalReturnPacket(input:RentalReturnPacketInput):Promise<Buffer> {
  rentalReturnSchema.parse(input.returnData);validateTextTree(input.returnData,"returnData");
  if (CONDITION_AREAS.some(area => input.returnData.condition.filter(c => c.area === area).length !== 1)) fail("returnData.condition", "requires exactly one record for each source area");
  const calculated=calculateRentalCharges(input.draft,input.returnData,input.rates,input.location.timezone);
  for(const key of Object.keys(calculated) as (keyof typeof calculated)[]) if(!Number.isFinite(input.charges[key])||input.charges[key]!==calculated[key])fail(`charges.${key}`,"does not match the server calculation");
  const {doc,overlay:o,pages:p}=await sourcePages(input,true);
  o.cell(p[0],"formRevision","e1 owner-approved",430,781,106,14,{size:8.5});
  conditionOverlay(o,p[0],input,input.returnData);await conditionSignatures(o,p[0],input,input.returnData);
  chargesStatement(o,input);o.appendContinuations(input);await appendAssets(o,input,true);
  return Buffer.from(await doc.save());
}
