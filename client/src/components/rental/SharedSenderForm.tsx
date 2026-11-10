import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, Check, ErrorNotice, errorMessage } from "./Controls";

type SharedSender = { connected: boolean; email?: string | null; configured?: boolean };

/** Mounted only for rental administrators; backend enforces the same role. */
export function SharedSenderForm({ refresh, sender }: { refresh: () => Promise<unknown>; sender?: SharedSender }) {
  const connect = trpc.rentalHandoff.connectSharedGmail.useMutation();
  const disconnect = trpc.rentalHandoff.disconnectSharedGmail.useMutation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(() => new URLSearchParams(window.location.search).get("gmail") === "error" ? "The shared Gmail connection was not completed. Check the Google setup instructions below, then connect again as the same rental administrator." : "");
  const [notice, setNotice] = useState(() => new URLSearchParams(window.location.search).get("gmail") === "connected" && sender?.connected ? "Shared Gmail connected. No email was sent during setup." : "");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const connected = sender?.connected === true;

  return (
    <Card title="Shared rental Gmail" detail="Connect one Gmail account for the whole rental workspace. Technicians do not connect their own accounts.">
      <ErrorNotice message={error} />
      {notice && <p className="r-success" role="status">{notice}</p>}
      <p className="r-guidance">
        {connected ? <>Connected shared sender: <strong>{sender?.email || "Gmail account"}</strong>.</> : "No shared Gmail account is connected yet."}
        {" "}Completed packets go to the renter and the claim email saved on that rental. Connecting an account does not send a test email or enable inbox processing.
      </p>
      <div className="r-actions">
        <button type="button" className="r-button r-primary" disabled={busy} onClick={async () => {
          setBusy(true); setError(""); setNotice("");
          try {
            const result = await connect.mutateAsync();
            const target = new URL(result.url);
            if (target.protocol !== "https:" || target.hostname !== "accounts.google.com") throw new Error("Google authorization could not be opened. Try again from rental Settings.");
            window.location.assign(target.toString());
          } catch (caught) { setError(errorMessage(caught)); setBusy(false); }
        }}>{busy ? "Please wait…" : connected ? "Change shared Gmail account" : "Connect shared Gmail"}</button>
        <button type="button" className="r-button" disabled={busy} onClick={async () => {
          setBusy(true); setError("");
          try { await refresh(); setNotice("Connection status refreshed. Nothing was sent."); }
          catch (caught) { setError(errorMessage(caught)); }
          finally { setBusy(false); }
        }}>Refresh connection status</button>
      </div>
      {connected && <div className="r-guidance">
        <Check label="I want to disconnect the shared sender for every technician." checked={confirmDisconnect} onChange={setConfirmDisconnect} disabled={busy} />
        <button type="button" className="r-button" disabled={busy || !confirmDisconnect} onClick={async () => {
          setBusy(true); setError(""); setNotice("");
          try {
            await disconnect.mutateAsync(); setConfirmDisconnect(false); await refresh();
            setNotice("Shared Gmail disconnected. Rental records and PDFs were not changed.");
          } catch (caught) { setError(errorMessage(caught)); }
          finally { setBusy(false); }
        }}>Disconnect shared Gmail</button>
      </div>}
      <details className="r-guidance">
        <summary>If Google blocks the connection</summary>
        <p>A Google Cloud administrator must register this exact Authorized redirect URI on the app's existing Gmail OAuth client:</p>
        <p style={{ overflowWrap: "anywhere" }}>https://whipclaimsivr.com/api/rental-handoff/gmail/callback</p>
        <p>Keep every existing redirect entry. Then use Connect shared Gmail and select the mailbox that should send rental packets. This connection requests send-only access and account identity, not inbox access.</p>
      </details>
    </Card>
  );
}
