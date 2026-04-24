import { describe, it, expect } from "vitest";

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
