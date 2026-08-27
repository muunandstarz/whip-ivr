import { describe, expect, it } from 'vitest';
import { isPlaceholderMailSummary, parseMailContentFiles } from './contentRefresh.js';

describe('Mailroom content refresh eligibility', () => {
  it('recognizes the legacy placeholder summaries that require source-document reprocessing', () => {
    expect(isPlaceholderMailSummary("Claims Correspondence · Attachment 'Claims Mail.pdf' referenced but contents not provided")).toBe(true);
    expect(isPlaceholderMailSummary('Only a generic attachment filename provided with no content or context')).toBe(true);
    expect(isPlaceholderMailSummary('Demand attached · Claim CLM-101 · Progressive · Payment requested')).toBe(false);
  });

  it('keeps at most two PDF attachment entries for a safe content-refresh pass', () => {
    const entries = parseMailContentFiles('application/pdf:::a.pdf:::F1:::a.pdf|||application/pdf:::b.pdf:::F2:::b.pdf|||application/pdf:::c.pdf:::F3:::c.pdf');
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.slackFileId)).toEqual(['F1', 'F2']);
  });
});
