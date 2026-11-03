import { describe, expect, it } from "vitest";
import { LIABILITY_STATEMENT_EXAMPLES, calculateDirectLou, directDemandItems, directMoney, directRepairDays, initialInsuranceDirectDraft, validateInsuranceDirectDemand } from "../shared/insuranceDirect";

const baseInput = () => ({ draft: { ...initialInsuranceDirectDraft(), letterDate: "2026-11-03", insuredName: "Synthetic Insured", repairCompleted: "2026-10-15", liabilityStatement: "Liability accepted as documented in Exhibit A.", evidenceConfirmed: true, dopConfirmed: true }, claimNumber: "TST-0000-111111-222222", carrierClaimNumber: "SYN-123", carrier: "Synthetic Carrier", adjuster: "Synthetic Adjuster", dateOfLoss: "2026-10-01", vehicle: "2024 Tesla Model 3", vin: "5YJ3E1EA0PF000001", driver: "Synthetic Driver", repairFacility: "Total Recon", repairStart: "2026-10-05", repairEnd: "2026-10-15", handlerName: "Synthetic Handler", handlerTitle: "Claims Resolution Specialist", dailyRate: 50, louError: "", louAmount: 500 });

const dvDraft = () => ({ ...baseInput().draft, mode: "dv" as const, dvAmount: "$3,000.00", dvMethod: "Appraisal Exhibit D, market-comparable method" });

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
  it("returns exactly days times effective daily rate with no occupancy fields", () => {
    expect(calculateDirectLou({ days: 10, dailyRate: 50 })).toEqual({ amount: 500, gross: 500, error: "" });
    expect(calculateDirectLou({ days: 3, dailyRate: 47.125 })).toEqual({ amount: 141.38, gross: 141.38, error: "" });
  });
  it("preserves gross LOU despite missing, older, partial or low-occupancy context", () => {
    const contexts = [[], [{ repairDays: 10, utilization: "90.0%", dataStatus: "latest_available" }], [{ repairDays: 4, utilization: "90.0%", dataStatus: "reported" }], [{ repairDays: 10, utilization: "0%", dataStatus: "reported" }]];
    for (const snapshots of contexts) {
      // Extra legacy runtime context cannot influence the deliberately small API.
      const legacyInput = { days: 10, dailyRate: 50, snapshots, utilizationOverride: "80", utilizationOverrideBasis: "Legacy source" };
      expect(calculateDirectLou(legacyInput)).toEqual({ amount: 500, gross: 500, error: "" });
    }
  });
  it("rejects invalid day counts, rates and overflowing amounts without inventing a total", () => {
    for (const value of [0, -1, NaN, Infinity]) {
      expect(calculateDirectLou({ days: value, dailyRate: 50 })).toMatchObject({ amount: 0, gross: 0 });
      expect(calculateDirectLou({ days: value, dailyRate: 50 }).error).toBeTruthy();
      expect(calculateDirectLou({ days: 10, dailyRate: value }).error).toBeTruthy();
    }
    expect(calculateDirectLou({ days: Number.MAX_VALUE, dailyRate: 50 })).toMatchObject({ amount: 0, gross: 0 });
  });
  it("defaults manual DV to blank and has no utilization override fields", () => {
    const draft = initialInsuranceDirectDraft();
    expect(draft.dvAmount).toBe("");
    expect(draft.prelossValue).toBe("");
    expect(draft.postlossValue).toBe("");
    expect(draft).not.toHaveProperty("utilizationOverride");
    expect(draft).not.toHaveProperty("utilizationOverrideBasis");
  });
  it("validates gross LOU without an occupancy prerequisite and requires actual packet support", () => {
    expect(validateInsuranceDirectDemand(baseInput())).toEqual([]);
    const draft = { ...baseInput().draft, evidenceConfirmed: false, dopConfirmed: false };
    expect(validateInsuranceDirectDemand({ ...baseInput(), draft })).toHaveLength(2);
    expect(validateInsuranceDirectDemand({ ...baseInput(), louAmount: 450 }).join(" ")).toContain("must equal out-of-service days");
    expect(validateInsuranceDirectDemand({ ...baseInput(), louAmount: NaN }).join(" ")).toContain("positive and finite");
  });
  it("accepts manual DV without pre/post values or LOU inputs and preserves the entered amount", () => {
    const draft = { ...dvDraft(), prelossValue: "", postlossValue: "" };
    const input = { ...baseInput(), draft, repairStart: "", repairEnd: "", dailyRate: 0, louAmount: 0, louError: "Missing utilization" };
    const before = structuredClone(input);
    expect(validateInsuranceDirectDemand(input)).toEqual([]);
    expect(input).toEqual(before);
    expect(input.draft.dvAmount).toBe("$3,000.00");
  });
  it.each(["", "0", "-100", "NaN", "Infinity", "not an amount"])("rejects invalid manual DV %j even with reconciliable pre/post values", dvAmount => {
    const draft = { ...dvDraft(), dvAmount, prelossValue: "25000", postlossValue: "22000" };
    expect(validateInsuranceDirectDemand({ ...baseInput(), draft }).join(" ")).toContain("amount manually");
    expect(draft.dvAmount).toBe(dvAmount);
  });
  it("requires the entered method/source and does not enforce DV inputs in LOU-only mode", () => {
    expect(validateInsuranceDirectDemand({ ...baseInput(), draft: { ...dvDraft(), dvMethod: " " } }).join(" ")).toContain("method and source reference");
    expect(validateInsuranceDirectDemand({ ...baseInput(), draft: { ...baseInput().draft, dvAmount: "invalid", prelossValue: "1000", postlossValue: "" } })).toEqual([]);
  });
  it("accepts optional manually entered values only when both reconcile to the manual amount", () => {
    const draft = { ...dvDraft(), prelossValue: "$25,000", postlossValue: "$22,000" };
    expect(validateInsuranceDirectDemand({ ...baseInput(), draft })).toEqual([]);
    const mismatch = { ...draft, dvAmount: "2000" };
    expect(validateInsuranceDirectDemand({ ...baseInput(), draft: mismatch }).join(" ")).toContain("must reconcile to the manually entered");
    expect(mismatch.dvAmount).toBe("2000");
  });
  it.each([
    { prelossValue: "25000", postlossValue: "" },
    { prelossValue: "", postlossValue: "22000" },
    { prelossValue: "invalid", postlossValue: "22000" },
    { prelossValue: "25000", postlossValue: "Infinity" },
    { prelossValue: "25000", postlossValue: "-1" },
    { prelossValue: "25000", postlossValue: "26000" },
  ])("rejects incomplete or invalid optional supporting values %j", values => {
    expect(validateInsuranceDirectDemand({ ...baseInput(), draft: { ...dvDraft(), ...values } }).join(" ")).toContain("enter both valid values");
  });
  it("validates both selected items without changing the manual DV amount", () => {
    const input = { ...baseInput(), draft: { ...dvDraft(), mode: "both" as const } };
    expect(validateInsuranceDirectDemand(input)).toEqual([]);
    expect(input.draft.dvAmount).toBe("$3,000.00");
  });
  it.each(["[carrier] accepted on [date].", "{carrier} accepted.", "{{liability}}", "Unresolved [facts", "Unresolved facts}"])("rejects unresolved liability placeholders %j with editing guidance", liabilityStatement => {
    expect(validateInsuranceDirectDemand({ ...baseInput(), draft: { ...baseInput().draft, liabilityStatement } }).join(" ")).toContain("Replace every square-bracket or brace placeholder");
  });
  it("supplies four editable, evidence-qualified liability examples with no invented fault percentage", () => {
    expect(LIABILITY_STATEMENT_EXAMPLES).toHaveLength(4);
    expect(new Set(LIABILITY_STATEMENT_EXAMPLES.map(example => example.id)).size).toBe(4);
    for (const example of LIABILITY_STATEMENT_EXAMPLES) {
      expect(example.label).toBeTruthy();
      expect(example.note).toBeTruthy();
      for (const placeholder of ["[carrier]", "[date]", "[source/exhibit]", "[facts]"]) expect(example.text).toContain(placeholder);
      expect(example.text).not.toMatch(/100%|\d+%|full liability|fully accepted/i);
      expect(validateInsuranceDirectDemand({ ...baseInput(), draft: { ...baseInput().draft, liabilityStatement: example.text } }).join(" ")).toContain("placeholder");
      const edited = example.text.replaceAll("[carrier]", "Synthetic Carrier").replaceAll("[date]", "October 16, 2026").replaceAll("[source/exhibit]", "Exhibit A").replaceAll("[facts]", "the specific scope recorded in Exhibit A");
      expect(validateInsuranceDirectDemand({ ...baseInput(), draft: { ...baseInput().draft, liabilityStatement: edited } })).toEqual([]);
    }
    expect(LIABILITY_STATEMENT_EXAMPLES.find(example => example.id === "whip-evidence-position")?.text).toContain("not a statement that [carrier] has accepted liability");
    expect(LIABILITY_STATEMENT_EXAMPLES.find(example => example.id === "partial-or-disputed")?.text).toContain("unresolved items");
  });
  it("does not add optional state authority without explicit human verification", () => {
    const input = baseInput();
    expect(validateInsuranceDirectDemand({ ...input, draft: { ...input.draft, stateAuthority: "Handler-entered verified authority pending confirmation" } }).join(" ")).toContain("authority is verified");
    expect(directMoney("$1,234.56")).toBe(1234.56);
  });
});
