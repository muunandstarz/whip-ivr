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

  it("uses the private in-memory extraction route and presents upload feedback", () => {
    expect(source).toContain('fetch("/api/pip-bill-review/extract", { method: "POST", body })');
    expect(source).toContain("Files are analyzed in memory and are not saved to document storage.");
    expect(source).toContain('role="status"');
    expect(source).toContain("reviewPipBills({ state, locality");
  });

  it("keeps previews live and uses a structured neutral document layout", () => {
    expect(source).toContain("previewUrls.current.forEach");
    expect(source).toContain("<iframe key={value.url}");
    expect(source).toContain("INTERNAL REVIEW — DO NOT DISTRIBUTE");
    expect(source).toContain("No payment is issued with this determination.");
    expect(source).toContain("TOTAL BILLED");
    expect(source).toContain("INTERNAL REVIEW — DO NOT DISTRIBUTE");
  });
});
