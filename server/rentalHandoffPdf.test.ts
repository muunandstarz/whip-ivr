import { afterAll, describe, expect, it, vi } from "vitest";
import { PDFDocument, PDFRawStream, decodePDFRawStream, PDFName, PDFArray } from "pdf-lib";
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { emptyRentalDraft, DEFAULT_RENTAL_RATES, calculateRentalCharges, CONDITION_AREAS, type RentalReturn } from "../shared/rentalHandoff";
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
function returned(): RentalReturn { return { returnedAt: "2026-11-12T16:00:00Z", odometer: 12400, fuel: "3/4", condition: CONDITION_AREAS.map(area => ({ area, ok: true, note: "" })), noticeAt: "2026-11-11T15:00:00Z", tolls: 12.34, parking: 5, fines: 0, researchEvents: 1, cleaning: 10, roadside: 0, lossOfUseDays: 0, lossOfUseResponsible: false, damageNoticeNotes: "No damage claim entered in this synthetic example.", notes: "Synthetic return only.", chargesSettled: false, representativeName: "Return Example" }; }
async function rawPage(page: any) {
  const contents = page.node.Contents(); const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  return refs.map((ref: any) => Buffer.from(decodePDFRawStream(page.doc.context.lookup(ref) as PDFRawStream).decode()).toString("latin1")).join("\n");
}
function saveSample(name: string, bytes: Buffer) { if (outputDirectory) { mkdirSync(outputDirectory, { recursive: true }); writeFileSync(join(outputDirectory, name), bytes); } }

describe("rental PDF input text validation", () => {
  it("sanitizes NUL but rejects unsupported Unicode and controls visibly", () => {
    expect(sanitizeRentalPdfText("Alex\0 Example")).toBe("Alex Example");
    expect(() => sanitizeRentalPdfText("Example 漢")).toThrow(/unsupported/);
    expect(() => sanitizeRentalPdfText("a\u0001b")).toThrow(/control/);
    expect(sanitizeRentalPdfText("Renée — Example")).toBe("Renée — Example");
  });
  it("exposes all measurable limits and the continuation policy", () => {
    expect(RENTAL_PDF_FILL_LIMITS.margin).toBe(72); expect(RENTAL_PDF_FILL_LIMITS.fieldFontPoints).toBe(9);
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
    const pages = extract(bytes); const doc = await PDFDocument.load(bytes); expect(doc.getPageCount()).toBeGreaterThanOrEqual(9);
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
    const originalStreams = await rawPage(doc.getPage(1)); expect(originalStreams).toContain("0.839378");
    const path = join(temp,"margins.pdf"); writeFileSync(path,bytes);
    const bbox = execFileSync("pdftotext",["-bbox",path,"-"],{encoding:"utf8"});
    for(const word of bbox.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)"/g)) {
      expect(Number(word[1])).toBeGreaterThanOrEqual(72);expect(Number(word[2])).toBeGreaterThanOrEqual(72);
      expect(Number(word[3])).toBeLessThanOrEqual(540);expect(Number(word[4])).toBeLessThanOrEqual(720);
    }
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
    const bt=extract(await buildRentalPacket(b),"option-b");expect(bt[2]).toContain("SIX");
    const decline=fixture();decline.draft.election="Decline";decline.draft.insurance.level="full";decline.draft.insurance.verified=true;
    Object.assign(decline.draft.insurance.checks,{active:true,liability:true,comprehensive:true,notRestricted:true});decline.draft.initials["5"]="FIVE";decline.draft.initials["6"]="SIX";
    const dt=extract(await buildRentalPacket(decline),"decline");expect(dt[2]).not.toContain("FIVE");expect(dt[2]).not.toContain("SIX");
    expect(dt[1]).toContain("AE");
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
});
