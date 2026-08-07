import { useState, useMemo, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import WhipLayout from "@/components/WhipLayout";
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
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Mail, Inbox, AlertTriangle, Scale, BarChart3, Filter, Download,
  MoreHorizontal, ArrowRight, CheckCircle, AlertCircle, Clock,
  ExternalLink, FileText, RefreshCw, ChevronUp, ChevronDown,
  Settings2, Zap, Wifi, WifiOff, PlusCircle, Paperclip,
  TrendingUp, TrendingDown, Minus, ChevronLeft, ChevronRight,
  Bell, Edit2, Mail as MailIcon,
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

function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return format(new Date(d), "M/d/yy");
}
function fmtRelative(d: Date | string | null | undefined) {
  if (!d) return "—";
  return formatDistanceToNow(new Date(d), { addSuffix: true });
}
function CategoryBadge({ cat }: { cat: string | null | undefined }) {
  if (!cat) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs border ${CATEGORY_COLORS[cat] ?? "bg-gray-100 text-gray-700"}`}>
      {CATEGORY_LABELS[cat] ?? cat}
    </span>
  );
}

// Flag-aware status pill (overdue > urgent > legal > demand > raw status)
function StatusPill({ item }: { item: any }) {
  const isOverdue = item.dueAt && isPast(new Date(item.dueAt)) && item.status !== "resolved";
  const isUrgent = item.urgency === "urgent" && item.status !== "resolved";
  const isLegal = item.category === "legal_or_high_risk" && item.status !== "resolved";
  const isDemand = item.isDemand === 1 && item.status !== "resolved";
  if (isOverdue) return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-800 border border-red-200 font-medium"><Clock className="w-3 h-3" />Overdue</span>;
  if (isUrgent) return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-amber-100 text-amber-800 border border-amber-200 font-medium"><AlertTriangle className="w-3 h-3" />Urgent</span>;
  if (isLegal) return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-purple-100 text-purple-800 border border-purple-200 font-medium"><Scale className="w-3 h-3" />Legal</span>;
  if (isDemand) return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-red-50 text-red-700 border border-red-200 font-medium"><FileText className="w-3 h-3" />Demand</span>;
  if (item.status === "resolved") return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-800 border border-green-200"><CheckCircle className="w-3 h-3" />Resolved</span>;
  if (item.status === "escalated") return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-orange-100 text-orange-800 border border-orange-200"><AlertCircle className="w-3 h-3" />Escalated</span>;
  if (item.status === "assigned") return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-blue-50 text-blue-700 border border-blue-200">Assigned</span>;
  return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-700 border border-gray-200">New</span>;
}

// Row left-border color
function rowBorderClass(item: any) {
  const isOverdue = item.dueAt && isPast(new Date(item.dueAt)) && item.status !== "resolved";
  const isUrgent = item.urgency === "urgent" && item.status !== "resolved";
  const isLegal = item.category === "legal_or_high_risk" && item.status !== "resolved";
  if (isOverdue) return "border-l-4 border-l-red-500";
  if (isUrgent) return "border-l-4 border-l-amber-500";
  if (isLegal) return "border-l-4 border-l-purple-500";
  return "border-l-4 border-l-transparent";
}

// Source type icon
function SourceIcon({ source }: { source: string }) {
  if (source === "email") return <MailIcon className="w-3.5 h-3.5 text-blue-500" aria-label="Email" />;
  if (source === "fax") return <span className="text-xs text-gray-500 font-mono">FAX</span>;
  return <span className="text-xs text-gray-500">📄</span>;
}

// Delta indicator
function Delta({ n }: { n: number }) {
  if (n === 0) return <span className="text-xs text-muted-foreground flex items-center gap-0.5"><Minus className="w-3 h-3" />0</span>;
  if (n > 0) return <span className="text-xs text-red-600 flex items-center gap-0.5"><TrendingUp className="w-3 h-3" />+{n}</span>;
  return <span className="text-xs text-green-600 flex items-center gap-0.5"><TrendingDown className="w-3 h-3" />{n}</span>;
}

// ─── Admin Drawer ─────────────────────────────────────────────────────────────
function AdminDrawer({
  itemId, open, onClose, onActionSuccess,
}: {
  itemId: number | null; open: boolean; onClose: () => void; onActionSuccess: () => void;
}) {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState("details");
  const [noteText, setNoteText] = useState("");
  const [showRerouteDialog, setShowRerouteDialog] = useState(false);
  const [rerouteHandlerId, setRerouteHandlerId] = useState("");
  const [rerouteReason, setRerouteReason] = useState("");
  const [showReminderInput, setShowReminderInput] = useState(false);
  const [reminderDate, setReminderDate] = useState("");
  const [showEditRouting, setShowEditRouting] = useState(false);
  const [editHandlerId, setEditHandlerId] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [uploadingFile, setUploadingFile] = useState(false);

  const { data, isLoading, refetch } = trpc.mail.getItem.useQuery(
    { id: itemId! },
    { enabled: open && itemId != null }
  );
  const { data: handlers } = trpc.handlers.list.useQuery();
  const utils = trpc.useUtils();
  const invalidate = useCallback(() => {
    utils.mail.adminQueue.invalidate();
    utils.mail.adminStats.invalidate();
    onActionSuccess();
  }, [utils, onActionSuccess]);

  const resolveMut = trpc.mail.resolve.useMutation({ onSuccess: () => { toast.success("Resolved"); invalidate(); onClose(); }, onError: (e) => toast.error(e.message) });
  const escalateMut = trpc.mail.escalate.useMutation({ onSuccess: () => { toast.success("Escalated"); invalidate(); onClose(); }, onError: (e) => toast.error(e.message) });
  const rerouteMut = trpc.mail.reroute.useMutation({ onSuccess: () => { toast.success("Rerouted"); invalidate(); setShowRerouteDialog(false); }, onError: (e) => toast.error(e.message) });
  const addNoteMut = trpc.mail.addNote.useMutation({ onSuccess: () => { toast.success("Note added"); setNoteText(""); refetch(); }, onError: (e) => toast.error(e.message) });
  const reminderMut = trpc.mail.setReminder.useMutation({ onSuccess: () => { toast.success("Reminder set"); setShowReminderInput(false); setReminderDate(""); }, onError: (e) => toast.error(e.message) });

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !itemId) return;
    setUploadingFile(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const resp = await fetch(`/api/mail/${itemId}/files`, { method: "POST", body: fd });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error ?? "Upload failed");
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

  const handlerName = useMemo(() => {
    if (!item?.assignedHandlerId) return "Unassigned";
    return handlers?.find(h => h.id === item.assignedHandlerId)?.name ?? `Handler #${item.assignedHandlerId}`;
  }, [item?.assignedHandlerId, handlers]);

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <SheetContent side="right" className="w-[520px] sm:w-[560px] overflow-y-auto p-0 flex flex-col">
          <SheetHeader className="sr-only">
            <SheetTitle>Mail Item Detail</SheetTitle>
          </SheetHeader>
          {isLoading || !item ? (
            <div className="flex-1 flex items-center justify-center">
              <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="px-5 py-4 border-b bg-background">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-semibold text-sm leading-tight line-clamp-2">{item.subject ?? "(no subject)"}</h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      {item.fromName ?? item.fromEmail ?? "Unknown sender"} · {format(new Date(item.receivedAt), "MMM d, yyyy h:mm a")}
                    </p>
                  </div>
                  <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5">✕</button>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <StatusPill item={item} />
                  {item.category && <CategoryBadge cat={item.category} />}
                  {item.isDemand === 1 && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-800 border border-red-200">Demand</span>}
                </div>
              </div>

              {/* Tabs */}
              <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
                <TabsList className="mx-5 mt-3 h-8 w-auto justify-start">
                  <TabsTrigger value="details" className="text-xs h-7">Details</TabsTrigger>
                  <TabsTrigger value="history" className="text-xs h-7">History</TabsTrigger>
                  <TabsTrigger value="attachments" className="text-xs h-7">Attachments {files.length > 0 ? `(${files.length})` : ""}</TabsTrigger>
                  <TabsTrigger value="notes" className="text-xs h-7">Notes {notes.length > 0 ? `(${notes.length})` : ""}</TabsTrigger>
                </TabsList>

                {/* Details tab */}
                <TabsContent value="details" className="flex-1 overflow-y-auto px-5 py-3 space-y-4">
                  {/* Message body */}
                  {item.bodyText && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Message Body</p>
                      <div className="text-sm whitespace-pre-wrap bg-muted/30 rounded p-3 max-h-48 overflow-y-auto text-foreground/80 leading-relaxed">
                        {item.bodyText}
                      </div>
                    </div>
                  )}

                  {/* Claim information */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Claim Information</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                      <div><span className="text-muted-foreground">Claim #</span><div className="font-medium">{item.claimNumber ?? "—"}</div></div>
                      <div><span className="text-muted-foreground">Loss Date</span><div className="font-medium">{item.dateOfLoss ?? "—"}</div></div>
                      <div><span className="text-muted-foreground">Urgency</span><div className="font-medium capitalize">{item.urgency ?? "normal"}</div></div>
                      <div><span className="text-muted-foreground">Confidence</span><div className="font-medium">{item.confidence != null ? `${item.confidence}%` : "—"}</div></div>
                    </div>
                  </div>

                  {/* Routing block */}
                  <div className="border rounded-lg p-3 bg-muted/20">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Routing</p>
                      <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => { setEditHandlerId(String(item.assignedHandlerId ?? "")); setEditDueDate(item.dueAt ? format(new Date(item.dueAt), "yyyy-MM-dd") : ""); setShowEditRouting(true); }}>
                        <Edit2 className="w-3 h-3 mr-1" /> Edit Routing
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                      <div><span className="text-muted-foreground">Handler</span><div className="font-medium">{handlerName}</div></div>
                      <div><span className="text-muted-foreground">Assigned On</span><div className="font-medium">{item.assignedAt ? fmtDate(item.assignedAt) : "—"}</div></div>
                      <div><span className="text-muted-foreground">Due Date</span><div className={`font-medium ${item.dueAt && isPast(new Date(item.dueAt)) && item.status !== "resolved" ? "text-red-600" : ""}`}>{fmtDate(item.dueAt)}</div></div>
                      <div><span className="text-muted-foreground">Status</span><div className="font-medium capitalize">{item.status}</div></div>
                    </div>
                  </div>

                  {/* Actions 2×2 */}
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowRerouteDialog(true)}>
                      <ArrowRight className="w-3.5 h-3.5 mr-1.5" /> Reroute
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs text-green-700 border-green-200 hover:bg-green-50"
                      onClick={() => resolveMut.mutate({ itemId: item.id })} disabled={resolveMut.isPending}>
                      <CheckCircle className="w-3.5 h-3.5 mr-1.5" /> Resolve
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs text-orange-700 border-orange-200 hover:bg-orange-50"
                      onClick={() => escalateMut.mutate({ itemId: item.id, reason: "Escalated by admin" })} disabled={escalateMut.isPending}>
                      <AlertCircle className="w-3.5 h-3.5 mr-1.5" /> Escalate
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowReminderInput(v => !v)}>
                      <Bell className="w-3.5 h-3.5 mr-1.5" /> Set Reminder
                    </Button>
                  </div>
                  {showReminderInput && (
                    <div className="flex items-center gap-2">
                      <Input type="datetime-local" className="h-8 text-xs flex-1" value={reminderDate} onChange={e => setReminderDate(e.target.value)} />
                      <Button size="sm" className="h-8 text-xs" onClick={() => reminderMut.mutate({ itemId: item.id, remindAt: new Date(reminderDate) })} disabled={!reminderDate || reminderMut.isPending}>Set</Button>
                    </div>
                  )}

                  {/* Quick notes */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Quick Notes</p>
                    {notes.slice(-2).map((n: any) => (
                      <div key={n.id} className="text-xs text-muted-foreground mb-1 bg-muted/30 rounded px-2 py-1.5">
                        {n.note}
                        <span className="ml-1 text-muted-foreground/60">· {n.createdAt ? format(new Date(n.createdAt), "M/d h:mm a") : ""}</span>
                      </div>
                    ))}
                    <div className="flex gap-2 mt-1.5">
                      <Input className="h-7 text-xs flex-1" placeholder="Add note…" value={noteText} onChange={e => setNoteText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && noteText.trim()) { addNoteMut.mutate({ itemId: item.id, note: noteText }); } }} />
                      <Button size="sm" className="h-7 text-xs px-2" onClick={() => addNoteMut.mutate({ itemId: item.id, note: noteText })} disabled={!noteText.trim() || addNoteMut.isPending}>Add</Button>
                    </div>
                  </div>

                  {/* Open in full view */}
                  <Button size="sm" variant="ghost" className="w-full h-8 text-xs" onClick={() => { onClose(); navigate(`/mailroom/${item.id}`); }}>
                    <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Open in Full View
                  </Button>
                </TabsContent>

                {/* History tab */}
                <TabsContent value="history" className="flex-1 overflow-y-auto px-5 py-3">
                  {history.length === 0 ? <p className="text-xs text-muted-foreground">No routing history yet.</p> : (
                    <div className="space-y-2">
                      {history.map((h: any) => (
                        <div key={h.id} className="text-xs border-l-2 border-muted pl-3 py-1">
                          <span className="font-medium capitalize">{h.action}</span>
                          {h.reason ? ` — ${h.reason}` : ""}
                          <div className="text-muted-foreground mt-0.5">{h.createdAt ? format(new Date(h.createdAt), "M/d/yy, h:mm a") : ""}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Attachments tab */}
                <TabsContent value="attachments" className="flex-1 overflow-y-auto px-5 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Files</p>
                    <label className={`flex items-center gap-1 text-xs cursor-pointer text-primary hover:underline ${uploadingFile ? "opacity-50 pointer-events-none" : ""}`}>
                      <Paperclip className="w-3 h-3" />
                      {uploadingFile ? "Uploading…" : "Attach file"}
                      <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploadingFile} />
                    </label>
                  </div>
                  {files.length === 0 ? <p className="text-xs text-muted-foreground">No attachments yet.</p> : (
                    <div className="space-y-1.5">
                      {files.map((f: any) => (
                        <div key={f.id} className="flex items-center justify-between text-xs bg-muted/30 rounded px-2 py-1.5">
                          <span className="truncate flex-1 mr-2">{f.filename || f.storageKey?.split("/").pop() || "File"}</span>
                          {f.signedUrl && (
                            <a href={f.signedUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1 shrink-0">
                              <Download className="w-3 h-3" /> Download
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Notes tab */}
                <TabsContent value="notes" className="flex-1 overflow-y-auto px-5 py-3">
                  <div className="space-y-2 mb-3">
                    {notes.map((n: any) => (
                      <div key={n.id} className="text-xs bg-muted/30 rounded px-3 py-2">
                        <p>{n.note}</p>
                        <p className="text-muted-foreground mt-0.5">{n.createdAt ? format(new Date(n.createdAt), "M/d/yy, h:mm a") : ""}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Textarea className="text-xs flex-1 min-h-[60px]" placeholder="Add note…" value={noteText} onChange={e => setNoteText(e.target.value)} />
                    <Button size="sm" className="h-8 text-xs self-end" onClick={() => addNoteMut.mutate({ itemId: item.id, note: noteText })} disabled={!noteText.trim() || addNoteMut.isPending}>Add</Button>
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Reroute dialog */}
      {showRerouteDialog && (
        <Dialog open onOpenChange={() => setShowRerouteDialog(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Reroute Item</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Assign to Handler</Label>
                <Select value={rerouteHandlerId} onValueChange={setRerouteHandlerId}>
                  <SelectTrigger className="mt-1 h-8"><SelectValue placeholder="Select handler…" /></SelectTrigger>
                  <SelectContent>
                    {handlers?.map(h => <SelectItem key={h.id} value={String(h.id)}>{h.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Reason (optional)</Label>
                <Input className="mt-1 h-8" value={rerouteReason} onChange={e => setRerouteReason(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRerouteDialog(false)}>Cancel</Button>
              <Button onClick={() => rerouteMut.mutate({ itemId: item!.id, toHandlerId: Number(rerouteHandlerId), reason: rerouteReason || undefined })} disabled={!rerouteHandlerId || rerouteMut.isPending}>Reroute</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Routing dialog */}
      {showEditRouting && item && (
        <Dialog open onOpenChange={() => setShowEditRouting(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Edit Routing</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Reassign Handler</Label>
                <Select value={editHandlerId} onValueChange={setEditHandlerId}>
                  <SelectTrigger className="mt-1 h-8"><SelectValue placeholder="Select handler…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Unassigned</SelectItem>
                    {handlers?.map(h => <SelectItem key={h.id} value={String(h.id)}>{h.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Adjust Due Date</Label>
                <Input type="date" className="mt-1 h-8" value={editDueDate} onChange={e => setEditDueDate(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditRouting(false)}>Cancel</Button>
              <Button onClick={() => {
                if (editHandlerId && editHandlerId !== String(item.assignedHandlerId)) {
                  rerouteMut.mutate({ itemId: item.id, toHandlerId: Number(editHandlerId), reason: "Routing edit by admin" });
                }
                setShowEditRouting(false);
                invalidate();
              }}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

// ─── Admin: All Mail queue (redesigned) ──────────────────────────────────────
type AdminTab = "all" | "overdue" | "urgent" | "legal" | "demands" | "resolved" | "log";

function AdminMailQueue({ activeTab }: { activeTab: AdminTab }) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [handlerFilter, setHandlerFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: handlers } = trpc.handlers.list.useQuery();

  // Build query input from active tab + filters
  const queryInput = useMemo(() => {
    const base: any = {
      page,
      pageSize,
      search: search.trim() || undefined,
      category: categoryFilter !== "all" ? categoryFilter : undefined,
      handlerId: handlerFilter !== "all" ? Number(handlerFilter) : undefined,
      from: dateFrom ? new Date(dateFrom) : undefined,
      to: dateTo ? new Date(dateTo) : undefined,
    };
    if (activeTab === "overdue") base.overdue = true;
    else if (activeTab === "urgent") base.urgent = true;
    else if (activeTab === "legal") base.legalOnly = true;
    else if (activeTab === "demands") base.status = undefined, base.legalOnly = undefined;
    else if (activeTab === "resolved") base.status = "resolved";
    // status filter from dropdown (only applies on "all" tab)
    if (activeTab === "all" && statusFilter !== "all") base.status = statusFilter;
    // demands tab: filter by isDemand — we'll filter client-side since adminQueue doesn't have isDemand filter
    return base;
  }, [activeTab, page, pageSize, search, categoryFilter, handlerFilter, statusFilter, dateFrom, dateTo]);

  const { data, isLoading, refetch } = trpc.mail.adminQueue.useQuery(queryInput);
  const items = useMemo(() => {
    let list = data?.items ?? [];
    if (activeTab === "demands") list = list.filter(i => i.isDemand === 1);
    return list;
  }, [data?.items, activeTab]);
  const total = activeTab === "demands" ? items.length : (data?.total ?? 0);

  const utils = trpc.useUtils();
  const resolveMut = trpc.mail.resolve.useMutation({ onSuccess: () => { toast.success("Resolved"); utils.mail.adminQueue.invalidate(); utils.mail.adminStats.invalidate(); refetch(); }, onError: (e) => toast.error(e.message) });
  const escalateMut = trpc.mail.escalate.useMutation({ onSuccess: () => { toast.success("Escalated"); utils.mail.adminQueue.invalidate(); refetch(); }, onError: (e) => toast.error(e.message) });
  const rerouteMut = trpc.mail.reroute.useMutation({ onSuccess: () => { toast.success("Rerouted"); utils.mail.adminQueue.invalidate(); refetch(); }, onError: (e) => toast.error(e.message) });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIdx = (page - 1) * pageSize + 1;
  const endIdx = Math.min(page * pageSize, total);

  return (
    <div className="space-y-3">
      {/* Filter row */}
      <div className="flex items-center gap-2 flex-wrap">
        {activeTab === "all" && (
          <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="assigned">Assigned</SelectItem>
              <SelectItem value="escalated">Escalated</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
        )}
        <Select value={categoryFilter} onValueChange={v => { setCategoryFilter(v); setPage(1); }}>
          <SelectTrigger className="w-44 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={handlerFilter} onValueChange={v => { setHandlerFilter(v); setPage(1); }}>
          <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Handlers</SelectItem>
            {handlers?.map(h => <SelectItem key={h.id} value={String(h.id)}>{h.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" className="w-36 h-8 text-xs" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} placeholder="From" />
        <Input type="date" className="w-36 h-8 text-xs" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} placeholder="To" />
        <div className="flex-1 min-w-[160px]">
          <Input className="h-8 text-xs" placeholder="Search subject, sender, claim #…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="w-8 py-2 text-xs">Status</TableHead>
              <TableHead className="w-8 py-2 text-xs">Type</TableHead>
              <TableHead className="py-2 text-xs">Subject / From</TableHead>
              <TableHead className="py-2 text-xs">Category</TableHead>
              <TableHead className="py-2 text-xs">Claim #</TableHead>
              <TableHead className="py-2 text-xs">Handler</TableHead>
              <TableHead className="py-2 text-xs">Due</TableHead>
              <TableHead className="py-2 text-xs">Received</TableHead>
              <TableHead className="w-8 py-2" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground text-sm">Loading…</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground text-sm">No items found.</TableCell></TableRow>
            ) : items.map(item => {
              const isOverdue = item.dueAt && isPast(new Date(item.dueAt)) && item.status !== "resolved";
              const handlerName = handlers?.find(h => h.id === item.assignedHandlerId)?.name;
              return (
                <TableRow
                  key={item.id}
                  className={`cursor-pointer hover:bg-muted/30 ${rowBorderClass(item)}`}
                  onClick={() => { setSelectedItemId(item.id); setDrawerOpen(true); }}
                >
                  <TableCell className="py-2"><StatusPill item={item} /></TableCell>
                  <TableCell className="py-2"><SourceIcon source={item.source} /></TableCell>
                  <TableCell className="py-2 max-w-xs">
                    <div className="font-medium text-xs line-clamp-1">{item.subject ?? "(no subject)"}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">{item.fromEmail ?? item.fromName ?? "—"}</div>
                  </TableCell>
                  <TableCell className="py-2"><CategoryBadge cat={item.category} /></TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground">{item.claimNumber ?? "—"}</TableCell>
                  <TableCell className="py-2 text-xs">{handlerName ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                  <TableCell className="py-2">
                    <div className={`text-xs ${isOverdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>{fmtDate(item.dueAt)}</div>
                    {isOverdue && <div className="text-xs text-red-500">Overdue</div>}
                    {!isOverdue && item.dueAt && isToday(new Date(item.dueAt)) && <div className="text-xs text-amber-600">Due today</div>}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground">{fmtRelative(item.receivedAt)}</TableCell>
                  <TableCell className="py-2" onClick={e => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setSelectedItemId(item.id); setDrawerOpen(true); }}>Open</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => resolveMut.mutate({ itemId: item.id })}>Resolve</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => escalateMut.mutate({ itemId: item.id, reason: "Escalated by admin" })}>Escalate</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Showing {total === 0 ? 0 : startIdx}–{endIdx} of {total} results</span>
        <div className="flex items-center gap-2">
          <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(1); }}>
            <SelectTrigger className="h-7 w-20 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10 / page</SelectItem>
              <SelectItem value="25">25 / page</SelectItem>
              <SelectItem value="50">50 / page</SelectItem>
              <SelectItem value="100">100 / page</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="px-1">{page} / {totalPages}</span>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <AdminDrawer
        itemId={selectedItemId}
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setSelectedItemId(null); }}
        onActionSuccess={() => refetch()}
      />
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
      i.id, i.source, `"${(i.subject ?? "").replace(/"/g, '""')}"`  ,
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
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="assigned">Assigned</SelectItem>
            <SelectItem value="escalated">Escalated</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-44 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="mail">Fax / Slack</SelectItem>
          </SelectContent>
        </Select>
        <Input className="max-w-xs h-8 text-xs" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
        <Button size="sm" variant="outline" onClick={exportCSV} disabled={!filtered.length}>
          <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
        </Button>
      </div>
      <div className="text-xs text-muted-foreground">{filtered.length} items</div>
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="py-2 text-xs">ID</TableHead>
              <TableHead className="py-2 text-xs">Subject</TableHead>
              <TableHead className="py-2 text-xs">From</TableHead>
              <TableHead className="py-2 text-xs">Category</TableHead>
              <TableHead className="py-2 text-xs">Status</TableHead>
              <TableHead className="py-2 text-xs">Claim #</TableHead>
              <TableHead className="py-2 text-xs">Received</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground text-sm">Loading…</TableCell></TableRow>
            ) : filtered.map(item => (
              <TableRow key={item.id}>
                <TableCell className="py-1.5 text-xs text-muted-foreground">{item.id}</TableCell>
                <TableCell className="py-1.5 text-xs max-w-xs truncate">{item.subject ?? "—"}</TableCell>
                <TableCell className="py-1.5 text-xs text-muted-foreground">{item.fromEmail ?? item.fromName ?? "—"}</TableCell>
                <TableCell className="py-1.5"><CategoryBadge cat={item.category} /></TableCell>
                <TableCell className="py-1.5 text-xs capitalize">{item.status}</TableCell>
                <TableCell className="py-1.5 text-xs text-muted-foreground">{item.claimNumber ?? "—"}</TableCell>
                <TableCell className="py-1.5 text-xs text-muted-foreground">{fmtRelative(item.receivedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Admin: Stats board ───────────────────────────────────────────────────────
function AdminStats() {
  const { data } = trpc.mail.stats.useQuery();
  if (!data) return <div className="text-muted-foreground text-sm">Loading stats…</div>;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {[
        { label: "Total Items", value: data.total },
        { label: "Open / Assigned", value: data.open },
        { label: "Resolved", value: data.resolved },
        { label: "Overdue", value: data.overdue },
        { label: "Legal / High Risk", value: data.legal },
        { label: "Needs Review", value: data.needsReview },
      ].map(s => (
        <Card key={s.label}>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{s.value}</div>
            <div className="text-sm text-muted-foreground">{s.label}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Admin: Mail Setup ────────────────────────────────────────────────────────
function AdminMailSetup() {
  const [gmailStatus, setGmailStatus] = useState<"unknown" | "connected" | "disconnected">("unknown");
  const [triggerResult, setTriggerResult] = useState<any>(null);
  const { data: cronList, refetch: refetchCrons } = trpc.mail.listCrons.useQuery();
  const setupCrons = trpc.mail.setupCrons.useMutation({
    onSuccess: () => { toast.success("Crons registered"); refetchCrons(); },
    onError: (e) => toast.error(e.message),
  });
  const triggerNow = trpc.mail.triggerNow.useMutation({
    onSuccess: (data) => { setTriggerResult(data); toast.success("Manual run complete"); },
    onError: (e) => toast.error(e.message),
  });
  const checkGmailStatus = () => {
    fetch("/api/mail/gmail-status")
      .then(r => r.json())
      .then((d: any) => setGmailStatus(d.connected ? "connected" : "disconnected"))
      .catch(() => setGmailStatus("disconnected"));
  };
  useState(() => { checkGmailStatus(); });
  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            {gmailStatus === "connected" ? <Wifi className="h-4 w-4 text-green-500" /> : <WifiOff className="h-4 w-4 text-red-500" />}
            Gmail Connection
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <span className={`text-sm font-medium ${gmailStatus === "connected" ? "text-green-600" : gmailStatus === "disconnected" ? "text-red-600" : "text-muted-foreground"}`}>
              {gmailStatus === "connected" ? "Connected" : gmailStatus === "disconnected" ? "Not connected" : "Checking…"}
            </span>
            <Button size="sm" variant="outline" onClick={checkGmailStatus}>Refresh</Button>
          </div>
          {gmailStatus !== "connected" && (
            <Button size="sm" onClick={() => window.location.href = "/api/mail/gmail-oauth-start"}>
              Connect Gmail Account
            </Button>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4" /> Scheduled Jobs
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setupCrons.mutate()} disabled={setupCrons.isPending}>
              {setupCrons.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Setup Crons
            </Button>
            <Button size="sm" variant="outline" onClick={() => triggerNow.mutate()} disabled={triggerNow.isPending}>
              {triggerNow.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Trigger Now
            </Button>
          </div>
          {cronList?.jobs && cronList.jobs.length > 0 && (
            <div className="space-y-1">
              {cronList.jobs.map((j: any) => (
                <div key={j.name} className="text-xs text-muted-foreground flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                  {j.name} — {j.cron}
                </div>
              ))}
            </div>
          )}
          {triggerResult && (
            <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-32">{JSON.stringify(triggerResult, null, 2)}</pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── New Intake Form ──────────────────────────────────────────────────────────
function NewIntakeForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [source, setSource] = useState<"mail" | "fax" | "manual">("manual");
  const [subject, setSubject] = useState("");
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [claimNumber, setClaimNumber] = useState("");
  const [category, setCategory] = useState<string>("");
  const [assignedHandlerId, setAssignedHandlerId] = useState<string>("");
  const [urgency, setUrgency] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [receivedAt, setReceivedAt] = useState(new Date().toISOString().slice(0, 10));
  const [dateOfLoss, setDateOfLoss] = useState("");
  const [responseDueDate, setResponseDueDate] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [pendingFiles, setPendingFiles] = useState<Array<{ storageKey: string; filename: string; contentType: string; sizeBytes: number }>>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [autoClassifying, setAutoClassifying] = useState(false);

  const { data: handlers } = trpc.handlers.list.useQuery();
  const utils = trpc.useUtils();
  const autoClassify = trpc.mail.autoClassify.useMutation();
  const createItem = trpc.mail.createManualItem.useMutation({
    onSuccess: () => {
      toast.success("Item created and added to queue");
      utils.mail.adminQueue.invalidate();
      utils.mail.adminStats.invalidate();
      onCreated();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const resp = await fetch("/api/upload/document", { method: "POST", body: fd });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error ?? "Upload failed");
      setPendingFiles(prev => [...prev, { storageKey: result.key, filename: file.name, contentType: file.type || "application/octet-stream", sizeBytes: file.size }]);
      toast.success(`${file.name} ready to attach`);
    } catch (err: any) { toast.error(err.message ?? "Upload failed"); }
    finally { setUploadingFile(false); e.target.value = ""; }
  }

  async function handleAutoClassify() {
    if (!subject && !bodyText && pendingFiles.length === 0) { toast.error("Add a subject, body, or file first"); return; }
    setAutoClassifying(true);
    try {
      const result = await autoClassify.mutateAsync({ subject: subject || undefined, bodyText: bodyText || undefined, attachmentNames: pendingFiles.map(f => f.filename) });
      if (result.category) setCategory(result.category);
      if (result.urgency) setUrgency(result.urgency as any);
      if (result.response_due_date) setResponseDueDate(result.response_due_date);
      toast.success(`Auto-classified as: ${result.category}`);
    } catch (err: any) { toast.error(err.message ?? "Auto-classify failed"); }
    finally { setAutoClassifying(false); }
  }

  function handleSubmit() {
    if (!subject.trim()) { toast.error("Subject is required"); return; }
    createItem.mutate({ source, subject, fromName: fromName || undefined, fromEmail: fromEmail || undefined, claimNumber: claimNumber || undefined, category: category as any || undefined, assignedHandlerId: assignedHandlerId ? Number(assignedHandlerId) : undefined, urgency, receivedAt: receivedAt || undefined, dateOfLoss: dateOfLoss || undefined, responseDueDate: responseDueDate || undefined, bodyText: bodyText || undefined, files: pendingFiles.length > 0 ? pendingFiles : undefined });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><PlusCircle className="h-5 w-5" /> New Intake</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Channel</Label>
              <Select value={source} onValueChange={(v) => setSource(v as any)}>
                <SelectTrigger className="mt-1 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="mail">Mail / Fax (physical)</SelectItem>
                  <SelectItem value="fax">Fax (eFax)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Subject *</Label>
              <Input className="mt-1 h-8" value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Demand Letter — CLM-2026-001" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Sender Name</Label><Input className="mt-1 h-8" value={fromName} onChange={e => setFromName(e.target.value)} placeholder="Attorney Smith" /></div>
            <div><Label className="text-xs">Sender Email / Org</Label><Input className="mt-1 h-8" value={fromEmail} onChange={e => setFromEmail(e.target.value)} placeholder="attorney@lawfirm.com" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Claim #</Label><Input className="mt-1 h-8" value={claimNumber} onChange={e => setClaimNumber(e.target.value)} placeholder="CLM-2026-001" /></div>
            <div><Label className="text-xs">Received Date</Label><Input type="date" className="mt-1 h-8" value={receivedAt} onChange={e => setReceivedAt(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3 items-end">
            <div>
              <Label className="text-xs">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="mt-1 h-8"><SelectValue placeholder="Select or auto-classify…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="injury_pip_bi">Injury / PIP / BI</SelectItem>
                  <SelectItem value="inbound_subro">Inbound Subro</SelectItem>
                  <SelectItem value="existing_claim_followup">Claim Follow-Up</SelectItem>
                  <SelectItem value="outbound_subro">OB Subro</SelectItem>
                  <SelectItem value="total_loss">Total Loss</SelectItem>
                  <SelectItem value="legal_or_high_risk">Legal / High Risk</SelectItem>
                  <SelectItem value="other_or_unclear">Other / Unclear</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" variant="outline" onClick={handleAutoClassify} disabled={autoClassifying} className="h-8">
              {autoClassifying ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Zap className="h-3.5 w-3.5 mr-1.5" />}
              Auto-classify
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Assign to Handler</Label>
              <Select value={assignedHandlerId} onValueChange={setAssignedHandlerId}>
                <SelectTrigger className="mt-1 h-8"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Unassigned</SelectItem>
                  {handlers?.map(h => <SelectItem key={h.id} value={String(h.id)}>{h.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Urgency</Label>
              <Select value={urgency} onValueChange={(v) => setUrgency(v as any)}>
                <SelectTrigger className="mt-1 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Date of Loss</Label><Input type="date" className="mt-1 h-8" value={dateOfLoss} onChange={e => setDateOfLoss(e.target.value)} /></div>
            <div><Label className="text-xs">Response Due</Label><Input type="date" className="mt-1 h-8" value={responseDueDate} onChange={e => setResponseDueDate(e.target.value)} /></div>
          </div>
          <div>
            <Label className="text-xs">Body / Notes</Label>
            <Textarea className="mt-1 text-sm" rows={3} value={bodyText} onChange={e => setBodyText(e.target.value)} placeholder="Paste or type the mail content…" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs">Attachments</Label>
              <label className={`flex items-center gap-1 text-xs cursor-pointer text-primary hover:underline ${uploadingFile ? "opacity-50 pointer-events-none" : ""}`}>
                <Paperclip className="h-3 w-3" />{uploadingFile ? "Uploading…" : "Add file"}
                <input type="file" className="hidden" onChange={handleFileSelect} disabled={uploadingFile} />
              </label>
            </div>
            {pendingFiles.length > 0 ? (
              <div className="space-y-1">
                {pendingFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-xs bg-muted/30 rounded px-2 py-1">
                    <span className="truncate">{f.filename}</span>
                    <button className="text-muted-foreground hover:text-destructive ml-2" onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))}>✕</button>
                  </div>
                ))}
              </div>
            ) : <p className="text-xs text-muted-foreground">No files attached.</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={createItem.isPending || !subject.trim()}>
            {createItem.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}Create Item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Mailroom page ───────────────────────────────────────────────────────
export default function Mailroom() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [activeTab, setActiveTab] = useState<AdminTab>("all");
  const [showNewIntake, setShowNewIntake] = useState(false);
  const utils = trpc.useUtils();

  const { data: statsData, refetch: refetchStats } = trpc.mail.adminStats.useQuery(undefined, { enabled: isAdmin });
  const { data: pendingData } = trpc.mail.myPendingCount.useQuery(undefined, { enabled: !isAdmin });
  const pendingCount = pendingData?.count ?? 0;

  const STAT_CARDS = [
    { key: "allPending", label: "All Pending", icon: <Inbox className="w-4 h-4 text-gray-500" />, tab: "all" as AdminTab, color: "border-gray-200" },
    { key: "overdue", label: "Overdue", icon: <Clock className="w-4 h-4 text-red-500" />, tab: "overdue" as AdminTab, color: "border-red-200" },
    { key: "urgent", label: "Urgent", icon: <AlertTriangle className="w-4 h-4 text-amber-500" />, tab: "urgent" as AdminTab, color: "border-amber-200" },
    { key: "legalDemands", label: "Legal & Demands", icon: <Scale className="w-4 h-4 text-purple-500" />, tab: "legal" as AdminTab, color: "border-purple-200" },
    { key: "demands", label: "Demands", icon: <FileText className="w-4 h-4 text-indigo-500" />, tab: "demands" as AdminTab, color: "border-indigo-200" },
    { key: "resolvedToday", label: "Resolved Today", icon: <CheckCircle className="w-4 h-4 text-green-500" />, tab: "resolved" as AdminTab, color: "border-green-200" },
  ] as const;

  if (!isAdmin) {
    return (
      <WhipLayout>
        <div className="px-6 py-6">
          <div className="text-muted-foreground text-sm">This view is for admins only.</div>
        </div>
      </WhipLayout>
    );
  }

  return (
    <WhipLayout>
      <div className="px-6 py-5 max-w-full space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">Mailroom</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Centralized intake and routing of all incoming mail, faxes, and emails.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowNewIntake(true)}>
              <PlusCircle className="h-3.5 w-3.5 mr-1.5" /> New Intake
            </Button>
            <Button size="sm" onClick={() => setShowNewIntake(true)}>
              <Paperclip className="h-3.5 w-3.5 mr-1.5" /> Compose / Upload
            </Button>
          </div>
        </div>

        {/* 6 Stat Cards */}
        {statsData && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {STAT_CARDS.map(card => {
              const stat = statsData[card.key as keyof typeof statsData] as { count: number; delta: number } | undefined;
              return (
                <Card key={card.key} className={`border-t-2 ${card.color} cursor-pointer hover:shadow-sm transition-shadow`} onClick={() => setActiveTab(card.tab)}>
                  <CardContent className="pt-3 pb-3 px-3">
                    <div className="flex items-center justify-between mb-1">
                      {card.icon}
                      {stat && <Delta n={stat.delta} />}
                    </div>
                    <div className="text-2xl font-bold">{stat?.count ?? 0}</div>
                    <div className="text-xs text-muted-foreground">{card.label}</div>
                    <button className="text-xs text-primary hover:underline mt-1" onClick={(e) => { e.stopPropagation(); setActiveTab(card.tab); }}>
                      View {card.label} →
                    </button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AdminTab)}>
          <TabsList className="h-9">
            <TabsTrigger value="all" className="text-xs"><Inbox className="h-3.5 w-3.5 mr-1.5" />All Mail</TabsTrigger>
            <TabsTrigger value="overdue" className="text-xs"><Clock className="h-3.5 w-3.5 mr-1.5" />Overdue</TabsTrigger>
            <TabsTrigger value="urgent" className="text-xs"><AlertTriangle className="h-3.5 w-3.5 mr-1.5" />Urgent</TabsTrigger>
            <TabsTrigger value="legal" className="text-xs"><Scale className="h-3.5 w-3.5 mr-1.5" />Legal & Demands</TabsTrigger>
            <TabsTrigger value="demands" className="text-xs"><FileText className="h-3.5 w-3.5 mr-1.5" />Demands</TabsTrigger>
            <TabsTrigger value="resolved" className="text-xs"><CheckCircle className="h-3.5 w-3.5 mr-1.5" />Resolved</TabsTrigger>
            <TabsTrigger value="log" className="text-xs"><BarChart3 className="h-3.5 w-3.5 mr-1.5" />Mail Log</TabsTrigger>
            <TabsTrigger value="setup" className="text-xs"><Settings2 className="h-3.5 w-3.5 mr-1.5" />Setup</TabsTrigger>
          </TabsList>
          {(["all", "overdue", "urgent", "legal", "demands", "resolved"] as AdminTab[]).map(tab => (
            <TabsContent key={tab} value={tab} className="mt-4">
              <AdminMailQueue activeTab={tab} />
            </TabsContent>
          ))}
          <TabsContent value="log" className="mt-4"><AdminMailLog /></TabsContent>
          <TabsContent value="setup" className="mt-4"><AdminMailSetup /></TabsContent>
        </Tabs>

        {showNewIntake && (
          <NewIntakeForm
            onClose={() => setShowNewIntake(false)}
            onCreated={() => { utils.mail.adminQueue.invalidate(); utils.mail.adminStats.invalidate(); }}
          />
        )}
      </div>
    </WhipLayout>
  );
}
