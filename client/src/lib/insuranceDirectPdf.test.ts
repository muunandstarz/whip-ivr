import { jsPDF } from "jspdf";
import { describe, expect, it, vi } from "vitest";
import { createInsuranceDirectPdf, type InsuranceDirectPdfInput } from "./insuranceDirectPdf";

function input(overrides: Partial<InsuranceDirectPdfInput> = {}): InsuranceDirectPdfInput {
  return {
    letterDate: "November 3, 2026",
    claimNumber: "WHIP-1042",
    carrierClaimNumber: "CARRIER-8831",
    dateOfLoss: "September 7, 2026",
    carrier: "Example Insurance",
    adjuster: "Jordan Adjuster",
    insuredName: "Taylor Insured",
    driver: "Casey Driver",
    vehicle: "2023 Toyota Camry",
    vin: "4T1TESTVIN12345678",
    repairFacility: "Example Collision Center",
    repairCompleted: "October 15, 2026",
    liabilityStatement: "Your insured caused the collision.",
    hasLou: true,
    hasDv: true,
    louDays: 20,
    dailyRate: 50,
    utilizationPercent: 80,
    utilizationBasis: "Repair-day weighted September and October monthly fleet snapshots",
    louAmount: 800,
    repairStart: "September 26, 2026",
    repairEnd: "October 15, 2026",
    prelossValue: 25000,
    postlossValue: 22000,
    dvAmount: 3000,
    dvMethod: "Comparable-market appraisal",
    carfaxReported: true,
    stateAuthority: "",
    handlerName: "Morgan Handler",
    handlerTitle: "Claims Specialist",
    handlerExtension: "104",
    handlerEmail: "morgan@drivewhip.com",
    logoBase64: "",
    snapshots: [
      { reportMonth: "September 2026", repairDays: 5, fleetCount: 100, rentCount: 70, availableCount: 30, utilization: "70%", dataStatus: "Reported" },
      { reportMonth: "October 2026", repairDays: 15, fleetCount: 100, rentCount: 83.3333, availableCount: 16.6667, utilization: "83.3333%", dataStatus: "Reported" },
    ],
    marketName: "Washington, DC",
    sourceNote: "Monthly fleet reports supplied by operations.",
    reconciliation: "Five September repair days and fifteen October repair days yield 80% period-weighted occupancy.",
    attachLouSchedule: false,
    ...overrides,
  };
}

// Read only the uncompressed strings emitted by jsPDF, not a PDF extractor.
function decodeLiteral(value: string): string {
  return value
    .replace(/\\([0-7]{1,3}|[nrtbf()\\])/g, (_match, escape: string) => {
      const escapes: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" };
      return /^[0-7]/.test(escape) ? String.fromCharCode(parseInt(escape, 8)) : (escapes[escape] ?? escape);
    })
    .replace(/\x97/g, "—")
    .replace(/\x96/g, "–");
}

function strings(stream: string): string[] {
  return Array.from(stream.matchAll(/\(((?:\\[\s\S]|[^\\)])*)\)\s*Tj/g), match => decodeLiteral(match[1]));
}

function pageStreams(doc: jsPDF): string[] {
  // jsPDF's declaration types this as number[], but its runtime contains each
  // page's array of PDF commands. Use a local cast, not a library patch.
  const pages = doc.internal.pages as unknown as string[][];
  return pages.slice(1).map(page => page.join("\n"));
}

function pageText(doc: jsPDF): string[] {
  return pageStreams(doc).map(page => strings(page).join(" "));
}

function pdfText(doc: jsPDF): string {
  return strings(doc.output()).join(" ");
}

function assertFooterSafe(doc: jsPDF): void {
  const height = doc.internal.pageSize.getHeight();
  const width = doc.internal.pageSize.getWidth();
  const scale = doc.internal.scaleFactor;
  for (const stream of pageStreams(doc)) {
    const textBlocks = Array.from(stream.matchAll(/BT\n([\s\S]*?)\nET/g), match => match[1]);
    for (const block of textBlocks) {
      const text = strings(block).join(" ");
      const position = /(-?[\d.]+) (-?[\d.]+) Td/.exec(block);
      expect(position, text).not.toBeNull();
      if (!position) continue;
      const x = Number(position[1]) / scale;
      const y = height - Number(position[2]) / scale;
      const size = Number(/\/F\d+ ([\d.]+) Tf/.exec(block)?.[1] ?? 10);
      const bold = /\/F2 /.test(block);
      const footer = text.startsWith("Whip Claims Management |") || /^Page \d+ of \d+$/.test(text);
      expect(y, text).toBeGreaterThanOrEqual(25.4);
      if (!footer) expect(y + 1, text).toBeLessThanOrEqual(height - 24);
      else expect(y, text).toBeGreaterThan(height - 24);
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(size);
      // Right/center alignment is already resolved by jsPDF into the Td x.
      expect(x, text).toBeGreaterThanOrEqual(25.4 - 0.01);
      expect(x + doc.getTextWidth(text), text).toBeLessThanOrEqual(width - 25.4 + 0.05);
    }
    // Every body table cell also stays above the reserved band.
    for (const match of stream.matchAll(/(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) re/g)) {
      const top = height - Number(match[2]) / scale;
      const cellHeight = -Number(match[4]) / scale;
      expect(top + cellHeight).toBeLessThanOrEqual(height - 24 + 0.01);
    }
  }
}

