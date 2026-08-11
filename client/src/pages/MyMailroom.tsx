/**
 * /my-mailroom — Personal handler queue (redesigned per mockup)
 * Full-width layout, 5 stat cards, dense table with signal column,
 * right-side Sheet drawer on row click (no page navigation).
 */
import { useState, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import WhipLayout from "@/components/WhipLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Mail, Clock, AlertTriangle, Scale, FileText, RefreshCw,
  MoreHorizontal, ArrowRight, CheckCircle, AlertCircle,
  ChevronLeft, ChevronRight, Download, Search, Filter,
  ExternalLink, Bell, Paperclip,
} from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow, isToday, isPast } from "date-fns";

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  injury_pip_bi: "Injury / PIP / BI",
  inbound_subro: "Inbound Subro",
  existing_claim_followup: "Claim Follow-Up",
  outbound_subro: "OB Subro",
  total_loss: "Total Loss",
  legal_or_high_risk: "Legal",
  other_or_unclear: "General",
};

const CATEGORY_COLORS: Record<string, string> = {
  injury_pip_bi: "bg-blue-100 text-blue-800 border-blue-200",
  inbound_subro: "bg-purple-100 text-purple-800 border-purple-200",
  existing_claim_followup: "bg-gray-100 text-gray-700 border-gray-200",
  outbound_subro: "bg-indigo-100 text-indigo-800 border-indigo-200",
  total_loss: "bg-orange-100 text-orange-800 border-orange-200",
  legal_or_high_risk: "bg-red-100 text-red-800 border-red-200",
  other_or_unclear: "bg-gray-100 text-gray-700 border-gray-200",
};

const STATUS_COLORS: Record<string, string> = {
  new: "bg-slate-100 text-slate-700",
  assigned: "bg-green-100 text-green-800",
  escalated: "bg-amber-100 text-amber-800",
  resolved: "bg-gray-100 text-gray-600",
  review: "bg-yellow-100 text-yellow-800",
  needs_review: "bg-yellow-100 text-yellow-800",
};

type FilterTab = "all" | "overdue" | "urgent" | "legal" | "demands" | "resolved";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "just now";
  return formatDistanceToNow(d, { addSuffix: true })
    .replace("about ", "")
    .replace(" ago", " ago");
}

function dueLabel(dueAt: Date | string | null | undefined) {
  if (!dueAt) return null;
  const d = new Date(dueAt);
  if (isNaN(d.getTime())) return null;
  if (isPast(d) && !isToday(d)) return { text: "Overdue", color: "text-red-600" };
  if (isToday(d)) return { text: "Due today", color: "text-amber-600" };
  return null;
}

function SignalDot({ item }: { item: any }) {
  const due = item.dueAt ? new Date(item.dueAt) : null;
  const overdue = due && isPast(due) && !isToday(due);
  const urgent = item.urgency === "urgent";
  const legal = item.category === "legal_or_high_risk";
  const demand = item.isDemand === 1;

  if (overdue) return <span className="inline-block w-2 h-2 rounded-full bg-red-500 mt-0.5" title="Overdue" />;
  if (urgent) return <span className="inline-block w-2 h-2 rounded-full bg-amber-500 mt-0.5" title="Urgent" />;
  if (legal) return <Scale className="w-3.5 h-3.5 text-blue-600 mt-0.5" aria-label="Legal" />;
  if (demand) return <FileText className="w-3.5 h-3.5 text-indigo-600 mt-0.5" aria-label="Demand" />;
  return <span className="inline-block w-2 h-2 rounded-full bg-transparent" />;
}

// ─── Drawer ───────────────────────────────────────────────────────────────────

