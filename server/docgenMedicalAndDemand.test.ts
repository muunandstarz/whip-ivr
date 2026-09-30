import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const clientSource = readFileSync(resolve(root, "client/src/pages/DocGenerator.tsx"), "utf8");
const routerSource = readFileSync(resolve(root, "server/routers/docgen.ts"), "utf8");

describe("Medical Bill Review and total-loss subrogation demand", () => {
  it("uploads medical documents through the supported signed document endpoint", () => {
    expect(clientSource).toContain('fetch("/api/upload/document", { method: "POST", body: fd })');
    expect(clientSource).toContain("data.signedUrl || data.url");
    expect(clientSource).toContain("payload.signedUrl || payload.url");
    expect(clientSource).not.toContain('fetch("/api/upload", { method: "POST", body: fd })');
  });

  it("defensively parses structured medical and PIP output", () => {
    expect(routerSource).toContain('const parsed = parseJsonObject(raw ?? "{}");');
    expect(routerSource).toContain('name: "medical_demand_analysis"');
    expect(routerSource).toContain('name: "pip_document_parse"');
  });

  it("provides a formatted medical response PDF and a PIP exhaustion handoff", () => {
    expect(clientSource).toContain("const buildResponseLetterPdf");
    expect(clientSource).toContain("Preview PDF");
    expect(clientSource).toContain("Download PDF");
    expect(clientSource).toContain("PIP bill review & exhaustion workflow");
  });

  it("includes ACV, storage, admin fee, sales tax, and salvage in total-loss subrogation demands", () => {
    expect(clientSource).toContain('adminFee: "",');
    expect(clientSource).toContain('salesTax: "",');
    expect(clientSource).toContain('salvageDeducted: "",');
    expect(clientSource).toContain('Sales Tax ($)');
    expect(clientSource).toContain('Admin Fee ($)');
    expect(clientSource).toContain('Salvage (Deducted) ($)');
    expect(clientSource).toContain('return (v + t + s + admin + tax + d + l - salvage).toFixed(2);');
  });

  it("keeps a full VIN on its own Total Loss settlement PDF line", () => {
    expect(clientSource).toContain('if (form.vin) y = wrapText(doc, `VIN: ${form.vin}`, 14, y, W - 28, 6.5);');
  });
});
