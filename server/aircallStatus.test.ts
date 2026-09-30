import { describe, expect, it } from "vitest";
import { normalizeAircallOutcome, shouldCreateMissedCallCallback } from "./aircallStatus";

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

  it("creates a callback task for an unanswered inbound call but never competes with voicemail", () => {
    expect(shouldCreateMissedCallCallback({
      direction: "inbound", status: "done", missedCallReason: "agents_did_not_answer", durationSeconds: 32,
    })).toBe(true);
    expect(shouldCreateMissedCallCallback({
      direction: "inbound", status: "done", missedCallReason: "voicemail", voicemail: "https://example.test/vm.mp3",
    })).toBe(false);
  });

  it("keeps a meaningful abandoned caller visible while ignoring a short misdial", () => {
    expect(shouldCreateMissedCallCallback({
      direction: "inbound", status: "done", missedCallReason: "abandoned_in_ivr", durationSeconds: 25,
    })).toBe(true);
    expect(shouldCreateMissedCallCallback({
      direction: "inbound", status: "done", missedCallReason: "short_abandoned", durationSeconds: 4,
    })).toBe(false);
    expect(shouldCreateMissedCallCallback({
      direction: "outbound", status: "done", missedCallReason: "agents_did_not_answer", durationSeconds: 30,
    })).toBe(false);
  });
});
