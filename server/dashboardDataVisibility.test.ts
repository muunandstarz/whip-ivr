import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('dashboard data visibility', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'client/src/pages/Dashboard.tsx'), 'utf8');

  it('places a common period selector above both intake and call-volume sections', () => {
    expect(source).toContain('Dashboard period');
    expect(source).toContain('The selection controls both the Intake Records and Call Volume sections.');
    expect(source).toContain('"All Time"');
    expect(source).toContain('No processed intake records in the last 7 days.');
    expect(source).toContain('Call activity remains available in the Call Volume section below.');
  });
});
