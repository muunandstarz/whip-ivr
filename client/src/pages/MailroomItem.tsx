import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import WhipLayout from "@/components/WhipLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft, ExternalLink, Download, FileText, MessageSquare,
  GitBranch, ArrowRight, CheckCircle, AlertCircle, Clock,
  Mail, Printer,
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

function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function fmtDateOnly(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function MailroomItem() {
  const [, params] = useRoute("/mailroom/:id");
  const [, navigate] = useLocation();
  const itemId = Number(params?.id);

  const { data, isLoading, refetch } = trpc.mail.getItem.useQuery(
    { id: itemId },
    { enabled: !!itemId }
  );
  const utils = trpc.useUtils();

  const [noteText, setNoteText] = useState("");
  const [rerouteOpen, setRerouteOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [rerouteHandlerId, setRerouteHandlerId] = useState("");
  const [rerouteReason, setRerouteReason] = useState("");
  const [resolveNote, setResolveNote] = useState("");
  const [reminderDate, setReminderDate] = useState("");

  const { data: handlers } = trpc.handlers.list.useQuery();

  const addNote = trpc.mail.addNote.useMutation({
    onSuccess: () => { setNoteText(""); refetch(); toast.success("Note added"); },
    onError: e => toast.error(e.message),
  });
  const reroute = trpc.mail.reroute.useMutation({
    onSuccess: () => {
      setRerouteOpen(false);
      refetch();
      utils.mail.myMailroom.invalidate();
      utils.mail.adminQueue.invalidate();
      utils.mail.myPendingCount.invalidate();
      toast.success("Item rerouted");
    },
    onError: e => toast.error(e.message),
  });
  const resolve = trpc.mail.resolve.useMutation({
    onSuccess: () => {
      setResolveOpen(false);
      refetch();
      utils.mail.myMailroom.invalidate();
      utils.mail.adminQueue.invalidate();
      utils.mail.myPendingCount.invalidate();
      toast.success("Item resolved");
    },
    onError: e => toast.error(e.message),
  });
  const escalate = trpc.mail.escalate.useMutation({
    onSuccess: () => { refetch(); toast.success("Item escalated"); },
    onError: e => toast.error(e.message),
  });
  const setReminder = trpc.mail.setReminder.useMutation({
    onSuccess: () => { setReminderOpen(false); refetch(); toast.success("Reminder set"); },
    onError: e => toast.error(e.message),
  });

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading…</div>;
  if (!data?.item) return <WhipLayout><div className="p-6 text-muted-foreground">Item not found.</div></WhipLayout>;

  const { item, files, notes, history } = data;
  const isResolved = item.status === "resolved";
  const isLegal = item.category === "legal_or_high_risk" || item.isDemand === 1;

  return (
    <WhipLayout>
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/mailroom")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{item.subject ?? "(no subject)"}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-sm text-muted-foreground">
              {item.source === "mail" ? "📠 Fax/Slack" : "📧 Email"} · {item.fromEmail ?? item.fromName ?? "Unknown sender"}
            </span>
            <span className="text-xs text-muted-foreground">· {fmtDate(item.receivedAt)}</span>
            {item.category && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                {CATEGORY_LABELS[item.category] ?? item.category}
              </span>
            )}
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              item.status === "resolved" ? "bg-gray-100 text-gray-500" :
              item.status === "escalated" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
            }`}>{item.status}</span>
            {item.isDemand === 1 && <Badge variant="destructive" className="text-xs">DEMAND</Badge>}
            {item.needsReview === 1 && <Badge variant="outline" className="text-xs text-yellow-700 border-yellow-400">Needs Review</Badge>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: body + files */}
        <div className="lg:col-span-2 space-y-4">
          {/* Legal/demand dates */}
          {isLegal && (item.responseDueDate || item.demandDate) && (
            <Card className="border-red-200 bg-red-50/40">
              <CardContent className="pt-4 pb-3">
                <div className="flex gap-6 text-sm">
                  {item.demandDate && (
                    <div>
                      <div className="text-xs text-muted-foreground">Demand Date</div>
                      <div className="font-semibold text-red-700">{item.demandDate}</div>
                    </div>
                  )}
                  {item.responseDueDate && (
                    <div>
                      <div className="text-xs text-muted-foreground">Response Due</div>
                      <div className="font-semibold text-red-700">{item.responseDueDate}</div>
                    </div>
                  )}
                  {item.dueAt && (
                    <div>
                      <div className="text-xs text-muted-foreground">SLA Due</div>
                      <div className="font-semibold">{fmtDateOnly(item.dueAt)}</div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Body */}
          {item.bodyText && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Mail className="h-4 w-4" /> Message Body
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed max-h-96 overflow-y-auto">
                  {item.bodyText}
                </pre>
              </CardContent>
            </Card>
          )}

          {/* Files */}
          {files.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Attachments ({files.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {files.map(f => (
                    <div key={f.id} className="flex items-center justify-between p-2 rounded border bg-muted/30">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm truncate">{f.filename ?? f.storageKey}</span>
                        {f.sizeBytes && (
                          <span className="text-xs text-muted-foreground">
                            ({Math.round(f.sizeBytes / 1024)}KB)
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {item.source === "mail" && item.slackPermalink && (
                          <Button size="sm" variant="ghost" asChild>
                            <a href={item.slackPermalink} target="_blank" rel="noreferrer">
                              <ExternalLink className="h-3.5 w-3.5 mr-1" /> Slack
                            </a>
                          </Button>
                        )}
                        {f.signedUrl && (
                          <Button size="sm" variant="ghost" asChild>
                            <a href={f.signedUrl} target="_blank" rel="noreferrer" download>
                              <Download className="h-3.5 w-3.5 mr-1" /> Download
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageSquare className="h-4 w-4" /> Notes ({notes.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {notes.map(n => (
                <div key={n.id} className="text-sm border-l-2 border-muted pl-3 py-1">
                  <div className="text-muted-foreground text-xs mb-0.5">{fmtDate(n.createdAt)}</div>
                  <div className="whitespace-pre-wrap">{n.note}</div>
                </div>
              ))}
              {!isResolved && (
                <div className="space-y-2 pt-2">
                  <Textarea
                    placeholder="Add a note…"
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                    rows={2}
                  />
                  <Button
                    size="sm"
                    disabled={!noteText.trim() || addNote.isPending}
                    onClick={() => addNote.mutate({ itemId, note: noteText })}
                  >
                    Add Note
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Routing history */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <GitBranch className="h-4 w-4" /> Routing History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No history yet.</p>
              ) : (
                <div className="space-y-2">
                  {history.map(h => (
                    <div key={h.id} className="flex items-start gap-2 text-sm">
                      <div className="mt-1 h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                      <div>
                        <span className="font-medium capitalize">{h.action}</span>
                        {h.toHandlerId && <span className="text-muted-foreground"> → handler #{h.toHandlerId}</span>}
                        {h.reason && <span className="text-muted-foreground"> — {h.reason}</span>}
                        <div className="text-xs text-muted-foreground">{fmtDate(h.createdAt)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: metadata + actions */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Claim Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {[
                ["Claim #", item.claimNumber],
                ["Claimant", item.claimantName],
                ["Carrier", item.adverseCarrier],
                ["Date of Loss", item.dateOfLoss],
                ["Sender Org", item.senderOrg],
                ["Urgency", item.urgency],
                ["Confidence", item.confidence ? `${item.confidence}%` : null],
              ].map(([label, value]) => value ? (
                <div key={label as string} className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium text-right">{value}</span>
                </div>
              ) : null)}
            </CardContent>
          </Card>

          {!isResolved && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button className="w-full justify-start" size="sm" variant="outline"
                  onClick={() => setRerouteOpen(true)}>
                  <ArrowRight className="h-3.5 w-3.5 mr-2" /> Reroute
                </Button>
                <Button className="w-full justify-start" size="sm" variant="outline"
                  onClick={() => setResolveOpen(true)}>
                  <CheckCircle className="h-3.5 w-3.5 mr-2" /> Resolve
                </Button>
                <Button className="w-full justify-start" size="sm" variant="outline"
                  onClick={() => escalate.mutate({ itemId, reason: "Manual escalation" })}>
                  <AlertCircle className="h-3.5 w-3.5 mr-2" /> Escalate
                </Button>
                <Button className="w-full justify-start" size="sm" variant="outline"
                  onClick={() => setReminderOpen(true)}>
                  <Clock className="h-3.5 w-3.5 mr-2" /> Set Reminder
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Reroute dialog */}
      <Dialog open={rerouteOpen} onOpenChange={setRerouteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reroute Item</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Assign to Handler</Label>
              <Select value={rerouteHandlerId} onValueChange={setRerouteHandlerId}>
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
              <Textarea className="mt-1" value={rerouteReason} onChange={e => setRerouteReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRerouteOpen(false)}>Cancel</Button>
            <Button disabled={!rerouteHandlerId || reroute.isPending}
              onClick={() => reroute.mutate({ itemId, toHandlerId: Number(rerouteHandlerId), reason: rerouteReason || undefined })}>
              {reroute.isPending ? "Rerouting…" : "Reroute"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resolve dialog */}
      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Resolve Item</DialogTitle></DialogHeader>
          <div className="py-2">
            <Label>Resolution note (optional)</Label>
            <Textarea className="mt-1" value={resolveNote} onChange={e => setResolveNote(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveOpen(false)}>Cancel</Button>
            <Button disabled={resolve.isPending}
              onClick={() => resolve.mutate({ itemId, note: resolveNote || undefined })}>
              {resolve.isPending ? "Resolving…" : "Mark Resolved"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reminder dialog */}
      <Dialog open={reminderOpen} onOpenChange={setReminderOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Set Reminder</DialogTitle></DialogHeader>
          <div className="py-2">
            <Label>Remind me at</Label>
            <input
              type="datetime-local"
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              value={reminderDate}
              onChange={e => setReminderDate(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReminderOpen(false)}>Cancel</Button>
            <Button disabled={!reminderDate || setReminder.isPending}
              onClick={() => setReminder.mutate({ itemId, remindAt: new Date(reminderDate) })}>
              {setReminder.isPending ? "Saving…" : "Set Reminder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </WhipLayout>
  );
}
