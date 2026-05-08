import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

/**
 * Installs global window.onerror + unhandledrejection listeners.
 * Call once at the app root. Silently posts errors to the backend.
 */
export function useErrorReporter() {
  const { user } = useAuth();
  const reportMutation = trpc.errors.report.useMutation();
  // Keep a stable ref so event listeners always see the latest user/mutation
  const stateRef = useRef({ user, reportMutation });
  stateRef.current = { user, reportMutation };

  useEffect(() => {
    function sendError(message: string, stack?: string) {
      const { user, reportMutation } = stateRef.current;
      // Deduplicate: skip if same message was sent in last 5 s
      const key = `err_dedup_${btoa(message.slice(0, 80))}`;
      const last = Number(sessionStorage.getItem(key) ?? 0);
      if (Date.now() - last < 5000) return;
      sessionStorage.setItem(key, String(Date.now()));

      reportMutation.mutate({
        message: message.slice(0, 2000),
        stack: stack?.slice(0, 10000),
        url: window.location.href.slice(0, 1024),
        route: window.location.pathname.slice(0, 512),
        userAgent: navigator.userAgent.slice(0, 512),
        userId: user?.id,
        userName: user?.name ?? undefined,
        userEmail: user?.email ?? undefined,
      });
    }

    const onError = (event: ErrorEvent) => {
      sendError(event.message ?? "Unknown error", event.error?.stack);
    };

    const onUnhandled = (event: PromiseRejectionEvent) => {
      const msg =
        event.reason instanceof Error
          ? event.reason.message
          : String(event.reason ?? "Unhandled promise rejection");
      const stack =
        event.reason instanceof Error ? event.reason.stack : undefined;
      sendError(msg, stack);
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandled);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandled);
    };
  }, []); // intentionally empty — stateRef keeps it fresh
}

/** Call this from an ErrorBoundary to report caught React render errors */
export function reportCaughtError(
  error: Error,
  user?: { id?: number; name?: string | null; email?: string | null } | null
) {
  // Fire-and-forget fetch so it works even when tRPC client isn't available
  fetch("/api/trpc/errors.report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      json: {
        message: error.message.slice(0, 2000),
        stack: error.stack?.slice(0, 10000),
        url: window.location.href.slice(0, 1024),
        route: window.location.pathname.slice(0, 512),
        userAgent: navigator.userAgent.slice(0, 512),
        userId: user?.id,
        userName: user?.name ?? undefined,
        userEmail: user?.email ?? undefined,
      },
    }),
  }).catch(() => {/* silent */});
}
