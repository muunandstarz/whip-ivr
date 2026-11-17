import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { initialInsuranceDirectDraft, validateInsuranceDirectDemand } from "../shared/insuranceDirect";
import { buildDvReportReference, dvReportConflicts, dvReportToDollarFacts, DV_REFERENCE_STARTER, type DvReportFacts } from "../shared/insuranceDirectDv";

const read = (path: string) => readFileSync(path, "utf8");
const client = read("client/src/pages/DocGenerator.tsx");
const standalone = client.slice(client.indexOf("function LOUCalculatorTab("), client.indexOf("// ─── Tab: Medical Bill Review"));
const review = read("client/src/components/InsuranceDirectDvReview.tsx");
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
  it("keeps manual DV fields editable, but final included DV requires reviewed completed-source approval", () => {
    expect(standalone).toContain('id="lou-dv-amount" value={directDraft.dvAmount}');
    expect(standalone).toContain('setDirect("dvAmount", value)');
    expect(standalone).toContain('id="lou-dv-clear-fields"');
    expect(standalone).toContain('const directErrors = [...dvCompletionErrors, ...claimErrors]');
    expect(standalone).toContain('if (directErrors.length)');
    expect(standalone).toContain('disabled={hasDv && !dvSourceConfirmed}');
    expect(standalone).not.toContain("insuranceDirectDvReviewHistory.useQuery");
    expect(review).toContain('/api/insurance-direct/dv-report/analyze');
    expect(review).toContain('result.currency !== "USD" || result.amountUnit !== "dollars"');
    expect(review).not.toContain('dvReportToDollarFacts');
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
  it("requests DV first, prepares LOU while waiting and uploads only a completed report in final review", () => {
    expect(standalone).toContain('useState<1 | 2 | 3>(1)');
    expect(standalone).toContain('id="lou-step-request"');
    expect(standalone).toContain('id="lou-step-calculator"');
    expect(standalone).toContain('id="lou-step-letter"');
    expect(standalone).toContain('id="lou-dv-requested"');
    expect(standalone).toContain('disabled={hasDv && !dvRequested}');
    expect(standalone).toContain('{showDemand && hasDv && dvReadyForUpload && <InsuranceDirectDvReview');
    expect(standalone).toContain('id="lou-dv-report-ready"');
    expect(standalone).toContain('Skip DV — Prepare LOU');
    expect(standalone).toContain('"Requested—waiting" : "Not started"');
    expect(standalone).toContain('"Completed report reviewed"');
    expect(standalone).toContain('<InsuranceDirectRepairUpload');
    expect(standalone).toContain('trpc.docgen.readInsuranceDirectRepair.useMutation()');
    expect(standalone).not.toContain('id="lou-dv-report-file"');
  });
  it("opens the exact external calculator in step 1 without pretending that opening requests a report", () => {
    expect(standalone).toContain('id="lou-open-dv-calculator" href="https://dvcalc-unkzbfqd.manus.space/agent-login" target="_blank" rel="noopener noreferrer"');
    expect(standalone.match(/id="lou-open-dv-calculator"/g)).toHaveLength(1);
    expect(standalone).toContain('Opening the link does not submit a request or confirm completion');
    expect(standalone).toContain('I requested the report in the external calculator');
    expect(standalone).not.toContain('event.data?.type === "dv-calculator-result"');
    expect(review).not.toMatch(/setInterval|postMessage|localStorage|sessionStorage/);
  });
  it("persists input-only progress without files, report objects or source approval and resets saved evidence checks", () => {
    expect(standalone).toContain('workflowProgress: { stage: workflowStage, dvRequested, dvReadyForUpload }');
    const persistence = standalone.slice(standalone.indexOf('const draftData ='), standalone.indexOf('// A preview belongs'));
    expect(persistence).not.toMatch(/dvSourceConfirmation|dvSourceConfirmed|report:|file:|buffer:/);
    expect(standalone).toContain('const [dvSourceConfirmation, setDvSourceConfirmation] = useState("")');
    expect(standalone).toContain('evidenceConfirmed: false, dopConfirmed: false, authorityVerified: false');
  });
  it("applies only explicitly reviewed DV and blank report-supported identity facts, never liability, insured or repairs", () => {
    const apply = standalone.slice(standalone.indexOf('const applyDvReport ='), standalone.indexOf('const repairReader'));
    expect(apply).toContain('dvAmount: report.dvAmount');
    expect(apply).toContain('buildDvReportReference(report)');
    expect(apply).toContain('carfaxReported: false, evidenceConfirmed: false, dopConfirmed: false');
    expect(apply).toContain('report.claimNumberRole === "our"');
    expect(apply).not.toMatch(/setDropOffDate|setPickUpDate|setDailyRate|setCustomRate|setMemberDriver|setAdverseCarrier|insuredName:|liabilityStatement:|repairCompleted:/);
    expect(review).toContain('dvReportConflicts(current, report)');
    expect(review).toContain('disabled={!reviewed || !!conflicts.length}');
    expect(review).toContain('requestId.current += 1; controller.current?.abort()');
  });
  it("offers manual completed-source verification only for genuine report-reader failures, not unconditional bypass", () => {
    expect(review).toContain('{manualAllowed &&');
    expect(review).toContain('response.status === 422 || response.status === 500');
    expect(review).toContain('!sourceRejected');
    expect(review).toContain('I have the completed DV appraisal, matched its VIN/Whip claim');
    expect(review).toContain('personally verified the manually entered final DV amount and source reference');
  });
  it("applies only reviewed repair fields, never invoice date, amount, DV, daily rate or liability", () => {
    const apply = standalone.slice(standalone.indexOf("const applyRepairFields ="), standalone.indexOf('const [liabilityExample'));
    expect(apply).toContain("setDropOffDate(patch.repairStart)");
    expect(apply).toContain("setPickUpDate(patch.returnedToService)");
    expect(apply).toContain("evidenceConfirmed: false, dopConfirmed: false");
    expect(apply).toContain("setPreviewPdfUrl(null)");
    expect(apply).not.toMatch(/repairTotal|invoiceDate|dvAmount|setDailyRate|setCustomRate|setMemberDriver|setAdverseCarrier|liabilityStatement/);
  });
});
