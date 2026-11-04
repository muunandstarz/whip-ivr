import { jsPDF } from "jspdf";
import { describe, expect, it } from "vitest";
import {
  appendLouPacketAttachment,
  createStandaloneLouPdf,
  numberLouPages,
  type StandaloneLouInput,
} from "./standaloneLouPdf";
import {
  createInsuranceDirectPdf,
  type InsuranceDirectPdfInput,
} from "./insuranceDirectPdf";

const REQUEST_HEADING = "Loss of Use / Rental Reimbursement Request";
const FOOTER = "Whip Claims Management | PO BOX 10622 Rockville, MD 20850 | (855) 906-5949";
const RAW_RATE_SOURCE = "DriveWhip_Rate_Sheet.xlsx · Weekly Rates · effective 2026-08-12 · Source cell B11.";

function completeRecord(overrides: Partial<StandaloneLouInput> = {}): StandaloneLouInput {
  return {
    claimNumber: "TST-0000-222222-444444",
    carrierClaimNumber: "SYN-ACTIVE-444",
    dateOfLoss: "October 1, 2026",
    carrier: "Synthetic Carrier",
    adjuster: "Synthetic Adjuster",
    vehicle: "2025 Toyota Camry",
    vin: "4T1TESTVIN12345678",
    driver: "Synthetic Driver",
    registeredOwner: "Metrocars Leasing Corp.",
    vehicleStatus: "Actively leased / Revenue-generating",
    vehicleClass: "Toyota Camry (2025 & newer)",
    repairFacility: "Synthetic Collision Center",
    roNumber: "SYN-RO-444",
    repairStart: "October 5, 2026",
    repairEnd: "October 15, 2026",
    days: 10,
    dailyRate: 61.29,
    weeklyRate: 429,
    amount: 612.90,
    customRate: false,
    rateSource: RAW_RATE_SOURCE,
    marketName: "Washington DC (Rockville)",
    letterDate: "November 3, 2026",
    handlerName: "Synthetic Handler",
    handlerTitle: "Claims Resolution Specialist",
    handlerExtension: "028",
    handlerEmail: "synthetic.handler@example.test",
    // All fixtures are synthetic and self-contained; no asset retrieval is needed.
    logoBase64: "",
    snapshots: [{
      reportMonth: "September 2026",
      repairDays: 10,
      fleetCount: 749,
      rentCount: 739,
      availableCount: 10,
      utilization: "98.7%",
      dataStatus: "latest_available",
    }],
    sourceNote: "Source: September 2026 monthly report; latest available context only, not daily occupancy.",
    reconciliation: "739 rented + 10 reported unrented = 749 reported rentable fleet.",
    verifiedAuthority: "Handler-supplied claim-specific supporting reference: synthetic Exhibit E, independently verified by the handler.",
    ...overrides,
  };
}

function directInput(louRecord: StandaloneLouInput): InsuranceDirectPdfInput {
  return {
    letterDate: louRecord.letterDate,
    claimNumber: louRecord.claimNumber,
    carrierClaimNumber: louRecord.carrierClaimNumber,
    dateOfLoss: louRecord.dateOfLoss,
    carrier: louRecord.carrier,
    adjuster: louRecord.adjuster,
    insuredName: "Synthetic Insured",
    driver: louRecord.driver,
    vehicle: louRecord.vehicle,
    vin: louRecord.vin,
    repairFacility: louRecord.repairFacility,
    repairCompleted: louRecord.repairEnd,
    liabilityStatement: "Whip's claim position is supported by synthetic Exhibits A and B; this is not an assertion of carrier acceptance.",
    hasLou: true,
    hasDv: true,
    louDays: louRecord.days,
    dailyRate: louRecord.dailyRate,
    louAmount: louRecord.amount,
    repairStart: louRecord.repairStart,
    repairEnd: louRecord.repairEnd,
    // This is the manual DV entry, not a value inferred from a valuation pair.
    dvAmount: 3000,
    dvMethod: "Handler-entered synthetic comparable-market report, Exhibit D.",
    carfaxReported: false,
    stateAuthority: "",
    handlerName: louRecord.handlerName,
    handlerTitle: louRecord.handlerTitle,
    handlerExtension: louRecord.handlerExtension,
    handlerEmail: louRecord.handlerEmail,
    logoBase64: louRecord.logoBase64,
    snapshots: louRecord.snapshots,
    marketName: louRecord.marketName,
    sourceNote: louRecord.sourceNote,
    reconciliation: louRecord.reconciliation,
    attachLouSchedule: true,
    louRecord,
  };
}

function dummyCoverPacket(record: StandaloneLouInput): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  doc.text("Synthetic packet cover", 14, 24);
  appendLouPacketAttachment(doc, record);
  numberLouPages(doc);
  return doc;
}

function pageStreams(doc: jsPDF): string[] {
  // The runtime holds PDF command arrays, despite jsPDF's number[] declaration.
  return (doc.internal.pages as unknown as string[][]).slice(1).map(page => page.join("\n"));
}

