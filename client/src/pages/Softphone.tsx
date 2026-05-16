import { useState, useRef, useEffect, useCallback } from "react";
import { useSearch, useLocation } from "wouter";
import WhipLayout from "@/components/WhipLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Phone, PhoneOff, PhoneIncoming, PhoneOutgoing, PhoneMissed,
  Clock, User, ChevronRight, ExternalLink, Info, CheckCircle2,
  ClipboardList, Lightbulb, ArrowRightLeft, Pause, MessageSquare,
  Send, Building2, Scale, Stethoscope, AlertTriangle, FileText,
  PhoneCall, ArrowRight, Wifi, WifiOff,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
// @ts-ignore — no types shipped with aircall-everywhere
import AircallPhone from "aircall-everywhere";

// ─── Types ───────────────────────────────────────────────────────────────────

type CallState = "idle" | "ringing" | "active" | "incoming" | "wrap_up";

interface ActiveCallInfo {
  name: string;
  number: string;
  callerType: string;
  direction: "inbound" | "outbound";
  aircallCallId?: number;
}

// ─── Disposition codes ────────────────────────────────────────────────────────

const DISPOSITION_GROUPS = [
  {
    group: "Claim Actions",
    items: [
      { value: "claim_update", label: "Claim Status Update", color: "bg-blue-500/15 text-blue-700 border-blue-200" },
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
      { value: "callback_completed", label: "Callback Completed", color: "bg-green-500/15 text-green-700 border-green-200" },
      { value: "left_voicemail", label: "Left Voicemail", color: "bg-muted text-muted-foreground border-border" },
      { value: "no_answer", label: "No Answer", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
      { value: "follow_up_scheduled", label: "Follow-Up Scheduled", color: "bg-amber-100 text-amber-700 border-amber-200" },
      { value: "resolved_closed", label: "Resolved — Case Closed", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    ],
  },
  {
    group: "Transfers & Routing",
    items: [
      { value: "transfer_to_handler", label: "Transferred to Handler", color: "bg-teal-100 text-teal-700 border-teal-200" },
      { value: "transfer_to_supervisor", label: "Escalated to Supervisor", color: "bg-red-500/15 text-red-700 border-red-200" },
      { value: "transfer_to_adjuster", label: "Transferred to Adjuster", color: "bg-violet-100 text-violet-700 border-violet-200" },
      { value: "ivr_eligible", label: "IVR Eligible — Advised Press 1", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    ],
  },
  {
    group: "Other",
    items: [
      { value: "wrong_number", label: "Wrong Number / Misrouted", color: "bg-red-500/15 text-red-700 border-red-200" },
      { value: "duplicate_call", label: "Duplicate / Repeat Call", color: "bg-muted text-muted-foreground border-border" },
      { value: "language_barrier", label: "Language Barrier", color: "bg-orange-100 text-orange-600 border-orange-200" },
      { value: "spam_robocall", label: "Spam / Robocall", color: "bg-muted text-muted-foreground border-border" },
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
    color: "bg-blue-500/10 border-blue-200",
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
    color: "bg-purple-500/10 border-purple-200",
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
    color: "bg-green-500/10 border-green-200",
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
    color: "bg-orange-500/10 border-orange-200",
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
    color: "bg-yellow-500/10 border-yellow-200",
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
    color: "bg-muted border-gray-200",
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

// ─── Component ────────────────────────────────────────────────────────────────

export default function Softphone() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(search);
  const intakeId = params.get("intakeId") ? parseInt(params.get("intakeId")!) : null;

  // ── Linked intake record from URL param ──
  const { data: linkedRecord } = trpc.intake.get.useQuery(
    { id: intakeId! },
    { enabled: intakeId != null && intakeId > 0 }
  );

  // ── Aircall SDK state ──
  const aircallRef = useRef<InstanceType<typeof AircallPhone> | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState<string | null>(null);

  // ── Call state ──
  const [callState, setCallState] = useState<CallState>("idle");
  const [activeCallInfo, setActiveCallInfo] = useState<ActiveCallInfo | null>(null);
  const [wrapUpCallInfo, setWrapUpCallInfo] = useState<ActiveCallInfo | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Caller lookup (fires when a call comes in) ──
  const [lookupPhone, setLookupPhone] = useState<string | null>(null);
  const { data: callerHistory } = trpc.callers.history.useQuery(
    { phone: lookupPhone! },
    { enabled: !!lookupPhone }
  );

  // ── Disposition / wrap-up ──
  const [selectedDisposition, setSelectedDisposition] = useState<string | null>(null);
  const [dispositionNote, setDispositionNote] = useState("");
  const [savedDispositions, setSavedDispositions] = useState<Array<{ callId: number; disposition: string; note: string; name: string }>>([]);

  // ── Script ──
  const [scriptCallerType, setScriptCallerType] = useState<string>("unknown");

  // ── SMS (placeholder — Textline integration TBD) ──
  const [activeTab, setActiveTab] = useState<"phone" | "sms">("phone");
  const [smsInput, setSmsInput] = useState("");

  // ── Callback logging ──
  const [showCallbackDialog, setShowCallbackDialog] = useState(false);
  const [cbDisposition, setCbDisposition] = useState("");
  const [cbOutcome, setCbOutcome] = useState("");
  const [cbNotes, setCbNotes] = useState("");
  const [cbUpdateNotes, setCbUpdateNotes] = useState(false);

  // ── Auth / handler identity ──
  const { user: authUser } = useAuth();
  const { impersonating, isImpersonating } = useImpersonation();
  const { data: handlersList } = trpc.handlers.list.useQuery();
  const linkedHandler = authUser?.handlerProfileId
    ? handlersList?.find((h: { id: number; name: string }) => h.id === authUser.handlerProfileId)
    : null;
  const effectiveName = isImpersonating
    ? impersonating!.name
    : linkedHandler?.name ?? authUser?.name ?? "";
  const isAdmin = authUser?.role === "admin";

  // ── Next open record ──
  const { data: openRecords } = trpc.intake.list.useQuery(
    isAdmin
      ? { limit: 50, status: "open" }
      : { limit: 50, status: "open", handlerName: effectiveName || undefined },
    { enabled: intakeId != null && (isAdmin || !!effectiveName) }
  );
  const nextRecord = openRecords?.records?.find(
    (r: { id: number }) => r.id !== intakeId
  ) ?? null;

  // ── Handler stats for today ──
  const { data: handlerStats } = trpc.handlerMetrics.byName.useQuery(
    { handlerName: effectiveName },
    { enabled: !!effectiveName }
  );

  const logCallbackMutation = trpc.callbacks.log.useMutation({
    onSuccess: () => {
      toast.success("Callback logged — record updated.");
      setShowCallbackDialog(false);
      setCbDisposition(""); setCbOutcome(""); setCbNotes(""); setCbUpdateNotes(false);
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const handleLogCallback = () => {
    if (!linkedRecord || !cbDisposition) return;
    logCallbackMutation.mutate({
      intakeId: linkedRecord.id,
      disposition: cbDisposition as "reached" | "no_answer" | "left_voicemail" | "wrong_number" | "busy",
      outcome: (cbOutcome || undefined) as "resolved" | "escalated" | "follow_up" | "closed" | undefined,
      notes: cbNotes || undefined,
      newNotes: cbUpdateNotes && cbNotes ? cbNotes : undefined,
    });
  };

  // ── Start call timer ──
  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setCallDuration(0);
    timerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // ── Initialize Aircall Everywhere SDK ──
  useEffect(() => {
    // Only init once
    if (aircallRef.current) return;

    try {
      const phone = new AircallPhone({
        domToLoadWorkspace: "#aircall-phone-container",
        size: "big",
        onLogin: () => {
          setSdkReady(true);
          setSdkError(null);
          toast.success("Aircall connected", { duration: 2000 });
        },
        onLogout: () => {
          setSdkReady(false);
          setCallState("idle");
          setActiveCallInfo(null);
          stopTimer();
        },
      });

      // ── Incoming call ──
      phone.on("incoming_call", (callData: { call_id: number; from: string; to: string }) => {
        const rawPhone = callData.from || "";
        const digits = rawPhone.replace(/\D/g, "");
        setLookupPhone(digits.length >= 10 ? `+${digits}` : rawPhone);
        setActiveCallInfo({
          name: rawPhone,
          number: rawPhone,
          callerType: "unknown",
          direction: "inbound",
          aircallCallId: callData.call_id,
        });
        setCallState("incoming");
      });

      // ── Call answered (inbound) ──
      phone.on("call_answered", (callData: { call_id: number; from: string }) => {
        setCallState("active");
        startTimer();
      });

      // ── Outbound call initiated ──
      phone.on("outgoing_call", (callData: { call_id: number; to: string; from: string }) => {
        const rawPhone = callData.to || "";
        setActiveCallInfo({
          name: rawPhone,
          number: rawPhone,
          callerType: "unknown",
          direction: "outbound",
          aircallCallId: callData.call_id,
        });
        setCallState("ringing");
      });

      // ── Outbound answered ──
      phone.on("outgoing_answered", () => {
        setCallState("active");
        startTimer();
      });

      // ── Call ended ──
      phone.on("call_ended", (callData: { call_id: number; duration: number }) => {
        stopTimer();
        setCallDuration(callData.duration ?? 0);
        setWrapUpCallInfo(activeCallInfo);
        setCallState("wrap_up");
        setSelectedDisposition(null);
        setDispositionNote("");
        // Clear lookup so it re-fires on next call
        setLookupPhone(null);
      });

      // ── Comment saved from Aircall UI ──
      phone.on("comment_saved", (data: { comment: string; call_id: number }) => {
        toast.info(`Call note saved: "${data.comment.slice(0, 60)}${data.comment.length > 60 ? "…" : ""}"`);
      });

      aircallRef.current = phone;
    } catch (err) {
      setSdkError("Failed to initialize Aircall phone. Please refresh.");
    }

    return () => {
      stopTimer();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-update caller name when lookup resolves ──
  useEffect(() => {
    if (!callerHistory) return;
    const latestIntake = callerHistory.intakeRecords?.[0];
    if (latestIntake?.callerName) {
      setActiveCallInfo((prev) => prev ? { ...prev, name: latestIntake.callerName! } : prev);
    }
    if (latestIntake?.callerType) {
      setScriptCallerType(latestIntake.callerType);
      setActiveCallInfo((prev) => prev ? { ...prev, callerType: latestIntake.callerType! } : prev);
    }
  }, [callerHistory]);

  // ── Click-to-call from linked intake ──
  const handleClickToCall = (phone: string) => {
    if (!aircallRef.current || !sdkReady) {
      toast.error("Aircall phone not ready. Please log in to the phone first.");
      return;
    }
    const digits = phone.replace(/\D/g, "");
    aircallRef.current.send("dial_number", { phone_number: digits }, (success: boolean, data: unknown) => {
      if (!success) toast.error("Could not dial number. Make sure you are logged in to Aircall.");
    });
  };

  const handleSaveDisposition = () => {
    if (!selectedDisposition) return;
    setSavedDispositions((prev) => [{
      callId: Date.now(),
      disposition: selectedDisposition,
      note: dispositionNote,
      name: wrapUpCallInfo?.name || "Unknown",
    }, ...prev]);
    setCallState("idle");
    setCallDuration(0);
    setWrapUpCallInfo(null);
    setActiveCallInfo(null);
    setLookupPhone(null);
  };

  const handleSkipDisposition = () => {
    setCallState("idle");
    setCallDuration(0);
    setWrapUpCallInfo(null);
    setActiveCallInfo(null);
    setLookupPhone(null);
  };

  const formatDuration = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const callerTypeColor = (t: string) => {
    switch (t) {
      case "carrier": return "bg-blue-500/15 text-blue-700";
      case "law_office": return "bg-purple-100 text-purple-700";
      case "medical_provider": return "bg-green-500/15 text-green-700";
      case "claimant": return "bg-orange-100 text-orange-700";
      case "member": return "bg-yellow-100 text-yellow-700";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const dispositionLabel = (val: string | null) => val ? ALL_DISPOSITIONS.find((d) => d.value === val) : null;
  const activeScript = CALL_SCRIPTS[scriptCallerType] ?? CALL_SCRIPTS.unknown;

  return (
    <WhipLayout>
      <div className="p-6 max-w-7xl mx-auto">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Softphone</h1>
            <p className="text-sm text-gray-500 mt-1">Make and receive calls directly in the browser via Aircall</p>
          </div>
          <div className="flex items-center gap-2">
            {sdkReady ? (
              <Badge className="bg-green-500/15 text-green-700 border-green-200 border flex items-center gap-1.5">
                <Wifi className="w-3 h-3" /> Connected
              </Badge>
            ) : (
              <Badge className="bg-amber-100 text-amber-700 border-amber-200 border flex items-center gap-1.5">
                <WifiOff className="w-3 h-3" /> Log in to Aircall phone
              </Badge>
            )}
          </div>
        </div>

        {sdkError && (
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {sdkError}
          </div>
        )}

        {/* Linked Intake Record Context */}
        {linkedRecord && (
          <div className="mb-5 rounded-xl border border-primary/20 bg-primary/5 px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-4 h-4 text-[#ff6221] flex-shrink-0" />
                  <span className="text-xs font-semibold text-[#ff6221] uppercase tracking-wide">Linked Intake Record #{linkedRecord.id}</span>
                  <Badge variant="outline" className={linkedRecord.status === "open" ? "border-amber-300 text-amber-700 bg-amber-50 text-xs" : "border-green-300 text-green-700 bg-green-500/10 text-xs"}>
                    {linkedRecord.status}
                  </Badge>
                </div>
                <div className="text-base font-bold text-foreground">{linkedRecord.callerName || "Unknown caller"}</div>
                {linkedRecord.callerOrg && <div className="text-sm text-muted-foreground">{linkedRecord.callerOrg}</div>}
                <div className="flex flex-wrap gap-3 mt-2 text-xs">
                  {linkedRecord.callbackPhone && (
                    <button
                      onClick={() => handleClickToCall(linkedRecord.callbackPhone!)}
                      className="flex items-center gap-1 text-[#ff6221] hover:underline font-medium"
                    >
                      <Phone className="w-3 h-3" /> {linkedRecord.callbackPhone}
                      {sdkReady && <span className="text-[10px] text-green-600 font-normal">(click to call)</span>}
                    </button>
                  )}
                  {linkedRecord.whipClaimNumber && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <ClipboardList className="w-3 h-3" /> Claim: <span className="font-mono font-medium text-foreground">{linkedRecord.whipClaimNumber}</span>
                    </span>
                  )}
                  {linkedRecord.handlerName && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <User className="w-3 h-3" /> {linkedRecord.handlerName}
                    </span>
                  )}
                </div>
                {linkedRecord.message && (
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-2 italic">&#8220;{linkedRecord.message}&#8221;</p>
                )}
              </div>
              <div className="flex-shrink-0 flex flex-col items-end gap-2">
                <button
                  onClick={() => navigate(`/intake/${linkedRecord.id}`)}
                  className="flex items-center gap-1 text-xs text-foreground hover:text-[#ff6221] font-medium transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> View Record
                </button>
                <Button
                  size="sm"
                  className="text-xs bg-[#ff6221] hover:bg-[#e5541a] text-white h-7 px-3"
                  onClick={() => setShowCallbackDialog(true)}
                >
                  <PhoneCall className="w-3 h-3 mr-1" /> Log Callback
                </Button>
                {nextRecord && (
                  <button
                    onClick={() => navigate(`/softphone?intakeId=${nextRecord.id}`)}
                    className="flex items-center gap-1 text-xs text-foreground/60 hover:text-foreground font-medium transition-colors"
                    title={`Next: #${nextRecord.id} — ${nextRecord.callerName || 'Unknown'}`}
                  >
                    Next record <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── Left column: Aircall Phone + call context ── */}
          <div className="lg:col-span-1 space-y-4">

            {/* Aircall Workspace iframe */}
            <Card className="border border-gray-200 shadow-sm overflow-hidden">
              <div className="bg-primary px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-white" />
                  <span className="text-sm font-semibold text-white">Aircall Phone</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${sdkReady ? "bg-green-400" : "bg-gray-400"}`} />
                  <span className="text-xs text-white/70">{sdkReady ? "Ready" : "Not connected"}</span>
                </div>
              </div>
              {/* The SDK injects the iframe into this div */}
              <div
                id="aircall-phone-container"
                className="flex items-center justify-center bg-gray-50"
                style={{ minHeight: 666 }}
              />
            </Card>

            {/* Active call context — shown while call is live */}
            {(callState === "incoming" || callState === "active" || callState === "ringing") && activeCallInfo && (
              <Card className={`border ${callState === "incoming" ? "border-green-300 bg-green-500/10" : callState === "ringing" ? "border-blue-200 bg-blue-500/10" : "border-green-200 bg-green-500/10"}`}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    {callState === "incoming" && <PhoneIncoming className="w-4 h-4 text-green-600 animate-pulse" />}
                    {callState === "ringing" && <PhoneOutgoing className="w-4 h-4 text-blue-600 animate-pulse" />}
                    {callState === "active" && <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                      {callState === "incoming" ? "Incoming Call" : callState === "ringing" ? "Calling…" : "Live Call"}
                    </span>
                    {callState === "active" && (
                      <span className="ml-auto text-lg font-mono font-bold text-green-700">{formatDuration(callDuration)}</span>
                    )}
                  </div>
                  <div className="text-sm font-bold text-foreground">{activeCallInfo.name}</div>
                  <div className="text-xs text-gray-500">{activeCallInfo.number}</div>
                  {activeCallInfo.callerType !== "unknown" && (
                    <Badge className={`text-xs ${callerTypeColor(activeCallInfo.callerType)}`}>
                      {activeCallInfo.callerType.replace(/_/g, " ")}
                    </Badge>
                  )}
                  {/* Caller history from DB */}
                  {callerHistory && callerHistory.intakeRecords.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-200 space-y-1">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Previous records</p>
                      {callerHistory.intakeRecords.slice(0, 3).map((ir: { id: number; callerName?: string | null; status: string; createdAt: Date }) => (
                        <button
                          key={ir.id}
                          onClick={() => navigate(`/intake/${ir.id}`)}
                          className="w-full text-left flex items-center justify-between text-xs text-gray-600 hover:text-[#ff6221] transition-colors"
                        >
                          <span>#{ir.id} — {ir.callerName || "Unknown"}</span>
                          <Badge variant="outline" className={`text-[10px] ${ir.status === "open" ? "border-amber-300 text-amber-700" : "border-green-300 text-green-700"}`}>
                            {ir.status}
                          </Badge>
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Wrap-up card */}
            {callState === "wrap_up" && (
              <Card className="border border-amber-200 bg-amber-50/30">
                <CardContent className="p-4 space-y-3">
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
                                  selectedDisposition === d.value ? d.color + " ring-1 ring-offset-1 ring-current" : "bg-background border-gray-200 text-gray-700 hover:bg-muted"
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
                    className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-[#171b31] bg-background"
                    rows={2} />
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1 text-xs bg-primary hover:bg-[#2a3050] text-white"
                      onClick={handleSaveDisposition} disabled={!selectedDisposition}>
                      <CheckCircle2 className="w-3 h-3 mr-1" /> Save &amp; Close
                    </Button>
                    <Button size="sm" variant="ghost" className="text-xs text-gray-500" onClick={handleSkipDisposition}>
                      Skip
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Coaching tips */}
            <Card className="border border-blue-100 bg-blue-500/10/40">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-[#ff6221]" />
                  Call Coaching Tips
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pb-4">
                {COACHING_TIPS.map(({ icon: Icon, tip }, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Icon className="w-3 h-3 text-foreground" />
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
                {
                  label: "Calls Today",
                  value: handlerStats ? String((handlerStats as { stats?: { total?: number } }).stats?.total ?? "—") : "—",
                  sub: handlerStats ? `${(handlerStats as { stats?: { answered?: number } }).stats?.answered ?? 0} answered` : "Loading…",
                  icon: Phone,
                },
                {
                  label: "Avg Handle Time",
                  value: handlerStats && (handlerStats as { stats?: { avgDurationMin?: number } }).stats?.avgDurationMin
                    ? `${(handlerStats as { stats?: { avgDurationMin?: number } }).stats!.avgDurationMin!.toFixed(1)}m`
                    : "—",
                  sub: "Target: under 6 min",
                  icon: Clock,
                },
                {
                  label: "Answer Rate",
                  value: handlerStats && (handlerStats as { stats?: { answerRate?: number } }).stats?.answerRate != null
                    ? `${(handlerStats as { stats?: { answerRate?: number } }).stats!.answerRate}%`
                    : "—",
                  sub: "This month",
                  icon: User,
                },
              ].map(({ label, value, sub, icon: Icon }) => (
                <Card key={label} className="border border-gray-200 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="w-4 h-4 text-[#ff6221]" />
                      <span className="text-xs text-gray-500 font-medium">{label}</span>
                    </div>
                    <div className="text-2xl font-bold text-foreground">{value}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{sub}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Call Script panel */}
            <Card className={`border ${activeScript.color}`}>
              <CardHeader className="pb-2 pt-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#ff6221]" />
                    Call Script
                  </CardTitle>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500">Caller type:</span>
                    <select
                      value={scriptCallerType}
                      onChange={(e) => setScriptCallerType(e.target.value)}
                      className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#171b31] bg-background">
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
                  <p className="text-xs text-gray-700 italic leading-relaxed bg-background/70 rounded-md px-3 py-2 border border-white">
                    {activeScript.greeting}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Key Steps</p>
                  <ol className="space-y-1.5">
                    {activeScript.steps.map((step, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-gray-700">
                        <span className="w-4 h-4 rounded-full bg-primary text-white text-[10px] flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">{i + 1}</span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Closing</p>
                  <p className="text-xs text-gray-700 italic leading-relaxed bg-background/70 rounded-md px-3 py-2 border border-white">
                    {activeScript.closing}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Logged dispositions this session */}
            {savedDispositions.length > 0 && (
              <Card className="border border-emerald-200 bg-emerald-50/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
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

            {/* Caller history panel — shows when a call is active and we have history */}
            {callerHistory && (callerHistory.intakeRecords.length > 0 || callerHistory.calls.length > 0) && (
              <Card className="border border-gray-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Info className="w-4 h-4 text-[#ff6221]" />
                    Caller History
                    {callerHistory.profile && (
                      <Badge variant="outline" className="ml-auto text-xs">
                        {callerHistory.profile.callerType?.replace(/_/g, " ") ?? "Known caller"}
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4 space-y-2">
                  {callerHistory.intakeRecords.slice(0, 5).map((ir: { id: number; callerName?: string | null; status: string; createdAt: Date; message?: string | null }) => (
                    <button
                      key={ir.id}
                      onClick={() => navigate(`/intake/${ir.id}`)}
                      className="w-full text-left flex items-center justify-between gap-2 text-xs px-3 py-2 rounded-lg hover:bg-muted transition-colors border border-gray-100"
                    >
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-gray-800">#{ir.id} — {ir.callerName || "Unknown"}</span>
                        {ir.message && <p className="text-gray-400 truncate mt-0.5 italic">{ir.message}</p>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge variant="outline" className={`text-[10px] ${ir.status === "open" ? "border-amber-300 text-amber-700" : "border-green-300 text-green-700"}`}>
                          {ir.status}
                        </Badge>
                        <ChevronRight className="w-3 h-3 text-gray-400" />
                      </div>
                    </button>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* ── Log Callback Dialog ── */}
      <Dialog open={showCallbackDialog} onOpenChange={setShowCallbackDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">Log Callback</DialogTitle>
          </DialogHeader>
          {linkedRecord && (
            <div className="text-sm text-gray-500 -mt-2 mb-1">
              Record #{linkedRecord.id} &mdash; <span className="font-medium text-gray-700">{linkedRecord.callerName || "Unknown"}</span>
            </div>
          )}
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium text-gray-700 mb-1 block">
                Disposition <span className="text-red-500">*</span>
              </Label>
              <Select value={cbDisposition} onValueChange={setCbDisposition}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select disposition…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="reached">Reached</SelectItem>
                  <SelectItem value="no_answer">No Answer</SelectItem>
                  <SelectItem value="left_voicemail">Left Voicemail</SelectItem>
                  <SelectItem value="busy">Busy</SelectItem>
                  <SelectItem value="wrong_number">Wrong Number</SelectItem>
                  <SelectItem value="emailed">Emailed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-medium text-gray-700 mb-1 block">Outcome</Label>
              <Select value={cbOutcome} onValueChange={setCbOutcome}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select outcome…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="follow_up">Follow-up needed</SelectItem>
                  <SelectItem value="resolved">Resolved — close record</SelectItem>
                  <SelectItem value="escalated">Escalated</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-medium text-gray-700 mb-1 block">Notes</Label>
              <Textarea
                value={cbNotes}
                onChange={e => setCbNotes(e.target.value)}
                placeholder="Add call notes…"
                rows={3}
                className="resize-none"
              />
            </div>
            {cbNotes && (
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cbUpdateNotes}
                  onChange={e => setCbUpdateNotes(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Also append these notes to the intake record
              </label>
            )}
          </div>
          <DialogFooter className="mt-2">
            <Button variant="ghost" onClick={() => setShowCallbackDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleLogCallback}
              className="bg-[#ff6221] hover:bg-[#e5541a] text-white"
            >
              {logCallbackMutation.isPending ? "Saving…" : "Save Callback"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </WhipLayout>
  );
}
