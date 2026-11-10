/**
 * Isolated shared rental Gmail sending; never imports or enables inbox ingestion.
 * Shared methods bind consent to a real native rental Admin, while tokens belong
 * to one fixed internal storage owner used by all authorized rental staff. Legacy
 * actor-owned factory methods remain for compatibility but have no active routes.
 * OAuth/API contracts:
 * https://developers.google.com/identity/protocols/oauth2/web-server
 * https://developers.google.com/identity/openid-connect/openid-connect
 * https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send
 *
 * Integration: resolveRentalActor must authenticate the SAME native ADMIN at
 * shared connect and callback. Pass only server-resolved staff keys for sending.
 * The service must reserve its unique email-log entry before invoking send, and
 * persist an uncertain outcome (never blindly retry) when deliveryUncertain=true.
 * Gmail has NO provider idempotency API: Message-ID/X-Idempotency-Key are correlation
 * markers, NOT an exactly-once guarantee. Do not retry a send on 401/5xx/timeout here.
 * The supplied immutable PDF is generated/authorized by the rental service (no
 * PAN/CVV), may contain license ID, and is intentionally attached in full to the
 * authorized renter and claim-specific address. No public file links or extra
 * recipients are added. Upstream file grants/retention remain unchanged.
 */
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, like, or } from "drizzle-orm";
import {
  rentalOauthStates,
  rentalSenderTokens,
} from "../drizzle/rentalSenderSchema";
import type { RentalActor } from "../shared/rentalHandoff";
import { getDb } from "./db";
import { decryptRental, encryptRental } from "./rentalHandoffSecurity";

const SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const REQUEST_SCOPES = `${SEND_SCOPE} openid email`;
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const STATE_MS = 10 * 60 * 1000;
const HTTP_MS = 15_000;
const UNCERTAIN = "delivery status uncertain — reconcile before resend";
/** Internal-only owner: never accept a caller-supplied shared key or From email. */
export const RENTAL_SHARED_GMAIL_OWNER = "shared:rental-gmail";
export const RENTAL_SHARED_GMAIL_CALLBACK = "https://whipclaimsivr.com/api/rental-handoff/gmail/callback";
export const RENTAL_GMAIL_MAX_PDF_BYTES = 20 * 1024 * 1024;
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

type SenderRow = typeof rentalSenderTokens.$inferSelect;
type StateRow = typeof rentalOauthStates.$inferSelect;
type SenderWrite = Omit<SenderRow, "id">;
type StateWrite = Omit<StateRow, "id">;
type Credential = {
  version: 1;
  actorKey: string;
  email: string;
  subject: string;
  accessToken: string;
  refreshToken: string;
  /** Unix epoch milliseconds, like the rental schema timestamps. */
  expiresAt: number;
  scopes: string[];
};

/** Narrow injectable persistence contract: tests do not use a real database. */
export interface RentalSenderStore {
  findToken(actorKey: string): Promise<SenderRow | undefined>;
  saveToken(row: SenderWrite): Promise<void>;
  /** Compare-and-swap: a refresh cannot resurrect disconnect or overwrite reauth. */
  replaceToken(previous: SenderRow, next: SenderWrite): Promise<boolean>;
  removeToken(previous: SenderRow): Promise<void>;
  insertState(row: StateWrite): Promise<void>;
  /** Must atomically match actor + hash + unexpired state and delete it once. */
  consumeState(
    actorKey: string,
    stateHash: string,
    now: number
  ): Promise<StateRow | undefined>;
  removeStates(actorKey: string): Promise<void>;
  /** Atomic completion-state consume + shared credential save; disconnect wins. */
  finalizeSharedToken?(stateHash: string, now: number, row: SenderWrite): Promise<boolean>;
  disconnectShared?(): Promise<void>;
}

