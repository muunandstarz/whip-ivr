import { describe, expect, it } from "vitest";
import { createStandaloneLouPdf, type StandaloneLouInput } from "./standaloneLouPdf";
import { createInsuranceDirectPdf, type InsuranceDirectPdfInput } from "./insuranceDirectPdf";
import type { jsPDF } from "jspdf";

const record = (): StandaloneLouInput => ({
  claimNumber: "TST-0000-222222-444444", carrierClaimNumber: "SYN-ACTIVE-444", dateOfLoss: "October 1, 2026",
  carrier: "Synthetic Carrier", adjuster: "Synthetic Adjuster", vehicle: "2024 Tesla Model 3", vin: "5YJ3E1EA0PF000001", driver: "Synthetic Driver",
  registeredOwner: "Metrocars Leasing Corp.", vehicleStatus: "Actively leased / Revenue-generating", vehicleClass: "Tesla Model 3 (LR/SR)",
  repairFacility: "Total Recon — Rockville", roNumber: "SYN-RO-444", repairStart: "October 5, 2026", repairEnd: "October 15, 2026",
  days: 10, dailyRate: 50, amount: 500, customRate: true, marketName: "Washington DC (Rockville)", letterDate: "November 3, 2026",
  handlerName: "Synthetic Handler", handlerTitle: "Claims Specialist", handlerExtension: "028", handlerEmail: "claims@drivewhip.com", logoBase64: "",
  snapshots: [{ reportMonth: "September 2026", repairDays: 10, fleetCount: 749, rentCount: 739, availableCount: 10, utilization: "98.7%", dataStatus: "latest_available" }],
  sourceNote: "Source: September 2026 monthly report; latest available context only, not daily occupancy.",
  reconciliation: "739 rented + 10 reported unrented = 749 reported rentable fleet.",
});
function cover(louRecord: StandaloneLouInput): InsuranceDirectPdfInput {
  return {
    letterDate: louRecord.letterDate, claimNumber: louRecord.claimNumber, carrierClaimNumber: louRecord.carrierClaimNumber,
    dateOfLoss: louRecord.dateOfLoss, carrier: louRecord.carrier, adjuster: louRecord.adjuster, insuredName: "Synthetic Insured", driver: louRecord.driver,
    vehicle: louRecord.vehicle, vin: louRecord.vin, repairFacility: louRecord.repairFacility, repairCompleted: louRecord.repairEnd,
    liabilityStatement: "Whip's claim position is supported by synthetic Exhibits A and B; this is not an assertion of carrier acceptance.",
    hasLou: true, hasDv: true, louDays: louRecord.days, dailyRate: louRecord.dailyRate, louAmount: louRecord.amount,
    repairStart: louRecord.repairStart, repairEnd: louRecord.repairEnd, dvAmount: 3000, dvMethod: "Separate synthetic report, Exhibit D.", carfaxReported: false,
    stateAuthority: "", handlerName: louRecord.handlerName, handlerTitle: louRecord.handlerTitle, handlerExtension: louRecord.handlerExtension,
    handlerEmail: louRecord.handlerEmail, logoBase64: "", snapshots: louRecord.snapshots, marketName: louRecord.marketName,
    sourceNote: louRecord.sourceNote, reconciliation: louRecord.reconciliation, attachLouSchedule: true, louRecord,
  };
}
function pages(doc: jsPDF): string[] {
  return (doc.internal.pages as unknown as string[][]).slice(1).map(p => Array.from(p.join("\n").matchAll(/\(((?:\\[\s\S]|[^\\)])*)\)\s*Tj/g), m => m[1].replace(/\\([()\\])/g, "$1").replace(/\x96/g, "–").replace(/\x97/g, "—")).join(" "));
}

