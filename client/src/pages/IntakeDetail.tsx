import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useParams, useLocation } from "wouter";
import WhipLayout from "@/components/WhipLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Phone, Mail, Building2, FileText, User, Clock, CheckCircle2, AlertTriangle, ExternalLink, ShieldCheck, ShieldAlert, ShieldX, PhoneCall, PhoneOff, PhoneForwarded, History, Headphones } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

// Handler list fetched dynamically — see trpc.handlers.list below

const CALL_SCRIPTS: Record<string, string> = {
  carrier: `Hi, this is [your name] calling from Whip Claims on behalf of our insured. I'm returning a call regarding claim [claim #]. I wanted to follow up on [reason for call]. Could you please confirm the status and let me know if there's anything needed from our side?`,
  law_office: `Hello, this is [your name] with Whip Claims. I'm returning a call from your office regarding claim [claim #] for [insured name]. I'd like to discuss the matter and see how we can assist. Is [attorney name] available?`,
  medical_provider: `Hi, this is [your name] from Whip Claims. I'm returning a call about a billing or treatment inquiry for claim [claim #]. I wanted to make sure we have everything needed to process the claim promptly.`,
  member: `Hi [caller name], this is [your name] calling from Whip Claims. I'm returning your call about your claim [claim #]. I wanted to follow up and make sure all your questions are answered. Is now a good time?`,
  claimant: `Hello [caller name], this is [your name] with Whip Claims. I'm returning your call regarding your claim [claim #]. I'd like to help resolve your inquiry. Is now a good time to talk?`,
  police: `Hello, this is [your name] from Whip Claims. I'm returning a call from your department regarding an incident related to claim [claim #]. How can I assist?`,
  wrong_department: `Hi, this is [your name] from Whip Claims. I'm returning a call — it looks like this may have been routed to us in error. Could you let me know how I can direct you to the right department?`,
  unknown: `Hi, this is [your name] calling from Whip Claims. I'm returning a call regarding claim [claim #]. Could you let me know how I can assist you today?`,
};

const CALLER_TYPE_LABELS: Record<string, string> = {
  carrier: "Insurance Carrier",
  law_office: "Law Office",
  medical_provider: "Medical Provider",
  member: "Member",
  claimant: "Claimant",
  police: "Police",
  unknown: "Unknown",
};

