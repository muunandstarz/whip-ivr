import {
  PDFDocument, PDFTextField, PDFCheckBox, StandardFonts, PDFName,
  rgb, degrees, drawText, pushGraphicsState, popGraphicsState, rectangle, clip, endPath,
  type PDFFont, type PDFForm, type PDFPage, type PDFOperator,
} from "pdf-lib";
import type {
  AcordCertificateData, AcordCertificateRenderOptions, AcordCertificatePdfResult,
} from "@shared/acordCertificate";
export type {
  AcordCertificateData, AcordCertificateRenderOptions, AcordCertificatePdfResult,
  AcordAutoScope, AcordLimitBasis,
} from "@shared/acordCertificate";

/** Losslessly decrypted copy of the supplied blank, not a recreated certificate. */
export const ACORD_TEMPLATE_URL = "/manus-storage/acord25-blank-fillable_90c1f001.pdf";
const PREFIX = "F[0].P1[0].";
const named = (name: string) => `${PREFIX}${name}[0]`;
export const ACORD_FIELDS = {
  issueDate: named("Form_CompletionDate_A"),
  producerName: named("Producer_FullName_A"),
  producerAddress1: named("Producer_MailingAddress_LineOne_A"),
  producerAddress2: named("Producer_MailingAddress_LineTwo_A"),
  producerCity: named("Producer_MailingAddress_CityName_A"),
  producerState: named("Producer_MailingAddress_StateOrProvinceCode_A"),
  producerZip: named("Producer_MailingAddress_PostalCode_A"),
  contactName: named("Producer_ContactPerson_FullName_A"),
  phone: named("Producer_ContactPerson_PhoneNumber_A"),
  fax: named("Producer_FaxNumber_A"),
  email: named("Producer_ContactPerson_EmailAddress_A"),
  insuredName: named("NamedInsured_FullName_A"),
  insuredAddress1: named("NamedInsured_MailingAddress_LineOne_A"),
  insuredAddress2: named("NamedInsured_MailingAddress_LineTwo_A"),
  insuredCity: named("NamedInsured_MailingAddress_CityName_A"),
  insuredState: named("NamedInsured_MailingAddress_StateOrProvinceCode_A"),
  insuredZip: named("NamedInsured_MailingAddress_PostalCode_A"),
  insurerName: named("Insurer_FullName_A"),
  naic: named("Insurer_NAICCode_A"),
  certificateNumber: named("CertificateOfInsurance_CertificateNumberIdentifier_A"),
  revisionNumber: named("CertificateOfInsurance_RevisionNumberIdentifier_A"),
  autoInsurer: named("Vehicle_InsurerLetterCode_A"),
  any: named("Vehicle_AnyAutoIndicator_A"),
  owned: named("Vehicle_AllOwnedAutosIndicator_A"),
  hired: named("Vehicle_HiredAutosIndicator_A"),
  scheduled: named("Vehicle_ScheduledAutosIndicator_A"),
  nonOwned: named("Vehicle_NonOwnedAutosIndicator_A"),
  additionalInsured: named("CertificateOfInsurance_AutomobileLiability_AdditionalInsuredCode_A"),
  subrogationWaived: named("Policy_AutomobileLiability_SubrogationWaivedCode_A"),
  policyNumber: named("Policy_AutomobileLiability_PolicyNumberIdentifier_A"),
  effectiveDate: named("Policy_AutomobileLiability_EffectiveDate_A"),
  expirationDate: named("Policy_AutomobileLiability_ExpirationDate_A"),
  combinedSingleLimit: named("Vehicle_CombinedSingleLimit_EachAccidentAmount_A"),
  biPerson: named("Vehicle_BodilyInjury_PerPersonLimitAmount_A"),
  biAccident: named("Vehicle_BodilyInjury_PerAccidentLimitAmount_A"),
  propertyDamage: named("Vehicle_PropertyDamage_PerAccidentLimitAmount_A"),
  description: named("CertificateOfLiabilityInsurance_ACORDForm_RemarkText_A"),
  holderName: named("CertificateHolder_FullName_A"),
  holderAddress1: named("CertificateHolder_MailingAddress_LineOne_A"),
  holderAddress2: named("CertificateHolder_MailingAddress_LineTwo_A"),
  holderCity: named("CertificateHolder_MailingAddress_CityName_A"),
  holderState: named("CertificateHolder_MailingAddress_StateOrProvinceCode_A"),
  holderZip: named("CertificateHolder_MailingAddress_PostalCode_A"),
  representative: named("Producer_AuthorizedRepresentative_Signature_A"),
} as const;

