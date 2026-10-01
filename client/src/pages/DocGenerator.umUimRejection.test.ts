import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./DocGenerator.tsx", import.meta.url), "utf8");
const coiStart = source.indexOf("function UnifiedCOITab");
const declarationsStart = source.indexOf("function KlutchDecPageTab");
const coiSource = source.slice(coiStart, declarationsStart);
const declarationsSource = source.slice(declarationsStart);

describe("Georgia UM/UIM named-insured rejection", () => {
  it("keeps Georgia as a selectable UM/UIM election instead of an automatic rejection", () => {
    expect(coiSource).toContain('const isAutomaticUmRejection = state === "FL";');
    expect(coiSource).not.toContain('state === "FL" || state === "GA"');
    expect(declarationsSource).toContain('const isAutomaticUmRejection = state === "FL";');
    expect(declarationsSource).not.toContain('state === "FL" || state === "GA"');
  });

  it("renders the same named-insured rejection in every applicable COI UM and UIM surface", () => {
    expect(coiSource).toContain('UM / UIM Rejected by Named Insured');
    expect(coiSource).toContain('limits: umRejected && rules.uimPP');
    expect(coiSource).toContain('? "REJECTED BY NAMED INSURED"');
    expect(coiSource).toContain('UIM: ${umRejected && rules.uimPP ? "REJECTED"');
  });

  it("continues to preserve the already-coupled UM/UIM rejection on Klutch declarations", () => {
    expect(declarationsSource).toContain('if (umRejected) { weights.um = 0; weights.uim = 0; }');
    expect(declarationsSource).toContain('const uimLimits = umRejected ? "Rejected"');
    expect(declarationsSource).toContain('UM/UIM Rejected by Named Operator');
  });
});
