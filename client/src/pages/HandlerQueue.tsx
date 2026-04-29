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
      className="h-7 text-xs gap-1 bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
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
  "Natashia Edulan":    "bg-blue-100 text-blue-800 border-blue-200",
  "Jayla Bernard":      "bg-purple-100 text-purple-800 border-purple-200",
  "Carlito Legarde Jr": "bg-green-100 text-green-800 border-green-200",
  "Annie Ortiz":        "bg-pink-100 text-pink-800 border-pink-200",
  "Lorraine Tria":      "bg-yellow-100 text-yellow-800 border-yellow-200",
  "Jovel Villa":        "bg-orange-100 text-orange-800 border-orange-200",
  "Mary Joy Badua":     "bg-teal-100 text-teal-800 border-teal-200",
  "Daryl Ochate":       "bg-indigo-100 text-indigo-800 border-indigo-200",
  "Madeline Green":     "bg-emerald-100 text-emerald-800 border-emerald-200",
  "Demily Flores":      "bg-rose-100 text-rose-800 border-rose-200",
  "Ana Padilla":        "bg-rose-100 text-rose-800 border-rose-200",
  "Catherine Cestina":  "bg-cyan-100 text-cyan-800 border-cyan-200",
  "Unassigned":         "bg-gray-100 text-gray-600 border-gray-200",
};

const PRIORITY_CONFIG: Record<string, { label: string; className: string }> = {
  urgent: { label: "Urgent", className: "bg-red-50 text-red-700 border-red-200" },
  high:   { label: "High",   className: "bg-orange-50 text-orange-700 border-orange-200" },
  normal: { label: "Normal", className: "bg-gray-50 text-gray-600 border-gray-200" },
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
            <h1 className="text-2xl font-bold text-[#171b31]">Handler Queue</h1>
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
                <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-[#171b31]">{totalOpen}</div>
                  <div className="text-xs text-muted-foreground">Open Records</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-[#171b31]">{urgentCount}</div>
                  <div className="text-xs text-muted-foreground">Urgent</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4 text-orange-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-[#171b31]">{highCount}</div>
                  <div className="text-xs text-muted-foreground">High Priority</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Users className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-[#171b31]">{sortedHandlers.length}</div>
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
                        <div className="font-semibold text-[#171b31]">{handlerName}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
                          <span>{records.length} open record{records.length !== 1 ? "s" : ""}</span>
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
                          <Badge className="text-xs bg-red-100 text-red-700 border-red-200 border">
                            {urgentInQueue} urgent
                          </Badge>
                        )}
                        {highInQueue > 0 && (
                          <Badge className="text-xs bg-orange-100 text-orange-700 border-orange-200 border">
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
                                "bg-gray-200"
                              }`} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-sm text-[#171b31]">
                                    {record.callerName || record.callerPhone || "Unknown"}
                                  </span>
                                  {record.callerOrg && (
                                    <span className="text-xs text-muted-foreground">— {record.callerOrg}</span>
                                  )}
                                  <Badge variant="outline" className={`text-xs ${priorityCfg.className}`}>
                                    {priorityCfg.label}
                                  </Badge>
                                  {record.isRepeatCaller && (
                                    <Badge variant="outline" className="text-xs border-red-200 text-red-600 bg-red-50">
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
