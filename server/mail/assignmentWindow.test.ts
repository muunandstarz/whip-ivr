import { describe, expect, it } from 'vitest';
import { deferRoutineAssignment } from './jobs.js';
import { isMailRoutineAssignmentWindow, mailEasternDayBounds } from './businessTime.js';

describe('Mailroom routine assignment window', () => {
  it('opens only during the Tuesday–Friday 1 PM Eastern batch', () => {
    expect(isMailRoutineAssignmentWindow(new Date('2026-09-01T17:00:00.000Z'))).toBe(true); // Tue 1 PM EDT
    expect(isMailRoutineAssignmentWindow(new Date('2026-09-01T18:00:00.000Z'))).toBe(false); // Tue 2 PM EDT
    expect(isMailRoutineAssignmentWindow(new Date('2026-08-31T17:00:00.000Z'))).toBe(false); // Mon 1 PM EDT
  });

  it('uses Eastern calendar-day bounds across daylight-saving time', () => {
    const { start, end } = mailEasternDayBounds(new Date('2026-11-04T18:00:00.000Z'));
    expect(start.toISOString()).toBe('2026-11-04T05:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-05T05:00:00.000Z');
  });

  it('retains classification history but removes routine assignment fields while queued', () => {
    const deferred = deferRoutineAssignment({
      assignedHandlerId: 17,
      status: 'assigned',
      assignedAt: new Date('2026-09-01T17:00:00.000Z'),
      dueAt: new Date('2026-09-01T21:00:00.000Z'),
      initialHandlerId: 17,
      historyActions: [
        { action: 'classified', toHandlerId: null, reason: 'routine item' },
        { action: 'assigned', toHandlerId: 17, reason: null },
      ],
    } as any);
    expect(deferred.status).toBe('new');
    expect(deferred.assignedHandlerId).toBeNull();
    expect(deferred.assignedAt).toBeNull();
    expect(deferred.dueAt).toBeNull();
    expect(deferred.initialHandlerId).toBeNull();
    expect(deferred.historyActions).toEqual([{ action: 'classified', toHandlerId: null, reason: 'routine item' }]);
  });
});