type FieldKey = keyof typeof ACORD_FIELDS;
const SCOPES = ["any", "owned", "scheduled", "hired", "nonOwned"] as const;
const FONT_SIZE = 8; // Same readable size as the actual template; never auto-shrink.
const PAD = 1;
const LINE_HEIGHT = 9.6;
interface Continuation { label: string; text: string }

export class AcordCertificatePdfError extends Error {
  constructor(message: string) { super(message); this.name = "AcordCertificatePdfError"; }
}

function plain(value: unknown): string {
  return String(value ?? "").replace(/\r\n?/g, "\n").replace(/\t/g, " ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}
function lines(value: readonly string[] | undefined): string[] {
  return (value ?? []).flatMap(line => plain(line).split("\n")).filter(Boolean);
}
function date(value: unknown, label: string): string {
  const text = plain(value);
  if (!text) return "";
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (!iso && !us) throw new AcordCertificatePdfError(`${label} must be YYYY-MM-DD or MM/DD/YYYY.`);
  const year = Number(iso ? iso[1] : us![3]);
  const month = Number(iso ? iso[2] : us![1]);
  const day = Number(iso ? iso[3] : us![2]);
  const checked = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || checked.getUTCFullYear() !== year || checked.getUTCMonth() !== month - 1 || checked.getUTCDate() !== day) {
    throw new AcordCertificatePdfError(`${label} must be a valid calendar date.`);
  }
  return `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}/${year}`;
}
function limit(value: unknown): string {
  // The form already prints a dollar symbol. No calculation or conversion of coverage.
  return plain(value).replace(/^\$\s*/, "");
}
function filenamePart(value: unknown): string {
  return plain(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 72) || "Insurer";
}
export function acordCertificateFilename(input: AcordCertificateData, options: Pick<AcordCertificateRenderOptions, "draft" | "sample"> = {}): string {
  return `${filenamePart(input.insurerName)}-ACORD-25${options.draft !== false ? "-DRAFT" : ""}${options.sample ? "-SAMPLE" : ""}.pdf`;
}

/** Word wrapping is measured with the exact embedded Helvetica glyph metrics. */
function wrap(text: string, font: PDFFont, width: number, size: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph) { out.push(""); continue; }
    let current = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) { current = candidate; continue; }
      if (current) { out.push(current); current = ""; }
      if (font.widthOfTextAtSize(word, size) <= width) { current = word; continue; }
      // Break long tokens without removing any character (e.g. a long reference/VIN).
      for (const character of word) {
        if (current && font.widthOfTextAtSize(current + character, size) > width) {
          out.push(current); current = "";
        }
        current += character;
      }
    }
    out.push(current);
  }
  return out;
}

