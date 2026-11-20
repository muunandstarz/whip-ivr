import { describe, expect, it } from "vitest";
import {
  ACORD_STATES, ACORD_MINIMUM_REFERENCES, emptyAcordDraft, applyAcordPreset, restoreAcordDraft,
  validateAcordDraft, validAcordDate, acordAmount, acordFilename, acordDescription, acordOperatorDescription,
  type AcordDraft,
} from "../shared/acordPresets";

function complete(preset: AcordDraft["preset"] = "klutch-minimum"): AcordDraft {
  return { ...applyAcordPreset(emptyAcordDraft("2026-11-19"), preset, "MD"),
    contactName: "TEST PRODUCER CONTACT",
    namedOperator: "TEST OPERATOR", operatorAddress: "TEST ADDRESS", holderName: "TEST HOLDER", holderAddress: "TEST ADDRESS",
    policyNumber: "TEST RECORD", coverageReference: "TEST DECLARATIONS / AUTHORIZATION",
    effectiveDate: "2026-01-01", expirationDate: "2027-01-01", vehicleYear: "2026", vehicleMake: "TEST", vehicleModel: "MODEL",
    vin: "1HGCM82633A000001", metrocarsRepresentative: "TEST AUTHORITY", metrocarsRepresentativeTitle: "TEST TITLE" };
}

describe("ACORD preset starting points", () => {
  it("contains exactly the requested eight states with sourced applicability notes", () => {
    expect(ACORD_STATES).toEqual(["MD", "VA", "FL", "GA", "IL", "MA", "PA", "TX"]);
    for (const state of ACORD_STATES) {
      const ref = ACORD_MINIMUM_REFERENCES[state];
      expect(ref.biPerson).toBeGreaterThan(0); expect(ref.biAccident).toBeGreaterThanOrEqual(ref.biPerson);
      expect(ref.propertyDamage).toBeGreaterThan(0); expect(ref.note.length).toBeGreaterThan(20);
      expect(ref.sources.length).toBeGreaterThan(0);
      expect(ref.sources.every(source => source.startsWith("https://"))).toBe(true);
    }
  });
  it("uses current dated VA and MA references while flagging historical periods", () => {
    expect(ACORD_MINIMUM_REFERENCES.VA).toEqual(expect.objectContaining({ biPerson: 50000, biAccident: 100000, propertyDamage: 25000, effectiveDate: "2025-01-01" }));
    expect(ACORD_MINIMUM_REFERENCES.MA).toEqual(expect.objectContaining({ biPerson: 25000, biAccident: 50000, propertyDamage: 30000, effectiveDate: "2025-07-01" }));
    expect(ACORD_MINIMUM_REFERENCES.MA.note).toContain("historical");
    expect(ACORD_MINIMUM_REFERENCES.VA.note).toContain("historical");
    expect(ACORD_MINIMUM_REFERENCES.FL.note).toContain("NOT the ordinary Florida");
    expect(ACORD_MINIMUM_REFERENCES.FL.note).toContain("rental");
  });
  it("has company-only Uber defaults and no personal identifying sample operator or VIN", () => {
    const draft = emptyAcordDraft("2026-11-19");
    expect(draft).toEqual(expect.objectContaining({ preset: "klutch-fl-uber-black", state: "FL", insuredOrganization: "Sunbeam Fleet", namedOperator: "", operatorAddress: "", vin: "", policyNumber: "", limitBasis: "split", biPerson: "125000", biAccident: "250000", propertyDamage: "50000" }));
    expect(draft.autoScopes).toEqual(["scheduled"]);
    expect(draft.additionalInsured).toBe(false); expect(draft.subrogationWaived).toBe(false);
    expect(draft.metrocarsRepresentative).toBe(""); expect(draft.metrocarsRepresentativeTitle).toBe("");
  });
  it("defaults all three contacts to Jasmine without creating policy facts or sign-off and preserves edits", () => {
    for (const preset of ["klutch-fl-uber-black", "klutch-minimum", "metrocars-minimum"] as const) {
      const draft = applyAcordPreset(emptyAcordDraft(), preset, "MD");
      expect(draft.contactName).toBe("Jasmine Lane Acosta");
      expect(draft.autoScopes).toEqual(["scheduled"]);
      expect(draft.policyNumber).toBe(""); expect(draft.coverageReference).toBe("");
      expect(draft.description).toBe(""); expect(draft.metrocarsRepresentative).toBe("");
      expect(draft).not.toHaveProperty("representativeName");
      expect(applyAcordPreset({ ...draft, contactName: "Edited Contact" }, preset).contactName).toBe("Edited Contact");
      expect(restoreAcordDraft({ ...draft, contactName: "Edited Contact" }).contactName).toBe("Edited Contact");
    }
  });
  it("changes reference limits for every state but never invents actual policy facts or endorsements", () => {
    const source = { ...complete(), additionalInsured: true, subrogationWaived: true, endorsementReference: "TEST OLD ENDORSEMENT" };
    for (const state of ACORD_STATES) {
      for (const preset of ["klutch-minimum", "metrocars-minimum"] as const) {
        const next = applyAcordPreset(source, preset, state);
        expect(next.state).toBe(state); expect(next.limitBasis).toBe("split");
        expect(next.biPerson).toBe(String(ACORD_MINIMUM_REFERENCES[state].biPerson));
        expect(next.biAccident).toBe(String(ACORD_MINIMUM_REFERENCES[state].biAccident));
        expect(next.propertyDamage).toBe(String(ACORD_MINIMUM_REFERENCES[state].propertyDamage));
        expect(next.policyNumber).toBe(source.policyNumber); expect(next.namedOperator).toBe(source.namedOperator);
        expect(next.effectiveDate).toBe(source.effectiveDate); expect(next.vin).toBe(source.vin);
        expect(next.additionalInsured).toBe(false); expect(next.subrogationWaived).toBe(false); expect(next.endorsementReference).toBe("");
      }
    }
    const uber = applyAcordPreset(source, "klutch-fl-uber-black", "TX");
    expect(uber.state).toBe("FL"); expect(uber.insuredOrganization).toBe("Sunbeam Fleet");
    expect(uber.limitBasis).toBe("split"); expect(uber.biPerson).toBe("125000");
  });
});

