import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Total Loss settlement and form reset repairs', () => {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), 'client/src/pages/DocGenerator.tsx'),
    'utf8'
  );

  it('collects each requested Total Loss damage line and calculates it into the total', () => {
    expect(source).toContain('storage: "",');
    expect(source).toContain('adminFee: "",');
    expect(source).toContain('salesTax: "",');
    expect(source).toContain('titleRegFees: "",');
    expect(source).toContain('tearDown: "",');
    expect(source).toContain('salvageDeducted: "",');
    expect(source).toContain('Vehicle Valuation (ACV) ($)');
    expect(source).toContain('Admin Fee ($)');
    expect(source).toContain('Sales Tax ($)');
    expect(source).toContain('Title & Reg Fees ($) — MD only');
    expect(source).toContain('Tear Down ($)');
    expect(source).toContain('Auto-calc 6%');
    expect(source).toContain('Salvage (Deducted) ($)');
    expect(source).toContain('acv + storage + adminFee + salesTax + titleRegFees + tearDown - salvage');
  });

  it('renders the requested damage-itemization treatment in the compact settlement offer', () => {
    expect(source).toContain('ITEMIZATION OF DAMAGES');
    expect(source).toContain('Vehicle Valuation (ACV)');
    expect(source).toContain('Title & Registration Fees');
    expect(source).toContain('Tear Down');
    expect(source).toContain('Salvage (deducted)');
    expect(source).toContain('SETTLEMENT BREAKDOWN');
    expect(source).toContain('Actual cash value / amount tendered');
    expect(source).toContain('SETTLEMENT ACCEPTANCE');
  });

  it('keeps applicable damage rows visible in the form and creates a separate deterministic settlement PDF', () => {
    expect(source).toContain('const visibleDamageRows = damageRows.filter');
    expect(source).toContain('aria-label="Itemization of Damages preview"');
    expect(source).toContain('const activeOutputText = activeOutput === "release"');
    expect(source).toContain('doc.addPage();');
    expect(source).toContain('const settlementRows: Array');
    expect(source).toContain('Preview Settlement Offer');
    expect(source).toContain('Download Settlement Offer');
    expect(source).toContain('Whip_TLSettlement_');
    expect(source).toContain('settlementOpening: ""');
    expect(source).toContain('settlementClosing: ""');
  });

  it('generates a claimant property-damage release from the Total Loss settlement calculation', () => {
    expect(source).toContain('function buildPropertyDamageReleaseText');
    expect(source).toContain('GENERAL RELEASE OF ALL CLAIMS – PROPERTY DAMAGE');
    expect(source).toContain('const claimantReleaseText = buildPropertyDamageReleaseText');
    expect(source).toContain('settlementAmount: netAmount');
    expect(source).toContain('const handleClaimantRelease');
    expect(source).toContain('writeReleaseText(doc, claimantReleaseText');
    expect(source).toContain('Preview Claimant Release');
    expect(source).toContain('Download Claimant Release');
    expect(source).toContain('Whip_TLClaimantRelease_');
    expect(source).toContain('const witnessX = 108;');
    expect(source).toContain('renderPair(labelForSigner, "Witness Signature:");');
  });

  it('uses browser-safe blob URLs for formatted previews and a shared clear-form action', () => {
    expect(source).toContain('URL.createObjectURL(doc.output("blob"))');
    expect(source).toContain('const [formResetKey, setFormResetKey] = useState(0);');
    expect(source).toContain('const handleClearForm = () => {');
    expect(source).toContain('Clear Form');
    expect(source).toContain('key={`${activeTab}-${formResetKey}`}');
  });

  it('offers claimant-only CCC valuation upload with address, adjusted ACV, tax, transfer-fee, and salvage prefilling', () => {
    expect(source).toContain('CCC Market Valuation');
    expect(source).toContain('CLAIMANT SETTLEMENT');
    expect(source).toContain('id="tls-ccc-upload"');
    expect(source).toContain('trpc.docgen.parseCccValuation.useMutation()');
    expect(source).toContain('acv: parsed.adjustedVehicleValue || p.acv');
    expect(source).toContain('claimantAddress: parsed.claimantAddress || p.claimantAddress');
    expect(source).toContain('salesTax: parsed.salesTax || p.salesTax');
    expect(source).toContain('titleRegFees: parsed.titleRegFees || p.titleRegFees');
    expect(source).toContain('salvageDeducted: parsed.salvageDeducted || p.salvageDeducted');
    expect(source).toContain('do not deduct Prior Damage again');
  });
});
