import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
const mockAuth = vi.hoisted(() => vi.fn());
vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: mockAuth } }));
vi.mock("./rentalReminders", () => ({ rentalReminderService: {} }));
import { registerRentalRemindersApi } from "./rentalRemindersApi";
const paths: Record<string, Function> = {};
const service = { sweep: vi.fn(), processProviderEvent: vi.fn() };
function response() { const res = { code: 200, body: undefined as any, status(n: number) { this.code = n; return this; }, json(body: any) { this.body = body; return this; } }; return res; }
beforeEach(() => { vi.clearAllMocks(); registerRentalRemindersApi({ post: (path: string, handler: Function) => { paths[path] = handler; } } as any, service as any); });
describe("Rental reminders HTTP boundaries", () => {
  it("rejects missing authentication without processing or 5xx retry", async () => {
    mockAuth.mockRejectedValue(new Error("Invalid session")); const res = response(); await paths["/api/scheduled/rentalAppointmentReminders"]({ body: {}, headers: {} }, res); expect(res.code).toBe(401); expect(service.sweep).not.toHaveBeenCalled();
  });
  it("rejects ordinary admins and missing cron task identity", async () => {
    for (const user of [{ role: "admin" }, { isCron: true }]) { mockAuth.mockResolvedValue(user); const res = response(); await paths["/api/scheduled/rentalAppointmentReminders"]({ body: { taskUid: "forged" } }, res); expect(res.code).toBe(403); } expect(service.sweep).not.toHaveBeenCalled();
  });
  it("uses verified cron identity, never request-body task ownership", async () => {
    mockAuth.mockResolvedValue({ isCron: true, taskUid: "owned-task" }); service.sweep.mockResolvedValue({ examined: 0, accepted: 0 }); const res = response(); await paths["/api/scheduled/rentalAppointmentReminders"]({ body: { taskUid: "forged" } }, res); expect(service.sweep).toHaveBeenCalledWith("owned-task"); expect(res.body).toMatchObject({ ok: true, examined: 0 });
  });
  it("returns structured failure context without exposing raw credentials or mobile data", async () => {
    mockAuth.mockResolvedValue({ isCron: true, taskUid: "owned-task" }); service.sweep.mockRejectedValue(new Error("private secret")); const res = response(); await paths["/api/scheduled/rentalAppointmentReminders"]({ body: {} }, res); expect(res.code).toBe(500); expect(res.body.context.taskUid).toBe("owned-task"); expect(JSON.stringify(res.body)).not.toContain("private secret");
  });
  it("rejects oversized webhooks before parsing the provider event", async () => {
    const res = response(); await paths["/api/rental-handoff/sms/textline/webhook/:secret"]({ headers: { "content-length": "100001" }, body: {} }, res); expect(res.code).toBe(413); expect(service.processProviderEvent).not.toHaveBeenCalled();
  });
  it("rejects invalid provider tokens cleanly without exposing provider errors", async () => {
    service.processProviderEvent.mockRejectedValue(new TRPCError({ code: "UNAUTHORIZED", message: "bad token" })); const res = response(); await paths["/api/rental-handoff/sms/textline/webhook/:secret"]({ headers: {}, params: { secret: "private-secret" }, body: {} }, res); expect(res.code).toBe(401); expect(res.body).toEqual({ error: "rental_sms_webhook_rejected" });
  });
});
