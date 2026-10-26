import crypto from "node:crypto";
import mysql, { type RowDataPacket } from "mysql2/promise";
import {
  addKlutchTermMonths,
  calculateKlutchPremium,
  KLUTCH_CLAIM_ALPHABET,
  KLUTCH_COVERAGE_RULES,
  KLUTCH_CREATED_NOT_SENT,
  KLUTCH_DOCUMENT_TYPES,
  KLUTCH_FIRST_POLICY_SEQUENCE,
  KLUTCH_STATES,
  canonicalizeSnapSheetClaim,
  formatKlutchClaimNumber,
  formatKlutchPolicyNumber,
  normalizeKlutchVin,
  type KlutchDocumentType,
  type KlutchPolicyTerms,
  type KlutchPolicyTransactionType,
  type KlutchState,
} from "@shared/klutchPolicy";

export type KlutchActor = {
  userId: number;
  name: string;
  handlerName?: string;
  handlerTitle?: string;
};

type DbPolicy = RowDataPacket & {
  id: number;
  policy_number: string;
  policy_sequence: number;
  issue_request_key: string;
  lease_id: string;
  member_name: string;
  member_number: string;
  vin_normalized: string;
  vehicle: string;
  previous_policy_id: number | null;
  new_lease_confirmed: number;
  state: KlutchState;
  effective_on: string | Date;
  expires_on: string | Date;
  status: "active" | "cancelled" | "expired";
  cancelled_on: string | Date | null;
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
  claim_sequence: number | null;
  snapsheet_claim_number: string;
  created_at: string;
};

