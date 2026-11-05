import { describe, expect, it, vi } from "vitest";
import { jsPDF } from "jspdf";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import sample from "./uadDenial.sample.json";
import { createUadDenialPdf, UAD_PDF_LAYOUT } from "./uadDenialPdf";
import { buildUadDenialText, emptyUadDenialFields, formatUadDenialDate, restoreUadDenialFields, UAD_ADVISORY, UAD_FIELD_META, UAD_FOOTER, UAD_HEADER, UAD_QUOTES, UAD_RESUBMISSION, UAD_RIGHTS, uadDenialContent, validateUadDenialFields, type UadDenialFields } from "@shared/uadDenial";

const record = (): UadDenialFields => ({ ...sample });
const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
const streams = (doc: jsPDF) => (doc.internal.pages as unknown as string[][]).slice(1).map(page => page.join("\n"));
function strings(stream: string): string[] {
  return Array.from(stream.matchAll(/\(((?:\\[\s\S]|[^\\)])*)\)\s*Tj/g), match => match[1]
    .replace(/\\([()\\])/g, "$1").replace(/\x93/g, "“").replace(/\x94/g, "”"));
}
function allText(doc: jsPDF): string { return normalize(streams(doc).map(page => strings(page).join(" ")).join(" ")); }
function assertFooterSafe(doc: jsPDF) {
  streams(doc).forEach(stream => {
    expect(strings(stream)).toContain(UAD_FOOTER);
    for (const [, block] of stream.matchAll(/BT\n([\s\S]*?)\nET/g)) {
      const text = strings(block).join(" ");
      const position = /(-?[\d.]+) (-?[\d.]+) Td/.exec(block)!;
      const size = Number(/\/F\d+ ([\d.]+) Tf/.exec(block)![1]);
      const x = Number(position[1]) / doc.internal.scaleFactor;
      const y = doc.internal.pageSize.getHeight() - Number(position[2]) / doc.internal.scaleFactor;
      const footer = text === UAD_FOOTER;
      const header = UAD_HEADER.includes(text as typeof UAD_HEADER[number]);
      doc.setFont("helvetica", /\/F3 /.test(block) ? "italic" : /\/F2 /.test(block) ? "bold" : "normal");
      doc.setFontSize(size);
      const width = doc.getStringUnitWidth(text, { doKerning: false }) * size / doc.internal.scaleFactor;
      expect(x, text).toBeGreaterThanOrEqual(UAD_PDF_LAYOUT.left - 0.1);
      expect(x + width, text).toBeLessThanOrEqual(header ? 188.7 : UAD_PDF_LAYOUT.right + 0.4);
      if (footer) expect(y).toBeCloseTo(UAD_PDF_LAYOUT.footerText, 2);
      else if (!header) {
        expect(y).toBeGreaterThanOrEqual(UAD_PDF_LAYOUT.bodyStart - 0.01);
        expect(y + 1.2, text).toBeLessThanOrEqual(UAD_PDF_LAYOUT.bodyBottom + 0.01);
      }
    }
  });
}

