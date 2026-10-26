import { describe, expect, it } from "vitest";
import {
  calculateKlutchPremium,
  canonicalizeSnapSheetClaim,
  formatKlutchClaimNumber,
  formatKlutchPolicyNumber,
} from "@shared/klutchPolicy";

describe("Klutch durable identifiers", () => {
  it("formats globally sequenced policies with the issuance state", () => {
    expect(formatKlutchPolicyNumber("MD", 1)).toBe("KIC-MD-000001");
    expect(formatKlutchPolicyNumber("GA", 4218)).toBe("KIC-GA-004218");
  });

  it("formats Klutch claim identifiers independently from SnapSheet claim numbers", () => {
    expect(formatKlutchClaimNumber("A7M3QZ")).toBe("KC-A7M3QZ");
    expect(formatKlutchClaimNumber("K9P2XR")).toBe("KC-K9P2XR");
    expect(canonicalizeSnapSheetClaim(" gb-4219- 425292-100426 ")).toBe("GB-4219-425292-100426");
  });

  it("excludes PIP entirely from Virginia policy coverage and premium allocation", () => {
    const virginia = calculateKlutchPremium({
      state: "VA",
      effectiveOn: "2026-01-01",
      expiresOn: "2026-07-01",
      pipWaived: false,
    });

    expect(virginia.coverages.map(coverage => coverage.label)).not.toContain("Personal Injury Protection");
    expect(virginia.totalPremium).toBe(910);
    expect(virginia.coverages.reduce((sum, coverage) => sum + coverage.premium, 0)).toBe(910);
  });
});