type DbTerm = RowDataPacket & {
  id: number;
  policy_id: number;
  term_number: number;
  revision_number: number;
  term_months: number;
  transaction_type: KlutchPolicyTransactionType;
  effective_on: string | Date;
  expires_on: string | Date;
  terms: string | KlutchPolicyTerms;
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

function parseTerms(value: DbPolicy["terms"] | DbTerm["terms"]): KlutchPolicyTerms {
  if (typeof value === "string") return JSON.parse(value) as KlutchPolicyTerms;
  return value as KlutchPolicyTerms;
}

function handlerFor(actor: KlutchActor) {
  return {
    name: actor.handlerName?.trim() || actor.name,
    title: actor.handlerTitle?.trim() || "Claims Handler",
  };
}

function publicPolicy(row: DbPolicy) {
  return {
    id: Number(row.id),
    policyNumber: row.policy_number,
    policySequence: Number(row.policy_sequence),
    issueRequestKey: row.issue_request_key,
    leaseId: row.lease_id,
    memberName: row.member_name,
    memberNumber: row.member_number,
    vin: row.vin_normalized,
    vehicle: row.vehicle,
    previousPolicyId: row.previous_policy_id ? Number(row.previous_policy_id) : null,
    newLeaseConfirmed: Boolean(row.new_lease_confirmed),
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

function assertPolicyTerms(terms: KlutchPolicyTerms) {
  if (!terms.leaseId.trim() || !terms.memberName.trim() || !terms.memberNumber.trim() || !terms.vehicle.trim()) {
    throw new Error("Lease ID, member name, member number, and vehicle are required.");
  }
  if (!normalizeKlutchVin(terms.vin)) throw new Error("A vehicle VIN is required before a policy can be issued.");
  if (![6, 12].includes(Number(terms.termMonths))) throw new Error("Choose a 6- or 12-month policy term.");
  if (addKlutchTermMonths(terms.effectiveOn, terms.termMonths) !== terms.expiresOn) {
    throw new Error("The expiration date must match the selected 6- or 12-month term.");
  }
}

async function allocatePolicySequence(conn: mysql.Connection) {
  await conn.execute(
    "INSERT INTO klutch_number_sequences (sequence_key, last_issued) VALUES ('policy', ?) ON DUPLICATE KEY UPDATE last_issued = GREATEST(last_issued, VALUES(last_issued))",
    [KLUTCH_FIRST_POLICY_SEQUENCE - 1],
  );
  const [sequenceRows] = await conn.execute<RowDataPacket[]>(
    "SELECT last_issued FROM klutch_number_sequences WHERE sequence_key = 'policy' FOR UPDATE",
  );
  const next = Math.max(Number(sequenceRows[0]?.last_issued ?? KLUTCH_FIRST_POLICY_SEQUENCE - 1) + 1, KLUTCH_FIRST_POLICY_SEQUENCE);
  if (!Number.isSafeInteger(next) || next > 999999) throw new Error("Klutch policy sequence has reached its safe limit.");
  await conn.execute("UPDATE klutch_number_sequences SET last_issued = ? WHERE sequence_key = 'policy'", [next]);
  return next;
}

async function lockVinRegister(conn: mysql.Connection, vin: string) {
  await conn.execute("INSERT IGNORE INTO klutch_vin_register (vin_normalized) VALUES (?)", [vin]);
  await conn.execute<RowDataPacket[]>("SELECT vin_normalized FROM klutch_vin_register WHERE vin_normalized = ? FOR UPDATE", [vin]);
  const [policies] = await conn.execute<DbPolicy[]>(
    "SELECT * FROM klutch_policies WHERE vin_normalized = ? AND status = 'active' ORDER BY updated_at DESC FOR UPDATE",
    [vin],
  );
  return policies;
}

function randomKlutchClaimSuffix() {
  const bytes = crypto.randomBytes(6);
  return Array.from(bytes, byte => KLUTCH_CLAIM_ALPHABET[byte % KLUTCH_CLAIM_ALPHABET.length]).join("");
}

async function getClaimForPolicy(conn: mysql.Connection, policyId: number, snapsheetClaimNumber: string, actor: KlutchActor) {
  const canonical = canonicalizeSnapSheetClaim(snapsheetClaimNumber);
  if (!canonical) throw new Error("A Whip / SnapSheet claim number is required to save this claim document.");
  const [existingRows] = await conn.execute<DbClaim[]>(
    "SELECT * FROM klutch_claims WHERE snapsheet_claim_number = ? FOR UPDATE",
    [canonical],
  );
  if (existingRows[0]) {
    if (Number(existingRows[0].policy_id) !== policyId) throw new Error("This SnapSheet claim is already mapped to another Klutch policy.");
    return existingRows[0];
  }
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const klutchClaimNumber = formatKlutchClaimNumber(randomKlutchClaimSuffix());
    const [taken] = await conn.execute<RowDataPacket[]>(
      "SELECT id FROM klutch_claims WHERE klutch_claim_number = ? FOR UPDATE",
      [klutchClaimNumber],
    );
    if (taken[0]) continue;
    const [result] = await conn.execute<mysql.ResultSetHeader>(
      `INSERT INTO klutch_claims
        (policy_id, klutch_claim_number, claim_sequence, snapsheet_claim_number, created_by_user_id, created_by_name)
       VALUES (?, ?, NULL, ?, ?, ?)`,
      [policyId, klutchClaimNumber, canonical, actor.userId, actor.name],
    );
    await conn.execute(
      `INSERT INTO klutch_policy_events (policy_id, event_type, actor_user_id, actor_name, metadata)
       VALUES (?, 'claim_mapped', ?, ?, ?)`,
      [policyId, actor.userId, actor.name, JSON.stringify({ klutchClaimNumber, snapsheetClaimNumber: canonical })],
    );
    const [created] = await conn.execute<DbClaim[]>("SELECT * FROM klutch_claims WHERE id = ?", [Number(result.insertId)]);
    return created[0];
  }
  throw new Error("Unable to allocate a unique Klutch claim number. Please try again.");
}

async function latestTerm(conn: mysql.Connection, policyId: number) {
  const [terms] = await conn.execute<DbTerm[]>(
    "SELECT * FROM klutch_policy_terms WHERE policy_id = ? ORDER BY term_number DESC, revision_number DESC LIMIT 1 FOR UPDATE",
    [policyId],
  );
  if (!terms[0]) throw new Error("Klutch policy term history is unavailable.");
  return terms[0];
}

async function latestTermsForPolicy(conn: mysql.Connection, policyId: number) {
  const [terms] = await conn.execute<DbTerm[]>(
    "SELECT * FROM klutch_policy_terms WHERE policy_id = ? ORDER BY term_number DESC, revision_number DESC",
    [policyId],
  );
  return terms;
}

function normalizedTerms(input: { terms: KlutchPolicyTerms; state: KlutchState; effectiveOn: string; expiresOn: string; leaseId: string; type: KlutchPolicyTransactionType }) {
  const premium = calculateKlutchPremium({
    state: input.state,
    effectiveOn: input.effectiveOn,
    expiresOn: input.expiresOn,
    pipWaived: input.terms.pipWaived,
    umRejected: input.terms.umRejected,
    comprehensiveDeductible: input.terms.comprehensiveDeductible,
    collisionDeductible: input.terms.collisionDeductible,
  });
  return {
    ...input.terms,
    leaseId: input.leaseId.trim(),
    state: input.state,
    effectiveOn: input.effectiveOn,
    expiresOn: input.expiresOn,
    transactionType: input.type,
    coverages: premium.coverages,
    totalPremium: premium.totalPremium,
    weeklyMembershipFee: premium.weeklyMembershipFee,
    coverageWeeks: premium.coverageWeeks,
    pipWaived: Boolean(KLUTCH_COVERAGE_RULES[input.state].pip?.waivable && input.terms.pipWaived),
  } satisfies KlutchPolicyTerms;
}

export async function issueKlutchPolicy(input: {
  issueRequestKey: string;
  leaseId: string;
  state: string;
  effectiveOn: string;
  expiresOn: string;
  terms: KlutchPolicyTerms;
  newLeaseConfirmed?: boolean;
}, actor: KlutchActor) {
  assertState(input.state);
  assertTerm(input.effectiveOn, input.expiresOn);
  assertPolicyTerms(input.terms);
  if (!input.issueRequestKey.trim()) throw new Error("An idempotency key is required to issue a policy.");
  const conn = await mysql.createConnection(databaseUrl());
  try {
    await conn.beginTransaction();
    const [replayed] = await conn.execute<DbPolicy[]>("SELECT * FROM klutch_policies WHERE issue_request_key = ? FOR UPDATE", [input.issueRequestKey]);
    if (replayed[0]) {
      await conn.commit();
      return publicPolicy(replayed[0]);
    }
    const vin = normalizeKlutchVin(input.terms.vin);
    const activeForVin = await lockVinRegister(conn, vin);
    if (activeForVin[0] && !input.newLeaseConfirmed) {
      throw new Error(`VIN ${vin} already has active policy ${activeForVin[0].policy_number}. Use Renewal or Correction, or confirm a new lease.`);
    }
    const sequence = await allocatePolicySequence(conn);
    const policyNumber = formatKlutchPolicyNumber(input.state, sequence);
    const terms = normalizedTerms({ terms: input.terms, state: input.state, effectiveOn: input.effectiveOn, expiresOn: input.expiresOn, leaseId: input.leaseId, type: "new" });
    const [result] = await conn.execute<mysql.ResultSetHeader>(
      `INSERT INTO klutch_policies
        (policy_number, policy_sequence, issue_request_key, lease_id, member_name, member_number, vin_normalized, vehicle, previous_policy_id, new_lease_confirmed,
         state, effective_on, expires_on, terms, created_by_user_id, created_by_name, updated_by_user_id, updated_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [policyNumber, sequence, input.issueRequestKey.trim(), input.leaseId.trim(), terms.memberName.trim(), terms.memberNumber.trim(), vin, terms.vehicle.trim(),
       activeForVin[0]?.id ?? null, input.newLeaseConfirmed ? 1 : 0, input.state, input.effectiveOn, input.expiresOn, JSON.stringify(terms),
       actor.userId, actor.name, actor.userId, actor.name],
    );
    const policyId = Number(result.insertId);
    const [termResult] = await conn.execute<mysql.ResultSetHeader>(
      `INSERT INTO klutch_policy_terms (policy_id, term_number, revision_number, term_months, transaction_type, effective_on, expires_on, terms, created_by_user_id, created_by_name)
       VALUES (?, 1, 1, ?, 'new', ?, ?, ?, ?, ?)`,
      [policyId, terms.termMonths, input.effectiveOn, input.expiresOn, JSON.stringify(terms), actor.userId, actor.name],
    );
    await conn.execute("UPDATE klutch_vin_register SET latest_policy_id = ? WHERE vin_normalized = ?", [policyId, vin]);
    await conn.execute(
      `INSERT INTO klutch_policy_events (policy_id, event_type, actor_user_id, actor_name, metadata)
       VALUES (?, 'issued', ?, ?, ?)`,
      [policyId, actor.userId, actor.name, JSON.stringify({ policyNumber, policySequence: sequence, termId: Number(termResult.insertId), transactionType: "new", handler: handlerFor(actor) })],
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

export async function renewKlutchPolicy(policyId: number, effectiveOn: string, expiresOn: string, termsInput: KlutchPolicyTerms, actor: KlutchActor) {
  assertTerm(effectiveOn, expiresOn);
  assertPolicyTerms(termsInput);
  const conn = await mysql.createConnection(databaseUrl());
  try {
    await conn.beginTransaction();
    const [policies] = await conn.execute<DbPolicy[]>("SELECT * FROM klutch_policies WHERE id = ? FOR UPDATE", [policyId]);
    const policy = policies[0];
    if (!policy || policy.status !== "active") throw new Error("Only an active Klutch policy can be renewed.");
    if (normalizeKlutchVin(termsInput.vin) !== policy.vin_normalized) throw new Error("A renewal must keep the same VIN. Use New for a new lease.");
    const prior = await latestTerm(conn, policyId);
    const terms = normalizedTerms({ terms: termsInput, state: policy.state, effectiveOn, expiresOn, leaseId: policy.lease_id, type: "renewal" });
    const [term] = await conn.execute<mysql.ResultSetHeader>(
      `INSERT INTO klutch_policy_terms (policy_id, term_number, revision_number, term_months, transaction_type, effective_on, expires_on, terms, created_by_user_id, created_by_name)
       VALUES (?, ?, 1, ?, 'renewal', ?, ?, ?, ?, ?)`,
      [policyId, Number(prior.term_number) + 1, terms.termMonths, effectiveOn, expiresOn, JSON.stringify(terms), actor.userId, actor.name],
    );
    await conn.execute(
      `UPDATE klutch_policies SET effective_on = ?, expires_on = ?, terms = ?, member_name = ?, member_number = ?, vehicle = ?, updated_by_user_id = ?, updated_by_name = ? WHERE id = ?`,
      [effectiveOn, expiresOn, JSON.stringify(terms), terms.memberName, terms.memberNumber, terms.vehicle, actor.userId, actor.name, policyId],
    );
    await conn.execute(
      `INSERT INTO klutch_policy_events (policy_id, event_type, actor_user_id, actor_name, metadata)
       VALUES (?, 'renewed', ?, ?, ?)`,
      [policyId, actor.userId, actor.name, JSON.stringify({ termId: Number(term.insertId), effectiveOn, expiresOn, handler: handlerFor(actor) })],
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

export async function correctKlutchPolicy(policyId: number, termsInput: KlutchPolicyTerms, actor: KlutchActor) {
  assertTerm(termsInput.effectiveOn, termsInput.expiresOn);
  assertPolicyTerms(termsInput);
  const conn = await mysql.createConnection(databaseUrl());
  try {
    await conn.beginTransaction();
    const [policies] = await conn.execute<DbPolicy[]>("SELECT * FROM klutch_policies WHERE id = ? FOR UPDATE", [policyId]);
    const policy = policies[0];
    if (!policy || policy.status !== "active") throw new Error("Only an active Klutch policy can be corrected.");
    if (normalizeKlutchVin(termsInput.vin) !== policy.vin_normalized) throw new Error("A correction must keep the same VIN. Use New for a new lease.");
    const prior = await latestTerm(conn, policyId);
    const terms = normalizedTerms({ terms: termsInput, state: policy.state, effectiveOn: termsInput.effectiveOn, expiresOn: termsInput.expiresOn, leaseId: policy.lease_id, type: "correction" });
    const [term] = await conn.execute<mysql.ResultSetHeader>(
      `INSERT INTO klutch_policy_terms (policy_id, term_number, revision_number, term_months, transaction_type, effective_on, expires_on, terms, created_by_user_id, created_by_name)
       VALUES (?, ?, ?, ?, 'correction', ?, ?, ?, ?, ?)`,
      [policyId, prior.term_number, Number(prior.revision_number) + 1, terms.termMonths, terms.effectiveOn, terms.expiresOn, JSON.stringify(terms), actor.userId, actor.name],
    );
    await conn.execute(
      `UPDATE klutch_policies SET effective_on = ?, expires_on = ?, terms = ?, member_name = ?, member_number = ?, vehicle = ?, updated_by_user_id = ?, updated_by_name = ? WHERE id = ?`,
      [terms.effectiveOn, terms.expiresOn, JSON.stringify(terms), terms.memberName, terms.memberNumber, terms.vehicle, actor.userId, actor.name, policyId],
    );
    await conn.execute(
      `INSERT INTO klutch_policy_events (policy_id, event_type, actor_user_id, actor_name, metadata)
       VALUES (?, 'corrected', ?, ?, ?)`,
      [policyId, actor.userId, actor.name, JSON.stringify({ termId: Number(term.insertId), handler: handlerFor(actor) })],
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
    const claim = input.claimNumber?.trim() ? await getClaimForPolicy(conn, input.policyId, input.claimNumber, actor) : null;
    const term = await latestTerm(conn, input.policyId);
    await conn.execute(
      `UPDATE klutch_policies SET status = 'cancelled', cancelled_on = ?, cancellation_reason = 'Lease terminated', updated_by_user_id = ?, updated_by_name = ? WHERE id = ?`,
      [input.cancelledOn, actor.userId, actor.name, input.policyId],
    );
    await conn.execute(
      `INSERT INTO klutch_policy_events (policy_id, event_type, actor_user_id, actor_name, metadata)
       VALUES (?, 'cancelled', ?, ?, ?)`,
      [input.policyId, actor.userId, actor.name, JSON.stringify({ cancelledOn: input.cancelledOn, reason: "Lease terminated", handler: handlerFor(actor) })],
    );
    const handler = handlerFor(actor);
    const [doc] = await conn.execute<mysql.ResultSetHeader>(
      `INSERT INTO klutch_policy_documents
       (policy_id, claim_id, term_id, document_type, document_version, delivery_status, policy_transaction_type, policy_number, klutch_claim_number, member_name, handler_title, input_snapshot, created_by_user_id, created_by_name)
       VALUES (?, ?, ?, 'cancellation_notice', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [input.policyId, claim?.id ?? null, term.id, POLICY_DOCUMENT_VERSION, KLUTCH_CREATED_NOT_SENT, "correction", policy.policy_number, claim?.klutch_claim_number ?? null,
       policy.member_name, handler.title, JSON.stringify(input.documentSnapshot), actor.userId, actor.name],
    );
    await conn.execute(
      `INSERT INTO klutch_policy_events (policy_id, event_type, actor_user_id, actor_name, metadata)
       VALUES (?, 'document_created', ?, ?, ?)`,
      [input.policyId, actor.userId, actor.name, JSON.stringify({ documentType: "cancellation_notice", documentId: Number(doc.insertId), deliveryStatus: KLUTCH_CREATED_NOT_SENT })],
    );
    await conn.commit();
    return { documentId: Number(doc.insertId), klutchClaimNumber: claim?.klutch_claim_number ?? null, deliveryStatus: KLUTCH_CREATED_NOT_SENT };
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
    const claim = input.claimNumber?.trim() ? await getClaimForPolicy(conn, input.policyId, input.claimNumber, actor) : null;
    const term = await latestTerm(conn, input.policyId);
    const handler = handlerFor(actor);
    const transactionType = String(parseTerms(term.terms).transactionType ?? "new");
    const [result] = await conn.execute<mysql.ResultSetHeader>(
      `INSERT INTO klutch_policy_documents
       (policy_id, claim_id, term_id, document_type, document_version, delivery_status, policy_transaction_type, policy_number, klutch_claim_number, member_name, handler_title, input_snapshot, created_by_user_id, created_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [input.policyId, claim?.id ?? null, term.id, input.documentType, POLICY_DOCUMENT_VERSION, KLUTCH_CREATED_NOT_SENT, transactionType, policy.policy_number,
       claim?.klutch_claim_number ?? null, policy.member_name, handler.title, JSON.stringify(input.snapshot), actor.userId, actor.name],
    );
    await conn.execute(
      `INSERT INTO klutch_policy_events (policy_id, event_type, actor_user_id, actor_name, metadata)
       VALUES (?, 'document_created', ?, ?, ?)`,
      [input.policyId, actor.userId, actor.name, JSON.stringify({ documentType: input.documentType, documentId: Number(result.insertId), klutchClaimNumber: claim?.klutch_claim_number ?? null, deliveryStatus: KLUTCH_CREATED_NOT_SENT, handler })],
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
    const [terms] = await conn.execute<DbTerm[]>("SELECT * FROM klutch_policy_terms WHERE policy_id = ? ORDER BY term_number DESC, revision_number DESC", [policyId]);
    const [claims] = await conn.execute<DbClaim[]>("SELECT * FROM klutch_claims WHERE policy_id = ? ORDER BY created_at DESC", [policyId]);
    const [documents] = await conn.execute<RowDataPacket[]>("SELECT * FROM klutch_policy_documents WHERE policy_id = ? ORDER BY created_at DESC", [policyId]);
    const [events] = await conn.execute<RowDataPacket[]>("SELECT * FROM klutch_policy_events WHERE policy_id = ? ORDER BY occurred_at DESC", [policyId]);
    return {
      ...publicPolicy(policies[0]),
      termsHistory: terms.map((term) => ({ id: Number(term.id), termNumber: Number(term.term_number), revisionNumber: Number(term.revision_number), termMonths: Number(term.term_months), transactionType: term.transaction_type, effectiveOn: toDateOnly(term.effective_on), expiresOn: toDateOnly(term.expires_on), terms: parseTerms(term.terms), createdAt: term.created_at })),
      claims: claims.map((claim) => ({ id: Number(claim.id), klutchClaimNumber: claim.klutch_claim_number, snapsheetClaimNumber: claim.snapsheet_claim_number, createdAt: claim.created_at })),
      documents: documents.map((document) => ({ id: Number(document.id), documentType: document.document_type, documentVersion: document.document_version, deliveryStatus: document.delivery_status, policyNumber: document.policy_number, klutchClaimNumber: document.klutch_claim_number, transactionType: document.policy_transaction_type, handlerTitle: document.handler_title, claimId: document.claim_id ? Number(document.claim_id) : null, createdAt: document.created_at })),
      events: events.map((event) => ({ id: Number(event.id), eventType: event.event_type, actorName: event.actor_name, metadata: typeof event.metadata === "string" ? JSON.parse(event.metadata) : event.metadata, occurredAt: event.occurred_at })),
    };
  } finally {
    await conn.end();
  }
}

export async function listKlutchPolicies(limit = 100, search = "") {
  const conn = await mysql.createConnection(databaseUrl());
  try {
    const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
    const query = search.trim();
    const needle = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
    const [rows] = query
      ? await conn.execute<DbPolicy[]>(
        `SELECT * FROM klutch_policies WHERE policy_number LIKE ? ESCAPE '\\\\' OR member_name LIKE ? ESCAPE '\\\\' OR member_number LIKE ? ESCAPE '\\\\' OR vin_normalized LIKE ? ESCAPE '\\\\' OR lease_id LIKE ? ESCAPE '\\\\' ORDER BY updated_at DESC LIMIT ${boundedLimit}`,
        [needle, needle, needle, needle, needle],
      )
      : await conn.query<DbPolicy[]>(`SELECT * FROM klutch_policies ORDER BY updated_at DESC LIMIT ${boundedLimit}`);
    return rows.map(publicPolicy);
  } finally {
    await conn.end();
  }
}

export async function findKlutchPoliciesByVin(vinInput: string) {
  const vin = normalizeKlutchVin(vinInput);
  if (!vin) return [];
  const conn = await mysql.createConnection(databaseUrl());
  try {
    const [rows] = await conn.execute<DbPolicy[]>("SELECT * FROM klutch_policies WHERE vin_normalized = ? ORDER BY updated_at DESC", [vin]);
    return rows.map(publicPolicy);
  } finally {
    await conn.end();
  }
}

export async function loadKlutchDraft(userId: number) {
  const conn = await mysql.createConnection(databaseUrl());
  try {
    const [rows] = await conn.execute<RowDataPacket[]>("SELECT handler_name, handler_title, draft, updated_at FROM klutch_policy_drafts WHERE user_id = ?", [userId]);
    const row = rows[0];
    if (!row) return null;
    return { handlerName: row.handler_name, handlerTitle: row.handler_title, draft: typeof row.draft === "string" ? JSON.parse(row.draft) : row.draft, updatedAt: row.updated_at };
  } finally {
    await conn.end();
  }
}

export async function saveKlutchDraft(userId: number, handlerName: string, handlerTitle: string, draft: Record<string, unknown>) {
  const conn = await mysql.createConnection(databaseUrl());
  try {
    await conn.execute(
      `INSERT INTO klutch_policy_drafts (user_id, handler_name, handler_title, draft)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE handler_name = VALUES(handler_name), handler_title = VALUES(handler_title), draft = VALUES(draft)`,
      [userId, handlerName.trim(), handlerTitle.trim(), JSON.stringify(draft)],
    );
  } finally {
    await conn.end();
  }
}
