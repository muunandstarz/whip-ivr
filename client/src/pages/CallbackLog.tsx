import { useState } from "react";
import WhipLayout from "@/components/WhipLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  PhoneOff,
  PhoneMissed,
  PhoneCall,
  ChevronLeft,
  ChevronRight,
  ListChecks,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

const DISPOSITION_CONFIG: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  reached:        { label: "Reached",        icon: CheckCircle2, className: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-300 dark:border-green-500/30" },
  left_voicemail: { label: "Left Voicemail", icon: PhoneCall,    className: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-500/30" },
  no_answer:      { label: "No Answer",      icon: PhoneOff,     className: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-500/30" },
  busy:           { label: "Busy",           icon: PhoneMissed,  className: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-500/30" },
  wrong_number:   { label: "Wrong Number",   icon: PhoneMissed,  className: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-300 dark:border-red-500/30" },
};

const OUTCOME_CONFIG: Record<string, { label: string; className: string }> = {
  resolved:   { label: "Resolved",   className: "bg-green-500/15 text-green-700 dark:text-green-400" },
  closed:     { label: "Closed",     className: "bg-slate-500/15 text-slate-700 dark:text-slate-400" },
  follow_up:  { label: "Follow-up",  className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  escalated:  { label: "Escalated",  className: "bg-red-500/15 text-red-700 dark:text-red-400" },
};

const CALLER_TYPE_LABELS: Record<string, string> = {
  carrier: "Carrier", law_office: "Law Office", medical_provider: "Medical",
  member: "Member", claimant: "Claimant", police: "Police",
  wrong_department: "Wrong Dept", unknown: "Unknown",
};

const PAGE_SIZE = 25;

export default function CallbackLog() {
  const [handlerFilter, setHandlerFilter] = useState<string>("all");
  const [dispositionFilter, setDispositionFilter] = useState<string>("all");
  const [page, setPage] = useState(0);

  const { data: handlersData } = trpc.handlers.list.useQuery();

  const { data, isLoading } = trpc.callbacks.all.useQuery({
    handlerName: handlerFilter !== "all" ? handlerFilter : undefined,
    disposition: dispositionFilter !== "all" ? dispositionFilter : undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <WhipLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ListChecks className="w-6 h-6 text-[#ff6221]" />
            Callback Log
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            All callback attempts logged by handlers — {total.toLocaleString()} total entries
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <Select
            value={handlerFilter}
            onValueChange={(v) => { setHandlerFilter(v); setPage(0); }}
          >
            <SelectTrigger className="w-48 h-9 text-sm">
              <SelectValue placeholder="All handlers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All handlers</SelectItem>
              {(handlersData ?? []).map((h: { id: number; name: string }) => (
                <SelectItem key={h.id} value={h.name}>{h.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={dispositionFilter}
            onValueChange={(v) => { setDispositionFilter(v); setPage(0); }}
          >
            <SelectTrigger className="w-44 h-9 text-sm">
              <SelectValue placeholder="All dispositions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All dispositions</SelectItem>
              <SelectItem value="reached">Reached</SelectItem>
              <SelectItem value="left_voicemail">Left Voicemail</SelectItem>
              <SelectItem value="no_answer">No Answer</SelectItem>
              <SelectItem value="busy">Busy</SelectItem>
              <SelectItem value="wrong_number">Wrong Number</SelectItem>
            </SelectContent>
          </Select>

          {(handlerFilter !== "all" || dispositionFilter !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 text-xs text-muted-foreground"
              onClick={() => { setHandlerFilter("all"); setDispositionFilter("all"); setPage(0); }}
            >
              Clear filters
            </Button>
          )}
        </div>

        {/* Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">
              {total > 0 ? `Showing ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} of ${total.toLocaleString()}` : "No results"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-0">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-5 py-3 border-b last:border-b-0 animate-pulse">
                    <div className="w-24 h-4 bg-muted rounded" />
                    <div className="flex-1 h-4 bg-muted rounded" />
                    <div className="w-20 h-4 bg-muted rounded" />
                  </div>
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                No callback logs found.
              </div>
            ) : (
              <div>
                {/* Column headers */}
                <div className="grid grid-cols-[1fr_1.5fr_1fr_1fr_1fr] gap-3 px-5 py-2 border-b bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <span>When</span>
                  <span>Caller</span>
                  <span>Handler</span>
                  <span>Disposition</span>
                  <span>Outcome</span>
                </div>
                {rows.map((row) => {
                  const dispCfg = DISPOSITION_CONFIG[row.disposition] ?? DISPOSITION_CONFIG.no_answer;
                  const DispIcon = dispCfg.icon;
                  const outcomeCfg = row.outcome ? OUTCOME_CONFIG[row.outcome] : null;
                  return (
                    <Link key={row.id} href={`/intake/${row.intakeId}`}>
                      <div className="grid grid-cols-[1fr_1.5fr_1fr_1fr_1fr] gap-3 px-5 py-3 border-b last:border-b-0 hover:bg-muted/20 cursor-pointer transition-colors items-center">
                        {/* When */}
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-foreground">
                            {row.calledAt ? format(new Date(row.calledAt), "MMM d, h:mm a") : "—"}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {row.calledAt ? formatDistanceToNow(new Date(row.calledAt), { addSuffix: true }) : ""}
                          </div>
                        </div>
                        {/* Caller */}
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate text-foreground">
                            {row.callerName || row.callerPhone || "Unknown"}
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            {row.callerOrg || CALLER_TYPE_LABELS[row.callerType ?? "unknown"] || ""}
                          </div>
                        </div>
                        {/* Handler */}
                        <div className="text-sm text-foreground truncate">
                          {row.handlerName || "—"}
                        </div>
                        {/* Disposition */}
                        <div>
                          <Badge variant="outline" className={`text-xs gap-1 ${dispCfg.className}`}>
                            <DispIcon className="w-3 h-3" />
                            {dispCfg.label}
                          </Badge>
                        </div>
                        {/* Outcome */}
                        <div>
                          {outcomeCfg ? (
                            <Badge variant="outline" className={`text-xs ${outcomeCfg.className}`}>
                              {outcomeCfg.label}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Page {page + 1} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1 text-xs"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1 text-xs"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </WhipLayout>
  );
}
