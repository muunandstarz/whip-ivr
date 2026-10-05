import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const appSource = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");

describe("Document Generator routes", () => {
  it("keeps form-bearing route components stable across app-level rerenders", () => {
    expect(appSource).toContain("function DocumentGeneratorRoute()");
    expect(appSource).toContain("function MedicalBillReviewRoute()");
    expect(appSource).toContain('<Route path="/doc-generator" component={DocumentGeneratorRoute} />');
    expect(appSource).toContain('<Route path="/medical-bill-review" component={MedicalBillReviewRoute} />');
    expect(appSource).toContain('<Route path="/pip-bill-review" component={MedicalBillReviewRoute} />');
    expect(appSource).not.toContain('component={() => <DocGenerator');
  });
});
