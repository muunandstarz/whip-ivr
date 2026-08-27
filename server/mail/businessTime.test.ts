import { describe, expect, it } from 'vitest';
import { addMailBusinessDays, addMailBusinessHours, isLetterOfRepresentation } from './businessTime.js';

describe('Mailroom business-time SLA', () => {
  it('keeps a four-hour review entirely inside the Tuesday business window', () => {
    const assignedAt = new Date('2026-04-07T17:00:00.000Z'); // Tue 1:00 PM EDT
    expect(addMailBusinessHours(assignedAt, 4).toISOString()).toBe('2026-04-07T21:00:00.000Z'); // 5:00 PM EDT
  });

  it('carries unfinished review time to the next Tue–Fri business window', () => {
    const assignedAt = new Date('2026-04-09T20:00:00.000Z'); // Thu 4:00 PM EDT
    expect(addMailBusinessHours(assignedAt, 4).toISOString()).toBe('2026-04-10T19:00:00.000Z'); // Fri 3:00 PM EDT
  });

  it('starts a weekend assignment at Tuesday 1:00 PM Eastern', () => {
    const assignedAt = new Date('2026-04-11T15:00:00.000Z'); // Sat 11:00 AM EDT
    expect(addMailBusinessHours(assignedAt, 4).toISOString()).toBe('2026-04-14T21:00:00.000Z');
  });

  it('gives LOR items one next-business-day review deadline', () => {
    const assignedAt = new Date('2026-04-09T20:00:00.000Z'); // Thu 4:00 PM EDT
    expect(addMailBusinessDays(assignedAt, 1).toISOString()).toBe('2026-04-10T17:00:00.000Z'); // Fri 1:00 PM EDT
  });

  it('identifies both full and abbreviated letters of representation', () => {
    expect(isLetterOfRepresentation('Letter of Representation received', null)).toBe(true);
    expect(isLetterOfRepresentation(null, 'LOR attached by counsel')).toBe(true);
    expect(isLetterOfRepresentation('Review demand', null)).toBe(false);
  });
});
