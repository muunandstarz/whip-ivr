import { useState } from "react";
import { trpc } from "@/lib/trpc";
import WhipLayout from "@/components/WhipLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  SlidersHorizontal, FileText, CheckCircle, Pencil, X, Save,
  Phone, Zap, Shield, ArrowRight, Webhook, Copy,
} from "lucide-react";

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

const IVR_STEPS = [
  {
    num: 1,
    title: "Add the Whip IVR webhook to Aircall",
    description:
      "In the Aircall Dashboard, go to Integrations → API & Webhooks → Webhooks. Add a new webhook pointing to your deployed app URL. Enable the events: call.created, call.ended, and call.voicemail_left.",
  },
  {
    num: 2,
    title: "Configure your Claims line IVR flow",
    description:
      "In Aircall, open your Claims phone number settings. Under IVR, set the fallback (no-answer) action to record a voicemail. The webhook will fire automatically when a voicemail is left, triggering AI transcription and intake extraction.",
  },
  {
    num: 3,
    title: "Verify agent routing",
    description:
      "Calls routed to live agents (members, claimants, police) will ring the team's Aircall extensions. Missed calls and voicemails are automatically processed by the AI and appear as intake records.",
  },
  {
    num: 4,
    title: "Test the flow",
    description:
      "Call the Claims line and leave a voicemail saying 'I'm calling from State Farm about a claim.' Within seconds, an intake record will appear automatically with the caller's information extracted by AI.",
  },
];

function CopyCode({ value }: { value: string }) {
  const copy = () => {
    navigator.clipboard.writeText(value);
    toast.success("Copied to clipboard");
  };
  return (
    <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 mt-1">
      <code className="text-xs flex-1 break-all font-mono text-foreground">{value}</code>
      <button onClick={copy} className="text-muted-foreground hover:text-foreground flex-shrink-0">
        <Copy className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

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
  function cancelEdit() { setEditing(null); setDraftScript(""); }
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

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

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
            <p className="text-sm text-muted-foreground">Manage call scripts, IVR setup, and system configuration</p>
          </div>
        </div>

        <Tabs defaultValue="scripts">
          <TabsList className="mb-4">
            <TabsTrigger value="scripts">Call Scripts</TabsTrigger>
            <TabsTrigger value="ivr">IVR Setup</TabsTrigger>
          </TabsList>

          {/* ── Call Scripts Tab ── */}
          <TabsContent value="scripts" className="space-y-4">
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
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CALLER_TYPE_COLORS[s.callerType] ?? "bg-gray-100 text-gray-700"}`}>
                            {CALLER_TYPE_LABELS[s.callerType] ?? s.label}
                          </span>
                          {s.updatedBy && (
                            <span className="text-xs text-muted-foreground">Last edited by {s.updatedBy}</span>
                          )}
                        </div>
                        {editing === s.callerType ? (
                          <div className="flex gap-2">
                            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-gray-500" onClick={cancelEdit}>
                              <X className="w-3 h-3" /> Cancel
                            </Button>
                            <Button size="sm" className="h-7 text-xs gap-1 bg-[#ff6221] hover:bg-[#e5541a] text-white" onClick={() => saveEdit(s.callerType)} disabled={updateMutation.isPending}>
                              <Save className="w-3 h-3" /> Save
                            </Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-[#ff6221] hover:text-[#e5541a] hover:bg-[#ff6221]/10" onClick={() => startEdit(s.callerType, s.script)}>
                            <Pencil className="w-3 h-3" /> Edit
                          </Button>
                        )}
                      </div>
                      {editing === s.callerType ? (
                        <Textarea value={draftScript} onChange={(e) => setDraftScript(e.target.value)} rows={4} className="text-sm font-mono resize-y focus:border-[#ff6221] focus:ring-[#ff6221]/20" placeholder="Enter call script..." autoFocus />
                      ) : (
                        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap bg-muted rounded-md px-3 py-2">{s.script}</p>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── IVR Setup Tab ── */}
          <TabsContent value="ivr" className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-foreground">IVR Setup — Aircall Webhook</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Aircall IVR with AI intake processing. Carriers, law offices, and medical providers leave voicemails that are automatically transcribed and turned into intake records.
              </p>
            </div>

            {/* Feature badges */}
            <div className="flex flex-wrap gap-2">
              {[
                { icon: Zap, label: "AI Transcription", color: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
                { icon: Shield, label: "Auto Classification", color: "bg-green-500/10 text-green-700 dark:text-green-400" },
                { icon: Phone, label: "Live Agent Routing", color: "bg-purple-500/10 text-purple-700 dark:text-purple-400" },
              ].map(({ icon: Icon, label, color }) => (
                <span key={label} className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${color}`}>
                  <Icon className="w-3 h-3" /> {label}
                </span>
              ))}
            </div>

            {/* Webhook URL */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Webhook className="w-4 h-4 text-[#ff6221]" />
                  <CardTitle className="text-sm">Webhook Endpoint</CardTitle>
                </div>
                <CardDescription className="text-xs">
                  Add this URL to Aircall under Integrations → API & Webhooks → Webhooks. Enable: <code className="bg-muted px-1 rounded">call.created</code>, <code className="bg-muted px-1 rounded">call.ended</code>, <code className="bg-muted px-1 rounded">call.voicemail_left</code>.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CopyCode value={`${baseUrl}/api/aircall-webhook`} />
              </CardContent>
            </Card>

            {/* Setup steps */}
            <div className="space-y-3">
              {IVR_STEPS.map((step) => (
                <Card key={step.num}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex gap-4">
                      <div className="w-7 h-7 rounded-full bg-[#ff6221]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-[#ff6221]">{step.num}</span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{step.title}</p>
                        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{step.description}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Call routing logic */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Call Routing Logic</CardTitle>
                <CardDescription className="text-xs">How calls are handled based on caller type</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[
                    { type: "Insurance Carrier", route: "Press 1 → AI intake (IVR eligible)", color: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
                    { type: "Law Office / Attorney", route: "Press 1 → AI intake (IVR eligible)", color: "bg-purple-500/10 text-purple-700 dark:text-purple-400" },
                    { type: "Medical Provider", route: "Press 1 → AI intake (IVR eligible)", color: "bg-green-500/10 text-green-700 dark:text-green-400" },
                    { type: "Member / Claimant / Police", route: "Routes to live agent", color: "bg-orange-500/10 text-orange-700 dark:text-orange-400" },
                    { type: "Voicemail (any type)", route: "AI transcription → auto intake record", color: "bg-slate-500/10 text-slate-700 dark:text-slate-400" },
                  ].map(({ type, route, color }) => (
                    <div key={type} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${color}`}>{type}</span>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <ArrowRight className="w-3 h-3" />
                        {route}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </WhipLayout>
  );
}
