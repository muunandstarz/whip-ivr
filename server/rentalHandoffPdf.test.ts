import { afterAll, describe, expect, it, vi } from "vitest";
import { PDFDocument, PDFRawStream, decodePDFRawStream, PDFName, PDFArray } from "pdf-lib";
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { emptyRentalDraft, DEFAULT_RENTAL_RATES, calculateRentalCharges, CONDITION_AREAS, PICKUP_EVIDENCE_KINDS, RETURN_EVIDENCE_KINDS, type RentalReturn } from "../shared/rentalHandoff";
import { rentalAgreementSections, rentalAgreementCoverageChart } from "../shared/rentalAgreement";
import { buildRentalPacket, buildRentalReturnPacket, sanitizeRentalPdfText, loadRentalPdfTemplates, RENTAL_PDF_TEMPLATE_KEYS, RENTAL_PDF_AUTHORIZED_REVISIONS, RENTAL_PDF_FILL_LIMITS, type RentalPacketInput, type RentalPdfTemplates } from "./rentalHandoffPdf";
vi.mock("./storage", () => ({ storageGetSignedUrl: vi.fn() }));
import { storageGetSignedUrl } from "./storage";

const sources = {
  packet: process.env.RENTAL_PACKET_TEMPLATE_PATH ?? "/home/ubuntu/upload/ClaimantRentalPacket-DRAFTv7.pdf",
  vehicleInformation: process.env.RENTAL_VEHICLE_TEMPLATE_PATH ?? "/home/ubuntu/upload/RentalVehicleInformationPage-DRAFT.pdf",
};
const originalsAvailable = existsSync(sources.packet) && existsSync(sources.vehicleInformation);
const temp = mkdtempSync(join(tmpdir(), "rental-pdf-test-")); afterAll(() => rmSync(temp, { recursive: true, force: true }));
const outputDirectory = process.env.RENTAL_PDF_SAMPLE_DIR;
function templates(): RentalPdfTemplates { return { packet: readFileSync(sources.packet), vehicleInformation: readFileSync(sources.vehicleInformation) }; }
function extract(bytes: Buffer, name = "packet"): string[] {
  const path = join(temp, `${name}.pdf`); writeFileSync(path, bytes);
  return execFileSync("pdftotext", ["-layout", path, "-"], { encoding: "utf8" }).split("\f").filter(s => s.trim());
}
function originalText(): string[] {
  return [execFileSync("pdftotext", ["-layout", sources.vehicleInformation, "-"], { encoding: "utf8" }), ...execFileSync("pdftotext", ["-layout", sources.packet, "-"], { encoding: "utf8" }).split("\f").filter(s => s.trim())];
}
const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
function image(color = "black"): Buffer {
  const req = createRequire(import.meta.url); const decoder = createRequire(req.resolve("pdf-parse"));
  const { createCanvas } = decoder("@napi-rs/canvas"); const canvas = createCanvas(120, 25); const context = canvas.getContext("2d");
  // Synthetic solid test signature, not a person's signature or claim evidence.
  context.fillStyle = color; context.fillRect(10, 10, 80, 3); return canvas.toBuffer("image/png");
}
function fixture(): RentalPacketInput {
  const d = emptyRentalDraft(); Object.assign(d, { renterName: "Alex Example", mobile: "555-0100", email: "renter@example.invalid", claimEmail: "claim@example.invalid", claimNumber: "SYNTHETIC-001", locationId: 1, vehicleId: 1, scheduledPickup: "2026-11-10T15:00:00Z", expectedReturn: "2026-11-12T15:00:00Z", pickupAt: "2026-11-10T15:00:00Z", renterVehicleYmm: "2020 Sedan", renterVehicleVin: "1HGCM82633A004352", renterVehiclePlate: "SAMPLE1", odometerOut: 12345, dob: "1980-01-01", license: "D1234567", licenseState: "MD", licenseExpiration: "2030-01-01", election: "A", initials: { election: "AE", "5": "AE", "6": "NOTSIX", "7": "AE", "8": "AE", "9": "AE", "10": "AE" }, representativeName: "Pat Example", condition: CONDITION_AREAS.map(area => ({ area, ok: true, note: "" })) });
  Object.assign(d.insurance, { level: "liability", insurer: "Example Insurance", policy: "SYNTHETIC-POLICY", contact: "Insurer Example", phone: "555-0101", verifiedBy: "Pat Example", verifiedAt: "2026-11-10T14:55:00Z", limits: "100/300", notes: "Synthetic example only." });
  Object.assign(d.payment, { cardholderName: d.renterName, billingAddress: "100 Example St", zip: "20850", phone: "555-0100", cardType: "Visa", lastFour: "4242", expiration: "01/30", relationship: "Renter", estimatedDays: 2, holdEntered: true, witness: "Pat Example", photoIdChecked: true, authorizationAcknowledged: true });
  return { rentalId: 1, version: 1, draft: d, vehicle: { id: 1, locationId: 1, ymm: "2024 Toyota Camry", vin: "1HGCM82633A004352", plate: "SAMPLE2 / MD", lastOdometer: 12345, status: "Available" }, location: { id: 1, name: "Example Shop", address: "100 Example St", phone: "555-0102", timezone: "America/New_York", active: true }, rates: { ...DEFAULT_RENTAL_RATES }, assets: [], settings: { counselApproved: true, registrationConfirmed: false, financialResponsibilityReference: "", omitFinancialReference: true, retentionYears: 7, senderEmail: "rental@example.invalid", emailProviderReady: true, rates: { ...DEFAULT_RENTAL_RATES }, rateVersion: 1 }, templates: templates() };
}
function fittingFixture(): RentalPacketInput {
  const input = fixture(); input.vehicle.ymm = "2024 Camry"; input.vehicle.plate = "DEMO / MD";
  input.draft.payment.chargedWhen = "At return";
  return input;
}
function returned(): RentalReturn { return { returnedAt: "2026-11-12T16:00:00Z", odometer: 12400, fuel: "3/4", condition: CONDITION_AREAS.map(area => ({ area, ok: true, note: "" })), noticeAt: "2026-11-11T15:00:00Z", tolls: 12.34, parking: 5, fines: 0, researchEvents: 1, cleaning: 10, roadside: 0, lossOfUseDays: 0, lossOfUseResponsible: false, damageNoticeNotes: "No damage claim entered in this synthetic example.", notes: "Synthetic return only.", chargesSettled: false, representativeName: "Return Example" }; }
async function rawPage(page: any) {
  const contents = page.node.Contents(); const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  return refs.map((ref: any) => Buffer.from(decodePDFRawStream(page.doc.context.lookup(ref) as PDFRawStream).decode()).toString("latin1")).join("\n");
}
function saveSample(name: string, bytes: Buffer) { if (outputDirectory) { mkdirSync(outputDirectory, { recursive: true }); writeFileSync(join(outputDirectory, name), bytes); } }
type WordBox = { text: string; left: number; top: number; right: number; bottom: number };
function wordBoxes(bytes: Buffer, name: string): WordBox[][] {
  const path = join(temp, `${name}-geometry.pdf`); writeFileSync(path, bytes);
  const xml = execFileSync("pdftotext", ["-bbox", path, "-"], { encoding: "utf8" });
  return [...xml.matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/g)].map(page =>
    [...page[1].matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)].map(w =>
      ({ text: w[5], left: Number(w[1]), top: Number(w[2]), right: Number(w[3]), bottom: Number(w[4]) })));
}
function expectPrintFrame(pages: WordBox[][]) {
  for (const [n, words] of pages.entries()) {
    expect(words.length, `page ${n + 1} has searchable text`).toBeGreaterThan(0);
    // Test ACTUAL final content, not just the media box or outer cm operator.
    expect(Math.min(...words.map(w => w.left)), `page ${n + 1} left edge`).toBeGreaterThanOrEqual(36);
    expect(Math.min(...words.map(w => w.left)), `page ${n + 1} uses half-inch left frame`).toBeLessThan(37);
    expect(Math.min(...words.map(w => w.top)), `page ${n + 1} top edge`).toBeGreaterThanOrEqual(36);
    expect(Math.max(...words.map(w => w.right)), `page ${n + 1} right edge`).toBeLessThanOrEqual(576);
    expect(Math.max(...words.map(w => w.bottom)), `page ${n + 1} bottom edge`).toBeLessThanOrEqual(756);
  }
}
function textPayloads(stream: string) {
  // Coordinates may change; every original glyph string, font size and TJ
  // kerning operand must remain byte-for-byte, except the five approved blocks.
  return (stream.match(/BT\s[\s\S]*?ET/g) ?? []).map(block => block
    .replace(/[\d.-]+ [\d.-]+ Td/g, "")
    .replace(/[\d.-]+ [\d.-]+ [\d.-]+ [\d.-]+ [\d.-]+ [\d.-]+ Tm/g, "")
    .replace(/\s+/g, " ").trim());
}

