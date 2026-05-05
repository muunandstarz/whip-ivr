import { useState, useEffect } from "react";
import WhipLayout from "@/components/WhipLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Users,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  PhoneCall,
  ChevronsDownUp,
  ChevronsUpDown,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

function CalledBackButton({ intakeId }: { intakeId: number }) {
  const utils = trpc.useUtils();
  const mutation = trpc.handlerActions.calledBack.useMutation({
    onSuccess: () => {
      toast.success("Marked as called back", { description: `Record #${intakeId} updated.` });
      utils.intake.list.invalidate();
    },
    onError: () => {
      toast.error("Error", { description: "Could not mark as called back." });
    },
  });
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 text-xs gap-1 bg-green-500/15 border-green-300 text-green-700 dark:text-green-400 hover:bg-green-500/25"
      disabled={mutation.isPending}
      onClick={(e) => {
        e.stopPropagation();
        mutation.mutate({ intakeId });
      }}
    >
      <PhoneCall className="h-3 w-3" />
      {mutation.isPending ? "Saving…" : "Called Back"}
    </Button>
  );
}

const HANDLER_COLORS: Record<string, string> = {
  "Natashia Edulan":    "bg-blue-500/15 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-500/30",
  "Jayla Bernard":      "bg-purple-500/15 text-purple-800 dark:text-purple-300 border-purple-300 dark:border-purple-500/30",
  "Carlito Legarde Jr": "bg-green-500/15 text-green-800 dark:text-green-300 border-green-300 dark:border-green-500/30",
  "Annie Ortiz":        "bg-pink-500/15 text-pink-800 dark:text-pink-300 border-pink-300 dark:border-pink-500/30",
  "Lorraine Tria":      "bg-yellow-500/15 text-yellow-800 dark:text-yellow-300 border-yellow-300 dark:border-yellow-500/30",
  "Jovel Villa":        "bg-orange-500/15 text-orange-800 dark:text-orange-300 border-orange-300 dark:border-orange-500/30",
  "Mary Joy Badua":     "bg-teal-500/15 text-teal-800 dark:text-teal-300 border-teal-300 dark:border-teal-500/30",
  "Daryl Ochate":       "bg-indigo-500/15 text-indigo-800 dark:text-indigo-300 border-indigo-300 dark:border-indigo-500/30",
  "Madeline Green":     "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/30",
  "Demily Flores":      "bg-rose-500/15 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-500/30",
  "Ana Padilla":        "bg-rose-500/15 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-500/30",
  "Catherine Cestina":  "bg-cyan-500/15 text-cyan-800 dark:text-cyan-300 border-cyan-300 dark:border-cyan-500/30",
  "Unassigned":         "bg-muted text-muted-foreground border-border",
};

