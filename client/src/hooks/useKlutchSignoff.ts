import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { trpc } from "@/lib/trpc";

export const KLUTCH_SIGNOFF_UNAVAILABLE = "The approved Klutch sign-off is unavailable. Reload the shared sign-off before preparing or issuing documents.";

/** Shared attribution is never derived from the logged-in or impersonated handler. */
export function useKlutchSignoff(enabled = true) {
  const { user, loading } = useAuth();
  const { impersonating } = useImpersonation();
  const utils = trpc.useUtils();
  const authenticated = enabled && !loading && Boolean(user);
  const identityKey = JSON.stringify([user?.id ?? null, user?.role ?? null, impersonating?.id ?? null]);
  const currentIdentity = useRef(identityKey);
  currentIdentity.current = identityKey;
  const [verifiedIdentity, setVerifiedIdentity] = useState<string | null>(null);
  const query = trpc.klutchPolicies.signoff.useQuery(undefined, {
    enabled: authenticated,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    retry: false,
  });

  // A cached owner capability must never survive an identity or preview change.
  useEffect(() => {
    let cancelled = false;
    setVerifiedIdentity(null);
    if (authenticated) {
      void utils.klutchPolicies.signoff.invalidate().then(() => {
        if (!cancelled) setVerifiedIdentity(identityKey);
      }).catch(() => { /* Remain unverified if the refresh failed. */ });
    }
    return () => { cancelled = true; };
  }, [authenticated, identityKey, utils]);

  const approved = query.data?.signoff;
  const ready = authenticated && verifiedIdentity === identityKey && !query.isFetching && !query.isError
    && Boolean(approved?.name?.trim() && approved?.title?.trim() && approved.revision !== undefined);
  const signoff = ready ? approved : undefined;

  async function requireApprovedSignoff() {
    if (!ready) throw new Error(KLUTCH_SIGNOFF_UNAVAILABLE);
    const requestedIdentity = identityKey;
    const result = await query.refetch();
    const fresh = result.data?.signoff;
    if (currentIdentity.current !== requestedIdentity || result.error || !fresh?.name?.trim() || !fresh?.title?.trim() || fresh.revision === undefined) {
      throw new Error(KLUTCH_SIGNOFF_UNAVAILABLE);
    }
    return fresh;
  }

  return {
    signoff,
    ready,
    canEdit: ready && query.data?.canEdit === true,
    error: query.error,
    identityKey,
    revision: approved?.revision,
    requireApprovedSignoff,
    refetch: query.refetch,
  };
}

/** Apply after fresh initialization, restored drafts, and resets; ignore draft attribution. */
export function normalizeKlutchDocumentSignoff<T extends { handlerName: string; handlerTitle: string }>(
  form: T,
  signoff: { name: string; title: string } | undefined,
): T {
  return { ...form, handlerName: signoff?.name ?? "", handlerTitle: signoff?.title ?? "" };
}
