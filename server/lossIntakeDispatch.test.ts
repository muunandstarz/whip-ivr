import { describe, expect, it } from "vitest";
import { buildDispatchMessages, buildProcessorDigest, dispatchMessageSignature, shouldPublishDispatchMessage, type DispatchWorkClaim } from "./lossIntakeDispatch";
import type { ProcessorQueueItem } from "./lossIntakeProcessorQueue";

function claim(overrides: Partial<DispatchWorkClaim> = {}): DispatchWorkClaim {
  return {
    id: 1,
    memberName: "Alex Member",
    customerId: "1001",
    market: "Atlanta",
    channelName: "claims",
    vinLastSix: "123456",
    postedAt: new Date("2026-09-11T13:00:00.000Z"),
    slackPermalink: "https://example.test/thread",
    factsOfLoss: "Rear impact",
    preliminaryLiability: "Other driver",
    rideshareStatus: "Offline",
    hasPhotos: true,
    attachmentCount: 2,
    stage: "awaiting_outreach",
    completedAt: null,
    firstResponseBusinessMinutes: null,
    slaTargetBusinessMinutes: 10,
    slaState: "within_sla",
    onSiteFlag: false,
    onSiteReason: null,
    contactAttempts: 0,
    filingState: "unfiled",
    filingEvidence: "Template has no claim ID.",
    dataWarnings: null,
    ...overrides,
  };
}

describe("Loss Intake Dispatch outputs", () => {
  it("separates unfiled processor work from the shared intake follow-up queue", () => {
    const result = buildDispatchMessages([
      claim(),
      claim({ id: 2, memberName: "Remote Member", filingState: "filed", onSiteFlag: true }),
    ], new Date("2026-09-11T14:00:00.000Z"));
    expect(result.unfiled).toHaveLength(1);
    expect(result.processorsMessage).toContain("File with the information available. Do not call the member.");
    expect(result.intake[0]?.memberName).toBe("Remote Member");
    expect(result.intakeMessage).toContain("(this driver appears to be in office)");
  });

  it("uses a safe default target for legacy claims whose persisted SLA target is absent", () => {
    const result = buildDispatchMessages([
      claim({ slaTargetBusinessMinutes: null, channelName: "remote-markets", firstResponseBusinessMinutes: 30 }),
    ], new Date("2026-09-11T14:00:00.000Z"));
    expect(result.intakeMessage).toContain("of 240-minute target");
    expect(result.intakeMessage).not.toContain("of —-minute target");
  });

  it("suppresses a repeat Dispatch post when the destination already has the same content", () => {
    const message = buildDispatchMessages([claim()], new Date("2026-09-11T14:00:00.000Z")).processorsMessage;
    expect(shouldPublishDispatchMessage({
      previousMessageTs: "1757600000.000100",
      previousSignature: dispatchMessageSignature(message),
      nextMessage: message,
    })).toBe(false);
    expect(shouldPublishDispatchMessage({
      previousMessageTs: "1757600000.000100",
      previousSignature: dispatchMessageSignature(message),
      nextMessage: `${message}\nNew source evidence`,
    })).toBe(true);
    expect(shouldPublishDispatchMessage({
      previousMessageTs: null,
      previousSignature: dispatchMessageSignature(message),
      nextMessage: message,
    })).toBe(true);
  });

  it("formats the processor post from the dedicated VIN-based queue and repeats the no-call instruction", () => {
    const item: ProcessorQueueItem = {
      id: 41, memberName: "Michael Smith", customerId: "10211", market: "Atlanta", vinLastSix: "650094", dateOfLoss: "2026-09-08",
      postedAt: new Date("2026-09-08T16:35:16.000Z"), slackPermalink: "https://example.test/michael", sourceChannel: "claims", daysUnfiled: 3,
      status: "filing", claimNumber: null, takenByName: "Daryl Ochate", takenAt: new Date(), statusUpdatedAt: new Date(), filedVisibleUntil: null,
      details: { factsOfLoss: "Glass damage", thirdParty: null, policeReport: null, tow: null, rideshare: null, photosOrFootage: null, preliminaryLiability: null, missing: ["police report details"] },
    };
    const digest = buildProcessorDigest([item], new Date("2026-09-11T14:00:00.000Z"));
    expect(digest).toContain("Michael Smith");
    expect(digest).toContain("File with the information available. Do not call the member.");
    expect(digest).toContain("Daryl Ochate");
    expect(digest).toContain("police report details");
  });
});
