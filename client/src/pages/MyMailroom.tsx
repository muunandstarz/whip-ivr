/**
 * /my-mailroom — Personal handler queue
 * Only accessible when the user has a handlerProfileId (or an admin is impersonating a handler).
 * Calls myMailroom (not adminQueue) — always scoped to the effective handler.
 */
import { useState, useMemo } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import WhipLayout from "@/components/WhipLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Mail, Clock, ArrowRight, CheckCircle, AlertCircle, MoreHorizontal,
  RefreshCw, ChevronUp, ChevronDown,
} from "lucide-react";
import { toast } from "sonner";

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

function RerouteDialog({ itemId, open, onClose }: { itemId: number; open: boolean; onClose: () => void }) {
  const [toHandlerId, setToHandlerId] = useState("");
  const [reason, setReason] = useState("");
  const utils = trpc.useUtils();
  const { data: handlers } = trpc.handlers.list.useQuery();
  const reroute = trpc.mail.reroute.useMutation({
    onSuccess: () => { toast.success("Rerouted"); utils.mail.myMailroom.invalidate(); utils.mail.myPendingCount.invalidate(); onClose(); },
    onError: e => toast.error(e.message),
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
              <SelectContent>{handlers?.map(h => <SelectItem key={h.id} value={String(h.id)}>{h.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Reason (optional)</Label>
            <Textarea className="mt-1" value={reason} onChange={e => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!toHandlerId || reroute.isPending}
            onClick={() => reroute.mutate({ itemId, toHandlerId: Number(toHandlerId), reason: reason || undefined })}>
            {reroute.isPending ? "Rerouting…" : "Reroute"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResolveDialog({ itemId, open, onClose }: { itemId: number; open: boolean; onClose: () => void }) {
  const [note, setNote] = useState("");
  const utils = trpc.useUtils();
  const resolve = trpc.mail.resolve.useMutation({
    onSuccess: () => { toast.success("Resolved"); utils.mail.myMailroom.invalidate(); utils.mail.myPendingCount.invalidate(); onClose(); },
    onError: e => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Resolve Item</DialogTitle></DialogHeader>
        <div className="py-2">
          <Label>Note (optional)</Label>
          <Textarea className="mt-1" value={note} onChange={e => setNote(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={resolve.isPending}
            onClick={() => resolve.mutate({ itemId, note: note || undefined })}>
            {resolve.isPending ? "Resolving…" : "Mark Resolved"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ItemRow({ item }: { item: any }) {
  const [rerouteOpen, setRerouteOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const utils = trpc.useUtils();
  const escalate = trpc.mail.escalate.useMutation({
    onSuccess: () => { toast.success("Escalated"); utils.mail.myMailroom.invalidate(); },
    onError: e => toast.error(e.message),
  });
  const isOverdue = item.dueAt && new Date(item.dueAt) < new Date() && item.status !== "resolved";
  return (
    <>
      <TableRow className={item.isDemand ? "bg-red-50/30" : ""}>
        <TableCell className="max-w-xs">
          <Link href={`/mailroom/${item.id}`} className="hover:underline font-medium text-sm line-clamp-1">
            {item.subject ?? "(no subject)"}
          </Link>
          <div className="text-xs text-muted-foreground mt-0.5">
            {item.source === "mail" ? "📠" : "📧"} {item.fromEmail ?? item.fromName ?? "—"}
            {item.isDemand === 1 && <span className="ml-1 text-red-600 font-medium">DEMAND</span>}
          </div>
        </TableCell>
        <TableCell>
          {item.category ? (
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_COLORS[item.category] ?? "bg-gray-100 text-gray-700"}`}>
              {CATEGORY_LABELS[item.category] ?? item.category}
            </span>
          ) : <span className="text-muted-foreground text-xs">—</span>}
        </TableCell>
        <TableCell>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            item.status === "resolved" ? "bg-gray-100 text-gray-500" :
            item.status === "escalated" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
          }`}>{item.status}</span>
        </TableCell>
        <TableCell className={`text-xs ${isOverdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
          {isOverdue && <Clock className="inline h-3 w-3 mr-1" />}
          {fmtDate(item.dueAt)}
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">{fmtRelative(item.receivedAt)}</TableCell>
        <TableCell>
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
        </TableCell>
      </TableRow>
      <RerouteDialog itemId={item.id} open={rerouteOpen} onClose={() => setRerouteOpen(false)} />
      <ResolveDialog itemId={item.id} open={resolveOpen} onClose={() => setResolveOpen(false)} />
    </>
  );
}

export default function MyMailroom() {
  const { user } = useAuth();
  const isHandler = !!user?.handlerProfileId;

  const [filter, setFilter] = useState<"all" | "overdue" | "legal" | "resolved">("all");
  const [search, setSearch] = useState("");

  const { data: pendingData } = trpc.mail.myPendingCount.useQuery(undefined, {
    enabled: isHandler,
    refetchInterval: 60000,
  });
  const pendingCount = pendingData?.count ?? 0;

  const { data, isLoading, refetch } = trpc.mail.myMailroom.useQuery({
    overdue: filter === "overdue" ? true : undefined,
    legalOnly: filter === "legal" ? true : undefined,
    showResolved: filter === "resolved" ? true : undefined,
  }, { enabled: isHandler });

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

  if (!isHandler) {
    return (
      <WhipLayout>
        <div className="p-6 text-center text-muted-foreground py-12">
          You need a handler profile to access the personal mailroom.
        </div>
      </WhipLayout>
    );
  }

  return (
    <WhipLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Mail className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">My Mailroom</h1>
          {pendingCount > 0 && (
            <Badge variant="destructive" className="text-xs">{pendingCount} pending</Badge>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-1">
            {(["all", "overdue", "legal", "resolved"] as const).map(f => (
              <Button
                key={f}
                size="sm"
                variant={filter === f ? "default" : "outline"}
                onClick={() => setFilter(f)}
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

        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">No items found.</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject / From</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(item => <ItemRow key={item.id} item={item} />)}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </WhipLayout>
  );
}