class Fields {
  readonly continuations: Continuation[] = [];
  readonly warnings: string[] = [];
  constructor(readonly form: PDFForm, readonly font: PDFFont) {}
  text(key: FieldKey): PDFTextField { return this.form.getTextField(ACORD_FIELDS[key]); }
  validateText(text: string, label: string): void {
    try { this.font.encodeText(text.replace(/\n/g, " ")); }
    catch { throw new AcordCertificatePdfError(`${label} includes characters unavailable in Helvetica. Use a Latin-script spelling or transliteration; text was not omitted.`); }
  }
  bounds(key: FieldKey) {
    const widgets = this.text(key).acroField.getWidgets();
    if (widgets.length !== 1) throw new AcordCertificatePdfError("The blank template has unexpected field widgets. Please reload the approved blank.");
    const rect = widgets[0].getRectangle();
    if (rect.width <= PAD * 2 || rect.height < 10) throw new AcordCertificatePdfError("The blank template has invalid field geometry.");
    return { width: rect.width - PAD * 2, height: rect.height - PAD * 2 };
  }
  fits(key: FieldKey, text: string, multiline = false): boolean {
    this.validateText(text, "Certificate text");
    const bounds = this.bounds(key);
    const rows = multiline ? wrap(text, this.font, bounds.width, FONT_SIZE) : text.split("\n");
    const textHeight = this.font.heightAtSize(FONT_SIZE);
    return rows.every(row => this.font.widthOfTextAtSize(row, FONT_SIZE) <= bounds.width)
      && textHeight + (rows.length - 1) * LINE_HEIGHT <= bounds.height;
  }
  add(label: string, text: string): void {
    this.validateText(text, label);
    this.continuations.push({ label, text });
    this.warnings.push(`${label} is shown in full on the labelled continuation.`);
  }
  set(key: FieldKey, value: unknown, label: string, multiline = false): void {
    let text = plain(value);
    if (!text) return;
    this.validateText(text, label);
    if (!this.fits(key, text, multiline)) {
      this.add(label, text);
      text = this.fits(key, "SEE ATTACHED") ? "SEE ATTACHED" : this.fits(key, "ATTACHED") ? "ATTACHED" : "";
    }
    this.write(key, text, multiline);
  }
  write(key: FieldKey, text: string, multiline = false): void {
    const field = this.text(key);
    field.disableCombing();
    field.removeMaxLength();
    if (multiline) field.enableMultiline(); else field.disableMultiline();
    field.setText(text);
    field.setFontSize(FONT_SIZE);
    // Draw only within each original widget. No white backgrounds, borders, new geometry,
    // viewer auto-font, or text beyond the template's real rectangle.
    field.updateAppearances(this.font, (_field, widget, font) => {
      const { width, height } = widget.getRectangle();
      const rows = multiline ? wrap(text, font, width - PAD * 2, FONT_SIZE) : [text];
      const ascent = font.heightAtSize(FONT_SIZE, { descender: false });
      const fullHeight = font.heightAtSize(FONT_SIZE);
      const descent = fullHeight - ascent;
      let y = multiline ? height - PAD - ascent : (height - fullHeight) / 2 + descent;
      const ops: PDFOperator[] = [pushGraphicsState(), rectangle(PAD, PAD, width - PAD * 2, height - PAD * 2), clip(), endPath()];
      for (const row of rows) {
        ops.push(...drawText(font.encodeText(row), { font: font.name, size: FONT_SIZE, color: rgb(0, 0, 0),
          rotate: degrees(0), xSkew: degrees(0), ySkew: degrees(0), x: PAD, y }));
        y -= LINE_HEIGHT;
      }
      ops.push(popGraphicsState());
      return ops;
    });
  }
  block(values: readonly string[] | undefined, keys: [FieldKey, FieldKey, FieldKey, FieldKey, FieldKey, FieldKey], label: string, consecutive = false): void {
    const supplied = lines(values);
    if (!supplied.length) return;
    const [first, second, third, city, state, zip] = keys;
    const last = supplied[supplied.length - 1];
    // Parse only an explicit US city/state/ZIP final line; never guess address facts.
    const locality = /^(.+?),?\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/.exec(last);
    const assignments: Array<[FieldKey, string]> = [];
    if (supplied.length <= 4) {
      supplied.forEach((text, index) => {
        // The producer's name/street/locality belong in its three consecutive
        // full-width widgets. Use the lower locality widgets only for a fourth
        // supplied line, avoiding an empty address row without moving geometry.
        if (index === supplied.length - 1 && index > 0 && locality && (!consecutive || index === 3)) {
          assignments.push([city, locality[1].replace(/,$/, "")], [state, locality[2]], [zip, locality[3]]);
        } else assignments.push([[first, second, third, city][index], text]);
      });
    }
    if (supplied.length > 4 || assignments.some(([key, text]) => !this.fits(key, text))) {
      // Keep a full first line only if it fits, then an explicit pointer. Complete original
      // lines are retained, in order, in one clearly named continuation section.
      this.add(label, supplied.join("\n"));
      if (this.fits(first, supplied[0])) this.write(first, supplied[0]);
      this.write(second, "SEE ATTACHED DETAILS");
      return;
    }
    assignments.forEach(([key, text]) => this.write(key, text));
  }
}