function literalStrings(stream: string): string[] {
  return Array.from(stream.matchAll(/\(((?:\\[\s\S]|[^\\)])*)\)\s*Tj/g), match =>
    match[1]
      .replace(/\\([0-7]{1,3}|[nrtbf()\\])/g, (_match, escape: string) => {
        const escapes: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" };
        return /^[0-7]/.test(escape)
          ? String.fromCharCode(parseInt(escape, 8))
          : (escapes[escape] ?? escape);
      })
      .replace(/\x97/g, "—")
      .replace(/\x96/g, "–"),
  );
}

function pageText(doc: jsPDF): string[] {
  return pageStreams(doc).map(page => literalStrings(page).join(" "));
}

function withoutPageNumberText(stream: string): string {
  // Strip ONLY the varying literal. Retain its text block, font, color and Td
  // position, and every other command (including page-initial drawing state).
  return stream.replace(/\(Page \d+ of \d+\)(\s*Tj)/g, "()$1");
}

function firstLouPage(doc: jsPDF): number {
  // Letterhead text precedes the heading; startsWith() would miss the full form.
  return pageStreams(doc).findIndex(page => literalStrings(page).includes(REQUEST_HEADING));
}

function assertNumberedOnce(doc: jsPDF): void {
  const streams = pageStreams(doc);
  streams.forEach((stream, index) => {
    const strings = literalStrings(stream);
    expect(strings.filter(text => /^Page \d+ of \d+$/.test(text))).toEqual([
      `Page ${index + 1} of ${streams.length}`,
    ]);
    expect(strings.filter(text => text === FOOTER)).toHaveLength(1);
  });
}

function assertFullPageParity(standalone: jsPDF, packet: jsPDF, attachmentStart: number): void {
  expect(attachmentStart).toBeGreaterThan(0);
  const expected = pageStreams(standalone);
  const actual = pageStreams(packet).slice(attachmentStart);
  expect(actual).toHaveLength(expected.length);
  // No text-only comparison, removal of drawing-state commands, coordinate
  // rounding, font substitution, whitespace normalization or header filtering.
  expect(actual.map(withoutPageNumberText)).toEqual(expected.map(withoutPageNumberText));
  assertNumberedOnce(standalone);
  assertNumberedOnce(packet);
}

function assertPublishedContentAndSourcePrivacy(doc: jsPDF, record: StandaloneLouInput): void {
  const text = pageText(doc).join(" ");
  for (const retained of [
    "Rate basis: Whip Standard Rate",
    "$429.00/wk",
    "$61.29/day",
    "$612.90",
    "SOURCE NOTE",
    record.sourceNote,
    "RECONCILIATION",
    record.reconciliation,
    "Monthly Fleet Utilization & Claim Documentation",
    "monthly market snapshot, not a daily tracking feed",
  ]) expect(text).toContain(retained);
  expect(text).not.toMatch(/RATE SOURCE|DriveWhip_Rate_Sheet\.xlsx|Source cell|\$429\.03\/wk|NaN|undefined/);
  expect(text).not.toContain(record.rateSource!);
}

