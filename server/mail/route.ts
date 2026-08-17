/**
 * route(db, item, classification)
 *
 * Resolves category → team via category_routing, picks the least-loaded
 * active member of that team, applies thresholds, sets assignedAt/dueAt,
 * captures the initial_* QA snapshot, and returns the updated fields.
 *
 * Does NOT write to the DB itself — the caller applies the returned patch
 * and appends routing_history rows. This keeps the function pure and
 * easily testable.
 */

import type { Connection } from 'mysql2/promise';
import type { ClassificationResult } from './classify.js';
import { addMailBusinessDays, addMailBusinessHours, isLetterOfRepresentation } from './businessTime.js';

export interface RoutingPatch {
  // classification fields
  category: string;
  confidence: number;
  isDemand: number;
  isMedicalBill: number;
  needsReview: number;
  claimNumber: string | null;
  fromName: string | null;
  senderOrg: string | null;
  adverseCarrier: string | null;
  claimantName: string | null;
  dateOfLoss: string | null;
  requestedAction: string | null;
  urgency: string;
  reason: string | null;
  demandDate: string | null;
  responseDueDate: string | null;

  // assignment
  assignedTeamId: number;
  assignedHandlerId: number | null;
  priorityAssignment: boolean;
  status: 'new' | 'assigned' | 'escalated';
  assignedAt: Date | null;
  dueAt: Date | null;

  // QA snapshot (never overwritten after first write)
  initialCategory: string;
  initialHandlerId: number | null;
  initialConfidence: number;

  // history actions to append
  historyActions: Array<{
    action: 'classified' | 'assigned' | 'escalated';
    toHandlerId: number | null;
    reason: string | null;
  }>;
}

interface TeamRow { id: number; name: string; isReviewLane: number; slaHours: number; }
interface HandlerRow { id: number; name: string; openCount: number; }

const CONFIDENCE_AUTO   = 90;
const CONFIDENCE_REVIEW = 75;