export default function IntakeDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const id = parseInt(params.id || "0");

  // Auto-open callback dialog when navigated from list with ?openCallback=1
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("openCallback") === "1") {
      setCallbackOpen(true);
      // Clean up the query param without a page reload
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, "", cleanUrl);
    }
  }, []);

  const { data: handlersData } = trpc.handlers.list.useQuery();
  const handlerNames = (handlersData ?? []).map((h: { id: number; name: string }) => h.name);
  const { data: callScriptsData } = trpc.settings.getCallScripts.useQuery();
  // Merge DB-backed scripts over hardcoded fallbacks so Settings editor takes effect immediately
  const activeCallScripts: Record<string, string> = {
    ...CALL_SCRIPTS,
    ...Object.fromEntries((callScriptsData ?? []).map((s: { callerType: string; script: string }) => [s.callerType, s.script])),
  };

  const { data: record, isLoading, refetch } = trpc.intake.get.useQuery({ id });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [callbackOpen, setCallbackOpen] = useState(false);
  const [callbackForm, setCallbackForm] = useState<{
    disposition: "reached" | "no_answer" | "left_voicemail" | "wrong_number" | "busy";
    outcome: "resolved" | "escalated" | "follow_up" | "closed";
    notes: string;
    closeRecord: boolean;
    newNotes: string;
  }>({
    disposition: "reached",
    outcome: "follow_up",
    notes: "",
    closeRecord: false,
    newNotes: "",
  });
  const { data: callbackHistory, refetch: refetchCallbacks } = trpc.callbacks.history.useQuery(
    { intakeId: id },
    { enabled: id > 0 }
  );
  const logCallbackMutation = trpc.callbacks.log.useMutation({
    onSuccess: () => {
      refetch();
      refetchCallbacks();
      setCallbackOpen(false);
      setCallbackForm({ disposition: "reached", outcome: "follow_up", notes: "", closeRecord: false, newNotes: "" });
      toast.success("Callback logged");
    },
    onError: () => toast.error("Failed to log callback"),
  });

  const updateMutation = trpc.intake.update.useMutation({
    onSuccess: () => {
      refetch();
      setEditing(false);
      toast.success("Record saved");
    },
    onError: () => toast.error("Failed to save"),
  });

  if (isLoading) {
    return (
      <WhipLayout>
        <div className="p-6 text-center text-muted-foreground text-sm">Loading...</div>
      </WhipLayout>
    );
  }

  if (!record) {
    return (
      <WhipLayout>
        <div className="p-6 text-center text-muted-foreground text-sm">Record not found.</div>
      </WhipLayout>
    );
  }

  const startEdit = () => {
    setForm({
      callerName: record.callerName || "",
      callerOrg: record.callerOrg || "",
      whipClaimNumber: record.whipClaimNumber || "",
      callerRefNumber: record.callerRefNumber || "",
      message: record.message || "",
      callbackPhone: record.callbackPhone || "",
      callbackEmail: record.callbackEmail || "",
      handlerName: record.handlerName || "",
      status: record.status,
      notes: record.notes || "",
    });
    setEditing(true);
  };

  const saveEdit = () => {
    updateMutation.mutate({
      id,
      callerName: form.callerName || undefined,
      callerOrg: form.callerOrg || undefined,
      whipClaimNumber: form.whipClaimNumber || undefined,
      callerRefNumber: form.callerRefNumber || undefined,
      message: form.message || undefined,
      callbackPhone: form.callbackPhone || undefined,
      callbackEmail: form.callbackEmail || undefined,
      handlerName: form.handlerName || undefined,
      status: (form.status as "open" | "closed" | "escalated") || undefined,
      notes: form.notes || undefined,
    });
  };

  return (
    <WhipLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-5">
        {/* Back + Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/intake")} className="gap-1">
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {record.callerName || record.callerPhone || "Unknown Caller"}
            </h1>
            {record.callerOrg && (
              <p className="text-muted-foreground text-sm">{record.callerOrg}</p>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge
                variant="outline"
                className={record.status === "open"
                  ? "border-amber-300 text-amber-700 dark:text-amber-400 bg-amber-500/15"
                  : record.status === "escalated"
                  ? "border-red-300 text-red-700 dark:text-red-400 bg-red-500/15"
                  : "border-green-300 text-green-700 dark:text-green-400 bg-green-500/15"}
              >
                {record.status === "open" ? (
                  <><Clock className="w-3 h-3 mr-1" />Open</>
                ) : record.status === "escalated" ? (
                  <><AlertTriangle className="w-3 h-3 mr-1" />Escalated</>
                ) : (
                  <><CheckCircle2 className="w-3 h-3 mr-1" />Closed</>
                )}
              </Badge>
              {record.callerType && (
                <Badge variant="outline" className="text-xs">
                  {CALLER_TYPE_LABELS[record.callerType] ?? record.callerType}
                </Badge>
              )}
              {record.isRepeatCaller && (
                <Badge variant="outline" className="border-red-300 text-red-700 dark:text-red-400 bg-red-500/15 text-xs">
                  🔁 Repeat Caller ({record.repeatCallCount}x)
                </Badge>
              )}
              {record.priority === "urgent" && (
                <Badge variant="outline" className="border-red-400 text-red-700 dark:text-red-400 bg-red-500/15 text-xs font-semibold">
                  🔴 URGENT
                </Badge>
              )}
              {record.priority === "high" && (
                <Badge variant="outline" className="border-orange-400 text-orange-700 dark:text-orange-400 bg-orange-500/15 text-xs">
                  🟠 HIGH
                </Badge>
              )}
              {/* Claim match confidence badge */}
              {record.claimMatchType && record.claimMatchType !== "none" && (
                <Badge
                  variant="outline"
                  className={
                    record.claimMatchConfidence != null && record.claimMatchConfidence >= 95
                      ? "border-green-400 text-green-700 dark:text-green-400 bg-green-500/15 text-xs"
                      : record.claimMatchConfidence != null && record.claimMatchConfidence >= 70
                      ? "border-yellow-400 text-yellow-700 dark:text-yellow-400 bg-yellow-500/15 text-xs"
                      : "border-muted text-muted-foreground bg-muted text-xs"
                  }
                >
                  {record.claimMatchConfidence != null && record.claimMatchConfidence >= 95 ? (
                    <ShieldCheck className="w-3 h-3 mr-1" />
                  ) : record.claimMatchConfidence != null && record.claimMatchConfidence >= 70 ? (
                    <ShieldAlert className="w-3 h-3 mr-1" />
                  ) : (
                    <ShieldX className="w-3 h-3 mr-1" />
                  )}
                  Claim Match: {record.claimMatchType?.replace("_", " ")} ({record.claimMatchConfidence ?? 0}%)
                </Badge>
              )}
              {record.callbackAt && (
                <Badge variant="outline" className="border-teal-400 text-teal-700 dark:text-teal-400 bg-teal-500/15 text-xs font-medium">
                  <PhoneCall className="w-3 h-3 mr-1" />
                  Returned
                </Badge>
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {editing ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
                <Button size="sm" className="bg-[#ff6221] hover:bg-[#e5541a] text-white" onClick={saveEdit} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-foreground/20 text-foreground hover:bg-foreground hover:text-background"
                  onClick={() => navigate(`/softphone?intakeId=${id}`)}
                  title="Open in Softphone"
                >
                  <Headphones className="w-3.5 h-3.5" />
                  Softphone
                </Button>
                <Button variant="outline" size="sm" onClick={startEdit}>Edit</Button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Caller Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground" />
                Caller Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Name</Label>
                {editing ? (
                  <Input value={form.callerName} onChange={(e) => setForm({ ...form, callerName: e.target.value })} className="mt-1 h-8 text-sm" />
                ) : (
                  <p className="text-sm mt-0.5">{record.callerName || "—"}</p>
                )}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Organization</Label>
                {editing ? (
                  <Input value={form.callerOrg} onChange={(e) => setForm({ ...form, callerOrg: e.target.value })} className="mt-1 h-8 text-sm" />
                ) : (
                  <p className="text-sm mt-0.5">{record.callerOrg || "—"}</p>
                )}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Phone</Label>
                <p className="text-sm mt-0.5 flex items-center gap-1">
                  <Phone className="w-3 h-3 text-muted-foreground" />
                  {record.callerPhone || "—"}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Claim Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                Claim Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Whip Claim #</Label>
                {editing ? (
                  <Input value={form.whipClaimNumber} onChange={(e) => setForm({ ...form, whipClaimNumber: e.target.value })} className="mt-1 h-8 text-sm font-mono" />
                ) : (
                  <p className="text-sm mt-0.5 font-mono">{record.whipClaimNumber || "—"}</p>
                )}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Their Reference #</Label>
                {editing ? (
                  <Input value={form.callerRefNumber} onChange={(e) => setForm({ ...form, callerRefNumber: e.target.value })} className="mt-1 h-8 text-sm" />
                ) : (
                  <p className="text-sm mt-0.5">{record.callerRefNumber || "—"}</p>
                )}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Source</Label>
                <p className="text-sm mt-0.5 capitalize">{record.source}</p>
              </div>
              {record.claimMatchType && (
                <div>
                  <Label className="text-xs text-muted-foreground">Claim Match</Label>
                  <p className="text-sm mt-0.5 capitalize">
                    {record.claimMatchType === "none" ? "No match found" : `${record.claimMatchType?.replace(/_/g, " ")} (${record.claimMatchConfidence ?? 0}% confidence)`}
                  </p>
                </div>
              )}
              {record.whipClaimNumber && (
                <div>
                  <Label className="text-xs text-muted-foreground">Snapsheet Claim</Label>
                  <a
                    href={`https://snapsheetvice.com/claims?search=${encodeURIComponent(record.whipClaimNumber)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Search this claim in Snapsheet (login required)"
                    className="inline-flex items-center gap-1 text-sm mt-0.5 text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Search in Snapsheet
                  </a>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Callback Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Phone className="w-4 h-4 text-muted-foreground" />
                Callback Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Callback Phone</Label>
                {editing ? (
                  <Input value={form.callbackPhone} onChange={(e) => setForm({ ...form, callbackPhone: e.target.value })} className="mt-1 h-8 text-sm" />
                ) : (
                  <p className="text-sm mt-0.5 flex items-center gap-1">
                    <Phone className="w-3 h-3 text-muted-foreground" />
                    {record.callbackPhone || "—"}
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Callback Email</Label>
                {editing ? (
                  <Input value={form.callbackEmail} onChange={(e) => setForm({ ...form, callbackEmail: e.target.value })} className="mt-1 h-8 text-sm" />
                ) : (
                  <p className="text-sm mt-0.5 flex items-center gap-1">
                    <Mail className="w-3 h-3 text-muted-foreground" />
                    {record.callbackEmail || "—"}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Assignment */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Building2 className="w-4 h-4 text-muted-foreground" />
                Assignment & Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Assigned Handler</Label>
                {editing ? (
                  <Select value={form.handlerName} onValueChange={(v) => setForm({ ...form, handlerName: v })}>
                    <SelectTrigger className="mt-1 h-8 text-sm">
                      <SelectValue placeholder="Select handler" />
                    </SelectTrigger>
                    <SelectContent>
                      {handlerNames.map((h) => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm mt-0.5">{record.handlerName || "—"}</p>
                )}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Status</Label>
                {editing ? (
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger className="mt-1 h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="escalated">Escalated</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm mt-0.5 capitalize">{record.status}</p>
                )}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Created</Label>
                <p className="text-sm mt-0.5">{format(new Date(record.createdAt), "MMM d, yyyy h:mm a")}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Message */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Message</CardTitle>
          </CardHeader>
          <CardContent>
            {editing ? (
              <Textarea
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                rows={4}
                className="text-sm"
              />
            ) : (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {record.message || "No message recorded."}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Internal Notes</CardTitle>
          </CardHeader>
          <CardContent>
            {editing ? (
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
                className="text-sm"
                placeholder="Add internal notes..."
              />
            ) : (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {record.notes || "No notes."}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Callback Panel */}
        <Card className="border-[#ff6221]/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <PhoneCall className="w-4 h-4 text-[#ff6221]" />
                Callback
              </CardTitle>
              <Button
                size="sm"
                className="bg-[#ff6221] hover:bg-[#e5541a] text-white gap-1.5 h-8 text-xs"
                onClick={() => setCallbackOpen(true)}
              >
                <Phone className="w-3.5 h-3.5" />
                Log Callback
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="bg-muted/30 rounded-lg p-3 text-sm space-y-1">
              <div className="font-medium text-foreground">{record.callerName || "Unknown caller"}</div>
              {record.callerOrg && <div className="text-muted-foreground text-xs">{record.callerOrg}</div>}
              <div className="flex items-center gap-3 mt-1">
                {record.callbackPhone && (
                  <a href={`tel:${record.callbackPhone}`} className="flex items-center gap-1 text-[#ff6221] hover:underline text-xs font-medium">
                    <Phone className="w-3 h-3" /> {record.callbackPhone}
                  </a>
                )}
                {record.callbackEmail && (
                  <a href={`mailto:${record.callbackEmail}`} className="flex items-center gap-1 text-[#ff6221] hover:underline text-xs font-medium">
                    <Mail className="w-3 h-3" /> {record.callbackEmail}
                  </a>
                )}
                {!record.callbackPhone && !record.callbackEmail && (
                  <span className="text-muted-foreground text-xs">No contact info on file</span>
                )}
              </div>
              {record.whipClaimNumber && (
                <div className="text-xs text-muted-foreground mt-1">
                  Claim: <span className="font-mono font-medium text-foreground">{record.whipClaimNumber}</span>
                </div>
              )}
            </div>
            {callbackHistory && callbackHistory.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <History className="w-3.5 h-3.5" /> Callback History
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {(callbackHistory as any[]).map((log) => (
                    <div key={log.id} className="flex items-start gap-2 text-xs bg-muted/20 rounded p-2">
                      <div className="flex-shrink-0 mt-0.5">
                        {log.disposition === "reached" ? (
                          <PhoneCall className="w-3.5 h-3.5 text-green-600" />
                        ) : log.disposition === "left_voicemail" ? (
                          <PhoneForwarded className="w-3.5 h-3.5 text-blue-500" />
                        ) : (
                          <PhoneOff className="w-3.5 h-3.5 text-red-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium capitalize">{log.disposition.replace(/_/g, " ")}</span>
                          <span className="text-muted-foreground">&bull;</span>
                          <span className="text-muted-foreground">{log.handlerName || "Unknown"}</span>
                          <span className="text-muted-foreground ml-auto">
                            {log.calledAt ? format(new Date(log.calledAt), "MMM d, h:mm a") : ""}
                          </span>
                        </div>
                        {log.notes && <div className="text-muted-foreground mt-0.5 truncate">{log.notes}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Log Callback Dialog */}
        <Dialog open={callbackOpen} onOpenChange={setCallbackOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <PhoneCall className="w-4 h-4 text-[#ff6221]" />
                Log Callback
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="bg-muted/30 rounded-lg p-3 text-sm space-y-1">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{record.callerName || "Unknown caller"}</div>
                  {record.callerType && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground capitalize">
                      {CALLER_TYPE_LABELS[record.callerType] ?? record.callerType}
                    </span>
                  )}
                </div>
                {record.callerOrg && <div className="text-xs text-muted-foreground">{record.callerOrg}</div>}
                {record.callbackPhone && <div className="text-xs text-[#ff6221] font-medium">{record.callbackPhone}</div>}
                {record.whipClaimNumber && (
                  <div className="text-xs text-muted-foreground">Claim: <span className="font-mono">{record.whipClaimNumber}</span></div>
                )}
                {record.message && (
                  <div className="text-xs text-muted-foreground border-t pt-1 mt-1 line-clamp-2">
                    <span className="font-medium text-foreground">Message: </span>{record.message}
                  </div>
                )}
              </div>
              {/* Call script tailored to caller type — sourced from Settings > Script Editor (DB-backed) */}
              {record.callerType && activeCallScripts[record.callerType] && (
                <div className="bg-blue-500/10 border border-blue-200 rounded-lg p-3">
                  <div className="text-xs font-semibold text-blue-700 mb-1.5 flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    Suggested Script
                  </div>
                  <p className="text-xs text-blue-800 leading-relaxed whitespace-pre-wrap">
                    {activeCallScripts[record.callerType]
                      .replace(/\[claim #\]/g, record.whipClaimNumber || "[claim #]")
                      .replace(/\[caller name\]/g, record.callerName || "[caller name]")
                      .replace(/\[insured name\]/g, record.callerName || "[insured name]")}
                  </p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs">Disposition</Label>
                <Select
                  value={callbackForm.disposition}
                  onValueChange={(v) => setCallbackForm({ ...callbackForm, disposition: v as any })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reached">Reached — spoke with caller</SelectItem>
                    <SelectItem value="no_answer">No answer</SelectItem>
                    <SelectItem value="left_voicemail">Left voicemail</SelectItem>
                    <SelectItem value="busy">Busy</SelectItem>
                    <SelectItem value="wrong_number">Wrong number</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Outcome</Label>
                <Select
                  value={callbackForm.outcome}
                  onValueChange={(v) => setCallbackForm({ ...callbackForm, outcome: v as any, closeRecord: v === "resolved" || v === "closed" })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="follow_up">Follow-up needed</SelectItem>
                    <SelectItem value="resolved">Resolved — close record</SelectItem>
                    <SelectItem value="escalated">Escalated</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Call Notes</Label>
                <Textarea
                  value={callbackForm.notes}
                  onChange={(e) => setCallbackForm({ ...callbackForm, notes: e.target.value })}
                  placeholder="What was discussed, next steps..."
                  rows={3}
                  className="text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Update Internal Notes (optional)</Label>
                <Textarea
                  value={callbackForm.newNotes}
                  onChange={(e) => setCallbackForm({ ...callbackForm, newNotes: e.target.value })}
                  placeholder="Append to record notes..."
                  rows={2}
                  className="text-sm"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCallbackOpen(false)}>Cancel</Button>
              <Button
                className="bg-[#ff6221] hover:bg-[#e5541a] text-white"
                disabled={logCallbackMutation.isPending}
                onClick={() => logCallbackMutation.mutate({
                  intakeId: id,
                  disposition: callbackForm.disposition,
                  outcome: callbackForm.outcome,
                  notes: callbackForm.notes || undefined,
                  closeRecord: callbackForm.closeRecord,
                  newNotes: callbackForm.newNotes || undefined,
                })}
              >
                {logCallbackMutation.isPending ? "Saving..." : "Save Callback"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Voicemail Recording Player */}
        {record.aircallCallId && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Headphones className="w-4 h-4 text-[#ff6221]" />
                <CardTitle className="text-sm font-semibold">Voicemail Recording</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <audio
                controls
                className="w-full h-10 rounded-lg"
                src={`/api/aircall-recording?callId=${encodeURIComponent(record.aircallCallId)}`}
                preload="none"
              >
                Your browser does not support audio playback.
              </audio>
              <p className="text-[10px] text-muted-foreground mt-2">
                Recording provided by Aircall. Audio is fetched on demand — press play to load.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Voicemail Transcript */}
        {record.rawTranscript && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Voicemail Transcript</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-muted/40 rounded-lg p-4 max-h-80 overflow-y-auto">
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
                  {record.rawTranscript}
                </pre>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </WhipLayout>
  );
}
