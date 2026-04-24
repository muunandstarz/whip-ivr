import { useState, useRef } from "react";
import WhipLayout from "@/components/WhipLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Phone,
  PhoneOff,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Delete,
  Clock,
  User,
  ChevronRight,
  ExternalLink,
  Info,
} from "lucide-react";

// ─── Dummy data ────────────────────────────────────────────────────────────────
const RECENT_CALLS = [
  { id: 1, name: "State Farm – Claims", number: "+1 (800) 732-5246", type: "inbound", status: "answered", duration: "4:22", time: "2:14 PM", callerType: "carrier" },
  { id: 2, name: "Unknown", number: "+1 (213) 555-0182", type: "inbound", status: "missed", duration: "—", time: "1:47 PM", callerType: "unknown" },
  { id: 3, name: "Allstate Insurance", number: "+1 (800) 255-7828", type: "inbound", status: "answered", duration: "6:08", time: "12:30 PM", callerType: "carrier" },
  { id: 4, name: "Marcus Johnson", number: "+1 (310) 555-0294", type: "outbound", status: "answered", duration: "3:15", time: "11:55 AM", callerType: "claimant" },
  { id: 5, name: "Law Office of Rivera", number: "+1 (323) 555-0471", type: "inbound", status: "voicemail", duration: "0:45", time: "10:20 AM", callerType: "law_office" },
  { id: 6, name: "Geico Claims", number: "+1 (800) 841-3000", type: "inbound", status: "answered", duration: "2:50", time: "9:44 AM", callerType: "carrier" },
];

const STATUS_OPTIONS = [
  { value: "available", label: "Available", color: "bg-green-500" },
  { value: "busy", label: "On a Call", color: "bg-yellow-500" },
  { value: "away", label: "Away", color: "bg-gray-400" },
  { value: "offline", label: "Offline", color: "bg-red-500" },
];

const DIAL_KEYS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["*", "0", "#"],
];

type CallState = "idle" | "ringing" | "active" | "incoming";

