import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, Field, Select, ErrorNotice, errorMessage } from "./Controls";

/** Admin-only mounting; authorization and credential encryption are enforced server-side. */
export function SharedSenderForm({ refresh }: { refresh: () => Promise<unknown> }) {
  const save = trpc.rentalHandoff.saveSharedSender.useMutation();
  const [domain, setDomain] = useState("mail.whipflow.drivewhip.com");
  const [fromEmail, setFromEmail] = useState("rentals@mail.whipflow.drivewhip.com");
  const [replyToEmail, setReplyToEmail] = useState("claims@drivewhip.com");
  const [apiKey, setApiKey] = useState("");
  const [region, setRegion] = useState<"US" | "EU">("US");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  return (
    <Card title="Shared rental email" detail="Configure Mailgun once for the whole rental workspace. No technician Gmail connection is required.">
      <ErrorNotice message={error} />
      {notice && <p className="r-success" role="status">{notice}</p>}
      <form onSubmit={async event => {
        event.preventDefault();
        setBusy(true); setError(""); setNotice("");
        try {
          await save.mutateAsync({ domain: domain.trim(), fromEmail: fromEmail.trim(), region,
            apiKey: apiKey.trim(), ...(replyToEmail.trim() ? { replyToEmail: replyToEmail.trim() } : {}) });
          setApiKey("");
          await refresh();
          setNotice("Shared sender saved securely. Packets use the renter and claim email recorded on each rental; nothing was sent during setup.");
        } catch (caught) { setError(errorMessage(caught)); }
        finally { setBusy(false); }
      }}>
        <fieldset disabled={busy} className="r-grid">
          <Field label="Verified Mailgun sending domain" required value={domain} onChange={e => setDomain(e.target.value)} autoComplete="off" />
          <Field label="Shared From email" type="email" required value={fromEmail} onChange={e => setFromEmail(e.target.value)} autoComplete="off" />
          <Field label="Reply-to email (optional)" type="email" value={replyToEmail} onChange={e => setReplyToEmail(e.target.value)} autoComplete="off" />
          <Select label="Mailgun region" value={region} onChange={e => setRegion(e.target.value as "US" | "EU")}>
            <option value="US">United States</option><option value="EU">European Union</option>
          </Select>
          <Field label="Mailgun API key" type="password" required value={apiKey} onChange={e => setApiKey(e.target.value)} autoComplete="new-password" />
        </fieldset>
        <p className="r-guidance">The key needs permission to read this domain and send mail. It is encrypted on the server, never returned to technicians, and never printed in a packet. Setup checks the domain without sending a test email. Environment configuration, if present, takes precedence.</p>
        <button type="submit" className="r-button r-primary" disabled={busy || !domain.trim() || !fromEmail.trim() || !apiKey.trim()}>
          {busy ? "Checking shared sender…" : "Save shared email settings"}
        </button>
      </form>
    </Card>
  );
}