async function database() {
  const db = await getDb();
  if (!db) throw new Error("Rental Gmail database is unavailable.");
  return db;
}
const drizzleStore: RentalSenderStore = {
  async findToken(actorKey) {
    return (
      await (await database())
        .select()
        .from(rentalSenderTokens)
        .where(eq(rentalSenderTokens.actorKey, actorKey))
        .limit(1)
    )[0];
  },
  async saveToken(row) {
    await (await database())
      .insert(rentalSenderTokens)
      .values(row)
      .onDuplicateKeyUpdate({ set: row });
  },
  async replaceToken(previous, next) {
    const [result] = await (
      await database()
    )
      .update(rentalSenderTokens)
      .set(next)
      .where(
        and(
          eq(rentalSenderTokens.actorKey, previous.actorKey),
          eq(rentalSenderTokens.tokenPayload, previous.tokenPayload)
        )
      );
    return result.affectedRows === 1;
  },
  async removeToken(previous) {
    await (await database())
      .delete(rentalSenderTokens)
      .where(
        and(
          eq(rentalSenderTokens.actorKey, previous.actorKey),
          eq(rentalSenderTokens.tokenPayload, previous.tokenPayload)
        )
      );
  },
  async insertState(row) {
    await (await database()).insert(rentalOauthStates).values(row);
  },
  async consumeState(actorKey, stateHash, now) {
    const db = await database();
    return db.transaction(async tx => {
      const predicate = and(
        eq(rentalOauthStates.stateHash, stateHash),
        eq(rentalOauthStates.actorKey, actorKey),
        gt(rentalOauthStates.expiresAt, now)
      );
      const [row] = await tx
        .select()
        .from(rentalOauthStates)
        .where(predicate)
        .limit(1)
        .for("update");
      if (!row) return undefined;
      const [result] = await tx.delete(rentalOauthStates).where(predicate);
      return result.affectedRows === 1 ? row : undefined;
    });
  },
  async removeStates(actorKey) {
    await (await database())
      .delete(rentalOauthStates)
      .where(actorKey === RENTAL_SHARED_GMAIL_OWNER
        ? or(eq(rentalOauthStates.actorKey, RENTAL_SHARED_GMAIL_OWNER), like(rentalOauthStates.actorKey, `${RENTAL_SHARED_GMAIL_OWNER}|native:%`))
        : eq(rentalOauthStates.actorKey, actorKey));
  },
  async finalizeSharedToken(stateHash, now, row) {
    return (await database()).transaction(async tx => {
      const predicate = and(eq(rentalOauthStates.actorKey, RENTAL_SHARED_GMAIL_OWNER), eq(rentalOauthStates.stateHash, stateHash), gt(rentalOauthStates.expiresAt, now));
      const [intent] = await tx.select().from(rentalOauthStates).where(predicate).limit(1).for("update");
      if (!intent || row.actorKey !== RENTAL_SHARED_GMAIL_OWNER) return false;
      await tx.delete(rentalOauthStates).where(predicate);
      await tx.insert(rentalSenderTokens).values(row).onDuplicateKeyUpdate({ set: row });
      return true;
    });
  },
  async disconnectShared() {
    await (await database()).transaction(async tx => {
      await tx.delete(rentalOauthStates).where(or(eq(rentalOauthStates.actorKey, RENTAL_SHARED_GMAIL_OWNER), like(rentalOauthStates.actorKey, `${RENTAL_SHARED_GMAIL_OWNER}|native:%`)));
      await tx.delete(rentalSenderTokens).where(eq(rentalSenderTokens.actorKey, RENTAL_SHARED_GMAIL_OWNER));
    });
  },
};

export class RentalGmailDeliveryUncertainError extends Error {
  readonly code = "RENTAL_GMAIL_DELIVERY_UNCERTAIN";
  readonly deliveryUncertain = true;
  constructor() {
    super(UNCERTAIN);
    this.name = "RentalGmailDeliveryUncertainError";
  }
}

