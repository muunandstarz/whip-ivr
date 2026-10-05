import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const clientSource = readFileSync(resolve(root, "client/src/pages/DocGenerator.tsx"), "utf8");
const routerSource = readFileSync(resolve(root, "server/routers/docgen.ts"), "utf8");
const appSource = readFileSync(resolve(root, "client/src/App.tsx"), "utf8");
const layoutSource = readFileSync(resolve(root, "client/src/components/WhipLayout.tsx"), "utf8");

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

  it("exposes Medical Bill and PIP Review as a direct sidebar destination", () => {
    expect(appSource).toContain('path="/medical-bill-review"');
    expect(appSource).toContain('path="/pip-bill-review"');
    expect(appSource).toContain('initialTab="pip-bill-review"');
    expect(layoutSource).toContain('href: "/medical-bill-review", label: "Medical Bill & PIP Review"');
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

  it("keeps updated correspondence printer-neutral outside the colored logo", () => {
    expect(clientSource).toContain('doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.5);');
    expect(clientSource).toContain('doc.setDrawColor(150, 150, 150); doc.line(lm, y, rm, y); nl(6);');
  });

  it("pushes a complete LOU handoff into Subro Demand and provides an in-demand mini calculator", () => {
    expect(clientSource).toContain('const LOU_DEMAND_HANDOFF_KEY = "lou_demand_handoff";');
    expect(clientSource).toContain('onPushToDemand?.(handoff);');
    expect(clientSource).toContain('louHandoff={louDemandHandoff}');
    expect(clientSource).toContain('onLouHandoffConsumed={handleLouHandoffConsumed}');
    expect(clientSource).toContain('aria-label="LOU calculator for this demand"');
    expect(clientSource).toContain('const applyLouCalculation = () => {');
    expect(clientSource).toContain('lou: louCalculatedTotal.toFixed(2)');
  });
});
