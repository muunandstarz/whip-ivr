import { describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { jsPDF } from "jspdf";
import ts from "typescript";
import { COI_MIN_FONT_SIZE, coiText, createCoiLayout, wrapCoiText, type CoiGeometry } from "../client/src/lib/coiLayout";

const source = readFileSync("client/src/pages/DocGenerator.tsx", "utf8");
const coi = source.slice(source.indexOf("export function UnifiedCOITab"), source.indexOf("function KlutchDecPageTab"));
const renderer = coi.slice(coi.indexOf('    const doc = new jsPDF('), coi.indexOf("    setPreviewPdfUrl(getPDFDataUrl(doc));"));
const stateRules = new Function(`return ${source.slice(source.indexOf("}> = {", source.indexOf("const COI_STATE_RULES")) + 5, source.indexOf("\n};", source.indexOf("const COI_STATE_RULES")) + 2)};`)() as Record<string, any>;
const logo = (name: string) => source.match(new RegExp(`const ${name} = "([^"]+)"`))![1];

type Form = {
  namedOperator: string; vehicleYear: string; vehicleMake: string; vehicleModel: string;
  vin: string; plateNumber: string; subscriptionStartDate: string; expirationDate: string;
  certNumber: string; revisionNumber: string;
};
const defaults: Form = {
  namedOperator: "Synthetic Test Operator", vehicleYear: "2026", vehicleMake: "Toyota", vehicleModel: "Camry",
  vin: "1HGCM82633A004352", plateNumber: "TEST-123", subscriptionStartDate: "2026-07-01",
  expirationDate: "2026-12-31", certNumber: "MD000S0137123", revisionNumber: "0",
};
const javascriptRenderer = ts.transpileModule(renderer, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const runRenderer = new Function("jsPDF", "createCoiLayout", "coiText", "form", "isKlutch", "signoff", "state", "rules",
  "umRejected", "pipWaived", "isFloridaPipMandatory", "fmtDate", "fmtDateLong", "coverageStartDate", "KLUTCH_LOGO_B64", "MCL_LOGO_B64", `${javascriptRenderer}\nreturn doc;`);
function render(options: { form?: Partial<Form>; state?: string; klutch?: boolean; umRejected?: boolean; pipWaived?: boolean; signer?: { name: string; title: string } } = {}) {
  const geometry: CoiGeometry[] = [];
  const images: { page: number; x: number; y: number; width: number; height: number }[] = [];
  class TrackedPDF extends jsPDF {
    constructor(options: any) {
      super(options);
      const addImage = this.addImage.bind(this);
      this.addImage = ((...args: any[]) => {
        images.push({ page: this.getNumberOfPages(), x: args[2], y: args[3], width: args[4], height: args[5] });
        return (addImage as any)(...args);
      }) as typeof this.addImage;
    }
  }
  const form = { ...defaults, ...options.form }, state = options.state ?? "MD";
  const doc = runRenderer(TrackedPDF, (pdf: jsPDF, config: any) => createCoiLayout(pdf, { ...config, onGeometry: item => geometry.push(item) }),
    coiText, form, options.klutch ?? false, options.signer ?? { name: "Approved Shared Name", title: "Approved Shared Title" },
    state, stateRules[state], options.umRejected ?? state === "FL", options.pipWaived ?? false, state === "FL",
    (value: string) => value ? value.split("-").slice(1).concat(value.split("-")[0]).join("/") : "—",
    (value: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—",
    form.subscriptionStartDate, logo("KLUTCH_LOGO_B64"), logo("MCL_LOGO_B64")) as jsPDF;
  if (process.env.COI_LAYOUT_ARTIFACT_DIR) {
    mkdirSync(process.env.COI_LAYOUT_ARTIFACT_DIR, { recursive: true });
    const filename = `${options.klutch ? "klutch-stress" : `metrocars-${state}`}.pdf`;
    writeFileSync(path.join(process.env.COI_LAYOUT_ARTIFACT_DIR, filename), Buffer.from(doc.output("arraybuffer")));
  }
  return { doc, geometry, images };
}
function assertGeometry(geometry: CoiGeometry[], doc: jsPDF) {
  let cell: CoiGeometry | undefined;
  const bottom = doc.internal.pageSize.getHeight() - 16;
  for (const item of geometry) {
    expect(item.x).toBeGreaterThanOrEqual(12 - 0.001);
    expect(item.x + item.width).toBeLessThanOrEqual(doc.internal.pageSize.getWidth() - 12 + 0.001);
    expect(item.y + item.height).toBeLessThanOrEqual(bottom + 0.001);
    if (item.page > 1) expect(item.y).toBeGreaterThanOrEqual(23);
    if (item.kind === "cell") cell = item;
    else {
      expect(cell).toBeDefined();
      expect(item.page).toBe(cell!.page);
      expect(item.fontSize).toBeGreaterThanOrEqual(COI_MIN_FONT_SIZE);
      expect(item.x).toBeGreaterThanOrEqual(cell!.x - 0.001);
      expect(item.x + item.width).toBeLessThanOrEqual(cell!.x + cell!.width + 0.001);
      expect(item.y).toBeGreaterThanOrEqual(cell!.y);
      expect(item.y + item.height).toBeLessThanOrEqual(cell!.y + cell!.height + 0.001);
    }
  }
  const texts = geometry.filter(item => item.kind === "text" && item.text);
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i], b = texts[j];
      if (a.page !== b.page) continue;
      const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      expect(overlapX > 0.001 && overlapY > 0.001, `Overlapping text: ${a.text} / ${b.text}`).toBe(false);
    }
  }
}
const printed = (geometry: CoiGeometry[]) => geometry.filter(item => item.kind === "text").map(item => item.text).join(" ");

