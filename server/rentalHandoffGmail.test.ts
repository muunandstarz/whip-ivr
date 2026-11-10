import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRentalSenderGmail,
  RentalGmailDeliveryUncertainError,
  type RentalSenderStore,
  type RentalPacketGmailInput,
} from "./rentalHandoffGmail";
import { decryptRental, encryptRental } from "./rentalHandoffSecurity";
import type { RentalActor } from "../shared/rentalHandoff";
import type {
  rentalOauthStates,
  rentalSenderTokens,
} from "../drizzle/rentalSenderSchema";

// No test can accidentally reach production persistence or Google endpoints.
vi.mock("./db", () => ({
  getDb: vi.fn(() => {
    throw new Error("Real database forbidden in sender tests");
  }),
}));
type SenderRow = typeof rentalSenderTokens.$inferSelect;
type StateRow = typeof rentalOauthStates.$inferSelect;
const SEND = "https://www.googleapis.com/auth/gmail.send";
const GRANT = `${SEND} openid email`;
const actor: RentalActor = {
  key: "native:1",
  name: "Test staff",
  role: "claims",
  locationIds: [],
};
const shop: RentalActor = {
  key: "shop:1",
  name: "Test shop",
  role: "shop",
  locationIds: [1],
  shopUserId: 1,
};
const instant = Date.parse("2026-11-10T18:00:00Z");
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
class FakeStore implements RentalSenderStore {
  tokens = new Map<string, SenderRow>();
  states: StateRow[] = [];
  nextId = 1;
  casAllowed = true;
  async findToken(key: string) {
    const row = this.tokens.get(key);
    return row ? { ...row } : undefined;
  }
  async saveToken(row: Omit<SenderRow, "id">) {
    this.tokens.set(row.actorKey, {
      ...row,
      id: this.tokens.get(row.actorKey)?.id || this.nextId++,
    });
  }
  async replaceToken(previous: SenderRow, next: Omit<SenderRow, "id">) {
    if (
      !this.casAllowed ||
      this.tokens.get(previous.actorKey)?.tokenPayload !== previous.tokenPayload
    )
      return false;
    await this.saveToken(next);
    return true;
  }
  async removeToken(previous: SenderRow) {
    if (
      this.tokens.get(previous.actorKey)?.tokenPayload === previous.tokenPayload
    )
      this.tokens.delete(previous.actorKey);
  }
  async insertState(row: Omit<StateRow, "id">) {
    this.states.push({ ...row, id: this.nextId++ });
  }
  async consumeState(actorKey: string, stateHash: string, now: number) {
    const i = this.states.findIndex(
      row =>
        row.actorKey === actorKey &&
        row.stateHash === stateHash &&
        row.expiresAt > now
    );
    // Splice synchronously before yielding to simulate one atomic SQL consume.
    return i < 0 ? undefined : this.states.splice(i, 1)[0];
  }
  async removeStates(actorKey: string) {
    this.states = this.states.filter(row => row.actorKey !== actorKey);
  }
}
let store: FakeStore,
  clock: number,
  http: ReturnType<typeof vi.fn>,
  gmail: ReturnType<typeof createRentalSenderGmail>;
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
function tokenResponse(extra: Record<string, unknown> = {}) {
  return response({
    access_token: "mock-access",
    refresh_token: "mock-refresh",
    token_type: "Bearer",
    expires_in: 3600,
    scope: GRANT,
    ...extra,
  });
}
function identityResponse(
  email = "staff@example.test",
  sub = "google-test-staff"
) {
  return response({ email, sub, email_verified: true });
}
function input(
  extra: Partial<RentalPacketGmailInput> = {}
): RentalPacketGmailInput {
  return {
    actorKey: actor.key,
    renterEmail: "renter+packet@example.test",
    claimEmail: "claim-123@example.test",
    kind: "handoff",
    requestId: "handoff-test-123",
    pdf: Buffer.from(
      "%PDF-test\n" + "authorized license packet fixture ".repeat(20)
    ),
    ...extra,
  };
}
async function seed(
  actorKey = actor.key,
  extra: Record<string, unknown> = {},
  email = "staff@example.test"
) {
  const payload = {
    version: 1,
    actorKey,
    email,
    subject: "google-test-staff",
    accessToken: "cached-access",
    refreshToken: "cached-refresh",
    expiresAt: clock + 3600_000,
    scopes: [SEND, "openid", "email"],
    ...extra,
  };
  await store.saveToken({
    actorKey,
    email,
    tokenPayload: encryptRental(payload),
    updatedAt: clock,
  });
}
async function stateFor(a = actor, origin = "https://whipclaimsivr.com") {
  const { url } = await gmail.connectRentalSender(a, origin);
  return new URL(url).searchParams.get("state")!;
}
function sentMime(call = 0) {
  const sends = http.mock.calls.filter(([url]) =>
    String(url).endsWith("/messages/send")
  );
  const raw = JSON.parse(String(sends[call][1].body)).raw as string;
  expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
  return Buffer.from(raw, "base64url").toString("utf8");
}
beforeEach(() => {
  vi.stubEnv("GMAIL_CLIENT_ID", "test-client.apps.googleusercontent.com");
  vi.stubEnv("GMAIL_CLIENT_SECRET", "mock-client-secret");
  vi.stubEnv("JWT_SECRET", "test-only-rental-encryption-secret-long");
  vi.stubEnv("NODE_ENV", "test");
  clock = instant;
  store = new FakeStore();
  http = vi.fn(() => {
    throw new Error("Unexpected fetch: no live calls allowed");
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Global fetch forbidden in tests");
    })
  );
  gmail = createRentalSenderGmail({
    store,
    fetch: http as typeof fetch,
    now: () => clock,
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("isolated rental staff Gmail OAuth", () => {
  it("reports per-actor configuration and connection status without exposing secrets", async () => {
    expect(await gmail.rentalSenderStatus(actor.key)).toEqual({
      connected: false,
      email: null,
      configured: true,
    });
    await seed();
    expect(await gmail.rentalSenderStatus(actor.key)).toEqual({
      connected: true,
      email: "staff@example.test",
      configured: true,
    });
    expect(await gmail.rentalSenderStatus(shop.key)).toEqual({
      connected: false,
      email: null,
      configured: true,
    });
    expect(
      JSON.stringify(await gmail.rentalSenderStatus(actor.key))
    ).not.toMatch(/token|secret|cached-access|cached-refresh/);
    expect(http).not.toHaveBeenCalled();
  });
  it("blocks unconfigured sending and connecting rather than faking delivery", async () => {
    vi.stubEnv("GMAIL_CLIENT_SECRET", "");
    expect(await gmail.rentalSenderStatus(actor.key)).toEqual({
      connected: false,
      email: null,
      configured: false,
    });
    await expect(
      gmail.connectRentalSender(actor, "https://whipclaimsivr.com")
    ).rejects.toThrow(/configure GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET/);
    await expect(gmail.sendRentalPacketGmail(input())).rejects.toThrow(
      /configure GMAIL_CLIENT_ID/
    );
    expect(http).not.toHaveBeenCalled();
    expect(store.states).toHaveLength(0);
  });
  it("requests ONLY send + openid email and stores only a random state hash with ten-minute actor binding", async () => {
    const { url } = await gmail.connectRentalSender(
      shop,
      "https://whipivr-tyswfku7.manus.space/"
    );
    const parsed = new URL(url),
      p = parsed.searchParams,
      state = p.get("state")!;
    expect(parsed.origin + parsed.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth"
    );
    expect(p.get("scope")).toBe(GRANT);
    expect(url).toContain("+openid+email");
    expect(p.get("access_type")).toBe("offline");
    expect(p.get("prompt")).toBe("consent");
    expect(p.get("include_granted_scopes")).toBe("false");
    expect(p.get("redirect_uri")).toBe(
      "https://whipivr-tyswfku7.manus.space/api/rental-handoff/gmail/callback"
    );
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(state, "base64url")).toHaveLength(32);
    expect(store.states[0]).toMatchObject({
      stateHash: sha(state),
      actorKey: shop.key,
      createdAt: clock,
      expiresAt: clock + 600_000,
    });
    expect(JSON.stringify(store.states)).not.toContain(state);
    expect(url).not.toMatch(
      /gmail\.readonly|gmail\.modify|gmail\.labels|mock-client-secret/
    );
    expect(await stateFor(shop)).not.toBe(state);
    expect(http).not.toHaveBeenCalled();
  });
  it.each([
    "https://whipclaimsivr.com",
    "https://www.whipclaimsivr.com",
    "https://whipivr-tyswfku7.manus.space",
    "https://3000-i8k4qwo8obmufyrumd8lt-56528006.us1.manus.computer",
  ])("accepts the explicit HTTPS callback origin %s", async origin => {
    await expect(
      gmail.connectRentalSender(actor, origin)
    ).resolves.toHaveProperty("url");
  });
  it.each([
    "http://whipclaimsivr.com",
    "https://evil.test",
    "https://whipclaimsivr.com.evil.test",
    "https://manus.computer.evil.test",
    "https://manus.computer",
    "https://evilmanus.computer",
    "https://whipclaimsivr.com:444",
    "https://user@whipclaimsivr.com",
    "https://whipclaimsivr.com/other",
    "https://whipclaimsivr.com?redirect=evil",
    "https://whipclaimsivr.com#x",
    "http://127.0.0.1:3000",
    "http://localhost:3000",
  ])("rejects unapproved callback origin %s", async origin => {
    await expect(gmail.connectRentalSender(actor, origin)).rejects.toThrow(
      /origin is not allowed/
    );
    expect(store.states).toHaveLength(0);
  });
  it("permits exact loopback only in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await expect(
      gmail.connectRentalSender(actor, "http://127.0.0.1:3000")
    ).resolves.toHaveProperty("url");
    for (const origin of [
      "http://127.0.0.1:3001",
      "http://localhost:3000",
      "http://127.0.0.2:3000",
    ])
      await expect(gmail.connectRentalSender(actor, origin)).rejects.toThrow();
  });
  it("rejects cross-actor callback without consuming rightful actor state and never shares tokens", async () => {
    const state = await stateFor(actor);
    await expect(
      gmail.finishRentalSender(shop, "mock-code", state)
    ).rejects.toThrow(/invalid or expired/);
    expect(store.states).toHaveLength(1);
    expect(http).not.toHaveBeenCalled();
    http
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(identityResponse());
    expect(await gmail.finishRentalSender(actor, "mock-code", state)).toEqual({
      email: "staff@example.test",
    });
    expect(store.tokens.has(actor.key)).toBe(true);
    expect(store.tokens.has(shop.key)).toBe(false);
    await expect(
      gmail.finishRentalSender(actor, "mock-code", state)
    ).rejects.toThrow(/invalid or expired/);
    expect(http).toHaveBeenCalledTimes(2);
  });
  it("atomically consumes valid state once under concurrent callbacks", async () => {
    const state = await stateFor();
    http
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(identityResponse());
    const attempts = await Promise.allSettled([
      gmail.finishRentalSender(actor, "code", state),
      gmail.finishRentalSender(actor, "code", state),
    ]);
    expect(attempts.filter(x => x.status === "fulfilled")).toHaveLength(1);
    expect(http).toHaveBeenCalledTimes(2);
    expect(store.states).toHaveLength(0);
  });
  it("rejects expired, malformed and unknown state without exchange", async () => {
    const state = await stateFor();
    clock += 600_000;
    for (const s of [state, "bad\r\n", "A".repeat(43)])
      await expect(gmail.finishRentalSender(actor, "code", s)).rejects.toThrow(
        /invalid or expired/
      );
    expect(http).not.toHaveBeenCalled();
  });
  it("exchanges URL-encoded code and saved redirect then verifies Google identity and encrypts tokens", async () => {
    const state = await stateFor();
    http
      .mockResolvedValueOnce(
        tokenResponse({
          scope: `${SEND} openid https://www.googleapis.com/auth/userinfo.email`,
        })
      )
      .mockResolvedValueOnce(identityResponse("Actual.Sender@example.test"));
    expect(await gmail.finishRentalSender(actor, "code +/=", state)).toEqual({
      email: "actual.sender@example.test",
    });
    const [url, init] = http.mock.calls[0],
      body = init.body as URLSearchParams;
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "Content-Type": "application/x-www-form-urlencoded",
    });
    expect(body.get("code")).toBe("code +/=");
    expect(body.get("client_id")).toBe(process.env.GMAIL_CLIENT_ID);
    expect(body.get("client_secret")).toBe(process.env.GMAIL_CLIENT_SECRET);
    expect(body.get("redirect_uri")).toBe(
      "https://whipclaimsivr.com/api/rental-handoff/gmail/callback"
    );
    expect(http.mock.calls[1][0]).toBe(
      "https://openidconnect.googleapis.com/v1/userinfo"
    );
    const row = store.tokens.get(actor.key)!;
    expect(row.tokenPayload).toMatch(/^v1\./);
    expect(row.tokenPayload).not.toMatch(
      /mock-access|mock-refresh|actual.sender/
    );
    expect(decryptRental<any>(row.tokenPayload)).toMatchObject({
      actorKey: actor.key,
      email: "actual.sender@example.test",
      subject: "google-test-staff",
      expiresAt: clock + 3600_000,
      refreshToken: "mock-refresh",
    });
  });
  it.each([
    undefined,
    "",
    "openid email",
    `${GRANT} https://www.googleapis.com/auth/gmail.readonly`,
    `${SEND} email`,
  ])(
    "rejects missing or broader granted scopes %s and consumes state",
    async scope => {
      const state = await stateFor();
      http.mockResolvedValueOnce(tokenResponse({ scope }));
      await expect(
        gmail.finishRentalSender(actor, "code", state)
      ).rejects.toThrow(/permission|permissions/);
      expect(store.tokens.size).toBe(0);
      expect(store.states).toHaveLength(0);
      expect(http).toHaveBeenCalledTimes(1);
    }
  );
  it("requires Google-verified email and never trusts an arbitrary From address", async () => {
    const state = await stateFor();
    http
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        response({
          email: "spoof@example.test",
          sub: "google-sub",
          email_verified: false,
        })
      );
    await expect(
      gmail.finishRentalSender(actor, "code", state)
    ).rejects.toThrow(/verified by Google/);
    expect(store.tokens.size).toBe(0);
  });
  it("requires offline refresh access or preserves it ONLY for identical Google subject and email", async () => {
    await seed();
    const state = await stateFor();
    http
      .mockResolvedValueOnce(tokenResponse({ refresh_token: undefined }))
      .mockResolvedValueOnce(identityResponse());
    await expect(
      gmail.finishRentalSender(actor, "code", state)
    ).resolves.toEqual({ email: "staff@example.test" });
    expect(
      decryptRental<any>(store.tokens.get(actor.key)!.tokenPayload).refreshToken
    ).toBe("cached-refresh");
    const state2 = await stateFor();
    http
      .mockResolvedValueOnce(tokenResponse({ refresh_token: undefined }))
      .mockResolvedValueOnce(
        identityResponse("replacement@example.test", "different-google-sub")
      );
    await expect(
      gmail.finishRentalSender(actor, "code", state2)
    ).rejects.toThrow(/offline access/);
    expect(
      decryptRental<any>(store.tokens.get(actor.key)!.tokenPayload).email
    ).toBe("staff@example.test");
  });
  it("replaces old-account tokens completely after successful account-change consent", async () => {
    await seed();
    const state = await stateFor();
    http
      .mockResolvedValueOnce(
        tokenResponse({ refresh_token: "replacement-refresh" })
      )
      .mockResolvedValueOnce(
        identityResponse("replacement@example.test", "different-google-sub")
      );
    await gmail.finishRentalSender(actor, "code", state);
    const token = decryptRental<any>(store.tokens.get(actor.key)!.tokenPayload);
    expect(token).toMatchObject({
      email: "replacement@example.test",
      subject: "different-google-sub",
      refreshToken: "replacement-refresh",
    });
    expect(JSON.stringify(token)).not.toContain("cached-refresh");
    expect(store.tokens.size).toBe(1);
  });
  it("does not preserve refresh tokens for a different subject even when email is identical", async () => {
    await seed();
    const state = await stateFor();
    http
      .mockResolvedValueOnce(tokenResponse({ refresh_token: undefined }))
      .mockResolvedValueOnce(identityResponse("staff@example.test", "new-sub"));
    await expect(
      gmail.finishRentalSender(actor, "code", state)
    ).rejects.toThrow(/offline access/);
  });
  it("revokes only the staff token and deletes local credentials even on provider failure", async () => {
    await seed();
    await seed(shop.key);
    await stateFor();
    await stateFor(shop);
    http.mockRejectedValueOnce(new Error("private-token-provider-error"));
    await expect(
      gmail.disconnectRentalSender(actor.key)
    ).resolves.toBeUndefined();
    expect(http).toHaveBeenCalledTimes(1);
    expect(http.mock.calls[0][0]).toBe("https://oauth2.googleapis.com/revoke");
    expect((http.mock.calls[0][1].body as URLSearchParams).get("token")).toBe(
      "cached-refresh"
    );
    expect(store.tokens.has(actor.key)).toBe(false);
    expect(store.tokens.has(shop.key)).toBe(true);
    expect(store.states.map(s => s.actorKey)).toEqual([shop.key]);
  });
  it("sanitizes provider errors and never exposes response bodies or raw tokens", async () => {
    const state = await stateFor();
    http.mockResolvedValueOnce(
      response(
        {
          error: "invalid_grant",
          error_description: "PII mock-refresh staff@example.test",
        },
        400
      )
    );
    await expect(
      gmail.finishRentalSender(actor, "code", state)
    ).rejects.toThrow("Rental Gmail authorization was rejected (HTTP 400).");
    expect(store.tokens.size).toBe(0);
    expect(store.states).toHaveLength(0);
  });
  it("rejects invalid actor keys and detects swapped encrypted credentials", async () => {
    await expect(
      gmail.connectRentalSender(
        { ...actor, key: "arbitrary-email" },
        "https://whipclaimsivr.com"
      )
    ).rejects.toThrow(/authenticated/);
    await seed();
    const old = store.tokens.get(actor.key)!;
    store.tokens.set(shop.key, { ...old, actorKey: shop.key });
    expect(await gmail.rentalSenderStatus(shop.key)).toEqual({
      connected: false,
      email: null,
      configured: true,
    });
    await expect(
      gmail.sendRentalPacketGmail(input({ actorKey: shop.key }))
    ).rejects.toThrow(/credentials are unavailable/);
    expect(http).not.toHaveBeenCalled();
  });
});

