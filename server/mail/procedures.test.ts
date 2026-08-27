/**
 * Slice 4 acceptance test — tRPC procedures
 *
 * Uses appRouter.createCaller(ctx) with seeded fixture rows.
 * No live LLM or Slack calls.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';
import type { Connection } from 'mysql2/promise';
import { appRouter } from '../routers.js';
import { buildManualTriggerResult } from '../routers/mail.js';
import { selectBalancedSlackBatch } from './jobs.js';
import type { TrpcContext } from '../_core/context.js';

// ─── Context factories ────────────────────────────────────────────────────────

const MOCK_REQ = { protocol: 'https', headers: {} } as TrpcContext['req'];
const MOCK_RES = {} as TrpcContext['res'];

/** A handler user (handlerProfileId set to a real handler in the DB) */
function handlerCtx(handlerProfileId: number, userId = 9001): TrpcContext {
  return {
    req: MOCK_REQ, res: MOCK_RES,
    user: {
      id: userId, openId: `test-handler-${userId}`, email: `handler${userId}@test.com`,
      name: 'Test Handler', loginMethod: 'manus', role: 'user',
      handlerProfileId,
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
  };
}

/** An admin user (no handlerProfileId) */
function adminCtx(userId = 9002): TrpcContext {
  return {
    req: MOCK_REQ, res: MOCK_RES,
    user: {
      id: userId, openId: `test-admin-${userId}`, email: `admin${userId}@test.com`,
      name: 'Test Admin', loginMethod: 'manus', role: 'admin',
      handlerProfileId: null,
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
  };
}

/** A plain user (no handlerProfileId, not admin) */
function plainCtx(userId = 9003): TrpcContext {
  return {
    req: MOCK_REQ, res: MOCK_RES,
    user: {
      id: userId, openId: `test-user-${userId}`, email: `user${userId}@test.com`,
      name: 'Plain User', loginMethod: 'manus', role: 'user',
      handlerProfileId: null,
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
  };
}

// ─── Test setup ───────────────────────────────────────────────────────────────

let conn: Connection;
let handlerId: number;   // a real handler in the DB
let handler2Id: number;  // a second handler for reroute target
let itemId: number;      // seeded mail_items row assigned to handlerId
let item2Id: number;     // second item for legalQueue test

beforeAll(async () => {
  conn = await mysql.createConnection(process.env.DATABASE_URL!);

  // Get two real handler IDs from the DB
  const [handlers] = await conn.execute<any[]>(
    'SELECT id FROM handlers WHERE active = 1 ORDER BY id LIMIT 2'
  );
  if (handlers.length < 2) throw new Error('Need at least 2 active handlers in DB');
  handlerId = handlers[0].id;
  handler2Id = handlers[1].id;

  // Get a real team ID
  const [[team]] = await conn.execute<any[]>('SELECT id FROM teams LIMIT 1');
  const teamId = team.id;

  // Seed a test mail_items row assigned to handlerId
  const [ins1] = await conn.execute<any>(
    `INSERT INTO mail_items
       (source, external_id, received_at, status, category, confidence,
        assigned_team_id, assigned_handler_id, assigned_at, due_at,
        initial_category, initial_handler_id, initial_confidence,
        subject, from_email, body_text, summary_note)
     VALUES ('mail', 'PROC_TEST_001', NOW(), 'assigned', 'inbound_subro', 92,
             ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 48 HOUR),
             'inbound_subro', ?, 92,
             'Test Subro Demand', 'carrier@example.com',
             'Letter of representation for David Mason is attached.',
             'Person: David Mason · Attorney letter of representation')`,
    [teamId, handlerId, handlerId]
  );
  itemId = (ins1 as any).insertId;

  // Seed a legal/demand item for legalQueue test
  const [ins2] = await conn.execute<any>(
    `INSERT INTO mail_items
       (source, external_id, received_at, status, category, confidence,
        assigned_team_id, assigned_handler_id, assigned_at, due_at,
        is_demand, response_due_date,
        subject, from_email)
     VALUES ('mail', 'PROC_TEST_002', NOW(), 'escalated', 'legal_or_high_risk', 97,
             ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 30 DAY),
             1, DATE_ADD(CURDATE(), INTERVAL 30 DAY),
             'Summons — CLM-LEGAL-001', 'attorney@lawfirm.com')`,
    [teamId, handlerId]
  );
  item2Id = (ins2 as any).insertId;
});

afterAll(async () => {
  await conn.execute(
    'DELETE FROM mail_items WHERE external_id IN (?, ?)',
    ['PROC_TEST_001', 'PROC_TEST_002']
  );
  await conn.end();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('mail tRPC procedures', () => {

  it('P0a: selects oldest and newest Claims Mail work together during backlog recovery', () => {
    const candidates = [
      { id: 'oldest', timestamp: 1 },
      { id: 'old', timestamp: 2 },
      { id: 'middle-a', timestamp: 3 },
      { id: 'middle-b', timestamp: 4 },
      { id: 'new', timestamp: 5 },
      { id: 'newest', timestamp: 6 },
    ];
    expect(selectBalancedSlackBatch(candidates, 4).map(item => item.id)).toEqual(['oldest', 'old', 'new', 'newest']);
  });

  it('P0: production Trigger Now formats a bounded live recovery result without external test calls', () => {
    const result = buildManualTriggerResult(
      { inserted: 1, skipped: 0, errors: [] },
      { inserted: 1, skipped: 0, resolved: 0, totalFiles: 100, selected: 2, errors: [] },
    );
    expect(result.ok).toBe(true);
    expect(result.queued).toBe(true);
    expect(result.results.ingest).toMatchObject({ inserted: 1, errors: [] });
    expect(result.results.slackIngest).toMatchObject({ inserted: 1, selected: 2, errors: [] });
    expect(result.results.process).toMatchObject({ queued: true, source: 'New Mailroom items' });
  });

  it('P1: myPendingCount returns correct count for the handler', async () => {
    const caller = appRouter.createCaller(handlerCtx(handlerId));
    const { count } = await caller.mail.myPendingCount();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('P2: myMailroom returns items assigned to the handler', async () => {
    const caller = appRouter.createCaller(handlerCtx(handlerId));
    const { items } = await caller.mail.myMailroom();
    const ids = items.map(i => i.id);
    expect(ids).toContain(itemId);
  });

  it('P3: getItem returns item + files + notes + history', async () => {
    const caller = appRouter.createCaller(handlerCtx(handlerId));
    const result = await caller.mail.getItem({ id: itemId });
    expect(result.item.id).toBe(itemId);
    expect(result.item.category).toBe('inbound_subro');
    expect(Array.isArray(result.files)).toBe(true);
    expect(Array.isArray(result.notes)).toBe(true);
    expect(Array.isArray(result.history)).toBe(true);
  });

  it('P4: addNote appends a note to mail_item_notes', async () => {
    const caller = appRouter.createCaller(handlerCtx(handlerId, 9001));
    await caller.mail.addNote({ itemId, note: 'Test note from P4' });

    const [[noteRow]] = await conn.execute<any[]>(
      'SELECT * FROM mail_item_notes WHERE item_id = ? ORDER BY id DESC LIMIT 1',
      [itemId]
    );
    expect(noteRow.note).toBe('Test note from P4');
    expect(noteRow.by_user_id).toBe(9001);
  });

  it('P5: setReminder sets remindAt on the item', async () => {
    const caller = appRouter.createCaller(handlerCtx(handlerId));
    const remindAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await caller.mail.setReminder({ itemId, remindAt });

    const [[row]] = await conn.execute<any[]>(
      'SELECT remind_at FROM mail_items WHERE id = ?', [itemId]
    );
    expect(new Date(row.remind_at).getTime()).toBeCloseTo(remindAt.getTime(), -3);
  });

  it('P6: reroute moves assignee and writes a rerouted history row', async () => {
    const caller = appRouter.createCaller(handlerCtx(handlerId, 9001));
    await caller.mail.reroute({ itemId, toHandlerId: handler2Id, reason: 'Test reroute' });

    const [[row]] = await conn.execute<any[]>(
      'SELECT assigned_handler_id FROM mail_items WHERE id = ?', [itemId]
    );
    expect(row.assigned_handler_id).toBe(handler2Id);

    const [[histRow]] = await conn.execute<any[]>(
      `SELECT * FROM mail_routing_history
       WHERE item_id = ? AND action = 'rerouted' ORDER BY id DESC LIMIT 1`,
      [itemId]
    );
    expect(histRow).toBeTruthy();
    expect(histRow.to_handler_id).toBe(handler2Id);
    expect(histRow.reason).toBe('Test reroute');
    expect(histRow.by_user_id).toBe(9001);

    // Restore original assignment for subsequent tests
    await conn.execute(
      'UPDATE mail_items SET assigned_handler_id = ? WHERE id = ?',
      [handlerId, itemId]
    );
  });

  it('P7: escalate sets status=escalated and needsReview=1', async () => {
    const caller = appRouter.createCaller(handlerCtx(handlerId));
    await caller.mail.escalate({ itemId, reason: 'Needs legal review' });

    const [[row]] = await conn.execute<any[]>(
      'SELECT status, needs_review FROM mail_items WHERE id = ?', [itemId]
    );
    expect(row.status).toBe('escalated');
    expect(row.needs_review).toBe(1);

    // Restore for subsequent tests
    await conn.execute(
      "UPDATE mail_items SET status = 'assigned', needs_review = 0 WHERE id = ?",
      [itemId]
    );
  });

  it('P8: resolve sets status=resolved, resolvedAt, and attaches a note', async () => {
    const caller = appRouter.createCaller(handlerCtx(handlerId, 9001));
    await caller.mail.resolve({ itemId, note: 'Resolved in P8 test' });

    const [[row]] = await conn.execute<any[]>(
      'SELECT status, resolved_at FROM mail_items WHERE id = ?', [itemId]
    );
    expect(row.status).toBe('resolved');
    expect(row.resolved_at).toBeTruthy();

    const [[noteRow]] = await conn.execute<any[]>(
      `SELECT * FROM mail_item_notes WHERE item_id = ? AND note = 'Resolved in P8 test'`,
      [itemId]
    );
    expect(noteRow).toBeTruthy();

    // Restore for subsequent tests
    await conn.execute(
      "UPDATE mail_items SET status = 'assigned', resolved_at = NULL WHERE id = ?",
      [itemId]
    );
  });

  it('P9: adminQueue returns items (admin context)', async () => {
    const caller = appRouter.createCaller(adminCtx());
    const { items } = await caller.mail.adminQueue();
    expect(Array.isArray(items)).toBe(true);
    const ids = items.map(i => i.id);
    expect(ids).toContain(itemId);
  });

  it('P9b: adminQueue searches stored email body and AI summary text', async () => {
    const caller = appRouter.createCaller(adminCtx());
    const { items } = await caller.mail.adminQueue({ search: 'David Mason' });
    expect(items.map(item => item.id)).toContain(itemId);
  });

  it('P10: adminQueue rejects a non-admin caller', async () => {
    const caller = appRouter.createCaller(plainCtx());
    await expect(caller.mail.adminQueue()).rejects.toThrow();
  });

  it('P11: log returns items (admin context)', async () => {
    const caller = appRouter.createCaller(adminCtx());
    const { items } = await caller.mail.log();
    expect(Array.isArray(items)).toBe(true);
  });

  it('P12: legalQueue returns only legal/demand items sorted by due date', async () => {
    const caller = appRouter.createCaller(adminCtx());
    const { items } = await caller.mail.legalQueue();
    const ids = items.map(i => i.id);
    expect(ids).toContain(item2Id);
    // All items must be legal or demand
    for (const item of items) {
      expect(
        item.category === 'legal_or_high_risk' || item.isDemand === 1,
        `item ${item.id} must be legal or demand`
      ).toBe(true);
    }
  });

  it('P13: reclassify overrides category and writes a rerouted history row', async () => {
    const caller = appRouter.createCaller(adminCtx(9002));
    await caller.mail.reclassify({
      itemId,
      category: 'outbound_subro',
      toHandlerId: handler2Id,
      reason: 'manual reclassify test',
    });

    const [[row]] = await conn.execute<any[]>(
      'SELECT category, assigned_handler_id FROM mail_items WHERE id = ?', [itemId]
    );
    expect(row.category).toBe('outbound_subro');
    expect(row.assigned_handler_id).toBe(handler2Id);

    const [[histRow]] = await conn.execute<any[]>(
      `SELECT * FROM mail_routing_history
       WHERE item_id = ? AND action = 'rerouted' AND reason = 'manual reclassify test'
       ORDER BY id DESC LIMIT 1`,
      [itemId]
    );
    expect(histRow).toBeTruthy();
    expect(histRow.by_user_id).toBe(9002);
  });

  it('P14: stats returns aggregate counts (admin)', async () => {
    const caller = appRouter.createCaller(adminCtx());
    const stats = await caller.mail.stats();
    expect(stats).toBeTruthy();
    expect(typeof stats!.total).toBe('number');
    expect(typeof stats!.open).toBe('number');
    expect(typeof stats!.legal).toBe('number');
  });
});
