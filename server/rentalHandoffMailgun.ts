/**
 * Central, server-only rental sender. Actor identity is audit context, never a
 * credential/sender selector. No inbox ingestion, OAuth or payment processing.
 * Contracts: https://documentation.mailgun.com/docs/mailgun/api-reference/send/mailgun/messages
 * https://documentation.mailgun.com/docs/mailgun/api-reference/api-overview
 * https://documentation.mailgun.com/docs/mailgun/api-reference/send/mailgun/domains/get-v4-domains--name-
 *
 * Call only after the rental service authorizes the immutable packet and reserves
 * its unique DB email-log request. Mailgun does NOT provide idempotency here.
 * Never automatically retry a POST. Unknown submission outcomes require manual
 * reconciliation; an accepted message ID is queue acceptance, not delivery proof.
 * Credentials, PDF bytes and provider response bodies must never be logged.
 */
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { rentalSettings } from "../drizzle/rentalSchema";
import { getDb } from "./db";
import { decryptRental } from "./rentalHandoffSecurity";

const US = "https://api.mailgun.net";
const EU = "https://api.eu.mailgun.net";
const STATUS_TIMEOUT_MS = 5_000;
const SEND_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 64 * 1024;
// Leave room for MIME/base64 line wrapping under Mailgun's 25 MB message limit.
export const RENTAL_MAILGUN_MAX_PDF_BYTES = 16 * 1024 * 1024;
const UNCERTAIN = "delivery status uncertain — reconcile before resend";
export type RentalMailgunSenderStatus = {
  configured: boolean;
  connected: boolean;
  email: string | null;
  provider?: "mailgun";
};
export type RentalPacketMailgunInput = {
  actorKey: string;
  renterEmail: string;
  claimEmail: string;
  pdf: Buffer;
  kind: "handoff" | "return";
  requestId: string;
};
export type RentalMailgunSharedConfig = { domain: string; fromEmail: string; apiKey: string; region: "US" | "EU"; replyToEmail?: string };
// rental_settings has numeric IDs, not key columns: reserve row 2 for this key.
export const RENTAL_MAILGUN_SETTINGS_ID = 2;
export const RENTAL_MAILGUN_SETTINGS_KEY = "mailgun_sender";
type Config = { apiKey: string; domain: string; from: string; replyTo: string | null; baseUrl: string };

