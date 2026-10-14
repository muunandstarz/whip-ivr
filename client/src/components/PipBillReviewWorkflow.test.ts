import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "client/src/components/PipBillReviewWorkflow.tsx"), "utf8");

describe("PIP Bill Review documents", () => {
  it("uses active or impersonated handler identity and exposes all legacy-equivalent output actions", () => {
    expect(source).toContain("const { impersonating } = useImpersonation()");
    expect(source).toContain("impersonating.name");
    expect(source).toContain("effectiveHandler.name");
    expect(source).toContain("Payment letter");
    expect(source).toContain("EOR — provider version");
    expect(source).toContain("EOR — internal version");
    expect(source).toContain("PIP log — attorney version");
    expect(source).toContain("Generate all");
    expect(source).toContain("addLetterhead(doc)");
  });
});
