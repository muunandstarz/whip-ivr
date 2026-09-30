import { describe, expect, it } from "vitest";
import { normalizeAircallOutcome } from "./aircallStatus";

describe("Aircall outcome normalization", () => {
  it("identifies answered calls when Aircall marks a call done without a missed reason", () => {
    expect(normalizeAircallOutcome("done", null)).toBe("answered");
  });

  it("retains voicemail and no-agent outcomes separately", () => {
    expect(normalizeAircallOutcome("done", "voicemail")).toBe("voicemail");
    expect(normalizeAircallOutcome("done", "no_available_agent")).toBe("missed");
    expect(normalizeAircallOutcome("done", "agents_did_not_answer")).toBe("missed");
  });

  it.each(["abandoned_in_classic", "abandoned_in_ivr", "short_abandoned"])(
    "classifies %s as a caller abandonment",
    (reason) => {
      expect(normalizeAircallOutcome("done", reason)).toBe("abandoned");
    },
  );

  it("keeps legacy abandoned status as abandoned", () => {
    expect(normalizeAircallOutcome("abandoned", null)).toBe("abandoned");
  });
});
