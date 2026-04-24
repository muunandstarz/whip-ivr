import WhipLayout from "@/components/WhipLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Copy, CheckCircle2, Phone, Zap, Shield, ArrowRight, Webhook } from "lucide-react";
import { toast } from "sonner";

function CopyCode({ value }: { value: string }) {
  const copy = () => {
    navigator.clipboard.writeText(value);
    toast.success("Copied to clipboard");
  };
  return (
    <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 mt-1">
      <code className="text-xs flex-1 break-all font-mono text-[#171b31]">{value}</code>
      <button onClick={copy} className="text-muted-foreground hover:text-foreground flex-shrink-0">
        <Copy className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

const STEPS = [
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
      "Calls routed to live agents (members, claimants, police) will ring MJ Badua and Daryl Ochate's Aircall extensions. Missed calls and voicemails are automatically processed by the AI and appear as intake records.",
  },
  {
    num: 4,
    title: "Test the flow",
    description:
      "Call the Claims line and leave a voicemail saying 'I'm calling from State Farm about a claim.' Within seconds, an intake record will appear automatically with the caller's information extracted by AI.",
  },
];

export default function IVRSetup() {
  const baseUrl = window.location.origin;

  return (
    <WhipLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#171b31]">IVR Setup — Option C</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Aircall webhook integration with AI voicemail processing. No third-party telephony required.
          </p>
        </div>

        {/* How it works */}
        <Card className="border-[#171b31]/20 bg-[#171b31]/3">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#ff6221]" /> How Option C Works
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="grid md:grid-cols-3 gap-3">
              <div className="bg-white rounded-lg p-3 border">
                <div className="font-semibold text-[#171b31] text-xs mb-1">1. Call comes in</div>
                <p className="text-xs">Aircall receives the inbound call on your Claims line and fires a <code className="bg-muted px-1 rounded">call.created</code> webhook</p>
              </div>
              <div className="bg-white rounded-lg p-3 border">
                <div className="font-semibold text-[#171b31] text-xs mb-1">2. Voicemail left</div>
                <p className="text-xs">If no agent answers, Aircall records a voicemail and fires <code className="bg-muted px-1 rounded">call.voicemail_left</code> with the recording URL</p>
              </div>
              <div className="bg-white rounded-lg p-3 border">
                <div className="font-semibold text-[#171b31] text-xs mb-1">3. AI processes intake</div>
                <p className="text-xs">Whisper transcribes the audio. The LLM extracts caller type, claim #, org, message, and callback — creating a structured intake record automatically.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Routing Rules */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#ff6221]" /> Routing Rules
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {[
                { type: "Insurance Carrier", action: "AI extracts full intake from voicemail — name, org, Whip claim #, ref #, message, callback", color: "bg-blue-100 text-blue-700" },
                { type: "Law Office", action: "AI extracts full intake — same fields as carrier", color: "bg-purple-100 text-purple-700" },
                { type: "Medical Provider", action: "AI extracts full intake — same fields as carrier", color: "bg-emerald-100 text-emerald-700" },
                { type: "Member / Claimant / Police", action: "Routed to live agent (MJ Badua or Daryl Ochate). Missed calls flagged for callback.", color: "bg-green-100 text-green-700" },
                { type: "Answered Call", action: "Logged to call history with agent name, duration, and answer time — no intake created", color: "bg-gray-100 text-gray-600" },
              ].map((row, i) => (
                <div key={i} className="flex items-start gap-3 py-2 border-b last:border-0">
                  <Badge className={`text-xs flex-shrink-0 border-0 ${row.color}`}>{row.type}</Badge>
                  <div className="flex items-center gap-1 text-muted-foreground text-xs">
                    <ArrowRight className="w-3 h-3 flex-shrink-0" />
                    {row.action}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Webhook Endpoints */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Webhook className="w-4 h-4 text-[#ff6221]" /> Aircall Webhook Endpoints
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold">Aircall Webhook Handler</span>
                <Badge className="text-xs bg-green-100 text-green-700 border-0">POST</Badge>
              </div>
              <p className="text-xs text-muted-foreground mb-1">
                Paste this URL into Aircall → Integrations → Webhooks. Handles <strong>call.created</strong>, <strong>call.ended</strong>, and <strong>call.voicemail_left</strong> events.
              </p>
              <CopyCode value={`${baseUrl}/api/aircall/webhook`} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold">Voicemail Processing</span>
                <Badge className="text-xs bg-amber-100 text-amber-700 border-0">POST</Badge>
              </div>
              <p className="text-xs text-muted-foreground mb-1">
                Called automatically when <code className="bg-muted px-1 rounded">call.voicemail_left</code> fires. Transcribes audio via Whisper and runs LLM intake extraction.
              </p>
              <CopyCode value={`${baseUrl}/api/aircall/voicemail`} />
            </div>
          </CardContent>
        </Card>

        {/* Steps */}
        <div className="space-y-4">
          {STEPS.map((step) => (
            <Card key={step.num}>
              <CardContent className="pt-5">
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-[#171b31] text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                    {step.num}
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-[#171b31]">{step.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{step.description}</p>
                    {step.num === 4 && (
                      <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3">
                        <div className="flex items-center gap-2 text-green-700 text-xs font-semibold">
                          <CheckCircle2 className="w-4 h-4" />
                          Expected result
                        </div>
                        <p className="text-xs text-green-600 mt-1">
                          A new intake record will appear in Intake Records with the caller's name, organization, claim number, and message — all extracted automatically by AI from the voicemail.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="bg-[#171b31]/5 border border-[#171b31]/15 rounded-lg p-4 text-sm">
          <div className="font-semibold text-[#171b31] mb-1 flex items-center gap-2">
            <Phone className="w-4 h-4 text-[#ff6221]" /> Aircall Configuration Notes
          </div>
          <ul className="text-[#171b31]/70 text-xs space-y-1 list-disc list-inside">
            <li>Webhook secret (optional): set in Aircall and add as <code className="bg-muted px-1 rounded">AIRCALL_WEBHOOK_SECRET</code> env var for signature verification</li>
            <li>Voicemail recordings are fetched directly from the Aircall recording URL — no additional storage setup needed</li>
            <li>The daily call sync pulls the last 30 days of call history automatically on server start</li>
            <li>Agent names are resolved from Aircall user IDs in real time — no manual mapping required</li>
          </ul>
        </div>
      </div>
    </WhipLayout>
  );
}
