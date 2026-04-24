import { trpc } from "@/lib/trpc";
import { ClerkProvider, useAuth as useClerkAuth } from "@clerk/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import "./index.css";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;

// QueryClient is stable — created once outside any component
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: unknown) => {
        // Don't retry on auth errors
        if ((error as { data?: { code?: string } })?.data?.code === "UNAUTHORIZED") return false;
        return failureCount < 2;
      },
    },
  },
});

/**
 * Inner component that has access to Clerk's useAuth hook.
 * Memoizes the tRPC client so it's only recreated when getToken reference changes.
 */
function TrpcProvider({ children }: { children: React.ReactNode }) {
  const { getToken } = useClerkAuth();

  // Keep a stable ref to getToken so the client doesn't recreate on every render
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const trpcClient = useMemo(
    () =>
      trpc.createClient({
        links: [
          httpBatchLink({
            url: "/api/trpc",
            transformer: superjson,
            async headers() {
              const token = await getTokenRef.current();
              return token ? { Authorization: `Bearer ${token}` } : {};
            },
            fetch(input, init) {
              return globalThis.fetch(input, {
                ...(init ?? {}),
                credentials: "include",
              });
            },
          }),
        ],
      }),
    [] // only create once — getToken is accessed via ref
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}

createRoot(document.getElementById("root")!).render(
  <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
    <TrpcProvider>
      <App />
    </TrpcProvider>
  </ClerkProvider>
);
