import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ getLossIntakeSettings: vi.fn(), updateLossIntakeSettings: vi.fn() }));
const queueMocks = vi.hoisted(() => ({ listLossIntakeSharedQueue: vi.fn() }));
vi.mock("./lossIntakeDb", () => dbMocks);
vi.mock("./lossIntakeSharedQueue", () => queueMocks);

import { ENV } from "./_core/env";
import { publishLossIntakeDispatch } from "./lossIntakeDispatch";

const originalToken = ENV.slackBotToken;
const claim = { id: 1, memberName: "Example Member", customerId: "1001", market: "Atlanta", vinLastSix: "123456", reportedVinLastSix: "123456", vinCorrectionEvidence: null, memberPhone: null, preferredLanguage: null, dateOfLoss: "09/11/2026", postedAt: new Date("2026-09-11T13:00:00.000Z"), slackPermalink: "https://example.test/thread", sourceChannel: "claims", onSiteFlag: false, onSiteReason: null, inspectionScheduledAt: null, inspectionScheduleSource: null, firstContactAt: null, firstResponseBusinessMinutes: null, contactAttempts: 0, completedAt: null, templatePostedAt: null, factsOfLoss: null, preliminaryLiability: null, rideshareStatus: null, claimedByHandlerId: null, claimedByName: null, claimedAt: null, slaState: "within_sla" as const, slaTargetBusinessMinutes: 240 };

describe("configured Intake Dispatch publishing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ENV.slackBotToken = "xoxb-test";
    const settings: Record<string, unknown> = { intakeSlackDestinationChannelId: "C-INTAKE", intakeSlackPublishingEnabled: true, intakeDigestMessageTs: null, intakeDigestSignature: null, intakeDigestDateKey: null };
    dbMocks.getLossIntakeSettings.mockImplementation(async () => settings);
    queueMocks.listLossIntakeSharedQueue.mockResolvedValue([claim]);
    dbMocks.updateLossIntakeSettings.mockImplementation(async (patch: Record<string, unknown>) => Object.assign(settings, patch));
  });
  afterEach(() => { ENV.slackBotToken = originalToken; vi.unstubAllGlobals(); });

  it("posts one configured Intake message and remains quiet when the queue is unchanged", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, ts: "1757600000.000100" }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const first = await publishLossIntakeDispatch({ now: new Date("2026-09-11T14:00:00.000Z") });
    const second = await publishLossIntakeDispatch({ now: new Date("2026-09-11T14:00:00.000Z") });
    expect(first.intakeMessage).toContain("Example Member");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first.published.intakeDigestMessageTs).toBe("1757600000.000100");
    expect(second.skipped).toBe("unchanged");
  });

  it("does not publish without an enabled configured destination", async () => {
    dbMocks.getLossIntakeSettings.mockResolvedValue({ intakeSlackDestinationChannelId: null, intakeSlackPublishingEnabled: false });
    const result = await publishLossIntakeDispatch();
    expect(result.skipped).toBe("destination_not_configured");
  });
});
