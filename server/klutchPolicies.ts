import mysql, { type RowDataPacket } from "mysql2/promise";
import {
  KLUTCH_CREATED_NOT_SENT,
  KLUTCH_DOCUMENT_TYPES,
  KLUTCH_STATES,
  canonicalizeSnapSheetClaim,
  formatKlutchClaimNumber,
  formatKlutchPolicyNumber,
  type KlutchDocumentType,
  type KlutchPolicyTerms,
  type KlutchState,
} from "@shared/klutchPolicy";

export type KlutchActor = { userId: number; name: string };

type DbPolicy = RowDataPacket & {
  id: number;
  policy_number: string;
  policy_sequence: number;
  issue_request_key: string;
  lease_id: string;
  state: KlutchState;
  effective_on: string;
  expires_on: string;
  status: "active" | "cancelled" | "expired";
  cancelled_on: string | null;
  cancellation_reason: string | null;
  terms: string | KlutchPolicyTerms;
  created_by_name: string;
  created_at: string;
  updated_at: string;
};

type DbClaim = RowDataPacket & {
  id: number;
  policy_id: number;
  klutch_claim_number: string;
  claim_sequence: number;
  snapsheet_claim_number: string;
  created_at: string;
};

const POLICY_DOCUMENT_VERSION = "KIC-2026.10";

function databaseUrl() {
  if (!process.env.DATABASE_URL) throw new Error("Database is not available");
  return process.env.DATABASE_URL;
}

