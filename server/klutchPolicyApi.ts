import type { Express, Request, Response } from "express";
import { sdk } from "./_core/sdk";
import {
  approveKlutchEndorsement,
  cancelKlutchPolicy,
  correctKlutchPolicy,
  findKlutchPoliciesByVin,
  getKlutchPolicy,
  issueKlutchPolicy,
  listKlutchPolicies,
  recordKlutchDocument,
  renewKlutchPolicy,
  saveKlutchDraft,
} from "./klutchPolicies";
import {
  KLUTCH_DOCUMENT_TYPES,
  KLUTCH_STATES,
  type KlutchDocumentType,
  type KlutchPolicyTerms,
  type KlutchState,
} from "@shared/klutchPolicy";

const DOCUMENT_TYPE_BY_SOURCE_ID: Record<string, KlutchDocumentType> = {
  dec: "declarations",
  den: "tnc_denial",
  car: "carrier_position",
  can: "cancellation_notice",
  end: "endorsement",
};

function isState(value: unknown): value is KlutchState {
  return typeof value === "string" && (KLUTCH_STATES as readonly string[]).includes(value);
}

function actorFor(user: { id: number; name?: string | null; email?: string | null }) {
  return {
    userId: user.id,
    name: user.name?.trim() || user.email?.trim() || "Whip Claims Handler",
  };
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Unable to complete the Klutch policy action.";
}

async function authenticatedUser(req: Request, res: Response) {
  const user = await sdk.authenticateRequest(req).catch(() => null);
  if (!user) {
    res.status(401).json({ error: "Sign in to use Klutch Policy Documents." });
    return null;
  }
  return user;
}

function termsFrom(body: Record<string, unknown>): KlutchPolicyTerms {
  const terms = body.terms;
  if (!terms || typeof terms !== "object" || Array.isArray(terms)) throw new Error("Complete the policy terms before saving.");
  return terms as KlutchPolicyTerms;
}

function documentTypeFrom(value: unknown) {
  const type = DOCUMENT_TYPE_BY_SOURCE_ID[String(value)] ?? value;
  if (typeof type !== "string" || !(KLUTCH_DOCUMENT_TYPES as readonly string[]).includes(type)) {
    throw new Error("Choose a supported Klutch document.");
  }
  return type as KlutchDocumentType;
}