describe("Gmail rental PDF delivery", () => {
  it("sends the full MIME PDF to renter plus claim Cc using actual verified sender and safe branding", async () => {
    await seed();
    http.mockResolvedValueOnce(response({ id: "gmail-provider-123" }));
    const packet = input();
    (packet as any).pan = "4111111111111111";
    (packet as any).cvv = "123";
    (packet as any).senderEmail = "spoof@example.test";
    expect(await gmail.sendRentalPacketGmail(packet)).toEqual({
      providerId: "gmail-provider-123",
      senderEmail: "staff@example.test",
      recipients: [packet.renterEmail, packet.claimEmail],
    });
    expect(http).toHaveBeenCalledTimes(1);
    expect(http.mock.calls[0][0]).toBe(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
    );
    expect(http.mock.calls[0][1].headers.Authorization).toBe(
      "Bearer cached-access"
    );
    const mime = sentMime();
    expect(mime).toContain(
      "From: Metrocars Leasing Corp <staff@example.test>\r\n"
    );
    expect(mime).toContain(
      `To: ${packet.renterEmail}\r\nCc: ${packet.claimEmail}`
    );
    expect(mime).toContain("Subject: Your Metrocars rental packet\r\n");
    expect(mime).toContain("Content-Type: multipart/mixed;");
    expect(mime).toContain("Content-Type: application/pdf\r\n");
    expect(mime).toContain("For roadside assistance, call (855) 861-9875.");
    expect(mime).not.toMatch(
      /Whip|Klutch|RRG|4111111111111111|spoof@example.test|cached-refresh|cached-access/
    );
    expect(mime.replace(/\r\n/g, "")).not.toContain("\n");
    const base64 =
      /Content-Disposition: attachment;[^\r]+\r\n\r\n([\s\S]*?)\r\n--metrocars_/.exec(
        mime
      )![1];
    for (const line of base64.split("\r\n"))
      expect(line.length).toBeLessThanOrEqual(76);
    expect(Buffer.from(base64.replace(/\r\n/g, ""), "base64")).toEqual(
      packet.pdf
    );
  });
  it("deduplicates identical recipient addresses case-insensitively and emits return subject", async () => {
    await seed();
    http.mockResolvedValueOnce(response({ id: "return-id" }));
    const result = await gmail.sendRentalPacketGmail(
      input({
        renterEmail: "Same@EXAMPLE.test",
        claimEmail: "same@example.test",
        kind: "return",
      })
    );
    expect(result.recipients).toEqual(["Same@example.test"]);
    const mime = sentMime();
    expect(mime).not.toContain("Cc:");
    expect(mime).toContain("Subject: Your Metrocars return packet");
    expect(mime).toContain("Metrocars-return-packet.pdf");
  });
  it("binds deterministic correlation Message-ID to actor and request, not raw request data", async () => {
    await seed();
    await seed(shop.key);
    http.mockImplementation(async () => response({ id: "mock-id" }));
    await gmail.sendRentalPacketGmail(input());
    await gmail.sendRentalPacketGmail(input());
    await gmail.sendRentalPacketGmail(input({ actorKey: shop.key }));
    const id = (i: number) => /Message-ID: ([^\r]+)/.exec(sentMime(i))![1];
    expect(id(0)).toBe(id(1));
    expect(id(0)).not.toBe(id(2));
    expect(id(0)).toBe(
      `<${sha(JSON.stringify([actor.key, "handoff-test-123"]))}@example.test>`
    );
    expect(sentMime()).not.toContain("handoff-test-123");
  });
  it.each([
    "renter@example.test\r\nBcc: thief@example.test",
    "Display <renter@example.test>",
    "renter@example.test,other@example.test",
    "renter@example.test ",
    "a..b@example.test",
    "a@-bad.example.test",
    "bad",
  ])(
    "blocks recipient header injection and invalid addresses %s",
    async email => {
      await seed();
      await expect(
        gmail.sendRentalPacketGmail(input({ renterEmail: email }))
      ).rejects.toThrow(/valid rental email/);
      await expect(
        gmail.sendRentalPacketGmail(input({ claimEmail: email }))
      ).rejects.toThrow(/valid rental email/);
      expect(http).not.toHaveBeenCalled();
    }
  );
  it("requires connected actor, genuine PDF, and safe bounded request id", async () => {
    await expect(gmail.sendRentalPacketGmail(input())).rejects.toThrow(
      /Connect your own Gmail/
    );
    await seed();
    await expect(
      gmail.sendRentalPacketGmail(input({ pdf: Buffer.from("not-pdf") }))
    ).rejects.toThrow(/PDF packet/);
    await expect(
      gmail.sendRentalPacketGmail(input({ requestId: "unsafe\r\nHeader" }))
    ).rejects.toThrow(/valid rental packet/);
    expect(http).not.toHaveBeenCalled();
  });
  it("refreshes expired access, verifies same account, encrypts replacement, and retains new epoch expiry", async () => {
    await seed(actor.key, { expiresAt: clock - 1 });
    const before = store.tokens.get(actor.key)!;
    http
      .mockResolvedValueOnce(
        tokenResponse({
          access_token: "fresh-access",
          refresh_token: "rotated-refresh",
        })
      )
      .mockResolvedValueOnce(identityResponse())
      .mockResolvedValueOnce(response({ id: "fresh-send-id" }));
    await gmail.sendRentalPacketGmail(input());
    const body = http.mock.calls[0][1].body as URLSearchParams;
    expect(body.get("refresh_token")).toBe("cached-refresh");
    expect(body.get("grant_type")).toBe("refresh_token");
    const next = store.tokens.get(actor.key)!;
    expect(next.updatedAt).toBeGreaterThan(before.updatedAt);
    expect(next.tokenPayload).not.toBe(before.tokenPayload);
    expect(decryptRental<any>(next.tokenPayload)).toMatchObject({
      accessToken: "fresh-access",
      refreshToken: "rotated-refresh",
      expiresAt: clock + 3600_000,
    });
    expect(http.mock.calls[2][1].headers.Authorization).toBe(
      "Bearer fresh-access"
    );
    expect(http).toHaveBeenCalledTimes(3);
  });
  it("refreshes near expiry and preserves original refresh token/scope when Google omits them", async () => {
    await seed(actor.key, { expiresAt: clock + 30_000 });
    http
      .mockResolvedValueOnce(
        tokenResponse({ refresh_token: undefined, scope: undefined })
      )
      .mockResolvedValueOnce(identityResponse())
      .mockResolvedValueOnce(response({ id: "fresh-id" }));
    await gmail.sendRentalPacketGmail(input());
    expect(
      decryptRental<any>(store.tokens.get(actor.key)!.tokenPayload).refreshToken
    ).toBe("cached-refresh");
  });
  it("guards refresh against account mismatch and concurrent disconnect or reauthentication", async () => {
    await seed(actor.key, { expiresAt: clock - 1 });
    http
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        identityResponse("other@example.test", "other-sub")
      );
    await expect(gmail.sendRentalPacketGmail(input())).rejects.toThrow(
      /account changed/
    );
    expect(http).toHaveBeenCalledTimes(2);
    http.mockReset();
    store.casAllowed = false;
    http
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(identityResponse());
    await expect(gmail.sendRentalPacketGmail(input())).rejects.toThrow(
      /connection changed/
    );
    expect(http).toHaveBeenCalledTimes(2);
  });
  it("blocks refresh permission loss and invalid expiry without sending", async () => {
    await seed(actor.key, { expiresAt: clock - 1 });
    http.mockResolvedValueOnce(tokenResponse({ scope: "openid email" }));
    await expect(gmail.sendRentalPacketGmail(input())).rejects.toThrow(
      /permissions/
    );
    http.mockReset();
    http.mockResolvedValueOnce(tokenResponse({ expires_in: -1 }));
    await expect(gmail.sendRentalPacketGmail(input())).rejects.toThrow(
      /invalid credentials/
    );
    expect(http).toHaveBeenCalledTimes(1);
  });
  it("does not retry expired/rejected refresh tokens or send with stale access", async () => {
    await seed(actor.key, { expiresAt: clock - 1 });
    http.mockResolvedValueOnce(
      response(
        { error: "invalid_grant", error_description: "mock-refresh PII" },
        400
      )
    );
    await expect(gmail.sendRentalPacketGmail(input())).rejects.toThrow(
      "Rental Gmail authorization was rejected (HTTP 400)."
    );
    expect(http).toHaveBeenCalledTimes(1);
  });
  it.each([401, 403, 429])(
    "rejects Gmail HTTP %s cleanly without provider body disclosure or automatic retries",
    async status => {
      await seed();
      http.mockResolvedValueOnce(
        response(
          {
            id: "must-not-succeed",
            error: { message: "PII token renter@example.test" },
          },
          status
        )
      );
      await expect(gmail.sendRentalPacketGmail(input())).rejects.toThrow(
        `Rental Gmail packet delivery was rejected (HTTP ${status}).`
      );
      expect(http).toHaveBeenCalledTimes(1);
    }
  );
  it.each([{}, { id: "" }, { id: "\r\nPII" }])(
    "marks accepted send without trustworthy provider id as uncertain",
    async result => {
      await seed();
      http.mockResolvedValueOnce(response(result));
      await expect(gmail.sendRentalPacketGmail(input())).rejects.toMatchObject({
        code: "RENTAL_GMAIL_DELIVERY_UNCERTAIN",
        deliveryUncertain: true,
        message: "delivery status uncertain — reconcile before resend",
      });
      expect(http).toHaveBeenCalledTimes(1);
    }
  );
  it("marks network failures, 5xx, and invalid accepted JSON as uncertain, never retries", async () => {
    await seed();
    http.mockRejectedValueOnce(new Error("sensitive network token PII"));
    await expect(gmail.sendRentalPacketGmail(input())).rejects.toBeInstanceOf(
      RentalGmailDeliveryUncertainError
    );
    http.mockResolvedValueOnce(response({ error: "PII" }, 503));
    await expect(gmail.sendRentalPacketGmail(input())).rejects.toThrow(
      /reconcile before resend/
    );
    http.mockResolvedValueOnce(new Response("not-json", { status: 200 }));
    await expect(gmail.sendRentalPacketGmail(input())).rejects.toThrow(
      /reconcile before resend/
    );
    expect(http).toHaveBeenCalledTimes(3);
  });
  it("aborts a send after 15 seconds and marks delivery uncertain", async () => {
    await seed();
    vi.useFakeTimers();
    http.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) =>
          init.signal!.addEventListener("abort", () =>
            reject(new DOMException("aborted PII", "AbortError"))
          )
        )
    );
    const assertion = expect(
      gmail.sendRentalPacketGmail(input())
    ).rejects.toMatchObject({
      deliveryUncertain: true,
      message: "delivery status uncertain — reconcile before resend",
    });
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
    expect(http).toHaveBeenCalledTimes(1);
    expect(http.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it("applies timeout through response-body consumption, not just response headers", async () => {
    await seed();
    vi.useFakeTimers();
    http.mockImplementation(async (_url: string, init: RequestInit) => ({
      ok: true,
      status: 200,
      json: () =>
        new Promise((_resolve, reject) =>
          init.signal!.addEventListener("abort", () =>
            reject(new Error("private body read error"))
          )
        ),
    }));
    const assertion = expect(
      gmail.sendRentalPacketGmail(input())
    ).rejects.toMatchObject({ deliveryUncertain: true });
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
    expect(http).toHaveBeenCalledTimes(1);
  });
  it("does not import paused mail modules or access mail settings/schedules", () => {
    const source = readFileSync(
      new URL("./rentalHandoffGmail.ts", import.meta.url),
      "utf8"
    );
    const imports = source
      .split("\n")
      .filter(line => /^import /.test(line))
      .join("\n");
    expect(imports).not.toMatch(
      /mail\/|ingestGmail|mailSettings|cron|schedule/
    );
    expect(source).not.toMatch(
      /gmail\.readonly|gmail\.modify|gmail\.labels|mail_settings/
    );
    expect(source).toContain('.for("update")');
    expect(source).toContain("Message-ID/X-Idempotency-Key are correlation");
    expect(source).toContain("NOT an exactly-once guarantee");
  });
});
