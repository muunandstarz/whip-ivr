import WhipLayout from "@/components/WhipLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, CheckCircle2, Phone, Zap, Shield, ArrowRight } from "lucide-react";
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
    title: "Get your public webhook URL",
    description:
      "Your Whip IVR is deployed and ready. The webhook base URL is your deployed app domain. Copy the endpoints below and paste them into Twilio.",
  },
  {
    num: 2,
    title: "Configure Twilio Phone Number",
    description:
      "In the Twilio Console, go to Phone Numbers → Active Numbers → select your claims line number. Under Voice & Fax, set the following:",
  },
  {
    num: 3,
    title: "Set up voicemail fallback",
    description:
      "In Twilio, configure a <Record> verb fallback so that if no agent answers, the call records and the recording URL is sent to the voicemail webhook.",
  },
  {
    num: 4,
    title: "Test the flow",
    description:
      "Call your Twilio number and say 'I'm calling from State Farm about a claim.' The AI will collect your information and create an intake record automatically.",
  },
];

export default function IVRSetup() {
  const baseUrl = window.location.origin;

  return (
    <WhipLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#171b31]">IVR Setup Guide</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Connect your Twilio phone number to the Whip AI voice bot in 4 steps.
          </p>
        </div>

        {/* How it works */}
        <Card className="border-[#171b31]/20 bg-[#171b31]/3">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#ff6221]" /> How It Works
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="grid md:grid-cols-3 gap-3">
              <div className="bg-white rounded-lg p-3 border">
                <div className="font-semibold text-[#171b31] text-xs mb-1">1. Caller rings in</div>
                <p className="text-xs">Twilio receives the call and sends a webhook to <code className="bg-muted px-1 rounded">/api/ivr/voice</code></p>
              </div>
              <div className="bg-white rounded-lg p-3 border">
                <div className="font-semibold text-[#171b31] text-xs mb-1">2. AI identifies caller</div>
                <p className="text-xs">The LLM classifies the caller as carrier, law office, medical, member, claimant, police, or wrong department</p>
              </div>
              <div className="bg-white rounded-lg p-3 border">
                <div className="font-semibold text-[#171b31] text-xs mb-1">3. Smart routing</div>
                <p className="text-xs">Members/claimants/police → live agent. Carriers/law/medical → AI intake. Wrong dept → auto-redirected.</p>
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
                { type: "Member / Claimant / Police", action: "Transfer to live agent queue", color: "bg-green-100 text-green-700" },
                { type: "Insurance Carrier", action: "AI collects full intake — name, org, Whip claim #, ref #, message, callback", color: "bg-blue-100 text-blue-700" },
                { type: "Law Office", action: "AI collects full intake — same fields as carrier", color: "bg-purple-100 text-purple-700" },
                { type: "Medical Provider", action: "AI collects full intake — same fields as carrier", color: "bg-emerald-100 text-emerald-700" },
                { type: "Vehicle / Billing / Help Desk", action: "AI provides correct dept number and ends call — no agent time used", color: "bg-gray-100 text-gray-600" },
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
              <Phone className="w-4 h-4 text-[#ff6221]" /> Twilio Webhook Endpoints
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold">Voice (Inbound Call)</span>
                <Badge className="text-xs bg-green-100 text-green-700 border-0">POST</Badge>
              </div>
              <p className="text-xs text-muted-foreground mb-1">
                Set this as your Twilio number's <strong>A Call Comes In</strong> webhook URL.
              </p>
              <CopyCode value={`${baseUrl}/api/ivr/voice`} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold">Gather (Speech Input)</span>
                <Badge className="text-xs bg-blue-100 text-blue-700 border-0">POST</Badge>
              </div>
              <p className="text-xs text-muted-foreground mb-1">
                This is called automatically by Twilio during the conversation — no manual setup needed.
              </p>
              <CopyCode value={`${baseUrl}/api/ivr/gather`} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold">Voicemail Recording</span>
                <Badge className="text-xs bg-amber-100 text-amber-700 border-0">POST</Badge>
              </div>
              <p className="text-xs text-muted-foreground mb-1">
                Set this as the <strong>Recording Status Callback URL</strong> in Twilio.
              </p>
              <CopyCode value={`${baseUrl}/api/ivr/voicemail`} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold">Call Status Callback</span>
                <Badge className="text-xs bg-gray-100 text-gray-600 border-0">POST</Badge>
              </div>
              <p className="text-xs text-muted-foreground mb-1">
                Set this as the <strong>Call Status Callback URL</strong> for session cleanup.
              </p>
              <CopyCode value={`${baseUrl}/api/ivr/status`} />
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
                          A new intake record will appear in the Intake Records page with the caller's name, organization, claim number, and message — all collected automatically by the AI.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm">
          <div className="font-semibold text-amber-800 mb-1">Need a Twilio account?</div>
          <p className="text-amber-700 text-xs">
            Sign up at <strong>twilio.com</strong>, purchase a phone number, and point it to the webhook URLs above. 
            Twilio charges per minute of call time — typically $0.013–$0.022/min for inbound calls.
            The AI voice bot runs on your existing LLM infrastructure at no additional per-call cost.
          </p>
        </div>
      </div>
    </WhipLayout>
  );
}
