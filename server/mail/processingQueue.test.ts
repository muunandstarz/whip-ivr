import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Mailroom automated processing queue', () => {
  const jobsSource = fs.readFileSync(path.resolve(process.cwd(), 'server/mail/jobs.ts'), 'utf8');
  const routerSource = fs.readFileSync(path.resolve(process.cwd(), 'server/routers/mail.ts'), 'utf8');

  it('skips records already held for manual review so a missing source cannot block later intake', () => {
    expect(jobsSource).toContain('AND COALESCE(mi.needs_review, 0) = 0');
    expect(routerSource).toContain('AND COALESCE(mi.needs_review, 0) = 0');
  });
});