describe("Unauthorized Driver / UAD exact supplied letter", () => {
  it("has all ten fillable inputs, empty defaults and no owner/default signature", () => {
    expect(UAD_FIELD_META.map(meta => meta.key)).toEqual(["letter_date", "claimant_name", "claimant_company", "claimant_address", "claim_number", "date_of_loss", "property_claimed", "driver_description", "handler_name", "handler_title"]);
    expect(Object.values(emptyUadDenialFields())).toEqual(Array(10).fill(""));
    const draft = buildUadDenialText(emptyUadDenialFields());
    for (const { key } of UAD_FIELD_META.filter(meta => meta.key !== "claimant_company")) expect(draft).toContain(`{{${key}}}`);
    expect(draft).not.toContain("{{claimant_company}}");
    expect(validateUadDenialFields(emptyUadDenialFields())).toHaveLength(9);
    expect(() => createUadDenialPdf(emptyUadDenialFields())).toThrow("Letter Date is required");
    expect(createUadDenialPdf(emptyUadDenialFields(), { draft: true }).output()).toMatch(/^%PDF-/);
  });

  it("fills every actual value into final text/PDF, including multiline address, repeated claimant and loss date", () => {
    const fields = record(); const before = structuredClone(fields);
    const pdf = createUadDenialPdf(fields); const text = allText(pdf); const preview = normalize(buildUadDenialText(fields));
    for (const { key } of UAD_FIELD_META) {
      const expected = key === "letter_date" || key === "date_of_loss" ? formatUadDenialDate(fields[key])! : normalize(fields[key]);
      expect(text).toContain(expected); expect(preview).toContain(expected);
    }
    expect(text.match(/Jordan Example/g)).toHaveLength(3);
    expect(text.match(/October 15, 2026/g)).toHaveLength(2);
    expect(text).not.toMatch(/\{\{|undefined|NaN|Invalid|\[Claim/);
    expect(text).not.toContain(UAD_ADVISORY);
    expect(fields).toEqual(before);
    const content = uadDenialContent(fields);
    for (const paragraph of content.paragraphs) expect(text).toContain(normalize(paragraph.text));
  });

  it("omits only the optional company line without losing the claimant or address", () => {
    const fields = { ...record(), claimant_company: "" };
    expect(validateUadDenialFields(fields)).toEqual([]);
    expect(uadDenialContent(fields).recipient).toEqual([fields.claimant_name, fields.claimant_address]);
    expect(allText(createUadDenialPdf(fields))).not.toContain("Example Property LLC");
  });

  it("retains the exact Section 8/12 quotations, resubmission paragraph and reservation of rights", () => {
    const expected = [
      "“Only Member is permitted to operate the Vehicle as authorized driver.”",
      "“Whip may cancel insurance coverage, protection plan eligibility, liability limits, and/or any other benefit offered to the Member in the event of an unauthorized driver.”",
      "“We are liable only up to the maximum amounts under our insurance coverage and only if the Vehicle was being operated by you or a person entitled to insurance coverage under law.”",
    ];
    expect(UAD_QUOTES).toEqual(expected);
    expect(UAD_RESUBMISSION).toBe("Should you have additional documentation or information you would like us to consider, please submit it to claims@drivewhip.com and reference the claim number above. Any materials received will be reviewed.");
    expect(UAD_RIGHTS).toBe("Whip Claims Management reserves all rights and defenses. Nothing in this letter waives any of them.");
    const pdf = createUadDenialPdf(record()); const text = allText(pdf);
    for (const phrase of [...expected, UAD_RESUBMISSION, UAD_RIGHTS, "Section 8 of the Terms of Service, Authorized Drivers, states:", "Section 12, Insurance Limits of Liability, states:"]) expect(text).toContain(phrase);
    const quoteBlocks = streams(pdf).join("\n").match(/BT\n\/F3 [\s\S]*?\nET/g) || [];
    expect(quoteBlocks.length).toBeGreaterThanOrEqual(3);
  });

  it("matches all source wording against the supplied PDF when that local reference is available", () => {
    const reference = "/home/ubuntu/upload/WhipUnauthorizedDriverDenialLetterTemplate.pdf";
    let template: string;
    try { readFileSync(reference); } catch { return; } // Repository test remains portable.
    template = execFileSync("pdftotext", ["-layout", reference, "-"], { encoding: "utf8" });
    for (const [key, value] of Object.entries(record())) {
      template = template.replaceAll(`{{${key}}}`, key === "letter_date" || key === "date_of_loss" ? formatUadDenialDate(value)! : value);
    }
    expect(normalize(buildUadDenialText(record()))).toBe(normalize(template));
  });

  it("uses valid North American dates without a timezone shift, including leap days", () => {
    expect(formatUadDenialDate("2026-11-05")).toBe("November 5, 2026");
    expect(formatUadDenialDate("11/05/2026")).toBe("November 5, 2026");
    expect(formatUadDenialDate("2024-02-29")).toBe("February 29, 2024");
    for (const bad of ["2026-02-29", "2026-13-01", "2026-04-31", "05/11/26", "garbage", ""]) expect(formatUadDenialDate(bad)).toBeNull();
    expect(validateUadDenialFields({ ...record(), date_of_loss: "2026-02-29" })).toEqual(["Date of Loss must be a valid North American calendar date."]);
    expect(buildUadDenialText({ ...record(), date_of_loss: "bad" })).toContain("[Invalid date of loss]");
  });

  it("restores known string inputs only, not PDF URLs, bytes, unknown keys or owner names", () => {
    expect(restoreUadDenialFields({ ...record(), claim_number: 123, pdfUrl: "blob:stale", ownerName: "DO NOT USE" })).toEqual({ ...record(), claim_number: "" });
    expect(restoreUadDenialFields(null)).toEqual(emptyUadDenialFields());
  });

  it("fits an ordinary populated sample on one A4 page with footer-safe regular typography and existing injected logo", () => {
    const source = readFileSync("client/src/pages/DocGenerator.tsx", "utf8");
    const logo = /const WHIP_LOGO_B64 = "([^"]+)"/.exec(source)![1];
    const spy = vi.spyOn(jsPDF.API, "addImage");
    try {
      const pdf = createUadDenialPdf(record(), { logoBase64: logo });
      expect(pdf.getNumberOfPages()).toBe(1);
      expect(pdf.internal.pageSize.getWidth()).toBeCloseTo(210, 1);
      expect(pdf.internal.pageSize.getHeight()).toBeCloseTo(297, 1);
      expect(spy).toHaveBeenCalledTimes(1); expect(spy.mock.calls[0][0]).toBe(logo);
      expect(pdf.output("arraybuffer").byteLength).toBeLessThan(250_000);
      assertFooterSafe(pdf);
    } finally { spy.mockRestore(); }
  });

  it.each(["claimant_address", "claimant_name", "claimant_company", "claim_number", "property_claimed", "driver_description", "handler_name", "handler_title"] as const)("paginates a long %s above repeated footers, without clipping the end of the field or closing", key => {
    const fields = { ...record(), [key]: Array(130).fill("Long synthetic field content for footer-safe wrapping").join(key === "claimant_address" ? "\n" : " ") + " END-OF-FIELD" };
    const pdf = createUadDenialPdf(fields); const text = allText(pdf);
    expect(pdf.getNumberOfPages()).toBeGreaterThan(1);
    expect(text).toContain("END-OF-FIELD"); expect(text).toContain("Respectfully,"); expect(text).toContain(UAD_RIGHTS);
    assertFooterSafe(pdf);
  });

  it("wraps long unbroken identifiers horizontally rather than clipping", () => {
    const fields = { ...record(), claim_number: "SYN" + "ABCDEFGHIJ".repeat(50) + "END" };
    const pdf = createUadDenialPdf(fields); assertFooterSafe(pdf);
    expect(allText(pdf).replace(/\s/g, "")).toContain(fields.claim_number);
  });
});
