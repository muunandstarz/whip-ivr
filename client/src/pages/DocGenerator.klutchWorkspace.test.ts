import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const docGenerator = fs.readFileSync(path.resolve(process.cwd(), "client/src/pages/DocGenerator.tsx"), "utf8");
const workspace = fs.readFileSync(path.resolve(process.cwd(), "client/src/components/KlutchPolicyDocumentsWorkspace.tsx"), "utf8");
const contract = fs.readFileSync(path.resolve(process.cwd(), "shared/klutchPolicy.ts"), "utf8");

describe("Klutch policy documents workspace", () => {
  it("replaces active COI/declarations navigation with the single Klutch workspace", () => {
    expect(docGenerator).toContain('id: "klutch-policy-documents", label: "Klutch Policy Documents"');
    expect(docGenerator).toContain('case "klutch-policy-documents": return <KlutchPolicyDocumentsWorkspace');
    expect(docGenerator).toContain("LEGACY_KLUTCH_TAB_IDS");
    expect(docGenerator).toContain('return "klutch-policy-documents"');
    expect(docGenerator).not.toContain('{ id: "coi-whip", label: "Certificate of Insurance"');
    expect(docGenerator).not.toContain('{ id: "klutch-policy-declarations", label: "Klutch — Policy Declarations (Approved)"');
    expect(docGenerator).not.toContain('{ id: "coverage-tnc", label: "Coverage Position — TNC Primary"');
  });

  it("provides all five created-not-sent Klutch outputs and handler safeguards", () => {
    for (const label of ["Policy Declarations", "TNC Coverage Denial", "Carrier Coverage Position", "Policy Cancellation Notice", "Endorsement KIC-END-002"]) {
      expect(contract).toContain(label);
    }
    expect(workspace).toContain("CREATED_NOT_SENT");
    expect(workspace).toContain("Created is not sent");
    expect(workspace).toContain("Period 0 is personal use");
    expect(workspace).toContain("Manager approval required.");
  });

  it("keeps declarations policy-level while requiring claim data only for claim documents", () => {
    expect(workspace).toContain('const documentRequiresClaim = (["tnc_denial", "carrier_position", "endorsement"] as KlutchDocumentType[]).includes(documentType);');
    expect(workspace).toContain('const sourceClaimNumber = docForm.claimNumber || activePolicy.leaseId;');
    expect(workspace).toContain('if (documentRequiresClaim && !sourceClaimNumber)');
    expect(workspace).not.toContain('if (!docForm.claimNumber && documentType !== "cancellation_notice")');
  });

  it("offers a no-save declaration preview plus visible native print and download controls", () => {
    expect(workspace).toContain('Preview draft declaration');
    expect(workspace).toContain('DRAFT PREVIEW — NOT SAVED OR SENT');
    expect(workspace).toContain('Preview PDF & save audit');
    expect(workspace).toContain('Download PDF & save audit');
    expect(workspace).toContain('Open / Print');
    expect(workspace).toContain('Use <strong>Open / Print</strong> for the browser’s native print dialog');
  });

  it("uses Whip claim mapping, structured mailing fields, and complete TNC denial inputs", () => {
    expect(workspace).toContain('>Whip claim number<');
    expect(workspace).toContain('memberStreet');
    expect(workspace).toContain('memberCity');
    expect(workspace).toContain('memberState');
    expect(workspace).toContain('memberZip');
    expect(workspace).toContain('writeMemberMailingAddress');
    expect(workspace).toContain('Optional TNC insurer reference');
    expect(workspace).toContain('TNC insurer name');
    expect(workspace).toContain('TNC insurer claim number');
    expect(contract).toContain('memberStreet?: string');
    expect(contract).toContain('memberZip?: string');
  });

  it("uses the supplied Klutch asset and standard document identity treatment", () => {
    expect(workspace).toContain("klutch-insurance-logo_c2ff6576.png");
    expect(workspace).toContain("NAIC 17966");
    expect(workspace).toContain("Bobby Taheri");
    expect(workspace).toContain("Metrocars Leasing Corp");
    expect(workspace).toContain("Created for policy or claim handling — not sent");
    expect(workspace).not.toContain("Head of Claims");
  });

  it("uses physical line leading for multi-line Klutch legal text", () => {
    expect(workspace).toContain('const lineHeightFactor = Math.max(1.2, lineHeight / (10.2 * 0.3528));');
    expect(workspace).not.toContain('lineHeightFactor: lineHeight / 10.2');
  });
});
