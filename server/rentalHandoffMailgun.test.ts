import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createRentalSenderMailgun, RentalMailgunDeliveryUncertainError, RENTAL_MAILGUN_MAX_PDF_BYTES, type RentalPacketMailgunInput, type RentalMailgunSharedConfig } from "./rentalHandoffMailgun";

const KEY = "mock-mailgun-key-never-live";
const FROM = "rentals@example.test";
const DOMAIN = "mg.example.test";
const ready = () => new Response(JSON.stringify({ domain: { name: DOMAIN, state: "active", is_disabled: false, type: "custom" } }), { status: 200 });
const accepted = () => new Response(JSON.stringify({ id: "<mock-provider@example.test>", message: "Queued. Thank you." }), { status: 200 });
const saved: RentalMailgunSharedConfig = { apiKey: KEY, domain: DOMAIN, fromEmail: FROM, region: "US" };
let env: NodeJS.ProcessEnv;
let http: ReturnType<typeof vi.fn<typeof fetch>>;
let loadSaved: ReturnType<typeof vi.fn<() => Promise<RentalMailgunSharedConfig | null>>>;
let mailgun: ReturnType<typeof createRentalSenderMailgun>;
function input(extra: Partial<RentalPacketMailgunInput> = {}): RentalPacketMailgunInput {
  return { actorKey: "shop:1", renterEmail: "renter@example.test", claimEmail: "claim@example.test", pdf: Buffer.from("%PDF-1.7\nimmutable-private-test\n%%EOF"), kind: "handoff", requestId: "rental-test-123", ...extra };
}
beforeEach(() => {
  env = { MAILGUN_API_KEY: KEY, MAILGUN_DOMAIN: DOMAIN, MAILGUN_FROM_EMAIL: FROM };
  http = vi.fn<typeof fetch>();
  loadSaved = vi.fn(async () => null);
  mailgun = createRentalSenderMailgun({ http, env: () => env, loadSaved });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("central Mailgun sender readiness", () => {
  it("does not fake readiness or call provider with absent configuration", async () => {
    env = {};
    expect(await mailgun.rentalSenderStatus("shop:1")).toEqual({ configured: false, connected: false, email: null, provider: "mailgun" });
    await expect(mailgun.sendRentalPacketMailgun(input())).rejects.toThrow(/configuration/);
    expect(http).not.toHaveBeenCalled();
  });
  it("validates key and active custom domain using GET only, with identical sender for all actors", async () => {
    http.mockImplementation(async () => ready());
    for (const actor of ["shop:1", "native:1", "native:2", "untrusted-selector@example.test"])
      expect(await mailgun.rentalSenderStatus(actor)).toEqual({ configured: true, connected: true, email: FROM, provider: "mailgun" });
    expect(loadSaved).not.toHaveBeenCalled();
    for (const [url, options] of http.mock.calls) {
      expect(url).toBe(`https://api.mailgun.net/v4/domains/${DOMAIN}`);
      expect(options?.method).toBeUndefined();
      expect(options?.redirect).toBe("error");
      expect((options?.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from(`api:${KEY}`).toString("base64")}`);
    }
    expect(JSON.stringify(await mailgun.rentalSenderStatus())).not.toContain(KEY);
  });
  it.each([401, 403, 404, 429, 500])("fails closed on domain lookup HTTP %s", async status => {
    http.mockResolvedValue(new Response("provider secret text", { status }));
    expect(await mailgun.rentalSenderStatus()).toEqual({ configured: true, connected: false, email: FROM, provider: "mailgun" });
  });
  it.each([
    { name: DOMAIN, state: "unverified", is_disabled: false, type: "custom" },
    { name: DOMAIN, state: "active", is_disabled: true, type: "custom" },
    { name: DOMAIN, state: "active", is_disabled: false, type: "sandbox" },
    { name: "other.example.test", state: "active", is_disabled: false, type: "custom" },
    { name: DOMAIN, state: "active", type: "custom" },
  ])("rejects unknown, unverified, disabled, sandbox and mismatched domains", async domain => {
    http.mockResolvedValue(new Response(JSON.stringify({ domain })));
    expect((await mailgun.rentalSenderStatus()).connected).toBe(false);
  });
  it("fails closed on invalid or oversized lookup and does not disclose provider data", async () => {
    for (const response of [new Response("invalid"), new Response("{}", { headers: { "content-length": "999999" } }), new Response("x".repeat(65537))]) {
      http.mockResolvedValueOnce(response);
      expect((await mailgun.rentalSenderStatus()).connected).toBe(false);
    }
    http.mockRejectedValue(new Error(`private provider detail ${KEY}`));
    expect((await mailgun.rentalSenderStatus()).connected).toBe(false);
  });
  it.each(["https://api.eu.mailgun.net", "https://api.eu.mailgun.net/", "https://api.mailgun.net/"])("uses allowed region %s", async base => {
    env.MAILGUN_BASE_URL = base; http.mockResolvedValue(ready());
    expect((await mailgun.rentalSenderStatus()).connected).toBe(true);
    expect(http.mock.calls[0][0]).toBe(`${base.replace(/\/$/, "")}/v4/domains/${DOMAIN}`);
  });
  it.each(["http://api.mailgun.net", "https://evil.example.test", "https://api.mailgun.net.evil.test", "https://api.mailgun.net:443", "https://api.mailgun.net/v3", "https://api.mailgun.net?x=1", "https://api.mailgun.net#x", "https://user:pass@api.mailgun.net", "https://api.au.mailgun.net"])("rejects unsafe base URL %s without calling HTTP", async base => {
    env.MAILGUN_BASE_URL = base;
    expect((await mailgun.rentalSenderStatus()).configured).toBe(false); expect(http).not.toHaveBeenCalled();
  });
  it.each([
    { MAILGUN_API_KEY: "unsafe\r\nKey" }, { MAILGUN_DOMAIN: "mg.example.test/path" }, { MAILGUN_FROM_EMAIL: "unrelated@other.test" }, { MAILGUN_FROM_EMAIL: "Name <rentals@example.test>" }, { MAILGUN_REPLY_TO_EMAIL: "claims@example.test\r\nBcc:evil@example.test" },
  ])("rejects unsafe environment configuration %j", async change => {
    Object.assign(env, change);
    expect((await mailgun.rentalSenderStatus()).configured).toBe(false); expect(http).not.toHaveBeenCalled();
  });
  it("loads persisted config only when no environment overrides exist", async () => {
    env = {}; loadSaved.mockResolvedValue(saved); http.mockResolvedValue(ready());
    expect((await mailgun.rentalSenderStatus()).connected).toBe(true);
    expect(loadSaved).toHaveBeenCalledTimes(1);
    env = { MAILGUN_API_KEY: "partial-invalid-override" };
    expect((await mailgun.rentalSenderStatus()).configured).toBe(false);
    expect(loadSaved).toHaveBeenCalledTimes(1);
  });
  it("fails closed if saved credentials cannot be decrypted or have invalid region", async () => {
    env = {}; loadSaved.mockRejectedValueOnce(new Error("ciphertext"));
    expect((await mailgun.rentalSenderStatus()).configured).toBe(false);
    loadSaved.mockResolvedValueOnce({ ...saved, region: "AU" as any });
    expect((await mailgun.rentalSenderStatus()).configured).toBe(false); expect(http).not.toHaveBeenCalled();
  });
  it("verifies config to save by read-only request without leaking key in public status", async () => {
    http.mockResolvedValue(ready());
    const result = await mailgun.verifyRentalSharedSenderConfig({ ...saved, replyToEmail: "shared@example.test" });
    expect(result.config).toEqual({ ...saved, replyToEmail: "shared@example.test" });
    expect(result.status).toEqual({ configured: true, connected: true, email: FROM, provider: "mailgun" });
    expect(JSON.stringify(result.status)).not.toContain(KEY);
    expect(http).toHaveBeenCalledTimes(1); expect(http.mock.calls[0][1]?.method).toBeUndefined();
    http.mockResolvedValue(new Response("private rejection", { status: 401 }));
    await expect(mailgun.verifyRentalSharedSenderConfig(saved)).rejects.toThrow(/verification failed/);
  });
});

describe("Mailgun immutable PDF multipart submission", () => {
  it("sends real binary PDF to renter and claim only using configured From/shared Reply-To", async () => {
    env.MAILGUN_REPLY_TO_EMAIL = "shared-replies@example.test";
    let captured: Buffer | undefined;
    http.mockResolvedValueOnce(ready()).mockImplementationOnce(async (_url, options) => { captured = Buffer.from(options!.body as Uint8Array); return accepted(); });
    const packet = input(); const original = Buffer.from(packet.pdf);
    (packet as any).senderEmail = "spoof@evil.test"; (packet as any).bcc = "extra@evil.test";
    expect(await mailgun.sendRentalPacketMailgun(packet)).toEqual({ providerId: "<mock-provider@example.test>", senderEmail: FROM });
    const [url, options] = http.mock.calls[1];
    expect(url).toBe(`https://api.mailgun.net/v3/${DOMAIN}/messages`); expect(options?.method).toBe("POST"); expect(options?.redirect).toBe("error");
    const headers = options?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toMatch(/^multipart\/form-data; boundary=rental-[a-f0-9]{48}$/);
    expect(headers).not.toHaveProperty("Idempotency-Key");
    const text = captured!.toString("utf8");
    expect(text).toContain(`Metrocars Leasing Corp. <${FROM}>`);
    expect(text).toContain('name="to"\r\n\r\nrenter@example.test');
    expect(text).toContain('name="cc"\r\n\r\nclaim@example.test');
    expect(text).toContain('name="h:Reply-To"\r\n\r\nshared-replies@example.test');
    expect(text).toContain('name="attachment"; filename="metrocars-rental-packet.pdf"\r\nContent-Type: application/pdf');
    expect(text).toContain('name="o:tracking"\r\n\r\nno');
    expect(captured!.includes(original)).toBe(true);
    expect(text).not.toMatch(/spoof@|extra@|name="bcc"|personaltechnician|rental-test-123|mock-mailgun-key/);
    expect(packet.pdf).toEqual(original); // Helper owns/wipes copies, service wipes original.
    expect(Buffer.from(options!.body as Uint8Array).every(b => b === 0)).toBe(true);
  });
  it("uses the same account for shop/claims, omits duplicate claim and supports return filename", async () => {
    const captured: string[] = [];
    http.mockImplementation(async (_url, options) => { if (options?.method === "POST") { captured.push(Buffer.from(options.body as Uint8Array).toString()); return accepted(); } return ready(); });
    for (const actorKey of ["shop:1", "native:2"]) await mailgun.sendRentalPacketMailgun(input({ actorKey, renterEmail: "renter@example.test", claimEmail: "RENTER@example.test", kind: "return" }));
    for (const text of captured) { expect(text).toContain(FROM); expect(text).toContain("metrocars-rental-return.pdf"); expect(text).not.toContain('name="cc"'); expect(text).not.toContain('name="h:Reply-To"'); }
  });
  it.each(["person@example.test\r\nBcc:other@example.test", "person@example.test,other@example.test", "Name <person@example.test>", " x@example.test", "a..b@example.test", "person@bad..test", "a".repeat(65) + "@example.test"])("rejects unsafe addresses %s before HTTP", async email => {
    await expect(mailgun.sendRentalPacketMailgun(input({ renterEmail: email }))).rejects.toThrow(/valid rental email/);
    await expect(mailgun.sendRentalPacketMailgun(input({ claimEmail: email }))).rejects.toThrow(/valid rental email/);
    expect(http).not.toHaveBeenCalled();
  });
  it("rejects empty/non-PDF/oversize attachments, unsafe request IDs and unsupported packet kind", async () => {
    for (const pdf of [Buffer.alloc(0), Buffer.from("not-pdf"), Buffer.alloc(RENTAL_MAILGUN_MAX_PDF_BYTES + 1)]) await expect(mailgun.sendRentalPacketMailgun(input({ pdf }))).rejects.toThrow(/PDF/);
    await expect(mailgun.sendRentalPacketMailgun(input({ requestId: "unsafe\r\nHeader" }))).rejects.toThrow(/request ID/);
    await expect(mailgun.sendRentalPacketMailgun(input({ kind: "other" as any }))).rejects.toThrow(/kind/);
    expect(http).not.toHaveBeenCalled();
  });
  it("does not submit when domain readiness fails", async () => {
    http.mockResolvedValue(new Response("bad key", { status: 401 }));
    await expect(mailgun.sendRentalPacketMailgun(input())).rejects.toThrow(/not ready/);
    expect(http).toHaveBeenCalledTimes(1); expect(http.mock.calls[0][1]?.method).toBeUndefined();
  });
  it.each([400, 401, 403, 404, 413, 420, 429])("records HTTP %s as explicit rejection without provider-body disclosure or retries", async status => {
    http.mockResolvedValueOnce(ready()).mockResolvedValueOnce(new Response(`secret ${KEY}`, { status }));
    await expect(mailgun.sendRentalPacketMailgun(input())).rejects.toThrow(`Email provider rejected rental packet (HTTP ${status}).`);
    expect(http).toHaveBeenCalledTimes(2);
  });
  it.each([408, 500, 502, 503, 302, 201])("marks HTTP %s after submission uncertain and never retries", async status => {
    http.mockResolvedValueOnce(ready()).mockResolvedValueOnce(new Response("secret", { status }));
    await expect(mailgun.sendRentalPacketMailgun(input())).rejects.toMatchObject({ deliveryUncertain: true, code: "RENTAL_MAILGUN_DELIVERY_UNCERTAIN", message: "delivery status uncertain — reconcile before resend" });
    expect(http).toHaveBeenCalledTimes(2);
  });
  it.each(["invalid JSON", "{}", '{"id":null}', '{"id":""}', '{"id":"bad\\r\\nheader"}', JSON.stringify({ id: "x".repeat(121) })])("marks malformed acceptance response uncertain", async body => {
    http.mockResolvedValueOnce(ready()).mockResolvedValueOnce(new Response(body));
    await expect(mailgun.sendRentalPacketMailgun(input())).rejects.toBeInstanceOf(RentalMailgunDeliveryUncertainError);
  });
  it("marks network failure and oversized acceptance uncertain, wiping request bytes", async () => {
    for (const response of [new Error(`private ${KEY}`), new Response("{}", { headers: { "content-length": "999999" } }), new Response("x".repeat(65537))]) {
      http.mockResolvedValueOnce(ready());
      if (response instanceof Error) http.mockRejectedValueOnce(response); else http.mockResolvedValueOnce(response);
      await expect(mailgun.sendRentalPacketMailgun(input())).rejects.toMatchObject({ deliveryUncertain: true });
      expect(Buffer.from(http.mock.calls.at(-1)![1]!.body as Uint8Array).every(b => b === 0)).toBe(true);
    }
  });
  it("passes a 15-second abort signal for send, with uncertainty on abort", async () => {
    http.mockResolvedValueOnce(ready()).mockImplementationOnce(async (_url, options) => {
      expect(options?.signal).toBeInstanceOf(AbortSignal);
      throw new DOMException("The operation was aborted", "TimeoutError");
    });
    await expect(mailgun.sendRentalPacketMailgun(input())).rejects.toMatchObject({ deliveryUncertain: true });
    expect(http).toHaveBeenCalledTimes(2);
  });
  it("has no OAuth, inbox, log, card processing or unrestricted request recipient path", async () => {
    const source = readFileSync(new URL("./rentalHandoffMailgun.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/console\.|gmail|resend\.com|ingestGmail|mailSettings|cron|schedule|PAN|CVV/i);
    expect(source).toContain('const SEND_TIMEOUT_MS = 15_000');
    vi.stubGlobal("window", {});
    await expect(mailgun.rentalSenderStatus()).rejects.toThrow(/server-only/);
  });
});
