import { describe, expect, it } from "vitest";
import { parseCccValuationText } from "./cccValuation";

const cccText = `
Prepared for ASSURANT CLAIM MANAGEMENT
The CCC ONE® Market Valuation Summary
REPORT SUMMARY
CLAIM INFORMATION
Owner                                                   Aleman, Jose
Loss Vehicle                                            2004 Ford F-150 XL Supercab 145" WB
Loss Incident Date                                      08/28/2026
INSURANCE INFORMATION
Report Reference Number                                 133752400
Claim Reference                                         ATL-5683-480561-102835
Adjuster                                                Lane Acosta, Jasmine
VALUATION SUMMARY
Base Vehicle Value                                                    $ 3,883.00
Prior Damage*                                                         - $ 2,545.50
Adjusted Vehicle Value                                                $ 1,337.50
Vehicular Tax (6.6%)                                                   + $ 88.28
SALVAGE / TMU *                                                       - $ 1,100.00
Total                                                                 $ 325.78
VEHICLE INFORMATION
Location                                     NORCROSS, GA 30093-3056
VIN                                          1FTRX12W24NA15568
`;

describe("CCC Market Valuation parsing", () => {
  it("prefills the claimant settlement from CCC adjusted valuation fields", () => {
    expect(parseCccValuationText(cccText)).toEqual({
      claimantName: "Jose Aleman",
      claimNumber: "ATL-5683-480561-102835",
      dateOfLoss: "2026-08-28",
      vehicle: '2004 Ford F-150 XL Supercab 145" WB',
      vin: "1FTRX12W24NA15568",
      market: "GA",
      reportReference: "133752400",
      cccAdjuster: "Lane Acosta, Jasmine",
      baseVehicleValue: "3883.00",
      priorDamage: "2545.50",
      adjustedVehicleValue: "1337.50",
      salesTax: "88.28",
      taxRateLabel: "(6.6%)",
      salvageDeducted: "1100.00",
      cccTotal: "325.78",
    });
  });

  it("rejects non-CCC reports instead of applying a generic valuation", () => {
    expect(parseCccValuationText("Vehicle valuation $4,000.00")).toBeNull();
  });
});
