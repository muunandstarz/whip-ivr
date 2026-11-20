import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  PDFDocument, PDFRawStream, PDFTextField, PDFCheckBox, decodePDFRawStream,
} from "pdf-lib";
import {
  ACORD_FIELDS, ACORD_TEMPLATE_URL, AcordCertificatePdfError, acordCertificateFilename,
  createAcordCertificatePdf, renderAcordCertificatePdf, type AcordCertificateData,
} from "./acordCertificatePdf";

const FICTIONAL: AcordCertificateData = {
  issueDate: "2026-11-19", producerName: "Example Coverage Agency (FICTIONAL)",
  producerAddressLines: ["100 Example Street", "Example City, MD 20000"],
  contactName: "Example Agent", phone: "202-555-0101", fax: "202-555-0102", email: "agent@example.invalid",
  insuredLines: ["Example Fleet LLC (FICTIONAL)", "Example Operator", "200 Fictional Road", "Example City, MD 20000"],
  insurerName: "Example Motor Insurer (FICTIONAL)", naic: "00000", certificateNumber: "DEMO-CERT-ONLY", revisionNumber: "1",
  policyNumber: "DEMO-POLICY-NOT-VALID", effectiveDate: "2026-01-01", expirationDate: "2027-01-01",
  limitBasis: "csl", combinedSingleLimit: "1,000,000", biPerson: "100,000", biAccident: "300,000", propertyDamage: "50,000",
  autoScopes: ["scheduled"], additionalInsured: false, subrogationWaived: false,
  vehicle: "Fictional demonstration vehicle", vin: "DEMO-NOT-A-REAL-VIN", description: "Example commercial auto coverage notes only.",
  holderLines: ["Example Certificate Holder", "300 Fictional Avenue", "Example City, MD 20000"],
  authorizedRepresentative: "Example Authorized Agent / Example Title",
};

const CHECKBOX_KEYS = new Set(["any", "owned", "hired", "scheduled", "nonOwned"]);
/** Portable fixture: named AcroForm fields, matching real widget sizes/positions. */
async function syntheticBlank(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  page.drawText("Synthetic test blank - not the production template", { x: 20, y: 770, size: 8 });
  const form = doc.getForm();
  const geometry: Record<string, [number, number, number, number]> = {
    issueDate: [511, 744, 79, 12], producerName: [22, 648, 280, 12], producerAddress1: [22, 636, 280, 12],
    producerAddress2: [22, 624, 280, 12], producerCity: [22, 612, 216, 12], producerState: [238, 612, 18, 12], producerZip: [256, 612, 46, 12],
    contactName: [346, 660, 244, 12], phone: [353, 648, 126, 12], fax: [518, 648, 72, 12], email: [346, 636, 244, 12],
    insuredName: [72, 588, 230, 12], insuredAddress1: [72, 576, 230, 12], insuredAddress2: [72, 564, 230, 12],
    insuredCity: [72, 552, 166, 12], insuredState: [238, 552, 18, 12], insuredZip: [256, 552, 46, 12],
    insurerName: [349, 612, 187, 12], naic: [544, 612, 46, 12], certificateNumber: [259, 540, 90, 12], revisionNumber: [508, 540, 82, 12],
    autoInsurer: [18, 372, 18, 12], any: [36, 384, 14, 12], owned: [36, 372, 14, 12], hired: [36, 360, 14, 12],
    scheduled: [104, 372, 15, 12], nonOwned: [104, 360, 15, 12], additionalInsured: [176, 372, 18, 12], subrogationWaived: [194, 372, 18, 12],
    policyNumber: [216, 372, 112, 12], effectiveDate: [331, 372, 47, 12], expirationDate: [378, 372, 47, 12],
    combinedSingleLimit: [526, 396, 64, 12], biPerson: [526, 384, 64, 12], biAccident: [526, 372, 64, 12], propertyDamage: [526, 360, 64, 12],
    description: [22, 150, 568, 66], holderName: [72, 90, 230, 12], holderAddress1: [72, 78, 230, 12], holderAddress2: [72, 66, 230, 12],
    holderCity: [72, 54, 166, 12], holderState: [238, 54, 18, 12], holderZip: [256, 54, 46, 12], representative: [310, 48, 280, 24],
  };
  for (const [key, name] of Object.entries(ACORD_FIELDS)) {
    const [x, y, width, height] = geometry[key];
    const field = CHECKBOX_KEYS.has(key) ? form.createCheckBox(name) : form.createTextField(name);
    field.addToPage(page, { x, y, width, height, borderWidth: 0 });
  }
  for (const name of ["GeneralLiability_EachOccurrence_LimitAmount_A", "Policy_GeneralLiability_PolicyNumberIdentifier_A", "Insurer_FullName_B", "Policy_WorkersCompensationAndEmployersLiability_PolicyNumberIdentifier_A", "Policy_ExcessLiability_PolicyNumberIdentifier_A"]) {
    form.createTextField(`F[0].P1[0].${name}[0]`).addToPage(page, { x: 220, y: 250, width: 100, height: 12, borderWidth: 0 });
  }
  return doc.save();
}
function rawStreams(doc: PDFDocument): string[] {
  return doc.context.enumerateIndirectObjects().flatMap(([, object]) => {
    if (!(object instanceof PDFRawStream)) return [];
    try { return [Buffer.from(decodePDFRawStream(object).decode()).toString("latin1")]; } catch { return []; }
  });
}
function textStrings(doc: PDFDocument): string[] {
  return rawStreams(doc).flatMap(stream => [...stream.matchAll(/<([0-9a-f]+)>\s*Tj/gi)].map(match => Buffer.from(match[1], "hex").toString("latin1")));
}
async function render(input: AcordCertificateData = FICTIONAL, options: { draft?: boolean; sample?: boolean; missingDetails?: string[] } = { draft: false }) {
  return renderAcordCertificatePdf(input, { templateBytes: await syntheticBlank(), ...options });
}