const PRIORITY_CONFIG: Record<string, { label: string; className: string }> = {
  urgent: { label: "Urgent", className: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-300 dark:border-red-500/30" },
  high:   { label: "High",   className: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-500/30" },
  normal: { label: "Normal", className: "bg-muted text-muted-foreground border-border" },
};

const CALLER_TYPE_LABELS: Record<string, string> = {
  carrier:          "Carrier",
  law_office:       "Law Office",
  medical_provider: "Medical",
  member:           "Member",
  claimant:         "Claimant",
  police:           "Police",
  unknown:          "Unknown",
};

export default function HandlerQueue() {
  const [expandedHandlers, setExpandedHandlers] = useState<Set<string>>(new Set<string>());
  const [initialized, setInitialized] = useState(false);

  const { data: handlersData } = trpc.handlers.list.useQuery();
  const { data: teamCbStats } = trpc.handlerMetrics.callbackStats.useQuery({});
  // Build a quick lookup: handlerName -> completed count (last 30 days)
  const completedByHandler: Record<string, { completed: number; today: number }> = {};
  for (const h of teamCbStats?.byHandler ?? []) {
    completedByHandler[h.handlerName] = { completed: h.completed, today: h.today };
  }
  const handlerIdMap = Object.fromEntries(
    (handlersData ?? []).map((h: { id: number; name: string }) => [h.name, h.id])
  );

  const { data, isLoading } = trpc.intake.list.useQuery({
    status: "open",
    limit: 200,
    offset: 0,
  });

  const toggleHandler = (name: string) => {
    setExpandedHandlers((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // Group records by handler
  type IntakeRecordItem = NonNullable<typeof data>["records"][number];
  const byHandler: Record<string, IntakeRecordItem[]> = {};
  if (data?.records && Array.isArray(data.records)) {
    for (const record of data.records) {
      const handler = record.handlerName || "Unassigned";
      if (!byHandler[handler]) byHandler[handler] = [];
      byHandler[handler].push(record);
    }
  }

  // Auto-expand all handlers once data loads
  useEffect(() => {
    if (!initialized && data?.records && data.records.length > 0) {
      const allHandlers = new Set<string>(
        data.records.map((r) => r.handlerName || "Unassigned")
      );
      setExpandedHandlers(allHandlers);
      setInitialized(true);
    }
  }, [data, initialized]);

  // Sort: handlers with urgent/high records first, then by queue size
  const sortedHandlers = Object.entries(byHandler).sort(([, a], [, b]) => {
    const urgentA = a.filter((r) => r.priority === "urgent").length;
    const urgentB = b.filter((r) => r.priority === "urgent").length;
    if (urgentB !== urgentA) return urgentB - urgentA;
    const highA = a.filter((r) => r.priority === "high").length;
    const highB = b.filter((r) => r.priority === "high").length;
    if (highB !== highA) return highB - highA;
    return b.length - a.length;
  });

  const allHandlerNames = sortedHandlers.map(([name]) => name);
  const allExpanded = allHandlerNames.length > 0 && allHandlerNames.every((n) => expandedHandlers.has(n));
  const allCollapsed = allHandlerNames.length === 0 || allHandlerNames.every((n) => !expandedHandlers.has(n));

  const expandAll = () => setExpandedHandlers(new Set(allHandlerNames));
  const collapseAll = () => setExpandedHandlers(new Set());

  const totalOpen = data?.total ?? 0;
  const urgentCount = data?.records?.filter((r) => r.priority === "urgent").length ?? 0;
  const highCount = data?.records?.filter((r) => r.priority === "high").length ?? 0;

  return (
    <WhipLayout>
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Handler Queue</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Open intake records grouped by assigned handler — urgent and high priority shown first
            </p>
          </div>
          {/* Expand / Collapse All */}
          {sortedHandlers.length > 0 && (
            <div className="flex items-center gap-2 flex-shrink-0 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={expandAll}
                disabled={allExpanded}
              >
                <ChevronsUpDown className="w-3.5 h-3.5" />
                Expand All
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={collapseAll}
                disabled={allCollapsed}
              >
                <ChevronsDownUp className="w-3.5 h-3.5" />
                Collapse All
              </Button>
            </div>
          )}
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-foreground">{totalOpen}</div>
                  <div className="text-xs text-muted-foreground">Open Records</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-red-500/15 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-foreground">{urgentCount}</div>
                  <div className="text-xs text-muted-foreground">Urgent</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-orange-500/15 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4 text-orange-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-foreground">{highCount}</div>
                  <div className="text-xs text-muted-foreground">High Priority</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-500/15 flex items-center justify-center">
                  <Users className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-foreground">{sortedHandlers.length}</div>
                  <div className="text-xs text-muted-foreground">Active Handlers</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Handler queues */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="border rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-muted animate-pulse" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-4 w-36 bg-muted rounded animate-pulse" />
                    <div className="h-3 w-20 bg-muted rounded animate-pulse" />
                  </div>
                  <div className="h-6 w-16 bg-muted rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : sortedHandlers.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">All queues are clear! No open records.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {sortedHandlers.map(([handlerName, records]) => {
              const isExpanded = expandedHandlers.has(handlerName);
              const urgentInQueue = records.filter((r) => r.priority === "urgent").length;
              const highInQueue = records.filter((r) => r.priority === "high").length;
              const colorClass = HANDLER_COLORS[handlerName] ?? "bg-gray-100 text-gray-800 border-gray-200";
              const initials = handlerName
                .split(" ")
                .slice(0, 2)
                .map((n) => n[0])
                .join("");

              return (
                <Card key={handlerName} className="overflow-hidden">
                  {/* Handler header */}
                  <button
                    className="w-full text-left"
                    onClick={() => toggleHandler(handlerName)}
                  >
                    <div className="flex items-center gap-4 px-5 py-4 hover:bg-muted/20 transition-colors">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border flex-shrink-0 ${colorClass}`}>
                        {initials}
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-foreground">{handlerName}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
                          <span>{records.length} open record{records.length !== 1 ? "s" : ""}</span>
                          {completedByHandler[handlerName]?.completed != null && (
                            <span className="text-emerald-600 font-medium">• {completedByHandler[handlerName].completed} completed (30d)</span>
                          )}
                          {urgentInQueue > 0 && (
                            <span className="text-red-600 font-medium">• {urgentInQueue} urgent</span>
                          )}
                          {highInQueue > 0 && (
                            <span className="text-orange-600 font-medium">• {highInQueue} high priority</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {urgentInQueue > 0 && (
                          <Badge className="text-xs bg-red-500/15 text-red-700 dark:text-red-400 border-red-300 dark:border-red-500/30 border">
                            {urgentInQueue} urgent
                          </Badge>
                        )}
                        {highInQueue > 0 && (
                          <Badge className="text-xs bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-500/30 border">
                            {highInQueue} high
                          </Badge>
                        )}
                        <Badge variant="outline" className={`text-xs ${colorClass}`}>
                          {records.length}
                        </Badge>
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Profile link */}
                  {handlerIdMap[handlerName] && (
                    <div className="px-5 pb-2 -mt-1 border-t bg-muted/10">
                      <Link
                        href={`/handlers/${handlerIdMap[handlerName]}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-[#ff6221] hover:underline"
                      >
                        View Profile &amp; QA Scorecards →
                      </Link>
                    </div>
                  )}

                  {/* Records list */}
                  {isExpanded && (
                    <div className="border-t">
                      {records
                        .sort((a, b) => {
                          const pOrder: Record<string, number> = { urgent: 0, high: 1, normal: 2 };
                          return (pOrder[a.priority ?? "normal"] ?? 2) - (pOrder[b.priority ?? "normal"] ?? 2);
                        })
                        .map((record, idx) => {
                          const priorityCfg = PRIORITY_CONFIG[record.priority ?? "normal"] ?? PRIORITY_CONFIG.normal;
                          return (
                            <div
                              key={record.id}
                              className={`flex items-center gap-4 px-5 py-3 hover:bg-muted/10 transition-colors ${
                                idx < records.length - 1 ? "border-b" : ""
                              }`}
                            >
                              {/* Priority indicator stripe */}
                              <div className={`w-1 h-10 rounded-full flex-shrink-0 ${
                                record.priority === "urgent" ? "bg-red-400" :
                                record.priority === "high" ? "bg-orange-400" :
                                "bg-muted-foreground/30"
                              }`} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-sm text-foreground">
                                    {record.callerName || record.callerPhone || "Unknown"}
                                  </span>
                                  {record.callerOrg && (
                                    <span className="text-xs text-muted-foreground">— {record.callerOrg}</span>
                                  )}
                                  <Badge variant="outline" className={`text-xs ${priorityCfg.className}`}>
                                    {priorityCfg.label}
                                  </Badge>
                                  {record.isRepeatCaller && (
                                    <Badge variant="outline" className="text-xs border-red-300 text-red-600 dark:text-red-400 bg-red-500/15">
                                      Repeat
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                                  <span>{CALLER_TYPE_LABELS[record.callerType ?? "unknown"]}</span>
                                  {record.whipClaimNumber && (
                                    <span className="font-mono bg-muted/50 px-1.5 py-0.5 rounded">
                                      {record.whipClaimNumber}
                                    </span>
                                  )}
                                  <span>{formatDistanceToNow(new Date(record.createdAt), { addSuffix: true })}</span>
                                  {record.message && (
                                    <span className="truncate max-w-xs text-muted-foreground/70 hidden md:inline">
                                      {record.message.substring(0, 60)}…
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <CalledBackButton intakeId={record.id} />
                                <Link href={`/intake/${record.id}`}>
                                  <Button variant="ghost" size="sm" className="h-7 text-xs">
                                    View
                                  </Button>
                                </Link>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </WhipLayout>
  );
}