describe("COI measured PDF geometry", () => {
  it("restores the normal MetroCars certificate to one page with the original shared header and boxed sections", () => {
    const { doc, geometry } = render();
    expect(doc.getNumberOfPages()).toBe(1);
    assertGeometry(geometry, doc);
    const title = geometry.find(item => item.text === "CERTIFICATE OF INSURANCE")!;
    const date = geometry.find(item => item.text === "07/01/2026")!;
    expect(title.y).toBeLessThan(15);
    expect(date.y).toBeLessThan(20);
    const disclaimerCell = geometry.find(item => item.kind === "cell" && item.y >= 30)!;
    expect(disclaimerCell.y).toBeCloseTo(32, 2);
    const header = geometry.find(item => item.text === "TYPE OF INSURANCE")!;
    expect(header.y).toBeLessThan(145);
    expect(printed(geometry)).not.toContain("CONTINUED");
    expect(geometry.filter(item => item.text?.includes("© Metrocars")).every(item => item.y + item.height <= 263.4)).toBe(true);
  });

  it("keeps realistic long names, vehicles, certificate IDs and September dates on one page without losing fields", () => {
    const { doc, geometry } = render({ form: {
      namedOperator: "Synthetic Alexandria Catherine Montgomery-Sample",
      vehicleModel: "Model Y Long Range All-Wheel Drive Premium Package",
      certNumber: "SAMPLE-COI-NOT-ISSUED", revisionNumber: "REVIEW-2026-11",
      subscriptionStartDate: "2025-09-30", expirationDate: "2026-09-30",
    } });
    expect(doc.getNumberOfPages()).toBe(1);
    assertGeometry(geometry, doc);
    expect(printed(geometry)).toContain("September 30, 2025");
    expect(printed(geometry)).toContain("September 30, 2026");
    expect(printed(geometry)).toContain(defaults.vin);
    expect(printed(geometry)).toContain("CANCELLATION");
  });

  it("centers all seven effective and expiration dates in their own single cells, not from the policy inset", () => {
    const { doc, geometry } = render();
    assertGeometry(geometry, doc);
    const tableStart = geometry.find(item => item.text === "TYPE OF INSURANCE")!.y;
    const eff = geometry.filter(item => item.text === "07/01/2026" && item.y > tableStart);
    const exp = geometry.filter(item => item.text === "12/31/2026" && item.y > tableStart);
    expect(eff).toHaveLength(7); expect(exp).toHaveLength(7);
    for (const item of eff) expect(item.x + item.width / 2).toBeCloseTo(12 + 11 + 9.5 + 52 + 25 + 19 / 2, 3);
    for (const item of exp) expect(item.x + item.width / 2).toBeCloseTo(12 + 11 + 9.5 + 52 + 25 + 19 + 19 / 2, 3);
    for (const item of [...eff, ...exp]) expect(item.fontSize).toBe(7.5);
  });

  it("keeps the existing logo clear of title/date and fits every issuer, insured, table, paragraph and footer cell", () => {
    const { doc, geometry, images } = render();
    assertGeometry(geometry, doc);
    expect(images).toHaveLength(1);
    const image = images[0];
    for (const text of geometry.filter(item => item.page === image.page && item.kind === "text" && item.text)) {
      expect(Math.min(image.x + image.width, text.x + text.width) > Math.max(image.x, text.x)
        && Math.min(image.y + image.height, text.y + text.height) > Math.max(image.y, text.y), `Logo overlaps ${text.text}`).toBe(false);
    }
    const vin = geometry.find(item => item.text === `VIN: ${defaults.vin}`)!;
    const vehicle = geometry.find(item => item.text?.startsWith("RENTAL VEHICLE:"))!;
    expect(vin.y).toBeGreaterThan(vehicle.y);
    expect(vin.x + vin.width).toBeLessThan(108);
    expect(doc.output("arraybuffer").byteLength).toBeGreaterThan(1000);
    expect(printed(geometry)).toContain("Maryland MVA / Self-Insured");
    expect(printed(geometry)).toContain("Authorized Representative");
  });

  it.each(["MD", "VA", "FL", "GA", "IL", "MA", "PA", "TX"])("bounds every coverage row and preserves approved limits/elections for %s", state => {
    for (const umRejected of [false, true]) {
      const { doc, geometry } = render({ state, umRejected, pipWaived: true });
      assertGeometry(geometry, doc);
      expect(doc.getNumberOfPages()).toBe(1);
      const text = printed(geometry);
      expect(text).toContain(stateRules[state].biPP);
      expect(text).toContain(stateRules[state].biPO);
      expect(text).toContain(stateRules[state].pdLimit);
      expect(text).toContain("INCLUDED");
      expect(text).toContain("07/01/2026");
      expect(text).toContain("12/31/2026");
      if (state === "FL") expect(text).toContain("$10,000");
      if (stateRules[state].pip && state !== "FL") expect(text).toContain("WAIVED BY NAMED INSURED");
      if (umRejected) expect(text).toContain("REJECTED BY NAMED INSURED");
    }
  });

  it("wraps long unbroken policy IDs, operator names, vehicles, revisions and approved signoff without clipping or scaling", () => {
    const id = "LONGPOLICY".repeat(55), name = "Alexandria Extended Family Operator ".repeat(30).trim();
    const { doc, geometry } = render({ klutch: true, form: {
      certNumber: id, namedOperator: name, vehicleModel: "Long model trim and package ".repeat(35), revisionNumber: "REVISION".repeat(20),
    }, signer: { name: "Canonical Approved Handler ".repeat(12), title: "Approved Senior Liability Specialist ".repeat(15) } });
    assertGeometry(geometry, doc);
    expect(doc.getNumberOfPages()).toBeGreaterThan(2);
    const text = printed(geometry);
    expect(text).toContain("Canonical Approved Handler");
    expect(text).toContain("Approved Senior Liability Specialist");
    expect(text).toContain("17966");
    expect(text).toContain("THIS CERTIFICATE IS ISSUED AS PROOF OF FINANCIAL RESPONSIBILITY");
    expect(text).toContain("4. Unauthorized/unlisted operator exclusion applies.");
    expect(text).toContain("© Klutch Risk Retention Group");
    expect(geometry.filter(item => item.text === "TYPE OF INSURANCE").length).toBeGreaterThan(1);
  });

  it("continues a huge full-width paragraph with every word preserved above the footer zone", () => {
    const doc = new jsPDF({ unit: "mm", format: "letter" });
    const geometry: CoiGeometry[] = [];
    const layout = createCoiLayout(doc, { start: 240, onGeometry: item => geometry.push(item) });
    const words = Array.from({ length: 2000 }, (_, i) => `word${i}`);
    layout.row([[coiText(words.join(" "), 8)]], { gapAfter: 3 });
    layout.finish("Footer certificate and contact details");
    assertGeometry(geometry, doc);
    expect(doc.getNumberOfPages()).toBeGreaterThan(2);
    expect(printed(geometry).split(" ").filter(word => /^word\d+$/.test(word))).toEqual(words);
  });

  it("splits overlong words with actual PDF metrics and does not reduce the minimum readable font", () => {
    const doc = new jsPDF({ unit: "mm", format: "letter" });
    const value = "ABCDEFGHIJKLMNOPQRSTUV0123456789".repeat(8);
    const lines = wrapCoiText(doc, coiText(value, 4), 20);
    expect(lines.map(line => line.text).join("")).toBe(value);
    expect(lines.every(line => line.width <= 20 && line.size === COI_MIN_FONT_SIZE)).toBe(true);
  });
});
