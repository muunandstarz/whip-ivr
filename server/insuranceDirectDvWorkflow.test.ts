import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { initialInsuranceDirectDraft, validateInsuranceDirectDemand } from "../shared/insuranceDirect";
import { buildDvReportReference, dvReportConflicts, dvReportToDollarFacts, DV_REFERENCE_STARTER, type DvReportFacts } from "../shared/insuranceDirectDv";

const read = (path: string) => readFileSync(path, "utf8");
const client = read("client/src/pages/DocGenerator.tsx");
const standalone = client.slice(client.indexOf("function LOUCalculatorTab("), client.indexOf("// ─── Tab: Medical Bill Review"));
const api = read("server/insuranceDirectDvApi.ts");
const schema = read("drizzle/schema.ts");
const router = read("server/routers/docgen.ts");
const report: DvReportFacts = {
  reportId: "TEST-DV-01", reportDate: "2026-11-01", appraiser: "Test Appraisal Company", methodology: "Documented market comparison",
  claimNumber: "TST-0000-123456-123456", claimNumberRole: "our", claimantName: "Synthetic claimant", vehicleYear: "2025", vehicleMake: "Toyota", vehicleModel: "Camry",
  vin: "4T1G11AK1MU000001", dateOfLoss: "2026-10-01", repairFacility: "Synthetic facility", dvAmount: "1250.00", adjustedVehicleValue: "25000.00",
  prelossValue: "", postlossValue: "", carfaxReported: true, dvSourcePage: "Section 4, page 6", warnings: [],
};