describe("Full standalone LOU renderer attachment parity (runtime jsPDF)", () => {
  it("uses identical complete page command streams after a dummy packet cover", () => {
    const record = completeRecord();
    const before = structuredClone(record);
    const standalone = createStandaloneLouPdf(record);
    const packet = dummyCoverPacket(record);
    expect(firstLouPage(standalone)).toBe(0);
    expect(firstLouPage(packet)).toBe(1);
    expect(standalone.getNumberOfPages()).toBeGreaterThanOrEqual(2);
    assertFullPageParity(standalone, packet, 1);

    // The strict comparison includes Helvetica font selection, body/table
    // coordinates and drawing operations as well as letterhead/footer text.
    const firstStream = pageStreams(standalone)[0];
    expect(firstStream).toContain("/F2 14 Tf");
    expect(firstStream).toMatch(/-?[\d.]+ -?[\d.]+ -?[\d.]+ -?[\d.]+ re/);
    expect(firstStream).toMatch(/-?[\d.]+ -?[\d.]+ m\n-?[\d.]+ -?[\d.]+ l\nS/);
    const text = pageText(standalone).join(" ");
    for (const value of [
      record.claimNumber, record.carrierClaimNumber, record.dateOfLoss,
      record.carrier, record.adjuster, record.vehicle, record.vin, record.driver,
      record.registeredOwner, record.vehicleStatus, record.vehicleClass,
      record.repairFacility, record.roNumber, record.repairStart, record.repairEnd,
      record.marketName, record.letterDate, record.handlerName, record.handlerTitle,
      record.handlerEmail, `ext. ${record.handlerExtension}`, record.verifiedAuthority!,
      "REPAIR PERIOD", "Days Claimed", "MONTHLY FLEET UTILIZATION SNAPSHOTS",
      "September 2026", "98.7%", "latest available; context only",
      "Loss of Use / Rental Reimbursement Supporting Basis",
    ]) expect(text).toContain(value);
    expect(record).toEqual(before);
  });

  it("appends identical standalone pages in the actual active-claim LOU/DV packet and preserves manual DV", () => {
    const record = completeRecord();
    const input = directInput(record);
    const before = structuredClone(input);
    const standalone = createStandaloneLouPdf(record);
    const packet = createInsuranceDirectPdf(input);
    const start = firstLouPage(packet);
    assertFullPageParity(standalone, packet, start);
    const cover = pageText(packet).slice(0, start).join(" ");
    expect(cover).toContain("manually entered amount of $3,000.00");
    expect(cover).toContain("10 days at $61.29 per day, for $612.90");
    expect(cover).toContain("Total demand $3,612.90");
    expect(cover).toContain("Pay $3,612.90.");
    expect(cover).not.toMatch(/\$3,500\.00|\$3,612\.86|before the loss and|after repair; they reconcile/);
    const appended = pageText(packet).slice(start).join(" ");
    expect(appended).not.toMatch(/\$3,612\.90|\$3612\.90|Loss of use support schedule/);
    expect(input).toEqual(before);
    expect(input.dvAmount).toBe(3000);
    expect(record.amount).toBe(612.90);
  });

  it("omits internal rate provenance while retaining the published rate basis and monthly source reporting in every output", () => {
    const record = completeRecord();
    for (const doc of [
      createStandaloneLouPdf(record),
      dummyCoverPacket(record),
      createInsuranceDirectPdf(directInput(record)),
    ]) assertPublishedContentAndSourcePrivacy(doc, record);
  });

  it("keeps custom-rate pages identical without attributing the override to the published workbook", () => {
    const record = completeRecord({ customRate: true, dailyRate: 50, amount: 500 });
    const standalone = createStandaloneLouPdf(record);
    const dummy = dummyCoverPacket(record);
    const direct = createInsuranceDirectPdf(directInput(record));
    assertFullPageParity(standalone, dummy, 1);
    assertFullPageParity(standalone, direct, firstLouPage(direct));
    for (const doc of [standalone, dummy, direct]) {
      const text = pageText(doc).join(" ");
      expect(text).toContain("Rate basis: Handler-entered custom rate");
      expect(text).toContain("$50.00/day");
      expect(text).toContain("$500.00");
      expect(text).not.toMatch(/Whip Standard Rate|\$429\.00\/wk|RATE SOURCE|DriveWhip_Rate_Sheet\.xlsx|Source cell/);
    }
    expect(pageText(direct).join(" ")).toContain("Pay $3,500.00.");
  });

  it("preserves wrapped long identity fields and their drawing coordinates across attachments", () => {
    const record = completeRecord({
      registeredOwner: `OWNER START ${"Synthetic registered owner department ".repeat(12)}OWNER END`,
      carrier: `CARRIER START ${"Synthetic carrier claims division ".repeat(8)}CARRIER END`,
      adjuster: `ADJUSTER START ${"Synthetic adjuster team ".repeat(8)}ADJUSTER END`,
      repairFacility: `FACILITY START ${"Synthetic collision repair department ".repeat(8)}FACILITY END`,
    });
    const standalone = createStandaloneLouPdf(record);
    const dummy = dummyCoverPacket(record);
    const direct = createInsuranceDirectPdf(directInput(record));
    assertFullPageParity(standalone, dummy, 1);
    assertFullPageParity(standalone, direct, firstLouPage(direct));
    for (const doc of [standalone, dummy, direct]) {
      const text = pageText(doc).join(" ");
      for (const marker of ["OWNER START", "OWNER END", "CARRIER START", "CARRIER END", "ADJUSTER START", "ADJUSTER END", "FACILITY START", "FACILITY END"]) {
        expect(text).toContain(marker);
      }
    }
  });

  it("keeps unavailable monthly context identical without changing the gross LOU or combined demand", () => {
    const record = completeRecord({
      snapshots: [{ reportMonth: "October 2026", repairDays: 10, fleetCount: 0, rentCount: 0, availableCount: 0, utilization: "—", dataStatus: "unavailable" }],
      sourceNote: "No October monthly snapshot is available; no daily occupancy or assumed percentage is asserted.",
      reconciliation: "Monthly fleet counts are unavailable and do not alter the documented ten repair days or the daily rate.",
    });
    const standalone = createStandaloneLouPdf(record);
    const dummy = dummyCoverPacket(record);
    const direct = createInsuranceDirectPdf(directInput(record));
    assertFullPageParity(standalone, dummy, 1);
    assertFullPageParity(standalone, direct, firstLouPage(direct));
    for (const doc of [standalone, dummy, direct]) {
      const text = pageText(doc).join(" ");
      expect(text).toContain("(unavailable)");
      expect(text).toContain(record.sourceNote);
      expect(text).toContain("$612.90");
      expect(text).not.toMatch(/NaN|undefined|100%|RATE SOURCE|DriveWhip_Rate_Sheet\.xlsx|Source cell/);
    }
    expect(pageText(direct).join(" ")).toContain("Pay $3,612.90.");
  });
});
