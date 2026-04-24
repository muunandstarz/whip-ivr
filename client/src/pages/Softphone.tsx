import { useState, useRef } from "react";
import WhipLayout from "@/components/WhipLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Phone, PhoneOff, PhoneIncoming, PhoneOutgoing, PhoneMissed,
  Mic, MicOff, Volume2, VolumeX, Delete, Clock, User,
  ChevronRight, ExternalLink, Info, CheckCircle2, ClipboardList,
  Lightbulb, ArrowRightLeft, Pause,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const RECENT_CALLS = [
  { id: 1, name: "State Farm – Claims", number: "+1 (800) 732-5246", type: "inbound", status: "answered", duration: "4:22", time: "2:14 PM", callerType: "carrier", disposition: "claim_update" },
  { id: 2, name: "Unknown", number: "+1 (213) 555-0182", type: "inbound", status: "missed", duration: "—", time: "1:47 PM", callerType: "unknown", disposition: null },
  { id: 3, name: "Allstate Insurance", number: "+1 (800) 255-7828", type: "inbound", status: "answered", duration: "6:08", time: "12:30 PM", callerType: "carrier", disposition: "coverage_question" },
  { id: 4, name: "Marcus Johnson", number: "+1 (310) 555-0294", type: "outbound", status: "answered", duration: "3:15", time: "11:55 AM", callerType: "claimant", disposition: "callback_completed" },
  { id: 5, name: "Law Office of Rivera", number: "+1 (323) 555-0471", type: "inbound", status: "voicemail", duration: "0:45", time: "10:20 AM", callerType: "law_office", disposition: null },
  { id: 6, name: "Geico Claims", number: "+1 (800) 841-3000", type: "inbound", status: "answered", duration: "2:50", time: "9:44 AM", callerType: "carrier", disposition: "claim_update" },
];

const STATUS_OPTIONS = [
  { value: "available", label: "Available", color: "bg-green-500" },
  { value: "busy", label: "On a Call", color: "bg-yellow-500" },
  { value: "away", label: "Away", color: "bg-gray-400" },
  { value: "offline", label: "Offline", color: "bg-red-500" },
];

const DIAL_KEYS = [["1","2","3"],["4","5","6"],["7","8","9"],["*","0","#"]];

