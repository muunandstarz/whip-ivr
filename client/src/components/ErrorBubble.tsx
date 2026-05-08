import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Bug, X, CheckCircle, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

/**
 * Floating error bubble — admin-only.
 * Shows unresolved error count. Click to open a drawer with full details.
 */
export function ErrorBubble() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [includeResolved, setIncludeResolved] = useState(false);

  const utils = trpc.useUtils();

  const { data: countData } = trpc.errors.unresolvedCount.useQuery(undefined, {
    refetchInterval: 30_000,
    enabled: user?.role === "admin",
  });

  const { data: listData, isLoading } = trpc.errors.list.useQuery(
    { includeResolved, limit: 50, offset: 0 },
    { enabled: open && user?.role === "admin" }
  );

  const resolveMutation = trpc.errors.resolve.useMutation({
    onSuccess: () => {
      utils.errors.unresolvedCount.invalidate();
      utils.errors.list.invalidate();
    },
  });

  if (user?.role !== "admin") return null;

  const count = countData?.count ?? 0;

  return (
    <>
      {/* Floating bubble */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-3 py-2 rounded-full shadow-lg
          bg-[#171b31] text-white text-sm font-medium hover:bg-[#1e2340] transition-colors"
        title="Error reports"
      >
        <Bug className="w-4 h-4" />
        {count > 0 && (
          <Badge className="bg-red-500 text-white text-xs px-1.5 py-0 min-w-[20px] h-5 flex items-center justify-center rounded-full">
            {count > 99 ? "99+" : count}
          </Badge>
        )}
        {count === 0 && <span className="text-xs opacity-70">Errors</span>}
      </button>

      {/* Drawer overlay */}
      {open && (
        <div className="fixed inset-0 z-40 flex justify-end" onClick={() => setOpen(false)}>
          <div
            className="relative w-full max-w-xl h-full bg-background border-l border-border shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Bug className="w-5 h-5 text-red-500" />
                <h2 className="font-semibold text-base">Error Reports</h2>
                {count > 0 && (
                  <Badge variant="destructive" className="text-xs">{count} unresolved</Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    utils.errors.list.invalidate();
                    utils.errors.unresolvedCount.invalidate();
                  }}
                  className="p-1.5 rounded hover:bg-muted transition-colors"
                  title="Refresh"
                >
                  <RefreshCw className="w-4 h-4 text-muted-foreground" />
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded hover:bg-muted transition-colors"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* Filter toggle */}
            <div className="flex items-center gap-2 px-5 py-2 border-b border-border bg-muted/30">
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeResolved}
                  onChange={(e) => setIncludeResolved(e.target.checked)}
                  className="rounded"
                />
                Show resolved
              </label>
              <span className="ml-auto text-xs text-muted-foreground">
                {listData?.total ?? 0} total
              </span>
            </div>

            {/* Error list */}
            <ScrollArea className="flex-1">
              {isLoading && (
                <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                  Loading…
                </div>
              )}
              {!isLoading && (!listData?.rows || listData.rows.length === 0) && (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <CheckCircle className="w-10 h-10 mb-3 text-green-500" />
                  <p className="text-sm font-medium">No errors to show</p>
                  <p className="text-xs mt-1">All clear{includeResolved ? "" : " — no unresolved errors"}.</p>
                </div>
              )}
              {listData?.rows?.map((err) => (
                <div
                  key={err.id}
                  className={`border-b border-border px-5 py-4 ${err.resolvedAt ? "opacity-50" : ""}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Message */}
                      <p className="text-sm font-medium text-foreground break-words leading-snug">
                        {err.message}
                      </p>
                      {/* Meta row */}
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-xs text-muted-foreground">
                        {err.route && <span>📍 {err.route}</span>}
                        {err.userName && <span>👤 {err.userName}</span>}
                        {err.userEmail && !err.userName && <span>👤 {err.userEmail}</span>}
                        <span>🕐 {new Date(err.createdAt).toLocaleString()}</span>
                        {err.resolvedAt && (
                          <span className="text-green-600">✓ Resolved by {err.resolvedBy}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!err.resolvedAt && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs px-2"
                          onClick={() => resolveMutation.mutate({ id: err.id })}
                          disabled={resolveMutation.isPending}
                        >
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Resolve
                        </Button>
                      )}
                      <button
                        className="p-1 rounded hover:bg-muted transition-colors"
                        onClick={() => setExpandedId(expandedId === err.id ? null : err.id)}
                      >
                        {expandedId === err.id
                          ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                          : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded stack trace */}
                  {expandedId === err.id && err.stack && (
                    <div className="mt-3 p-3 rounded bg-muted overflow-auto max-h-48">
                      <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-all font-mono leading-relaxed">
                        {err.stack}
                      </pre>
                    </div>
                  )}
                  {expandedId === err.id && err.url && (
                    <div className="mt-2 text-xs text-muted-foreground break-all">
                      <span className="font-medium">URL: </span>{err.url}
                    </div>
                  )}
                  {expandedId === err.id && err.userAgent && (
                    <div className="mt-1 text-xs text-muted-foreground break-all">
                      <span className="font-medium">UA: </span>{err.userAgent}
                    </div>
                  )}
                </div>
              ))}
            </ScrollArea>
          </div>
        </div>
      )}
    </>
  );
}