async function loadBlank(options: AcordCertificateRenderOptions): Promise<PDFDocument> {
  let bytes: Uint8Array | ArrayBuffer;
  if (options.templateBytes) bytes = options.templateBytes;
  else {
    try {
      const fetcher = options.fetchImpl ?? globalThis.fetch;
      if (!fetcher) throw new Error("No fetch implementation");
      const response = await fetcher(options.templateUrl ?? ACORD_TEMPLATE_URL, { credentials: "same-origin" });
      if (!response.ok) throw new Error("Template unavailable");
      bytes = await response.arrayBuffer();
    } catch {
      throw new AcordCertificatePdfError("The approved ACORD blank could not be loaded. Check your connection or template access, then retry. Certificate data has not been uploaded.");
    }
  }
  let document: PDFDocument;
  try { document = await PDFDocument.load(bytes, { updateMetadata: false }); }
  catch {
    throw new AcordCertificatePdfError("The ACORD template is invalid or encrypted. Use the approved browser-compatible blank; certificate data has not been uploaded.");
  }
  if (document.getPageCount() !== 1 || document.getPage(0).getWidth() !== 612 || document.getPage(0).getHeight() !== 792) {
    throw new AcordCertificatePdfError("The approved one-page Letter-size ACORD blank is required.");
  }
  const form = document.getForm(); // Removes unsupported XFA; the supplied AcroForm is retained.
  try {
    for (const key of Object.keys(ACORD_FIELDS) as FieldKey[]) {
      const field = form.getField(ACORD_FIELDS[key]);
      if (SCOPES.includes(key as (typeof SCOPES)[number])) {
        if (!(field instanceof PDFCheckBox)) throw new Error("Wrong field type");
      } else if (!(field instanceof PDFTextField)) throw new Error("Wrong field type");
    }
    for (const field of form.getFields()) {
      if (field instanceof PDFTextField && plain(field.getText())) throw new Error("Populated template");
      if (field instanceof PDFCheckBox && field.isChecked()) throw new Error("Populated template");
    }
  } catch {
    throw new AcordCertificatePdfError("The template is not the approved empty ACORD fillable blank. Existing populated certificates cannot be used as templates.");
  }
  // Blank widgets have old appearance resources. Refresh only empty text/checkbox
  // appearances with Helvetica so flattening cannot resurrect unrelated values.
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (const field of form.getFields()) {
    if (field instanceof PDFTextField) {
      // The supplied template uses a literal escaped '\057F1' default appearance
      // which pdf-lib cannot parse as a Tf operator. Normalize only that appearance.
      field.acroField.setDefaultAppearance(`/${font.name} ${FONT_SIZE} Tf 0 g`);
      field.setText(""); field.setFontSize(FONT_SIZE);
      field.updateAppearances(font, () => []);
    } else if (field instanceof PDFCheckBox) { field.uncheck(); field.updateAppearances(); }
  }
  return document;
}

function draftDetails(input: AcordCertificateData, supplied: string[] | undefined): string[] {
  const missing: string[] = [];
  const required: Array<[string, boolean]> = [
    ["Named insured/operator and address", lines(input.insuredLines).length >= 2],
    ["Producer name and address", !!plain(input.producerName) && lines(input.producerAddressLines).length > 0],
    ["Producer contact", !!plain(input.contactName) && !!plain(input.phone)],
    ["Insurer name", !!plain(input.insurerName)], ["Insurer NAIC", input.selfInsured === true || !!plain(input.naic)],
    ["Policy number", !!plain(input.policyNumber)], ["Policy effective date", !!plain(input.effectiveDate)],
    ["Policy expiration date", !!plain(input.expirationDate)], ["Certificate issue date", !!plain(input.issueDate)],
    ["Auto coverage categories", input.autoScopes.length > 0],
    ["Certificate holder and address", lines(input.holderLines).length >= 2],
    ["Authorized representative", !!plain(input.authorizedRepresentative || input.representativeName)],
  ];
  if (input.limitBasis !== "split") required.push(["Combined single limit", !!plain(input.combinedSingleLimit)]);
  if (input.limitBasis !== "csl") required.push(["Split liability limits", !!plain(input.biPerson) && !!plain(input.biAccident) && !!plain(input.propertyDamage)]);
  required.forEach(([label, present]) => { if (!present) missing.push(label); });
  return Array.from(new Set([...missing, ...(supplied ?? []).map(plain).filter(Boolean)]));
}

