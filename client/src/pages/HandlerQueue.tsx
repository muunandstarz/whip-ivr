import { useState } from "react";
import WhipLayout from "@/components/WhipLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Users,
  PhoneIncoming,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

const HANDLER_COLORS: Record<string, string> = {
  Natasha: "bg-blue-100 text-blue-800 border-blue-200",
  Jayla: "bg-purple-100 text-purple-800 border-purple-200",
  Carlito: "bg-green-100 text-green-800 border-green-200",
  Annie: "bg-pink-100 text-pink-800 border-pink-200",
  Lorraine: "bg-yellow-100 text-yellow-800 border-yellow-200",
  Jovel: "bg-orange-100 text-orange-800 border-orange-200",
  MJ: "bg-teal-100 text-teal-800 border-teal-200",
  Daryl: "bg-indigo-100 text-indigo-800 border-indigo-200",
};

const PRIORITY_CONFIG = {
  urgent: { label: "Urgent", className: "bg-red-50 text-red-700 border-red-200" },
  high: { label: "High", className: "bg-orange-50 text-orange-700 border-orange-200" },
  normal: { label: "Normal", className: "bg-gray-50 text-gray-600 border-gray-200" },
};

const CALLER_TYPE_LABELS: Record<string, string> = {
  carrier: "Carrier",
  law_office: "Law Office",
  medical_provider: "Medical",
  member: "Member",
  claimant: "Claimant",
  police: "Police",
  unknown: "Unknown",
};

export default function HandlerQueue() {
  const [expandedHandlers, setExpandedHandlers] = useState<Set<string>>(new Set(["Natasha", "Jayla"]));

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

  // Sort handlers by queue size (descending)
  const sortedHandlers = Object.entries(byHandler).sort(([, a], [, b]) => b.length - a.length);

  const totalOpen = data?.total ?? 0;
  const urgentCount = data?.records?.filter((r) => r.priority === "urgent").length ?? 0;
  const highCount = data?.records?.filter((r) => r.priority === "high").length ?? 0;

  return (
    <WhipLayout>
      <div className="p-6 space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-[#171b31]">Handler Queue</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Open intake records grouped by assigned handler
          </p>
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
          <div className="text-center text-muted-foreground text-sm py-8">Loading queues...</div>
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
              const colorClass = HANDLER_COLORS[handlerName] || "bg-gray-100 text-gray-800 border-gray-200";

              return (
                <Card key={handlerName} className="overflow-hidden">
                  {/* Handler header */}
                  <button
                    className="w-full text-left"
                    onClick={() => toggleHandler(handlerName)}
                  >
                    <div className="flex items-center gap-4 px-5 py-4 hover:bg-muted/20 transition-colors">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border ${colorClass}`}>
                        {handlerName.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-[#171b31]">{handlerName}</div>
                        <div className="text-xs text-muted-foreground">
                          {records.length} open record{records.length !== 1 ? "s" : ""}
                          {urgentInQueue > 0 && (
                            <span className="ml-2 text-red-600 font-medium">• {urgentInQueue} urgent</span>
                          )}
                          {highInQueue > 0 && !urgentInQueue && (
                            <span className="ml-2 text-orange-600 font-medium">• {highInQueue} high priority</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
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

                  {/* Records list */}
                  {isExpanded && (
                    <div className="border-t">
                      {records
                        .sort((a, b) => {
                          const pOrder = { urgent: 0, high: 1, normal: 2 };
                          return (pOrder[a.priority] ?? 2) - (pOrder[b.priority] ?? 2);
                        })
                        .map((record, idx) => {
                          const priorityCfg = PRIORITY_CONFIG[record.priority] ?? PRIORITY_CONFIG.normal;
                          return (
                            <div
                              key={record.id}
                              className={`flex items-center gap-4 px-5 py-3 hover:bg-muted/10 transition-colors ${
                                idx < records.length - 1 ? "border-b" : ""
                              }`}
                            >
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
                                      🔁 Repeat
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                                  <span>{CALLER_TYPE_LABELS[record.callerType ?? "unknown"]}</span>
                                  {record.whipClaimNumber && (
                                    <span className="font-mono bg-muted/50 px-1.5 py-0.5 rounded">
                                      {record.whipClaimNumber}
                                    </span>
                                  )}
                                  <span>{formatDistanceToNow(new Date(record.createdAt), { addSuffix: true })}</span>
                                </div>
                              </div>
                              <Link href={`/intake/${record.id}`}>
                                <Button variant="ghost" size="sm" className="h-7 text-xs flex-shrink-0">
                                  View
                                </Button>
                              </Link>
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
