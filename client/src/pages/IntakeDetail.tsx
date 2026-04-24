import { useState } from "react";
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
import { ArrowLeft, Phone, Mail, Building2, FileText, User, Clock, CheckCircle2, AlertTriangle, ExternalLink, ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const HANDLERS = [
  "Natasha", "Jayla", "Carlito", "Annie", "Lorraine", "Jovel", "MJ", "Daryl",
];

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

  const { data: record, isLoading, refetch } = trpc.intake.get.useQuery({ id });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

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
            <h1 className="text-2xl font-bold text-[#171b31]">
              {record.callerName || record.callerPhone || "Unknown Caller"}
            </h1>
            {record.callerOrg && (
              <p className="text-muted-foreground text-sm">{record.callerOrg}</p>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge
                variant="outline"
                className={record.status === "open"
                  ? "border-amber-300 text-amber-700 bg-amber-50"
                  : record.status === "escalated"
                  ? "border-red-300 text-red-700 bg-red-50"
                  : "border-green-300 text-green-700 bg-green-50"}
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
                <Badge variant="outline" className="border-red-300 text-red-700 bg-red-50 text-xs">
                  🔁 Repeat Caller ({record.repeatCallCount}x)
                </Badge>
              )}
              {record.priority === "urgent" && (
                <Badge variant="outline" className="border-red-400 text-red-700 bg-red-50 text-xs font-semibold">
                  🔴 URGENT
                </Badge>
              )}
              {record.priority === "high" && (
                <Badge variant="outline" className="border-orange-400 text-orange-700 bg-orange-50 text-xs">
                  🟠 HIGH
                </Badge>
              )}
              {/* Claim match confidence badge */}
              {record.claimMatchType && record.claimMatchType !== "none" && (
                <Badge
                  variant="outline"
                  className={
                    record.claimMatchConfidence != null && record.claimMatchConfidence >= 95
                      ? "border-green-400 text-green-700 bg-green-50 text-xs"
                      : record.claimMatchConfidence != null && record.claimMatchConfidence >= 70
                      ? "border-yellow-400 text-yellow-700 bg-yellow-50 text-xs"
                      : "border-gray-400 text-gray-600 bg-gray-50 text-xs"
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
              <Button variant="outline" size="sm" onClick={startEdit}>Edit</Button>
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
                      {HANDLERS.map((h) => (
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
