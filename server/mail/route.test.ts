/**
 * Slice 2 acceptance test — classify + route logic
 *
 * All LLM calls are mocked with canned fixture JSON so no model credits
 * are spent. The real-LLM pass is a separate function at the bottom.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';
import type { Connection } from 'mysql2/promise';
import { route } from './route.js';
import type { ClassificationResult } from './classify.js';

// ─── Fixtures (canned classifier JSON per spec §13) ──────────────────────────

const FIXTURES: Array<{
  id: string;
  classification: ClassificationResult;
  expectedTeam: string;
  expectedHandlerEmail: string | null;
  expectedStatus: 'new' | 'assigned' | 'escalated';
  expectedNeedsReview: number;
  expectedIsDemand: number;
  expectedHasDueDate: boolean;
}> = [
  {
    id: 'C1',
    classification: {
      category: 'injury_pip_bi', confidence: 93, is_demand: true,
      demand_date: '2026-07-15', response_due_date: '2026-08-14',
      claim_number: 'CLM12345', sender_organization: 'Law Office of Smith',
      claimant_or_member_name: 'Jane Doe', adverse_carrier: null,
      date_of_loss: '2026-03-02', requested_action: 'Respond to policy-limit injury demand',
      urgency: 'high', reason: 'Attorney injury demand with medical records and a stated deadline',
    },
    expectedTeam: 'Injury',
    expectedHandlerEmail: 'jayla.bernard@drivewhip.com',
    expectedStatus: 'assigned',
    expectedNeedsReview: 0,
    expectedIsDemand: 1,
    expectedHasDueDate: true,
  },
  {
    id: 'C2',
    classification: {
      category: 'inbound_subro', confidence: 91, is_demand: true,
      demand_date: '2026-07-20', response_due_date: null,
      claim_number: 'CLM22222', sender_organization: 'State Farm',
      claimant_or_member_name: null, adverse_carrier: 'State Farm',
      date_of_loss: '2026-04-10', requested_action: 'Reimburse PD + $500 deductible',
      urgency: 'normal', reason: 'Adverse carrier seeking reimbursement',
    },
    expectedTeam: 'Inbound Subro',
    expectedHandlerEmail: 'geovanni.cabrera@drivewhip.com',
    expectedStatus: 'assigned',
    expectedNeedsReview: 0,
    expectedIsDemand: 1,
    expectedHasDueDate: false,
  },
  {
    id: 'C3',
    classification: {
      category: 'existing_claim_followup', confidence: 88, is_demand: false,
      demand_date: null, response_due_date: null,
      claim_number: 'CLM33333', sender_organization: null,
      claimant_or_member_name: 'John Member', adverse_carrier: null,
      date_of_loss: null, requested_action: 'Status update on claim',
      urgency: 'low', reason: 'Member asking for adjuster and claim status',
    },
    expectedTeam: 'First Party',
    expectedHandlerEmail: null, // least-loaded — any First Party handler
    expectedStatus: 'assigned',
    expectedNeedsReview: 0,
    expectedIsDemand: 0,
    expectedHasDueDate: false,
  },
  {
    id: 'C4',
    classification: {
      category: 'outbound_subro', confidence: 90, is_demand: false,
      demand_date: null, response_due_date: null,
      claim_number: 'CLM44444', sender_organization: 'Geico',
      claimant_or_member_name: null, adverse_carrier: 'Geico',
      date_of_loss: '2026-05-01', requested_action: 'Accept PD payment from adverse carrier',
      urgency: 'normal', reason: 'Adverse carrier accepts liability and offers PD payment',
    },
    expectedTeam: 'OB Subro',
    expectedHandlerEmail: null, // least-loaded Tim or Daniel
    expectedStatus: 'assigned',
    expectedNeedsReview: 0,
    expectedIsDemand: 0,
    expectedHasDueDate: false,
  },
  {
    id: 'C5',
    classification: {
      category: 'total_loss', confidence: 95, is_demand: false,
      demand_date: null, response_due_date: null,
      claim_number: 'CLM55555', sender_organization: 'CCC Intelligent Solutions',
      claimant_or_member_name: null, adverse_carrier: null,
      date_of_loss: '2026-06-01', requested_action: 'Review ACV and salvage figures',
      urgency: 'normal', reason: 'Total-loss valuation with ACV and salvage',
    },
    expectedTeam: 'Total Loss',
    expectedHandlerEmail: 'daniel.giono@drivewhip.com',
    expectedStatus: 'assigned',
    expectedNeedsReview: 0,
    expectedIsDemand: 0,
    expectedHasDueDate: false,
  },
  {
    id: 'C6',
    classification: {
      category: 'legal_or_high_risk', confidence: 97, is_demand: false,
      demand_date: '2026-07-01', response_due_date: '2026-08-01',
      claim_number: 'CLM66666', sender_organization: 'Court of MD',
      claimant_or_member_name: 'Plaintiff A', adverse_carrier: null,
      date_of_loss: '2026-01-15', requested_action: 'File answer to summons',
      urgency: 'urgent', reason: 'Summons and complaint, answer due date present',
    },
    expectedTeam: 'Review',
    expectedHandlerEmail: null,
    expectedStatus: 'new',
    expectedNeedsReview: 1,
    expectedIsDemand: 0,
    expectedHasDueDate: true,
  },
  {
    id: 'C7',
    classification: {
      category: 'legal_or_high_risk', confidence: 95, is_demand: true,
      demand_date: '2026-07-10', response_due_date: '2026-08-10',
      claim_number: 'CLM77777', sender_organization: 'Law Office of Jones',
      claimant_or_member_name: 'Plaintiff B', adverse_carrier: null,
      date_of_loss: '2026-02-20', requested_action: 'Respond to policy-limit demand or face bad faith',
      urgency: 'urgent', reason: 'Policy-limit demand with explicit bad-faith threat',
    },
    expectedTeam: 'Review',
    expectedHandlerEmail: null,
    expectedStatus: 'new',
    expectedNeedsReview: 1,
    expectedIsDemand: 1,
    expectedHasDueDate: true,
  },
  {
    id: 'C8',
    classification: {
      category: 'other_or_unclear', confidence: 85, is_demand: false,
      demand_date: null, response_due_date: null,
      claim_number: null, sender_organization: 'EstimatePro Inc.',
      claimant_or_member_name: null, adverse_carrier: null,
      date_of_loss: null, requested_action: null,
      urgency: 'low', reason: 'Vendor cold pitch for estimating tool',
    },
    expectedTeam: 'Review',
    expectedHandlerEmail: null,
    expectedStatus: 'new',
    expectedNeedsReview: 1,
    expectedIsDemand: 0,
    expectedHasDueDate: false,
  },
  // A1 — low confidence edge case
  {
    id: 'A1',
    classification: {
      category: 'existing_claim_followup', confidence: 60, is_demand: false,
      demand_date: null, response_due_date: null,
      claim_number: null, sender_organization: null,
      claimant_or_member_name: null, adverse_carrier: null,
      date_of_loss: null, requested_action: null,
      urgency: 'low', reason: 'Ambiguous follow-up, no claim number',
    },
    expectedTeam: 'Review',
    expectedHandlerEmail: null,
    expectedStatus: 'new',
    expectedNeedsReview: 1,
    expectedIsDemand: 0,
    expectedHasDueDate: false,
  },
];

// ─── Test suite ───────────────────────────────────────────────────────────────

let conn: Connection;

beforeAll(async () => {
  conn = await mysql.createConnection(process.env.DATABASE_URL!);
});

afterAll(async () => {
  await conn.end();
});

describe('route() — mocked LLM', () => {
  for (const fx of FIXTURES) {
    it(`${fx.id}: category=${fx.classification.category}, conf=${fx.classification.confidence}`, async () => {
      const patch = await route(conn, fx.classification);

      // Team check
      const [[teamRow]] = await conn.execute<any[]>(
        'SELECT name FROM teams WHERE id = ?', [patch.assignedTeamId]
      );
      expect(teamRow?.name, `${fx.id}: team name`).toBe(fx.expectedTeam);

      // Handler check
      if (fx.expectedHandlerEmail !== null) {
        const [[handlerRow]] = await conn.execute<any[]>(
          'SELECT email FROM handlers WHERE id = ?', [patch.assignedHandlerId]
        );
        expect(handlerRow?.email, `${fx.id}: handler email`).toBe(fx.expectedHandlerEmail);
      }

      // Status
      expect(patch.status, `${fx.id}: status`).toBe(fx.expectedStatus);

      // needsReview
      expect(patch.needsReview, `${fx.id}: needsReview`).toBe(fx.expectedNeedsReview);

      // isDemand
      expect(patch.isDemand, `${fx.id}: isDemand`).toBe(fx.expectedIsDemand);

      // dueAt: legal/demand cases must have a dueAt derived from response_due_date
      if (fx.expectedHasDueDate && fx.classification.response_due_date) {
        const expectedDue = new Date(fx.classification.response_due_date);
        expect(
          Math.abs(patch.dueAt.getTime() - expectedDue.getTime()),
          `${fx.id}: dueAt within 1s of response_due_date`
        ).toBeLessThan(1000);
      }

      // initial* snapshot
      expect(patch.initialCategory, `${fx.id}: initialCategory`).toBe(fx.classification.category);
      expect(patch.initialConfidence, `${fx.id}: initialConfidence`).toBe(fx.classification.confidence);

      // An unassigned review-lane item has only classification history; otherwise it is routed.
      const actions = patch.historyActions.map(h => h.action);
      expect(actions, `${fx.id}: history has classified`).toContain('classified');
      if (fx.expectedStatus === 'new') {
        expect(actions, `${fx.id}: history has no false assignment`).not.toContain('assigned');
        expect(actions, `${fx.id}: history has no false escalation`).not.toContain('escalated');
      } else {
        expect(
          actions.includes('assigned') || actions.includes('escalated'),
          `${fx.id}: history has assigned or escalated`
        ).toBe(true);
      }
    });
  }
});
