import { describe, it, expect } from "vitest";
import { shouldProcessRecentVoicemail } from "./aircallSync";
import { isDuplicateAircallIntakeError } from "./aircall";

describe("Aircall API credentials", () => {
  it("AIRCALL_API_ID is set in the environment", () => {
    expect(process.env.AIRCALL_API_ID).toBeTruthy();
  });

  it("AIRCALL_API_TOKEN is set in the environment", () => {
    expect(process.env.AIRCALL_API_TOKEN).toBeTruthy();
  });

  it("Aircall API responds 200 with the credentials", async () => {
    const id = process.env.AIRCALL_API_ID!;
    const token = process.env.AIRCALL_API_TOKEN!;
    const auth = "Basic " + Buffer.from(`${id}:${token}`).toString("base64");
    const res = await fetch("https://api.aircall.io/v1/users?per_page=1", {
      headers: { Authorization: auth },
    });
    expect(res.status).toBe(200);
  }, 10000);
});

describe("bounded Claims-line voicemail recovery eligibility", () => {
  it("includes inbound voicemail media but excludes ordinary and outbound calls", () => {
    expect(shouldProcessRecentVoicemail({ direction: "inbound", voicemail: "https://example.test/voicemail.mp3" })).toBe(true);
    expect(shouldProcessRecentVoicemail({ direction: "inbound", voicemail: null })).toBe(false);
    expect(shouldProcessRecentVoicemail({ direction: "outbound", voicemail: "https://example.test/voicemail.mp3" })).toBe(false);
  });
});

describe("voicemail intake duplicate recovery", () => {
  it("recognizes the unique Aircall intake constraint after a concurrent insert", () => {
    expect(isDuplicateAircallIntakeError(new Error("Duplicate entry '4115218103' for key 'intake_records.uq_intake_aircall_call_id'"))).toBe(true);
    expect(isDuplicateAircallIntakeError(new Error("Database unavailable"))).toBe(false);
  });
});
