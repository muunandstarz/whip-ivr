import fs from "node:fs";
import { describe, expect, it } from "vitest";

const html = fs.readFileSync("client/public/klutch-policy-documents.html", "utf8");
const css = html.slice(0, html.indexOf("</style>"));
const rule = (selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`${escaped}\\{([^}]+)\\}`))?.[1] ?? "";
};

describe("Klutch carrier-style print frame", () => {
  it("lowers the declarations and Maryland endorsement mastheads to a half-inch top inset with half-inch side gutters", () => {
    expect(rule(".dec")).toContain("padding:48px 48px 0");
    expect(rule(".pip-history-doc")).toContain("padding:48px 48px 0");
    expect(rule(".dec>.foot")).toContain("left:48px;right:48px");
    expect(css).toContain(".pip-history-doc>.foot,.sheet:has(>.pip-history-doc)>.foot{left:48px;right:48px}");
  });
  it("retains readable body sizes and uses compact leading rather than scaling entire pages down", () => {
    expect(rule(".dec")).toContain("font-size:12.5px;line-height:1.4");
    expect(rule(".pip-history-doc")).toContain("font-size:12.5px;line-height:1.45");
    expect(rule(".end")).toContain("font-size:12.6px;line-height:1.45");
    expect(rule(".ltr")).toContain("font-size:13.3px;line-height:1.45");
    expect(rule(".dec .two>div")).toContain("min-width:0");
  });
  it("recovers room from inter-section and field gaps while retaining all PIP date and source disclosures", () => {
    expect(rule(".pip-history-doc .pip-doc-ref")).toContain("margin:0 0 16px");
    expect(rule(".pip-history-doc .pip-term")).toContain("padding:12px 14px");
    expect(rule(".pip-history-doc .pip-grid")).toContain("gap:8px 24px");
    expect(html).toContain("It does not restart or extend that term.");
    expect(html).toContain("Signed source reference");
    expect(html).toContain("Policy term expires — unchanged");
    expect(html).toContain("does not replace the signed election / waiver");
  });
  it("applies the quieter correspondence and standard endorsement frame without touching approved Direction of Pay geometry", () => {
    expect(rule(".ltr")).toContain("padding:56px 56px 0");
    expect(rule(".end")).toContain("padding:56px 56px 0");
    expect(rule(".end .foot")).toContain("left:56px;right:56px");
    expect(rule(".dopdoc")).toContain("padding:42px 68px 0");
    expect(css).toContain(".dop-signature-wrap{height:22px}");
    expect(css).toContain(".dop-print-block{grid-area:printed;margin-top:24px}");
  });
  it("preserves fixed Letter pages, explicit declaration and standard endorsement allocation, and footer-safe PIP pagination", () => {
    expect(css).toContain(".sheet{width:816px;height:1056px");
    expect(css).toContain("@page{size:8.5in 11in;margin:0}");
    expect(html).toContain("html:sheet(p1)+sheet(p2)");
    expect(html).toContain("html:sheet(e1)+sheet(e2)");
    expect(html).toContain("if(bottom>980&&body.children.length>1)");
    expect(html).toContain("paginateMdPip(rows.join(\"\"),pol.number)");
  });
});