function requiredNumber(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${label} is required.`);
  return number;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The supplied Klutch source page is a static UI, but every persistent policy,
 * number, term, claim, and document audit is owned by these authenticated APIs.
 * Browser localStorage is deliberately limited to unsaved form convenience.
 */
export function registerKlutchPolicyApi(app: Express) {
  const base = "/api/klutch-policy-documents";

  app.get(`${base}/register`, async (req, res) => {
    const user = await authenticatedUser(req, res);
    if (!user) return;
    try {
      const search = stringValue(req.query.search);
      res.json({ policies: await listKlutchPolicies(100, search), currentUser: { name: user.name ?? user.email ?? "" } });
    } catch (error) {
      res.status(400).json({ error: messageOf(error) });
    }
  });

  app.get(`${base}/vin/:vin`, async (req, res) => {
    const user = await authenticatedUser(req, res);
    if (!user) return;
    try {
      res.json({ policies: await findKlutchPoliciesByVin(req.params.vin) });
    } catch (error) {
      res.status(400).json({ error: messageOf(error) });
    }
  });

  app.get(`${base}/policy/:id`, async (req, res) => {
    const user = await authenticatedUser(req, res);
    if (!user) return;
    try {
      const policy = await getKlutchPolicy(requiredNumber(req.params.id, "Policy"));
      if (!policy) {
        res.status(404).json({ error: "Klutch policy not found." });
        return;
      }
      res.json({ policy });
    } catch (error) {
      res.status(400).json({ error: messageOf(error) });
    }
  });

  app.post(`${base}/draft`, async (req, res) => {
    const user = await authenticatedUser(req, res);
    if (!user) return;
    try {
      const draft = req.body?.draft;
      if (!draft || typeof draft !== "object" || Array.isArray(draft)) throw new Error("Draft data is required.");
      await saveKlutchDraft(user.id, "", "", draft as Record<string, unknown>);
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ error: messageOf(error) });
    }
  });

  app.post(`${base}/issue`, async (req, res) => {
    const user = await authenticatedUser(req, res);
    if (!user) return;
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const state = body.state;
      if (!isState(state)) throw new Error("Choose a supported Klutch policy state.");
      const terms = termsFrom(body);
      const policy = await issueKlutchPolicy({
        issueRequestKey: stringValue(body.issueRequestKey),
        leaseId: stringValue(body.leaseId),
        state,
        effectiveOn: stringValue(body.effectiveOn),
        expiresOn: stringValue(body.expiresOn),
        terms,
        newLeaseConfirmed: body.newLeaseConfirmed === true,
      }, actorFor(user));
      res.json({ policy });
    } catch (error) {
      res.status(400).json({ error: messageOf(error) });
    }
  });

  app.post(`${base}/renew`, async (req, res) => {
    const user = await authenticatedUser(req, res);
    if (!user) return;
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const policy = await renewKlutchPolicy(
        requiredNumber(body.policyId, "Policy"),
        stringValue(body.effectiveOn),
        stringValue(body.expiresOn),
        termsFrom(body),
        actorFor(user),
      );
      res.json({ policy });
    } catch (error) {
      res.status(400).json({ error: messageOf(error) });
    }
  });

  app.post(`${base}/correct`, async (req, res) => {
    const user = await authenticatedUser(req, res);
    if (!user) return;
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const policy = await correctKlutchPolicy(requiredNumber(body.policyId, "Policy"), termsFrom(body), actorFor(user));
      res.json({ policy });
    } catch (error) {
      res.status(400).json({ error: messageOf(error) });
    }
  });

  app.post(`${base}/document`, async (req, res) => {
    const user = await authenticatedUser(req, res);
    if (!user) return;
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const type = documentTypeFrom(body.documentType);
      if (type === "endorsement" && user.role !== "admin") {
        res.status(403).json({ error: "A Klutch endorsement requires administrator approval." });
        return;
      }
      const snapshot = body.snapshot;
      if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) throw new Error("Document facts are required.");
      const result = await recordKlutchDocument({
        policyId: requiredNumber(body.policyId, "Policy"),
        documentType: type,
        claimNumber: stringValue(body.claimNumber) || undefined,
        snapshot: snapshot as Record<string, unknown>,
      }, actorFor(user));
      res.json({ result });
    } catch (error) {
      res.status(400).json({ error: messageOf(error) });
    }
  });

  app.post(`${base}/cancel`, async (req, res) => {
    const user = await authenticatedUser(req, res);
    if (!user) return;
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const snapshot = body.snapshot;
      if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) throw new Error("Cancellation notice facts are required.");
      const result = await cancelKlutchPolicy({
        policyId: requiredNumber(body.policyId, "Policy"),
        cancelledOn: stringValue(body.cancelledOn),
        claimNumber: stringValue(body.claimNumber) || undefined,
        documentSnapshot: snapshot as Record<string, unknown>,
      }, actorFor(user));
      res.json({ result });
    } catch (error) {
      res.status(400).json({ error: messageOf(error) });
    }
  });

  app.post(`${base}/endorsement-approval`, async (req, res) => {
    const user = await authenticatedUser(req, res);
    if (!user) return;
    if (user.role !== "admin") {
      res.status(403).json({ error: "Only an administrator can approve a Klutch endorsement." });
      return;
    }
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const result = await approveKlutchEndorsement(
        requiredNumber(body.policyId, "Policy"),
        stringValue(body.claimNumber) || undefined,
        stringValue(body.carrierRequestEvidence),
        actorFor(user),
      );
      res.json({ result });
    } catch (error) {
      res.status(400).json({ error: messageOf(error) });
    }
  });
}