function validActorKey(key: string) {
  if (
    typeof key !== "string" ||
    !/^(native|shop):[1-9]\d*$/.test(key) ||
    key.length > 100
  ) {
    throw new Error("An authenticated rental staff actor is required.");
  }
}
function sharedAdmin(actor: RentalActor) {
  validActorKey(actor.key);
  if (actor.role !== "admin" || !/^native:[1-9]\d*$/.test(actor.key))
    throw new Error("Rental Admin access is required to manage shared Gmail.");
}
function sharedStateOwner(actor: RentalActor) {
  // Existing state actorKey stores BOTH distinct principals without a migration.
  return `${RENTAL_SHARED_GMAIL_OWNER}|${actor.key}`;
}
function emailAddress(value: unknown): string {
  // Conservative ASCII addr-spec only; no display names, CR/LF, quoted strings,
  // commas, brackets or whitespace. Permit plus addressing, reject empty labels.
  if (
    typeof value !== "string" ||
    value.length > 254 ||
    /[^\x21-\x7e]/.test(value)
  )
    throw new Error("A valid rental email address is required.");
  const parts =
    /^([A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*)@((?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63})$/.exec(
      value
    );
  if (!parts || parts[1].length > 64 || parts[2].length > 253)
    throw new Error("A valid rental email address is required.");
  return `${parts[1]}@${parts[2].toLowerCase()}`;
}
function canonicalEmail(value: unknown) {
  return emailAddress(value).toLowerCase();
}
function callbackUri(baseOrigin: string): string {
  let url: URL;
  try {
    url = new URL(baseOrigin);
  } catch {
    throw new Error("Rental Gmail callback origin is not allowed.");
  }
  const productionHosts = [
    "whipclaimsivr.com",
    "www.whipclaimsivr.com",
    "whipivr-tyswfku7.manus.space",
  ];
  const preview =
    /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+manus\.computer$/.test(
      url.hostname
    );
  const https =
    url.protocol === "https:" &&
    !url.port &&
    (productionHosts.includes(url.hostname) || preview);
  const local =
    process.env.NODE_ENV === "development" &&
    url.origin === "http://127.0.0.1:3000";
  if (
    (!https && !local) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Rental Gmail callback origin is not allowed.");
  }
  const uri = `${url.origin}/api/rental-handoff/gmail/callback`;
  if (uri.length > 300)
    throw new Error("Rental Gmail callback origin is not allowed.");
  return uri;
}
function oauthConfig() {
  const clientId = process.env.GMAIL_CLIENT_ID?.trim();
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret)
    throw new Error(
      "Rental Gmail is blocked: configure GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET OAuth credentials."
    );
  return { clientId, clientSecret };
}
function scopesFrom(value: unknown): string[] {
  if (typeof value !== "string" || !value.trim())
    throw new Error(
      "Rental Gmail send permission was not granted; reconnect and approve sending."
    );
  // Google can canonicalize the short email scope to userinfo.email.
  const scopes = Array.from(
    new Set(
      value
        .trim()
        .split(/\s+/)
        .map(scope =>
          scope === "https://www.googleapis.com/auth/userinfo.email"
            ? "email"
            : scope
        )
    )
  );
  if (
    ![SEND_SCOPE, "openid", "email"].every(scope => scopes.includes(scope)) ||
    scopes.some(scope => ![SEND_SCOPE, "openid", "email"].includes(scope))
  ) {
    throw new Error(
      "Rental Gmail requires only send, openid and email permissions; reconnect with this rental flow."
    );
  }
  return scopes;
}
function credential(row: SenderRow): Credential {
  let token: Credential;
  try {
    token = decryptRental<Credential>(row.tokenPayload);
    if (
      token.version !== 1 ||
      token.actorKey !== row.actorKey ||
      token.email !== canonicalEmail(row.email) ||
      !token.subject ||
      typeof token.subject !== "string" ||
      !token.accessToken ||
      !token.refreshToken ||
      typeof token.accessToken !== "string" ||
      typeof token.refreshToken !== "string" ||
      !Number.isSafeInteger(token.expiresAt) ||
      !Array.isArray(token.scopes)
    )
      throw new Error();
    scopesFrom(token.scopes.join(" "));
  } catch {
    throw new Error(
      "Rental Gmail credentials are unavailable; reconnect your sender account."
    );
  }
  return token;
}
function tokenFields(data: Record<string, unknown>, now: number) {
  if (
    typeof data.access_token !== "string" ||
    !data.access_token ||
    data.token_type !== "Bearer" ||
    typeof data.expires_in !== "number" ||
    !Number.isSafeInteger(data.expires_in) ||
    data.expires_in <= 0 ||
    data.expires_in > 31_536_000
  ) {
    throw new Error(
      "Rental Gmail returned invalid credentials; reconnect your sender account."
    );
  }
  const expiresAt = now + data.expires_in * 1000;
  if (!Number.isSafeInteger(expiresAt))
    throw new Error("Rental Gmail returned an invalid token expiry.");
  return { accessToken: data.access_token, expiresAt };
}
function chunkBase64(bytes: Buffer) {
  return (
    bytes
      .toString("base64")
      .match(/.{1,76}/g)
      ?.join("\r\n") || ""
  );
}
export type RentalPacketGmailInput = {
  actorKey: string;
  renterEmail: string;
  claimEmail: string;
  pdf: Buffer;
  kind: "handoff" | "return";
  requestId: string;
};

