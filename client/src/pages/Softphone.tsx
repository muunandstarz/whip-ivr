import { useState, useRef } from "react";
import WhipLayout from "@/components/WhipLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Phone, PhoneOff, PhoneIncoming, PhoneOutgoing, PhoneMissed,
  Mic, MicOff, Volume2, VolumeX, Delete, Clock, User,
  ChevronRight, ExternalLink, Info, CheckCircle2, ClipboardList,
  Lightbulb, ArrowRightLeft, Pause, MessageSquare, Send, Building2,
  Scale, Stethoscope, AlertTriangle, FileText, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Dummy data ──────────────────────────────────────────────────────────────

const RECENT_CALLS = [
  { id: 1, name: "State Farm – Claims", number: "+1 (800) 732-5246", type: "inbound", status: "answered", duration: "4:22", time: "2:14 PM", callerType: "carrier", disposition: "claim_update" },
  { id: 2, name: "Unknown", number: "+1 (213) 555-0182", type: "inbound", status: "missed", duration: "—", time: "1:47 PM", callerType: "unknown", disposition: null },
  { id: 3, name: "Allstate Insurance", number: "+1 (800) 255-7828", type: "inbound", status: "answered", duration: "6:08", time: "12:30 PM", callerType: "carrier", disposition: "coverage_question" },
  { id: 4, name: "Marcus Johnson", number: "+1 (310) 555-0294", type: "outbound", status: "answered", duration: "3:15", time: "11:55 AM", callerType: "claimant", disposition: "callback_completed" },
  { id: 5, name: "Law Office of Rivera", number: "+1 (323) 555-0471", type: "inbound", status: "voicemail", duration: "0:45", time: "10:20 AM", callerType: "law_office", disposition: null },
  { id: 6, name: "Geico Claims", number: "+1 (800) 841-3000", type: "inbound", status: "answered", duration: "2:50", time: "9:44 AM", callerType: "carrier", disposition: "claim_update" },
  { id: 7, name: "Dr. Patel – Sunrise Medical", number: "+1 (818) 555-0312", type: "inbound", status: "answered", duration: "5:10", time: "9:01 AM", callerType: "medical_provider", disposition: "pip_billing_inquiry" },
  { id: 8, name: "Sandra Williams", number: "+1 (714) 555-0088", type: "outbound", status: "no_answer", duration: "—", time: "8:45 AM", callerType: "member", disposition: "no_answer" },
];

const SMS_THREADS = [
  { id: 1, name: "Marcus Johnson", number: "+1 (310) 555-0294", lastMsg: "Got it, I'll call back after 3pm", time: "1:30 PM", unread: false },
  { id: 2, name: "Sandra Williams", number: "+1 (714) 555-0088", lastMsg: "Can someone call me about my claim?", time: "11:20 AM", unread: true },
  { id: 3, name: "Unknown", number: "+1 (562) 555-0177", lastMsg: "This is GEICO claims re: NF374972", time: "9:15 AM", unread: false },
];

const SMS_MESSAGES = [
  { id: 1, from: "them", text: "Hi, I left a voicemail about my claim NF374972. Can someone call me?", time: "11:18 AM" },
  { id: 2, from: "us", text: "Hi Sandra! This is Whip Claims. We received your voicemail and a handler will call you within 2 business hours.", time: "11:20 AM" },
  { id: 3, from: "them", text: "Thank you! My number is (714) 555-0088", time: "11:21 AM" },
];

const STATUS_OPTIONS = [
  { value: "available", label: "Available", color: "bg-green-500" },
  { value: "busy", label: "On a Call", color: "bg-yellow-500" },
  { value: "away", label: "Away", color: "bg-gray-400" },
  { value: "offline", label: "Offline", color: "bg-red-500" },
];

const DIAL_KEYS = [["1","2","3"],["4","5","6"],["7","8","9"],["*","0","#"]];

// ─── 20+ Disposition codes ────────────────────────────────────────────────────

