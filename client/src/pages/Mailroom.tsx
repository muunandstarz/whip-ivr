import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Mail, Inbox, AlertTriangle, Scale, BarChart3, Filter, Download,
  MoreHorizontal, ArrowRight, CheckCircle, AlertCircle, Clock,
  ExternalLink, FileText, RefreshCw, ChevronUp, ChevronDown,
} from "lucide-react";
import { toast } from "sonner";

// ─── Category labels ──────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  injury_pip_bi: "Injury / PIP / BI",
  inbound_subro: "Inbound Subro",
  existing_claim_followup: "Claim Follow-Up",
  outbound_subro: "OB Subro",
  total_loss: "Total Loss",
  legal_or_high_risk: "Legal / High Risk",
  other_or_unclear: "Other / Unclear",
};

const CATEGORY_COLORS: Record<string, string> = {
  injury_pip_bi: "bg-blue-100 text-blue-800",
  inbound_subro: "bg-purple-100 text-purple-800",
  existing_claim_followup: "bg-gray-100 text-gray-800",
  outbound_subro: "bg-indigo-100 text-indigo-800",
  total_loss: "bg-orange-100 text-orange-800",
  legal_or_high_risk: "bg-red-100 text-red-800",
  other_or_unclear: "bg-yellow-100 text-yellow-800",
};

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  assigned: "bg-green-100 text-green-800",
  escalated: "bg-red-100 text-red-800",
  resolved: "bg-gray-100 text-gray-500",
};

const URGENCY_COLORS: Record<string, string> = {
  low: "bg-gray-100 text-gray-600",
  normal: "bg-blue-50 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

// ─── Shared helpers ───────────────────────────────────────────────────────────

function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtRelative(d: Date | string | null | undefined) {
  if (!d) return "—";
  const diff = Date.now() - new Date(d).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return fmtDate(d);
}

function CategoryBadge({ cat }: { cat: string | null | undefined }) {
  if (!cat) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_COLORS[cat] ?? "bg-gray-100 text-gray-700"}`}>
      {CATEGORY_LABELS[cat] ?? cat}
    </span>
  );
}

function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status] ?? "bg-gray-100 text-gray-700"}`}>
      {status}
    </span>
  );
}

// ─── Reroute dialog ───────────────────────────────────────────────────────────