function appendContinuations(document: PDFDocument, font: PDFFont, bold: PDFFont, sections: Continuation[], input: AcordCertificateData): void {
  if (!sections.length) return;
  const width = 516, left = 48, bottom = 66, lineHeight = 14;
  let page: PDFPage;
  let y = 0;
  let part = 0;
  const newPage = () => {
    page = document.addPage([612, 792]); part++;
    page.drawText("ACORD 25 - CONTINUATION", { x: left, y: 744, size: 15, font: bold });
    page.drawText(`Attached to the supplied ACORD 25 (2016/03). Continuation ${part}.`, { x: left, y: 724, size: 9, font });
    const number = plain(input.certificateNumber);
    const referenceLabel = !number ? "Certificate number not supplied"
      : font.widthOfTextAtSize(`Certificate: ${number.replace(/\n/g, " ")}`, 9) <= 280
        ? `Certificate: ${number.replace(/\n/g, " ")}` : "Certificate number: see attached full details";
    const reference = [referenceLabel,
      plain(input.issueDate) ? `Issue date: ${date(input.issueDate, "Certificate issue date")}` : "Issue date not supplied"].join(" | ");
    const referenceLines = wrap(reference, font, width, 9);
    let refY = 708;
    referenceLines.forEach(line => { page.drawText(line, { x: left, y: refY, size: 9, font }); refY -= 12; });
    page.drawLine({ start: { x: left, y: refY - 2 }, end: { x: 564, y: refY - 2 }, thickness: 0.6, color: rgb(0.5, 0.5, 0.5) });
    y = refY - 25;
    page.drawText("Continuation only. This attachment does not amend, extend, or alter coverage.", { x: left, y: 46, size: 8, font });
  };
  newPage();
  for (const section of sections) {
    if (y - 42 < bottom) newPage();
    page!.drawText(section.label, { x: left, y, size: 11, font: bold }); y -= 18;
    for (const line of wrap(section.text, font, width, 10)) {
      if (y < bottom) {
        newPage(); page!.drawText(`${section.label} (continued)`, { x: left, y, size: 11, font: bold }); y -= 18;
      }
      page!.drawText(line, { x: left, y, size: 10, font }); y -= lineHeight;
    }
    y -= 14;
  }
  const total = document.getPageCount();
  document.getPages().slice(1).forEach((p, index) => {
    p.drawText(`Page ${index + 2} of ${total}`, { x: 493, y: 30, size: 8, font });
  });
}

function watermarks(document: PDFDocument, font: PDFFont, draft: boolean, sample: boolean): void {
  for (const page of document.getPages()) {
    if (draft) page.drawText("DRAFT INCOMPLETE", { x: 95, y: 253, size: 39, font, rotate: degrees(35), color: rgb(0.75, 0.05, 0.05), opacity: 0.2 });
    if (sample) page.drawText("SAMPLE - NOT VALID FOR PROOF OF INSURANCE", { x: 57, y: draft ? 218 : 290, size: 19, font, rotate: degrees(35), color: rgb(0.62, 0.03, 0.03), opacity: 0.28 });
  }
}