export default function Softphone() {
  const [dialValue, setDialValue] = useState("");
  const [callState, setCallState] = useState<CallState>("idle");
  const [muted, setMuted] = useState(false);
  const [speakerOff, setSpeakerOff] = useState(false);
  const [status, setStatus] = useState("available");
  const [callDuration, setCallDuration] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [incomingCaller] = useState({ name: "State Farm – Claims", number: "+1 (800) 732-5246" });

  const handleDial = (key: string) => {
    setDialValue((v) => (v.length < 14 ? v + key : v));
  };

  const handleDelete = () => setDialValue((v) => v.slice(0, -1));

  const handleCall = () => {
    if (!dialValue) return;
    setCallState("ringing");
    setTimeout(() => {
      setCallState("active");
      timerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
    }, 2000);
  };

  const handleHangUp = () => {
    setCallState("idle");
    setCallDuration(0);
    setMuted(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const handleAnswer = () => {
    setCallState("active");
    timerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
  };

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const currentStatus = STATUS_OPTIONS.find((s) => s.value === status)!;

  const callerTypeColor = (t: string) => {
    switch (t) {
      case "carrier": return "bg-blue-100 text-blue-700";
      case "law_office": return "bg-purple-100 text-purple-700";
      case "claimant": return "bg-orange-100 text-orange-700";
      default: return "bg-gray-100 text-gray-500";
    }
  };

  return (
    <WhipLayout>
      <div className="p-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#171b31]">Softphone</h1>
          <p className="text-sm text-gray-500 mt-1">Make and receive calls directly from the dashboard</p>
        </div>

        {/* SDK Notice Banner */}
        <div className="mb-6 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <Info className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-amber-800">
            <span className="font-semibold">Preview mockup</span> — This shows how the embedded softphone will look once the Aircall Phone SDK is enabled on your plan.
            Until then, use{" "}
            <a href="https://dashboard.aircall.io" target="_blank" rel="noopener noreferrer" className="underline font-medium inline-flex items-center gap-0.5">
              Aircall's web app <ExternalLink className="w-3 h-3" />
            </a>{" "}
            to make and receive calls.
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── Left: Phone widget ─────────────────────────────────────────── */}
          <div className="lg:col-span-1">
            <Card className="border border-gray-200 shadow-sm overflow-hidden">
              {/* Phone header */}
              <div className="bg-[#171b31] px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-white" />
                  <span className="text-sm font-semibold text-white">Aircall Phone</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${currentStatus.color}`} />
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="text-xs text-white bg-transparent border-none outline-none cursor-pointer"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value} className="text-black bg-white">
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <CardContent className="p-4 space-y-4">
                {/* Incoming call overlay */}
                {callState === "incoming" && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center space-y-2">
                    <div className="flex items-center justify-center gap-2 animate-pulse">
                      <PhoneIncoming className="w-5 h-5 text-green-600" />
                      <span className="text-sm font-semibold text-green-800">Incoming Call</span>
                    </div>
                    <p className="text-sm font-medium text-gray-800">{incomingCaller.name}</p>
                    <p className="text-xs text-gray-500">{incomingCaller.number}</p>
                    <div className="flex gap-2 justify-center pt-1">
                      <button
                        className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-colors"
                        onClick={handleAnswer}
                      >
                        <Phone className="w-3 h-3" /> Answer
                      </button>
                      <button
                        className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-red-300 text-red-600 hover:bg-red-50 text-xs font-medium transition-colors"
                        onClick={handleHangUp}
                      >
                        <PhoneOff className="w-3 h-3" /> Decline
                      </button>
                    </div>
                  </div>
                )}

                {/* Active call */}
                {callState === "active" && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center space-y-1">
                    <div className="flex items-center justify-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">Live Call</span>
                    </div>
                    <p className="text-sm font-medium text-gray-800">{dialValue || incomingCaller.number}</p>
                    <p className="text-2xl font-mono font-bold text-green-700">{formatDuration(callDuration)}</p>
                  </div>
                )}

                {/* Ringing */}
                {callState === "ringing" && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center space-y-1">
                    <div className="flex items-center justify-center gap-1.5 animate-pulse">
                      <PhoneOutgoing className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Calling…</span>
                    </div>
                    <p className="text-sm font-medium text-gray-800">{dialValue}</p>
                  </div>
                )}

                {/* Dial display */}
                {callState === "idle" && (
                  <div className="bg-gray-50 rounded-lg px-3 py-2 flex items-center justify-between min-h-[44px]">
                    <span className="text-xl font-mono tracking-widest text-gray-800">
                      {dialValue || <span className="text-gray-400 text-sm font-sans">Enter number…</span>}
                    </span>
                    {dialValue && (
                      <button onClick={handleDelete} className="text-gray-400 hover:text-gray-600 ml-2">
                        <Delete className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}

                {/* Dial pad */}
                {(callState === "idle" || callState === "active") && (
                  <div className="grid grid-cols-3 gap-2">
                    {DIAL_KEYS.flat().map((key) => (
                      <button
                        key={key}
                        onClick={() => handleDial(key)}
                        className="h-11 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold text-base transition-colors active:scale-95"
                      >
                        {key}
                      </button>
                    ))}
                  </div>
                )}

                {/* Call controls */}
                <div className="flex items-center justify-center gap-3 pt-1">
                  {callState === "active" ? (
                    <>
                      <button
                        onClick={() => setMuted(!muted)}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${muted ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                        title={muted ? "Unmute" : "Mute"}
                      >
                        {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={handleHangUp}
                        className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-md transition-colors"
                        title="Hang up"
                      >
                        <PhoneOff className="w-6 h-6" />
                      </button>
                      <button
                        onClick={() => setSpeakerOff(!speakerOff)}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${speakerOff ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                        title={speakerOff ? "Unmute speaker" : "Mute speaker"}
                      >
                        {speakerOff ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                      </button>
                    </>
                  ) : callState === "ringing" ? (
                    <button
                      onClick={handleHangUp}
                      className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-md"
                    >
                      <PhoneOff className="w-6 h-6" />
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => setCallState("incoming")}
                        className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center"
                        title="Simulate incoming call (demo only)"
                      >
                        <PhoneIncoming className="w-4 h-4" />
                      </button>
                      <button
                        onClick={handleCall}
                        disabled={!dialValue}
                        className="w-14 h-14 rounded-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white flex items-center justify-center shadow-md transition-colors"
                        title="Call"
                      >
                        <Phone className="w-6 h-6" />
                      </button>
                      <div className="w-10 h-10" />
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Right: Recent calls + stats ────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-4">
            {/* Today's stats */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Calls Today", value: "12", sub: "6 answered · 3 missed · 3 voicemail", icon: Phone },
                { label: "Avg Handle Time", value: "4m 22s", sub: "Target: under 6 min", icon: Clock },
                { label: "Answer Rate", value: "83%", sub: "Team avg: 78%", icon: User },
              ].map(({ label, value, sub, icon: Icon }) => (
                <Card key={label} className="border border-gray-200 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="w-4 h-4 text-[#ff6221]" />
                      <span className="text-xs text-gray-500 font-medium">{label}</span>
                    </div>
                    <div className="text-2xl font-bold text-[#171b31]">{value}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{sub}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Recent calls */}
            <Card className="border border-gray-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-[#171b31]">Recent Calls</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[340px]">
                  <div className="divide-y divide-gray-100">
                    {RECENT_CALLS.map((call) => (
                      <div key={call.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          call.status === "missed" ? "bg-red-100" :
                          call.status === "voicemail" ? "bg-gray-100" :
                          call.type === "inbound" ? "bg-green-100" : "bg-blue-100"
                        }`}>
                          {call.status === "missed" ? (
                            <PhoneMissed className="w-3.5 h-3.5 text-red-500" />
                          ) : call.type === "inbound" ? (
                            <PhoneIncoming className="w-3.5 h-3.5 text-green-600" />
                          ) : (
                            <PhoneOutgoing className="w-3.5 h-3.5 text-blue-600" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900 truncate">{call.name}</span>
                            <Badge className={`text-[10px] px-1.5 py-0 border-0 ${callerTypeColor(call.callerType)}`}>
                              {call.callerType.replace("_", " ")}
                            </Badge>
                          </div>
                          <div className="text-xs text-gray-400">{call.number}</div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-xs text-gray-500">{call.time}</div>
                          <div className="text-xs text-gray-400">{call.duration}</div>
                        </div>
                        <button
                          onClick={() => {
                            setDialValue(call.number.replace(/\D/g, "").slice(-10));
                            setCallState("idle");
                          }}
                          className="ml-1 w-7 h-7 rounded-full bg-gray-100 hover:bg-green-100 hover:text-green-700 text-gray-400 flex items-center justify-center transition-colors"
                          title="Call back"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </WhipLayout>
  );
}
