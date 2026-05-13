import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import WhipLayout from "@/components/WhipLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";

export default function NewIntake() {
  const [, navigate] = useLocation();
  const { data: trpcUser } = trpc.auth.me.useQuery();
  const { data: handlersData } = trpc.handlers.list.useQuery();

  // Admin-only guard: redirect non-admins
  useEffect(() => {
    if (trpcUser && trpcUser.role !== "admin") {
      navigate("/intake");
    }
  }, [trpcUser, navigate]);

  const [form, setForm] = useState({
    callerPhone: "",
    callerType: "unknown" as "carrier" | "law_office" | "medical_provider" | "member" | "claimant" | "police" | "unknown",
    callerName: "",
    callerOrg: "",
    whipClaimNumber: "",
    callerRefNumber: "",
    message: "",
    callbackPhone: "",
    callbackEmail: "",
    handlerName: "",
  });

  const createMutation = trpc.intake.create.useMutation({
    onSuccess: (data) => {
      toast.success("Intake record created");
      navigate(`/intake/${data.id}`);
    },
    onError: () => toast.error("Failed to create record"),
  });

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  // Don't render form until we know the user is an admin
  if (!trpcUser || trpcUser.role !== "admin") {
    return (
      <WhipLayout>
        <div className="p-6 flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </WhipLayout>
    );
  }

  const handlers = handlersData?.filter((h) => h.active) ?? [];

  return (
    <WhipLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/intake")} className="gap-1">
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-foreground">New Manual Intake</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Log a call intake record manually for the claims team.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Caller Information</CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Caller Type *</Label>
              <Select value={form.callerType} onValueChange={(v) => set("callerType", v)}>
                <SelectTrigger className="mt-1 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="carrier">Carrier / Insurance</SelectItem>
                  <SelectItem value="law_office">Law Office</SelectItem>
                  <SelectItem value="medical_provider">Medical Provider</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="claimant">Claimant</SelectItem>
                  <SelectItem value="police">Police</SelectItem>
                  <SelectItem value="unknown">Unknown</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Caller Phone</Label>
              <Input
                value={form.callerPhone}
                onChange={(e) => set("callerPhone", e.target.value)}
                className="mt-1 h-9 text-sm"
                placeholder="+1 (555) 000-0000"
              />
            </div>
            <div>
              <Label className="text-xs">Full Name</Label>
              <Input
                value={form.callerName}
                onChange={(e) => set("callerName", e.target.value)}
                className="mt-1 h-9 text-sm"
                placeholder="First Last"
              />
            </div>
            <div>
              <Label className="text-xs">Organization / Company</Label>
              <Input
                value={form.callerOrg}
                onChange={(e) => set("callerOrg", e.target.value)}
                className="mt-1 h-9 text-sm"
                placeholder="State Farm, Law Offices of..."
              />
            </div>
            <div>
              <Label className="text-xs">Callback Phone</Label>
              <Input
                value={form.callbackPhone}
                onChange={(e) => set("callbackPhone", e.target.value)}
                className="mt-1 h-9 text-sm"
                placeholder="+1 (555) 000-0000"
              />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input
                value={form.callbackEmail}
                onChange={(e) => set("callbackEmail", e.target.value)}
                className="mt-1 h-9 text-sm"
                placeholder="adjuster@carrier.com"
                type="email"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Claim Information</CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Whip Claim Number</Label>
              <Input
                value={form.whipClaimNumber}
                onChange={(e) => set("whipClaimNumber", e.target.value)}
                className="mt-1 h-9 text-sm font-mono"
                placeholder="MD-XXXX-XXXXXX"
              />
            </div>
            <div>
              <Label className="text-xs">Their Reference Number</Label>
              <Input
                value={form.callerRefNumber}
                onChange={(e) => set("callerRefNumber", e.target.value)}
                className="mt-1 h-9 text-sm"
                placeholder="Carrier / file reference"
              />
            </div>
            <div>
              <Label className="text-xs">Assigned Handler</Label>
              <Select value={form.handlerName} onValueChange={(v) => set("handlerName", v)}>
                <SelectTrigger className="mt-1 h-9 text-sm">
                  <SelectValue placeholder="Select handler" />
                </SelectTrigger>
                <SelectContent>
                  {handlers.map((h) => (
                    <SelectItem key={String(h.id)} value={h.name}>
                      {h.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Message / Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={form.message}
              onChange={(e) => set("message", e.target.value)}
              rows={4}
              className="text-sm"
              placeholder="Caller's message, notes, or additional context..."
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => navigate("/intake")}>
            Cancel
          </Button>
          <Button
            className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
            onClick={() => createMutation.mutate(form)}
            disabled={createMutation.isPending}
          >
            <Save className="w-4 h-4" />
            {createMutation.isPending ? "Saving..." : "Save Intake Record"}
          </Button>
        </div>
      </div>
    </WhipLayout>
  );
}
