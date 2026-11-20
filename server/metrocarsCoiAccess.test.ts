import { describe, expect, it, vi } from "vitest";
vi.mock("./_core/env", () => ({ ENV: { ownerOpenId: "SYNTHETIC_NATIVE_OWNER" } }));
import { kbRouter } from "./routers/kb";
const owner = { id: 123, openId: "SYNTHETIC_NATIVE_OWNER", role: "admin", name: "Jasmine Lane Acosta" };
function caller(user: any = owner, headers: Record<string, any> = {}) {
  return kbRouter.createCaller({ user, req: { headers }, res: {} } as any);
}
describe("original MetroCars COI native-owner access", () => {
  it("grants only exact authenticated native owner access without data or document writes", async () => {
    expect(await caller().certificateAccess()).toEqual({ viewerId: owner.id, canUseOriginalMetroCarsCoi: true });
    expect(await caller().originalMetroCarsCoiAccess()).toEqual({ viewerId: owner.id, allowed: true });
  });
  it.each([
    { ...owner, id: 124, openId: "OTHER_ADMIN" },
    { ...owner, role: "user" },
    { ...owner, openId: "" },
    { ...owner, openId: "OTHER_USER", role: "user", email: "jasminea@drivewhip.com" },
    { ...owner, isImpersonating: true },
    { ...owner, impersonating: true },
  ])("rejects other admins, forged matching display details and preview identities", async user => {
    expect((await caller(user).certificateAccess()).canUseOriginalMetroCarsCoi).toBe(false);
    await expect(caller(user).originalMetroCarsCoiAccess()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it.each(["", "2", "not-a-handler"])("denies every impersonation header including empty/malformed values", async header => {
    const client = caller(owner, { "x-impersonate-handler-id": header });
    expect((await client.certificateAccess()).canUseOriginalMetroCarsCoi).toBe(false);
    await expect(client.originalMetroCarsCoiAccess()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("requires login and does not infer access from a submitted owner name or ID", async () => {
    await expect(caller(null).certificateAccess()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller(null).originalMetroCarsCoiAccess()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
