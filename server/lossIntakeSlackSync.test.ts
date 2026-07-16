import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  finishLossIntakeSyncRun: vi.fn(),
  getLossIntakeSettings: vi.fn(),
  listLossIntakeClaims: vi.fn(),
  startLossIntakeSyncRun: vi.fn(),
  upsertLossIntakeClaimBundle: vi.fn(),
}));

vi.mock("./lossIntakeDb", () => dbMocks);

import { ENV } from "./_core/env";
import { runLossIntakeSlackSync } from "./lossIntakeSlackSync";

const originalToken = ENV.slackBotToken;

function slackResponse(body: Record<string, unknown>, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function fnolText() {
  return [
    "*Market*",
    "Phoenix",
    "*Vehicle Type*",
    "Tesla",
    "*Last 6 of VIN*",
    "123456",
    "*Member Name/Customer ID*",
    "Example Member, 12345",
  ].join("\n");
}

describe("runLossIntakeSlackSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ENV.slackBotToken = "xoxb-test";
    dbMocks.startLossIntakeSyncRun.mockResolvedValue(7);
    dbMocks.finishLossIntakeSyncRun.mockResolvedValue(undefined);
    dbMocks.getLossIntakeSettings.mockResolvedValue({
      claimsChannelId: "C-CLAIMS",
      remoteMarketsChannelId: "C-REMOTE",
      firstContactSlaMinutes: 10,
      atRiskMinutes: 7,
      lastSuccessfulSyncAt: null,
      agentAssignments: [
        { slackUserId: "U-REP", handlerId: 42, handlerName: "Assigned Rep" },
      ],
    });
    dbMocks.listLossIntakeClaims.mockResolvedValue({ claims: [], total: 0 });
    dbMocks.upsertLossIntakeClaimBundle.mockResolvedValue(99);
  });

  afterEach(() => {
    ENV.slackBotToken = originalToken;
    vi.unstubAllGlobals();
  });

  it("discovers an FNOL parent, reads its thread, analyzes it, and persists one claim bundle", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const method = url.pathname.split("/").pop();
      if (method === "conversations.history") {
        const channel = url.searchParams.get("channel");
        return slackResponse({
          ok: true,
          messages: channel === "C-CLAIMS"
            ? [{ type: "message", ts: "1750000000.000100", text: fnolText(), files: [] }]
            : [],
          response_metadata: { next_cursor: "" },
        });
      }
      if (method === "conversations.replies") {
        return slackResponse({
          ok: true,
          messages: [
            { type: "message", ts: "1750000000.000100", text: fnolText(), files: [] },
            {
              type: "message",
              ts: "1750000300.000100",
              user: "U-REP",
              text: "Calling now. Facts of Loss: Rear impact. Preliminary Liability: Other driver. TNC Status: Offline. Requested Tesla footage. Good to go.",
            },
          ],
          response_metadata: { next_cursor: "" },
        });
      }
      if (method === "chat.getPermalink") {
        return slackResponse({ ok: true, permalink: "https://workspace.slack.com/archives/C-CLAIMS/p1750000000000100" });
      }
      throw new Error(`Unexpected Slack method: ${method}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runLossIntakeSlackSync();

    expect(result).toEqual({
      claimsDiscovered: 1,
      claimsUpdated: 1,
      eventsProcessed: 2,
      targetsProcessed: 1,
    });
    expect(dbMocks.upsertLossIntakeClaimBundle).toHaveBeenCalledTimes(1);
    const bundle = dbMocks.upsertLossIntakeClaimBundle.mock.calls[0][0];
    expect(bundle.parent.slackKey).toBe("C-CLAIMS:1750000000.000100");
    expect(bundle.analysis.assignedHandlerId).toBe(42);
    expect(bundle.analysis.firstContactMinutes).toBe(5);
    expect(bundle.analysis.stage).toBe("complete");
    expect(bundle.analysis.teslaFootageRequested).toBe(true);
    expect(dbMocks.finishLossIntakeSyncRun).toHaveBeenCalledWith(7, {
      status: "success",
      ...result,
    });
  });

  it("records a failed sync when the server Slack token is missing", async () => {
    ENV.slackBotToken = "";

    await expect(runLossIntakeSlackSync()).rejects.toThrow("SLACK_BOT_TOKEN");
    expect(dbMocks.finishLossIntakeSyncRun).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ status: "failed" }),
    );
    expect(dbMocks.upsertLossIntakeClaimBundle).not.toHaveBeenCalled();
  });
});
