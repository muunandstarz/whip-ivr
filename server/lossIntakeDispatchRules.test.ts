import { describe, expect, it } from "vitest";
import {
  addBusinessMinutes,
  businessMinutesBetween,
  deriveFilingState,
  detectOnSiteSignal,
  evaluateDispatchTiming,
  extractClaimId,
} from "./lossIntakeDispatchRules";

describe("Loss Intake Dispatch business-hour timing", () => {
  it("starts a morning clock at 9 AM ET and ignores overnight raw clock time", () => {
    const posted = new Date("2026-09-11T12:36:00.000Z"); // 8:36 AM ET
    const answered = new Date("2026-09-11T13:05:00.000Z"); // 9:05 AM ET
    expect(businessMinutesBetween(posted, answered)).toBe(5);
  });

  it("skips the weekend when calculating a remote-market four-business-hour deadline", () => {
    const fridayLate = new Date("2026-09-11T21:00:00.000Z"); // Fri 5 PM ET
    expect(addBusinessMinutes(fridayLate, 240).toISOString()).toBe("2026-09-14T16:00:00.000Z"); // Mon noon ET
  });

  it("uses the 10-minute target only after a Slack-confirmed in-office arrival", () => {
    const posted = new Date("2026-09-11T13:00:00.000Z");
    const response = new Date("2026-09-11T13:10:00.000Z");
    const evaluation = evaluateDispatchTiming({ postedAt: posted, firstResponseAt: response, now: response, channel: "claims", onSite: true });
    expect(evaluation.targetBusinessMinutes).toBe(10);
    expect(evaluation.firstResponseBusinessMinutes).toBe(10);
    expect(evaluation.slaState).toBe("within_sla");
    expect(evaluateDispatchTiming({ postedAt: posted, firstResponseAt: response, now: response, channel: "claims" }).targetBusinessMinutes).toBe(240);
  });

  it("does not infer in-office status from an inspection date or an arbitrary attachment", () => {
    expect(detectOnSiteSignal([{ text: "inspection scheduled today", files: [{}], occurredAt: new Date("2026-09-11T13:00:00.000Z"), isStoreOpsPoster: false }]).onSite).toBe(false);
    const result = detectOnSiteSignal([{ text: "Member has arrived at the office", files: [{}], occurredAt: new Date("2026-09-11T13:00:00.000Z"), isStoreOpsPoster: true }]);
    expect(result.onSite).toBe(true);
    expect(result.reason).toContain("this driver appears to be in office");
  });
});

describe("Loss Intake Dispatch filing signal", () => {
  it("extracts a Snapsheet claim ID and retains template-without-claim as unfiled", () => {
    expect(extractClaimId("Claim ID: ATL-11980-557661-090926")).toBe("ATL-11980-557661-090926");
    expect(deriveFilingState({ templatePosted: true, claimId: null })).toBe("unfiled");
    expect(deriveFilingState({ templatePosted: false, claimId: null })).toBe("pending_statement");
  });
});