describe("rental PDF input text validation", () => {
  it("sanitizes NUL but rejects unsupported Unicode and controls visibly", () => {
    expect(sanitizeRentalPdfText("Alex\0 Example")).toBe("Alex Example");
    expect(() => sanitizeRentalPdfText("Example 漢")).toThrow(/unsupported/);
    expect(() => sanitizeRentalPdfText("a\u0001b")).toThrow(/control/);
    expect(sanitizeRentalPdfText("Renée — Example")).toBe("Renée — Example");
  });
  it("exposes all measurable limits and the continuation policy", () => {
    expect(RENTAL_PDF_FILL_LIMITS.margin).toBe(36); expect(RENTAL_PDF_FILL_LIMITS.fieldFontPoints).toBe(10);
    expect(RENTAL_PDF_FILL_LIMITS.initials.labelGapPoints).toBe(4);
    expect(RENTAL_PDF_FILL_LIMITS.overflowPolicy).toMatch(/throw/);
  });
  it("provides all 13 original RP1 sections and the exact seven-row coverage chart", () => {
    expect(rentalAgreementSections.map(s => s.number)).toEqual(Array.from({ length: 13 }, (_, n) => n + 1));
    expect(rentalAgreementSections[2].text).toContain("Liability Protection"); expect(rentalAgreementCoverageChart.rows).toHaveLength(7);
    expect(rentalAgreementSections[4].text).toContain("The Damage Waiver is not insurance.");
  });
});

