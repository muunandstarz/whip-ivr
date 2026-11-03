import { describe, expect, it } from "vitest";
import { calculateDirectLou, directDemandItems, directMoney, directRepairDays, initialInsuranceDirectDraft, validateInsuranceDirectDemand } from "../shared/insuranceDirect";

const baseInput = () => ({ draft: { ...initialInsuranceDirectDraft(), insuredName: "Synthetic Insured", repairCompleted: "2026-10-15", liabilityStatement: "Liability accepted as documented in Exhibit A.", evidenceConfirmed: true, dopConfirmed: true }, claimNumber: "TST-0000-111111-222222", carrierClaimNumber: "SYN-123", carrier: "Synthetic Carrier", adjuster: "Synthetic Adjuster", dateOfLoss: "2026-10-01", vehicle: "2024 Tesla Model 3", vin: "5YJ3E1EA0PF000001", driver: "Synthetic Driver", repairFacility: "Total Recon", repairStart: "2026-10-05", repairEnd: "2026-10-15", handlerName: "Synthetic Handler", handlerTitle: "Claims Resolution Specialist", dailyRate: 50, louError: "", louAmount: 450 });

describe("Insurance Direct calculations and evidence", () => {
  it("selects only the requested damage items", () => {
    expect(directDemandItems("lou")).toEqual({ hasLou: true, hasDv: false, title: "Loss of Use" });
    expect(directDemandItems("dv")).toEqual({ hasLou: false, hasDv: true, title: "Diminished Value" });
    expect(directDemandItems("both").title).toBe("Loss of Use and Diminished Value");
  });
  it("counts completed date-only repair days across daylight saving changes", () => {
    expect(directRepairDays("2026-10-31", "2026-11-03")).toBe(3);
    expect(directRepairDays("2026-03-07", "2026-03-10")).toBe(3);
    expect(directRepairDays("2026-02-30", "2026-03-10")).toBe(0);
    expect(directRepairDays("2026-10-15", "2026-10-05")).toBe(0);
  });
  it("weights matching reported monthly occupancy by repair days without dividing fleet counts", () => {
    const result = calculateDirectLou({ days: 10, dailyRate: 50, snapshots: [{ repairDays: 6, utilization: "90.0%", dataStatus: "reported" }, { repairDays: 4, utilization: "80.0%", dataStatus: "reported" }], utilizationOverride: "", utilizationOverrideBasis: "" });
    expect(result.percent).toBe(86);
    expect(result.gross).toBe(500);
    expect(result.amount).toBe(430);
    expect(result.basis).toContain("not measured daily utilization");
  });
  it("never uses missing or older-month fallback data or defaults to 100%", () => {
    for (const snapshots of [[], [{ repairDays: 10, utilization: "90.0%", dataStatus: "latest_available" as const }], [{ repairDays: 4, utilization: "90.0%", dataStatus: "reported" as const }]]) {
      const result = calculateDirectLou({ days: 10, dailyRate: 50, snapshots, utilizationOverride: "", utilizationOverrideBasis: "" });
      expect(result.percent).toBeNull(); expect(result.amount).toBe(0); expect(result.error).toBeTruthy();
    }
  });
  it("requires a percentage in range and a source/date basis for a verified override", () => {
    const input = { days: 10, dailyRate: 50, snapshots: [], utilizationOverride: "91", utilizationOverrideBasis: "" };
    expect(calculateDirectLou(input).error).toContain("source, dates");
    expect(calculateDirectLou({ ...input, utilizationOverrideBasis: "Verified Oct. 5–15 fleet exhibit" }).amount).toBe(455);
    expect(calculateDirectLou({ ...input, utilizationOverride: "10000", utilizationOverrideBasis: "source" }).percent).toBeNull();
  });
  it("validates a supported direct LOU demand and requires actual packet support", () => {
    expect(validateInsuranceDirectDemand(baseInput())).toEqual([]);
    const draft = { ...baseInput().draft, evidenceConfirmed: false, dopConfirmed: false };
    expect(validateInsuranceDirectDemand({ ...baseInput(), draft })).toHaveLength(2);
  });
  it("requires actual appraisal values/method for DV but does not demand LOU inputs in DV-only mode", () => {
    const input = baseInput();
    const draft = { ...input.draft, mode: "dv" as const, prelossValue: "25000", postlossValue: "22000", dvMethod: "Appraisal Exhibit D, market-comparable method" };
    expect(validateInsuranceDirectDemand({ ...input, draft, repairStart: "", repairEnd: "", dailyRate: 0, louAmount: 0, louError: "Missing utilization" })).toEqual([]);
    expect(validateInsuranceDirectDemand({ ...input, draft: { ...draft, postlossValue: "26000", dvMethod: "" } })).toHaveLength(2);
  });
  it("does not add optional state authority without explicit human verification", () => {
    const input = baseInput();
    expect(validateInsuranceDirectDemand({ ...input, draft: { ...input.draft, stateAuthority: "Handler-entered verified authority pending confirmation" } }).join(" ")).toContain("authority is verified");
    expect(directMoney("$1,234.56")).toBe(1234.56);
  });
});
