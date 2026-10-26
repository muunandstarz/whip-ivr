import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./DocGenerator.tsx", import.meta.url), "utf8");

describe("Towing invoice payment status", () => {
  it("keeps towing invoices in the Subrogation navigation group", () => {
    const subrogation = source.slice(source.indexOf('label: "Subrogation"'), source.indexOf('label: "Medical Review"'));
    expect(subrogation).toContain('{ id: "urgently-invoice", label: "Towing Invoice", icon: Truck }');
  });

  it("shows paid-in-full status in the on-screen invoice preview and final PDF", () => {
    const towingInvoice = source.slice(source.indexOf("function UrgentlyInvoiceTab()"), source.indexOf("// ─── PIP Exhaustion Tab"));
    expect(towingInvoice).toContain("PAYMENT STATUS: PAID IN FULL");
    expect(towingInvoice).toContain('doc.text("PAID IN FULL", W - 34.5, 29.3, { align: "center" })');
    expect(towingInvoice).toContain('doc.text("PAYMENT STATUS: PAID IN FULL", 14, y)');
    expect(towingInvoice).toContain("Generated towing invoices are payment records and will display this status in the preview and PDF.");
    expect(towingInvoice).toContain("const nextPreviewUrl = getPDFDataUrl(doc);");
    expect(towingInvoice).toContain("setPreviewPdfUrl(previous => {");
  });
});
