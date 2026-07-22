import { useState, useMemo, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import WhipLayout from "@/components/WhipLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link } from "wouter";
import {
  Search,
  PhoneIncoming,
  Building2,
  Scale,
  Stethoscope,
  User,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  PlusCircle,
  ShieldCheck,
  ShieldAlert,
  ChevronsUpDown,
  ChevronUp,
  ChevronDown,
  PhoneCall,
  Moon,
  Voicemail,
  PhoneMissed,
  PhoneOff,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";

// Label badge config for after_hours, direct_voicemail, weekend
const INTAKE_LABEL_CONFIG: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  after_hours:      { label: "After Hours",     icon: Moon,      className: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/30" },
  direct_voicemail: { label: "Direct VM",        icon: Voicemail, className: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30" },
  weekend:          { label: "Weekend",           icon: Moon,      className: "bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-500/30" },
};

function IntakeLabels({ labels }: { labels: string | null | undefined }) {
  if (!labels) return null;
  let parsed: string[] = [];
  try { parsed = JSON.parse(labels); } catch { return null; }
  if (!parsed.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-0.5">
      {parsed.map((lbl) => {
        const cfg = INTAKE_LABEL_CONFIG[lbl];
        if (!cfg) return null;
        const LblIcon = cfg.icon;
        return (
          <span key={lbl} className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${cfg.className}`}>
            <LblIcon className="w-2.5 h-2.5" />{cfg.label}
          </span>
        );
      })}
    </div>
  );
}

const CALLER_TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  carrier: { label: "Carrier", icon: Building2, color: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
  law_office: { label: "Law Office", icon: Scale, color: "bg-purple-500/15 text-purple-700 dark:text-purple-400" },
  medical_provider: { label: "Medical", icon: Stethoscope, color: "bg-green-500/15 text-green-700 dark:text-green-400" },
  member: { label: "Member", icon: User, color: "bg-orange-500/15 text-orange-700 dark:text-orange-400" },
  claimant: { label: "Claimant", icon: User, color: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400" },
  police: { label: "Police", icon: User, color: "bg-red-500/15 text-red-700 dark:text-red-400" },
  wrong_department: { label: "Wrong Dept", icon: HelpCircle, color: "bg-muted text-muted-foreground" },
  unknown: { label: "Unknown", icon: HelpCircle, color: "bg-muted text-muted-foreground" },
};

const SOURCE_LABELS: Record<string, string> = {
  ai_ivr: "AI IVR",
  voicemail: "Voicemail",
  manual: "Manual",
};

const PAGE_SIZE = 20;

// ─── Extension Calls Tab ──────────────────────────────────────────────────────

function ExtensionCallsTab({ handlerId }: { handlerId?: number }) {
  const [view, setView] = useState<"pending_callback" | "answered">("pending_callback");
  const [page, setPage] = useState(0);

  const { data, isLoading } = trpc.calls.extensionCalls.useQuery({
    view,
    handlerId,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

  return (
    <div className="space-y-4">
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
            {data && view === "pending_callback" && (
              <span className="ml-1 bg-orange-500/20 text-orange-700 dark:text-orange-400 text-xs px-1.5 py-0.5 rounded-full font-semibold">
                {data.total}
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
            {data && view === "answered" && (
              <span className="ml-1 bg-green-500/20 text-green-700 dark:text-green-400 text-xs px-1.5 py-0.5 rounded-full font-semibold">
                {data.total}
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
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-7 h-7 rounded-full bg-muted animate-pulse flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-36 bg-muted rounded animate-pulse" />
                    <div className="h-3 w-24 bg-muted rounded animate-pulse" />
                  </div>
                  <div className="h-5 w-16 bg-muted rounded animate-pulse" />
                </div>
              ))}
            </div>
          ) : data?.calls.length === 0 ? (
            <div className="p-12 text-center">
              {view === "pending_callback" ? (
                <>
                  <PhoneMissed className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm font-medium">No pending callbacks</p>
                  <p className="text-muted-foreground/60 text-xs mt-1">All extension calls have been handled.</p>
                </>
              ) : (
                <>
                  <PhoneCall className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm font-medium">No answered extension calls yet</p>
                  <p className="text-muted-foreground/60 text-xs mt-1">Answered calls will appear here as they come in.</p>
                </>
              )}
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b bg-background/95 backdrop-blur-sm">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Caller</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Agent</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Duration</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Status</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Date</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data?.calls.map((call) => (
                      <tr key={String(call.id)} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-blue-500/15 flex items-center justify-center flex-shrink-0">
                              {view === "pending_callback" ? (
                                <PhoneMissed className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
                              ) : (
                                <PhoneCall className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                              )}
                            </div>
                            <div>
                              <div className="font-medium text-foreground">{call.callerName || "Unknown"}</div>
                              {call.callerPhone && (
                                <div className="text-xs text-muted-foreground">{call.callerPhone}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {call.agentName || "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {call.durationSeconds && call.durationSeconds > 0
                            ? `${Math.floor(call.durationSeconds / 60)}m ${call.durationSeconds % 60}s`
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant="outline"
                            className={`text-xs ${
                              call.status === "answered"
                                ? "border-green-300 text-green-700 dark:text-green-400 bg-green-500/15"
                                : "border-orange-300 text-orange-700 dark:text-orange-400 bg-orange-500/15"
                            }`}
                          >
                            {call.status === "answered" ? "Answered" : "Missed"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(call.startedAt), "MMM d, h:mm a")}
                        </td>
                        <td className="px-4 py-3">
                          {call.callerPhone && view === "pending_callback" && (
                            <Link href={`/softphone?phone=${encodeURIComponent(call.callerPhone)}&name=${encodeURIComponent(call.callerName || '')}&autoCall=1`}>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs gap-1 text-teal-700 dark:text-teal-400 hover:bg-teal-500/15"
                                title="Call back"
                              >
                                <PhoneCall className="w-3 h-3" />
                                Call Back
                              </Button>
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile list */}
              <div className="md:hidden divide-y">
                {data?.calls.map((call) => (
                  <div key={String(call.id)} className="flex items-center gap-3 px-4 py-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                      view === "pending_callback" ? "bg-orange-500/15" : "bg-green-500/15"
                    }`}>
                      {view === "pending_callback" ? (
                        <PhoneMissed className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                      ) : (
                        <PhoneCall className="w-4 h-4 text-green-600 dark:text-green-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{call.callerName || call.callerPhone || "Unknown"}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {call.agentName || "No agent"} · {formatDistanceToNow(new Date(call.startedAt), { addSuffix: true })}
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-xs flex-shrink-0 ${
                        call.status === "answered"
                          ? "border-green-300 text-green-700 dark:text-green-400 bg-green-500/15"
                          : "border-orange-300 text-orange-700 dark:text-orange-400 bg-orange-500/15"
                      }`}
                    >
                      {call.status === "answered" ? "Answered" : "Missed"}
                    </Badge>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, data?.total ?? 0)} of{" "}
            {data?.total ?? 0}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function IntakeRecords() {
  const { user: authUser } = useAuth();
  const { impersonating, isImpersonating } = useImpersonation();

  const isAdmin = authUser?.role === "admin";

  // In handler view (impersonating or non-admin), lock the handlerName filter
  const { data: handlersListForName } = trpc.handlers.list.useQuery(undefined, {
    enabled: !isAdmin && !isImpersonating,
  });
  const linkedHandlerName = useMemo(() => {
    if (!authUser?.handlerProfileId || !handlersListForName) return null;
    const h = handlersListForName.find((h) => h.id === authUser.handlerProfileId);
    return h?.name ?? null;
  }, [authUser?.handlerProfileId, handlersListForName]);

  const effectiveHandlerName = isImpersonating
    ? impersonating!.name
    : !isAdmin
    ? (linkedHandlerName ?? authUser?.name ?? "")
    : null;

  // For extension calls tab — resolve handlerId for handler-scoped views
  const { data: handlersAll } = trpc.handlers.list.useQuery(undefined, { enabled: isAdmin || isImpersonating });
  const effectiveHandlerId = useMemo(() => {
    if (isImpersonating && impersonating) {
      return handlersAll?.find((h) => h.name === impersonating.name)?.id;
    }
    if (!isAdmin) {
      return authUser?.handlerProfileId ?? undefined;
    }
    return undefined;
  }, [isAdmin, isImpersonating, impersonating, handlersAll, authUser]);

  // Tab state
  const [activeTab, setActiveTab] = useState<"voicemail" | "extension">("voicemail");

  // Read initial filter values from URL query params
  const [location] = useLocation();
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), [location]);
  const initStatus = (urlParams.get("status") as "all" | "open" | "closed") || "open";
  const initPriority = (urlParams.get("priority") as "all" | "urgent" | "high" | "normal") || "all";
  const initDateFrom = urlParams.get("dateFrom") || "";
  const initDateTo = urlParams.get("dateTo") || "";

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "closed">(initStatus);
  const [typeFilter, setTypeFilter] = useState("all");
  const [handlerFilter, setHandlerFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState<"createdAt" | "handlerName" | "priority" | "status">("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [priorityFilter, setPriorityFilter] = useState<"all" | "urgent" | "high" | "normal">(initPriority);
  const [dateFrom, setDateFrom] = useState(initDateFrom);
  const [dateTo, setDateTo] = useState(initDateTo);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const s = p.get("status") as "all" | "open" | "closed" | null;
    const pr = p.get("priority") as "all" | "urgent" | "high" | "normal" | null;
    const df = p.get("dateFrom");
    const dt = p.get("dateTo");
    if (s) setStatusFilter(s);
    if (pr) setPriorityFilter(pr);
    if (df !== null) setDateFrom(df);
    if (dt !== null) setDateTo(dt);
    setPage(0);
  }, [location]);

  const toggleSort = useCallback((col: "createdAt" | "handlerName" | "priority" | "status") => {
    setSortBy((prev) => {
      if (prev === col) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir("asc");
      return col;
    });
    setPage(0);
  }, []);

  const { data: handlersData } = trpc.handlers.list.useQuery(undefined, {
    enabled: isAdmin,
  });

  useMemo(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, refetch } = trpc.intake.list.useQuery({
    search: debouncedSearch || undefined,
    status: statusFilter === "all" ? undefined : statusFilter,
    callerType: typeFilter === "all" ? undefined : typeFilter,
    handlerName: effectiveHandlerName ?? (handlerFilter !== "all" ? handlerFilter : undefined),
    priority: priorityFilter === "all" ? undefined : priorityFilter,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    sortBy,
    sortDir,
  }, { enabled: activeTab === "voicemail" });

  const updateMutation = trpc.intake.update.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Record updated");
    },
    onError: () => toast.error("Failed to update record"),
  });

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

  return (
    <WhipLayout>
      <div className="p-6 space-y-5">
        {/* Handler-scoped view banner */}
        {effectiveHandlerName && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
            Showing records assigned to <strong className="ml-1">{effectiveHandlerName}</strong>
            {isImpersonating && <span className="ml-1 text-amber-600">(admin view)</span>}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Intake Records</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {activeTab === "voicemail"
                ? `${data?.total ?? 0} ${effectiveHandlerName ? "records assigned to you" : "total records"}`
                : "Extension calls to agent lines"}
            </p>
          </div>
          <Link href="/intake/new">
            <Button className="bg-[#ff6221] hover:bg-[#e5541a] text-white gap-2">
              <PlusCircle className="w-4 h-4" />
              New Intake
            </Button>
          </Link>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-0 border-b border-border">
          <button
            onClick={() => setActiveTab("voicemail")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === "voicemail"
                ? "border-[#ff6221] text-[#ff6221]"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Voicemail className="w-3.5 h-3.5" />
              Voicemail Intakes
            </span>
          </button>
          <button
            onClick={() => setActiveTab("extension")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === "extension"
                ? "border-[#ff6221] text-[#ff6221]"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <PhoneOff className="w-3.5 h-3.5" />
              Extension Calls
            </span>
          </button>
        </div>

        {/* ── Extension Calls Tab ── */}
        {activeTab === "extension" && (
          <ExtensionCallsTab handlerId={effectiveHandlerId} />
        )}

        {/* ── Voicemail Intakes Tab ── */}
        {activeTab === "voicemail" && (
          <>
            {/* Priority quick-filter chips */}
            <div className="flex items-center gap-2">
              {(["all", "urgent", "high", "normal"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => { setPriorityFilter(p); setPage(0); }}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                    priorityFilter === p
                      ? p === "urgent" ? "bg-red-600 text-white border-red-600"
                      : p === "high" ? "bg-orange-500 text-white border-orange-500"
                      : p === "normal" ? "bg-slate-600 text-white border-slate-600"
                      : "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-foreground/40"
                  }`}
                >
                  {p === "all" ? "All Priority" : p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search name, org, claim number, phone..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                  className="pl-9"
                />
              </div>
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v as "all" | "open" | "closed");
                  setPage(0);
                }}
              >
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={typeFilter}
                onValueChange={(v) => {
                  setTypeFilter(v);
                  setPage(0);
                }}
              >
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Caller Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="carrier">Carrier</SelectItem>
                  <SelectItem value="law_office">Law Office</SelectItem>
                  <SelectItem value="medical_provider">Medical Provider</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="claimant">Claimant</SelectItem>
                  <SelectItem value="police">Police</SelectItem>
                  <SelectItem value="wrong_department">Wrong Dept</SelectItem>
                  <SelectItem value="unknown">Unknown</SelectItem>
                </SelectContent>
              </Select>
              {/* Handler filter — visible to admins only */}
              {!effectiveHandlerName && (
                <Select
                  value={handlerFilter}
                  onValueChange={(v) => {
                    setHandlerFilter(v);
                    setPage(0);
                  }}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="Handler" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Handlers</SelectItem>
                    {handlersData?.map((h) => (
                      <SelectItem key={String(h.id)} value={h.name}>{h.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Table */}
            <Card>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="divide-y">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-3">
                        <div className="w-7 h-7 rounded-full bg-muted animate-pulse flex-shrink-0" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-3.5 w-36 bg-muted rounded animate-pulse" />
                          <div className="h-3 w-24 bg-muted rounded animate-pulse" />
                        </div>
                        <div className="h-5 w-16 bg-muted rounded animate-pulse" />
                      </div>
                    ))}
                  </div>
                ) : data?.records.length === 0 ? (
                  <div className="p-12 text-center">
                    <PhoneIncoming className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground text-sm">No records found.</p>
                  </div>
                ) : (
                  <>
                    {/* Desktop table */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10">
                          <tr className="border-b bg-background/95 backdrop-blur-sm">
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Caller</th>
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Whip Claim #</th>
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Type</th>
                            <th
                              className="text-left px-4 py-3 font-medium text-muted-foreground text-xs cursor-pointer select-none hover:text-foreground transition-colors"
                              onClick={() => toggleSort("handlerName")}
                            >
                              <span className="inline-flex items-center gap-1">
                                Handler
                                {sortBy === "handlerName" ? (
                                  sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                                ) : (
                                  <ChevronsUpDown className="w-3 h-3 opacity-40" />
                                )}
                              </span>
                            </th>
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Source</th>
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Status</th>
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Callback</th>
                            <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Date</th>
                            <th className="px-4 py-3" />
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {data?.records.map((record) => {
                            const cfg = CALLER_TYPE_CONFIG[record.callerType ?? 'unknown'] ?? CALLER_TYPE_CONFIG.unknown;
                            const Icon = cfg.icon;
                            return (
                              <tr key={String(record.id)} className="hover:bg-muted/20 transition-colors">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${cfg.color}`}>
                                      <Icon className="w-3.5 h-3.5" />
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="font-medium text-foreground">{record.callerName || "—"}</span>
                                        {record.priority === "urgent" && (
                                          <span className="text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-500/10 dark:bg-red-500/15 border border-red-200 dark:border-red-500/30 px-1.5 py-0.5 rounded-full leading-none">URGENT</span>
                                        )}
                                        {record.priority === "high" && (
                                          <span className="text-[10px] font-semibold text-orange-600 dark:text-orange-400 bg-orange-500/10 dark:bg-orange-500/15 border border-orange-200 dark:border-orange-500/30 px-1.5 py-0.5 rounded-full leading-none">HIGH</span>
                                        )}
                                      </div>
                                      {record.callerOrg && (
                                        <div className="text-xs text-muted-foreground">{record.callerOrg}</div>
                                      )}
                                      {record.callerPhone && (
                                        <div className="text-xs text-muted-foreground">{record.callerPhone}</div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex flex-col gap-1">
                                    {record.whipClaimNumber ? (
                                      <span className="font-mono text-xs bg-muted text-foreground px-2 py-0.5 rounded">
                                        {record.whipClaimNumber}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                    {record.claimMatchType && record.claimMatchType !== "none" && (
                                      <span className={`inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded w-fit ${
                                        (record.claimMatchConfidence ?? 0) >= 95
                                          ? "bg-green-500/15 text-green-700 dark:text-green-400"
                                          : (record.claimMatchConfidence ?? 0) >= 70
                                          ? "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400"
                                          : "bg-muted text-muted-foreground"
                                      }`}>
                                        {(record.claimMatchConfidence ?? 0) >= 95 ? (
                                          <ShieldCheck className="w-2.5 h-2.5" />
                                        ) : (
                                          <ShieldAlert className="w-2.5 h-2.5" />
                                        )}
                                        {record.claimMatchConfidence ?? 0}%
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <Badge variant="outline" className={`text-xs ${cfg.color} border-0`}>
                                    {cfg.label}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3 text-sm text-muted-foreground">
                                  {record.handlerName || "—"}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex flex-col gap-0.5">
                                    <span className="text-xs text-muted-foreground">
                                      {SOURCE_LABELS[record.source] ?? record.source}
                                    </span>
                                    <IntakeLabels labels={(record as any).labels} />
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <Select
                                    value={record.status}
                                    onValueChange={(v) =>
                                      updateMutation.mutate({
                                        id: record.id,
                                        status: v as "open" | "closed",
                                      })
                                    }
                                  >
                                    <SelectTrigger className={`h-7 w-24 text-xs border-0 ${
                                      record.status === "open"
                                        ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                                        : "bg-green-500/15 text-green-700 dark:text-green-400"
                                    }`}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="open">Open</SelectItem>
                                      <SelectItem value="closed">Closed</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </td>
                                <td className="px-4 py-3">
                                  {record.source === "voicemail" && (
                                    record.callbackAt ? (
                                      <div className="flex flex-col gap-0.5">
                                        <Badge variant="outline" className="text-xs border-green-300 text-green-700 dark:text-green-400 bg-green-500/15 w-fit">
                                          ✓ Called Back
                                        </Badge>
                                        <span className="text-xs text-muted-foreground">
                                          {record.callbackHandlerName || ""}
                                        </span>
                                      </div>
                                    ) : record.callbackDueBy ? (
                                      <Badge
                                        variant="outline"
                                        className={`text-xs w-fit ${
                                          new Date() > new Date(record.callbackDueBy)
                                            ? "border-red-300 text-red-700 dark:text-red-400 bg-red-500/15"
                                            : "border-blue-300 text-blue-700 dark:text-blue-400 bg-blue-500/15"
                                        }`}
                                      >
                                        {new Date() > new Date(record.callbackDueBy) ? "⚠ Overdue" : "Due EOB"}
                                      </Badge>
                                    ) : null
                                  )}
                                </td>
                                <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                                  {format(new Date(record.createdAt), "MMM d, h:mm a")}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-1">
                                    {record.status === "open" && record.callbackPhone && (
                                      <Link href={`/softphone?intakeId=${record.id}&phone=${encodeURIComponent(record.callbackPhone)}&name=${encodeURIComponent(record.callerName || '')}&autoCall=1`}>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 text-xs gap-1 text-teal-700 dark:text-teal-400 hover:bg-teal-500/15"
                                          title="Open Softphone and call"
                                        >
                                          <PhoneCall className="w-3 h-3" />
                                          Call
                                        </Button>
                                      </Link>
                                    )}
                                    <Link href={`/intake/${record.id}`}>
                                      <Button variant="ghost" size="sm" className="h-7 text-xs">
                                        View
                                      </Button>
                                    </Link>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile list */}
                    <div className="md:hidden divide-y">
                      {data?.records.map((record) => {
                        const cfg = CALLER_TYPE_CONFIG[record.callerType ?? 'unknown'] ?? CALLER_TYPE_CONFIG.unknown;
                        const Icon = cfg.icon;
                        return (
                          <Link key={String(record.id)} href={`/intake/${record.id}`}>
                            <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 cursor-pointer">
                              <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${cfg.color}`}>
                                <Icon className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm truncate">
                                  {record.callerName || record.callerPhone || "Unknown"}
                                </div>
                                <div className="text-xs text-muted-foreground truncate">
                                  {record.callerOrg || cfg.label} ·{" "}
                                  {formatDistanceToNow(new Date(record.createdAt), { addSuffix: true })}
                                </div>
                              </div>
                              <Badge
                                variant="outline"
                                className={`text-xs flex-shrink-0 ${
                                  record.status === "open"
                                    ? "border-amber-300 text-amber-700 dark:text-amber-400 bg-amber-500/15"
                                    : "border-green-300 text-green-700 dark:text-green-400 bg-green-500/15"
                                }`}
                              >
                                {record.status}
                              </Badge>
                            </div>
                          </Link>
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
                  Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, data?.total ?? 0)} of{" "}
                  {data?.total ?? 0}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </WhipLayout>
  );
}
