import { describe, expect, it } from 'vitest';
import { CONTENT_REFRESH_PRIORITY_SQL, isPlaceholderMailSummary, parseMailContentFiles } from './contentRefresh.js';

describe('Mailroom content refresh eligibility', () => {
  it('recognizes the legacy placeholder summaries that require source-document reprocessing', () => {
    expect(isPlaceholderMailSummary("Claims Correspondence · Attachment 'Claims Mail.pdf' referenced but contents not provided")).toBe(true);
    expect(isPlaceholderMailSummary('Only a generic attachment filename provided with no content or context')).toBe(true);
    expect(isPlaceholderMailSummary('Demand attached · Claim CLM-101 · Progressive · Payment requested')).toBe(false);
  });

  it('keeps at most two document or image attachment entries for a safe content-refresh pass', () => {
    const entries = parseMailContentFiles('application/pdf:::a.pdf:::F1:::a.pdf|||application/pdf:::b.pdf:::F2:::b.pdf|||application/pdf:::c.pdf:::F3:::c.pdf');
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.slackFileId)).toEqual(['F1', 'F2']);
  });

  it('includes recoverable image files so the vision classifier can create a usable summary', () => {
    const entries = parseMailContentFiles('image/png:::fax.png:::F1:::fax.png|||image/jpeg:::damage.jpg:::F2:::damage.jpg');
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.filename)).toEqual(['fax.png', 'damage.jpg']);
  });

  it('prioritizes Slack-source files, stored body text, and attached documents before empty legacy rows', () => {
    expect(CONTENT_REFRESH_PRIORITY_SQL).toContain("mif.slack_file_id");
    expect(CONTENT_REFRESH_PRIORITY_SQL).toContain("mi.body_text");
    expect(CONTENT_REFRESH_PRIORITY_SQL).toContain("COUNT(mif.id)");
  });
});