const DISPOSITIONS = [
  { value: "claim_update", label: "Claim Update", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "coverage_question", label: "Coverage Question", color: "bg-purple-100 text-purple-700 border-purple-200" },
  { value: "new_claim", label: "New Claim / FNOL", color: "bg-orange-100 text-orange-700 border-orange-200" },
  { value: "callback_completed", label: "Callback Completed", color: "bg-green-100 text-green-700 border-green-200" },
  { value: "transfer_to_handler", label: "Transferred to Handler", color: "bg-teal-100 text-teal-700 border-teal-200" },
  { value: "left_voicemail", label: "Left Voicemail", color: "bg-gray-100 text-gray-700 border-gray-200" },
  { value: "wrong_number", label: "Wrong Number / Misrouted", color: "bg-red-100 text-red-700 border-red-200" },
  { value: "no_answer", label: "No Answer", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  { value: "ivr_eligible", label: "IVR Eligible — Routed to Option 1", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "follow_up_needed", label: "Follow-Up Needed", color: "bg-amber-100 text-amber-700 border-amber-200" },
];

const COACHING_TIPS = [
  { icon: Pause, tip: "Check back every 30 seconds when a caller is on hold. Say: \"Thank you for holding, I'm still looking into this for you.\"" },
  { icon: ArrowRightLeft, tip: "Before transferring, stay on the line to introduce the caller. Don't blind-transfer — confirm the receiving handler is available first." },
  { icon: ClipboardList, tip: "Log the claim number and caller type before ending the call. This helps the team track repeat callers and IVR eligibility." },
  { icon: Lightbulb, tip: "Carriers, law offices, and medical providers can submit intake via IVR Option 1 without a live agent. Let them know if they call back." },
];

type CallState = "idle" | "ringing" | "active" | "incoming" | "wrap_up";

export default function Softphone() {
  const [dialValue, setDialValue] = useState("");
  const [callState, setCallState] = useState<CallState>("idle");
  const [muted, setMuted] = useState(false);
  const [speakerOff, setSpeakerOff] = useState(false);
  const [status, setStatus] = useState("available");
  const [callDuration, setCallDuration] = useState(0);
  const [selectedDisposition, setSelectedDisposition] = useState<string | null>(null);
  const [dispositionNote, setDispositionNote] = useState("");
  const [savedDispositions, setSavedDispositions] = useState<Array<{ callId: number; disposition: string; note: string }>>([]);
  const [wrapUpCallInfo, setWrapUpCallInfo] = useState<{ name: string; number: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [incomingCaller] = useState({ name: "State Farm – Claims", number: "+1 (800) 732-5246" });

  const handleDial = (key: string) => setDialValue((v) => (v.length < 14 ? v + key : v));
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
    if (timerRef.current) clearInterval(timerRef.current);
    setWrapUpCallInfo({ name: dialValue || incomingCaller.name, number: dialValue || incomingCaller.number });
    setCallState("wrap_up");
    setSelectedDisposition(null);
    setDispositionNote("");
  };

  const handleAnswer = () => {
    setCallState("active");
    timerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
  };

  const handleSaveDisposition = () => {
    if (!selectedDisposition) return;
    setSavedDispositions((prev) => [{ callId: Date.now(), disposition: selectedDisposition, note: dispositionNote }, ...prev]);
    setCallState("idle"); setCallDuration(0); setMuted(false); setDialValue(""); setWrapUpCallInfo(null);
  };

  const handleSkipDisposition = () => {
    setCallState("idle"); setCallDuration(0); setMuted(false); setDialValue(""); setWrapUpCallInfo(null);
  };

  const formatDuration = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  const currentStatus = STATUS_OPTIONS.find((s) => s.value === status)!;
  const callerTypeColor = (t: string) => {
    switch (t) {
      case "carrier": return "bg-blue-100 text-blue-700";
      case "law_office": return "bg-purple-100 text-purple-700";
      case "claimant": return "bg-orange-100 text-orange-700";
      default: return "bg-gray-100 text-gray-500";
    }
  };
  const dispositionLabel = (val: string | null) => val ? DISPOSITIONS.find((d) => d.value === val) : null;

  return (
    <WhipLayout>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#171b31]">Softphone</h1>
          <p className="text-sm text-gray-500 mt-1">Make and receive calls directly from the dashboard</p>
        </div>

        <div className="mb-6 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <Info className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-amber-800">
            <span className="font-semibold">Preview mockup</span> — This shows how the embedded softphone will look once the Aircall Phone SDK is enabled on your plan. Until then, use{" "}
            <a href="https://dashboard.aircall.io" target="_blank" rel="noopener noreferrer" className="underline font-medium inline-flex items-center gap-0.5">
              Aircall's web app <ExternalLink className="w-3 h-3" />
            </a>{" "}to make and receive calls.
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Phone widget + coaching */}
          <div className="lg:col-span-1 space-y-4">
            <Card className="border border-gray-200 shadow-sm overflow-hidden">
              <div className="bg-[#171b31] px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-white" />
                  <span className="text-sm font-semibold text-white">Aircall Phone</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${currentStatus.color}`} />
                  <select value={status} onChange={(e) => setStatus(e.target.value)}
                    className="text-xs text-white bg-transparent border-none outline-none cursor-pointer">
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value} className="text-black bg-white">{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <CardContent className="p-4 space-y-4">
                {callState === "incoming" && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center space-y-2">
                    <div className="flex items-center justify-center gap-2 animate-pulse">
                      <PhoneIncoming className="w-5 h-5 text-green-600" />
                      <span className="text-sm font-semibold text-green-800">Incoming Call</span>
                    </div>
                    <p className="text-sm font-medium text-gray-800">{incomingCaller.name}</p>
                    <p className="text-xs text-gray-500">{incomingCaller.number}</p>
                    <div className="flex gap-2 justify-center pt-1">
                      <button className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-colors" onClick={handleAnswer}>
                        <Phone className="w-3 h-3" /> Answer
                      </button>
                      <button className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-red-300 text-red-600 hover:bg-red-50 text-xs font-medium transition-colors" onClick={handleSkipDisposition}>
                        <PhoneOff className="w-3 h-3" /> Decline
                      </button>
                    </div>
                  </div>
                )}

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

                {callState === "ringing" && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center space-y-1">
                    <div className="flex items-center justify-center gap-1.5 animate-pulse">
                      <PhoneOutgoing className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Calling…</span>
                    </div>
                    <p className="text-sm font-medium text-gray-800">{dialValue}</p>
                  </div>
                )}

                {callState === "wrap_up" && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <ClipboardList className="w-4 h-4 text-amber-700" />
                      <span className="text-sm font-semibold text-amber-800">Call Wrap-Up</span>
                    </div>
                    {wrapUpCallInfo && (
                      <p className="text-xs text-gray-600">
                        <span className="font-medium">{wrapUpCallInfo.name}</span> · {formatDuration(callDuration)}
                      </p>
                    )}
                    <p className="text-xs text-amber-700 font-medium">Select a disposition:</p>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                      {DISPOSITIONS.map((d) => (
                        <button key={d.value} onClick={() => setSelectedDisposition(d.value)}
                          className={`w-full text-left text-xs px-2.5 py-2 rounded-md border transition-all ${
                            selectedDisposition === d.value ? d.color + " ring-1 ring-offset-1 ring-current" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                          }`}>
                          {d.label}
                        </button>
                      ))}
                    </div>
                    <textarea value={dispositionNote} onChange={(e) => setDispositionNote(e.target.value)}
                      placeholder="Optional note (claim #, action taken…)"
                      className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-[#171b31] bg-white"
                      rows={2} />
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1 text-xs bg-[#171b31] hover:bg-[#2a3050] text-white"
                        onClick={handleSaveDisposition} disabled={!selectedDisposition}>
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Save &amp; Close
                      </Button>
                      <Button size="sm" variant="ghost" className="text-xs text-gray-500" onClick={handleSkipDisposition}>
                        Skip
                      </Button>
                    </div>
                  </div>
                )}

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

                {(callState === "idle" || callState === "active") && (
                  <div className="grid grid-cols-3 gap-2">
                    {DIAL_KEYS.flat().map((key) => (
                      <button key={key} onClick={() => handleDial(key)}
                        className="h-11 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold text-base transition-colors active:scale-95">
                        {key}
                      </button>
                    ))}
                  </div>
                )}

                {callState !== "wrap_up" && (
                  <div className="flex items-center justify-center gap-3 pt-1">
                    {callState === "active" ? (
                      <>
                        <button onClick={() => setMuted(!muted)}
                          className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${muted ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                          {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                        </button>
                        <button onClick={handleHangUp}
                          className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-md transition-colors">
                          <PhoneOff className="w-6 h-6" />
                        </button>
                        <button onClick={() => setSpeakerOff(!speakerOff)}
                          className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${speakerOff ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                          {speakerOff ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                        </button>
                      </>
                    ) : callState === "ringing" ? (
                      <button onClick={handleHangUp}
                        className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-md">
                        <PhoneOff className="w-6 h-6" />
                      </button>
                    ) : callState === "idle" ? (
                      <>
                        <button onClick={() => setCallState("incoming")}
                          className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center"
                          title="Simulate incoming call (demo only)">
                          <PhoneIncoming className="w-4 h-4" />
                        </button>
                        <button onClick={handleCall} disabled={!dialValue}
                          className="w-14 h-14 rounded-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white flex items-center justify-center shadow-md transition-colors">
                          <Phone className="w-6 h-6" />
                        </button>
                        <div className="w-10 h-10" />
                      </>
                    ) : null}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border border-blue-100 bg-blue-50/40">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm font-semibold text-[#171b31] flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-[#ff6221]" />
                  Call Coaching Tips
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pb-4">
                {COACHING_TIPS.map(({ icon: Icon, tip }, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-[#171b31]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Icon className="w-3 h-3 text-[#171b31]" />
                    </div>
                    <p className="text-xs text-gray-700 leading-relaxed">{tip}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Right: Stats + recent calls */}
          <div className="lg:col-span-2 space-y-4">
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

            {savedDispositions.length > 0 && (
              <Card className="border border-emerald-200 bg-emerald-50/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-[#171b31] flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Logged This Session
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 pb-4">
                  {savedDispositions.map((d) => {
                    const disp = dispositionLabel(d.disposition);
                    return (
                      <div key={d.callId} className="flex items-center gap-2 text-xs">
                        {disp && <span className={`px-2 py-0.5 rounded border text-xs font-medium ${disp.color}`}>{disp.label}</span>}
                        {d.note && <span className="text-gray-500 truncate">{d.note}</span>}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            <Card className="border border-gray-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-[#171b31]">Recent Calls</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[380px]">
                  <div className="divide-y divide-gray-100">
                    {RECENT_CALLS.map((call) => {
                      const disp = dispositionLabel(call.disposition);
                      return (
                        <div key={call.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                            call.status === "missed" ? "bg-red-100" : call.status === "voicemail" ? "bg-gray-100" : call.type === "inbound" ? "bg-green-100" : "bg-blue-100"
                          }`}>
                            {call.status === "missed" ? <PhoneMissed className="w-3.5 h-3.5 text-red-500" /> :
                             call.type === "inbound" ? <PhoneIncoming className="w-3.5 h-3.5 text-green-600" /> :
                             <PhoneOutgoing className="w-3.5 h-3.5 text-blue-600" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-gray-900 truncate">{call.name}</span>
                              <Badge className={`text-[10px] px-1.5 py-0 border-0 ${callerTypeColor(call.callerType)}`}>
                                {call.callerType.replace("_", " ")}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-gray-400">{call.number}</span>
                              {disp && <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${disp.color}`}>{disp.label}</span>}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="text-xs text-gray-500">{call.time}</div>
                            <div className="text-xs text-gray-400">{call.duration}</div>
                          </div>
                          <button onClick={() => { setDialValue(call.number.replace(/\D/g, "").slice(-10)); setCallState("idle"); }}
                            className="ml-1 w-7 h-7 rounded-full bg-gray-100 hover:bg-green-100 hover:text-green-700 text-gray-400 flex items-center justify-center transition-colors"
                            title="Call back">
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
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
