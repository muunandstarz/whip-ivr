import { useState } from "react";
import { Mail, Unplug } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { ErrorNotice, errorMessage } from "./Controls";
import type { RentalSession } from "./types";
export function Sender({
  session,
  refresh,
}: {
  session: RentalSession;
  refresh: () => Promise<unknown>;
}) {
  const connect = trpc.rentalHandoff.connectSender.useMutation();
  const disconnect = trpc.rentalHandoff.disconnectSender.useMutation();
  const [error, setError] = useState("");
  const query = new URLSearchParams(window.location.search);
  const callbackError =
    query.get("gmail") === "failed"
      ? "Gmail connection failed. Reconnect and ask an administrator to verify the authorized OAuth callback URI."
      : query.get("gmailError") || query.get("senderError");
  return (
    <>
      <div className="r-gmail-bar">
        <Mail size={18} className="r-teal" />
        <p>
          {session.sender?.connected ? (
            <>
              <strong>Sending from {session.sender.email}</strong>
              <br />
              <small>
                Connected to your individual Gmail account. Packets go to the
                renter and the claim-specific email.
              </small>
            </>
          ) : (
            <>
              <strong>Connect your Gmail to send rental packets</strong>
              <br />
              <small>
                Send-only access; this rental connection does not read or import
                your inbox.
              </small>
            </>
          )}
        </p>
        <button
          type="button"
          className="r-button"
          disabled={connect.isPending || disconnect.isPending}
          onClick={async () => {
            setError("");
            try {
              const result = await connect.mutateAsync();
              window.location.assign(result.url);
            } catch (e) {
              setError(errorMessage(e));
            }
          }}
        >
          {connect.isPending
            ? "Connecting…"
            : session.sender?.connected
              ? "Change Gmail account"
              : "Connect Gmail"}
        </button>
        {session.sender?.connected && (
          <button
            type="button"
            className="r-icon-button"
            aria-label="Disconnect Gmail sender"
            disabled={connect.isPending || disconnect.isPending}
            onClick={async () => {
              if (
                !window.confirm(
                  "Disconnect your Gmail sender? Packet delivery will be blocked until you reconnect."
                )
              )
                return;
              setError("");
              try {
                await disconnect.mutateAsync();
                await refresh();
              } catch (e) {
                setError(errorMessage(e));
              }
            }}
          >
            <Unplug size={18} />
          </button>
        )}
      </div>
      <ErrorNotice message={error || callbackError} />
      {(session.sender?.configured === false ||
        /oauth|configure|redirect|callback/i.test(
          error || callbackError || ""
        )) && (
        <p className="r-guidance">
          Deployment administrator: configure Google OAuth credentials on the
          server and register this authorized redirect URI in Google Cloud
          Console:{" "}
          <code>
            {window.location.origin}/api/rental-handoff/gmail/callback
          </code>
          . Never enter a client secret here.
        </p>
      )}
    </>
  );
}
