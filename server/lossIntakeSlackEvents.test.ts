import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { Request, Response } from "express";
import { ENV } from "./_core/env";
import {
  slackLossIntakeEventsHandler,
  verifySlackRequestSignature,
} from "./lossIntakeSlackEvents";

const SIGNING_SECRET = "test-signing-secret";
const NOW_SECONDS = 1_750_000_000;

function signature(rawBody: Buffer, timestamp = NOW_SECONDS) {
  const base = `v0:${timestamp}:${rawBody.toString("utf8")}`;
  return `v0=${createHmac("sha256", SIGNING_SECRET).update(base).digest("hex")}`;
}

function mockResponse() {
  const state: { status?: number; body?: unknown } = {};
  const response = {
    status(code: number) {
      state.status = code;
      return response;
    },
    json(body: unknown) {
      state.body = body;
      return response;
    },
  } as unknown as Response;
  return { response, state };
}

describe("Slack request signature verification", () => {
  it("accepts a correctly signed raw body within the replay window", () => {
    const rawBody = Buffer.from('{"type":"event_callback"}', "utf8");
    expect(verifySlackRequestSignature({
      signingSecret: SIGNING_SECRET,
      timestamp: String(NOW_SECONDS),
      signature: signature(rawBody),
      rawBody,
      nowSeconds: NOW_SECONDS,
    })).toEqual({ ok: true, status: 200 });
  });

  it("rejects an invalid signature", () => {
    const rawBody = Buffer.from('{"type":"event_callback"}', "utf8");
    const result = verifySlackRequestSignature({
      signingSecret: SIGNING_SECRET,
      timestamp: String(NOW_SECONDS),
      signature: "v0=invalid",
      rawBody,
      nowSeconds: NOW_SECONDS,
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });

  it("rejects requests older than five minutes", () => {
    const rawBody = Buffer.from("{}", "utf8");
    const timestamp = NOW_SECONDS - 301;
    const result = verifySlackRequestSignature({
      signingSecret: SIGNING_SECRET,
      timestamp: String(timestamp),
      signature: signature(rawBody, timestamp),
      rawBody,
      nowSeconds: NOW_SECONDS,
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });

  it("returns service unavailable when the signing secret is missing", () => {
    const result = verifySlackRequestSignature({
      signingSecret: "",
      timestamp: String(NOW_SECONDS),
      signature: "v0=unused",
      rawBody: Buffer.from("{}", "utf8"),
      nowSeconds: NOW_SECONDS,
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(503);
  });
});

describe("Slack URL verification", () => {
  const originalSecret = ENV.slackSigningSecret;

  afterEach(() => {
    ENV.slackSigningSecret = originalSecret;
  });

  it("echoes the challenge only after signature and installation validation", () => {
    ENV.slackSigningSecret = SIGNING_SECRET;
    const payload = {
      type: "url_verification",
      challenge: "challenge-token",
      team_id: "TFFUXNU57",
      api_app_id: "A0BHDG7RX7D",
    };
    const rawBody = Buffer.from(JSON.stringify(payload), "utf8");
    const timestamp = Math.floor(Date.now() / 1_000);
    const request = {
      body: rawBody,
      get(name: string) {
        if (name.toLowerCase() === "x-slack-request-timestamp") return String(timestamp);
        if (name.toLowerCase() === "x-slack-signature") {
          const base = `v0:${timestamp}:${rawBody.toString("utf8")}`;
          return `v0=${createHmac("sha256", SIGNING_SECRET).update(base).digest("hex")}`;
        }
        return undefined;
      },
    } as unknown as Request;
    const { response, state } = mockResponse();

    slackLossIntakeEventsHandler(request, response);

    expect(state.status).toBe(200);
    expect(state.body).toEqual({ challenge: "challenge-token" });
  });
});
