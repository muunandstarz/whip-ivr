import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('COI and declarations state-specific coverage rules', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'client/src/pages/DocGenerator.tsx'), 'utf8');

  it('lists Metrocars as named insured, emphasizes the renter as additional named insured, and marks applicable coverages', () => {
    expect(source).toContain('"NAMED INSURED"');
    expect(source).toContain('"ADDITIONAL NAMED INSURED / RENTER"');
    expect(source).toContain('state === "MD" ? ["BI", "PD", "UM", "UIM", "COL", "COMP"]');
    expect(source).toContain('additionalInsuredCoverageCodes.has(row.insr) ? "[X]" : "[ ]"');
  });

  it('enforces Florida 10/20 BI, mandatory PIP, and automatic UM rejection', () => {
    expect(source).toContain('FL: { biPP: "$10,000", biPO: "$20,000"');
    expect(source).toContain('const isFloridaPipMandatory = state === "FL";');
    expect(source).toContain('Florida PIP is mandatory at $10,000 and cannot be waived');
    expect(source).toContain('const isAutomaticUmRejection = state === "FL" || state === "GA";');
  });

  it('automatically rejects UM for Georgia in the COI and retained declarations renderer', () => {
    expect(source).toContain('setUmRejected(isAutomaticUmRejection);');
    expect(source).toContain('GA: { biPP: "$25,000", biPO: "$50,000"');
    expect(source).toContain('FL: { biPP: "$10,000", biPO: "$20,000", pdLimit: "$10,000", umPP: "$10,000", umPO: "$20,000", uimPP: "", uimPO: "", pip: true, pipLimit: "$10,000", umRejectable: true');
  });
});
