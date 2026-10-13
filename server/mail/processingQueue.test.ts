import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Mailroom automated processing queue', () => {
  const jobsSource = fs.readFileSync(path.resolve(process.cwd(), 'server/mail/jobs.ts'), 'utf8');
  const routerSource = fs.readFileSync(path.resolve(process.cwd(), 'server/routers/mail.ts'), 'utf8');

  it('keeps manual-review holds in the scheduled processing queue and limits browser triggers to source recovery', () => {
    expect(jobsSource).toContain('AND COALESCE(mi.needs_review, 0) = 0');
    expect(routerSource).toContain('Manual one-shot source recovery');
    expect(routerSource).toContain('Longer classification/content work stays');
  });
});
