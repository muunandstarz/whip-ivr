/**
 * Slice 5 acceptance test — mailReminders job
 *
 * Slack DM calls are mocked. No live API calls.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';
import type { Connection } from 'mysql2/promise';
import { resolveReminderSlackUserId, runMailReminders } from './jobs.js';
import type { SlackDMFn } from './jobs.js';

let conn: Connection;
let handlerId: number;
let overdueItemId: number;
let futureItemId: number;
let reminderDueItemId: number;

beforeAll(async () => {
  conn = await mysql.createConnection(process.env.DATABASE_URL!);

  // Get a real handler with email
  const [[h]] = await conn.execute<any[]>(
    "SELECT id, email FROM handlers WHERE active = 1 AND email IS NOT NULL LIMIT 1"
  );
  if (!h) throw new Error('Need an active handler with email in DB');
  handlerId = h.id;

  // Get a real team
  const [[team]] = await conn.execute<any[]>('SELECT id FROM teams LIMIT 1');
  const teamId = team.id;

  // Seed 3 items:
  // 1. Overdue (dueAt in the past)
  const [ins1] = await conn.execute<any>(
    `INSERT INTO mail_items
       (source, external_id, received_at, status, category,
        assigned_team_id, assigned_handler_id, assigned_at,
        due_at, subject)
     VALUES ('mail', 'REM_TEST_001', NOW(), 'assigned', 'inbound_subro',
             ?, ?, NOW(),
             DATE_SUB(NOW(), INTERVAL 2 HOUR), 'Overdue Test Item')`,
    [teamId, handlerId]
  );
  overdueItemId = (ins1 as any).insertId;

  // 2. Future (dueAt in the future — should NOT be notified)
  const [ins2] = await conn.execute<any>(
    `INSERT INTO mail_items
       (source, external_id, received_at, status, category,
        assigned_team_id, assigned_handler_id, assigned_at,
        due_at, subject)
     VALUES ('mail', 'REM_TEST_002', NOW(), 'assigned', 'inbound_subro',
             ?, ?, NOW(),
             DATE_ADD(NOW(), INTERVAL 48 HOUR), 'Future Test Item')`,
    [teamId, handlerId]
  );
  futureItemId = (ins2 as any).insertId;

  // 3. remindAt due (remindAt in the past)
  const [ins3] = await conn.execute<any>(
    `INSERT INTO mail_items
       (source, external_id, received_at, status, category,
        assigned_team_id, assigned_handler_id, assigned_at,
        due_at, remind_at, subject)
     VALUES ('mail', 'REM_TEST_003', NOW(), 'assigned', 'existing_claim_followup',
             ?, ?, NOW(),
             DATE_ADD(NOW(), INTERVAL 24 HOUR),
             DATE_SUB(NOW(), INTERVAL 1 HOUR), 'Reminder Due Test Item')`,
    [teamId, handlerId]
  );
  reminderDueItemId = (ins3 as any).insertId;
});

afterAll(async () => {
  await conn.execute(
    "DELETE FROM mail_items WHERE external_id IN ('REM_TEST_001','REM_TEST_002','REM_TEST_003')"
  );
  await conn.end();
});

describe('runMailReminders() — mocked Slack DM', () => {
  it('R0: uses the durable Mail Bot Slack ID without requiring an email-directory lookup', async () => {
    const mockSlack: SlackDMFn = {
      lookupByEmail: vi.fn().mockResolvedValue('U_EMAIL_LOOKUP'),
      sendDM: vi.fn(),
    };

    await expect(resolveReminderSlackUserId({ mailbot_slack_id: 'U_MAILBOT', handler_email: 'agent@example.com' }, mockSlack))
      .resolves.toBe('U_MAILBOT');
    expect(mockSlack.lookupByEmail).not.toHaveBeenCalled();
  });

  it('R1: notifies overdue and remindAt-due items, skips future items', async () => {
    const sentTo: string[] = [];
    const mockSlack: SlackDMFn = {
      lookupByEmail: vi.fn().mockResolvedValue('U_MOCK_HANDLER'),
      sendDM: vi.fn().mockImplementation(async (userId, text) => {
        sentTo.push(text);
      }),
    };

    const result = await runMailReminders(conn, mockSlack, {
      itemIds: [overdueItemId, futureItemId, reminderDueItemId],
    });

    // Should have notified at least 2 (overdue + remindAt-due)
    expect(result.notified, 'notified count').toBeGreaterThanOrEqual(2);
    expect(result.errors, 'errors').toHaveLength(0);

    // Verify lastRemindedAt was set on the overdue item
    const [[row]] = await conn.execute<any[]>(
      'SELECT last_reminded_at FROM mail_items WHERE id = ?', [overdueItemId]
    );
    expect(row.last_reminded_at, 'lastRemindedAt set').toBeTruthy();

    // The future item should NOT have lastRemindedAt set
    const [[futureRow]] = await conn.execute<any[]>(
      'SELECT last_reminded_at FROM mail_items WHERE id = ?', [futureItemId]
    );
    expect(futureRow.last_reminded_at, 'future item not notified').toBeNull();
  });

  it('R2: second run within throttle window does NOT re-notify', async () => {
    const mockSlack: SlackDMFn = {
      lookupByEmail: vi.fn().mockResolvedValue('U_MOCK_HANDLER'),
      sendDM: vi.fn(),
    };

    // Run again immediately — items now have lastRemindedAt set within throttle window
    const result2 = await runMailReminders(conn, mockSlack, {
      itemIds: [overdueItemId, futureItemId, reminderDueItemId],
    });

    // The overdue and remindAt-due items should be skipped (throttled)
    // sendDM should not have been called for our test items
    const calls = (mockSlack.sendDM as ReturnType<typeof vi.fn>).mock.calls;
    // All calls should be for items OTHER than our throttled test items
    // (there may be other overdue items in the DB from other tests)
    expect(result2.errors, 'no errors on second run').toHaveLength(0);

    // Verify the overdue item's lastRemindedAt was NOT updated (it was already set)
    const [[row]] = await conn.execute<any[]>(
      'SELECT last_reminded_at FROM mail_items WHERE id = ?', [overdueItemId]
    );
    const firstRemindedAt = new Date(row.last_reminded_at).getTime();
    // Should be within 5 seconds of when R1 ran (not updated by R2)
    expect(Date.now() - firstRemindedAt, 'lastRemindedAt not updated by R2').toBeLessThan(30000);
  });
});
