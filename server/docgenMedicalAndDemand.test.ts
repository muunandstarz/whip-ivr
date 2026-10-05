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
    expect(clientSource).toContain('doc.setDrawColor(150, 150, 150); doc.line(lm, y, rm, y); nl(4);');
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

  it("uses the market utilization service and appends the full LOU support schedule to Subro packets", () => {
    expect(clientSource).toContain('trpc.lou.getMarketPricing.useQuery');
    expect(clientSource).toContain('trpc.lou.getUtilRows.useQuery');
    expect(clientSource).toContain('const louUtilizationRows: LouUtilizationRow[]');
    expect(clientSource).toContain('function appendLouSupportingSchedule');
    expect(clientSource).toContain('if (louSupportingSchedule) appendLouSupportingSchedule(doc, louSupportingSchedule);');
    expect(clientSource).toContain('Include full LOU support schedule in this settlement packet.');
  });

  it("uses a compact Subro Demand letter without an enclosure block", () => {
    const subroPdfSource = clientSource.slice(clientSource.indexOf("const buildSubroDoc"));
    expect(clientSource).toContain('const startContinuationPage = () => {');
    expect(clientSource).toContain('Subrogation Demand — Whip Claim No. ${form.ourClaim || "[Our Claim #]"} (continued)');
    expect(subroPdfSource).toContain('const lm = 18, rm = W - 18, tw = W - 36;');
    expect(subroPdfSource).toContain('const compactFont = 8.8;');
    expect(subroPdfSource).toContain('const compactLeading = 4.25;');
    expect(subroPdfSource).toContain('const paymentAndSignatureHeight = 6 + demandLines.length * compactLeading');
    expect(clientSource).toContain('if (y + paymentAndSignatureHeight > doc.internal.pageSize.getHeight() - 25) startContinuationPage();');
    expect(subroPdfSource).toContain('Enclosures remain as selected attachments in the packet; they are not');
    expect(subroPdfSource).not.toContain('doc.text("ENCLOSURES", lm, y);');
    expect(subroPdfSource).not.toContain('doc.text("PAYMENT INSTRUCTIONS", lm, y);');
    expect(subroPdfSource).toContain('Please make payment payable to Whip Claims Management');
    expect(subroPdfSource).toContain('nl(9);');
  });

  it("puts repair-estimate reading before all Subro Demand form fields", () => {
    const uploadMarker = 'aria-label="Repair estimate upload and prefill"';
    const claimInfoMarker = '<Panel title="Claim Information" tag="REQUIRED">';
    expect(clientSource.match(new RegExp(uploadMarker, "g"))).toHaveLength(1);
    expect(clientSource.indexOf(uploadMarker)).toBeLessThan(clientSource.indexOf(claimInfoMarker));
    expect(clientSource).toContain('1. Start with the repair estimate');
    expect(clientSource).toContain('Read & pre-fill');
  });

  it("uses third-party carrier details and an estimate-first LOU repair context", () => {
    const subroSource = clientSource.slice(clientSource.indexOf("function SubroDemandTab"));
    expect(clientSource).toContain('const THIRD_PARTY_CARRIERS = [');
    expect(clientSource).toContain('const THIRD_PARTY_CARRIER_ROUTING');
    expect(clientSource).toContain('Allstate Insurance Company\\nPO Box 660636\\nDallas, TX 75266');
    expect(clientSource).toContain('The General Claims Department\\nPO Box 8001\\nStevens Point, WI 54481-9820');
    expect(clientSource).toContain('American Family Insurance Claims Services, Inc.\\n6000 American Parkway\\nMadison, WI 53783-0001');
    expect(clientSource).toContain('Preferred delivery:');
    expect(subroSource).toContain('<ThirdPartyCarrierSelect value={form.carrier} onChange={set("carrier")} onAddressChange={set("carrierAddress")} />');
    expect(subroSource).toContain('Their Adjuster Name');
    expect(subroSource).toContain('Whip Snapsheet Claim #');
    expect(subroSource).toContain('XXX-1234-123456-123456');
    expect(subroSource.indexOf('VIN — decode first')).toBeLessThan(subroSource.indexOf('Vehicle (Year / Make / Model / Trim)'));
    expect(subroSource).toContain('carrierAddress: parsed.carrierAddress || p.carrierAddress');
    expect(subroSource).toContain('setLouRepairStart((current) => parsed.repairStart || current);');
    expect(subroSource).toContain('setLouRepairEnd((current) => parsed.repairEnd || current);');
    expect(subroSource).toContain('setLouRoNumber((current) => parsed.roNumber || current);');
    expect(subroSource).toContain('const [louRepairFacility, setLouRepairFacility] = useState("Total Recon");');
    expect(subroSource.indexOf('Market / Location')).toBeLessThan(subroSource.indexOf('Repair Start'));
    expect(subroSource.indexOf('Vehicle Class / Rate Basis')).toBeLessThan(subroSource.indexOf('Repair Start'));
  });
});