describe("Standard LOU form and active-claim attachment", () => {
  it("keeps the normal standalone form available as a two-page calculation and supporting basis", () => {
    const doc = createStandaloneLouPdf(record());
    const text = pages(doc).join(" ");
    expect(doc.getNumberOfPages()).toBe(2);
    for (const field of ["Loss of Use / Rental Reimbursement Request", "REPAIR PERIOD", "RO Number", "SYN-RO-444", "Days Claimed", "MONTHLY FLEET UTILIZATION SNAPSHOTS", "Loss of Use Breakdown", "$500.00", "SOURCE NOTE", "RECONCILIATION", "Supporting Basis"]) expect(text).toContain(field);
    expect(text).not.toMatch(/Subrogation|Restatement|Enterprise Leasing|Hertz Corp|NaN|undefined/);
  });

  it("appends the same full LOU record after the cover letter and before no fabricated external report", () => {
    const original = record(); const before = structuredClone(original);
    const standalone = pages(createStandaloneLouPdf(original)).join(" ");
    const pdf = createInsuranceDirectPdf(cover(original)); const packet = pages(pdf);
    const firstFormPage = packet.findIndex(p => p.startsWith("Loss of Use / Rental Reimbursement Request"));
    expect(firstFormPage).toBeGreaterThan(0);
    expect(packet.slice(0, firstFormPage).join(" ")).toContain("Pay $3,500.00.");
    const appended = packet.slice(firstFormPage).join(" ");
    for (const field of [original.claimNumber, original.carrierClaimNumber, original.vin, original.roNumber, original.vehicleClass, original.vehicleStatus, original.sourceNote, original.reconciliation, "98.7%", "$500.00"]) {
      expect(standalone).toContain(field); expect(appended).toContain(field);
    }
    expect(appended).not.toContain("$3500.00");
    expect(appended).not.toContain("Loss of use support schedule");
    expect(original).toEqual(before);
    packet.forEach((p, i) => expect(p).toContain(`Page ${i + 1} of ${packet.length}`));
  });

  it.each(["claimNumber", "vin", "repairStart", "repairEnd"] as const)("rejects a stale %s in the attached LOU record", key => {
    const original = record(); const input = cover(original); input.louRecord = { ...original, [key]: "DIFFERENT" };
    expect(() => createInsuranceDirectPdf(input)).toThrow("attached LOU record must match");
  });

  it.each([{ amount: 499 }, { days: 9, amount: 450 }, { dailyRate: 40, amount: 400 }])("rejects divergent attached amounts without changing the calculator record %j", changes => {
    const original = record(); const input = cover(original); input.louRecord = { ...original, ...changes };
    expect(() => createInsuranceDirectPdf(input)).toThrow("attached LOU record must match");
    expect(original.amount).toBe(500);
  });

  it("does not append any LOU form for a DV-only cover letter", () => {
    const input = cover(record()); input.hasLou = false;
    const text = pages(createInsuranceDirectPdf(input)).join(" ");
    expect(text).toContain("Pay $3,000.00.");
    expect(text).not.toContain("Rental Reimbursement Request");
    expect(text).not.toContain("SYN-RO-444");
  });

  it("prints the actual published weekly rate, not rounded daily rate multiplied back by seven", () => {
    const input = { ...record(), vehicleClass: "Toyota Camry (2025 & newer)", dailyRate: 61.29, amount: Number((10 * 61.29).toFixed(2)), weeklyRate: 429, customRate: false,
      rateSource: "DriveWhip_Rate_Sheet.xlsx · Weekly Rates · effective 2026-08-12 · Source cell B11." };
    const standalone = pages(createStandaloneLouPdf(input)).join(" ");
    const appended = pages(createInsuranceDirectPdf(cover(input))).join(" ");
    for (const text of [standalone, appended]) {
      expect(text).toContain("$429.00/wk");
      expect(text).toContain("$61.29/day");
      expect(text).toContain("DriveWhip_Rate_Sheet.xlsx");
      expect(text).not.toContain("$429.03/wk");
    }
  });

  it("does not attribute a handler-entered custom override to the published weekly sheet", () => {
    const text = pages(createStandaloneLouPdf({ ...record(), weeklyRate: 429, rateSource: "SHOULD_NOT_PRINT" })).join(" ");
    expect(text).toContain("Handler-entered custom rate");
    expect(text).not.toContain("SHOULD_NOT_PRINT");
    expect(text).not.toContain("$429.00/wk");
  });

  it("rejects inconsistent published weekly-rate metadata", () => {
    expect(() => createStandaloneLouPdf({ ...record(), customRate: false, weeklyRate: 429 })).toThrow("published weekly rate must match");
  });
});
