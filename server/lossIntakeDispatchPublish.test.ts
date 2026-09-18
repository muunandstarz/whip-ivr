import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  getLossIntakeSettings: vi.fn(),
  listLossIntakeClaims: vi.fn(),
  updateLossIntakeSettings: vi.fn(),
}));
const processorQueueMock = vi.hoisted(() => ({
  listLossIntakeProcessorQueue: vi.fn(),
}));

vi.mock("./lossIntakeDb", () => dbMocks);
vi.mock("./lossIntakeProcessorQueue", () => processorQueueMock);

import { ENV } from "./_core/env";
import { publishLossIntakeDispatch, type DispatchWorkClaim } from "./lossIntakeDispatch";

const originalToken = ENV.slackBotToken;

function claim(): DispatchWorkClaim {
  return {
    id: 1,
    memberName: "Example Member",
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
    attachmentCount: 1,
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
  };
}

describe("publishLossIntakeDispatch quiet behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ENV.slackBotToken = "xoxb-test";
    const settings: Record<string, string | null> = {
      claimsProcessorsChannelId: "C-PROCESSORS",
      claimsIntakeRepsChannelId: "C-INTAKE",
      processorsDigestMessageTs: null,
      processorsDigestSignature: null,
      processorsDigestDateKey: null,
      intakeDigestMessageTs: null,
      intakeDigestSignature: null,
      intakeDigestDateKey: null,
    };
    dbMocks.getLossIntakeSettings.mockImplementation(async () => settings);
    dbMocks.listLossIntakeClaims.mockResolvedValue({ claims: [claim()], total: 1 });
    processorQueueMock.listLossIntakeProcessorQueue.mockResolvedValue({ available: true, warning: null, items: [] });
    dbMocks.updateLossIntakeSettings.mockImplementation(async (patch: Record<string, string | null>) => {
      Object.assign(settings, patch);
      return settings;
    });
  });

  afterEach(() => {
    ENV.slackBotToken = originalToken;
    vi.unstubAllGlobals();
  });

  it("posts a new processor digest once, then remains silent when nothing changes", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, ts: "1757600000.000100" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const first = await publishLossIntakeDispatch({
      now: new Date("2026-09-11T14:00:00.000Z"),
      publishProcessors: true,
      publishIntake: false,
    });
    const second = await publishLossIntakeDispatch({
      now: new Date("2026-09-11T14:00:00.000Z"),
      publishProcessors: true,
      publishIntake: false,
    });

    expect(first.processorsMessage).toContain("File with the information available. Do not call the member.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first.published.processorsDigestMessageTs).toBe("1757600000.000100");
    expect(second.published).toEqual({});
  });
});
