import WhipLayout from "@/components/WhipLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Phone, PhoneOff, Info } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// Aircall Phone SDK — loaded via CDN script tag
// Docs: https://developer.aircall.io/api-references/#phone-sdk
declare global {
  interface Window {
    AircallPhone: any;
  }
}

export default function Softphone() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const sdkRef = useRef<any>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [callActive, setCallActive] = useState(false);
  const [callInfo, setCallInfo] = useState<{
    number?: string;
    contact?: string;
    direction?: string;
  } | null>(null);

  useEffect(() => {
    // Load Aircall Phone SDK script
    const existing = document.getElementById("aircall-phone-sdk");
    if (!existing) {
      const script = document.createElement("script");
      script.id = "aircall-phone-sdk";
      script.src = "https://cdn.aircall.io/phone-sdk/latest/aircall-phone.min.js";
      script.async = true;
      script.onload = () => initSdk();
      document.head.appendChild(script);
    } else {
      initSdk();
    }

    return () => {
      if (sdkRef.current) {
        try { sdkRef.current.destroy?.(); } catch {}
      }
    };
  }, []);

  function initSdk() {
    if (!window.AircallPhone || !iframeRef.current) return;
    const phone = new window.AircallPhone({
      domToLoadPhone: "#aircall-phone-container",
      onLogin: () => setSdkReady(true),
      onLogout: () => setSdkReady(false),
    });
    sdkRef.current = phone;

    phone.on("incoming_call", (data: any) => {
      setCallActive(true);
      setCallInfo({
        number: data.from,
        contact: data.contact?.name,
        direction: "inbound",
      });
    });

    phone.on("call_end_ringtone", () => {
      setCallActive(false);
      setCallInfo(null);
    });

    phone.on("call_ended", () => {
      setCallActive(false);
      setCallInfo(null);
    });

    phone.on("outgoing_call", (data: any) => {
      setCallActive(true);
      setCallInfo({
        number: data.to,
        contact: data.contact?.name,
        direction: "outbound",
      });
    });
  }

  return (
    <WhipLayout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#171b31]">Softphone</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Make and receive calls directly from the dashboard — powered by Aircall.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Phone widget */}
          <div className="lg:col-span-1">
            <Card className="border-0 shadow-md overflow-hidden">
              <CardHeader className="pb-3 bg-[#171b31] text-white">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  Aircall Phone
                  {sdkReady && (
                    <Badge className="ml-auto bg-green-500/20 text-green-300 border-green-500/30 text-xs">
                      Connected
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {/* Aircall embeds its own iframe here */}
                <div
                  id="aircall-phone-container"
                  className="w-full"
                  style={{ minHeight: 520 }}
                />
              </CardContent>
            </Card>
          </div>

          {/* Status + instructions */}
          <div className="lg:col-span-2 space-y-4">
            {/* Active call banner */}
            {callActive && callInfo && (
              <Card className="border-green-200 bg-green-50">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
                  <div>
                    <div className="font-semibold text-green-900 text-sm">
                      {callInfo.direction === "inbound" ? "Incoming call" : "Outgoing call"}
                    </div>
                    <div className="text-green-700 text-xs">
                      {callInfo.contact || callInfo.number || "Unknown caller"}
                      {callInfo.contact && callInfo.number && ` · ${callInfo.number}`}
                    </div>
                  </div>
                  <div className="ml-auto">
                    <PhoneOff className="w-4 h-4 text-green-600" />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Setup instructions */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Info className="w-4 h-4 text-[#ff6221]" />
                  First-time setup
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  The phone widget will prompt you to log in with your Aircall credentials the first time. Once logged in, your session is saved and you can make and receive calls without leaving this dashboard.
                </p>
                <ol className="space-y-2 list-decimal list-inside text-sm">
                  <li>Click the phone widget on the left and sign in with your Aircall account.</li>
                  <li>Allow microphone access when prompted by your browser.</li>
                  <li>Your status will show as <strong>Available</strong> — you'll receive inbound calls here.</li>
                  <li>To make an outbound call, dial directly in the widget or click a phone number anywhere in the dashboard.</li>
                </ol>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-xs">
                  <strong>Note:</strong> Make sure you are not already logged into the Aircall desktop app — only one active session per agent is supported. Log out of the desktop app before using this softphone.
                </div>
              </CardContent>
            </Card>

            {/* Callback QA reminder */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Callback QA</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>
                  When you return a call from an intake record, open the record and click <strong>Mark Callback Made</strong> to log the timestamp. All voicemail callbacks are due before end of business on the day received.
                </p>
                <p>
                  The <strong>Intake Records</strong> list shows a callback status badge — <span className="text-green-700 font-medium">On Time</span>, <span className="text-amber-700 font-medium">Pending</span>, or <span className="text-red-700 font-medium">Overdue</span> — so managers can track compliance at a glance.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </WhipLayout>
  );
}