function MailDrawer({
  itemId,
  open,
  onClose,
  onActionSuccess,
}: {
  itemId: number | null;
  open: boolean;
  onClose: () => void;
  onActionSuccess: () => void;
}) {
  const [, navigate] = useLocation();
  const [noteText, setNoteText] = useState("");
  const [reminderDate, setReminderDate] = useState("");
  const [showReminderInput, setShowReminderInput] = useState(false);
  const [showRerouteDialog, setShowRerouteDialog] = useState(false);
  const [rerouteHandlerId, setRerouteHandlerId] = useState("");
  const [rerouteReason, setRerouteReason] = useState("");
  const [uploadingFile, setUploadingFile] = useState(false);

  const { data, isLoading, refetch } = trpc.mail.getItem.useQuery(
    { id: itemId! },
    { enabled: open && itemId != null }
  );

  const utils = trpc.useUtils();
  const invalidate = useCallback(() => {
    utils.mail.myMailroom.invalidate();
    utils.mail.myMailroomStats.invalidate();
    utils.mail.myPendingCount.invalidate();
    onActionSuccess();
  }, [utils, onActionSuccess]);

  const resolveMut = trpc.mail.resolve.useMutation({
    onSuccess: () => { toast.success("Resolved"); invalidate(); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const escalateMut = trpc.mail.escalate.useMutation({
    onSuccess: () => { toast.success("Escalated"); invalidate(); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const rerouteMut = trpc.mail.reroute.useMutation({
    onSuccess: () => { toast.success("Rerouted"); invalidate(); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const addNoteMut = trpc.mail.addNote.useMutation({
    onSuccess: () => { toast.success("Note added"); setNoteText(""); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const reminderMut = trpc.mail.setReminder.useMutation({
    onSuccess: () => { toast.success("Reminder set"); setShowReminderInput(false); setReminderDate(""); },
    onError: (e) => toast.error(e.message),
  });

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !itemId) return;
    setUploadingFile(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const resp = await fetch(`/api/mail/${itemId}/files`, { method: "POST", body: fd });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "Upload failed");
      toast.success(`${file.name} attached`);
      refetch();
    } catch (err: any) {
      toast.error(err.message ?? "Upload failed");
    } finally {
      setUploadingFile(false);
      e.target.value = "";
    }
  }
  const item = data?.item;
  const files = data?.files ?? [];
  const notes = data?.notes ?? [];
  const history = data?.history ?? [];

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <SheetContent side="right" className="w-[480px] sm:w-[520px] overflow-y-auto p-0 flex flex-col">
          <SheetHeader className="sr-only">
            <SheetTitle>Mail Item Detail</SheetTitle>
          </SheetHeader>
          {isLoading || !item ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              {isLoading ? "Loading…" : "No item selected"}
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="px-5 pt-5 pb-3 border-b">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-snug line-clamp-2">
                    {item.subject || "(No subject)"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {item.fromEmail} · {item.receivedAt ? format(new Date(item.receivedAt), "MMM d, yyyy, h:mm a") : "—"}
                  </p>
                </div>
                {/* Badges */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {item.category && (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${CATEGORY_COLORS[item.category] ?? "bg-gray-100 text-gray-700"}`}>
                      {CATEGORY_LABELS[item.category] ?? item.category}
                    </span>
                  )}
                  {item.status && (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[item.status] ?? "bg-gray-100 text-gray-700"}`}>
                      {item.status}
                    </span>
                  )}
                  {item.assignedHandlerId && item.dueAt && isPast(new Date(item.dueAt)) && !isToday(new Date(item.dueAt)) && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">Overdue</span>
                  )}
                  {item.urgency === "urgent" && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">Urgent</span>
                  )}
                  {item.category === "legal_or_high_risk" && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">Legal</span>
                  )}
                  {item.isDemand === 1 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700">Demand</span>
                  )}
                </div>
              </div>

              {/* Body */}
              <div className="px-5 py-3 border-b">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Message Body</p>
                <div className="text-sm text-foreground max-h-36 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                  {item.bodyText || <span className="text-muted-foreground italic">No body content</span>}
                </div>
              </div>

              {/* Claim Information */}
              <div className="px-5 py-3 border-b">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Claim Information</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  <div>
                    <span className="text-muted-foreground text-xs">Claim #</span>
                    <p className="font-medium">{item.claimNumber || "—"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Loss Date</span>
                    <p className="font-medium">{item.dateOfLoss ? format(new Date(item.dateOfLoss), "MMM d, yyyy") : "—"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Urgency</span>
                    <p className="font-medium capitalize">{item.urgency || "normal"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Confidence</span>
                    <p className="font-medium">{item.confidence != null ? `${item.confidence}%` : "—"}</p>
                  </div>
                </div>
              </div>

              {/* Actions 2×2 */}
              <div className="px-5 py-3 border-b">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Actions</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" variant="outline" className="justify-start gap-1.5 text-xs"
                    onClick={() => setShowRerouteDialog(true)}>
                    <ArrowRight className="w-3.5 h-3.5" /> Reroute
                  </Button>
                  {item.isDemand === 1 ? (
                    <>
                      <Button size="sm" variant="outline" className="justify-start gap-1.5 text-xs text-green-700"
                        onClick={() => resolveMut.mutate({ itemId: item.id, outcome: "settled" })}
                        disabled={resolveMut.isPending}>
                        <CheckCircle className="w-3.5 h-3.5 text-green-600" /> Settled
                      </Button>
                      <Button size="sm" variant="outline" className="justify-start gap-1.5 text-xs text-red-700"
                        onClick={() => resolveMut.mutate({ itemId: item.id, outcome: "denied" })}
                        disabled={resolveMut.isPending}>
                        <AlertCircle className="w-3.5 h-3.5 text-red-600" /> Denied
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="outline" className="justify-start gap-1.5 text-xs"
                      onClick={() => resolveMut.mutate({ itemId: item.id, outcome: "other" })}
                      disabled={resolveMut.isPending}>
                      <CheckCircle className="w-3.5 h-3.5 text-green-600" /> Resolve
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="justify-start gap-1.5 text-xs"
                    onClick={() => escalateMut.mutate({ itemId: item.id, reason: "Escalated from mailroom" })}
                    disabled={escalateMut.isPending}>
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600" /> Escalate
                  </Button>
                  <Button size="sm" variant="outline" className="justify-start gap-1.5 text-xs"
                    onClick={() => setShowReminderInput(true)}>
                    <Bell className="w-3.5 h-3.5 text-blue-600" /> Set Reminder
                  </Button>
                </div>
                {showReminderInput && (
                  <div className="mt-2 flex gap-2">
                    <Input type="datetime-local" className="text-xs h-8 flex-1"
                      value={reminderDate} onChange={e => setReminderDate(e.target.value)} />
                    <Button size="sm" className="h-8 text-xs" disabled={!reminderDate || reminderMut.isPending}
                      onClick={() => reminderMut.mutate({ itemId: item.id, remindAt: new Date(reminderDate) })}>
                      Set
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setShowReminderInput(false)}>
                      Cancel
                    </Button>
                  </div>
                )}
              </div>

              {/* Open in Full View */}
              <div className="px-5 py-3 border-b">
                <Button className="w-full gap-2 text-sm" variant="default"
                  onClick={() => { onClose(); navigate(`/mailroom/${item.id}`); }}>
                  <ExternalLink className="w-4 h-4" /> Open in Full View
                </Button>
              </div>

              {/* Notes */}
              <div className="px-5 py-3 border-b">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Notes ({notes.length})
                  </p>
                </div>
                <div className="space-y-2 max-h-32 overflow-y-auto mb-2">
                  {notes.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No notes yet</p>
                  ) : notes.map((n: any) => (
                    <div key={n.id} className="text-xs bg-muted/40 rounded p-2">
                      <p className="text-muted-foreground mb-0.5">{n.createdAt ? format(new Date(n.createdAt), "M/d/yy, h:mm a") : ""}</p>
                      <p>{n.note}</p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input placeholder="Add a note…" className="text-xs h-8 flex-1"
                    value={noteText} onChange={e => setNoteText(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && noteText.trim()) addNoteMut.mutate({ itemId: item.id, note: noteText.trim() }); }} />
                  <Button size="sm" className="h-8 text-xs" disabled={!noteText.trim() || addNoteMut.isPending}
                    onClick={() => addNoteMut.mutate({ itemId: item.id, note: noteText.trim() })}>
                    Add
                  </Button>
                </div>
              </div>

              {/* Attachments */}
              <div className="px-5 py-3 border-b">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Attachments {files.length > 0 ? `(${files.length})` : ""}
                  </p>
                  <label className={`flex items-center gap-1 text-xs cursor-pointer text-primary hover:underline ${uploadingFile ? "opacity-50 pointer-events-none" : ""}`}>
                    <Paperclip className="w-3 h-3" />
                    {uploadingFile ? "Uploading…" : "Attach file"}
                    <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploadingFile} />
                  </label>
                </div>
                {files.length > 0 ? (
                  <div className="space-y-3">
                    {files.map((f: any) => {
                      const name = f.filename || f.storageKey?.split("/").pop() || "File";
                      const openUrl = f.proxyUrl ?? (f.storageKey ? `/api/mail/file-proxy?storageKey=${encodeURIComponent(f.storageKey)}` : null);
                      return (
                        <div key={f.id} className="flex items-center justify-between border rounded-lg px-3 py-2 bg-muted/20">
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                            <span className="truncate text-sm font-medium">{name}</span>
                          </div>
                          {openUrl && (
                            <a href={openUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1 shrink-0 text-xs ml-2">
                              <Download className="w-3 h-3" /> Open
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No attachments yet.</p>
                )}
              </div>

              {/* Routing History */}
              {history.length > 0 && (
                <div className="px-5 py-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Routing History
                  </p>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {history.map((h: any) => (
                      <div key={h.id} className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground capitalize">{h.action}</span>
                        {h.reason ? ` — ${h.reason}` : ""}
                        <span className="ml-1 text-muted-foreground/70">
                          · {h.createdAt ? format(new Date(h.createdAt), "M/d/yy, h:mm a") : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Reroute Dialog */}
      <Dialog open={showRerouteDialog} onOpenChange={setShowRerouteDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Reroute Mail Item</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Handler ID</Label>
              <Input placeholder="Handler ID (number)" value={rerouteHandlerId}
                onChange={e => setRerouteHandlerId(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Reason (optional)</Label>
              <Textarea placeholder="Reason for reroute…" value={rerouteReason}
                onChange={e => setRerouteReason(e.target.value)} className="mt-1 h-20" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRerouteDialog(false)}>Cancel</Button>
            <Button disabled={!rerouteHandlerId || rerouteMut.isPending}
              onClick={() => {
                if (item) rerouteMut.mutate({
                  itemId: item.id,
                  toHandlerId: Number(rerouteHandlerId),
                  reason: rerouteReason || undefined,
                });
                setShowRerouteDialog(false);
              }}>
              Reroute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MyMailroom() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Build query input based on active tab
  const queryInput = useMemo(() => {
    switch (activeTab) {
      case "overdue": return { overdue: true };
      case "legal": return { legalOnly: true };
      case "demands": return { legalOnly: true };
      case "resolved": return { showResolved: true, status: "resolved" as const };
      default: return {};
    }
  }, [activeTab]);

  const { data, isLoading, refetch } = trpc.mail.myMailroom.useQuery(queryInput, {
    refetchInterval: 60_000,
  });
  const { data: stats } = trpc.mail.myMailroomStats.useQuery(undefined, {
    refetchInterval: 60_000,
  });
  const { data: pendingData } = trpc.mail.myPendingCount.useQuery(undefined, { refetchInterval: 30000 });

  // Client-side filter for urgent tab and search
  const filteredItems = useMemo(() => {
    let items = data?.items ?? [];
    if (activeTab === "urgent") items = items.filter((i: any) => i.urgency === "urgent");
    if (activeTab === "demands") items = items.filter((i: any) => i.isDemand === 1);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((i: any) =>
        (i.subject ?? "").toLowerCase().includes(q) ||
        (i.fromEmail ?? "").toLowerCase().includes(q) ||
        (i.claimNumber ?? "").toLowerCase().includes(q)
      );
    }
    return items;
  }, [data, activeTab, search]);

  const totalItems = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const pagedItems = filteredItems.slice((page - 1) * pageSize, page * pageSize);
  const showFrom = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const showTo = Math.min(page * pageSize, totalItems);

  const handleTabChange = (tab: FilterTab) => {
    setActiveTab(tab);
    setPage(1);
  };

  const handleRowClick = (id: number) => {
    setSelectedId(id);
    setDrawerOpen(true);
  };

  const TABS: { key: FilterTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "overdue", label: "Overdue" },
    { key: "urgent", label: "Urgent" },
    { key: "legal", label: "Legal & Demands" },
    { key: "demands", label: "Demands" },
    { key: "resolved", label: "Resolved" },
  ];

  return (
    <WhipLayout>
      <div className="flex flex-col h-full min-h-0 w-full px-6 py-5 gap-4">

        {/* Page Header */}
        <div className="flex items-center gap-3">
          <Mail className="w-5 h-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">My Mailroom</h1>
          {pendingData && pendingData.count > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-500 text-white">
              {pendingData.count} pending
            </span>
          )}
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-5 gap-3">
          {[
            {
              key: "overdue" as FilterTab,
              label: "Overdue",
              count: stats?.overdue ?? 0,
              icon: <Clock className="w-5 h-5 text-red-500" />,
              countColor: "text-red-600",
              linkColor: "text-red-500 hover:text-red-700",
              linkLabel: "View overdue",
            },
            {
              key: "urgent" as FilterTab,
              label: "Urgent",
              count: stats?.urgent ?? 0,
              icon: <AlertTriangle className="w-5 h-5 text-amber-500" />,
              countColor: "text-amber-600",
              linkColor: "text-amber-500 hover:text-amber-700",
              linkLabel: "View urgent",
            },
            {
              key: "legal" as FilterTab,
              label: "Legal & Demands",
              count: stats?.legal ?? 0,
              icon: <Scale className="w-5 h-5 text-blue-500" />,
              countColor: "text-blue-700",
              linkColor: "text-blue-500 hover:text-blue-700",
              linkLabel: "View legal",
            },
            {
              key: "demands" as FilterTab,
              label: "Demands",
              count: stats?.demands ?? 0,
              icon: <FileText className="w-5 h-5 text-indigo-500" />,
              countColor: "text-indigo-700",
              linkColor: "text-indigo-500 hover:text-indigo-700",
              linkLabel: "View demands",
            },
            {
              key: "all" as FilterTab,
              label: "All Pending",
              count: stats?.allPending ?? 0,
              icon: <Mail className="w-5 h-5 text-gray-500" />,
              countColor: "text-gray-800",
              linkColor: "text-gray-500 hover:text-gray-700",
              linkLabel: "View all",
            },
          ].map(card => (
            <div key={card.key} className="bg-card border rounded-lg px-4 py-3 flex flex-col gap-1 hover:shadow-sm transition-shadow">
              <div className="flex items-center gap-2">
                {card.icon}
                <span className="text-xs text-muted-foreground font-medium">{card.label}</span>
              </div>
              <p className={`text-2xl font-bold ${card.countColor}`}>{card.count}</p>
              <button
                onClick={() => handleTabChange(card.key)}
                className={`text-xs font-medium ${card.linkColor} text-left`}
              >
                {card.linkLabel}
              </button>
            </div>
          ))}
        </div>

        {/* Filter Tabs + Search */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-1">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeTab === tab.key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search subject, sender, claim #…"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="pl-8 h-8 text-xs"
              />
            </div>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
              <Filter className="w-3.5 h-3.5" /> Filter
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => refetch()} title="Refresh">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 min-h-0 border rounded-lg overflow-hidden bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-6 px-3" />
                <TableHead className="text-xs font-semibold">Subject / From</TableHead>
                <TableHead className="text-xs font-semibold w-36">Category</TableHead>
                <TableHead className="text-xs font-semibold w-32">Claim #</TableHead>
                <TableHead className="text-xs font-semibold w-24">Status</TableHead>
                <TableHead className="text-xs font-semibold w-32">Due</TableHead>
                <TableHead className="text-xs font-semibold w-24">Received</TableHead>
                <TableHead className="w-8 px-2" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-muted-foreground text-sm">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : pagedItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-muted-foreground text-sm">
                    No items found
                  </TableCell>
                </TableRow>
              ) : pagedItems.map((item: any) => {
                const dl = dueLabel(item.dueAt);
                return (
                  <TableRow
                    key={item.id}
                    className="cursor-pointer hover:bg-muted/40 transition-colors"
                    onClick={() => handleRowClick(item.id)}
                  >
                    {/* Signal */}
                    <TableCell className="px-3 py-2.5">
                      <div className="flex items-center justify-center">
                        <SignalDot item={item} />
                      </div>
                    </TableCell>
                    {/* Subject / From */}
                    <TableCell className="py-2.5">
                      <p className="text-sm font-medium leading-snug line-clamp-1">{item.subject || "(No subject)"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Mail className="w-3 h-3" /> {item.fromEmail || "—"}
                      </p>
                    </TableCell>
                    {/* Category */}
                    <TableCell className="py-2.5">
                      {item.category ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${CATEGORY_COLORS[item.category] ?? "bg-gray-100 text-gray-700"}`}>
                          {CATEGORY_LABELS[item.category] ?? item.category}
                        </span>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    {/* Claim # */}
                    <TableCell className="py-2.5 text-xs font-mono">
                      {item.claimNumber || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    {/* Status */}
                    <TableCell className="py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[item.status] ?? "bg-gray-100 text-gray-700"}`}>
                        {item.status || "—"}
                      </span>
                    </TableCell>
                    {/* Due */}
                    <TableCell className="py-2.5">
                      {item.dueAt ? (
                        <div>
                          <p className="text-xs">{format(new Date(item.dueAt), "MMM d, yyyy")}</p>
                          {dl && <p className={`text-xs font-medium ${dl.color}`}>{dl.text}</p>}
                        </div>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    {/* Received */}
                    <TableCell className="py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {relativeTime(item.receivedAt)}
                    </TableCell>
                    {/* ⋯ menu */}
                    <TableCell className="py-2.5 px-2" onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                            <MoreHorizontal className="w-3.5 h-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="text-xs">
                          <DropdownMenuItem onClick={() => handleRowClick(item.id)}>
                            <ArrowRight className="w-3.5 h-3.5 mr-2" /> Reroute
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleRowClick(item.id)}>
                            <CheckCircle className="w-3.5 h-3.5 mr-2" /> Resolve
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleRowClick(item.id)}>
                            <AlertCircle className="w-3.5 h-3.5 mr-2" /> Escalate
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleRowClick(item.id)}>
                            <Bell className="w-3.5 h-3.5 mr-2" /> Set Reminder
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Footer Pagination */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {totalItems === 0
              ? "No results"
              : `Showing ${showFrom}–${showTo} of ${totalItems} results`}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
              disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`h-7 w-7 rounded text-xs font-medium transition-colors ${
                  page === p ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                }`}
              >
                {p}
              </button>
            ))}
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
              disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
            <select
              aria-label="Rows per page"
              value={pageSize}
              onChange={(event) => {
                setPage(1);
                setPageSize(Number(event.currentTarget.value));
              }}
              className="h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {[10, 25, 50].map(s => <option key={s} value={s}>{s} / page</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Right-side Drawer */}
      <MailDrawer
        itemId={selectedId}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onActionSuccess={() => refetch()}
      />
    </WhipLayout>
  );
}
