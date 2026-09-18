import { describe, expect, it } from "vitest";
import { buildIntakeDigest, dispatchMessageSignature, shouldPublishDispatchMessage } from "./lossIntakeDispatch";
import type { IntakeQueueClaim } from "./lossIntakeSharedQueue";

const item = (overrides: Partial<IntakeQueueClaim> = {}): IntakeQueueClaim => ({
  id: 1, memberName: "Alex Member", customerId: "101", market: "Atlanta", vinLastSix: "123456", reportedVinLastSix: "123456", vinCorrectionEvidence: null, memberPhone: null, preferredLanguage: null, dateOfLoss: "09/18/2026", postedAt: new Date("2026-09-18T12:00:00Z"), slackPermalink: "https://slack.test/thread", sourceChannel: "claims", onSiteFlag: false, onSiteReason: null, inspectionScheduledAt: null, inspectionScheduleSource: null, firstContactAt: null, firstResponseBusinessMinutes: null, contactAttempts: 0, completedAt: null, templatePostedAt: null, factsOfLoss: null, preliminaryLiability: null, rideshareStatus: null, claimedByHandlerId: null, claimedByName: null, claimedAt: null, slaState: "within_sla", slaTargetBusinessMinutes: 240, ...overrides,
});

describe("Intake Dispatch digest", () => {
  it("publishes one Intake queue and never includes processor filing instructions", () => {
    const digest = buildIntakeDigest([item({ onSiteFlag: true, onSiteReason: "Store Operations posted branch photos" })], new Date("2026-09-18T15:00:00Z"));
    expect(digest).toContain("Loss Intake Follow-up");
    expect(digest).toContain("this driver appears to be in office");
    expect(digest).not.toMatch(/processor|file with the information/i);
  });

  it("prioritizes Slack-confirmed arrivals before overdue and ordinary work", () => {
    const digest = buildIntakeDigest([item({ id: 3, memberName: "Ordinary" }), item({ id: 2, memberName: "Overdue", slaState: "breached" }), item({ id: 1, memberName: "Arrival", onSiteFlag: true })], new Date("2026-09-18T15:00:00Z"));
    expect(digest.indexOf("Arrival")).toBeLessThan(digest.indexOf("Overdue"));
    expect(digest.indexOf("Overdue")).toBeLessThan(digest.indexOf("Ordinary"));
  });

  it("suppresses an unchanged same-day message", () => {
    const message = buildIntakeDigest([item()]);
    expect(shouldPublishDispatchMessage({ previousSignature: dispatchMessageSignature(message), previousMessageTs: "123.456", nextMessage: message })).toBe(false);
    expect(shouldPublishDispatchMessage({ previousSignature: null, previousMessageTs: null, nextMessage: message })).toBe(true);
  });
});
