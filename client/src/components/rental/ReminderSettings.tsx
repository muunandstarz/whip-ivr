import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, Check, ErrorNotice, Field, errorMessage } from "./Controls";

export function ReminderSettings() {
  const status = trpc.rentalHandoff.reminderConfig.useQuery(undefined, { retry: false });
  const save = trpc.rentalHandoff.saveReminderConfig.useMutation();
  const [department, setDepartment] = useState("");
  const [webhooksConfirmed, setWebhooksConfirmed] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (status.data) { setDepartment(status.data.textlineDepartmentUuid || ""); setEnabled(status.data.enabled); setWebhooksConfirmed(status.data.textlineWebhooksConfirmed); } }, [status.data]);
  return <Card title="Appointment SMS setup" detail="One shared Textline SMS department sends the two appointment reminders. Text conversations remain in Textline; technicians do not connect personal phones.">
    <ErrorNotice message={error || status.error?.message} />
    {status.data && <>
      <p><strong>{status.data.ready ? "SMS ready" : "SMS not active"}</strong> · Textline access token {status.data.credentialsConfigured ? "available" : "missing"} · Authenticated opt-out webhooks {status.data.webhookConfigured ? "configured" : "not configured"} · Schedule {status.data.scheduleCronTaskUid ? "registered" : "not registered yet"}</p>
      <p className="r-guidance">{status.data.senderNotice}</p>
      {status.data.textlineDepartmentVerified && <p>Verified Textline department: {status.data.textlineDepartmentName} · {status.data.textlineSenderPhone}</p>}
      <p className="r-guidance">The shared access token, private callback credential and native Textline signing secret are installed securely on the server, not in rental records or browser responses. In Textline, configure POST New Customer Post and Customer Updated webhooks to the private HTTPS callback, then confirm setup. The callback verifies Textline's timestamped event signature when its signing secret is installed. This form verifies department details with GET only; no test text is sent.</p>
      <form onSubmit={async e => {
        e.preventDefault(); setError("");
        try { await save.mutateAsync({ enabled, textlineDepartmentUuid: department.trim() || null, textlineWebhooksConfirmed: webhooksConfirmed, scheduleCronTaskUid: status.data!.scheduleCronTaskUid }); await status.refetch(); }
        catch (e) { setError(errorMessage(e)); }
      }}>
        <fieldset disabled={save.isPending}>
          <Field label="Textline SMS department UUID" value={department} onChange={e => setDepartment(e.target.value)} hint="Select the actual shared SMS department from Textline. The server verifies the exact UUID, SMS capability, and sender phone using Department Details." />
          <Field label="Dedicated Textline webhook path template" readOnly value="/api/rental-handoff/sms/textline/webhook/<TEXTLINE_WEBHOOK_SECRET>" hint="Use the deployed site's HTTPS origin. Replace the placeholder privately in Textline's target URL, never paste the real secret into this app or logs." />
          <Check label="I configured both Textline New Customer Post and Customer Updated POST webhooks to this integration's secret-bearing HTTPS target URL." checked={webhooksConfirmed} onChange={setWebhooksConfirmed} />
          <Check label="Enable customer appointment SMS" checked={enabled} onChange={setEnabled} />
          <button type="submit" className="r-button r-primary">{save.isPending ? "Checking & saving…" : "Verify Textline department & save SMS settings"}</button>
        </fieldset>
      </form>
      <p className="r-guidance">Consent is optional and collected per customer's current mobile number. Existing Textline contact consent must also be true; this app never records provider consent or resubscribes a blocked contact. STOP suppresses future reminders across rentals. Textline acceptance does not confirm delivery. Uncertain sends are never automatically retried.</p>
    </>}
  </Card>;
}
