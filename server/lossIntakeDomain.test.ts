import { describe, expect, it } from "vitest";
import {
  analyzeFnolThread,
  isFnolParent,
  parseFnolParent,
  type SlackLossParent,
} from "./lossIntakeDomain";

const makeParent = (overrides: Partial<SlackLossParent> = {}): SlackLossParent => ({
  channelId: "CHWRXH4HK",
  channelName: "claims",
  ts: "1784061826.948829",
  text: `*Market*
Chicago
*Vehicle Type*
Tesla
*Was there a USB in the car?*
Yes
*Was there footage?*
Yes
*Last 6 of VIN*
391546
*Mileage*
57758
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
Uber`,
  files: [{ id: "F1", name: "damage.jpg", mimetype: "image/jpeg" }],
  permalink: "https://example.slack.com/archives/CHWRXH4HK/example",
  ...overrides,
});

const assignment = {
  slackUserId: "U_CLAIMS_REP",
  handlerId: 42,
  handlerName: "Claims Rep",
};

describe("Loss Intake FNOL parsing", () => {
  it("rejects unrelated Gravity Forms accident alerts", () => {
    const text = "A new accident report has been filed for *Example Member*\nEntry #12345";
    expect(isFnolParent(text)).toBe(false);
    expect(parseFnolParent(makeParent({ text }))).toBeNull();
  });

  it("parses labeled Tesla FNOL fields and name-first customer IDs", () => {
    const parsed = parseFnolParent(makeParent());
    expect(parsed).toMatchObject({
      slackKey: "CHWRXH4HK:1784061826.948829",
      memberName: "Example Member",
      customerId: "10944",
      vinLastSix: "391546",
      market: "Chicago",
      vehicleType: "ev_tesla",
      hasPhotos: true,
      attachmentCount: 1,
      rideshareStatus: "Uber",
    });
  });

  it.each([
    ["#9325, Example Member", "Example Member", "9325"],
    ["9325, Example Member", "Example Member", "9325"],
    ["Example Member #9325", "Example Member", "9325"],
    ["Example Member 9325", "Example Member", "9325"],
    ["Example Member", "Example Member", null],
  ])("parses member/customer format %s", (raw, memberName, customerId) => {
    const parsed = parseFnolParent(
      makeParent({
        text: makeParent().text.replace("Example Member 10944", raw),
      }),
    );
    expect(parsed?.memberName).toBe(memberName);
    expect(parsed?.customerId).toBe(customerId);
  });
});

describe("Loss Intake thread analysis", () => {
  it("uses only configured intake reps for first contact and authoritative completion", () => {
    const parent = parseFnolParent(makeParent());
    expect(parent).not.toBeNull();
    if (!parent) return;

    const analysis = analyzeFnolThread({
      parent,
      assignments: [assignment],
      now: new Date(parent.postedAt.getTime() + 15 * 60_000),
      replies: [
        {
          ts: String(Number(parent.slackMessageTs) + 60),
          text: "calling the member now",
          userId: "U_UNCONFIGURED",
          userName: "Other User",
        },
        {
          ts: String(Number(parent.slackMessageTs) + 180),
          text: "calling the member now",
          userId: assignment.slackUserId,
          userName: assignment.handlerName,
        },
        {
          ts: String(Number(parent.slackMessageTs) + 240),
          text: "good to go",
          userId: "U_UNCONFIGURED",
          userName: "Other User",
        },
        {
          ts: String(Number(parent.slackMessageTs) + 360),
          text: `Facts of Loss: Member was stopped and struck from behind.
TNC Status: Uber - P3
Preliminary Liability: Member not at fault
Please check if we have Tesla footage.
Good to go`,
          userId: assignment.slackUserId,
          userName: assignment.handlerName,
        },
      ],
    });

    expect(analysis.assignedHandlerId).toBe(42);
    expect(analysis.firstContactMinutes).toBeCloseTo(3, 4);
    expect(analysis.completedAt?.getTime()).toBe(
      parent.postedAt.getTime() + 360 * 1000,
    );
    expect(analysis.intakeCycleMinutes).toBeCloseTo(6, 4);
    expect(analysis.stage).toBe("complete");
    expect(analysis.slaState).toBe("within_sla");
    expect(analysis.factsOfLoss).toBe("Member was stopped and struck from behind.");
    expect(analysis.preliminaryLiability).toBe("Member not at fault");
    expect(analysis.rideshareStatus).toBe("Uber - P3");
    expect(analysis.teslaFootageRequested).toBe(true);
    expect(analysis.qualityScore).toBe(100);
    expect(analysis.missingElements).toEqual([]);
  });

  it("marks an untouched claim at risk at seven minutes and breached after ten", () => {
    const parent = parseFnolParent(makeParent());
    expect(parent).not.toBeNull();
    if (!parent) return;

    const atRisk = analyzeFnolThread({
      parent,
      assignments: [assignment],
      replies: [],
      now: new Date(parent.postedAt.getTime() + 7 * 60_000),
    });
    const breached = analyzeFnolThread({
      parent,
      assignments: [assignment],
      replies: [],
      now: new Date(parent.postedAt.getTime() + 11 * 60_000),
    });

    expect(atRisk.slaState).toBe("at_risk");
    expect(breached.slaState).toBe("breached");
    expect(breached.stage).toBe("awaiting_outreach");
    expect(breached.missingElements).toContain("first_contact_sla");
  });

  it("awards the Tesla-only footage points as not applicable for gas claims", () => {
    const parsed = parseFnolParent(
      makeParent({
        text: makeParent().text.replace("Tesla", "Gas"),
        files: [],
      }),
    );
    expect(parsed).not.toBeNull();
    if (!parsed) return;

    const analysis = analyzeFnolThread({
      parent: parsed,
      assignments: [assignment],
      replies: [],
      now: parsed.postedAt,
    });
    const footage = analysis.qualityItems.find(
      item => item.criterion === "tesla_footage_request",
    );

    expect(footage).toMatchObject({
      result: "not_applicable",
      points: 10,
      maxPoints: 10,
    });
    expect(analysis.teslaFootageRequested).toBeNull();
  });
});