describe.skipIf(!originalsAvailable)("rental PDF exact-original integration", () => {
  it("keeps nine base pages in RP0/RP1/RP2/RP3/RP4 order, Letter, exact text except approved e1 zones", async () => {
    const bytes = await buildRentalPacket(fixture()); saveSample("synthetic-handoff.pdf", bytes);
    const pages = extract(bytes); const doc = await PDFDocument.load(bytes); expect(doc.getPageCount()).toBe(10);
    for (const page of doc.getPages()) expect(page.getSize()).toEqual({ width: 612, height: 792 });
    const titles = ["RENTAL VEHICLE INFORMATION", "RENTAL PROTECTION ELECTION AND DAMAGE WAIVER", "3. What each option covers", "8. Roadside assistance and towing", "12. Return of the Rental Vehicle", "RENTAL PAYMENT AUTHORIZATION", "4. Authorization and signature", "COVERAGE VERIFICATION WORKSHEET", "RENTAL VEHICLE CONDITION REPORT"];
    titles.forEach((title, n) => expect(normalize(pages[n])).toContain(title));
    const original = originalText();
    for (let n = 0; n < 9; n++) {
      let clean = original[n];
      if (n === 0) clean = clean.replace("A copy of the registration is kept with this page in the vehicle.", "");
      if (n === 6) clean = clean.replace("Cardholder signature (original ink only)", "").replace(/Electronic, typed, stamped, photographed, faxed or e-mailed signatures are not accepted\.[\s\S]*?form of payment\./, "");
      for (const line of clean.split("\n").filter(s => s.trim())) {
        // Original labels sharing a row are compared individually because new values occupy the inter-label whitespace.
        for (const segment of line.trim().split(/ {3,}/)) expect(normalize(pages[n]), `page ${n + 1}: ${segment}`).toContain(normalize(segment));
      }
    }
    expect(pages.join(" ")).not.toMatch(/Whip|Klutch/i);
    expect(normalize(pages[0])).toContain(RENTAL_PDF_AUTHORIZED_REVISIONS.registration);
    expect(pages[0]).not.toContain("A copy of the registration");
    expect(normalize(pages[6])).toContain(RENTAL_PDF_AUTHORIZED_REVISIONS.signatureInstructions);
    expect(pages[6]).not.toContain("Electronic, typed, stamped");
    expect(pages[2]).not.toContain("NOTSIX");
    const originalStreams = await rawPage(doc.getPage(1));
    expect(originalStreams).not.toContain("0.839378");
    // Counter-transform each text matrix; source 10.5pt body is neither stretched
    // to fake narrow margins nor shrunk to the former 8.81pt print typography.
    expect(originalStreams).toContain("/F1 10.5 Tf");
    const sourceMatrix = originalStreams.match(/([\d.]+) 0 0 ([\d.]+) 72\.1 [\d.]+ Tm/);
    expect(sourceMatrix).not.toBeNull();
    expect(Number(sourceMatrix![1])).toBeCloseTo(469 / 540, 12);
    expect(Number(sourceMatrix![2])).toBeCloseTo(773 / 720, 12);
    const path = join(temp,"margins.pdf"); writeFileSync(path,bytes);
    const bbox = execFileSync("pdftotext",["-bbox",path,"-"],{encoding:"utf8"});
    for(const word of bbox.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)"/g)) {
      expect(Number(word[1])).toBeGreaterThanOrEqual(36);expect(Number(word[2])).toBeGreaterThanOrEqual(36);
      expect(Number(word[3])).toBeLessThanOrEqual(576);expect(Number(word[4])).toBeLessThanOrEqual(756);
    }
  });
  it("keeps each protection body beside its bold lead at the approved space and preserves every election word", async () => {
    const source = wordBoxes(Buffer.from(templates().packet), "approved-options")[0];
    const bytes = await buildRentalPacket(fittingFixture()); const output = wordBoxes(bytes, "aligned-options")[1];
    const starts = (words: WordBox[]) => words.filter(w => ["For", "Only"].includes(w.text));
    const sourceStarts = starts(source); const outputStarts = starts(output);
    expect(sourceStarts).toHaveLength(3); expect(outputStarts).toHaveLength(3);
    for (const [n, start] of outputStarts.entries()) {
      const previous = (words: WordBox[], body: WordBox) => words.filter(w => Math.abs(w.top - body.top) < 0.1 && w.right <= body.left).sort((a, b) => b.right - a.right)[0];
      const lead = previous(output, start); const sourceLead = previous(source, sourceStarts[n]);
      expect(start.left - lead.right).toBeCloseTo(sourceStarts[n].left - sourceLead.right, 3);
      expect(start.left - lead.right).toBeGreaterThan(2); expect(start.left - lead.right).toBeLessThan(4);
      expect(start.top).toBeCloseTo(lead.top, 3); expect(start.bottom - start.top).toBeCloseTo(sourceStarts[n].bottom - sourceStarts[n].top, 3);
    }
    const electionWords = (words: WordBox[]) => {
      const first = words.find(w => w.text === "Option")!.top;
      const end = words.filter(w => w.text === "Initials").sort((a, b) => b.top - a.top)[0].bottom;
      return words.filter(w => w.top >= first - 0.1 && w.bottom <= end + 0.1 && !["AE", "Initials"].includes(w.text) && !/^[\u2610\u2612]$/.test(w.text)).map(w => w.text);
    };
    expect(electionWords(output)).toEqual(electionWords(source));
    const doc = await PDFDocument.load(bytes); const raw = await rawPage(doc.getPage(1));
    // All three original selectable checkbox glyphs and the one selected X survive.
    expect((raw.match(/\/F3 13 Tf<01>Tj/g) ?? [])).toHaveLength(3);
    expect((raw.match(/0\.8 w/g) ?? [])).toHaveLength(2);
  });
  it("exports only nine base pages when fields fit, retaining routine metadata in the unmodified record", async () => {
    const input = fittingFixture(); input.draft.staffNote = "Private routine staff note remains in record.";
    const before = structuredClone(input.draft); const bytes = await buildRentalPacket(input); saveSample("synthetic-normal-handoff.pdf", bytes);
    const doc = await PDFDocument.load(bytes); const pages = extract(bytes, "normal-no-metadata");
    expect(doc.getPageCount()).toBe(9); expect(pages).toHaveLength(9); expect(input.draft).toEqual(before);
    expect(pages.join(" ")).not.toContain("RENTAL FIELD CONTINUATION SCHEDULE");
    expect(normalize(pages[6])).toContain(`Renter date of birth Driver license expiration ${input.draft.dob} ${input.draft.licenseExpiration}`);
    for (const text of [input.draft.email, input.draft.claimEmail, input.draft.staffNote, "Cardholder photo ID checked", "Security hold entered", "Payment acknowledgment"]) expect(pages.join(" ")).not.toContain(text);
    expectPrintFrame(wordBoxes(bytes, "normal-frame"));
  });
  it("retains both additional-driver license expirations on the existing page without an added schedule", async () => {
    const input = fittingFixture();
    input.draft.additionalDrivers = [{ name: "Dana Example", license: "D100", state: "MD", expiration: "2029-01-02", onPolicy: true, verified: true }, { name: "Lee Example", license: "D200", state: "MD", expiration: "2029-03-04", onPolicy: true, verified: true }];
    const before = structuredClone(input.draft); const bytes = await buildRentalPacket(input);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(9); expect(input.draft).toEqual(before);
    const page = normalize(extract(bytes, "driver-expirations")[6]);
    expect(page).toContain("Additional driver 1 license expiration: 2029-01-02");
    expect(page).toContain("Additional driver 2 license expiration: 2029-03-04");
    expectPrintFrame(wordBoxes(bytes, "driver-expiration-frame"));
  });
  it("keeps the existing sample's two true overflows on one referenced schedule without metadata or blank pages", async () => {
    const input = fixture(); const bytes = await buildRentalPacket(input); saveSample("synthetic-overflow-handoff.pdf", bytes);
    const doc = await PDFDocument.load(bytes); const pages = extract(bytes, "two-overflows");
    expect(doc.getPageCount()).toBe(10); expect(pages).toHaveLength(10);
    expect(normalize(pages[5])).toContain("See schedule 1"); expect(normalize(pages[5])).toContain("See schedule 2");
    expect(normalize(pages[9])).toContain(`Schedule 1 - Rental vehicle / plate ${input.vehicle.ymm} / ${input.vehicle.plate}`);
    expect(normalize(pages[9])).toContain(`Schedule 2 - Charges timing ${input.draft.payment.chargedWhen}`);
    expect(pages[9].match(/Schedule \d+ - /g)).toHaveLength(2);
    expect(pages[9]).not.toMatch(/RP\d\.|Renter email|Claim file email|Rental reference|date of birth|hold entered/);
  });
  it("preserves all long condition text across continuation pages with no empty extra pages", async () => {
    const input = fittingFixture(); const note = Array.from({ length: 45 }, (_, n) => `Detail-${n}`).join(" ");
    input.draft.condition.forEach(row => row.note = note);
    const bytes = await buildRentalPacket(input); saveSample("synthetic-multipage-overflow.pdf", bytes);
    const doc = await PDFDocument.load(bytes); const pages = extract(bytes, "multipage-overflow");
    expect(doc.getPageCount()).toBeGreaterThan(10); expect(pages).toHaveLength(doc.getPageCount());
    for (const page of pages.slice(9)) {
      expect(page).toContain("RENTAL FIELD CONTINUATION SCHEDULE");
      expect(page).toContain("Detail-");
    }
    expect(normalize(pages.slice(9).join(" ")).match(/Detail-44/g)).toHaveLength(CONDITION_AREAS.length);
    expect(normalize(pages.slice(9).join(" "))).toContain(note);
    expectPrintFrame(wordBoxes(bytes, "multipage-frame"));
  });
  it("keeps signature/evidence appendices and compact returns without forced metadata pages", async () => {
    const input = fittingFixture(); input.assets = [{ id: 1, kind: "renterSignature", signerName: input.draft.renterName, bytes: image() }, { id: 2, kind: "front", bytes: image() }];
    const pickup = await buildRentalPacket(input); expect((await PDFDocument.load(pickup)).getPageCount()).toBe(10);
    expect(extract(pickup, "one-evidence")[9]).toContain("RENTAL EVIDENCE APPENDIX");
    input.assets.push({ id: 3, kind: "signedPayment", bytes: image() });
    input.draft.payment.isRenter = false; input.draft.payment.cardholderName = "Other Example";
    const ink = await buildRentalPacket(input); expect((await PDFDocument.load(ink)).getPageCount()).toBe(11);
    const inkPages = extract(ink, "ink-evidence"); expect(inkPages[9]).toContain("SIGNED AUTHORIZATION APPENDIX"); expect(inkPages[10]).toContain("RENTAL EVIDENCE APPENDIX");
    const returnData = returned(); const charges = calculateRentalCharges(input.draft, returnData, input.rates, input.location.timezone);
    const bytes = await buildRentalReturnPacket({ ...input, returnData, charges });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2); expect(extract(bytes, "compact-return")).toHaveLength(2);
    input.assets.push({ id: 4, kind: "returnFront", bytes: image() });
    returnData.condition[0].note = "Long entered return condition narrative that must be retained in a genuine field continuation schedule.";
    const overflowReturn = await buildRentalReturnPacket({ ...input, returnData, charges });
    const returnPages = extract(overflowReturn, "overflow-return"); expect((await PDFDocument.load(overflowReturn)).getPageCount()).toBe(4);
    expect(normalize(returnPages[2])).toContain(returnData.condition[0].note); expect(returnPages[3]).toContain("RENTAL EVIDENCE APPENDIX");
  });
  it("fetches the deployed keys through signed storage URLs, never local source paths", async () => {
    const mock = vi.mocked(storageGetSignedUrl); mock.mockImplementation(async key => `https://test.invalid/${key}`);
    const source = templates(); const fetchMock = vi.fn(async (url: string) => new Response(url.includes("Claimant") ? source.packet : source.vehicleInformation));
    vi.stubGlobal("fetch", fetchMock);
    try { const loaded = await loadRentalPdfTemplates(); expect(Buffer.from(loaded.packet).equals(Buffer.from(source.packet))).toBe(true); expect(mock.mock.calls.map(c => c[0])).toEqual(Object.values(RENTAL_PDF_TEMPLATE_KEYS)); } finally { vi.unstubAllGlobals(); }
  });
  it("rejects unapproved template bytes, full PAN, unsupported names and fixed-rate substitutions", async () => {
    const bad = fixture(); bad.templates = { ...bad.templates!, packet: Buffer.from("fake pdf") }; await expect(buildRentalPacket(bad)).rejects.toThrow(/approved original/);
    const pan = fixture(); pan.draft.payment.lastFour = "4111111111111111"; await expect(buildRentalPacket(pan)).rejects.toThrow();
    const unicode = fixture(); unicode.draft.renterName = "漢"; await expect(buildRentalPacket(unicode)).rejects.toThrow(/unsupported/);
    const rate = fixture(); rate.rates.optionA = 21; await expect(buildRentalPacket(rate)).rejects.toThrow(/fixed v7/);
    const gate = fixture(); gate.settings.counselApproved = false; await expect(buildRentalPacket(gate)).rejects.toThrow(/counsel/);
    const reference = fixture(); reference.settings.omitFinancialReference = false; await expect(buildRentalPacket(reference)).rejects.toThrow(/reference/);
  });
  it("fits a 17-character VIN, continues long names/notes and throws on non-continuable field overflow", async () => {
    const input = fixture(); input.draft.renterName = "Alexandra Very Long Synthetic Example Family Name"; input.draft.payment.cardholderName = input.draft.renterName; input.draft.condition[0].note = "Synthetic long condition note repeated for continuation testing, with no invented damage.";
    const bytes = await buildRentalPacket(input); const pages = extract(bytes, "long");
    expect(pages[1]).toContain("1HGCM82633A004352"); expect(pages.join(" ")).toContain("Alexandra Very Long Synthetic Example Family Name"); expect(pages.join(" ")).toContain("See schedule");
    const overflow = fixture(); overflow.draft.initials.election = "WWWWWWWWWWWW"; await expect(buildRentalPacket(overflow)).rejects.toThrow(/exceeds/);
  });
  it("e-signs renter-cardholder only with acknowledgment; different and forced-ink cardholders get retained-original records", async () => {
    const bytesImage = image("#ff0000"); const digital = fixture(); digital.assets = [{ id: 1, kind: "renterSignature", signerName: digital.draft.renterName, bytes: bytesImage }, { id: 2, kind: "representativeSignature", signerName: digital.draft.representativeName, bytes: image() }];
    const bytes = await buildRentalPacket(digital); saveSample("synthetic-esigned-handoff.pdf", bytes); const doc = await PDFDocument.load(bytes); const raw = await rawPage(doc.getPage(6));
    expect((raw.match(/ Do\b/g) ?? []).length).toBe(2); // cardholder + renter acknowledgment, no source logo on this page.
    expect(bytesImage).toEqual(image("#ff0000")); // Builder clears private copies, never caller memory.
    const resources=doc.getPage(6).node.Resources()!.lookup(PDFName.of("XObject")) as any;
    for(const [,ref] of resources.entries()) {
      const stream=doc.context.lookup(ref) as PDFRawStream;
      if(stream.dict.get(PDFName.of("Subtype"))?.toString()!=="/Image")continue;
      if(stream.dict.get(PDFName.of("Filter"))?.toString()!=="/FlateDecode")continue;
      const pixels=decodePDFRawStream(stream).decode();
      for(let n=0;n<pixels.length;n+=3){expect(pixels[n]).toBe(pixels[n+1]);expect(pixels[n]).toBe(pixels[n+2]);}
    }
    const different = fixture(); different.draft.payment.isRenter = false; different.draft.payment.cardholderName = "Other Example"; different.assets = [...digital.assets, { id: 3, kind: "signedPayment", bytes: image() }];
    const otherBytes = await buildRentalPacket(different); saveSample("synthetic-ink-authorization-handoff.pdf", otherBytes); const otherDoc = await PDFDocument.load(otherBytes);
    expect((String(await rawPage(otherDoc.getPage(6))).match(/ Do\b/g) ?? []).length).toBe(1);
    const all = extract(otherBytes,"ink").join(" "); expect(normalize(all)).toContain("Original ink form retained — see signed authorization appendix"); expect(all).toContain("Retained-original evidence only.");
    const forced = { ...digital, settings: { ...digital.settings, forceInkForRenter: true }, assets: [...digital.assets, { id: 3, kind: "signedPayment", bytes: image() }] };
    const forcedBytes = await buildRentalPacket(forced); expect(normalize(extract(forcedBytes,"force")[6])).toContain("Original ink form retained");
    const scope = { ...digital, samePacketSigning: { renter: false, representative: true } }; await expect(buildRentalPacket(scope)).rejects.toThrow(/not authorized/);
  });
  it("places initials only on the elected option and applicable Sections 5/6",async()=>{
    const b=fixture();b.draft.election="B";b.draft.insurance.level="none";b.draft.insurance.noOtherLiability=true;b.draft.initials["6"]="SIX";
    const bb=await buildRentalPacket(b);saveSample("synthetic-option-b.pdf",bb);const bt=extract(bb,"option-b");expect(bt[2]).toContain("SIX");
    const decline=fixture();decline.draft.election="Decline";decline.draft.insurance.level="full";decline.draft.insurance.verified=true;
    Object.assign(decline.draft.insurance.checks,{active:true,liability:true,comprehensive:true,notRestricted:true});decline.draft.initials["5"]="FIVE";decline.draft.initials["6"]="SIX";
    const db=await buildRentalPacket(decline);saveSample("synthetic-decline.pdf",db);const dt=extract(db,"decline");expect(dt[2]).not.toContain("FIVE");expect(dt[2]).not.toContain("SIX");
    expect(dt[1]).toContain("AE");
  });
  it("prints all elected/applicable initials four points beside the original label on its exact baseline", async () => {
    for (const option of ["A", "B", "Decline"] as const) {
      const input = fixture(); input.draft.election = option; input.draft.initials["6"] = "AE";
      if (option === "B") { input.draft.insurance.level = "none"; input.draft.insurance.noOtherLiability = true; }
      if (option === "Decline") {
        input.draft.insurance.level = "full"; input.draft.insurance.verified = true;
        Object.assign(input.draft.insurance.checks, { active: true, liability: true, comprehensive: true, notRestricted: true });
      }
      const boxes = wordBoxes(await buildRentalPacket(input), `initials-${option}`);
      const applicable = [[option === "A" ? 0 : option === "B" ? 1 : 2], option === "A" ? [0, 2] : option === "B" ? [0, 1, 2] : [2], [0, 1, 2]];
      for (const [n, indices] of applicable.entries()) {
        const labels = boxes[n + 1].filter(w => w.text === "Initials").sort((a, b) => a.top - b.top);
        const initials = boxes[n + 1].filter(w => w.text === "AE");
        expect(labels).toHaveLength(3); expect(initials).toHaveLength(indices.length);
        for (const index of indices) {
          const label = labels[index]; const value = initials.find(w => Math.abs(w.top - label.top) < 1);
          expect(value, `${option} page ${n + 2} label ${index + 1}`).toBeDefined();
          expect(value!.left - label.right).toBeCloseTo(4, 3);
          // pdftotext: source Helvetica 8pt ascent 7.24; native Helvetica 10pt ascent 7.18.
          expect(value!.top + 7.18).toBeCloseTo(label.top + 7.24, 3);
        }
      }
    }
  });
  it("retains every original legal glyph/font payload, never mutates templates, and uses the frame on pickup/return/evidence pages", async () => {
    const input = fixture(); const pinnedPacket = Buffer.from(input.templates!.packet); const pinnedVehicle = Buffer.from(input.templates!.vehicleInformation);
    const original = await PDFDocument.load(pinnedPacket); const vehicle = await PDFDocument.load(pinnedVehicle);
    input.assets = [{ id: 1, kind: "front", bytes: image() }, { id: 2, kind: "returnFront", bytes: image() }];
    const pickup = await buildRentalPacket(input); saveSample("synthetic-pickup-evidence.pdf", pickup);
    const output = await PDFDocument.load(pickup);
    for (let n = 0; n < 9; n++) {
      const originalPayloads = textPayloads(await rawPage(n === 0 ? vehicle.getPage(0) : original.getPage(n - 1)));
      const outputPayloads = textPayloads(await rawPage(output.getPage(n)));
      const missing = originalPayloads.filter(payload => !outputPayloads.includes(payload));
      expect(missing, `page ${n + 1} approved removals only`).toHaveLength(n === 0 ? 1 : n === 6 ? 4 : 0);
    }
    expect(Buffer.from(input.templates!.packet)).toEqual(pinnedPacket);
    expect(Buffer.from(input.templates!.vehicleInformation)).toEqual(pinnedVehicle);
    expectPrintFrame(wordBoxes(pickup, "pickup-frame"));
    const returnData = returned(); const charges = calculateRentalCharges(input.draft, returnData, input.rates, input.location.timezone);
    const returnedBytes = await buildRentalReturnPacket({ ...input, returnData, charges }); saveSample("synthetic-return-evidence.pdf", returnedBytes);
    expectPrintFrame(wordBoxes(returnedBytes, "return-frame"));
    // Replay of a new generation cannot have altered any earlier signed packet bytes.
    expect(textPayloads(await rawPage(output.getPage(8))).slice(0, 74)).toEqual(textPayloads(await rawPage(original.getPage(7))));
  });
  it("keeps rendered ink including the RP0 logo, table strokes and footers inside the half-inch frame", async () => {
    const bytes = await buildRentalPacket(fixture()); const path = join(temp, "ink-frame.pdf"); writeFileSync(path, bytes);
    const prefix = join(temp, "ink-frame"); execFileSync("pdftoppm", ["-r", "72", "-gray", path, prefix]);
    const doc = await PDFDocument.load(bytes);
    for (let n = 1; n <= doc.getPageCount(); n++) {
      const file = `${prefix}-${String(n).padStart(String(doc.getPageCount()).length, "0")}.pgm`;
      const pgm = readFileSync(file); const head = pgm.subarray(0, 64).toString("latin1").match(/^P5\s+612\s+792\s+255\n/);
      expect(head).not.toBeNull(); const pixels = pgm.subarray(head![0].length);
      let left = 612, right = 0, top = 792, bottom = 0;
      for (let y = 0; y < 792; y++) for (let x = 0; x < 612; x++) if (pixels[y * 612 + x] < 192) {
        left = Math.min(left, x); right = Math.max(right, x + 1); top = Math.min(top, y); bottom = Math.max(bottom, y + 1);
      }
      // One point of raster rounding tolerance; word geometry above is exact.
      expect(left, `page ${n} ink left`).toBeGreaterThanOrEqual(35);
      expect(left, `page ${n} actual half-inch frame`).toBeLessThanOrEqual(37);
      expect(right, `page ${n} ink right`).toBeLessThanOrEqual(577);
      expect(top, `page ${n} ink top/logo`).toBeGreaterThanOrEqual(35);
      expect(bottom, `page ${n} ink bottom/footer`).toBeLessThanOrEqual(757);
    }
  });
  it("does not distribute license images, bounds assets, or allow ambiguous signer names", async () => {
    const input = fixture(); const baseline = await PDFDocument.load(await buildRentalPacket(input)); input.assets = [{ id: 1, kind: "licenseFront", bytes: image() }, { id: 2, kind: "licenseBack", bytes: image() }];
    expect((await PDFDocument.load(await buildRentalPacket(input))).getPageCount()).toBe(baseline.getPageCount());
    input.assets = [{ id: 3, kind: "renterSignature", signerName: "Not the Renter", bytes: image() }]; await expect(buildRentalPacket(input)).rejects.toThrow(/signer/);
    input.assets = [{ id: 4, kind: "extra", bytes: Buffer.alloc(10 * 1024 * 1024 + 1) }]; await expect(buildRentalPacket(input)).rejects.toThrow(/10 MiB/);
  });
  it("returns exact RP4 plus charges, uses return signatures, matches amounts, and does not process or auto-charge damage", async () => {
    const input = fixture(); const returnData = returned(); const charges = calculateRentalCharges(input.draft, returnData, input.rates, input.location.timezone);
    input.assets = [{ id: 1, kind: "returnRenterSignature", signerName: input.draft.renterName, bytes: image() }, { id: 2, kind: "returnRepresentativeSignature", signerName: returnData.representativeName, bytes: image() }];
    const bytes = await buildRentalReturnPacket({ ...input, returnData, charges }); saveSample("synthetic-return.pdf", bytes); const text = extract(bytes,"return");
    expect(text[0]).toContain("RENTAL VEHICLE CONDITION REPORT"); expect(text[0]).toContain("12400"); expect(text[1]).toContain("RENTAL RETURN CHARGES STATEMENT");
    expect(normalize(text[1])).toContain(`TOTAL CALCULATED CHARGES $${charges.total.toFixed(2)}`); expect(normalize(text[1])).toContain("Damage automatically charged $0.00"); expect(text[1]).toContain("Hold remains pending settlement"); expect(text[1]).toContain("No payment or hold action is performed here.");
    await expect(buildRentalReturnPacket({ ...input, returnData, charges: { ...charges, total: charges.total + 1 } })).rejects.toThrow(/server calculation/);
    const settled = { ...returnData, chargesSettled: true }; const settledText = extract(await buildRentalReturnPacket({ ...input, returnData: settled, charges }),"settled"); expect(settledText[1]).toContain("release not confirmed");
  });
  it("appends pickup and return dashboards with readable captions and counts only the correct phase", async () => {
    const input = fittingFixture(); input.draft.odometerOut = 42610;
    input.assets = ["front", "rear", "driver", "passenger", "dashboard", "returnFront", "returnRear", "returnDriver", "returnPassenger", "returnDashboard", "licenseFront", "licenseBack"].map((kind, n) => ({ id: n + 1, kind, bytes: image(), createdAt: Date.parse(kind.startsWith("return") ? "2026-11-13T15:00:00Z" : input.draft.pickupAt) }));
    const pickupBytes = await buildRentalPacket(input); const pickup = extract(pickupBytes, "pickup-dashboard");
    expect(pickup).toHaveLength(10); expect(normalize(pickup[8])).toContain("5 attached");
    expect(normalize(pickup[9])).toContain("Pickup dashboard / instrument cluster");
    expect(normalize(pickup[9])).toContain("Pickup odometer: 42,610 miles | Fuel: Full");
    expect(pickup[9]).toContain("Alerts: see dashboard photo");
    expect(normalize(pickup[9])).toContain("Recorded warnings: Not recorded — review dashboard photograph");
    expect(pickup[9]).not.toMatch(/no warnings|no active alerts|none active/i);
    expect(pickup.slice(9).join(" ")).not.toMatch(/Return dashboard|licenseFront|licenseBack/);
    const returnData = returned(); returnData.odometer = 42734;
    const charges = calculateRentalCharges(input.draft, returnData, input.rates, input.location.timezone);
    const returnBytes = await buildRentalReturnPacket({ ...input, returnData, charges }); const ret = extract(returnBytes, "return-dashboard");
    expect(ret).toHaveLength(3); expect(normalize(ret[0]).match(/5 attached/g)).toHaveLength(2);
    expect(normalize(ret[2])).toContain("Return dashboard / instrument cluster");
    expect(normalize(ret[2])).toContain("Return odometer: 42,734 miles | Fuel: 3/4");
    expect(normalize(ret[1])).toContain("Pickup odometer (miles) 42,610");
    expect(normalize(ret[1])).toContain("Return odometer (miles) 42,734");
    expect(normalize(ret[1])).toContain("Miles driven 124");
    expect(ret.slice(2).join(" ")).not.toMatch(/Pickup dashboard|licenseFront|licenseBack/);
    // Each actual sheet embeds all five separate images, not merely captions.
    for (const [bytes, n] of [[pickupBytes, 9], [returnBytes, 2]] as const) {
      const doc = await PDFDocument.load(bytes); expect((await rawPage(doc.getPage(n))).match(/ Do\b/g)).toHaveLength(5);
      const imageMatrices=[...(await rawPage(doc.getPage(n))).matchAll(/([\d.]+) 0 0 ([\d.]+) [\d.]+ [\d.]+ cm\s*\/Image[^\s]+ Do/g)];
      expect(Number(imageMatrices[0][1])).toBeLessThanOrEqual(174);
      expect(Number(imageMatrices[0][2])).toBeLessThanOrEqual(94);
    }
    const returnDoc=await PDFDocument.load(returnBytes);
    expect(await rawPage(returnDoc.getPage(1))).toMatch(/\/Helvetica[^\s]* 11 Tf/);
    expectPrintFrame(wordBoxes(pickupBytes, "pickup-dashboard-frame"));
    expectPrintFrame(wordBoxes(returnBytes, "return-dashboard-frame"));
  });
  it("adds the owner-authorized minimum liability notice only for Maryland location addresses, without changing source wording", async () => {
    const input = fittingFixture(); input.location.address = "100 Example St, Rockville, MD 20850";
    const bytes = await buildRentalPacket(input); const pages = extract(bytes, "maryland-owner-note");
    const noteBoxes=wordBoxes(bytes,"maryland-owner-zone")[0].filter(w=>w.left>=185 && w.right<=430 && w.top<92);
    expect(normalize(noteBoxes.map(w=>w.text).join(" "))).toBe(RENTAL_PDF_AUTHORIZED_REVISIONS.marylandLiability);
    expect(pages.slice(1).join(" ")).not.toContain("Owner statement:");
    expectPrintFrame(wordBoxes(bytes, "maryland-owner-frame"));
    input.location.address = "100 Example St, Maryland";
    expect(normalize(extract(await buildRentalPacket(input), "maryland-spelled")[0])).toContain("$30,000 bodily injury/person");
    input.location.address = "100 Example St, Arlington, VA";
    expect(extract(await buildRentalPacket(input), "non-maryland")[0]).not.toContain("Owner statement:");
  });
  it("keeps footer-adjacent Section 7 initials at least twelve points above the footer and modest signature dimensions", async () => {
    const input = fittingFixture(); input.assets = [{ id: 1, kind: "renterSignature", bytes: image(), signerName: input.draft.renterName }];
    const bytes = await buildRentalPacket(input); const boxes = wordBoxes(bytes, "footer-safety")[2];
    const label = boxes.filter(w => w.text === "Initials").sort((a,b) => b.top-a.top)[0];
    const value = boxes.find(w => w.text === "AE" && Math.abs(w.top-label.top)<1)!;
    const footer = boxes.filter(w => w.top>label.bottom && /Metrocars|MLC-RP-1/.test(w.text));
    expect(Math.min(...footer.map(w => w.top))-Math.max(label.bottom,value.bottom)).toBeGreaterThan(12);
    const doc = await PDFDocument.load(bytes); const raw = await rawPage(doc.getPage(4));
    const signatures = [...raw.matchAll(/([\d.]+) 0 0 ([\d.]+) [\d.]+ [\d.]+ cm\s*\/Image[^\s]+ Do/g)];
    expect(signatures.length).toBeGreaterThan(0);
    for (const signature of signatures) { expect(Number(signature[1])).toBeLessThanOrEqual(160); expect(Number(signature[2])).toBeLessThanOrEqual(18); }
  });
  it("paginates many separate photos in compact three-column sheets and retains existing selected support scans but not IDs or claim photos", async () => {
    const input = fittingFixture();
    input.assets = Array.from({length:16},(_,n)=>({id:n+1,kind:n===0?"dashboard":"extra",bytes:image(),createdAt:Date.parse(input.draft.pickupAt)}));
    input.assets.push({id:21,kind:"licenseFront",bytes:image()},{id:22,kind:"licenseBack",bytes:image()},{id:23,kind:"claimPhoto",bytes:image()},{id:24,kind:"declarations",bytes:image()},{id:25,kind:"coverageConfirmation",bytes:image()});
    const bytes=await buildRentalPacket(input); const doc=await PDFDocument.load(bytes); const pages=extract(bytes,"many-photos");
    expect(doc.getPageCount()).toBe(13); // Nine base, two photo sheets, two existing support scans.
    expect(pages[9]).toContain("PICKUP PHOTO SHEET");expect(pages[10]).toContain("PICKUP PHOTO SHEET");
    const photos=(await rawPage(doc.getPage(9))).match(/ Do\b/g)!.length+(await rawPage(doc.getPage(10))).match(/ Do\b/g)!.length;
    expect(photos).toBe(16);expect(pages.slice(9).join(" ")).not.toMatch(/Asset 21|Asset 22|Asset 23/);
    expect(pages[11]).toContain("Renter insurance declarations page");expect(pages[12]).toContain("Insurer coverage verification support");
    expectPrintFrame(wordBoxes(bytes,"many-photo-frame"));
  });
  it("fits all eleven dedicated pickup and return views on one sheet per phase without losing originals", async () => {
    const input = fittingFixture();
    input.assets = [...PICKUP_EVIDENCE_KINDS, ...RETURN_EVIDENCE_KINDS].map((kind,n)=>({id:n+1,kind,bytes:image(),createdAt:Date.parse(input.draft.pickupAt)}));
    const pickup=await buildRentalPacket(input), pickupDoc=await PDFDocument.load(pickup);
    expect(pickupDoc.getPageCount()).toBe(10);
    expect((await rawPage(pickupDoc.getPage(9))).match(/ Do\b/g)).toHaveLength(11);
    expect(extract(pickup,"eleven-pickup")[9]).toContain("Pickup - VIN plate");
    expectPrintFrame(wordBoxes(pickup,"eleven-pickup-frame"));
    const returnData=returned(), charges=calculateRentalCharges(input.draft,returnData,input.rates,input.location.timezone);
    const returnedBytes=await buildRentalReturnPacket({...input,returnData,charges}), returnDoc=await PDFDocument.load(returnedBytes);
    expect(returnDoc.getPageCount()).toBe(3);
    expect((await rawPage(returnDoc.getPage(2))).match(/ Do\b/g)).toHaveLength(11);
    expect(extract(returnedBytes,"eleven-return")[2]).toContain("Return - VIN plate");
    expectPrintFrame(wordBoxes(returnedBytes,"eleven-return-frame"));
  });
  it("never derives negative or invalid miles and explicitly handles missing or equal pickup readings", async () => {
    const input = fittingFixture(); input.draft.odometerOut = 42610;
    const returnData = returned(); returnData.odometer = 42610;
    const charges = calculateRentalCharges(input.draft, returnData, input.rates, input.location.timezone);
    expect(normalize(extract(await buildRentalReturnPacket({ ...input, returnData, charges }), "zero-miles")[1])).toContain("Miles driven 0");
    returnData.odometer = 42609;
    await expect(buildRentalReturnPacket({ ...input, returnData, charges })).rejects.toThrow(/lower than pickup/);
    for (const invalid of [NaN, Infinity, -1, 2000001]) {
      returnData.odometer = invalid;
      await expect(buildRentalReturnPacket({ ...input, returnData, charges })).rejects.toThrow();
      input.draft.odometerOut = invalid; returnData.odometer = 42734;
      await expect(buildRentalReturnPacket({ ...input, returnData, charges })).rejects.toThrow();
    }
    input.draft.odometerOut = null;
    const missing = normalize(extract(await buildRentalReturnPacket({ ...input, returnData, charges }), "missing-miles")[1]);
    expect(missing).toContain("Pickup odometer (miles) Not recorded");
    expect(missing).toContain("Miles driven Not available (pickup not recorded)");
    expect(missing).not.toContain("Miles driven 42,734");
  });
  it("paginates long return statement values while retaining all miles, charges and legal notes within physical margins", async () => {
    const input = fittingFixture(); input.draft.renterName = Array.from({ length: 95 }, () => "Long Name").join(" "); input.draft.payment.cardholderName = input.draft.renterName;
    input.draft.odometerOut = 42610;
    const returnData = returned(); returnData.odometer = 42734;
    const charges = calculateRentalCharges(input.draft, returnData, input.rates, input.location.timezone);
    const bytes = await buildRentalReturnPacket({ ...input, returnData, charges });
    const pages = extract(bytes, "paginated-statement");
    const statements = pages.filter(page => page.includes("RENTAL RETURN CHARGES STATEMENT"));
    expect(statements.length).toBeGreaterThan(1);
    const text = normalize(statements.join(" "));
    expect(text).toContain(input.draft.renterName); expect(text).toContain("Miles driven 124");
    expect(text).toContain(`TOTAL CALCULATED CHARGES $${charges.total.toFixed(2)}`);
    expect(text).toContain("No payment or hold action is performed here.");
    expect(text).toContain("Any claim requires notice and its stated basis under RP1/RP2.");
    expect(pages).toHaveLength((await PDFDocument.load(bytes)).getPageCount());
    expectPrintFrame(wordBoxes(bytes, "paginated-statement-frame"));
  });
});