/** Priority inbound mail goes directly to the attorney / demand owner, Jayla. */
export function isJaylaPriority(classification: ClassificationResult): boolean {
  const text = [
    classification.requested_action,
    classification.reason,
    classification.sender_organization,
  ].filter(Boolean).join(' ').toLowerCase();
  return classification.is_demand
    || classification.is_medical_bill === true
    || isLetterOfRepresentation(classification.requested_action, classification.reason)
    || /\b(attorney|attorney's|attorneys|counsel|law firm|legal representative|esq\.?|lor)\b/.test(text);
}

/** Urgent alarms cover escalations, demands, Holt matters, and court filings. */
export function isUrgentMailClassification(classification: ClassificationResult): boolean {
  const text = [
    classification.requested_action,
    classification.reason,
    classification.sender_organization,
  ].filter(Boolean).join(' ').toLowerCase();
  return classification.is_demand
    || classification.category === 'legal_or_high_risk'
    || /\b(holt|time[ -]?limit|policy[ -]?limit|court|summons|complaint|subpoena|lawsuit|litigation|hearing|answer due)\b/.test(text);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function findAddressedHandler(conn: Connection, sourceText?: string): Promise<number | null> {
  if (!sourceText?.trim()) return null;
  const [handlers] = await conn.execute<any[]>('SELECT id, name FROM handlers WHERE active = 1 AND name IS NOT NULL');
  const normalized = sourceText.replace(/\s+/g, ' ');
  for (const handler of handlers) {
    const escapedName = escapeRegex(String(handler.name)).replace(/\\ /g, '\\s+');
    if (new RegExp(`\\b${escapedName}\\b`, 'i').test(normalized)) return handler.id;
  }
  return null;
}

export async function route(
  conn: Connection,
  classification: ClassificationResult,
  /** Pass overrides for confidence thresholds in tests */
  opts?: { confidenceAuto?: number; confidenceReview?: number; sourceText?: string }
): Promise<RoutingPatch> {
  const confAuto   = opts?.confidenceAuto   ?? CONFIDENCE_AUTO;
  const confReview = opts?.confidenceReview ?? CONFIDENCE_REVIEW;

  // 1. Resolve team via category_routing
  const [[routeRow]] = await conn.execute<any[]>(
    `SELECT cr.team_id, t.id, t.name, t.is_review_lane, t.sla_hours
     FROM category_routing cr
     JOIN teams t ON t.id = cr.team_id
     WHERE cr.category = ?`,
    [classification.category]
  );
  if (!routeRow) throw new Error(`route: no team for category "${classification.category}"`);

  const team: TeamRow = {
    id: routeRow.team_id,
    name: routeRow.name,
    isReviewLane: routeRow.is_review_lane,
    slaHours: routeRow.sla_hours,
  };

  // 2. Determine if this needs review
  const isLegal = classification.category === 'legal_or_high_risk';
  const lowConf = classification.confidence < confReview;
  const needsReview = (team.isReviewLane === 1 || lowConf) ? 1 : 0;

  // 3. Determine status (will be finalized after handler lookup)
  const baseStatus: 'assigned' | 'escalated' = isLegal ? 'escalated' : 'assigned';

  // 4. Pick assignee
  //    - Review lane or low-confidence: assign to the review lane's first member (admin/lead)
  //    - Normal lane: least-loaded active member (fewest open mail_items)
  let assignedHandlerId: number | null = null;

  const priorityAssignment = isJaylaPriority(classification);
  const addresseeEligible = !priorityAssignment
    && classification.category !== 'legal_or_high_risk'
    && classification.category !== 'injury_pip_bi'
    && !classification.is_demand;
  const addressedHandlerId = addresseeEligible ? await findAddressedHandler(conn, opts?.sourceText) : null;
  if (priorityAssignment) {
    const [[jayla]] = await conn.execute<any[]>(
      `SELECT id FROM handlers WHERE active = 1 AND LOWER(name) = 'jayla bernard' LIMIT 1`,
    );
    assignedHandlerId = jayla?.id ?? null;
  } else if (addressedHandlerId) {
    assignedHandlerId = addressedHandlerId;
  } else if (team.isReviewLane === 1 || lowConf) {
    // Route to review lane
    const [[reviewTeam]] = await conn.execute<any[]>(
      `SELECT id, sla_hours FROM teams WHERE is_review_lane = 1 LIMIT 1`
    );
    if (reviewTeam) {
      // Use the review team instead
      team.id = reviewTeam.id;
      team.slaHours = reviewTeam.sla_hours;
    }
    // No specific handler for review lane (admin reviews)
    assignedHandlerId = null;
  } else {
    // Least-loaded active member
    const [members] = await conn.execute<any[]>(
      `SELECT h.id, h.name,
              COUNT(mi.id) AS open_count
       FROM team_members tm
       JOIN handlers h ON h.id = tm.handler_id AND h.active = 1
       LEFT JOIN mail_items mi
         ON mi.assigned_handler_id = h.id
        AND mi.status IN ('assigned','escalated')
        AND mi.resolved_at IS NULL
       WHERE tm.team_id = ?
       GROUP BY h.id, h.name
       ORDER BY open_count ASC, h.id ASC
       LIMIT 1`,
      [team.id]
    );
    if (members.length > 0) {
      assignedHandlerId = members[0].id;
    }
  }

  // 5. Compute the internal review deadline. Demand deadlines remain in
  // responseDueDate so an item can display and remind against both clocks.
  const now = new Date();
  const dueAt = assignedHandlerId
    ? (isLetterOfRepresentation(classification.requested_action, classification.reason)
      ? addMailBusinessDays(now, 1)
      : addMailBusinessHours(now, 4))
    : null;

  // 6. Build history actions
  const historyActions: RoutingPatch['historyActions'] = [
    { action: 'classified', toHandlerId: null, reason: classification.reason ?? null },
    ...(assignedHandlerId ? [{
      action: (baseStatus === 'escalated' ? 'escalated' : 'assigned') as 'assigned' | 'escalated',
      toHandlerId: assignedHandlerId,
      reason: needsReview ? 'low confidence — needs review' : null,
    }] : []),
  ];

  return {
    category: classification.category,
    confidence: classification.confidence,
    isDemand: classification.is_demand ? 1 : 0,
    isMedicalBill: classification.is_medical_bill ? 1 : 0,
    needsReview,
    claimNumber: classification.claim_number ?? null,
    fromName: null,
    senderOrg: classification.sender_organization ?? null,
    adverseCarrier: classification.adverse_carrier ?? null,
    claimantName: classification.claimant_or_member_name ?? null,
    dateOfLoss: classification.date_of_loss ?? null,
    requestedAction: classification.requested_action ?? null,
    urgency: isUrgentMailClassification(classification) ? 'urgent' : (classification.urgency ?? 'normal'),
    reason: classification.reason ?? null,
    demandDate: classification.demand_date ?? null,
    responseDueDate: classification.response_due_date ?? null,

    assignedTeamId: team.id,
    assignedHandlerId,
    priorityAssignment,
    status: assignedHandlerId ? baseStatus : 'new',
    assignedAt: assignedHandlerId ? now : null,
    dueAt,

    initialCategory: classification.category,
    initialHandlerId: assignedHandlerId,
    initialConfidence: classification.confidence,

    historyActions,
  };
}