/** Dependency-injected factory for fully offline tests; production exports below. */
export function createRentalSenderGmail(deps: {
  store: RentalSenderStore;
  fetch?: typeof fetch;
  now?: () => number;
}) {
  const store = deps.store;
  const fetcher =
    deps.fetch ||
    ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));
  const now = deps.now || Date.now;
  async function persist<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch {
      throw new Error("Rental Gmail credential storage is unavailable.");
    }
  }
  // Timeout covers fetch AND response JSON; upstream/provider error bodies are
  // never propagated, logged, or returned to the client.
  async function jsonRequest(
    url: string,
    init: RequestInit,
    label: string,
    sending = false
  ): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HTTP_MS);
    let safeError: Error | undefined;
    try {
      const response = await fetcher(url, {
        ...init,
        signal: controller.signal,
        redirect: "error",
      });
      if (!response.ok) {
        if (sending && (response.status === 408 || response.status >= 500))
          throw new RentalGmailDeliveryUncertainError();
        safeError = new Error(
          `${label} was rejected (HTTP ${response.status}).`
        );
        throw safeError;
      }
      let data: unknown;
      try {
        data = await response.json();
      } catch {
        if (sending) throw new RentalGmailDeliveryUncertainError();
        safeError = new Error(`${label} returned an invalid response.`);
        throw safeError;
      }
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        if (sending) throw new RentalGmailDeliveryUncertainError();
        safeError = new Error(`${label} returned an invalid response.`);
        throw safeError;
      }
      return data as Record<string, unknown>;
    } catch (error) {
      if (error instanceof RentalGmailDeliveryUncertainError) throw error;
      // Only expose locally generated messages, never arbitrary network errors.
      if (safeError && error === safeError) throw safeError;
      if (sending) throw new RentalGmailDeliveryUncertainError();
      throw new Error(`${label} could not be completed; try connecting again.`);
    } finally {
      clearTimeout(timeout);
    }
  }
  async function tokenRequest(params: Record<string, string>) {
    const { clientId, clientSecret } = oauthConfig();
    return jsonRequest(
      TOKEN_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          ...params,
        }),
      },
      "Rental Gmail authorization"
    );
  }
  async function verifiedIdentity(accessToken: string) {
    const user = await jsonRequest(
      USERINFO_URL,
      { headers: { Authorization: `Bearer ${accessToken}` } },
      "Rental Gmail account verification"
    );
    if (
      user.email_verified !== true ||
      typeof user.sub !== "string" ||
      !user.sub ||
      user.sub.length > 255
    )
      throw new Error(
        "Rental Gmail sender account email must be verified by Google."
      );
    return { email: canonicalEmail(user.email), subject: user.sub };
  }
  async function senderStatusForOwner(actorKey: string) {
    const configured = Boolean(
      process.env.GMAIL_CLIENT_ID?.trim() &&
        process.env.GMAIL_CLIENT_SECRET?.trim()
    );
    const row = await persist(() => store.findToken(actorKey));
    if (!row) return { connected: false, email: null, configured };
    try {
      const token = credential(row);
      return { connected: true, email: token.email, configured };
    } catch {
      return { connected: false, email: null, configured };
    }
  }
  async function rentalSenderStatus(actorKey: string) {
    validActorKey(actorKey);
    return senderStatusForOwner(actorKey);
  }
  async function sharedGmailStatus(actorKey: string) {
    validActorKey(actorKey);
    return { ...await senderStatusForOwner(RENTAL_SHARED_GMAIL_OWNER), provider: "gmail" as const, shared: true as const };
  }
  async function connectRentalSender(actor: RentalActor, baseOrigin: string) {
    validActorKey(actor.key);
    return connectForStateOwner(actor.key, callbackUri(baseOrigin));
  }
  async function connectSharedGmail(actor: RentalActor) {
    sharedAdmin(actor);
    if (!store.finalizeSharedToken) throw new Error("Shared Gmail credential storage is unavailable.");
    return connectForStateOwner(sharedStateOwner(actor), RENTAL_SHARED_GMAIL_CALLBACK);
  }
  async function connectForStateOwner(stateOwner: string, redirectUri: string) {
    const { clientId } = oauthConfig();
    // Check encryption readiness before initiating consent, without storing secrets.
    encryptRental({ readiness: true });
    const state = randomBytes(32).toString("base64url"),
      createdAt = now();
    await persist(() =>
      store.insertState({
        actorKey: stateOwner,
        stateHash: hash(state),
        redirectUri,
        expiresAt: createdAt + STATE_MS,
        createdAt,
      })
    );
    if (stateOwner.startsWith(`${RENTAL_SHARED_GMAIL_OWNER}|`)) {
      // A second, domain-separated hash permits atomic publication after exchange.
      // Disconnect deletes this intent even if the CSRF state is already consumed.
      await persist(() => store.insertState({ actorKey: RENTAL_SHARED_GMAIL_OWNER, stateHash: hash(`shared-finalize:${state}`), redirectUri, expiresAt: createdAt + STATE_MS, createdAt }));
    }
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: REQUEST_SCOPES,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "false",
      state,
    });
    return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` };
  }
  async function finishRentalSender(
    actor: RentalActor,
    code: string,
    state: string
  ) {
    validActorKey(actor.key);
    return finishForOwners(actor.key, actor.key, code, state, false);
  }
  async function finishSharedGmail(actor: RentalActor, code: string, state: string) {
    sharedAdmin(actor);
    return finishForOwners(sharedStateOwner(actor), RENTAL_SHARED_GMAIL_OWNER, code, state, true);
  }
  async function finishForOwners(stateOwner: string, tokenOwner: string, code: string, state: string, shared: boolean) {
    oauthConfig();
    if (
      typeof state !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/.test(state) ||
      typeof code !== "string" ||
      !code ||
      code.length > 4096
    )
      throw new Error(
        "Rental Gmail authorization state is invalid or expired."
      );
    // Commit the deletion BEFORE any provider request. Wrong actors do not consume
    // valid state; failures after consumption require a fresh connect attempt.
    const saved = await persist(() =>
      store.consumeState(stateOwner, hash(state), now())
    );
    if (
      !saved ||
      saved.actorKey !== stateOwner ||
      saved.stateHash !== hash(state) ||
      saved.expiresAt <= now()
    )
      throw new Error(
        "Rental Gmail authorization state is invalid or expired."
      );
    if (shared && saved.redirectUri !== RENTAL_SHARED_GMAIL_CALLBACK)
      throw new Error("Rental Gmail callback origin is not allowed.");
    if (callbackUri(new URL(saved.redirectUri).origin) !== saved.redirectUri)
      throw new Error("Rental Gmail callback origin is not allowed.");
    const data = await tokenRequest({
      code,
      redirect_uri: saved.redirectUri,
      grant_type: "authorization_code",
    });
    const fields = tokenFields(data, now()),
      scopes = scopesFrom(data.scope);
    const identity = await verifiedIdentity(fields.accessToken);
    const previous = await persist(() => store.findToken(tokenOwner));
    let refreshToken =
      typeof data.refresh_token === "string" && data.refresh_token
        ? data.refresh_token
        : undefined;
    if (!refreshToken && previous) {
      let old: Credential | undefined;
      try {
        old = credential(previous);
      } catch {
        /* An unreadable credential cannot be preserved. */
      }
      if (old?.subject === identity.subject && old.email === identity.email)
        refreshToken = old.refreshToken;
    }
    if (!refreshToken)
      throw new Error(
        "Rental Gmail offline access was not granted; reconnect and approve consent for this account."
      );
    const payload: Credential = {
      version: 1,
      actorKey: tokenOwner,
      ...identity,
      ...fields,
      refreshToken,
      scopes,
    };
    const next: SenderWrite = {
        actorKey: tokenOwner,
        email: identity.email,
        tokenPayload: encryptRental(payload),
        updatedAt: Math.max(now(), (previous?.updatedAt || 0) + 1),
    };
    // Shared publication consumes its completion intent atomically with upsert.
    // A disconnect during Google exchange cannot resurrect the connection.
    if (shared) {
      if (!store.finalizeSharedToken || !(await persist(() => store.finalizeSharedToken!(hash(`shared-finalize:${state}`), now(), next))))
        throw new Error("Rental Gmail authorization changed or expired; connect again.");
    } else {
      await persist(() => store.saveToken(next));
    }
    return { email: identity.email };
  }
  async function disconnectRentalSender(actorKey: string) {
    validActorKey(actorKey);
    const row = await persist(() => store.findToken(actorKey));
    await persist(() => store.removeStates(actorKey));
    if (!row) return;
    try {
      const token = credential(row);
      const controller = new AbortController(),
        timer = setTimeout(() => controller.abort(), HTTP_MS);
      try {
        // Revoke only this actor's stored token, not mail settings or client config.
        await fetcher("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: token.refreshToken }),
          signal: controller.signal,
          redirect: "error",
        });
      } finally {
        clearTimeout(timer);
      }
    } catch {
      /* Best effort: no provider error text or tokens reach the client. */
    }
    await persist(() => store.removeToken(row));
  }
  async function disconnectSharedGmail(actor: RentalActor) {
    sharedAdmin(actor);
    // Google revocation can affect other grants for the same OAuth client/account.
    // Local rental-only disconnect never touches inbox tokens or Google-wide grants.
    if (!store.disconnectShared) throw new Error("Shared Gmail credential storage is unavailable.");
    await persist(() => store.disconnectShared!());
    return { success: true as const };
  }
  async function sendRentalPacketGmail(input: RentalPacketGmailInput) {
    validActorKey(input.actorKey);
    return sendForOwner(input, input.actorKey);
  }
  async function sendRentalPacketSharedGmail(input: RentalPacketGmailInput) {
    validActorKey(input.actorKey);
    return sendForOwner(input, RENTAL_SHARED_GMAIL_OWNER);
  }
  async function sendForOwner(input: RentalPacketGmailInput, tokenOwner: string) {
    oauthConfig();
    const renter = emailAddress(input.renterEmail),
      claim = emailAddress(input.claimEmail);
    const recipients =
      renter.toLowerCase() === claim.toLowerCase() ? [renter] : [renter, claim];
    if (
      !["handoff", "return"].includes(input.kind) ||
      typeof input.requestId !== "string" ||
      !input.requestId ||
      input.requestId.length > 200 ||
      /[\r\n]/.test(input.requestId)
    )
      throw new Error("A valid rental packet delivery request is required.");
    if (
      !Buffer.isBuffer(input.pdf) ||
      input.pdf.length < 5 ||
      input.pdf.length > RENTAL_GMAIL_MAX_PDF_BYTES ||
      input.pdf.subarray(0, 5).toString("ascii") !== "%PDF-"
    )
      throw new Error("A rental PDF packet no larger than 20 MB is required.");
    const row = await persist(() => store.findToken(tokenOwner));
    if (!row)
      throw new Error(
        tokenOwner === RENTAL_SHARED_GMAIL_OWNER
          ? "A rental Admin must connect the shared Gmail account before sending a rental packet."
          : "Connect your own Gmail account before sending a rental packet."
      );
    let token = credential(row);
    if (token.expiresAt <= now() + 60_000) {
      const data = await tokenRequest({
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      });
      const fields = tokenFields(data, now());
      const scopes =
        data.scope === undefined ? token.scopes : scopesFrom(data.scope);
      const identity = await verifiedIdentity(fields.accessToken);
      if (identity.subject !== token.subject || identity.email !== token.email)
        throw new Error(
          "Rental Gmail sender account changed; reconnect before sending."
        );
      token = {
        ...token,
        ...fields,
        scopes,
        refreshToken:
          typeof data.refresh_token === "string" && data.refresh_token
            ? data.refresh_token
            : token.refreshToken,
      };
      const next: SenderWrite = {
        actorKey: row.actorKey,
        email: token.email,
        tokenPayload: encryptRental(token),
        updatedAt: Math.max(now(), row.updatedAt + 1),
      };
      if (!(await persist(() => store.replaceToken(row, next))))
        throw new Error(
          "Rental Gmail connection changed; check the connected sender before sending."
        );
    }
    // Check for a concurrent disconnect/reauth immediately before sending. This
    // narrows the race but does not promise distributed exactly-once delivery.
    const current = await persist(() => store.findToken(tokenOwner));
    if (
      !current ||
      credential(current).accessToken !== token.accessToken ||
      current.email !== token.email
    )
      throw new Error(
        "Rental Gmail connection changed; check the connected sender before sending."
      );
    const correlation = hash(JSON.stringify([input.actorKey, input.requestId]));
    const boundary = `metrocars_${randomBytes(18).toString("hex")}`;
    const returning = input.kind === "return";
    const subject = returning
      ? "Your Metrocars return packet"
      : "Your Metrocars rental packet";
    const mime = [
      `From: Metrocars Leasing Corp <${token.email}>`,
      `To: ${renter}`,
      ...(recipients.length === 2 ? [`Cc: ${claim}`] : []),
      `Subject: ${subject}`,
      `Message-ID: <${correlation}@${token.email.split("@")[1]}>`,
      `X-Idempotency-Key: ${correlation}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 7bit",
      "",
      `Your Metrocars ${returning ? "return" : "rental"} packet is attached.`,
      "For roadside assistance, call (855) 861-9875.",
      "",
      `--${boundary}`,
      "Content-Type: application/pdf",
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="Metrocars-${returning ? "return" : "rental"}-packet.pdf"`,
      "",
      chunkBase64(input.pdf),
      `--${boundary}--`,
      "",
    ].join("\r\n");
    const result = await jsonRequest(
      SEND_URL,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          raw: Buffer.from(mime, "utf8").toString("base64url"),
        }),
      },
      "Rental Gmail packet delivery",
      true
    );
    if (
      typeof result.id !== "string" ||
      !/^[A-Za-z0-9_-]{1,200}$/.test(result.id)
    )
      throw new RentalGmailDeliveryUncertainError();
    return { providerId: result.id, senderEmail: token.email, recipients };
  }
  return {
    rentalSenderStatus,
    connectRentalSender,
    finishRentalSender,
    disconnectRentalSender,
    sendRentalPacketGmail,
    sharedGmailStatus,
    connectSharedGmail,
    finishSharedGmail,
    disconnectSharedGmail,
    sendRentalPacketSharedGmail,
  };
}

const production = createRentalSenderGmail({ store: drizzleStore });
export const rentalSenderStatus = production.rentalSenderStatus;
export const connectRentalSender = production.connectRentalSender;
export const finishRentalSender = production.finishRentalSender;
export const disconnectRentalSender = production.disconnectRentalSender;
export const sendRentalPacketGmail = production.sendRentalPacketGmail;
export const sharedGmailStatus = production.sharedGmailStatus;
export const connectSharedGmail = production.connectSharedGmail;
export const finishSharedGmail = production.finishSharedGmail;
export const disconnectSharedGmail = production.disconnectSharedGmail;
export const sendRentalPacketSharedGmail = production.sendRentalPacketSharedGmail;
export type RentalSharedGmailStatus = Awaited<ReturnType<typeof sharedGmailStatus>>;
