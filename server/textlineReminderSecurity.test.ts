import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { verifyTextlineEventSignature } from "./rentalReminders";
import { createTextlineReminderProvider } from "./textlineReminderProvider";

const now = Date.parse("2026-11-12T15:00:00Z");
const secret = "fictional-signing-secret";
const time = String(Math.floor(now / 1000));
const type = "new_customer_post";
const auth = { time, type, signature: createHash("sha256").update(type + time + secret).digest("hex") };

describe("Native Textline webhook authentication", () => {
  it("matches the documented type + timestamp + secret SHA256 contract", () => {
    expect(verifyTextlineEventSignature(secret, auth, now)).toBe(true);
  });
  it("rejects a missing, wrong or malformed signature, secret, timestamp and type", () => {
    for (const patch of [{ signature: undefined }, { signature: "0".repeat(64) }, { signature: "bad" }, { time: "NaN" }, { type: "customer_updated" }]) {
      expect(verifyTextlineEventSignature(secret, { ...auth, ...patch }, now)).toBe(false);
    }
    expect(verifyTextlineEventSignature("wrong-secret", auth, now)).toBe(false);
    expect(verifyTextlineEventSignature(secret, undefined, now)).toBe(false);
  });
  it("rejects stale and future replay metadata beyond the bounded tolerance", () => {
    expect(verifyTextlineEventSignature(secret, auth, now + 601_000)).toBe(false);
    expect(verifyTextlineEventSignature(secret, auth, now - 601_000)).toBe(false);
    expect(verifyTextlineEventSignature(secret, auth, now + 600_000)).toBe(true);
  });
});

describe("Server-only Textline credential source", () => {
  it("accepts an injected encrypted-config credential without exposing it in metadata", async () => {
    const uuid = "6ee65b7c-27af-4bf7-9f67-c58a6e1c3021";
    const request = vi.fn(async () => new Response(JSON.stringify({ departments: [{ uuid, type: "sms", is_sms_group: true, phone_number: "(240) 428-6084", name: "Claims" }] }), { status: 200 }));
    const provider = createTextlineReminderProvider(request as any, () => "fictional-server-only-token");
    expect(provider.configured()).toBe(true);
    const result = await provider.department(uuid);
    expect(result).toEqual({ verified: true, name: "Claims", senderPhone: "+12404286084" });
    expect(JSON.stringify(result)).not.toContain("fictional-server-only-token");
    expect(request.mock.calls[0]).toMatchObject(["https://application.textline.com/api/groups.json", { headers: { "X-TGP-ACCESS-TOKEN": "fictional-server-only-token" } }]);
  });
});
