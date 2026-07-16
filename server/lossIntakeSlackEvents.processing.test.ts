import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  getLossIntakeSettings: vi.fn(),
  getLossIntakeThreadState: vi.fn(),
  upsertLossIntakeClaimBundle: vi.fn(),
}));

vi.mock("./lossIntakeDb", () => dbMocks);

import {
  processSlackLossIntakeEvent,
  type SlackEventEnvelope,
} from "./lossIntakeSlackEvents";

const parentTs = "1784061826.948829";
const parentText = `*Market*
Chicago
*Vehicle Type*
Tesla
*Was there a USB in the car?*
Yes
*Was there footage?*
Yes
*Last 6 of VIN*
391546
*Member Name/Customer ID*
Example Member 10944
*Member Phone Number (Confirm Active)*
5555555555
*Member Preferred Language*
English
*Date and Time of Loss (if known)*
07/14/2026 12 pm
*Location of Loss (if known)*
Example intersection
*Rideshare Status at the Time of Loss (if known):*
Uber`;

const parentEnvelope: SlackEventEnvelope = {
  type: "event_callback",
  team_id: "TFFUXNU57",
  api_app_id: "A0BHDG7RX7D",
  event_id: "Ev-parent",
  event: {
    type: "message",
    channel: "CHWRXH4HK",
    channel_type: "channel",
    user: "U_REPORTER",
    ts: parentTs,
    text: parentText,
    files: [{ id: "F1", name: "damage.jpg", mimetype: "image/jpeg" }],
  },
};

const replyEnvelope: SlackEventEnvelope = {
  type: "event_callback",
  team_id: "TFFUXNU57",
  api_app_id: "A0BHDG7RX7D",
  event_id: "Ev-reply",
  event: {
    type: "message",
    channel: "CHWRXH4HK",
    channel_type: "channel",
    user: "U_CLAIMS_REP",
    ts: String(Number(parentTs) + 180),
    thread_ts: parentTs,
    text: "Calling the member now",
  },
};

const storedThread = {
  claim: {
    slackKey: `CHWRXH4HK:${parentTs}`,
    channelId: "CHWRXH4HK",
    channelName: "claims",
    slackMessageTs: parentTs,
    slackPermalink: null,
    postedAt: new Date(Number(parentTs) * 1_000),
    memberName: "Example Member",
    customerId: "10944",
    vinLastSix: "391546",
    market: "Chicago",
    vehicleType: "ev_tesla",
    hasPhotos: true,
    attachmentCount: 1,
    rideshareStatus: "Uber",
  },
  events: [{
    eventType: "posted",
    slackEventKey: "Ev-parent",
    slackEventTs: parentTs,
    body: parentText,
    actorSlackUserId: "U_REPORTER",
    actorName: null,
    metadata: { fileCount: 1 },
  }],
};

describe("Slack Loss Intake same-thread processing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.getLossIntakeSettings.mockResolvedValue({
      firstContactSlaMinutes: 10,
      atRiskMinutes: 7,
      agentAssignments: [{
        slackUserId: "U_CLAIMS_REP",
        handlerId: 42,
        handlerName: "Claims Rep",
      }],
    });
  });

  it("waits for an in-flight parent upsert before processing its reply", async () => {
    let persistedThread: typeof storedThread | null = null;
    let releaseParentUpsert: (() => void) | undefined;
    let signalParentUpsertStarted: (() => void) | undefined;
    const parentUpsertStarted = new Promise<void>(resolve => {
      signalParentUpsertStarted = resolve;
    });
    const parentUpsertGate = new Promise<void>(resolve => {
      releaseParentUpsert = resolve;
    });

    dbMocks.getLossIntakeThreadState.mockImplementation(async () => persistedThread);
    dbMocks.upsertLossIntakeClaimBundle
      .mockImplementationOnce(async () => {
        signalParentUpsertStarted?.();
        await parentUpsertGate;
        persistedThread = storedThread;
      })
      .mockResolvedValueOnce(undefined);

    const parentResultPromise = processSlackLossIntakeEvent(parentEnvelope);
    await parentUpsertStarted;
    const replyResultPromise = processSlackLossIntakeEvent(replyEnvelope);

    releaseParentUpsert?.();

    await expect(parentResultPromise).resolves.toEqual({ status: "created" });
    await expect(replyResultPromise).resolves.toEqual({ status: "updated" });
    expect(dbMocks.getLossIntakeThreadState).toHaveBeenCalledTimes(2);
    expect(dbMocks.upsertLossIntakeClaimBundle).toHaveBeenCalledTimes(2);
  });
});
