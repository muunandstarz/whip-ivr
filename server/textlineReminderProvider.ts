import { normalizeReminderPhone } from "../shared/rentalReminders";

export type ReminderProviderCode = "provider_credentials_missing" | "provider_rejected" | "provider_rate_limited" | "provider_uncertain" | "department_unavailable" | "provider_customer_blocked" | "provider_customer_unreachable" | "provider_consent_required" | "provider_customer_unavailable" | "provider_department_mismatch";
export class RentalReminderProviderError extends Error {
  constructor(readonly code: ReminderProviderCode, readonly uncertain = false) { super(code); }
}
export type TextlineDepartment = { verified: boolean; name: string | null; senderPhone: string | null };
export interface RentalReminderProvider {
  configured(): boolean;
  department(uuid: string): Promise<TextlineDepartment>;
  send(departmentUuid: string, to: string, body: string): Promise<{ providerId: string; conversationUuid?: string; customerUuid?: string }>;
}
export const textlineUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** Exact contracts: reference.textline.com/source.yaml v1.3.0 (2026-09-18).
 * No login/passwords, provider consent writes, automatic resubscription, or retries.
 * The documented department API has SMS type/capability, not carrier registration state.
 */
export function createTextlineReminderProvider(request: typeof fetch = fetch, accessToken: () => string | undefined = () => process.env.TEXTLINE_ACCESS_TOKEN): RentalReminderProvider {
  function headers() {
    const token = accessToken()?.trim();
    if (!token) throw new RentalReminderProviderError("provider_credentials_missing");
    return { "X-TGP-ACCESS-TOKEN": token, "Content-Type": "application/json" };
  }
  async function get(path: string, missing?: ReminderProviderCode): Promise<any> {
    const auth = headers();
    try {
      const response = await request(`https://application.textline.com${path}`, { method: "GET", headers: auth, signal: AbortSignal.timeout(8000), redirect: "error" });
      if (response.status === 404 && missing) return null;
      if (!response.ok) throw new RentalReminderProviderError(response.status === 429 ? "provider_rate_limited" : missing || "department_unavailable");
      return await response.json();
    } catch (error) {
      if (error instanceof RentalReminderProviderError) throw error;
      throw new RentalReminderProviderError(missing || "department_unavailable");
    }
  }
  async function department(uuid: string): Promise<TextlineDepartment> {
    if (!textlineUuid(uuid)) throw new RentalReminderProviderError("provider_rejected");
    const result = await get("/api/groups.json");
    const departments = Array.isArray(result) ? result : result?.departments;
    const matches = Array.isArray(departments) ? departments.filter((d: any) => d?.uuid === uuid) : [];
    const selected = matches.length === 1 ? matches[0] : null;
    const senderPhone = normalizeReminderPhone(selected?.phone_number);
    const verified = Boolean(selected && selected.type === "sms" && selected.is_sms_group === true && senderPhone && typeof selected.name === "string" && selected.name.trim());
    return { verified, name: verified ? selected.name.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 160) : null, senderPhone: verified ? senderPhone : null };
  }
  function customerSafe(customer: any, to: string): string {
    if (!textlineUuid(customer?.uuid) || normalizeReminderPhone(customer?.phone_number) !== to || typeof customer?.blocked !== "boolean") throw new RentalReminderProviderError("provider_customer_unavailable");
    if (customer.blocked || customer.archived === true) throw new RentalReminderProviderError("provider_customer_blocked");
    if (customer.reachable_by_sms !== true || customer.reachable === false) throw new RentalReminderProviderError("provider_customer_unreachable");
    // Conservative native-consent policy: no absent/null/false consent may be promoted.
    // Rental appointment consent remains independent and is not imported into Textline.
    if (customer.consent_status !== true) throw new RentalReminderProviderError("provider_consent_required");
    return customer.uuid;
  }
  return {
    configured: () => Boolean(accessToken()?.trim()),
    department,
    async send(departmentUuid, to, body) {
      const auth = headers(); // Missing credentials never becomes an uncertain send.
      if (!textlineUuid(departmentUuid) || normalizeReminderPhone(to) !== to || !body || body.length > 1600) throw new RentalReminderProviderError("provider_rejected");
      if (!(await department(departmentUuid)).verified) throw new RentalReminderProviderError("provider_department_mismatch");
      const contact = await get(`/api/customers.json?${new URLSearchParams({ phone_number: to })}`, "provider_customer_unavailable");
      const customerUuid = customerSafe(contact?.customer, to);
      const lookup = await get(`/api/conversations.json?${new URLSearchParams({ phone_number: to, group_uuid: departmentUuid, page_size: "1" })}`, "provider_customer_unavailable");
      const conversation = lookup?.conversation;
      let conversationUuid: string | null = null;
      if (conversation !== null && conversation !== undefined) {
        if (!textlineUuid(conversation.uuid) || customerSafe(conversation.customer, to) !== customerUuid || (lookup.group && lookup.group.uuid !== departmentUuid)) throw new RentalReminderProviderError("provider_department_mismatch");
        conversationUuid = conversation.uuid;
      } else if (lookup !== null && (!lookup || !Object.prototype.hasOwnProperty.call(lookup, "conversation"))) {
        // A malformed successful lookup is not evidence that no conversation exists.
        throw new RentalReminderProviderError("provider_customer_unavailable");
      }
      const endpoint = conversationUuid ? `/api/conversation/${conversationUuid}.json` : "/api/conversations.json";
      const payload = conversationUuid ? { comment: { body } } : { phone_number: to, group_uuid: departmentUuid, comment: { body } };
      try {
        const response = await request(`https://application.textline.com${endpoint}`, { method: "POST", headers: auth, body: JSON.stringify(payload), signal: AbortSignal.timeout(8000), redirect: "error" });
        if (!response.ok) {
          if (response.status >= 500 || response.status === 408) throw new RentalReminderProviderError("provider_uncertain", true);
          throw new RentalReminderProviderError(response.status === 429 ? "provider_rate_limited" : "provider_rejected");
        }
        const result = await response.json();
        // Existing-conversation docs omit post in their schema: absent post UUID is
        // uncertain, never an excuse to issue the message again or invent delivery.
        if (result?.group?.uuid !== departmentUuid || !textlineUuid(result?.post?.uuid) || !textlineUuid(result?.conversation?.uuid) || result.post.conversation_uuid !== result.conversation.uuid || (conversationUuid && result.conversation.uuid !== conversationUuid) || result.post.is_whisper !== false || result.post.message_type !== "SMS" || normalizeReminderPhone(result.conversation.customer?.phone_number) !== to || result.conversation.customer?.uuid !== customerUuid) throw new RentalReminderProviderError("provider_uncertain", true);
        return { providerId: result.post.uuid, conversationUuid: result.conversation.uuid, customerUuid };
      } catch (error) {
        if (error instanceof RentalReminderProviderError) throw error;
        throw new RentalReminderProviderError("provider_uncertain", true);
      }
    },
  };
}