const DISPOSITION_GROUPS = [
  {
    group: "Claim Actions",
    items: [
      { value: "claim_update", label: "Claim Status Update", color: "bg-blue-100 text-blue-700 border-blue-200" },
      { value: "new_claim_fnol", label: "New Claim / FNOL", color: "bg-orange-100 text-orange-700 border-orange-200" },
      { value: "coverage_question", label: "Coverage Question", color: "bg-purple-100 text-purple-700 border-purple-200" },
      { value: "pip_billing_inquiry", label: "PIP / Billing Inquiry", color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
      { value: "demand_letter", label: "Demand Letter / Legal", color: "bg-rose-100 text-rose-700 border-rose-200" },
      { value: "subrogation", label: "Subrogation / Recovery", color: "bg-cyan-100 text-cyan-700 border-cyan-200" },
    ],
  },
  {
    group: "Call Outcomes",
    items: [
      { value: "callback_completed", label: "Callback Completed", color: "bg-green-100 text-green-700 border-green-200" },
      { value: "left_voicemail", label: "Left Voicemail", color: "bg-gray-100 text-gray-700 border-gray-200" },
      { value: "no_answer", label: "No Answer", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
      { value: "follow_up_scheduled", label: "Follow-Up Scheduled", color: "bg-amber-100 text-amber-700 border-amber-200" },
      { value: "resolved_closed", label: "Resolved — Case Closed", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    ],
  },
  {
    group: "Transfers & Routing",
    items: [
      { value: "transfer_to_handler", label: "Transferred to Handler", color: "bg-teal-100 text-teal-700 border-teal-200" },
      { value: "transfer_to_supervisor", label: "Escalated to Supervisor", color: "bg-red-100 text-red-700 border-red-200" },
      { value: "transfer_to_adjuster", label: "Transferred to Adjuster", color: "bg-violet-100 text-violet-700 border-violet-200" },
      { value: "ivr_eligible", label: "IVR Eligible — Advised Press 1", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    ],
  },
  {
    group: "Other",
    items: [
      { value: "wrong_number", label: "Wrong Number / Misrouted", color: "bg-red-100 text-red-700 border-red-200" },
      { value: "duplicate_call", label: "Duplicate / Repeat Call", color: "bg-gray-100 text-gray-500 border-gray-200" },
      { value: "language_barrier", label: "Language Barrier", color: "bg-orange-100 text-orange-600 border-orange-200" },
      { value: "spam_robocall", label: "Spam / Robocall", color: "bg-gray-100 text-gray-400 border-gray-200" },
      { value: "test_call", label: "Test Call (Internal)", color: "bg-slate-100 text-slate-500 border-slate-200" },
    ],
  },
];

const ALL_DISPOSITIONS = DISPOSITION_GROUPS.flatMap((g) => g.items);

// ─── Call scripts per caller type ─────────────────────────────────────────────

const CALL_SCRIPTS: Record<string, { title: string; icon: React.ElementType; color: string; greeting: string; steps: string[]; closing: string }> = {
  carrier: {
    title: "Carrier Script",
    icon: Building2,
    color: "bg-blue-50 border-blue-200",
    greeting: "\"Thank you for calling Whip Claims, this is [your name]. May I have your name and the insurance company you're calling from?\"",
    steps: [
      "Ask for claim number and insured's name",
      "Confirm coverage type (PIP, liability, collision)",
      "Note the adjuster's name and direct callback number",
      "Log any payment amounts or settlement offers discussed",
      "Confirm next steps and expected timeline",
    ],
    closing: "\"I'll make sure this is noted on the claim. Is there anything else I can help you with today? Thank you for calling Whip Claims.\"",
  },
  law_office: {
    title: "Law Office Script",
    icon: Scale,
    color: "bg-purple-50 border-purple-200",
    greeting: "\"Thank you for calling Whip Claims, this is [your name]. May I have your name, the firm you're calling from, and the claim number you're referencing?\"",
    steps: [
      "Confirm attorney name, firm name, and bar number if needed",
      "Ask for the client's full name and claim/policy number",
      "Note the nature of the inquiry (demand, lien, representation letter)",
      "Do NOT discuss liability or settlement without supervisor approval",
      "Offer to have the adjuster return the call within 24 hours",
    ],
    closing: "\"I'll escalate this to our claims adjuster and they'll be in touch within one business day. Thank you for your patience.\"",
  },
  medical_provider: {
    title: "Medical Provider Script",
    icon: Stethoscope,
    color: "bg-green-50 border-green-200",
    greeting: "\"Thank you for calling Whip Claims, this is [your name]. Are you calling regarding a PIP billing inquiry or treatment authorization?\"",
    steps: [
      "Get provider name, NPI number, and billing contact",
      "Confirm patient name and date of service",
      "Note the CPT codes or services in question",
      "Verify claim number and PIP policy limits",
      "Advise on PIP submission process if first contact",
    ],
    closing: "\"I've noted your inquiry. Our PIP team will follow up within 2 business days. You can also fax billing to the number on file.\"",
  },
  member: {
    title: "Member / Insured Script",
    icon: User,
    color: "bg-orange-50 border-orange-200",
    greeting: "\"Thank you for calling Whip Claims, this is [your name]. May I have your name and policy number so I can pull up your account?\"",
    steps: [
      "Verify identity: full name, DOB, last 4 of SSN or policy number",
      "Ask what the call is regarding (new claim, status update, question)",
      "For new claims: get date of loss, location, description of incident",
      "For status updates: check claim notes and provide current status",
      "Set clear expectations on next steps and timeline",
    ],
    closing: "\"Is there anything else I can help you with today? We'll be in touch within [timeframe]. Thank you for being a Whip Claims member.\"",
  },
  claimant: {
    title: "Claimant Script",
    icon: User,
    color: "bg-yellow-50 border-yellow-200",
    greeting: "\"Thank you for calling Whip Claims, this is [your name]. Are you calling regarding an existing claim or a new incident?\"",
    steps: [
      "Get claimant's full name and callback number",
      "Ask for the claim number or insured's name if they have it",
      "Note the nature of their inquiry (injury, property damage, payment)",
      "Do NOT admit liability or make any payment commitments",
      "Offer to have the assigned handler call back within 2 hours",
    ],
    closing: "\"I've noted your information and a handler will call you back at [number] within 2 business hours. Thank you for your patience.\"",
  },
  unknown: {
    title: "General Script",
    icon: Phone,
    color: "bg-gray-50 border-gray-200",
    greeting: "\"Thank you for calling Whip Claims, this is [your name]. How can I help you today?\"",
    steps: [
      "Listen to understand the nature of the call",
      "Identify caller type: carrier, law office, medical provider, member, or claimant",
      "Route to the appropriate script once caller type is known",
      "Get callback number and name before ending if unresolved",
    ],
    closing: "\"Thank you for calling Whip Claims. Is there anything else I can help you with?\"",
  },
};

const COACHING_TIPS = [
  { icon: Pause, tip: "Check back every 30 seconds on hold: \"Thank you for holding, I'm still looking into this for you.\"" },
  { icon: ArrowRightLeft, tip: "Warm transfer only — stay on the line to introduce the caller. Confirm the receiving handler is available first." },
  { icon: ClipboardList, tip: "Log claim number and caller type before ending. This helps track repeat callers and IVR eligibility." },
  { icon: Lightbulb, tip: "Carriers, law offices, and medical providers can submit via IVR Option 1 — no live agent needed. Let them know." },
];

type CallState = "idle" | "ringing" | "active" | "incoming" | "wrap_up";

// ─── Component ────────────────────────────────────────────────────────────────

export default function Softphone() {
  const [activeTab, setActiveTab] = useState<"phone" | "sms">("phone");
  const [dialValue, setDialValue] = useState("");
  const [callState, setCallState] = useState<CallState>("idle");
  const [muted, setMuted] = useState(false);
  const [speakerOff, setSpeakerOff] = useState(false);
  const [status, setStatus] = useState("available");
  const [callDuration, setCallDuration] = useState(0);
  const [selectedDisposition, setSelectedDisposition] = useState<string | null>(null);
  const [dispositionNote, setDispositionNote] = useState("");
  const [savedDispositions, setSavedDispositions] = useState<Array<{ callId: number; disposition: string; note: string; name: string }>>([]);
  const [wrapUpCallInfo, setWrapUpCallInfo] = useState<{ name: string; number: string; direction: "inbound" | "outbound" } | null>(null);
  const [activeCallInfo, setActiveCallInfo] = useState<{ name: string; number: string; callerType: string; direction: "inbound" | "outbound" } | null>(null);
  const [scriptCallerType, setScriptCallerType] = useState<string>("unknown");
  const [smsThread, setSmsThread] = useState<number | null>(1);
  const [smsInput, setSmsInput] = useState("");
  const [smsMessages, setSmsMessages] = useState(SMS_MESSAGES);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [incomingCaller] = useState({ name: "State Farm – Claims", number: "+1 (800) 732-5246", callerType: "carrier" });

  const handleDial = (key: string) => setDialValue((v) => (v.length < 14 ? v + key : v));
  const handleDelete = () => setDialValue((v) => v.slice(0, -1));

  const handleCall = () => {
    if (!dialValue) return;
    const displayNumber = dialValue.length === 10
      ? `+1 (${dialValue.slice(0,3)}) ${dialValue.slice(3,6)}-${dialValue.slice(6)}`
      : dialValue;
    setActiveCallInfo({ name: displayNumber, number: displayNumber, callerType: "unknown", direction: "outbound" });
    setCallState("ringing");
    setTimeout(() => {
      setCallState("active");
      timerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
    }, 2500);
  };

  const handleHangUp = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setWrapUpCallInfo({
      name: activeCallInfo?.name || incomingCaller.name,
      number: activeCallInfo?.number || incomingCaller.number,
      direction: activeCallInfo?.direction || "inbound",
    });
    setCallState("wrap_up");
    setSelectedDisposition(null);
    setDispositionNote("");
  };

  const handleAnswer = () => {
    setActiveCallInfo({ name: incomingCaller.name, number: incomingCaller.number, callerType: incomingCaller.callerType, direction: "inbound" });
    setScriptCallerType(incomingCaller.callerType);
    setCallState("active");
    timerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
  };

  const handleSaveDisposition = () => {
    if (!selectedDisposition) return;
    const disp = ALL_DISPOSITIONS.find((d) => d.value === selectedDisposition);
    setSavedDispositions((prev) => [{
      callId: Date.now(),
      disposition: selectedDisposition,
      note: dispositionNote,
      name: wrapUpCallInfo?.name || "Unknown",
    }, ...prev]);
    setCallState("idle");
    setCallDuration(0);
    setMuted(false);
    setDialValue("");
    setWrapUpCallInfo(null);
    setActiveCallInfo(null);
  };

  const handleSkipDisposition = () => {
    setCallState("idle");
    setCallDuration(0);
    setMuted(false);
    setDialValue("");
    setWrapUpCallInfo(null);
    setActiveCallInfo(null);
  };

  const handleSendSms = () => {
    if (!smsInput.trim()) return;
    setSmsMessages((prev) => [...prev, { id: Date.now(), from: "us", text: smsInput.trim(), time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }]);
    setSmsInput("");
  };

  const formatDuration = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  const currentStatus = STATUS_OPTIONS.find((s) => s.value === status)!;
  const callerTypeColor = (t: string) => {
    switch (t) {
      case "carrier": return "bg-blue-100 text-blue-700";
      case "law_office": return "bg-purple-100 text-purple-700";
      case "medical_provider": return "bg-green-100 text-green-700";
      case "claimant": return "bg-orange-100 text-orange-700";
      case "member": return "bg-yellow-100 text-yellow-700";
      default: return "bg-gray-100 text-gray-500";
    }
  };
  const dispositionLabel = (val: string | null) => val ? ALL_DISPOSITIONS.find((d) => d.value === val) : null;
  const activeScript = CALL_SCRIPTS[scriptCallerType] ?? CALL_SCRIPTS.unknown;

  return (
    <WhipLayout>
      <div className="p-6 max-w-7xl mx-auto">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-[#171b31]">Softphone</h1>
          <p className="text-sm text-gray-500 mt-1">Make calls, send texts, and log dispositions from one place</p>
        </div>

        {/* Under Construction Banner */}
        <div className="mb-5 flex items-center gap-4 rounded-xl border-2 border-amber-400 bg-amber-50 px-5 py-4">
          <span className="text-3xl flex-shrink-0">🚧</span>
          <div className="flex-1">
            <p className="font-bold text-amber-900 text-base">Softphone — Under Construction</p>
            <p className="text-sm text-amber-800 mt-0.5">
              The in-app softphone is not yet connected to Aircall. All calls, texts, and data shown below are <strong>simulated previews</strong> of the planned interface.
              In the meantime, use the{" "}
              <a href="https://dashboard.aircall.io" target="_blank" rel="noopener noreferrer" className="underline font-semibold inline-flex items-center gap-0.5">
                Aircall desktop or mobile app <ExternalLink className="w-3 h-3" />
              </a>{" "}
              to make and receive calls.
            </p>
          </div>
          <Badge className="flex-shrink-0 bg-amber-200 text-amber-900 border-amber-400 border text-xs font-semibold px-3 py-1">
            Coming Soon
          </Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── Left column: Phone + SMS tabs ── */}
          <div className="lg:col-span-1 space-y-4">
            <Card className="border border-gray-200 shadow-sm overflow-hidden">
              <div className="bg-[#171b31] px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setActiveTab("phone")}
                    className={`flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded transition-colors ${activeTab === "phone" ? "bg-white/20 text-white" : "text-white/60 hover:text-white"}`}>
                    <Phone className="w-3.5 h-3.5" /> Phone
                  </button>
                  <button
                    onClick={() => setActiveTab("sms")}
                    className={`flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded transition-colors ${activeTab === "sms" ? "bg-white/20 text-white" : "text-white/60 hover:text-white"}`}>
                    <MessageSquare className="w-3.5 h-3.5" /> SMS
                    {SMS_THREADS.some((t) => t.unread) && <span className="w-1.5 h-1.5 rounded-full bg-[#ff6221]" />}
                  </button>
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

              {/* ── Phone tab ── */}
              {activeTab === "phone" && (
                <CardContent className="p-4 space-y-4">
                  {/* Incoming */}
                  {callState === "incoming" && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center space-y-2">
                      <div className="flex items-center justify-center gap-2 animate-pulse">
                        <PhoneIncoming className="w-5 h-5 text-green-600" />
                        <span className="text-sm font-semibold text-green-800">Incoming Call</span>
                      </div>
                      <p className="text-sm font-medium text-gray-800">{incomingCaller.name}</p>
                      <p className="text-xs text-gray-500">{incomingCaller.number}</p>
                      <Badge className={`text-xs ${callerTypeColor(incomingCaller.callerType)}`}>
                        {incomingCaller.callerType.replace("_", " ")}
                      </Badge>
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

                  {/* Active call */}
                  {callState === "active" && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center space-y-1">
                      <div className="flex items-center justify-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">
                          {activeCallInfo?.direction === "outbound" ? "Outbound Call" : "Live Call"}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-gray-800">{activeCallInfo?.name || incomingCaller.name}</p>
                      <p className="text-xs text-gray-500">{activeCallInfo?.number || incomingCaller.number}</p>
                      {activeCallInfo?.callerType && activeCallInfo.callerType !== "unknown" && (
                        <Badge className={`text-xs ${callerTypeColor(activeCallInfo.callerType)}`}>
                          {activeCallInfo.callerType.replace("_", " ")}
                        </Badge>
                      )}
                      <p className="text-2xl font-mono font-bold text-green-700 pt-1">{formatDuration(callDuration)}</p>
                    </div>
                  )}

                  {/* Ringing / outbound */}
                  {callState === "ringing" && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center space-y-1">
                      <div className="flex items-center justify-center gap-1.5 animate-pulse">
                        <PhoneOutgoing className="w-4 h-4 text-blue-600" />
                        <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Calling…</span>
                      </div>
                      <p className="text-sm font-semibold text-gray-800">{activeCallInfo?.name || dialValue}</p>
                      <p className="text-xs text-gray-500">{activeCallInfo?.number || dialValue}</p>
                    </div>
                  )}

                  {/* Wrap-up */}
                  {callState === "wrap_up" && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-3">
                      <div className="flex items-center gap-2">
                        <ClipboardList className="w-4 h-4 text-amber-700" />
                        <span className="text-sm font-semibold text-amber-800">Call Wrap-Up</span>
                      </div>
                      {wrapUpCallInfo && (
                        <div className="text-xs text-gray-600 space-y-0.5">
                          <p><span className="font-medium">{wrapUpCallInfo.name}</span> · {wrapUpCallInfo.number}</p>
                          <p className="text-gray-400">{wrapUpCallInfo.direction === "outbound" ? "Outbound" : "Inbound"} · {formatDuration(callDuration)}</p>
                        </div>
                      )}
                      <p className="text-xs text-amber-700 font-medium">Select a disposition:</p>
                      <ScrollArea className="h-52">
                        <div className="space-y-3 pr-1">
                          {DISPOSITION_GROUPS.map((group) => (
                            <div key={group.group}>
                              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{group.group}</p>
                              <div className="space-y-1">
                                {group.items.map((d) => (
                                  <button key={d.value} onClick={() => setSelectedDisposition(d.value)}
                                    className={`w-full text-left text-xs px-2.5 py-1.5 rounded-md border transition-all ${
                                      selectedDisposition === d.value ? d.color + " ring-1 ring-offset-1 ring-current" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                                    }`}>
                                    {d.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
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

                  {/* Idle dial display */}
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
                        <button key={key} onClick={() => handleDial(key)}
                          className="h-11 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold text-base transition-colors active:scale-95">
                          {key}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Call controls */}
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
              )}

              {/* ── SMS tab ── */}
              {activeTab === "sms" && (
                <div className="flex flex-col h-[520px]">
                  {/* Thread list */}
                  <div className="border-b divide-y">
                    {SMS_THREADS.map((thread) => (
                      <button key={thread.id} onClick={() => setSmsThread(thread.id)}
                        className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${smsThread === thread.id ? "bg-blue-50" : ""}`}>
                        <div className="flex items-center justify-between">
                          <span className={`text-sm font-medium ${thread.unread ? "text-[#171b31]" : "text-gray-700"}`}>{thread.name}</span>
                          <span className="text-[10px] text-gray-400">{thread.time}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {thread.unread && <span className="w-1.5 h-1.5 rounded-full bg-[#ff6221] flex-shrink-0" />}
                          <span className="text-xs text-gray-500 truncate">{thread.lastMsg}</span>
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Message thread */}
                  <ScrollArea className="flex-1 px-4 py-3">
                    <div className="space-y-3">
                      {smsMessages.map((msg) => (
                        <div key={msg.id} className={`flex ${msg.from === "us" ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs ${
                            msg.from === "us" ? "bg-[#171b31] text-white rounded-br-sm" : "bg-gray-100 text-gray-800 rounded-bl-sm"
                          }`}>
                            <p>{msg.text}</p>
                            <p className={`text-[10px] mt-1 ${msg.from === "us" ? "text-white/60" : "text-gray-400"}`}>{msg.time}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>

                  {/* SMS input */}
                  <div className="border-t p-3 flex gap-2">
                    <input
                      value={smsInput}
                      onChange={(e) => setSmsInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSendSms()}
                      placeholder="Type a message…"
                      className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#171b31]"
                    />
                    <button onClick={handleSendSms} disabled={!smsInput.trim()}
                      className="w-9 h-9 rounded-lg bg-[#ff6221] hover:bg-[#e5541a] disabled:bg-gray-200 text-white flex items-center justify-center transition-colors">
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </Card>

            {/* Coaching tips */}
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

          {/* ── Right column: Stats + Scripts + Recent calls ── */}
          <div className="lg:col-span-2 space-y-4">
            {/* KPI row */}
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

            {/* Call Script panel */}
            <Card className={`border ${activeScript.color}`}>
              <CardHeader className="pb-2 pt-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-[#171b31] flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#ff6221]" />
                    Call Script
                  </CardTitle>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500">Caller type:</span>
                    <select
                      value={scriptCallerType}
                      onChange={(e) => setScriptCallerType(e.target.value)}
                      className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#171b31] bg-white">
                      <option value="unknown">General</option>
                      <option value="carrier">Carrier</option>
                      <option value="law_office">Law Office</option>
                      <option value="medical_provider">Medical Provider</option>
                      <option value="member">Member / Insured</option>
                      <option value="claimant">Claimant</option>
                    </select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pb-4 space-y-3">
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Greeting</p>
                  <p className="text-xs text-gray-700 italic leading-relaxed bg-white/70 rounded-md px-3 py-2 border border-white">
                    {activeScript.greeting}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Key Steps</p>
                  <ol className="space-y-1.5">
                    {activeScript.steps.map((step, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-gray-700">
                        <span className="w-4 h-4 rounded-full bg-[#171b31] text-white text-[10px] flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">{i + 1}</span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Closing</p>
                  <p className="text-xs text-gray-700 italic leading-relaxed bg-white/70 rounded-md px-3 py-2 border border-white">
                    {activeScript.closing}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Logged dispositions this session */}
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
                        <span className="text-gray-600 font-medium truncate max-w-[100px]">{d.name}</span>
                        {disp && <span className={`px-2 py-0.5 rounded border text-xs font-medium ${disp.color}`}>{disp.label}</span>}
                        {d.note && <span className="text-gray-400 truncate">{d.note}</span>}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* Recent calls */}
            <Card className="border border-gray-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-[#171b31]">Recent Calls</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[340px]">
                  <div className="divide-y divide-gray-100">
                    {RECENT_CALLS.map((call) => {
                      const disp = dispositionLabel(call.disposition);
                      return (
                        <div key={call.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                            call.status === "missed" || call.status === "no_answer" ? "bg-red-100" : call.status === "voicemail" ? "bg-gray-100" : call.type === "inbound" ? "bg-green-100" : "bg-blue-100"
                          }`}>
                            {call.status === "missed" || call.status === "no_answer" ? <PhoneMissed className="w-3.5 h-3.5 text-red-500" /> :
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
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className="text-xs text-gray-400">{call.number}</span>
                              {disp && <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${disp.color}`}>{disp.label}</span>}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="text-xs text-gray-500">{call.time}</div>
                            <div className="text-xs text-gray-400">{call.duration}</div>
                          </div>
                          <button
                            onClick={() => {
                              const digits = call.number.replace(/\D/g, "").slice(-10);
                              setDialValue(digits);
                              setActiveTab("phone");
                              setCallState("idle");
                            }}
                            className="ml-1 w-7 h-7 rounded-full bg-gray-100 hover:bg-green-100 hover:text-green-700 text-gray-400 flex items-center justify-center transition-colors"
                            title="Call back">
                            <Phone className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setActiveTab("sms");
                              setSmsThread(1);
                            }}
                            className="w-7 h-7 rounded-full bg-gray-100 hover:bg-blue-100 hover:text-blue-700 text-gray-400 flex items-center justify-center transition-colors"
                            title="Send SMS">
                            <MessageSquare className="w-3.5 h-3.5" />
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
