import type { Request } from "express";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { ENV } from "./_core/env";
import { KLUTCH_DEFAULT_HANDLER_NAME, KLUTCH_DEFAULT_HANDLER_TITLE } from "@shared/klutchSignoff";

export type KlutchSignoff = { name: string; title: string; revision: number };
type SignoffUser = { id: number; openId: string; role: string; name?: string | null; email?: string | null; impersonating?: boolean; isImpersonating?: boolean };
export class KlutchSignoffError extends Error {
  constructor(message: string, public readonly status: 400 | 403 | 409) { super(message); }
}
export const klutchSignoffInputSchema = z.object({
  name: z.string().trim().min(1).max(255).refine(value => !/[\u0000-\u001f\u007f]/.test(value), "Use a single-line name."),
  title: z.string().trim().min(1).max(255).refine(value => !/[\u0000-\u001f\u007f]/.test(value), "Use a single-line title."),
  revision: z.number().int().nonnegative().max(2147483646),
}).strict();
export function canEditKlutchSignoff(user: SignoffUser | null | undefined, req: Pick<Request, "headers">): boolean {
  // Identity is the SDK-authenticated openId, never a submitted ID, name, email,
  // handler profile, or the admin role alone. Header presence (even empty) denies.
  return Boolean(ENV.ownerOpenId.trim() && user?.openId?.trim() && user.openId === ENV.ownerOpenId && user.role === "admin"
    && !Object.prototype.hasOwnProperty.call(req.headers, "x-impersonate-handler-id")
    && !user.impersonating && !user.isImpersonating);
}
export function requireKlutchSignoffOwner(user: SignoffUser, req: Pick<Request, "headers">) {
  if (!canEditKlutchSignoff(user, req)) throw new KlutchSignoffError("Only the project owner can change the designated Klutch sign-off.", 403);
}
export function requireKlutchSignoffSameOrigin(req: Pick<Request, "headers" | "get">) {
  try {
    const origin = req.headers.origin;
    if (typeof origin !== "string" || req.headers["sec-fetch-site"] === "cross-site" || req.headers["sec-fetch-site"] === "same-site") throw new Error();
    const parsed = new URL(origin);
    if (parsed.origin !== origin || parsed.username || parsed.password) throw new Error();
    const configured = process.env.KLUTCH_APP_ORIGIN;
    if (configured) {
      const approved = new URL(configured);
      if (approved.origin !== configured || parsed.origin !== approved.origin || parsed.protocol !== "https:") throw new Error();
    } else if (process.env.NODE_ENV === "production") {
      // The gateway may rewrite Host. These are registered application origins;
      // forwarded headers and user-provided Host never expand the allowlist.
      if (!["https://whipclaimsivr.com", "https://www.whipclaimsivr.com", "https://whipivr-tyswfku7.manus.space"].includes(origin)) throw new Error();
    } else {
      const host = req.get("host");
      if (!host || parsed.host.toLowerCase() !== host.toLowerCase()) throw new Error();
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
      if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) throw new Error();
    }
  } catch { throw new KlutchSignoffError("A same-origin request is required to change Klutch sign-off.", 403); }
}
function databaseUrl() {
  if (!process.env.DATABASE_URL) throw new Error("Database is not available");
  return process.env.DATABASE_URL;
}
function defaults(): KlutchSignoff { return { name: KLUTCH_DEFAULT_HANDLER_NAME, title: KLUTCH_DEFAULT_HANDLER_TITLE, revision: 0 }; }
export async function getKlutchSignoff(conn?: mysql.Connection, lock = false): Promise<KlutchSignoff> {
  const connection = conn ?? await mysql.createConnection(databaseUrl());
  try {
    const [rows] = await connection.execute<RowDataPacket[]>(`SELECT name, title, revision FROM klutch_signoff_settings WHERE id = 1${lock ? " FOR UPDATE" : ""}`);
    if (!rows[0]) return defaults();
    const result = { name: rows[0].name, title: rows[0].title, revision: Number(rows[0].revision) };
    // A malformed row or absent table is an operational error, not permission to
    // silently replace an approved identity with defaults.
    if (typeof result.name !== "string" || !result.name.trim() || typeof result.title !== "string" || !result.title.trim() || !Number.isSafeInteger(result.revision) || result.revision < 1) throw new Error("Klutch sign-off settings are invalid.");
    return result;
  } finally { if (!conn) await connection.end(); }
}
export async function klutchSignoffInfo(user: SignoffUser, req: Pick<Request, "headers">) {
  return { signoff: await getKlutchSignoff(), canEdit: canEditKlutchSignoff(user, req) };
}
export async function updateKlutchSignoff(user: SignoffUser, req: Pick<Request, "headers" | "get">, rawInput: unknown) {
  requireKlutchSignoffOwner(user, req);
  requireKlutchSignoffSameOrigin(req);
  const parsed = klutchSignoffInputSchema.safeParse(rawInput);
  if (!parsed.success) throw new KlutchSignoffError("Provide a nonempty name, title, and current sign-off revision.", 400);
  const input = parsed.data;
  const conn = await mysql.createConnection(databaseUrl());
  try {
    await conn.beginTransaction();
    const before = await getKlutchSignoff(conn, true);
    if (input.revision !== before.revision) throw new KlutchSignoffError("Klutch sign-off changed. Reload the current settings and try again.", 409);
    if (input.name === before.name && input.title === before.title) {
      await conn.commit();
      return { signoff: before, canEdit: true };
    }
    const signoff = { name: input.name, title: input.title, revision: before.revision + 1 };
    if (before.revision === 0) {
      await conn.execute("INSERT INTO klutch_signoff_settings (id, name, title, revision, updated_by_user_id, updated_by_open_id) VALUES (1, ?, ?, ?, ?, ?)", [signoff.name, signoff.title, signoff.revision, user.id, user.openId]);
    } else {
      const [result] = await conn.execute<mysql.ResultSetHeader>("UPDATE klutch_signoff_settings SET name = ?, title = ?, revision = ?, updated_by_user_id = ?, updated_by_open_id = ? WHERE id = 1 AND revision = ?", [signoff.name, signoff.title, signoff.revision, user.id, user.openId, before.revision]);
      if (result.affectedRows !== 1) throw new KlutchSignoffError("Klutch sign-off changed. Reload the current settings and try again.", 409);
    }
    // Audit is INSERT-only. No public API permits audit update/delete.
    await conn.execute("INSERT INTO klutch_signoff_events (from_revision, to_revision, previous_name, previous_title, name, title, actor_user_id, actor_open_id, actor_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [before.revision, signoff.revision, before.name, before.title, signoff.name, signoff.title, user.id, user.openId, user.name?.trim() || user.email?.trim() || "Project owner"]);
    await conn.commit();
    return { signoff, canEdit: true };
  } catch (error) {
    await conn.rollback();
    if ((error as { code?: string }).code === "ER_DUP_ENTRY") throw new KlutchSignoffError("Klutch sign-off changed. Reload the current settings and try again.", 409);
    throw error;
  } finally { await conn.end(); }
}
const aliases: Record<string, "name" | "title"> = { hn: "name", ht: "title", handlerName: "name", handlerTitle: "title" };
/** Reject every supplied printed-attribution alias before any policy side effect.
 * Metrocars dopSigner* and signature/certification fields are NOT aliases. */
export function assertCanonicalKlutchSignoff(value: unknown, signoff: KlutchSignoff, handlerBlock = false): void {
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    const field = aliases[key] ?? (handlerBlock && (key === "name" || key === "title") ? key : undefined);
    if (field && (typeof item !== "string" || item.trim() !== signoff[field])) throw new KlutchSignoffError("Document sign-off must match the approved shared Klutch name and title. Only the project owner can change it in sign-off settings.", 403);
    assertCanonicalKlutchSignoff(item, signoff, key === "handler");
  }
}
/** Return a clone; never mutate an earlier issued snapshot or signer evidence. */
export function normalizeKlutchSignoffAliases<T extends Record<string, unknown>>(value: T, signoff: KlutchSignoff, includeAliases = true): T {
  const copy = structuredClone(value);
  const walk = (object: unknown, handlerBlock = false) => {
    if (!object || typeof object !== "object") return;
    for (const [key, item] of Object.entries(object)) {
      const field = aliases[key] ?? (handlerBlock && (key === "name" || key === "title") ? key : undefined);
      if (field) (object as Record<string, unknown>)[key] = signoff[field];
      else walk(item, key === "handler");
    }
  };
  walk(copy);
  if (includeAliases) Object.assign(copy, { hn: signoff.name, ht: signoff.title, handlerName: signoff.name, handlerTitle: signoff.title, signoffRevision: signoff.revision });
  return copy;
}
