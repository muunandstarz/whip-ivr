import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Mailroom item detail summary display', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'client/src/pages/MailroomItem.tsx'), 'utf8');

  it('shows a generated summary when summaryNote is available and keeps the original body separate', () => {
    expect(source).toContain('{item.summaryNote && (');
    expect(source).toContain('Mailroom Summary');
    expect(source).toContain('{item.summaryNote}</p>');
    expect(source).toContain('Message Body');
    expect(source).toContain('{item.bodyText}');
  });
});
