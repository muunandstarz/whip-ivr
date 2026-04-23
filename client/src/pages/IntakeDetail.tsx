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
import { ArrowLeft, Phone, Mail, Building2, FileText, User, Clock, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const HANDLERS = [
  "Natasha", "Jayla", "Carlito", "Annie", "Lorraine", "Jovel", "MJ", "Daryl",
];

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
      organization: record.organization || "",
      whipClaimNumber: record.whipClaimNumber || "",
      callerReferenceNumber: record.callerReferenceNumber || "",
      callPurpose: record.callPurpose || "",
      message: record.message || "",
      callbackPhone: record.callbackPhone || "",
      callbackEmail: record.callbackEmail || "",
      assignedHandler: record.assignedHandler || "",
      status: record.status,
    });
    setEditing(true);
  };

  const saveEdit = () => {
    updateMutation.mutate({
      id,
      callerName: form.callerName || undefined,
      organization: form.organization || undefined,
      whipClaimNumber: form.whipClaimNumber || undefined,
      callerReferenceNumber: form.callerReferenceNumber || undefined,
      callPurpose: form.callPurpose || undefined,
      message: form.message || undefined,
      callbackPhone: form.callbackPhone || undefined,
      callbackEmail: form.callbackEmail || undefined,
      assignedHandler: form.assignedHandler || undefined,
      status: (form.status as "open" | "closed") || undefined,
    });
  };

  const f = (key: string) => (editing ? form[key] ?? "" : (record as Record<string, unknown>)[key] as string ?? "");

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
            {record.organization && (
              <p className="text-muted-foreground text-sm">{record.organization}</p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <Badge
                variant="outline"
                className={record.status === "open"
                  ? "border-amber-300 text-amber-700 bg-amber-50"
                  : "border-green-300 text-green-700 bg-green-50"}
              >
                {record.status === "open" ? (
                  <><Clock className="w-3 h-3 mr-1" />Open</>
                ) : (
                  <><CheckCircle2 className="w-3 h-3 mr-1" />Closed</>
                )}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Record #{record.id} · {format(new Date(record.createdAt), "MMM d, yyyy h:mm a")}
              </span>
              <span className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground">
                {record.source === "ai_ivr" ? "AI IVR" : record.source === "voicemail" ? "Voicemail" : "Manual"}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            {!editing ? (
              <>
                <Button variant="outline" size="sm" onClick={startEdit}>Edit</Button>
                <Select
                  value={record.status}
                  onValueChange={(v) =>
                    updateMutation.mutate({ id, status: v as "open" | "closed" })
                  }
                >
                  <SelectTrigger className={`h-9 w-28 text-sm ${
                    record.status === "open"
                      ? "bg-amber-50 text-amber-700 border-amber-200"
                      : "bg-green-50 text-green-700 border-green-200"
                  }`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
                <Button
                  size="sm"
                  className="bg-[#171b31] hover:bg-[#1e2440] text-white"
                  onClick={saveEdit}
                  disabled={updateMutation.isPending}
                >
                  Save Changes
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          {/* Caller Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <User className="w-4 h-4 text-[#ff6221]" /> Caller Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Full Name</Label>
                {editing ? (
                  <Input value={form.callerName} onChange={(e) => setForm({ ...form, callerName: e.target.value })} className="mt-1 h-8 text-sm" />
                ) : (
                  <p className="text-sm mt-0.5">{record.callerName || "—"}</p>
                )}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Organization</Label>
                {editing ? (
                  <Input value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })} className="mt-1 h-8 text-sm" />
                ) : (
                  <p className="text-sm mt-0.5">{record.organization || "—"}</p>
                )}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Caller Phone</Label>
                <p className="text-sm mt-0.5 flex items-center gap-1">
                  <Phone className="w-3 h-3 text-muted-foreground" />
                  {record.callerPhone || "—"}
                </p>
              </div>
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
                <Label className="text-xs text-muted-foreground">Email</Label>
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

          {/* Claim Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#ff6221]" /> Claim Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Whip Claim Number</Label>
                {editing ? (
                  <Input value={form.whipClaimNumber} onChange={(e) => setForm({ ...form, whipClaimNumber: e.target.value })} className="mt-1 h-8 text-sm font-mono" placeholder="MD-XXXX-XXXXXX" />
                ) : (
                  <p className="text-sm mt-0.5 font-mono">
                    {record.whipClaimNumber ? (
                      <span className="bg-[#171b31]/8 text-[#171b31] px-2 py-0.5 rounded">
                        {record.whipClaimNumber}
                      </span>
                    ) : "—"}
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Their Reference Number</Label>
                {editing ? (
                  <Input value={form.callerReferenceNumber} onChange={(e) => setForm({ ...form, callerReferenceNumber: e.target.value })} className="mt-1 h-8 text-sm" />
                ) : (
                  <p className="text-sm mt-0.5">{record.callerReferenceNumber || "—"}</p>
                )}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Purpose of Call</Label>
                {editing ? (
                  <Input value={form.callPurpose} onChange={(e) => setForm({ ...form, callPurpose: e.target.value })} className="mt-1 h-8 text-sm" />
                ) : (
                  <p className="text-sm mt-0.5">{record.callPurpose || "—"}</p>
                )}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Assigned Handler</Label>
                {editing ? (
                  <Select value={form.assignedHandler} onValueChange={(v) => setForm({ ...form, assignedHandler: v })}>
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
                  <p className="text-sm mt-0.5 flex items-center gap-1">
                    <Building2 className="w-3 h-3 text-muted-foreground" />
                    {record.assignedHandler || "—"}
                  </p>
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
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm mt-0.5">{record.status}</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Message */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Message / Notes</CardTitle>
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

        {/* Transcript */}
        {record.transcript && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">AI Conversation Transcript</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-muted/40 rounded-lg p-4 max-h-80 overflow-y-auto">
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
                  {record.transcript}
                </pre>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </WhipLayout>
  );
}
