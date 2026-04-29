import { useState } from "react";
import { trpc } from "@/lib/trpc";
import WhipLayout from "@/components/WhipLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { SlidersHorizontal, FileText, CheckCircle, Pencil, X, Save } from "lucide-react";

const CALLER_TYPE_LABELS: Record<string, string> = {
  carrier: "Insurance Carrier",
  law_office: "Law Office",
  medical_provider: "Medical Provider",
  member: "Member",
  claimant: "Claimant",
  police: "Police",
  wrong_department: "Wrong Department",
  unknown: "Unknown Caller",
};

const CALLER_TYPE_COLORS: Record<string, string> = {
  carrier: "bg-blue-100 text-blue-700",
  law_office: "bg-purple-100 text-purple-700",
  medical_provider: "bg-green-100 text-green-700",
  member: "bg-orange-100 text-orange-700",
  claimant: "bg-yellow-100 text-yellow-700",
  police: "bg-red-100 text-red-700",
  wrong_department: "bg-gray-100 text-gray-700",
  unknown: "bg-slate-100 text-slate-700",
};

export default function Settings() {
  const { data: trpcUser } = trpc.auth.me.useQuery();
  const isAdmin = trpcUser?.role === "admin";

  const { data: scripts, refetch } = trpc.settings.getCallScripts.useQuery(undefined, {
    enabled: isAdmin,
  });

  const updateMutation = trpc.settings.updateCallScript.useMutation({
    onSuccess: () => {
      toast.success("Script saved successfully");
      setEditing(null);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const [editing, setEditing] = useState<string | null>(null);
  const [draftScript, setDraftScript] = useState("");

  function startEdit(callerType: string, currentScript: string) {
    setEditing(callerType);
    setDraftScript(currentScript);
  }

  function cancelEdit() {
    setEditing(null);
    setDraftScript("");
  }

  function saveEdit(callerType: string) {
    if (!draftScript.trim()) return;
    updateMutation.mutate({ callerType, script: draftScript.trim() });
  }

  if (!isAdmin) {
    return (
      <WhipLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground text-sm">Access restricted to administrators.</p>
        </div>
      </WhipLayout>
    );
  }

  return (
    <WhipLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#ff6221]/10 flex items-center justify-center">
            <SlidersHorizontal className="w-5 h-5 text-[#ff6221]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Settings</h1>
            <p className="text-sm text-muted-foreground">Manage call scripts and system configuration</p>
          </div>
        </div>

        {/* Call Scripts Section */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#ff6221]" />
              <CardTitle className="text-base">Callback Call Scripts</CardTitle>
            </div>
            <CardDescription>
              These scripts appear in the callback dialog when handlers return calls. Edit them to match your team's preferred language.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!scripts || scripts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Loading scripts...</p>
            ) : (
              scripts.map((s) => (
                <div
                  key={s.callerType}
                  className="border rounded-lg p-4 space-y-3 bg-background hover:border-[#ff6221]/30 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          CALLER_TYPE_COLORS[s.callerType] ?? "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {CALLER_TYPE_LABELS[s.callerType] ?? s.label}
                      </span>
                      {s.updatedBy && (
                        <span className="text-xs text-muted-foreground">
                          Last edited by {s.updatedBy}
                        </span>
                      )}
                    </div>
                    {editing === s.callerType ? (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs gap-1 text-gray-500"
                          onClick={cancelEdit}
                        >
                          <X className="w-3 h-3" />
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 text-xs gap-1 bg-[#ff6221] hover:bg-[#e5541a] text-white"
                          onClick={() => saveEdit(s.callerType)}
                          disabled={updateMutation.isPending}
                        >
                          <Save className="w-3 h-3" />
                          Save
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs gap-1 text-[#ff6221] hover:text-[#e5541a] hover:bg-[#ff6221]/10"
                        onClick={() => startEdit(s.callerType, s.script)}
                      >
                        <Pencil className="w-3 h-3" />
                        Edit
                      </Button>
                    )}
                  </div>

                  {editing === s.callerType ? (
                    <Textarea
                      value={draftScript}
                      onChange={(e) => setDraftScript(e.target.value)}
                      rows={4}
                      className="text-sm font-mono resize-y focus:border-[#ff6221] focus:ring-[#ff6221]/20"
                      placeholder="Enter call script..."
                      autoFocus
                    />
                  ) : (
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap bg-muted rounded-md px-3 py-2">
                      {s.script}
                    </p>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Placeholder for future settings sections */}
        <Card className="opacity-60">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-base text-muted-foreground">More Settings</CardTitle>
            </div>
            <CardDescription>
              Additional configuration options (routing rules, notification preferences, IVR prompts) coming soon.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </WhipLayout>
  );
}