describe("Insurance Direct DV guidance and per-report review", () => {
  it("converts parser cents to exact USD dollars once without inventing optional values", () => {
    const source = { ...report, dvAmount: "208825", adjustedVehicleValue: "2322000", prelossValue: "", postlossValue: "" };
    const converted = dvReportToDollarFacts(source);
    expect(converted).toMatchObject({ dvAmount: "2088.25", adjustedVehicleValue: "23220.00", prelossValue: "", postlossValue: "" });
    expect(source.dvAmount).toBe("208825");
    expect(() => dvReportToDollarFacts({ ...source, dvAmount: "2088.25" })).toThrow("currency units");
    expect(api).toContain("dvReportToDollarFacts(result.report)");
    expect(api).toContain('amountUnit: "dollars"');
  });
  it("starts every new form with blank dollar values and source wording", () => {
    for (let i = 0; i < 3; i++) expect(initialInsuranceDirectDraft()).toMatchObject({ dvAmount: "", prelossValue: "", postlossValue: "", dvMethod: "", carfaxReported: false });
    expect(DV_REFERENCE_STARTER).toContain("[report ID]");
    expect(DV_REFERENCE_STARTER).not.toMatch(/\$|2088|23,220|8\.99/);
    expect(standalone).not.toMatch(/2088\.25|2,088\.25|23220\.00/);
  });
  it("composes an editable reference from actual report metadata without inventing values", () => {
    const reference = buildDvReportReference(report);
    expect(reference).toContain("TEST-DV-01");
    expect(reference).toContain("Section 4, page 6");
    expect(reference).not.toMatch(/court.accepted|factory standards|mandatory|accepted liability|25000|23750/i);
  });
  it("blocks wrong-VIN and wrong-Whip-claim reports but does not assign an unknown number to Whip", () => {
    expect(dvReportConflicts({ claimNumber: report.claimNumber, vin: report.vin.toLowerCase() }, report)).toEqual([]);
    expect(dvReportConflicts({ claimNumber: "OTHER-CLAIM", vin: "OTHER-VIN" }, report)).toHaveLength(2);
    expect(dvReportConflicts({ claimNumber: "OTHER-CLAIM", vin: "" }, { ...report, claimNumberRole: "unknown" })).toEqual([]);
    expect(dvReportConflicts({ claimNumber: "", vin: "" }, report)).toEqual([]);
  });
  it("requires review/apply and keeps unrelated liability, driver/insured and enclosure facts out of automatic prefill", () => {
    expect(standalone).toContain("!dvReportReviewed || reportConflicts.length");
    const apply = standalone.slice(standalone.indexOf("const applyDvReport ="), standalone.indexOf("const getUtilizationRows ="));
    expect(apply).toContain("dvAmount: report.dvAmount");
    expect(apply).toContain('prelossValue: report.prelossValue || ""');
    expect(apply).toContain('postlossValue: report.postlossValue || ""');
    expect(apply).toContain("carfaxReported: false");
    expect(apply).not.toContain("setMemberDriver");
    expect(apply).not.toContain("insuredName:");
    expect(apply).not.toContain("liabilityStatement:");
    expect(apply).not.toContain("setAdverseCarrier");
    expect(apply).not.toContain("setDropOffDate");
    expect(standalone).toContain("dvRequestId.current += 1");
    expect(standalone).toContain("payload.delete(\"file\")");
  });
  it("gives precise field-location guidance and rejects unfinished scripted references", () => {
    expect(standalone).toContain("TOTAL DIMINISHED VALUE");
    expect(standalone).toContain("The total can continue onto the next page");
    expect(standalone).toContain("Do not manufacture a post-repair value");
    expect(standalone).toContain("Use Editable Source Wording");
    const errors = validateInsuranceDirectDemand({ draft: { ...initialInsuranceDirectDraft(), mode: "dv", dvAmount: "1250", dvMethod: DV_REFERENCE_STARTER }, claimNumber: "", carrierClaimNumber: "", carrier: "", adjuster: "", dateOfLoss: "", vehicle: "", vin: "", driver: "", repairFacility: "", repairStart: "", repairEnd: "", handlerName: "", handlerTitle: "", dailyRate: 0, louError: "", louAmount: 0 });
    expect(errors.some(error => error.includes("source-wording placeholders"))).toBe(true);
  });
  it("authenticates before processing, stores structured review outcomes only and clears uploaded bytes", () => {
    expect(api.indexOf("sdk.authenticateRequest")).toBeLessThan(api.indexOf('memoryUpload.single("file")(req'));
    expect(api).toContain("multer.memoryStorage()");
    expect(api).toContain("createInsuranceDirectDvReview");
    expect(api).toContain("req.file?.buffer.fill(0)");
    expect(api).not.toContain("storagePut(");
    expect(api).not.toContain("storageGet(");
    const table = schema.slice(schema.indexOf('mysqlTable("insurance_direct_dv_reviews"'), schema.indexOf("// ─── Claim Correspondence", schema.indexOf('mysqlTable("insurance_direct_dv_reviews"')));
    expect(table).toContain('json("review_output")');
    expect(table).not.toMatch(/blob\(|storage_key|raw_text|filename|pdf_bytes|source_url/i);
    expect(router).toContain("insuranceDirectDvReviewHistory: protectedProcedure");
    expect(router).toContain("listInsuranceDirectDvReviews(input.claimNumber)");
  });
  it("uses the same published workbook rates in both active calculators, with exact weekly provenance", () => {
    expect(read("server/routers/lou.ts")).toContain('import { MARKET_PRICING } from "../../shared/louRates"');
    expect(client).toContain("findLouVehicleRate(louMarketCode, louVehicleClass)");
    expect(standalone).toContain("findLouVehicleRate(marketCode, vehicleClass)");
    expect(client).toContain("louRateSourceLabel(louMarket)");
    expect(standalone).toContain("louRateSourceLabel(currentMarket)");
    expect(standalone).not.toContain("(effectiveRate * 7)");
    expect(read("client/src/lib/standaloneLouPdf.ts")).not.toContain("(input.dailyRate * 7)");
    expect(standalone).not.toContain("Push LOU to Subro Demand");
    expect(standalone).not.toContain("markets[0]");
    expect(client).not.toContain("louMarkets[0]");
  });
});