describe("Insurance Direct jsPDF renderer", () => {
  it("exports a synchronous pure jsPDF A4 document with Helvetica 10-point body", () => {
    const doc = createInsuranceDirectPdf(input());
    // jsPDF is a factory: even `new jsPDF()` returns an API object rather than
    // an instance of its constructor. Verify the actual API and output.
    expect(typeof doc.addPage).toBe("function");
    expect(typeof doc.save).toBe("function");
    expect(doc).not.toHaveProperty("then");
    expect(doc.output()).toMatch(/^%PDF-/);
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(210, 1);
    expect(doc.internal.pageSize.getHeight()).toBeCloseTo(297, 1);
    expect(doc.output()).toContain("/BaseFont /Helvetica");
    expect(doc.output()).toContain("/F1 10 Tf");
    assertFooterSafe(doc);
  });

  it("renders LOU only with its thesis and no DV rows, appraisal, Carfax, or total row", () => {
    const text = pdfText(createInsuranceDirectPdf(input({ hasDv: false, attachLouSchedule: false })));
    expect(text).toContain("Demand for Loss of Use");
    expect(text).toContain("That time is a damage your insured caused");
    expect(text).toContain("Pay $800.00.");
    expect(text).toContain("20 days at $50.00 per day, adjusted by the fleet utilization rate of 80%");
    expect(text).toContain("period-weighted monthly occupancy approximation");
    expect(text).toContain("not daily occupancy evidence");
    expect(text).not.toMatch(/Diminished value|Diminished Value|appraisal|Carfax|Total demand|\$3,000\.00|\$3,800\.00/);
    expect(text).toContain("loss of use summary and fleet log");
    expect(text).toContain("Direction of Pay and Vehicle Ownership Notice");
    expect(text).not.toContain("Loss of use support schedule");
  });

  it("renders DV only with specific values and method, no LOU or total row", () => {
    const text = pdfText(createInsuranceDirectPdf(input({ hasLou: false, attachLouSchedule: true })));
    expect(text).toContain("Demand for Diminished Value");
    expect(text).toContain("That loss in value is a damage your insured caused");
    expect(text).toContain("The enclosed appraisal documents the loss in value after repair");
    expect(text).toContain("$25,000.00 before the loss and $22,000.00 after repair");
    expect(text).toContain("a loss of $3,000.00, using Comparable-market appraisal");
    expect(text).toContain("Pay $3,000.00.");
    expect(text).toContain("Carfax history report");
    expect(text).not.toMatch(/Loss of [Uu]se|loss of use|fleet log|utilization|Total demand|\$800\.00|\$3,800\.00/);
    expect(text).not.toContain("sells for less");
  });

  it("renders both items, exactly one total table row, and the selected combined thesis", () => {
    const text = pdfText(createInsuranceDirectPdf(input()));
    expect(text).toContain("Demand for Loss of Use and Diminished Value");
    expect(text).toContain("Repair does not make the owner whole");
    expect(text).toContain("Both are documented in the enclosed packet");
    expect(text).toContain("# Item Amount Support (attached)");
    expect(text).toContain("This letter demands $3,800.00 for loss of use and diminished value");
    expect(text.match(/Total demand/g)).toHaveLength(1);
    expect(text).toContain("Total demand $3,800.00");
    expect(text).toContain("Pay $3,800.00.");
    expect(text).toContain("$800.00");
    expect(text).toContain("$3,000.00");
    expect(text).toContain("Please respond within ten (10) days of receipt.");
  });

  it.each([
    { hasLou: true, hasDv: false },
    { hasLou: false, hasDv: true },
    { hasLou: true, hasDv: true },
  ])("never prints template markup, conditional directions, or hardcoded legal authority (%j)", flags => {
    const text = pdfText(createInsuranceDirectPdf(input(flags)));
    expect(text).not.toMatch(/\{\{|\}\}|#if|\/if|demand_title_items|use ONE|lou only:|dv only:|Delete the row|optional; populate|<\/?[a-z][^>]*>/i);
    expect(text).not.toMatch(/17c|O\.C\.G\.A|Georgia|Maryland law|statute|§|case law|Restatement|\.\.\.\s*$/i);
  });

  it("includes only handler-supplied optional authority and gates Carfax to the DV section", () => {
    const authority = "Handler-supplied authority: Example State Code 12-34, independently verified.";
    const text = pdfText(createInsuranceDirectPdf(input({ stateAuthority: authority, carfaxReported: false })));
    expect(text).toContain(authority);
    expect(text).not.toContain("Carfax");
    const noAuthority = pdfText(createInsuranceDirectPdf(input()));
    expect(noAuthority).not.toContain("State Code");
  });

  it("uses six identity rows with VIN on its own line and preserves source payment/closing language", () => {
    const doc = createInsuranceDirectPdf(input({ handlerExtension: " ", handlerEmail: " " }));
    const raw = pageStreams(doc)[0];
    const text = pdfText(doc);
    for (const label of ["Your insured", "Vehicle owner", "Driver", "Vehicle", "Repair facility", "Repair completed"]) {
      expect(strings(raw)).toContain(label);
    }
    expect(strings(raw)).toContain("2023 Toyota Camry");
    expect(strings(raw)).toContain("VIN: 4T1TESTVIN12345678");
    expect(text).toContain("Issue payment as directed in the enclosed Direction of Pay and Vehicle Ownership Notice.");
    expect(text).toContain("does not waive any right or remedy of Metrocars Leasing Corp. or Whip Claims Management");
    expect(text).toContain("Phone: (855) 906-5949 claims@drivewhip.com");
    expect(text).not.toContain("ext.");
    expect(text).toContain("Morgan Handler Claims Specialist");
  });

  it("uses the supplied handler contact and omits empty handler identity rather than placeholders", () => {
    const text = pdfText(createInsuranceDirectPdf(input()));
    expect(text).toContain("Phone: (855) 906-5949 ext. 104 morgan@drivewhip.com");
    const empty = pdfText(createInsuranceDirectPdf(input({ handlerName: "", handlerTitle: "" })));
    expect(empty).not.toContain("handler_name");
    expect(empty).not.toContain("Morgan Handler");
    expect(empty).not.toContain("Claims Specialist");
  });

  it("keeps Demand, Payment, signature and enclosures on one page whenever the group fits", () => {
    const pages = pageText(createInsuranceDirectPdf(input()));
    const demandPage = pages.findIndex(page => page.includes("Pay $3,800.00."));
    expect(demandPage).toBeGreaterThanOrEqual(0);
    expect(pages[demandPage]).toContain("Payment");
    expect(pages[demandPage]).toContain("Sincerely,");
    expect(pages[demandPage]).toContain("Morgan Handler");
    expect(pages[demandPage]).toContain("Enclosures:");
  });

  it("appends monthly LOU support with the adjusted amount, source notes and reconciliation", () => {
    const doc = createInsuranceDirectPdf(input({ hasDv: false, attachLouSchedule: true }));
    const pages = pageText(doc);
    const schedulePage = pages.findIndex(page => page.includes("Loss of use support schedule"));
    expect(schedulePage).toBeGreaterThan(0);
    const text = pages.slice(schedulePage).join(" ");
    expect(text).toContain("20 days x $50.00 per day x 80% = $800.00");
    expect(text).toContain("Adjusted loss of use demand: $800.00");
    expect(text).not.toContain("$1,000.00");
    expect(text).toContain("Market: Washington, DC");
    expect(text).toContain("September 2026 5 100 70 30 70% Reported");
    expect(text).toContain("October 2026 15 100 83.33 16.67 83.3333% Reported");
    expect(text).toContain("Source note Monthly fleet reports supplied by operations.");
    expect(text).toContain("Reconciliation Five September repair days and fifteen October repair days");
    expect(text).not.toContain("P.O. Box 10622 Rockville, MD 20849-0622");
    assertFooterSafe(doc);
  });

  it("labels handler-confirmed utilization without inventing monthly or daily evidence", () => {
    const basis = "Handler-confirmed rental utilization for the repair period";
    const text = pdfText(createInsuranceDirectPdf(input({ hasDv: false, utilizationBasis: basis, attachLouSchedule: true })));
    expect(text).toContain(`The rate is ${basis}; it is not daily occupancy evidence.`);
    expect(text).toContain(`Utilization basis: ${basis}.`);
    expect(text).not.toContain("period-weighted monthly occupancy approximation");
  });

  it("shows missing source values as em dashes, preserving real zeros", () => {
    const doc = createInsuranceDirectPdf(input({
      hasDv: false,
      attachLouSchedule: true,
      marketName: "",
      sourceNote: " ",
      reconciliation: "",
      snapshots: [{ reportMonth: "", repairDays: Number.NaN, fleetCount: 0, rentCount: Number.NaN, availableCount: 0, utilization: "" }],
    }));
    const text = pdfText(doc);
    expect(text).toContain("Market: —");
    expect(text).toContain("— — 0 — 0 — —");
    expect(text).toContain("Source note —");
    expect(text).toContain("Reconciliation —");
    expect(text).not.toMatch(/NaN|undefined|null/);
    const noRows = pdfText(createInsuranceDirectPdf(input({ hasDv: false, attachLouSchedule: true, snapshots: [] })));
    expect(noRows).toContain("— — — — — — —");
    const unavailable = pdfText(createInsuranceDirectPdf(input({ hasDv: false, attachLouSchedule: true, snapshots: [{ reportMonth: "No reported snapshot", repairDays: 20, fleetCount: 0, rentCount: 0, availableCount: 0, utilization: "—", dataStatus: "unavailable" }] })));
    expect(unavailable).toContain("No reported snapshot 20 — — — — unavailable");
  });

  it("rejects inconsistent amounts instead of printing an incorrect equation or silently replacing the demand", () => {
    expect(() => createInsuranceDirectPdf(input({ hasDv: false, louAmount: 750, attachLouSchedule: true }))).toThrow("must reconcile");
    expect(() => createInsuranceDirectPdf(input({ hasLou: false, dvAmount: 2000 }))).toThrow("must reconcile");
  });

  it("uses only the supplied logo, exactly once, and tolerates undecodable logo data", () => {
    // Tiny image fixture represents caller-provided bytes; the renderer has no
    // bundled replacement logo and makes no request for assets.
    const logo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==";
    const api = jsPDF.API as unknown as Pick<jsPDF, "addImage">;
    const spy = vi.spyOn(api, "addImage");
    try {
      const doc = createInsuranceDirectPdf(input({ logoBase64: logo, attachLouSchedule: true }));
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]).toBe(logo);
      expect(pageStreams(doc).slice(1).join("\n")).not.toMatch(/\/I\d+ Do/);
    } finally {
      spy.mockRestore();
    }
    expect(createInsuranceDirectPdf(input({ logoBase64: "not an image" })).output()).toMatch(/^%PDF-/);
  });

  it("wraps multiline and unbroken stress content without footer collisions or repeated letterheads", () => {
    const long = "A supplied handler narrative with enough detail to exercise wrapping. ".repeat(100);
    const token = "X".repeat(450);
    const doc = createInsuranceDirectPdf(input({
      carrier: `First line\n${token}`,
      adjuster: `${token}\nSecond adjuster line`,
      insuredName: token,
      driver: token,
      vehicle: `First vehicle line\n${token}`,
      vin: token,
      repairFacility: token,
      liabilityStatement: long,
      stateAuthority: `HANDLER AUTHORITY START ${long} HANDLER AUTHORITY END`,
      handlerName: token,
      handlerTitle: long,
      handlerEmail: `${token}@example.test`,
      handlerExtension: token,
      attachLouSchedule: true,
      sourceNote: `${long}\nSOURCE NOTE END`,
      reconciliation: `${long}\nRECONCILIATION END`,
      snapshots: Array.from({ length: 32 }, (_, index) => ({
        reportMonth: `Month ${index + 1}\n${token}`,
        repairDays: index,
        fleetCount: 100,
        rentCount: 80,
        availableCount: 20,
        utilization: "80%",
        dataStatus: index === 0 ? long : "Reported",
      })),
    }));
    const pages = pageText(doc);
    expect(pages.length).toBeGreaterThan(8);
    expect(pdfText(doc)).toContain("RECONCILIATION END");
    expect(pdfText(doc)).toContain("HANDLER AUTHORITY END");
    expect(pdfText(doc).match(/P\.O\. Box 10622 Rockville, MD 20849-0622/g)).toHaveLength(1);
    pages.forEach((page, index) => {
      expect(page).toContain(`Page ${index + 1} of ${pages.length}`);
      expect(page).toContain("Whip Claims Management | PO BOX 10622 Rockville, MD 20850 | (855) 906-5949");
    });
    assertFooterSafe(doc);
  });

  it("does not mutate the caller's source data and rejects a demand with neither item", () => {
    const source = input({ attachLouSchedule: true });
    const before = structuredClone(source);
    createInsuranceDirectPdf(source);
    expect(source).toEqual(before);
    expect(() => createInsuranceDirectPdf(input({ hasLou: false, hasDv: false }))).toThrow(RangeError);
  });
});