export function toDateOnly(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const stringValue = String(value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(stringValue) ? stringValue : "";
}

function parseTerms(value: DbPolicy["terms"]): KlutchPolicyTerms {
  if (typeof value === "string") return JSON.parse(value) as KlutchPolicyTerms;
  return value as KlutchPolicyTerms;
}

function publicPolicy(row: DbPolicy) {
  return {
    id: Number(row.id),
    policyNumber: row.policy_number,
    policySequence: Number(row.policy_sequence),
    issueRequestKey: row.issue_request_key,
    leaseId: row.lease_id,
    state: row.state,
    effectiveOn: toDateOnly(row.effective_on),
    expiresOn: toDateOnly(row.expires_on),
    status: row.status,
    cancelledOn: row.cancelled_on ? toDateOnly(row.cancelled_on) : null,
    cancellationReason: row.cancellation_reason,
    terms: parseTerms(row.terms),
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function assertState(state: string): asserts state is KlutchState {
  if (!(KLUTCH_STATES as readonly string[]).includes(state)) {
    throw new Error("Klutch policies can only be issued for MD, VA, PA, FL, IL, GA, MA, or TX.");
  }
}

function assertTerm(effectiveOn: string, expiresOn: string) {
  if (!toDateOnly(effectiveOn) || !toDateOnly(expiresOn) || effectiveOn >= expiresOn) {
    throw new Error("A valid effective date and later expiration date are required.");
  }
}

async function allocateSequence(conn: mysql.Connection, key: "policy" | "claim") {
  const [sequenceRows] = await conn.execute<RowDataPacket[]>(
    "SELECT last_issued FROM klutch_number_sequences WHERE sequence_key = ? FOR UPDATE",
    [key]
  );
  if (!sequenceRows[0]) throw new Error(`Klutch ${key} sequence is not initialized.`);
  const next = Number(sequenceRows[0].last_issued) + 1;
  if (!Number.isSafeInteger(next) || next > 999999) throw new Error(`Klutch ${key} sequence has reached its safe limit.`);
  await conn.execute("UPDATE klutch_number_sequences SET last_issued = ? WHERE sequence_key = ?", [next, key]);
  return next;
}

async function getClaimForPolicy(conn: mysql.Connection, policyId: number, snapsheetClaimNumber: string, actor: KlutchActor) {
  const canonical = canonicalizeSnapSheetClaim(snapsheetClaimNumber);
  if (!canonical) throw new Error("A SnapSheet claim number is required to save this claim document.");
  const [existingRows] = await conn.execute<DbClaim[]>(
    "SELECT * FROM klutch_claims WHERE snapsheet_claim_number = ? FOR UPDATE",
    [canonical]
  );
  if (existingRows[0]) {
    if (Number(existingRows[0].policy_id) !== policyId) throw new Error("This SnapSheet claim is already mapped to another Klutch policy.");
    return existingRows[0];
  }
  const sequence = await allocateSequence(conn, "claim");
  const klutchClaimNumber = formatKlutchClaimNumber(sequence);
  const [result] = await conn.execute<mysql.ResultSetHeader>(
    `INSERT INTO klutch_claims
      (policy_id, klutch_claim_number, claim_sequence, snapsheet_claim_number, created_by_user_id, created_by_name)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [policyId, klutchClaimNumber, sequence, canonical, actor.userId, actor.name]
  );
  const id = Number(result.insertId);
  await conn.execute(
    `INSERT INTO klutch_policy_events (policy_id, event_type, actor_user_id, actor_name, metadata)
     VALUES (?, 'claim_mapped', ?, ?, ?)`,
    [policyId, actor.userId, actor.name, JSON.stringify({ klutchClaimNumber, snapsheetClaimNumber: canonical })]
  );
  const [created] = await conn.execute<DbClaim[]>("SELECT * FROM klutch_claims WHERE id = ?", [id]);
  return created[0];
}

export async function issueKlutchPolicy(input: {
  issueRequestKey: string;
  leaseId: string;
  state: string;
  effectiveOn: string;
  expiresOn: string;
  terms: KlutchPolicyTerms;
}, actor: KlutchActor) {
  assertState(input.state);
  assertTerm(input.effectiveOn, input.expiresOn);
  if (!input.issueRequestKey.trim() || !input.leaseId.trim() || !input.terms.memberName.trim() || !input.terms.vehicle.trim()) {
    throw new Error("Lease ID, member name, vehicle, and an idempotency key are required to issue a policy.");
  }
  const conn = await mysql.createConnection(databaseUrl());
  try {
    await conn.beginTransaction();
    const [replayed] = await conn.execute<DbPolicy[]>("SELECT * FROM klutch_policies WHERE issue_request_key = ? FOR UPDATE", [input.issueRequestKey]);
    if (replayed[0]) {
      await conn.commit();
      return publicPolicy(replayed[0]);
    }
    const sequence = await allocateSequence(conn, "policy");
    const policyNumber = formatKlutchPolicyNumber(input.state, sequence);
    const normalizedTerms: KlutchPolicyTerms = {
      ...input.terms,
      leaseId: input.leaseId.trim(),
      state: input.state,
      effectiveOn: input.effectiveOn,
      expiresOn: input.expiresOn,
    };
    const [result] = await conn.execute<mysql.ResultSetHeader>(
      `INSERT INTO klutch_policies
        (policy_number, policy_sequence, issue_request_key, lease_id, state, effective_on, expires_on, terms,
         created_by_user_id, created_by_name, updated_by_user_id, updated_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [policyNumber, sequence, input.issueRequestKey.trim(), input.leaseId.trim(), input.state, input.effectiveOn, input.expiresOn,
       JSON.stringify(normalizedTerms), actor.userId, actor.name, actor.userId, actor.name]
    );
    const policyId = Number(result.insertId);
    await conn.execute(
      `INSERT INTO klutch_policy_terms (policy_id, term_number, effective_on, expires_on, terms, created_by_user_id, created_by_name)
       VALUES (?, 1, ?, ?, ?, ?, ?)`,
      [policyId, input.effectiveOn, input.expiresOn, JSON.stringify(normalizedTerms), actor.userId, actor.name]
    );
    await conn.execute(
      `INSERT INTO klutch_policy_events (policy_id, event_type, actor_user_id, actor_name, metadata)
       VALUES (?, 'issued', ?, ?, ?)`,
      [policyId, actor.userId, actor.name, JSON.stringify({ policyNumber, policySequence: sequence, terms: normalizedTerms })]
    );
    const [created] = await conn.execute<DbPolicy[]>("SELECT * FROM klutch_policies WHERE id = ?", [policyId]);
    await conn.commit();
    return publicPolicy(created[0]);
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    await conn.end();
  }
}

export async function renewKlutchPolicy(policyId: number, effectiveOn: string, expiresOn: string, terms: KlutchPolicyTerms, actor: KlutchActor) {
  assertTerm(effectiveOn, expiresOn);
  const conn = await mysql.createConnection(databaseUrl());
  try {
    await conn.beginTransaction();
    const [policies] = await conn.execute<DbPolicy[]>("SELECT * FROM klutch_policies WHERE id = ? FOR UPDATE", [policyId]);
    const policy = policies[0];
    if (!policy || policy.status !== "active") throw new Error("Only an active Klutch policy can be renewed.");
    const [termsRows] = await conn.execute<RowDataPacket[]>("SELECT COALESCE(MAX(term_number), 0) AS max_term FROM klutch_policy_terms WHERE policy_id = ? FOR UPDATE", [policyId]);
    const termNumber = Number(termsRows[0]?.max_term ?? 0) + 1;
    const normalizedTerms = { ...terms, effectiveOn, expiresOn, state: policy.state, leaseId: policy.lease_id };
    await conn.execute(
      `INSERT INTO klutch_policy_terms (policy_id, term_number, effective_on, expires_on, terms, created_by_user_id, created_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [policyId, termNumber, effectiveOn, expiresOn, JSON.stringify(normalizedTerms), actor.userId, actor.name]
    );
    await conn.execute(
      `UPDATE klutch_policies SET effective_on = ?, expires_on = ?, terms = ?, updated_by_user_id = ?, updated_by_name = ? WHERE id = ?`,
      [effectiveOn, expiresOn, JSON.stringify(normalizedTerms), actor.userId, actor.name, policyId]
    );
    await conn.execute(
      `INSERT INTO klutch_policy_events (policy_id, event_type, actor_user_id, actor_name, metadata)
       VALUES (?, 'renewed', ?, ?, ?)`,
      [policyId, actor.userId, actor.name, JSON.stringify({ termNumber, effectiveOn, expiresOn, terms: normalizedTerms })]
    );
    const [updated] = await conn.execute<DbPolicy[]>("SELECT * FROM klutch_policies WHERE id = ?", [policyId]);
    await conn.commit();
    return publicPolicy(updated[0]);
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    await conn.end();
  }
}

export async function cancelKlutchPolicy(input: { policyId: number; cancelledOn: string; claimNumber?: string; documentSnapshot: Record<string, unknown> }, actor: KlutchActor) {
  if (!toDateOnly(input.cancelledOn)) throw new Error("A valid lease-termination effective date is required.");
  const conn = await mysql.createConnection(databaseUrl());
  try {
    await conn.beginTransaction();
    const [policies] = await conn.execute<DbPolicy[]>("SELECT * FROM klutch_policies WHERE id = ? FOR UPDATE", [input.policyId]);
    const policy = policies[0];
    if (!policy || policy.status !== "active") throw new Error("Only an active Klutch policy can be cancelled.");
    let claim: DbClaim | null = null;
    if (input.claimNumber?.trim()) claim = await getClaimForPolicy(conn, input.policyId, input.claimNumber, actor);
    await conn.execute(
      `UPDATE klutch_policies SET status = 'cancelled', cancelled_on = ?, cancellation_reason = 'Lease terminated', updated_by_user_id = ?, updated_by_name = ? WHERE id = ?`,
      [input.cancelledOn, actor.userId, actor.name, input.policyId]
    );
    await conn.execute(
      `INSERT INTO klutch_policy_events (policy_id, event_type, actor_user_id, actor_name, metadata)
       VALUES (?, 'cancelled', ?, ?, ?)`,
      [input.policyId, actor.userId, actor.name, JSON.stringify({ cancelledOn: input.cancelledOn, reason: "Lease terminated" })]
    );
    const [doc] = await conn.execute<mysql.ResultSetHeader>(
      `INSERT INTO klutch_policy_documents (policy_id, claim_id, document_type, document_version, delivery_status, input_snapshot, created_by_user_id, created_by_name)
       VALUES (?, ?, 'cancellation_notice', ?, ?, ?, ?, ?)`,
      [input.policyId, claim?.id ?? null, POLICY_DOCUMENT_VERSION, KLUTCH_CREATED_NOT_SENT, JSON.stringify(input.documentSnapshot), actor.userId, actor.name]
    );
    await conn.execute(
      `INSERT INTO klutch_policy_events (policy_id, event_type, actor_user_id, actor_name, metadata)
       VALUES (?, 'document_created', ?, ?, ?)`,
      [input.policyId, actor.userId, actor.name, JSON.stringify({ documentType: "cancellation_notice", documentId: Number(doc.insertId), deliveryStatus: KLUTCH_CREATED_NOT_SENT })]
    );
    await conn.commit();
    return { documentId: Number(doc.insertId), claimNumber: claim?.klutch_claim_number ?? null, deliveryStatus: KLUTCH_CREATED_NOT_SENT };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    await conn.end();
  }
}

export async function approveKlutchEndorsement(policyId: number, claimNumber: string | undefined, carrierRequestEvidence: string, actor: KlutchActor) {
  if (!carrierRequestEvidence.trim()) throw new Error("Carrier-request evidence is required before approving an endorsement.");
  const conn = await mysql.createConnection(databaseUrl());
  try {
    await conn.beginTransaction();
    const [policies] = await conn.execute<DbPolicy[]>("SELECT * FROM klutch_policies WHERE id = ? FOR UPDATE", [policyId]);
    if (!policies[0]) throw new Error("Klutch policy not found.");
    const claim = claimNumber?.trim() ? await getClaimForPolicy(conn, policyId, claimNumber, actor) : null;
    const [result] = await conn.execute<mysql.ResultSetHeader>(
      `INSERT INTO klutch_endorsement_approvals (policy_id, claim_id, carrier_request_evidence, approved_by_user_id, approved_by_name)
       VALUES (?, ?, ?, ?, ?)`,
      [policyId, claim?.id ?? null, carrierRequestEvidence.trim(), actor.userId, actor.name]
    );
    await conn.commit();
    return { approvalId: Number(result.insertId), claimNumber: claim?.klutch_claim_number ?? null };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    await conn.end();
  }
}

export async function recordKlutchDocument(input: {
  policyId: number;
  documentType: KlutchDocumentType;
  claimNumber?: string;
  snapshot: Record<string, unknown>;
}, actor: KlutchActor) {
  if (!(KLUTCH_DOCUMENT_TYPES as readonly string[]).includes(input.documentType)) throw new Error("Unsupported Klutch document type.");
  const conn = await mysql.createConnection(databaseUrl());
  try {
    await conn.beginTransaction();
    const [policies] = await conn.execute<DbPolicy[]>("SELECT * FROM klutch_policies WHERE id = ? FOR UPDATE", [input.policyId]);
    const policy = policies[0];
    if (!policy) throw new Error("Klutch policy not found.");
    if (input.documentType === "tnc_denial" && String(input.snapshot.tncPeriod ?? "") === "0") {
      throw new Error("A TNC denial cannot be created for Period 0 personal use.");
    }
    const claimRequired = ["tnc_denial", "carrier_position", "endorsement"].includes(input.documentType);
    if (claimRequired && !input.claimNumber?.trim()) throw new Error("A SnapSheet claim number is required for this claim document.");
    const claim = input.claimNumber?.trim() ? await getClaimForPolicy(conn, input.policyId, input.claimNumber, actor) : null;
    if (input.documentType === "carrier_position") {
      const [enclosures] = await conn.execute<RowDataPacket[]>(
        `SELECT document_type FROM klutch_policy_documents
         WHERE policy_id = ? AND claim_id = ? AND document_type IN ('declarations', 'tnc_denial')`,
        [input.policyId, claim?.id ?? 0]
      );
      const types = new Set(enclosures.map((entry) => String(entry.document_type)));
      if (!types.has("declarations") || !types.has("tnc_denial")) {
        throw new Error("Create the current declarations page and TNC coverage denial for this claim before preparing the carrier position letter.");
      }
    }
    if (input.documentType === "endorsement") {
      const [approvals] = await conn.execute<RowDataPacket[]>(
        `SELECT id FROM klutch_endorsement_approvals WHERE policy_id = ? AND (claim_id = ? OR claim_id IS NULL) ORDER BY approved_at DESC LIMIT 1 FOR UPDATE`,
        [input.policyId, claim?.id ?? null]
      );
      if (!approvals[0]) throw new Error("A carrier request and verified manager approval are required before creating KIC-END-002.");
    }
    const [result] = await conn.execute<mysql.ResultSetHeader>(
      `INSERT INTO klutch_policy_documents (policy_id, claim_id, document_type, document_version, delivery_status, input_snapshot, created_by_user_id, created_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [input.policyId, claim?.id ?? null, input.documentType, POLICY_DOCUMENT_VERSION, KLUTCH_CREATED_NOT_SENT, JSON.stringify(input.snapshot), actor.userId, actor.name]
    );
    await conn.execute(
      `INSERT INTO klutch_policy_events (policy_id, event_type, actor_user_id, actor_name, metadata)
       VALUES (?, 'document_created', ?, ?, ?)`,
      [input.policyId, actor.userId, actor.name, JSON.stringify({ documentType: input.documentType, documentId: Number(result.insertId), klutchClaimNumber: claim?.klutch_claim_number ?? null, deliveryStatus: KLUTCH_CREATED_NOT_SENT })]
    );
    await conn.commit();
    return { documentId: Number(result.insertId), klutchClaimNumber: claim?.klutch_claim_number ?? null, deliveryStatus: KLUTCH_CREATED_NOT_SENT };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    await conn.end();
  }
}

export async function getKlutchPolicy(policyId: number) {
  const conn = await mysql.createConnection(databaseUrl());
  try {
    const [policies] = await conn.execute<DbPolicy[]>("SELECT * FROM klutch_policies WHERE id = ?", [policyId]);
    if (!policies[0]) return null;
    const [terms] = await conn.execute<RowDataPacket[]>("SELECT * FROM klutch_policy_terms WHERE policy_id = ? ORDER BY term_number DESC", [policyId]);
    const [claims] = await conn.execute<DbClaim[]>("SELECT * FROM klutch_claims WHERE policy_id = ? ORDER BY created_at DESC", [policyId]);
    const [documents] = await conn.execute<RowDataPacket[]>("SELECT * FROM klutch_policy_documents WHERE policy_id = ? ORDER BY created_at DESC", [policyId]);
    const [events] = await conn.execute<RowDataPacket[]>("SELECT * FROM klutch_policy_events WHERE policy_id = ? ORDER BY occurred_at DESC", [policyId]);
    return {
      ...publicPolicy(policies[0]),
      termsHistory: terms.map((term) => ({ termNumber: Number(term.term_number), effectiveOn: toDateOnly(term.effective_on), expiresOn: toDateOnly(term.expires_on), terms: typeof term.terms === "string" ? JSON.parse(term.terms) : term.terms, createdAt: term.created_at })),
      claims: claims.map((claim) => ({ id: Number(claim.id), klutchClaimNumber: claim.klutch_claim_number, snapsheetClaimNumber: claim.snapsheet_claim_number, createdAt: claim.created_at })),
      documents: documents.map((document) => ({ id: Number(document.id), documentType: document.document_type, documentVersion: document.document_version, deliveryStatus: document.delivery_status, claimId: document.claim_id ? Number(document.claim_id) : null, createdAt: document.created_at })),
      events: events.map((event) => ({ id: Number(event.id), eventType: event.event_type, actorName: event.actor_name, metadata: typeof event.metadata === "string" ? JSON.parse(event.metadata) : event.metadata, occurredAt: event.occurred_at })),
    };
  } finally {
    await conn.end();
  }
}

export async function listKlutchPolicies(limit = 50) {
  const conn = await mysql.createConnection(databaseUrl());
  try {
    // TiDB rejects a bind parameter in LIMIT. Clamp before interpolating so this
    // stays numeric and cannot change the surrounding SQL expression.
    const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
    const [rows] = await conn.query<DbPolicy[]>(`SELECT * FROM klutch_policies ORDER BY updated_at DESC LIMIT ${boundedLimit}`);
    return rows.map(publicPolicy);
  } finally {
    await conn.end();
  }
}
