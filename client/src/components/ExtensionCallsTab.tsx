/**
 * ExtensionCallsTab
 *
 * Shows today's inbound calls on the Claims Line with:
 * - Answered / Pending Callback toggle
 * - Caller type badge (carrier, legal, claimant, etc.)
 * - Duration and handle time
 * - Agent who answered
 * - Date range picker (defaults to today)
 */
import { useState, useMemo } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  PhoneMissed,
  PhoneCall,
  PhoneOff,
  Building2,
  Scale,
  Stethoscope,
  User,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Timer,
  CalendarDays,
  Voicemail,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

const PAGE_SIZE = 25;

// ─── Caller type config ───────────────────────────────────────────────────────
const CALLER_TYPE_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; bg: string; text: string }
> = {
  carrier:          { label: "Carrier",      icon: Building2,   bg: "bg-blue-500/15",   text: "text-blue-700 dark:text-blue-400" },
  law_office:       { label: "Law Office",   icon: Scale,       bg: "bg-purple-500/15", text: "text-purple-700 dark:text-purple-400" },
  medical_provider: { label: "Medical",      icon: Stethoscope, bg: "bg-green-500/15",  text: "text-green-700 dark:text-green-400" },
  member:           { label: "Member",       icon: User,        bg: "bg-orange-500/15", text: "text-orange-700 dark:text-orange-400" },
  claimant:         { label: "Claimant",     icon: User,        bg: "bg-yellow-500/15", text: "text-yellow-700 dark:text-yellow-400" },
  police:           { label: "Police",       icon: User,        bg: "bg-red-500/15",    text: "text-red-700 dark:text-red-400" },
  wrong_department: { label: "Wrong Dept",   icon: HelpCircle,  bg: "bg-muted",         text: "text-muted-foreground" },
  unknown:          { label: "Unknown",      icon: HelpCircle,  bg: "bg-muted",         text: "text-muted-foreground" },
};