describe("ACORD 25 exact-template local renderer", () => {
  it("fills all supplied facts, dates, address lines and CSL only, flattened on one page", async () => {
    const result = await render();
    expect(result.filename).toBe("Example-Motor-Insurer-FICTIONAL-ACORD-25.pdf");
    expect(result.pageCount).toBe(1);
    const doc = await PDFDocument.load(result.bytes);
    expect(doc.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
    expect(doc.getForm().getFields()).toHaveLength(0);
    const text = textStrings(doc);
    for (const value of ["11/19/2026", FICTIONAL.producerName, FICTIONAL.contactName, FICTIONAL.phone, FICTIONAL.email,
      "Example Fleet LLC (FICTIONAL)", "Example Operator", "200 Fictional Road", "Example City", "MD", "20000",
      FICTIONAL.insurerName, "00000", FICTIONAL.certificateNumber, "1", FICTIONAL.policyNumber, "01/01/2026", "01/01/2027", "1,000,000", "A",
      FICTIONAL.authorizedRepresentative]) expect(text).toContain(value);
    expect(text.join("\n")).toContain("VIN: DEMO-NOT-A-REAL-VIN");
    expect(text).not.toContain("100,000"); expect(text).not.toContain("300,000"); expect(text).not.toContain("50,000");
    expect(text).not.toContain("Y");
    expect(text).not.toContain("DRAFT INCOMPLETE");
    expect(doc.getTitle()).toContain("ACORD-25");
    expect(doc.getAuthor()).toBe(FICTIONAL.insurerName);
    // Appearances are explicit readable 8pt and are rectangle-clipped.
    const values = rawStreams(doc).filter(stream => /<312C3030302C303030>\s*Tj/i.test(stream));
    expect(values.length).toBeGreaterThan(0);
    expect(values.every(stream => /\s8\sTf/.test(stream) && /\sW\s/.test(stream))).toBe(true);
  });
  it("uses consecutive original producer name/street/locality widgets, not a detached bottom locality", async () => {
    const blank = await syntheticBlank();
    const setText = vi.spyOn(PDFTextField.prototype, "setText");
    try {
      const result = await renderAcordCertificatePdf({ ...FICTIONAL, producerName: "Whip Claims Management", producerAddressLines: ["14670 Southlawn Ln", "Rockville, MD 20850"], contactName: "Jasmine Lane Acosta" }, { templateBytes: blank, draft: false });
      const assignments = setText.mock.calls.flatMap(([text], index) => text ? [[setText.mock.contexts[index].getName(), text]] : []);
      expect(assignments).toContainEqual([ACORD_FIELDS.producerName, "Whip Claims Management"]);
      expect(assignments).toContainEqual([ACORD_FIELDS.producerAddress1, "14670 Southlawn Ln"]);
      expect(assignments).toContainEqual([ACORD_FIELDS.producerAddress2, "Rockville, MD 20850"]);
      expect(assignments.some(([name]) => [ACORD_FIELDS.producerCity, ACORD_FIELDS.producerState, ACORD_FIELDS.producerZip].includes(name as never))).toBe(false);
      const doc = await PDFDocument.load(result.bytes);
      expect(textStrings(doc)).toContain("Rockville, MD 20850");
      expect(textStrings(doc).filter(text => text === "Jasmine Lane Acosta")).toHaveLength(1);
      expect(result.pageCount).toBe(1);
      expect(result.warnings).toEqual([]);
    } finally { setText.mockRestore(); }
  });
  it("retains a supplied producer suite line and puts long producer addresses in full on a continuation", async () => {
    const suite = await render({ ...FICTIONAL, producerAddressLines: ["100 Example Avenue", "Suite 2", "Rockville, MD 20850"] });
    expect(textStrings(await PDFDocument.load(suite.bytes))).toContain("Suite 2");
    expect(suite.pageCount).toBe(1);
    const addresses = ["100 Example Avenue", "Suite 2", "Building Three", "Department Four", "Rockville, MD 20850"];
    const long = await render({ ...FICTIONAL, producerAddressLines: addresses }, { draft: false, sample: true });
    const text = textStrings(await PDFDocument.load(long.bytes));
    expect(long.pageCount).toBe(2);
    expect(text).toContain("Producer name and address");
    expect(text).toContain("SEE ATTACHED DETAILS");
    addresses.forEach(line => expect(text).toContain(line));
    expect(text.filter(line => line === "SAMPLE - NOT VALID FOR PROOF OF INSURANCE")).toHaveLength(2);
    const tooWide = "100 Example Avenue ".repeat(12);
    const wide = await render({ ...FICTIONAL, producerAddressLines: [tooWide, "Rockville, MD 20850"] });
    expect(textStrings(await PDFDocument.load(wide.bytes)).join("\n").replace(/\s+/g, " ")).toContain(tooWide.trim());
    expect(wide.warnings).toContain("Producer name and address is shown in full on the labelled continuation.");
  });

  it("leaves every unrelated policy row and insurer B blank", async () => {
    const bytes = await syntheticBlank();
    const out = await createAcordCertificatePdf(FICTIONAL, { templateBytes: bytes, draft: false });
    const doc = await PDFDocument.load(out);
    const prefix = "F[0].P1[0].";
    for (const suffix of ["GeneralLiability_EachOccurrence_LimitAmount_A", "Policy_GeneralLiability_PolicyNumberIdentifier_A", "Insurer_FullName_B", "Policy_WorkersCompensationAndEmployersLiability_PolicyNumberIdentifier_A", "Policy_ExcessLiability_PolicyNumberIdentifier_A"]) {
      const field = doc.context.enumerateIndirectObjects().map(([, object]) => object)
        .find(object => String(object).includes(`${suffix}[0]`) && String(object).includes("/FT /Tx"));
      // Flattened form fields may remain unreachable indirect objects, but never have populated values.
      if (field) expect(String(field)).not.toMatch(/\/V\s*<(?!FEFF>)[0-9A-F]+>/);
    }
    expect(textStrings(doc)).not.toContain("100,000");
    expect(doc.getForm().getFields()).toHaveLength(0);
    expect(prefix).toBeTruthy();
  });

  it("fills split limits only and strips the already-printed dollar symbol", async () => {
    const result = await render({ ...FICTIONAL, limitBasis: "split", biPerson: "$100,000", additionalInsured: true, subrogationWaived: true });
    const text = textStrings(await PDFDocument.load(result.bytes));
    expect(text).toContain("100,000"); expect(text).toContain("300,000"); expect(text).toContain("50,000");
    expect(text).not.toContain("1,000,000"); expect(text).not.toContain("$100,000");
    expect(text.filter(value => value === "Y")).toHaveLength(2);
  });

  it("requires explicit policy confirmation for both limit bases", async () => {
    await expect(render({ ...FICTIONAL, limitBasis: "both" })).rejects.toThrow("explicit confirmation");
    const result = await render({ ...FICTIONAL, limitBasis: "both", bothLimitsConfirmed: true });
    const text = textStrings(await PDFDocument.load(result.bytes));
    expect(text).toContain("1,000,000"); expect(text).toContain("100,000");
  });

  it("preserves original content stream and original page geometry", async () => {
    const blank = await syntheticBlank();
    const before = await PDFDocument.load(blank);
    const original = rawStreams(before).filter(stream => stream.includes("53796E746865746963"));
    expect(original).not.toHaveLength(0);
    const out = await createAcordCertificatePdf(FICTIONAL, { templateBytes: blank, draft: false });
    const after = await PDFDocument.load(out);
    original.forEach(stream => expect(rawStreams(after)).toContain(stream));
    expect(after.getPage(0).getMediaBox()).toEqual(before.getPage(0).getMediaBox());
    expect(after.getPage(0).getRotation().angle).toBe(0);
  });

  it("defaults to a visibly incomplete draft with missing details on a labelled attachment", async () => {
    const result = await render({ insuredLines: [], limitBasis: "csl", autoScopes: [] }, { missingDetails: ["Policy provision confirmation pending"] });
    const doc = await PDFDocument.load(result.bytes);
    expect(result.pageCount).toBeGreaterThan(1);
    expect(result.filename).toContain("DRAFT");
    const text = textStrings(doc).join("\n");
    expect(text).toContain("DRAFT INCOMPLETE"); expect(text).toContain("Missing or unconfirmed details:");
    expect(text).toContain("Named insured/operator and address"); expect(text).toContain("Policy provision confirmation pending");
    expect(text).toContain("ACORD 25 - CONTINUATION"); expect(text).toContain("SEE ATTACHED ACORD 25 CONTINUATION");
    expect(textStrings(doc).filter(value => value === "DRAFT INCOMPLETE")).toHaveLength(doc.getPageCount());
  });

  it("does not invent or require an insurer NAIC for explicitly documented self-insurance", async () => {
    const result = await render({ ...FICTIONAL, insurerName: "Example Leasing Corp. — Self-insured", selfInsured: true, naic: "" }, { draft: true });
    const doc = await PDFDocument.load(result.bytes);
    const text = textStrings(doc);
    expect(text.join("\n")).not.toContain("- Insurer NAIC");
    expect(text).not.toContain("00000");
    expect(text.join("\n")).not.toContain("MVA");
    const commercial = await render({ ...FICTIONAL, naic: "", selfInsured: false }, { draft: true });
    expect(textStrings(await PDFDocument.load(commercial.bytes)).join("\n")).toContain("- Insurer NAIC");
  });

  it("puts long identity and description on readable continuations without losing text, with sample marks every page", async () => {
    const longNote = Array.from({ length: 140 }, (_, n) => `Fictional coverage note ${n}: supplied evidence retained in full.`).join("\n");
    const longName = "FICTIONAL-LONG-NAME-".repeat(10);
    const result = await render({ ...FICTIONAL, insuredLines: [longName, "Example Operator", "Line three", "Line four", "Line five"], description: longNote }, { draft: false, sample: true });
    const doc = await PDFDocument.load(result.bytes);
    expect(doc.getPageCount()).toBeGreaterThan(3);
    const text = textStrings(doc);
    const all = text.join("\n");
    expect(all).toContain("Named insured/operator and address"); expect(all).toContain("Line five");
    expect(all.replace(/\n/g, "")).toContain(longName);
    expect(all).toContain("Fictional coverage note 139:");
    expect(all).toContain("Description of operations / locations / vehicles (continued)");
    expect(text.filter(value => value === "SAMPLE - NOT VALID FOR PROOF OF INSURANCE")).toHaveLength(doc.getPageCount());
    expect(result.warnings.every(value => !value.includes("FICTIONAL-LONG-NAME"))).toBe(true);
    expect(doc.getPages().every(p => p.getSize().width === 612 && p.getSize().height === 792)).toBe(true);
    expect(result.filename).toContain("SAMPLE");
    expect(doc.getForm().getFields()).toHaveLength(0);
  });

  it("uses canonical representative text and never manufactures a signature from another contact", async () => {
    const result = await render({ ...FICTIONAL, authorizedRepresentative: "Canonical Example Signer", representativeName: "Ignored Fallback", representativeTitle: "Ignored Title" });
    const text = textStrings(await PDFDocument.load(result.bytes));
    expect(text).toContain("Canonical Example Signer"); expect(text).not.toContain("Ignored Fallback");
    const noSigner = await render({ ...FICTIONAL, authorizedRepresentative: "", representativeName: "", representativeTitle: "" });
    const noSignerDoc = await PDFDocument.load(noSigner.bytes);
    expect(noSignerDoc.getForm().getFields()).toHaveLength(0);
    expect(textStrings(noSignerDoc).filter(t => t === "Example Agent")).toHaveLength(1);
    expect(rawStreams(noSignerDoc).join("\n")).not.toContain("/FT /Sig");
  });

  it("sanitizes filenames without exposing policy numbers or accepting path syntax", () => {
    expect(acordCertificateFilename({ ...FICTIONAL, insurerName: "../../Bad: Insurer / <Test>" }, { draft: false, sample: true })).toBe("Bad-Insurer-Test-ACORD-25-SAMPLE.pdf");
    expect(acordCertificateFilename(FICTIONAL, { draft: false })).not.toContain(FICTIONAL.policyNumber);
  });

  it("fetches only the approved blank, never posts certificate data", async () => {
    const fixture = await syntheticBlank();
    const fetcher = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => fixture });
    await createAcordCertificatePdf(FICTIONAL, { fetchImpl: fetcher, draft: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(ACORD_TEMPLATE_URL, { credentials: "same-origin" });
    const neverFetch = vi.fn();
    await createAcordCertificatePdf(FICTIONAL, { templateBytes: fixture, fetchImpl: neverFetch, draft: false });
    expect(neverFetch).not.toHaveBeenCalled();
  });

  it("reports clean network/CORS, invalid PDF and populated-template errors without leaking facts", async () => {
    for (const fetcher of [vi.fn().mockRejectedValue(new Error("CORS internal URL")), vi.fn().mockResolvedValue({ ok: false })]) {
      await expect(createAcordCertificatePdf(FICTIONAL, { fetchImpl: fetcher })).rejects.toThrow("Certificate data has not been uploaded");
    }
    await expect(createAcordCertificatePdf(FICTIONAL, { templateBytes: new Uint8Array([1, 2, 3]) })).rejects.toThrow("invalid or encrypted");
    const doc = await PDFDocument.load(await syntheticBlank());
    doc.getForm().getTextField(ACORD_FIELDS.policyNumber).setText("PREEXISTING-FICTIONAL-DATA");
    await expect(createAcordCertificatePdf(FICTIONAL, { templateBytes: await doc.save() })).rejects.toThrow("Existing populated certificates cannot be used");
  });

  it("rejects missing field geometry, unsupported categories, bad dates, and unencodable text rather than truncating", async () => {
    const doc = await PDFDocument.create(); doc.addPage([612, 792]);
    await expect(createAcordCertificatePdf(FICTIONAL, { templateBytes: await doc.save() })).rejects.toBeInstanceOf(AcordCertificatePdfError);
    await expect(render({ ...FICTIONAL, autoScopes: ["unsupported" as never] })).rejects.toThrow("supported auto");
    await expect(render({ ...FICTIONAL, issueDate: "2026-02-30" })).rejects.toThrow("valid calendar date");
    await expect(render({ ...FICTIONAL, issueDate: "sometime" })).rejects.toThrow("YYYY-MM-DD");
    await expect(render({ ...FICTIONAL, description: "Cannot silently drop this character: 漢" })).rejects.toThrow("unavailable in Helvetica");
  });
});

// Set ACORD_TEMPLATE_FIXTURE to a local, caller-owned, decrypted blank for integration.
// This never downloads customer PDFs and is not a dependency for portable CI tests.
const actualFixture = process.env.ACORD_TEMPLATE_FIXTURE;
describe.skipIf(!actualFixture)("actual supplied ACORD 25 blank integration", () => {
  it("preserves the exact original form content and flattens fictional facts", async () => {
    const bytes = readFileSync(actualFixture!);
    const before = await PDFDocument.load(bytes);
    const original = rawStreams(before).filter(stream => stream.includes("ACORD") || stream.includes("CERTIFICATE"));
    const widgets = before.getForm().getFields();
    expect(widgets).toHaveLength(128); // 130 map entries include two non-widget hierarchy nodes.
    expect(widgets.filter(f => f instanceof PDFTextField || f instanceof PDFCheckBox)).toHaveLength(128);
    const out = await renderAcordCertificatePdf(FICTIONAL, { templateBytes: bytes, draft: false, sample: true });
    const after = await PDFDocument.load(out.bytes);
    expect(after.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
    expect(after.getPageCount()).toBe(1);
    expect(after.getForm().getFields()).toHaveLength(0);
    original.forEach(stream => expect(rawStreams(after)).toContain(stream));
    expect(textStrings(after)).toContain(FICTIONAL.policyNumber);
    expect(textStrings(after)).toContain("SAMPLE - NOT VALID FOR PROOF OF INSURANCE");
  });
  it("draws normal producer name/street/locality consecutively at the exact supplied widget coordinates", async () => {
    const bytes = readFileSync(actualFixture!);
    const blank = await PDFDocument.load(bytes);
    const originals = new Map(blank.getForm().getFields().filter(field => field instanceof PDFTextField).map(field => [field.getName(), field.acroField.getWidgets()[0].getRectangle()]));
    const drawn: Array<{ name: string; text: string; rect: { x: number; y: number; width: number; height: number } }> = [];
    const update = PDFTextField.prototype.updateAppearances;
    const spy = vi.spyOn(PDFTextField.prototype, "updateAppearances").mockImplementation(function (font, provider) {
      if (this.getText()) drawn.push({ name: this.getName(), text: this.getText()!, rect: this.acroField.getWidgets()[0].getRectangle() });
      return update.call(this, font, provider);
    });
    try {
      const result = await renderAcordCertificatePdf({ ...FICTIONAL, producerName: "Whip Claims Management", producerAddressLines: ["14670 Southlawn Ln", "Rockville, MD 20850"], contactName: "Jasmine Lane Acosta", authorizedRepresentative: "" }, { templateBytes: bytes, draft: false, sample: true });
      expect(drawn).toEqual(expect.arrayContaining([
        { name: ACORD_FIELDS.producerName, text: "Whip Claims Management", rect: { x: 22, y: 648, width: 280, height: 12 } },
        { name: ACORD_FIELDS.producerAddress1, text: "14670 Southlawn Ln", rect: { x: 22, y: 636, width: 280, height: 12 } },
        { name: ACORD_FIELDS.producerAddress2, text: "Rockville, MD 20850", rect: { x: 22, y: 624, width: 280, height: 12 } },
      ]));
      drawn.forEach(({ name, rect }) => expect(rect).toEqual(originals.get(name)));
      const doc = await PDFDocument.load(result.bytes);
      expect(result.pageCount).toBe(1);
      expect(textStrings(doc).filter(text => text === "Jasmine Lane Acosta")).toHaveLength(1);
      expect(textStrings(doc)).not.toContain(FICTIONAL.authorizedRepresentative);
      expect(rawStreams(doc).join("\n")).not.toContain("/FT /Sig");
    } finally { spy.mockRestore(); }
  });
});
