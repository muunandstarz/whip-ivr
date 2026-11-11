import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, Check, ErrorNotice, errorMessage } from "./Controls";
import type { RentalActor } from "@shared/rentalHandoff";

export function AppointmentReminders({ id, actor, beforeSave }: { id: number; actor: RentalActor; beforeSave: () => Promise<unknown> }) {
  const query = trpc.rentalHandoff.reminders.useQuery({ id }, { retry: false });
  const config = trpc.rentalHandoff.reminderConfig.useQuery(undefined, { retry: false });
  const save = trpc.rentalHandoff.saveReminders.useMutation();
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const data = query.data;
  const canEdit = actor.role !== "shop";
  const apply = async (enabled: boolean, canceled: boolean) => {
    setBusy(true); setError("");
    try { await beforeSave(); await save.mutateAsync({ id, settings: { enabled, canceled, confirmedConsent: consent } }); await query.refetch(); setConsent(false); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  return <Card title="Appointment text reminders" detail="Remind the customer about dropping off their vehicle and picking up a rental at the selected Total Recon location.">
    <ErrorNotice message={error || query.error?.message || config.error?.message} />
    {config.data && !config.data.ready && <p className="r-guidance" role="status">Live SMS is not active. A verified Textline SMS department, server access token, and authenticated opt-out webhooks are required in Rental Settings. Appointment consent can be recorded now; existing native Textline contact consent is also required before sending. No message is sent by saving this form.</p>}
    {!data ? <p>Loading reminder details…</p> : <>
      <p><strong>{data.suppressed ? "Customer opted out — reminders blocked" : data.subscription.canceled ? "Appointment canceled — reminders stopped" : data.eligible ? "Customer opted in" : "Reminders off / consent needed"}</strong></p>
      {!data.phoneValid && <p className="r-guidance">Enter the customer's valid US or Canada mobile number in Renter & claim before enabling texts.</p>}
      {!data.preview && <p className="r-guidance">Save the appointment date/time and a location with its actual address and phone to preview the text.</p>}
      {data.slots.length > 0 && <ul className="r-missing">{data.slots.map(slot => <li key={slot.kind}><strong>{slot.kind === "24h" ? "Day before (24 hours)" : "Appointment day (2 hours before)"}</strong> · {new Date(slot.dueAt).toLocaleString()} {slot.expired ? "· Window passed — no late catch-up" : ""}</li>)}</ul>}
      {data.preview && <div className="r-callout"><div><strong>Customer message preview</strong><p style={{ overflowWrap: "anywhere" }}>{data.preview}</p></div></div>}
      {canEdit && <>
        {!data.eligible && !data.suppressed && <Check label="Customer expressly agrees to receive up to two automated appointment reminder texts at this mobile number. Consent is optional, not a condition of rental; message/data rates may apply. Reply STOP to opt out, or call the location for help." checked={consent} disabled={busy} onChange={setConsent} />}
        <div className="r-actions">
          {!data.eligible && !data.suppressed && <button type="button" className="r-button r-primary" disabled={busy || !consent || !data.phoneValid || !data.preview} onClick={() => void apply(true, false)}>{busy ? "Saving…" : "Save consent & enable reminders"}</button>}
          {data.subscription.enabled && <button type="button" className="r-button" disabled={busy} onClick={() => void apply(false, false)}>Turn reminders off</button>}
          {!data.subscription.canceled && <button type="button" className="r-button" disabled={busy} onClick={() => { if (window.confirm("Cancel this appointment and stop its reminders? No rental record or signed document will be deleted.")) void apply(false, true); }}>Cancel appointment / stop reminders</button>}
          <button type="button" className="r-button" disabled={busy} onClick={async () => { setBusy(true); try { await beforeSave(); await query.refetch(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } }}>Refresh saved appointment preview</button>
        </div>
      </>}
      <p className="r-guidance">Reminders are scheduled 24 hours and 2 hours before pickup. A maximum 15-minute dispatch grace accommodates scheduler delays; older windows are skipped, never sent as a backlog. Changing the saved appointment or location updates the next texts; changing the mobile number requires fresh consent. No documents, claim numbers or payment details are texted.</p>
      {data.logs.length > 0 && <div className="r-record-list">{data.logs.map(log => <p key={log.id}>{log.kind === "24h" ? "Day-before" : "Two-hour"} reminder · <strong>{log.state === "accepted" ? "Accepted by provider — delivery unconfirmed" : log.state}</strong> · {new Date(log.updatedAt).toLocaleString()}{log.errorCode ? ` · ${log.errorCode}` : ""}</p>)}</div>}
    </>}
  </Card>;
}