export class RentalMailgunDeliveryUncertainError extends Error {
  readonly code = "RENTAL_MAILGUN_DELIVERY_UNCERTAIN";
  readonly deliveryUncertain = true;
  constructor() { super(UNCERTAIN); this.name = "RentalMailgunDeliveryUncertainError"; }
}
function serverOnly() {
  if (typeof window !== "undefined") throw new Error("Rental email is server-only.");
}
function address(value: unknown): string {
  // Single ASCII addr-spec only; no display names, address lists or CR/LF.
  if (typeof value !== "string" || value.length > 254 || /[^\x21-\x7e]/.test(value))
    throw new Error("A valid rental email address is required.");
  const match = /^([A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*)@((?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63})$/.exec(value);
  if (!match || match[1].length > 64 || match[2].length > 253)
    throw new Error("A valid rental email address is required.");
  return `${match[1]}@${match[2].toLowerCase()}`;
}
function config(env: NodeJS.ProcessEnv): Config | null {
  try {
    const apiKey = env.MAILGUN_API_KEY;
    const domain = env.MAILGUN_DOMAIN;
    if (!apiKey || apiKey.length > 512 || /[^\x21-\x7e]/.test(apiKey) || !domain || domain.length > 253) return null;
    // A plain fully qualified DNS name, never a URL/path or interpolated header.
    const canonicalDomain = address(`sender@${domain}`).split("@")[1];
    const from = address(env.MAILGUN_FROM_EMAIL);
    const fromDomain = from.split("@")[1];
    // Permit an authenticated sending subdomain (mg.example.com) for example.com,
    // but never an unrelated sender identity. Owner must configure a verified From.
    if (fromDomain !== canonicalDomain && !canonicalDomain.endsWith(`.${fromDomain}`)) return null;
    const replyTo = env.MAILGUN_REPLY_TO_EMAIL ? address(env.MAILGUN_REPLY_TO_EMAIL) : null;
    const baseUrl = env.MAILGUN_BASE_URL || US;
    // Exact allowlist, optional single trailing slash; no ports/auth/query/paths.
    if (![US, `${US}/`, EU, `${EU}/`].includes(baseUrl)) return null;
    return { apiKey, domain: canonicalDomain, from, replyTo, baseUrl: baseUrl.replace(/\/$/, "") };
  } catch { return null; }
}
function auth(value: Config) { return `Basic ${Buffer.from(`api:${value.apiKey}`).toString("base64")}`; }
function savedEnvironment(value: RentalMailgunSharedConfig): NodeJS.ProcessEnv {
  if (value.region !== "US" && value.region !== "EU") throw new Error("Invalid rental sender region.");
  return { MAILGUN_API_KEY: value.apiKey, MAILGUN_DOMAIN: value.domain, MAILGUN_FROM_EMAIL: value.fromEmail, MAILGUN_REPLY_TO_EMAIL: value.replyToEmail, MAILGUN_BASE_URL: value.region === "EU" ? EU : US };
}
async function loadSavedSender(): Promise<RentalMailgunSharedConfig | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(rentalSettings).where(eq(rentalSettings.id, RENTAL_MAILGUN_SETTINGS_ID)).limit(1);
  if (!row) return null;
  const value = decryptRental<RentalMailgunSharedConfig & { key: string; formatVersion: number }>(row.payload);
  if (value.key !== RENTAL_MAILGUN_SETTINGS_KEY || value.formatVersion !== 1) return null;
  return value;
}
async function boundedJson(response: Response): Promise<unknown> {
  if (!response.body || Number(response.headers.get("content-length") || 0) > MAX_RESPONSE_BYTES) throw new Error("Invalid provider response.");
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  let bytes: Buffer | undefined;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new Error("Invalid provider response."); }
      chunks.push(Buffer.from(value));
    }
    bytes = Buffer.concat(chunks);
    return JSON.parse(bytes.toString("utf8"));
  } finally { reader.releaseLock(); bytes?.fill(0); for (const chunk of chunks) chunk.fill(0); }
}
/** Injectable transport/environment for tests; production never exports secrets. */
export function createRentalSenderMailgun(options: { http?: typeof fetch; env?: () => NodeJS.ProcessEnv; loadSaved?: () => Promise<RentalMailgunSharedConfig | null> } = {}) {
  const http: typeof fetch = options.http || ((...args) => fetch(...args));
  const environment = options.env || (() => process.env);
  const loadSaved = options.loadSaved || loadSavedSender;
  async function currentConfig(): Promise<Config | null> {
    const env = environment();
    // A partial/invalid explicit env override must NOT silently use another key.
    if (["MAILGUN_API_KEY", "MAILGUN_DOMAIN", "MAILGUN_FROM_EMAIL", "MAILGUN_BASE_URL", "MAILGUN_REPLY_TO_EMAIL"].some(key => env[key] !== undefined)) return config(env);
    try { const saved = await loadSaved(); return saved ? config(savedEnvironment(saved)) : null; } catch { return null; }
  }
  async function statusFor(value: Config): Promise<boolean> {
    try {
      const response = await http(`${value.baseUrl}/v4/domains/${value.domain}`, {
        headers: { Authorization: auth(value), Accept: "application/json" },
        signal: AbortSignal.timeout(STATUS_TIMEOUT_MS), redirect: "error",
      });
      if (response.status !== 200) { await response.body?.cancel(); return false; }
      const data = await boundedJson(response) as { domain?: { name?: unknown; state?: unknown; is_disabled?: unknown; type?: unknown } };
      return data?.domain?.name === value.domain && data.domain.state === "active" && data.domain.is_disabled === false && data.domain.type === "custom";
    } catch { return false; }
  }
  async function rentalSenderStatus(_actorKey?: string): Promise<RentalMailgunSenderStatus> {
    serverOnly();
    const value = await currentConfig();
    if (!value) return { configured: false, connected: false, email: null, provider: "mailgun" };
    // Environment presence alone is not proof of authentication/domain readiness.
    // A send-only Domain Sending Key cannot perform this probe: fail closed.
    return { configured: true, connected: await statusFor(value), email: value.from, provider: "mailgun" };
  }
  async function verifyRentalSharedSenderConfig(input: RentalMailgunSharedConfig): Promise<{ config: RentalMailgunSharedConfig; status: RentalMailgunSenderStatus }> {
    serverOnly();
    let value: Config | null;
    try { value = config(savedEnvironment(input)); } catch { value = null; }
    if (!value) throw new Error("Shared Mailgun sender configuration is invalid. Use a verified domain, matching From email and US/EU region.");
    if (!await statusFor(value)) throw new Error("Shared Mailgun sender verification failed. Check the API key domain-read permission, selected region and active verified domain.");
    return { config: { domain: value.domain, fromEmail: value.from, apiKey: value.apiKey, region: input.region, ...(value.replyTo ? { replyToEmail: value.replyTo } : {}) }, status: { configured: true, connected: true, email: value.from, provider: "mailgun" } };
  }
  async function sendRentalPacketMailgun(input: RentalPacketMailgunInput): Promise<{ providerId: string; senderEmail: string }> {
    serverOnly();
    const value = await currentConfig();
    if (!value) throw new Error("Verified sender and rental Mailgun configuration are not available.");
    const renter = address(input.renterEmail);
    const claim = address(input.claimEmail);
    if (!Buffer.isBuffer(input.pdf) || input.pdf.length < 5 || input.pdf.length > RENTAL_MAILGUN_MAX_PDF_BYTES || input.pdf.subarray(0, 5).toString("ascii") !== "%PDF-")
      throw new Error("Rental attachment must be a PDF no larger than 16 MiB.");
    if (input.kind !== "handoff" && input.kind !== "return") throw new Error("Invalid rental packet kind.");
    if (typeof input.requestId !== "string" || !/^[a-zA-Z0-9_:-]{8,128}$/.test(input.requestId)) throw new Error("A safe rental email request ID is required.");
    if (!await statusFor(value)) throw new Error("Verified sender and rental Mailgun domain are not ready. Ask an administrator to check credentials and domain verification.");
    const isReturn = input.kind === "return";
    const fields: Array<[string, string]> = [
      ["from", `Metrocars Leasing Corp. <${value.from}>`],
      ["to", renter],
      ...(claim.toLowerCase() === renter.toLowerCase() ? [] : [["cc", claim] as [string, string]]),
      ["subject", isReturn ? "Your Metrocars rental return copy" : "Your Metrocars rental packet"],
      ["text", `${isReturn ? "Your rental return condition report and charges" : "Your signed rental packet"} are attached. Roadside and towing: (855) 861-9875.`],
      ["o:tracking", "no"], ["o:tracking-clicks", "no"], ["o:tracking-opens", "no"],
      // Correlation only, NOT a provider idempotency key or retry guarantee.
      ["h:X-Rental-Request-ID", createHash("sha256").update(input.requestId).digest("hex")],
      ...(value.replyTo ? [["h:Reply-To", value.replyTo] as [string, string]] : []),
    ];
    let boundary: string;
    do { boundary = `rental-${randomBytes(24).toString("hex")}`; } while (input.pdf.includes(boundary));
    const prefix = Buffer.from(fields.map(([name, content]) => `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${content}\r\n`).join("") + `--${boundary}\r\nContent-Disposition: form-data; name="attachment"; filename="${isReturn ? "metrocars-rental-return.pdf" : "metrocars-rental-packet.pdf"}"\r\nContent-Type: application/pdf\r\n\r\n`);
    const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([prefix, input.pdf, suffix]);
    let response: Response;
    try {
      // After invoking POST, transport failures/timeouts are delivery-uncertain.
      try {
        response = await http(`${value.baseUrl}/v3/${value.domain}/messages`, {
          method: "POST", signal: AbortSignal.timeout(SEND_TIMEOUT_MS), redirect: "error",
          headers: { Authorization: auth(value), "Content-Type": `multipart/form-data; boundary=${boundary}`, Accept: "application/json" },
          body: new Uint8Array(body.buffer, body.byteOffset, body.byteLength),
        });
      } catch { throw new RentalMailgunDeliveryUncertainError(); }
      if (response.status !== 200) {
        try { await response.body?.cancel(); } catch { /* No provider body disclosure. */ }
        // Explicit non-timeout 4xx rejection is safe to record as failed. Unexpected
        // statuses, HTTP 408 and 5xx cannot prove the submission was not accepted.
        if (response.status >= 400 && response.status < 500 && response.status !== 408)
          throw new Error(`Email provider rejected rental packet (HTTP ${response.status}).`);
        throw new RentalMailgunDeliveryUncertainError();
      }
      let data: { id?: unknown };
      try { data = await boundedJson(response) as { id?: unknown }; } catch { throw new RentalMailgunDeliveryUncertainError(); }
      if (!data || typeof data.id !== "string" || !data.id.trim() || data.id.length > 120 || /[^\x21-\x7e]/.test(data.id))
        throw new RentalMailgunDeliveryUncertainError();
      return { providerId: data.id, senderEmail: value.from };
    } finally { body.fill(0); prefix.fill(0); suffix.fill(0); }
  }
  return { rentalSenderStatus, sendRentalPacketMailgun, verifyRentalSharedSenderConfig };
}
const production = createRentalSenderMailgun();
export const rentalSenderStatus = production.rentalSenderStatus;
export const sendRentalPacketMailgun = production.sendRentalPacketMailgun;
export const verifyRentalSharedSenderConfig = production.verifyRentalSharedSenderConfig;
