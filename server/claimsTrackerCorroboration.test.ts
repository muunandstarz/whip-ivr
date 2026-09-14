import { describe, expect, it } from "vitest";
import { applyClaimsTrackerCorroboration, buildClaimsTrackerIndex, buildClaimsTrackerOAuthUrl } from "./claimsTrackerCorroboration";
import type { ThreadAnalysis } from "./lossIntakeDomain";

const analysis = (state: ThreadAnalysis["filingState"]): ThreadAnalysis => ({
  assignedHandlerId: null, assignedAgent: null, stage: "awaiting_outreach", firstContactAt: null, firstContactMinutes: null, slaState: "within_sla", slaType: "immediate", slaDeadlineAt: null, completedAt: null, intakeCycleMinutes: null, factsOfLoss: null, folQualityScore: null, preliminaryLiability: null, rideshareStatus: null, noAnswerAttempts: 0, contactAttempts: 0, storeTeamTagged: false, templatePostedAt: null, templatePostMinutesFromContact: null, templatePostMinutesFromReport: null, teslaFootageRequested: null, qualityScore: 0, missingElements: [], firstResponseBusinessMinutes: null, templateBusinessMinutes: null, slaTargetBusinessMinutes: 10, onSiteFlag: false, onSiteDetectedAt: null, onSiteReason: null, claimId: null, filingState: state, filingEvidence: "Slack template has no Claim ID.", duplicateGroupKey: "customer:123|vin:123456", dataWarnings: [], events: [], qualityItems: [],
});

describe("Claims Tracker corroboration", () => {
  it("requests a separate read-only Sheets consent flow", () => {
    const url = new URL(buildClaimsTrackerOAuthUrl("https://whipclaimsivr.com/api/mail/gmail-oauth-callback"));
    expect(url.searchParams.get("state")).toBe("claims-tracker-readonly");
    expect(url.searchParams.get("scope")).toContain("spreadsheets.readonly");
    expect(url.searchParams.get("scope")).not.toContain("gmail");
  });

  it("indexes filed and pending tracker values by VIN last six", () => {
    const index = buildClaimsTrackerIndex({ rawData: [["Claim Number", "LAST 6"], ["ATL-11980-557661-090926", "557661"]], pendingIntakes: [["NAME", "", "", "VIN", "", "", "", "", "", "", "", "", "", "", "", "", "Added to Snapsheet"], ["Maria", "", "", "5YJ3E1EA0PF557661", "", "", "", "", "", "", "", "", "", "", "", "", "TRUE"]] });
    expect(index.filedVins.has("557661")).toBe(true);
    expect(index.claimByVin.get("557661")).toContain("ATL-");
  });

  it("keeps Slack unfiled evidence authoritative and flags a Tracker disagreement", () => {
    const index = buildClaimsTrackerIndex({ rawData: [["Claim Number", "LAST 6"], ["ATL-11980-123456-090926", "123456"]] });
    const result = applyClaimsTrackerCorroboration(analysis("unfiled"), index);
    expect(result.filingState).toBe("unfiled");
    expect(result.dataWarnings.join(" ")).toContain("disagree");
  });
});