function CallerTypeBadge({ callerType }: { callerType: string | null | undefined }) {
  const cfg = CALLER_TYPE_CONFIG[callerType ?? "unknown"] ?? CALLER_TYPE_CONFIG.unknown;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

// Handle time = wait time + talk time (duration)
function formatHandleTime(duration: number | null | undefined, wait: number | null | undefined): string {
  const total = (duration ?? 0) + (wait ?? 0);
  if (total <= 0) return "—";
  return formatDuration(total);
}

// ─── Stats bar ────────────────────────────────────────────────────────────────
function StatsBar({
  answeredData,
  pendingData,
}: {
  answeredData: { total: number; calls: any[] } | undefined;
  pendingData: { total: number; calls: any[] } | undefined;
}) {
  const answeredCount = answeredData?.total ?? 0;
  const pendingCount = pendingData?.total ?? 0;
  const total = answeredCount + pendingCount;
  const answerRate = total > 0 ? Math.round((answeredCount / total) * 100) : 0;

  const avgDuration = useMemo(() => {
    const calls = answeredData?.calls ?? [];
    if (!calls.length) return 0;
    const sum = calls.reduce((acc, c) => acc + (c.durationSeconds ?? 0), 0);
    return Math.round(sum / calls.length);
  }, [answeredData]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        { label: "Total Calls Today", value: total, icon: PhoneCall, color: "text-foreground" },
        { label: "Answered", value: answeredCount, icon: PhoneCall, color: "text-green-600 dark:text-green-400" },
        { label: "Pending Callback", value: pendingCount, icon: PhoneMissed, color: pendingCount > 0 ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground" },
        { label: "Answer Rate", value: `${answerRate}%`, icon: Timer, color: answerRate >= 80 ? "text-green-600 dark:text-green-400" : answerRate >= 60 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400" },
      ].map(({ label, value, icon: Icon, color }) => (
        <Card key={label} className="border-border/60">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={`w-3.5 h-3.5 ${color}`} />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <div className={`text-xl font-bold ${color}`}>{value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ExtensionCallsTab({ handlerId }: { handlerId?: number }) {
  const [view, setView] = useState<"pending_callback" | "answered">("pending_callback");
  const [page, setPage] = useState(0);

  // Date range — default today
  const [dateFrom] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const queryBase = { handlerId, dateFrom, limit: PAGE_SIZE };

  const { data, isLoading } = trpc.calls.extensionCalls.useQuery({
    ...queryBase,
    view,
    offset: page * PAGE_SIZE,
  });

  // Fetch both views for stats bar (small query, no pagination needed)
  const { data: answeredStats } = trpc.calls.extensionCalls.useQuery({
    ...queryBase,
    view: "answered",
    limit: 200,
    offset: 0,
  });
  const { data: pendingStats } = trpc.calls.extensionCalls.useQuery({
    ...queryBase,
    view: "pending_callback",
    limit: 200,
    offset: 0,
  });

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <StatsBar answeredData={answeredStats} pendingData={pendingStats} />

      {/* Date label */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CalendarDays className="w-4 h-4" />
        <span>Showing calls for <strong className="text-foreground">{format(dateFrom, "EEEE, MMMM d")}</strong></span>
      </div>

      {/* Toggle */}
      <div className="flex items-center gap-1 p-1 bg-muted rounded-lg w-fit">
        <button
          onClick={() => { setView("pending_callback"); setPage(0); }}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
            view === "pending_callback"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span className="flex items-center gap-1.5">
            <PhoneMissed className="w-3.5 h-3.5" />
            Pending Callback
            {pendingStats && (
              <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                (pendingStats.total ?? 0) > 0
                  ? "bg-orange-500/20 text-orange-700 dark:text-orange-400"
                  : "bg-muted text-muted-foreground"
              }`}>
                {pendingStats.total ?? 0}
              </span>
            )}
          </span>
        </button>
        <button
          onClick={() => { setView("answered"); setPage(0); }}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
            view === "answered"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span className="flex items-center gap-1.5">
            <PhoneCall className="w-3.5 h-3.5" />
            Answered
            {answeredStats && (
              <span className="ml-1 bg-green-500/20 text-green-700 dark:text-green-400 text-xs px-1.5 py-0.5 rounded-full font-semibold">
                {answeredStats.total ?? 0}
              </span>
            )}
          </span>
        </button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-full bg-muted animate-pulse flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-40 bg-muted rounded animate-pulse" />
                    <div className="h-3 w-28 bg-muted rounded animate-pulse" />
                  </div>
                  <div className="h-5 w-20 bg-muted rounded animate-pulse" />
                </div>
              ))}
            </div>
          ) : data?.calls.length === 0 ? (
            <div className="p-16 text-center">
              {view === "pending_callback" ? (
                <>
                  <PhoneMissed className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                  <p className="text-muted-foreground font-medium">No pending callbacks today</p>
                  <p className="text-muted-foreground/60 text-sm mt-1">All calls have been handled.</p>
                </>
              ) : (
                <>
                  <PhoneCall className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                  <p className="text-muted-foreground font-medium">No answered calls yet today</p>
                  <p className="text-muted-foreground/60 text-sm mt-1">Answered calls will appear here as they come in.</p>
                </>
              )}
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Caller</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Type</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Agent</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                        <span className="flex items-center gap-1"><Timer className="w-3 h-3" />Handle Time</span>
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Talk Time</span>
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Status</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Time</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.calls.map((call) => {
                      const isAnswered = call.status === "answered";
                      const isVoicemail = call.status === "voicemail";
                      return (
                        <tr key={String(call.id)} className="hover:bg-muted/20 transition-colors group">
                          {/* Caller */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                                isAnswered ? "bg-green-500/15" : isVoicemail ? "bg-amber-500/15" : "bg-orange-500/15"
                              }`}>
                                {isAnswered ? (
                                  <PhoneCall className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                                ) : isVoicemail ? (
                                  <Voicemail className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                ) : (
                                  <PhoneMissed className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
                                )}
                              </div>
                              <div>
                                <div className="font-medium text-foreground leading-tight">
                                  {call.callerName || call.callerPhone || "Unknown"}
                                </div>
                                {call.callerName && call.callerPhone && (
                                  <div className="text-xs text-muted-foreground">{call.callerPhone}</div>
                                )}
                                {call.callerOrg && (
                                  <div className="text-xs text-muted-foreground/70 truncate max-w-[180px]">{call.callerOrg}</div>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Caller type */}
                          <td className="px-4 py-3">
                            <CallerTypeBadge callerType={call.callerType} />
                          </td>

                          {/* Agent */}
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {call.agentName || "—"}
                          </td>

                          {/* Handle time */}
                          <td className="px-4 py-3">
                            <span className="text-sm font-mono text-foreground">
                              {formatHandleTime(call.durationSeconds, call.waitTimeSeconds)}
                            </span>
                          </td>

                          {/* Talk time */}
                          <td className="px-4 py-3">
                            <span className="text-sm font-mono text-muted-foreground">
                              {formatDuration(call.durationSeconds)}
                            </span>
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3">
                            <Badge
                              variant="outline"
                              className={`text-xs ${
                                isAnswered
                                  ? "border-green-300 text-green-700 dark:text-green-400 bg-green-500/10"
                                  : isVoicemail
                                  ? "border-amber-300 text-amber-700 dark:text-amber-400 bg-amber-500/10"
                                  : "border-orange-300 text-orange-700 dark:text-orange-400 bg-orange-500/10"
                              }`}
                            >
                              {isAnswered ? "Answered" : isVoicemail ? "Voicemail" : "Missed"}
                            </Badge>
                          </td>

                          {/* Time */}
                          <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                            {format(new Date(call.startedAt), "h:mm a")}
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {call.hasIntakeRecord && call.intakeRecordId && (
                                <Link href={`/intake/${call.intakeRecordId}`}>
                                  <Button variant="ghost" size="sm" className="h-7 text-xs">
                                    Intake
                                  </Button>
                                </Link>
                              )}
                              {call.callerPhone && !isAnswered && (
                                <Link href={`/softphone?phone=${encodeURIComponent(call.callerPhone)}&name=${encodeURIComponent(call.callerName || '')}&autoCall=1`}>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs gap-1 text-teal-700 dark:text-teal-400 hover:bg-teal-500/15"
                                  >
                                    <PhoneCall className="w-3 h-3" />
                                    Call Back
                                  </Button>
                                </Link>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile / tablet cards */}
              <div className="lg:hidden divide-y">
                {data.calls.map((call) => {
                  const isAnswered = call.status === "answered";
                  const isVoicemail = call.status === "voicemail";
                  return (
                    <div key={String(call.id)} className="px-4 py-3 flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        isAnswered ? "bg-green-500/15" : isVoicemail ? "bg-amber-500/15" : "bg-orange-500/15"
                      }`}>
                        {isAnswered ? (
                          <PhoneCall className="w-4 h-4 text-green-600 dark:text-green-400" />
                        ) : isVoicemail ? (
                          <Voicemail className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        ) : (
                          <PhoneMissed className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{call.callerName || call.callerPhone || "Unknown"}</span>
                          <CallerTypeBadge callerType={call.callerType} />
                        </div>
                        {call.callerOrg && (
                          <div className="text-xs text-muted-foreground truncate">{call.callerOrg}</div>
                        )}
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span>{call.agentName || "No agent"}</span>
                          {(call.durationSeconds ?? 0) > 0 && (
                            <span className="flex items-center gap-0.5">
                              <Clock className="w-3 h-3" />
                              {formatDuration(call.durationSeconds)}
                            </span>
                          )}
                          <span>{format(new Date(call.startedAt), "h:mm a")}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            isAnswered
                              ? "border-green-300 text-green-700 dark:text-green-400 bg-green-500/10"
                              : isVoicemail
                              ? "border-amber-300 text-amber-700 dark:text-amber-400 bg-amber-500/10"
                              : "border-orange-300 text-orange-700 dark:text-orange-400 bg-orange-500/10"
                          }`}
                        >
                          {isAnswered ? "Answered" : isVoicemail ? "Voicemail" : "Missed"}
                        </Badge>
                        {call.callerPhone && !isAnswered && (
                          <Link href={`/softphone?phone=${encodeURIComponent(call.callerPhone)}&name=${encodeURIComponent(call.callerName || '')}&autoCall=1`}>
                            <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 text-teal-700 dark:text-teal-400 p-1">
                              <PhoneCall className="w-3 h-3" />
                              Call Back
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, data?.total ?? 0)} of {data?.total ?? 0}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
