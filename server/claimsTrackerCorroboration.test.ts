import { describe, expect, it } from "vitest";
import {
  applyClaimsTrackerCorroboration,
  buildClaimsTrackerIndex,
  buildClaimsTrackerOAuthUrl,
  normalizeVinFragment,
} from "./claimsTrackerCorroboration";
import type { ThreadAnalysis } from "./lossIntakeDomain";

const analysis = (state: ThreadAnalysis["filingState"], vin = "123456"): ThreadAnalysis => ({
  assignedHandlerId: null, assignedAgent: null, stage: "awaiting_outreach", firstContactAt: null, firstContactMinutes: null,
  slaState: "within_sla", slaType: "immediate", slaDeadlineAt: null, completedAt: null, intakeCycleMinutes: null,
  factsOfLoss: null, folQualityScore: null, preliminaryLiability: null, rideshareStatus: null, noAnswerAttempts: 0,
  contactAttempts: 0, storeTeamTagged: false, templatePostedAt: null, templatePostMinutesFromContact: null,
  templatePostMinutesFromReport: null, teslaFootageRequested: null, qualityScore: 0, missingElements: [],
  firstResponseBusinessMinutes: null, templateBusinessMinutes: null, slaTargetBusinessMinutes: 10,
  onSiteFlag: false, onSiteDetectedAt: null, onSiteReason: null, inspectionScheduledAt: null, inspectionScheduleSource: null,
  claimId: null, filingState: state, filingEvidence: "Slack template has no Claim ID.", duplicateGroupKey: `customer:123|vin:${vin}`,
  dataWarnings: [], events: [], qualityItems: [],
});

describe("Claims Tracker corroboration", () => {
  it("requests a separate read-only Sheets consent flow", () => {
    const url = new URL(buildClaimsTrackerOAuthUrl("https://whipclaimsivr.com/api/mail/gmail-oauth-callback"));
    expect(url.searchParams.get("state")).toBe("claims-tracker-readonly");
    expect(url.searchParams.get("scope")).toContain("spreadsheets.readonly");
    expect(url.searchParams.get("scope")).not.toContain("gmail");
  });

  it("uses a row on All Reported IncidentsStatus as the entire filed test even when column O is blank", () => {
    const index = buildClaimsTrackerIndex({
      allReportedIncidentsStatus: [
        ["Member Name", "Claim # (Last 8 of VIN)", "Snapsheet Link (Claim File)"],
        ["Michael Smith", "AA650094", ""],
        ["Another Member", "BB123456", "https://example.test/file"],
      ],
    });
    expect(index.filedVins.has("650094")).toBe(true);
    expect(index.filedVins.has("123456")).toBe(true);
    expect(index.unfiledVins.size).toBe(0);
  });

  it("maps inspection dates only for scheduling and never uses a market arrival flag", () => {
    const index = buildClaimsTrackerIndex({
      allReportedIncidentsStatus: [["Claim # (Last 8 of VIN)"]],
      marketSchedules: {
        ATL: [["Claim # (Last 8 of VIN)", "Inspection Date"], ["AA650094", "09/18/2026 10:30 AM"]],
      },
    });
    const result = applyClaimsTrackerCorroboration(analysis("unfiled", "650094"), index);
    expect(result.inspectionScheduleSource).toBe("ATL");
    expect(result.inspectionScheduledAt).toBeInstanceOf(Date);
    expect(result.inspectionScheduledAt?.toISOString()).toContain("14:30:00.000Z");
    expect(result.onSiteFlag).toBe(false);
  });

  it("moves a Slack notice out of the unreported set whenever the filed tab contains its VIN", () => {
    const index = buildClaimsTrackerIndex({
      allReportedIncidentsStatus: [["Claim # (Last 8 of VIN)"], ["AA123456"]],
    });
    const result = applyClaimsTrackerCorroboration(analysis("unfiled"), index);
    expect(result.filingState).toBe("filed");
    expect(result.filingEvidence).toContain("All Reported IncidentsStatus contains VIN 123456");
  });

  it("normalizes a valid eight-character tracker fragment and a malformed fallback", () => {
    expect(normalizeVinFragment("AA650094")).toBe("650094");
    expect(normalizeVinFragment("T3140850")).toBe("140850");
    expect(normalizeVinFragment("R3035556")).toBe("035556");
    expect(normalizeVinFragment("broken-650094")).toBe("650094");
  });
});
