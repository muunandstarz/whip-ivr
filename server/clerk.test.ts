import { describe, it, expect } from "vitest";

describe("Clerk API key validation", () => {
  it("CLERK_SECRET_KEY is set in the environment", () => {
    expect(process.env.CLERK_SECRET_KEY).toBeDefined();
    expect(process.env.CLERK_SECRET_KEY?.startsWith("sk_")).toBe(true);
  });

  it("VITE_CLERK_PUBLISHABLE_KEY is set in the environment", () => {
    expect(process.env.VITE_CLERK_PUBLISHABLE_KEY).toBeDefined();
    expect(process.env.VITE_CLERK_PUBLISHABLE_KEY?.startsWith("pk_")).toBe(true);
  });

  it("Clerk API responds 200 with the secret key", async () => {
    const res = await fetch("https://api.clerk.com/v1/users?limit=1", {
      headers: {
        Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
      },
    });
    expect(res.status).toBe(200);
  });
});