function RerouteDialog({
  itemId, open, onClose,
}: { itemId: number; open: boolean; onClose: () => void }) {
  const [toHandlerId, setToHandlerId] = useState<string>("");
  const [reason, setReason] = useState("");
  const utils = trpc.useUtils();
  const { data: handlers } = trpc.handlers.list.useQuery();
  const reroute = trpc.mail.reroute.useMutation({
    onSuccess: () => {
      toast.success("Item rerouted");
      utils.mail.myMailroom.invalidate();
      utils.mail.adminQueue.invalidate();
      utils.mail.myPendingCount.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Reroute Item</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Assign to Handler</Label>
            <Select value={toHandlerId} onValueChange={setToHandlerId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select handler…" /></SelectTrigger>
              <SelectContent>
                {handlers?.map(h => (
                  <SelectItem key={h.id} value={String(h.id)}>{h.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Reason (optional)</Label>
            <Textarea className="mt-1" value={reason} onChange={e => setReason(e.target.value)} placeholder="Why are you rerouting?" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!toHandlerId || reroute.isPending}
            onClick={() => reroute.mutate({ itemId, toHandlerId: Number(toHandlerId), reason: reason || undefined })}
          >
            {reroute.isPending ? "Rerouting…" : "Reroute"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Resolve dialog ───────────────────────────────────────────────────────────

function ResolveDialog({
  itemId, open, onClose,
}: { itemId: number; open: boolean; onClose: () => void }) {
  const [note, setNote] = useState("");
  const utils = trpc.useUtils();
  const resolve = trpc.mail.resolve.useMutation({
    onSuccess: () => {
      toast.success("Item resolved");
      utils.mail.myMailroom.invalidate();
      utils.mail.adminQueue.invalidate();
      utils.mail.myPendingCount.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Resolve Item</DialogTitle></DialogHeader>
        <div className="py-2">
          <Label>Resolution note (optional)</Label>
          <Textarea className="mt-1" value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note about how this was resolved…" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={resolve.isPending}
            onClick={() => resolve.mutate({ itemId, note: note || undefined })}
          >
            {resolve.isPending ? "Resolving…" : "Mark Resolved"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Item row actions ─────────────────────────────────────────────────────────

function ItemActions({ item }: { item: any }) {
  const [rerouteOpen, setRerouteOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const utils = trpc.useUtils();
  const escalate = trpc.mail.escalate.useMutation({
    onSuccess: () => {
      toast.success("Item escalated");
      utils.mail.myMailroom.invalidate();
      utils.mail.adminQueue.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/mailroom/${item.id}`}>View Detail</Link>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setRerouteOpen(true)}>
            <ArrowRight className="h-3.5 w-3.5 mr-2" /> Reroute
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setResolveOpen(true)}>
            <CheckCircle className="h-3.5 w-3.5 mr-2" /> Resolve
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => escalate.mutate({ itemId: item.id, reason: "Manual escalation" })}
            className="text-destructive"
          >
            <AlertCircle className="h-3.5 w-3.5 mr-2" /> Escalate
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <RerouteDialog itemId={item.id} open={rerouteOpen} onClose={() => setRerouteOpen(false)} />
      <ResolveDialog itemId={item.id} open={resolveOpen} onClose={() => setResolveOpen(false)} />
    </>
  );
}

// ─── Mail items table ─────────────────────────────────────────────────────────

type SortKey = "receivedAt" | "dueAt" | "category" | "status";
type SortDir = "asc" | "desc";

function MailTable({
  items, showHandler = false, loading = false,
}: { items: any[]; showHandler?: boolean; loading?: boolean }) {
  const [sortKey, setSortKey] = useState<SortKey>("receivedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      let av: any, bv: any;
      if (sortKey === "receivedAt") { av = new Date(a.receivedAt).getTime(); bv = new Date(b.receivedAt).getTime(); }
      else if (sortKey === "dueAt") { av = a.dueAt ? new Date(a.dueAt).getTime() : Infinity; bv = b.dueAt ? new Date(b.dueAt).getTime() : Infinity; }
      else if (sortKey === "category") { av = a.category ?? ""; bv = b.category ?? ""; }
      else { av = a.status ?? ""; bv = b.status ?? ""; }
      return sortDir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
  }, [items, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ChevronUp className="h-3 w-3 opacity-30" />;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  }

  if (loading) return <div className="py-12 text-center text-muted-foreground text-sm">Loading…</div>;
  if (!items.length) return <div className="py-12 text-center text-muted-foreground text-sm">No items found.</div>;

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">#</TableHead>
            <TableHead>Subject / From</TableHead>
            <TableHead>
              <button className="flex items-center gap-1" onClick={() => toggleSort("category")}>
                Category <SortIcon k="category" />
              </button>
            </TableHead>
            <TableHead>
              <button className="flex items-center gap-1" onClick={() => toggleSort("status")}>
                Status <SortIcon k="status" />
              </button>
            </TableHead>
            <TableHead>
              <button className="flex items-center gap-1" onClick={() => toggleSort("dueAt")}>
                Due <SortIcon k="dueAt" />
              </button>
            </TableHead>
            <TableHead>
              <button className="flex items-center gap-1" onClick={() => toggleSort("receivedAt")}>
                Received <SortIcon k="receivedAt" />
              </button>
            </TableHead>
            {showHandler && <TableHead>Handler</TableHead>}
            <TableHead className="w-8" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map(item => {
            const isOverdue = item.dueAt && new Date(item.dueAt) < new Date() && item.status !== "resolved";
            return (
              <TableRow key={item.id} className={item.isDemand ? "bg-red-50/30" : ""}>
                <TableCell className="text-xs text-muted-foreground">{item.id}</TableCell>
                <TableCell className="max-w-xs">
                  <Link href={`/mailroom/${item.id}`} className="hover:underline font-medium text-sm line-clamp-1">
                    {item.subject ?? "(no subject)"}
                  </Link>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    {item.source === "mail" ? "📠" : "📧"} {item.fromEmail ?? item.fromName ?? "—"}
                    {item.isDemand === 1 && <span className="ml-1 text-red-600 font-medium">DEMAND</span>}
                  </div>
                </TableCell>
                <TableCell><CategoryBadge cat={item.category} /></TableCell>
                <TableCell><StatusBadge status={item.status} /></TableCell>
                <TableCell className={`text-xs ${isOverdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                  {isOverdue && <Clock className="inline h-3 w-3 mr-1" />}
                  {fmtDate(item.dueAt)}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{fmtRelative(item.receivedAt)}</TableCell>
                {showHandler && (
                  <TableCell className="text-xs text-muted-foreground">
                    {item.assignedHandlerId ?? "—"}
                  </TableCell>
                )}
                <TableCell><ItemActions item={item} /></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Handler Mailroom view ────────────────────────────────────────────────────

function HandlerMailroom() {
  const [filter, setFilter] = useState<"all" | "overdue" | "legal" | "resolved">("all");
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch } = trpc.mail.myMailroom.useQuery({
    overdue: filter === "overdue" ? true : undefined,
    legalOnly: filter === "legal" ? true : undefined,
    showResolved: filter === "resolved" ? true : undefined,
    status: filter === "resolved" ? "resolved" : undefined,
  });

  const filtered = useMemo(() => {
    if (!data?.items) return [];
    if (!search.trim()) return data.items;
    const q = search.toLowerCase();
    return data.items.filter(i =>
      (i.subject ?? "").toLowerCase().includes(q) ||
      (i.fromEmail ?? "").toLowerCase().includes(q) ||
      (i.claimNumber ?? "").toLowerCase().includes(q)
    );
  }, [data?.items, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1">
          {(["all", "overdue", "legal", "resolved"] as const).map(f => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              onClick={() => setFilter(f)}
              className="capitalize"
            >
              {f === "legal" ? "Legal & Demands" : f === "overdue" ? "⏰ Overdue" : f.charAt(0).toUpperCase() + f.slice(1)}
            </Button>
          ))}
        </div>
        <Input
          className="max-w-xs h-8"
          placeholder="Search subject, email, claim #…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <Button size="sm" variant="ghost" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>
      <MailTable items={filtered} loading={isLoading} />
    </div>
  );
}

// ─── Admin: All Mail queue ────────────────────────────────────────────────────

function AdminAllMail() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch } = trpc.mail.adminQueue.useQuery({
    status: statusFilter !== "all" ? (statusFilter as any) : undefined,
    category: categoryFilter !== "all" ? categoryFilter : undefined,
  });

  const filtered = useMemo(() => {
    if (!data?.items) return [];
    if (!search.trim()) return data.items;
    const q = search.toLowerCase();
    return data.items.filter(i =>
      (i.subject ?? "").toLowerCase().includes(q) ||
      (i.fromEmail ?? "").toLowerCase().includes(q) ||
      (i.claimNumber ?? "").toLowerCase().includes(q)
    );
  }, [data?.items, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="assigned">Assigned</SelectItem>
            <SelectItem value="escalated">Escalated</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-44 h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="max-w-xs h-8"
          placeholder="Search…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <Button size="sm" variant="ghost" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>
      <MailTable items={filtered} showHandler loading={isLoading} />
    </div>
  );
}

// ─── Admin: Mail Log with CSV export ─────────────────────────────────────────

function AdminMailLog() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data, isLoading } = trpc.mail.log.useQuery({
    status: statusFilter !== "all" ? (statusFilter as any) : undefined,
    category: categoryFilter !== "all" ? categoryFilter : undefined,
    source: sourceFilter !== "all" ? (sourceFilter as any) : undefined,
  });

  const filtered = useMemo(() => {
    if (!data?.items) return [];
    if (!search.trim()) return data.items;
    const q = search.toLowerCase();
    return data.items.filter(i =>
      (i.subject ?? "").toLowerCase().includes(q) ||
      (i.fromEmail ?? "").toLowerCase().includes(q) ||
      (i.claimNumber ?? "").toLowerCase().includes(q)
    );
  }, [data?.items, search]);

  function exportCSV() {
    if (!filtered.length) return;
    const headers = ["ID", "Source", "Subject", "From", "Category", "Status", "Claim #", "Due At", "Received At", "Resolved At"];
    const rows = filtered.map(i => [
      i.id, i.source, `"${(i.subject ?? "").replace(/"/g, '""')}"`,
      i.fromEmail ?? "", i.category ?? "", i.status,
      i.claimNumber ?? "",
      i.dueAt ? new Date(i.dueAt).toISOString() : "",
      new Date(i.receivedAt).toISOString(),
      i.resolvedAt ? new Date(i.resolvedAt).toISOString() : "",
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `mail-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="assigned">Assigned</SelectItem>
            <SelectItem value="escalated">Escalated</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-44 h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="mail">Fax / Slack</SelectItem>
          </SelectContent>
        </Select>
        <Input
          className="max-w-xs h-8"
          placeholder="Search…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <Button size="sm" variant="outline" onClick={exportCSV} disabled={!filtered.length}>
          <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
        </Button>
      </div>
      <div className="text-xs text-muted-foreground">{filtered.length} items</div>
      <MailTable items={filtered} showHandler loading={isLoading} />
    </div>
  );
}

// ─── Admin: Legal & Demands ───────────────────────────────────────────────────

function AdminLegalQueue() {
  const { data, isLoading, refetch } = trpc.mail.legalQueue.useQuery();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Active legal items and demands sorted by response due date.
        </p>
        <Button size="sm" variant="ghost" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>
      <MailTable items={data?.items ?? []} showHandler loading={isLoading} />
    </div>
  );
}

// ─── Admin: Stats board ───────────────────────────────────────────────────────

function AdminStats() {
  const { data, isLoading } = trpc.mail.stats.useQuery();

  const cards = [
    { label: "Total Items", value: data?.total, icon: Mail, color: "text-blue-600" },
    { label: "Open / Active", value: data?.open, icon: Inbox, color: "text-green-600" },
    { label: "Resolved", value: data?.resolved, icon: CheckCircle, color: "text-gray-500" },
    { label: "Overdue", value: data?.overdue, icon: Clock, color: "text-orange-600" },
    { label: "Legal / Demands", value: data?.legal, icon: Scale, color: "text-red-600" },
    { label: "Needs Review", value: data?.needsReview, icon: AlertTriangle, color: "text-yellow-600" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {cards.map(c => (
        <Card key={c.label}>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <c.icon className={`h-5 w-5 ${c.color}`} />
              <div>
                <div className="text-2xl font-bold">
                  {isLoading ? "—" : (c.value ?? 0)}
                </div>
                <div className="text-xs text-muted-foreground">{c.label}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Main Mailroom page ───────────────────────────────────────────────────────

export default function Mailroom() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isHandler = !!user?.handlerProfileId;

  // Pending count badge
  const { data: pendingData } = trpc.mail.myPendingCount.useQuery(undefined, {
    enabled: isHandler,
    refetchInterval: 60000,
  });
  const pendingCount = pendingData?.count ?? 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Mail className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Mailroom</h1>
        {isHandler && pendingCount > 0 && (
          <Badge variant="destructive" className="text-xs">{pendingCount} pending</Badge>
        )}
      </div>

      {isAdmin ? (
        <Tabs defaultValue="queue">
          <TabsList>
            <TabsTrigger value="queue"><Inbox className="h-3.5 w-3.5 mr-1.5" />All Mail</TabsTrigger>
            <TabsTrigger value="legal"><Scale className="h-3.5 w-3.5 mr-1.5" />Legal & Demands</TabsTrigger>
            <TabsTrigger value="log"><FileText className="h-3.5 w-3.5 mr-1.5" />Mail Log</TabsTrigger>
            <TabsTrigger value="stats"><BarChart3 className="h-3.5 w-3.5 mr-1.5" />Stats</TabsTrigger>
            {isHandler && (
              <TabsTrigger value="mine">
                My Queue
                {pendingCount > 0 && (
                  <Badge variant="destructive" className="ml-1.5 text-xs">{pendingCount}</Badge>
                )}
              </TabsTrigger>
            )}
          </TabsList>
          <TabsContent value="queue" className="mt-4"><AdminAllMail /></TabsContent>
          <TabsContent value="legal" className="mt-4"><AdminLegalQueue /></TabsContent>
          <TabsContent value="log" className="mt-4"><AdminMailLog /></TabsContent>
          <TabsContent value="stats" className="mt-4"><AdminStats /></TabsContent>
          {isHandler && <TabsContent value="mine" className="mt-4"><HandlerMailroom /></TabsContent>}
        </Tabs>
      ) : isHandler ? (
        <HandlerMailroom />
      ) : (
        <div className="py-12 text-center text-muted-foreground">
          You need a handler profile to access the Mailroom.
        </div>
      )}
    </div>
  );
}
