import { trpc } from "@/lib/trpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { useMemo } from "react";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import "./index.css";

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
 * tRPC provider using cookie-based Manus OAuth sessions.
 * No Bearer token needed — the session cookie is sent automatically via credentials: "include".
 */
function TrpcProvider({ children }: { children: React.ReactNode }) {
  const trpcClient = useMemo(
    () =>
      trpc.createClient({
        links: [
          httpBatchLink({
            url: "/api/trpc",
            transformer: superjson,
            fetch(input, init) {
              return globalThis.fetch(input, {
                ...(init ?? {}),
                credentials: "include",
              });
            },
          }),
        ],
      }),
    []
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
  <TrpcProvider>
    <App />
  </TrpcProvider>
);