/** Fills the exact blank locally; only the blank download uses the network. */
export async function renderAcordCertificatePdf(input: AcordCertificateData, options: AcordCertificateRenderOptions = {}): Promise<AcordCertificatePdfResult> {
  if (!["csl", "split", "both"].includes(input.limitBasis)) throw new AcordCertificatePdfError("Choose a combined single limit or split liability limits.");
  if (input.limitBasis === "both" && input.bothLimitsConfirmed !== true) throw new AcordCertificatePdfError("Both limit types require explicit confirmation from actual policy documentation.");
  if (!Array.isArray(input.autoScopes) || input.autoScopes.some(scope => !SCOPES.includes(scope))) throw new AcordCertificatePdfError("Choose only supported auto coverage categories.");
  const document = await loadBlank(options);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const f = new Fields(document.getForm(), font);
  f.set("issueDate", date(input.issueDate, "Certificate issue date"), "Certificate issue date");
  f.block([plain(input.producerName), ...lines(input.producerAddressLines)], ["producerName", "producerAddress1", "producerAddress2", "producerCity", "producerState", "producerZip"], "Producer name and address", true);
  f.block(input.insuredLines, ["insuredName", "insuredAddress1", "insuredAddress2", "insuredCity", "insuredState", "insuredZip"], "Named insured/operator and address");
  f.block(input.holderLines, ["holderName", "holderAddress1", "holderAddress2", "holderCity", "holderState", "holderZip"], "Certificate holder and address");
  for (const [key, label] of [["contactName", "Producer contact name"], ["phone", "Producer phone"], ["fax", "Producer fax"], ["email", "Producer email"],
    ["insurerName", "Insurer A name"], ["naic", "Insurer A NAIC"], ["certificateNumber", "Certificate number"], ["revisionNumber", "Revision number"], ["policyNumber", "Auto policy number"]] as const) f.set(key, input[key], label);
  if (plain(input.insurerName)) f.set("autoInsurer", "A", "Auto insurer letter");
  f.set("effectiveDate", date(input.effectiveDate, "Policy effective date"), "Policy effective date");
  f.set("expirationDate", date(input.expirationDate, "Policy expiration date"), "Policy expiration date");
  for (const scope of SCOPES) if (input.autoScopes.includes(scope)) f.form.getCheckBox(ACORD_FIELDS[scope]).check();
  if (input.additionalInsured === true) f.set("additionalInsured", "Y", "Auto additional insured provision");
  if (input.subrogationWaived === true) f.set("subrogationWaived", "Y", "Auto waiver of subrogation provision");
  if (input.limitBasis !== "split") f.set("combinedSingleLimit", limit(input.combinedSingleLimit), "Combined single limit");
  if (input.limitBasis !== "csl") {
    f.set("biPerson", limit(input.biPerson), "Bodily injury per person");
    f.set("biAccident", limit(input.biAccident), "Bodily injury per accident");
    f.set("propertyDamage", limit(input.propertyDamage), "Property damage per accident");
  }
  const representative = plain(input.authorizedRepresentative) || [plain(input.representativeName), plain(input.representativeTitle)].filter(Boolean).join("\n");
  f.set("representative", representative, "Authorized representative (typed text only)", true);
  const notes = [plain(input.vehicle) ? `Vehicle: ${plain(input.vehicle)}` : "", plain(input.vin) ? `VIN: ${plain(input.vin)}` : "", plain(input.description), plain(input.endorsementNotes)].filter(Boolean).join("\n");
  f.validateText(notes, "Vehicle and coverage description");
  if (notes && !f.fits("description", notes, true)) f.add("Description of operations / locations / vehicles", notes);
  const draft = options.draft !== false;
  if (draft) {
    const missing = draftDetails(input, options.missingDetails);
    const text = "DRAFT INCOMPLETE - NOT VALID FOR PROOF OF INSURANCE.\nThis locally prepared draft does not issue insurance, verify policy facts, or create a digital signature."
      + (missing.length ? `\nMissing or unconfirmed details:\n${missing.map(item => `- ${item}`).join("\n")}` : "\nNo required fields appear empty. Policy facts, provisions, and representative authority still require issuer verification.");
    f.add("Draft status and missing-details information", text);
  }
  let formNotes = notes && f.fits("description", notes, true) ? notes : "";
  if (f.continuations.length) {
    const pointer = "SEE ATTACHED ACORD 25 CONTINUATION FOR FULL DETAILS.";
    const combined = [formNotes, pointer].filter(Boolean).join("\n");
    if (f.fits("description", combined, true)) formNotes = combined;
    else {
      if (formNotes) f.add("Description of operations / locations / vehicles", formNotes);
      formNotes = pointer;
    }
  }
  if (formNotes) f.write("description", formNotes, true);
  // Empty unrelated policy sections remain blank. Flatten for consistent rendering
  // and remove any editable fields or unsupported XFA payload from the export.
  f.form.updateFieldAppearances(font);
  f.form.flatten({ updateFieldAppearances: false });
  document.catalog.delete(PDFName.of("AcroForm"));
  appendContinuations(document, font, bold, f.continuations, input);
  watermarks(document, bold, draft, options.sample === true);
  const insurer = plain(input.insurerName).replace(/\s+/g, " ");
  document.setTitle(`${insurer ? `${insurer} - ` : ""}ACORD-25 Certificate of Liability Insurance${draft ? " - DRAFT INCOMPLETE" : ""}${options.sample ? " - SAMPLE" : ""}`);
  document.setSubject("ACORD 25 (2016/03), populated from supplied facts. Certificate does not amend, extend, or alter coverage.");
  document.setAuthor(insurer || "Certificate preparer");
  document.setCreator("ACORD-25 local certificate form builder");
  document.setProducer("pdf-lib - exact supplied ACORD template");
  document.setKeywords(["ACORD-25", "Certificate of Liability Insurance", ...(draft ? ["DRAFT INCOMPLETE"] : []), ...(options.sample ? ["SAMPLE"] : [])]);
  // Original template XML metadata can retain stale titles/authors; use only the
  // newly set, generic/supplied document-info metadata instead.
  document.catalog.delete(PDFName.of("Metadata"));
  document.setModificationDate(new Date());
  return { bytes: await document.save(), filename: acordCertificateFilename(input, options), pageCount: document.getPageCount(), warnings: f.warnings };
}

export async function createAcordCertificatePdf(input: AcordCertificateData, options: AcordCertificateRenderOptions = {}): Promise<Uint8Array> {
  return (await renderAcordCertificatePdf(input, options)).bytes;
}