describe("ACORD actual-fact validation and input-only restoration", () => {
  it("does not treat presets as complete certificates", () => {
    const errors = validateAcordDraft(emptyAcordDraft());
    expect(errors).toEqual(expect.arrayContaining(["Named operator", "Operator address", "Policy / self-insurance certificate number", "Verified policy / self-insurance source reference", "Vehicle VIN"]));
  });
  it("requires all existing actual-record errors and validates dates and liability limits", () => {
    expect(validateAcordDraft(complete())).toEqual([]);
    expect(validAcordDate("2024-02-29")).toBe(true);
    for (const invalid of ["2026-02-29", "2026-13-01", "2026-04-31", "11/19/2026", ""]) expect(validAcordDate(invalid)).toBe(false);
    expect(validateAcordDraft({ ...complete(), expirationDate: "2026-01-01" })).toContain("Expiration must be after effective date");
    expect(validateAcordDraft({ ...complete(), limitBasis: "" })).toContain("Select one verified limit format");
    expect(validateAcordDraft({ ...complete(), biPerson: "60000", biAccident: "30000" })).toContain("BI per accident cannot be below per person");
    expect(validateAcordDraft({ ...complete(), propertyDamage: "0" }).some(error => error.includes("Property damage"))).toBe(true);
    expect(acordAmount("$300,000.00")).toBe(300000);
    for (const invalid of ["", "0", "-1", "1e6", "NaN", "1000000001", "1.234"]) expect(acordAmount(invalid)).toBeNull();
  });
  it("validates Sunbeam, Florida, active-on-certificate dates, and separate owner-provided Uber thresholds", () => {
    const draft = complete("klutch-fl-uber-black");
    expect(validateAcordDraft(draft)).toEqual([]);
    expect(validateAcordDraft({ ...draft, insuredOrganization: "OTHER COMPANY" })).toContain("Uber Black named insured must identify Sunbeam");
    expect(validateAcordDraft({ ...draft, state: "TX" })).toContain("Uber Black preset is Florida-only");
    expect(validateAcordDraft({ ...draft, effectiveDate: "2026-12-01" })).toContain("Uber Black coverage must be active on the certificate date");
    expect(validateAcordDraft({ ...draft, expirationDate: draft.issueDate })).toContain("Uber Black coverage must be active on the certificate date");
    expect(validateAcordDraft({ ...draft, biPerson: "124999" })).toContain("Uber Black BI per person must be at least $125,000");
    expect(validateAcordDraft({ ...draft, biAccident: "249999" })).toContain("Uber Black BI per accident must be at least $250,000");
    expect(validateAcordDraft({ ...draft, propertyDamage: "49999" })).toContain("Uber Black property damage must be at least $50,000");
    expect(validateAcordDraft({ ...draft, limitBasis: "csl", combinedSingleLimit: "299999" })).toContain("Uber Black actual combined single limit must be at least $300,000");
    expect(draft.limitBasis).toBe("split"); // No derived CSL assertion from BI-accident + PD.
  });
  it("requires explicitly supplied covered-auto scope, valid VIN and actual endorsement references", () => {
    const draft = complete();
    expect(validateAcordDraft({ ...draft, autoScopes: [] })).toContain("Covered-auto scope");
    expect(validateAcordDraft({ ...draft, autoScopes: ["any", "scheduled"] })).toContain("Any auto cannot be combined with narrower scope selections");
    expect(validateAcordDraft({ ...draft, vin: "INVALIDVIN" })).toContain("VIN (17 valid characters required)");
    expect(validateAcordDraft({ ...draft, vin: "1HGCM82633A00000I" })).toContain("VIN (17 valid characters required)");
    for (const flag of ["additionalInsured", "subrogationWaived"] as const) {
      expect(validateAcordDraft({ ...draft, [flag]: true })).toContain("Actual provision / endorsement reference for additional-insured or waiver status");
      expect(validateAcordDraft({ ...draft, [flag]: true, endorsementReference: "TEST ACTUAL PROVISION" })).toEqual([]);
    }
  });
  it("requires MetroCars own authorized representative rather than login or Klutch attribution", () => {
    const draft = complete("metrocars-minimum");
    expect(validateAcordDraft(draft)).toEqual([]);
    expect(validateAcordDraft({ ...draft, metrocarsRepresentative: "", metrocarsRepresentativeTitle: "" })).toContain("MetroCars authorized representative name and title");
    expect(acordDescription(draft)).toContain("self-insured");
    expect(acordDescription(draft)).toContain("does not represent a policy issued by an insurance carrier");
  });
  it("includes one driver and complete address in the operations description for every preset", () => {
    for (const preset of ["klutch-fl-uber-black", "klutch-minimum", "metrocars-minimum"] as const) {
      const draft = { ...complete(preset), namedOperator: " Synthetic Example Driver ", operatorAddress: "100 Example Avenue\r\n Suite 2 \r\nRockville, MD 20850", description: "Verified manual note" };
      const expected = "Driver: Synthetic Example Driver; 100 Example Avenue, Suite 2, Rockville, MD 20850";
      expect(acordOperatorDescription(draft)).toBe(expected);
      const description = acordDescription(draft);
      expect(description.split("\n")[0]).toBe(expected);
      expect(description.match(/Synthetic Example Driver/g)).toHaveLength(1);
      expect(description.match(/100 Example Avenue/g)).toHaveLength(1);
      expect(description).toContain("Verified manual note");
      expect(description).not.toMatch(/demonstration only|No insurance or Uber approval represented/i);
    }
    expect(acordOperatorDescription({ namedOperator: "", operatorAddress: "Unattributed address" })).toBe("");
    expect(acordOperatorDescription({ namedOperator: "Driver only", operatorAddress: "" })).toBe("Driver: Driver only");
    expect(validateAcordDraft({ ...complete(), operatorAddress: "" })).toContain("Operator address");
  });
  it("restores only supported plain inputs and never persisted verification or foreign attribution", () => {
    const raw = { ...complete(), state: "ZZ", preset: "UNKNOWN", limitBasis: "FAKE", autoScopes: ["scheduled", "invalid", 1], producerName: "x".repeat(20000), additionalInsured: true, subrogationWaived: "yes", consent: { source: true }, representativeName: "FORGED", handlerName: "LOGIN", pdfUrl: "blob:old" };
    const restored = restoreAcordDraft(raw);
    expect(restored.preset).toBe("klutch-fl-uber-black"); expect(restored.state).toBe("FL"); expect(restored.limitBasis).toBe("");
    expect(restored.autoScopes).toEqual(["scheduled"]); expect(restored.producerName.length).toBe(10000);
    expect(restored.additionalInsured).toBe(true); expect(restored.subrogationWaived).toBe(false);
    expect(restored).not.toHaveProperty("consent"); expect(restored).not.toHaveProperty("pdfUrl");
    expect(restored).not.toHaveProperty("representativeName"); expect(restored).not.toHaveProperty("handlerName");
    expect(restoreAcordDraft(null)).toEqual(emptyAcordDraft());
    expect(restoreAcordDraft({ ...complete("klutch-fl-uber-black"), state: "TX" }).state).toBe("FL");
  });
  it("creates branded, sanitized local filenames without the Whip dashboard title", () => {
    expect(acordFilename({ ...complete(), certificateNumber: "TEST/CERT" })).toBe("Klutch-ACORD-25-TEST-CERT.pdf");
    expect(acordFilename({ ...complete("metrocars-minimum"), certificateNumber: "TEST/CERT" }, true)).toBe("MetroCars-ACORD-25-TEST-CERT-DRAFT.pdf");
    expect(acordFilename(complete())).not.toContain("Whip");
  });
});
