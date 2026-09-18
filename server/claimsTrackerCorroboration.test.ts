import { describe, expect, it } from "vitest";
import { buildClaimsTrackerIndex, buildClaimsTrackerOAuthUrl, matchTrackerFiling, normalizeVinFragment, parseOperationalDate } from "./claimsTrackerCorroboration";

const headers = ["A", "B", "Claim # (Last 8 of VIN)", "Member Name", "Date of Loss", "F", "G", "H", "I", "J", "K", "L", "M", "N", "Snapsheet Link (Claim File)"];
const row = (vin: string, member: string, lossDate: string, link = "") => ["", "", vin, member, lossDate, "", "", "", "", "", "", "", "", "", link];
const index = () => buildClaimsTrackerIndex({ allReportedIncidentsStatus: [headers,
  row("AA150009", "Oluwaremilekun Kola-Ogunbule", "09/07/2026", "https://snapsheetvice.com/claims/2043507"),
  row("AA312438", "Olakunle Odutoye", "09/10/2026", "https://snapsheetvice.com/claims/2049666"),
  row("AA650094", "Michael Smith", "02/11/2026", "https://snapsheetvice.com/claims/1683926"),
  row("AA111111", "Filed One", "09/07/2026"), row("AA222222", "Filed Two", "09/08/2026"), row("AA333333", "Filed Three", "09/09/2026"), row("AA444444", "Filed Four", "09/10/2026"), row("AA555555", "Filed Five", "09/11/2026"),
] });

describe("Claims Tracker same-loss filing test", () => {
  it("requests a separate read-only Sheets consent flow", () => {
    const url = new URL(buildClaimsTrackerOAuthUrl("https://whipclaimsivr.com/api/mail/gmail-oauth-callback"));
    expect(url.searchParams.get("state")).toBe("claims-tracker-readonly");
    expect(url.searchParams.get("scope")).toContain("spreadsheets.readonly");
  });

  it("uses the documented six-digit VIN fragment normalization", () => {
    expect(normalizeVinFragment("AA650094")).toBe("650094");
    expect(normalizeVinFragment("T3140850")).toBe("140850");
  });

  it("matches Oluwaremilekun’s September 7 FNOL to the same loss", () => {
    expect(matchTrackerFiling({ index: index(), vinLastSix: "150009", memberName: "Oluwaremilekun Kola-Ogunbule", dateOfLoss: "09/07/2026" })?.claimNumber).toBe("AA150009");
  });

  it("matches the corrected 312438 VIN, not the superseded 312437 source value", () => {
    expect(matchTrackerFiling({ index: index(), vinLastSix: "312438", memberName: "Olakunle Odutoye", dateOfLoss: "09/10/2026" })?.claimNumber).toBe("AA312438");
    expect(matchTrackerFiling({ index: index(), vinLastSix: "312437", memberName: "Olakunle Odutoye", dateOfLoss: "09/10/2026" })).toBeNull();
  });

  it("does not let Michael Smith’s February loss file the September 8 loss on the same vehicle", () => {
    expect(matchTrackerFiling({ index: index(), vinLastSix: "650094", memberName: "Michael Smith", dateOfLoss: "09/08/2026" })).toBeNull();
  });

  it("excludes five same-loss filed notices even when the Claim File link is blank", () => {
    for (const [vin, member, date] of [["111111", "Filed One", "09/07/2026"], ["222222", "Filed Two", "09/08/2026"], ["333333", "Filed Three", "09/09/2026"], ["444444", "Filed Four", "09/10/2026"], ["555555", "Filed Five", "09/11/2026"]]) {
      expect(matchTrackerFiling({ index: index(), vinLastSix: vin, memberName: member, dateOfLoss: date })).not.toBeNull();
    }
  });

  it("uses calendar dates rather than timezone-dependent timestamps", () => {
    expect(parseOperationalDate("09/10/2026")?.toISOString()).toBe("2026-09-10T00:00:00.000Z");
  });
});
