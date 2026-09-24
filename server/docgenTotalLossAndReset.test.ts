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

  it('renders the requested damage-itemization treatment and a clean RE line', () => {
    expect(source).toContain('ITEMIZATION OF DAMAGES');
    expect(source).toContain('Vehicle Valuation (ACV)');
    expect(source).toContain('Title & Registration Fees');
    expect(source).toContain('Tear Down');
    expect(source).toContain('Salvage (deducted)');
    expect(source).toContain('doc.setLineDashPattern([0.7, 1.3], 0);');
    expect(source).toContain('"RE: Total Loss Settlement Offer"');
  });

  it('keeps applicable damage rows visible in the form, formatted preview, and AI-generated PDF branch', () => {
    expect(source).toContain('const visibleDamageRows = damageRows.filter');
    expect(source).toContain('aria-label="Itemization of Damages preview"');
    expect(source).toContain('text={aiLetter ? `${aiLetter}\\n\\n${itemizationPreview}` : preview}');
    expect(source).toContain('doc.addPage();');
    expect(source).toContain('if (!aiLetter) {');
    expect(source).toContain('doc.text("ITEMIZATION OF DAMAGES", 14, y);');
    expect(source).toContain('writeDamageRow("Vehicle Valuation (ACV)", parseFloat(form.acv) || 0);');
  });

  it('uses browser-safe blob URLs for formatted previews and a shared clear-form action', () => {
    expect(source).toContain('URL.createObjectURL(doc.output("blob"))');
    expect(source).toContain('const [formResetKey, setFormResetKey] = useState(0);');
    expect(source).toContain('const handleClearForm = () => {');
    expect(source).toContain('Clear Form');
    expect(source).toContain('key={`${activeTab}-${formResetKey}`}');
  });
});
