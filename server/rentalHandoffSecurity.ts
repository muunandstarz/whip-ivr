import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { parse as parseCookie } from "cookie";
import { TRPCError } from "@trpc/server";
import type { Request, Response } from "express";
import type { RentalActor, RentalDraft } from "../shared/rentalHandoff";
import type { RentalRepository } from "./rentalHandoffService";

const scrypt = promisify(nodeScrypt);
export const RENTAL_COOKIE = "rental_shop_session";
export const RENTAL_SESSION_MS = 8 * 60 * 60 * 1000;
export const rentalCookieOptions = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/api" };
export function secretKey(domain: string): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Rental encryption is not configured." });
  return createHmac("sha256", secret).update(`metrocars-rental-handoff:v1:${domain}`).digest();
}
export function encryptRental(value: unknown): string {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", secretKey("payload"), iv);
  cipher.setAAD(Buffer.from("metrocars-rental-handoff:v1"));
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${data.toString("base64url")}`;
}
export function decryptRental<T>(value: string): T {
  try {
    const [version, nonce, tag, payload, extra] = value.split(".");
    if (version !== "v1" || !nonce || !tag || !payload || extra) throw new Error("Malformed ciphertext");
    const decipher = createDecipheriv("aes-256-gcm", secretKey("payload"), Buffer.from(nonce, "base64url"));
    decipher.setAAD(Buffer.from("metrocars-rental-handoff:v1"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(payload, "base64url")), decipher.final()]).toString("utf8")) as T;
  } catch { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Rental encrypted data could not be read." }); }
}
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export const randomToken = () => randomBytes(32).toString("base64url");
export const privateAuditHash = (value: string, domain: string) => createHmac("sha256", secretKey(`audit:${domain}`)).update(value).digest("hex");
export function requestAudit(req: Request) {
  return { ipHash: privateAuditHash(req.ip || req.socket?.remoteAddress || "unknown", "ip"), device: privateAuditHash(String(req.headers["user-agent"] || "unknown").slice(0, 1000), "device") };
}
export function requireSameOrigin(req: Request) {
  const origin = req.headers.origin;
  // Never trust client-controlled forwarded host/protocol to weaken this check.
  const configured = process.env.RENTAL_APP_ORIGIN;
  try {
    if (typeof origin !== "string" || req.headers["sec-fetch-site"] === "cross-site") throw new Error();
    const parsed = new URL(origin);
    if (configured) {
      if (parsed.origin !== new URL(configured).origin) throw new Error();
    } else if (process.env.NODE_ENV === "production") {
      // Production's gateway may rewrite Host to an internal service name.
      // Use only this application's registered HTTPS origins, never forwarded headers.
      const approved = ["https://whipclaimsivr.com", "https://www.whipclaimsivr.com", "https://whipivr-tyswfku7.manus.space"];
      if (!approved.includes(parsed.origin) || origin !== parsed.origin || parsed.username || parsed.password) throw new Error();
    } else {
      const host = req.get("host");
      if (!host || parsed.host.toLowerCase() !== host.toLowerCase() || parsed.username || parsed.password) throw new Error();
      const localDev = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
      if (parsed.protocol !== "https:" && !(localDev && parsed.protocol === "http:")) throw new Error();
    }
  } catch { throw new TRPCError({ code: "FORBIDDEN", message: "A same-origin rental request is required." }); }
}
const buckets = new Map<string, { count: number; until: number }>();
export function rateLimitRental(req: Request, operation: string, now = Date.now()) {
  const key = privateAuditHash(`${req.ip || req.socket?.remoteAddress || "unknown"}:${operation}`, "login-limit");
  if (buckets.size > 10000) for (const [k, b] of Array.from(buckets.entries())) if (b.until <= now) buckets.delete(k);
  if (buckets.size > 10000 && !buckets.has(key)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rental authentication is temporarily busy." });
  let b = buckets.get(key);
  if (!b || b.until <= now) { b = { count: 0, until: now + 15 * 60000 }; buckets.set(key, b); }
  if (++b.count > 10) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many rental authentication attempts. Try later." });
}
export async function hashPassword(password: string) {
  if (password.length < 12 || password.length > 128) throw new TRPCError({ code: "BAD_REQUEST", message: "Use a password of 12–128 characters." });
  const salt = randomBytes(16), derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt-v1.${salt.toString("hex")}.${derived.toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string | null) {
  const [version, salt, hash] = (stored || "").split(".");
  const valid = version === "scrypt-v1" && /^[a-f0-9]{32}$/.test(salt || "") && /^[a-f0-9]{128}$/.test(hash || "");
  // Always perform the same expensive KDF, including unknown accounts.
  const calculated = await scrypt(password.slice(0, 128), valid ? Buffer.from(salt, "hex") : Buffer.alloc(16), 64) as Buffer;
  const expected = valid ? Buffer.from(hash, "hex") : Buffer.alloc(64);
  return timingSafeEqual(calculated, expected) && valid;
}
export function cookieToken(req: Request): string | null {
  try { const token = parseCookie(req.headers.cookie || "")[RENTAL_COOKIE]; return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null; } catch { return null; }
}
export function publicActor(actor: RentalActor): RentalActor {
  return { key: actor.key, name: actor.name, role: actor.role, locationIds: [...actor.locationIds] };
}
export async function resolveRentalActor(ctx: { user: { id: number; name: string | null; role: string } | null; req: Request }, repo: RentalRepository, now = Date.now()): Promise<RentalActor | null> {
  if (ctx.user) return { key: `native:${ctx.user.id}`, name: ctx.user.name || "Dashboard user", role: ctx.user.role === "admin" ? "admin" : "claims", locationIds: [] };
  const token = cookieToken(ctx.req);
  if (!token) return null;
  const session = (await repo.find("sessions", { eq: { tokenHash: tokenHash(token) } }))[0];
  if (!session || session.expiresAt <= now) return null;
  const user = (await repo.find("shopUsers", { eq: { id: session.shopUserId, active: true } }))[0];
  if (!user || !user.passwordHash) return null;
  let ids: number[];
  try { ids = JSON.parse(user.locationIds); if (!Array.isArray(ids) || !ids.every(id => Number.isInteger(id) && id > 0)) return null; } catch { return null; }
  const active = ids.length ? await repo.find("locations", { in: { id: ids }, eq: { active: true } }) : [];
  return { key: `shop:${user.id}`, name: user.name, role: "shop", locationIds: active.map(l => l.id), shopUserId: user.id };
}
export async function issueShopSession(repo: RentalRepository, shopUserId: number, res: Response, now = Date.now()) {
  const token = randomToken();
  await repo.insert("sessions", { tokenHash: tokenHash(token), shopUserId, expiresAt: now + RENTAL_SESSION_MS, createdAt: now });
  res.cookie(RENTAL_COOKIE, token, { ...rentalCookieOptions, maxAge: RENTAL_SESSION_MS });
}
export function enforceDraftCardSafety(draft: RentalDraft) {
  if (draft.payment.lastFour !== "" && !/^\d{1,4}$/.test(draft.payment.lastFour)) throw new TRPCError({ code: "BAD_REQUEST", message: "Payment accepts at most four card digits. Record only the last four." });
  if (Buffer.byteLength(JSON.stringify(draft), "utf8") > 45000 || Object.keys(draft.initials).some(key => !["election", "5", "6", "7", "8", "9", "10"].includes(key))) throw new TRPCError({ code: "BAD_REQUEST", message: "Rental draft or initials exceed the approved form limits." });
  // Validated structural identifiers are not PANs. Never scan concatenated fields.
  const walk = (value: unknown, path = "") => {
    if (typeof value === "string" && path === "claimNumber" && /^[A-Za-z0-9]{3}-\d{4}-\d{6}-\d{6}$/.test(value.trim())) return;
    if (typeof value === "string" && !/Vin$/.test(path) && /(?:\d[ -]?){13,19}/.test(value)) throw new TRPCError({ code: "BAD_REQUEST", message: "Do not enter full card numbers in the rental app." });
    if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) walk(item, key);
  };
  walk(draft);
}
export const MAX_RENTAL_UPLOAD = 5 * 1024 * 1024;
export function decodeRentalImage(base64: string): { bytes: Buffer; mime: "image/png" | "image/jpeg" } {
  const match = /^(?:data:(image\/(?:png|jpeg));base64,)?([A-Za-z0-9+/]*={0,2})$/.exec(base64);
  if (!match || match[2].length === 0 || match[2].length > Math.ceil(MAX_RENTAL_UPLOAD / 3) * 4 || match[2].length % 4 !== 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Upload a PNG or JPEG no larger than 5 MB." });
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > MAX_RENTAL_UPLOAD || bytes.toString("base64") !== match[2]) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid image encoding." });
  const png = bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.toString("ascii", 12, 16) === "IHDR";
  const jpeg = bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217;
  const mime = png ? "image/png" : jpeg ? "image/jpeg" : null;
  if (!mime || (match[1] && match[1] !== mime)) { bytes.fill(0); throw new TRPCError({ code: "BAD_REQUEST", message: "Image content must be PNG or JPEG." }); }
  if (png && (!bytes.readUInt32BE(16) || !bytes.readUInt32BE(20) || bytes.readUInt32BE(16) > 10000 || bytes.readUInt32BE(20) > 10000 || bytes.readUInt32BE(16) * bytes.readUInt32BE(20) > 25000000)) { bytes.fill(0); throw new TRPCError({ code: "BAD_REQUEST", message: "Image dimensions are too large." }); }
  return { bytes, mime };
}
