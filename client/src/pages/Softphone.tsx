/**
 * Softphone page — full-page view of the persistent softphone.
 *
 * The Aircall SDK lives in SoftphoneContext (initialized once in App.tsx via
 * FloatingSoftphone). This page reads all call state from that context and
 * moves the persistent phone container into the left column by repositioning
 * the hidden div while this page is mounted.
 */
import { useEffect, useState, useCallback } from "react";
import { useSearch, useLocation } from "wouter";
import WhipLayout from "@/components/WhipLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { useSoftphone } from "@/contexts/SoftphoneContext";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Phone, PhoneIncoming, PhoneOutgoing,
  Clock, User, ChevronRight, ExternalLink, Info, CheckCircle2,
  ClipboardList, Lightbulb, ArrowRight,
  Building2, Scale, Stethoscope, AlertTriangle, FileText,
  PhoneCall, Wifi, WifiOff, ChevronDown, ChevronUp,
  Mail, Shield, AlertCircle,
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

const CALL_SCRIPTS: Record<string, { title: string; icon: React.ElementType; color: string; accentColor: string; greeting: string; steps: string[]; closing: string; tips: string[] }> = {
  carrier: {
    title: "Carrier Script",
    icon: Building2,
    color: "bg-blue-500/10 border-blue-200",
    accentColor: "text-blue-700",
    greeting: "\"Thank you for calling Whip Claims, this is [your name]. May I have your name and the insurance company you're calling from?\"",
    steps: [
      "Ask for claim number and insured's name",
      "Verify coverage and policy limits",
      "Note the nature of the inquiry (liability, PIP, subrogation)",
      "Do NOT admit liability or make settlement commitments",
      "Offer to have the adjuster return the call within 24 hours",
    ],
    closing: "\"Thank you for calling. Our adjuster will follow up within 24 hours. Is there anything else I can help with?\"",
    tips: [
      "Never admit liability — even informally.",
      "Get the claim number and adjuster name before anything else.",
      "If they push for a settlement number, escalate to the supervisor.",
      "Log the carrier name and claim number before ending the call.",
    ],
  },
  law_office: {
    title: "Law Office Script",
    icon: Scale,
    color: "bg-purple-500/10 border-purple-200",
    accentColor: "text-purple-700",
    greeting: "\"Thank you for calling Whip Claims, this is [your name]. May I ask who I'm speaking with and which firm you're calling from?\"",
    steps: [
      "Get attorney name, firm name, and bar number if possible",
      "Ask for the claim number they're referencing",
      "Note the nature of the inquiry (demand letter, subpoena, representation notice)",
      "Do NOT discuss liability, coverage, or settlement without supervisor approval",
      "Offer to have the adjuster or supervisor return the call",
    ],
    closing: "\"I'll escalate this to our claims team. They'll be in touch within 24 hours. Thank you.\"",
    tips: [
      "⚠️ Do NOT discuss liability or settlement with attorneys without supervisor approval.",
      "If they mention a demand letter, note the demand amount and deadline.",
      "Subpoenas must be escalated to the supervisor immediately.",
      "Log the firm name and attorney name before ending.",
    ],
  },
  medical_provider: {
    title: "Medical Provider Script",
    icon: Stethoscope,
    color: "bg-green-500/10 border-green-200",
    accentColor: "text-green-700",
    greeting: "\"Thank you for calling Whip Claims, this is [your name]. Are you calling regarding a PIP billing inquiry or treatment authorization?\"",
    steps: [
      "Get provider name, NPI number, and billing contact",
      "Confirm patient name and date of service",
      "Note the CPT codes or services in question",
      "Verify claim number and PIP policy limits",
      "Advise on PIP submission process if first contact",
    ],
    closing: "\"I've noted your inquiry. Our PIP team will follow up within 2 business days. Thank you.\"",
    tips: [
      "Medical providers often call about PIP billing status — have the claim number and PIP limits ready.",
      "Remind them they can submit via IVR Option 1 for faster processing.",
      "Check back every 30 seconds if you need to place them on hold.",
      "Note the NPI number and billing contact for the PIP team.",
    ],
  },
  member: {
    title: "Member / Insured Script",
    icon: Shield,
    color: "bg-yellow-500/10 border-yellow-200",
    accentColor: "text-yellow-700",
    greeting: "\"Thank you for calling Whip Claims, this is [your name]. May I have your name and policy number?\"",
    steps: [
      "Verify identity: name, policy number, date of birth",
      "Ask for the nature of the inquiry",
      "Pull up the claim record if a claim number is provided",
      "Provide status update if available",
      "Offer to schedule a callback if adjuster is unavailable",
    ],
    closing: "\"Thank you for calling. Is there anything else I can help you with today?\"",
    tips: [
      "Always verify identity before discussing claim details.",
      "Be empathetic — members are often stressed after an accident.",
      "If they ask about coverage, refer to the policy — do not interpret.",
      "Log the call with the claim number before ending.",
    ],
  },
  claimant: {
    title: "Claimant Script",
    icon: User,
    color: "bg-orange-500/10 border-orange-200",
    accentColor: "text-orange-700",
    greeting: "\"Thank you for calling Whip Claims, this is [your name]. May I have your name and the claim number you're calling about?\"",
    steps: [
      "Get claimant name and claim number",
      "Note the nature of the inquiry (status, payment, dispute)",
      "Do NOT admit liability or make payment commitments",
      "Offer to have the adjuster return the call",
      "Log the call with the claim number and nature of inquiry",
    ],
    closing: "\"Thank you for calling. Our adjuster will follow up within 24 hours.\"",
    tips: [
      "⚠️ Do NOT admit liability — even informally.",
      "If they mention an attorney, note the firm name and escalate.",
      "Callback window: 24 hours for standard, 4 hours for urgent.",
      "Log the claim number and nature of inquiry before ending.",
    ],
  },
  police: {
    title: "Police / Government Script",
    icon: Shield,
    color: "bg-red-500/10 border-red-200",
    accentColor: "text-red-700",
    greeting: "\"Thank you for calling Whip Claims, this is [your name]. How can I assist you today?\"",
    steps: [
      "Get officer name, badge number, and department",
      "Ask for the incident/report number they're referencing",
      "Note the nature of the inquiry (records request, subpoena, verification)",
      "Do NOT release any claim information without supervisor approval",
      "Offer to have the supervisor return the call within 4 hours",
    ],
    closing: "\"I'll escalate this to our supervisor immediately. They'll be in touch within 4 business hours. Thank you.\"",
    tips: [
      "⚠️ Do NOT release any claim or personal information without supervisor approval.",
      "Get badge number and department — log everything before ending the call.",
      "Escalate to supervisor immediately for subpoenas or formal records requests.",
      "Stay professional and cooperative — do not argue or delay.",
    ],
  },
  wrong_department: {
    title: "Wrong Department Script",
    icon: AlertCircle,
    color: "bg-gray-100 border-gray-200",
    accentColor: "text-gray-600",
    greeting: "\"Thank you for calling Whip Claims, this is [your name]. It looks like you may have reached the wrong department — let me help get you to the right place.\"",
    steps: [
      "Ask who they were trying to reach and what their inquiry is about",
      "Identify the correct department or contact",
      "Offer to transfer or provide the correct number",
      "Log the call with 'wrong department' disposition",
    ],
    closing: "\"I'll transfer you now / Here's the number for [department]. Is there anything else I can help with?\"",
    tips: [
      "Don't just hang up — help them find the right contact.",
      "Log the call with 'Wrong Number / Misrouted' disposition.",
      "If they need a specific department, offer to transfer rather than just giving a number.",
    ],
  },
  unknown: {
    title: "General Script",
    icon: Phone,
    color: "bg-muted border-gray-200",
    accentColor: "text-gray-600",
    greeting: "\"Thank you for calling Whip Claims, this is [your name]. How can I help you today?\"",
    steps: [
      "Listen to understand the nature of the call",
      "Identify caller type: carrier, law office, medical provider, member, or claimant",
      "Route to the appropriate script once caller type is known",
      "Get callback number and name before ending if unresolved",
    ],
    closing: "\"Thank you for calling Whip Claims. Is there anything else I can help you with?\"",
    tips: [
      "Check back every 30 seconds on hold: \"Thank you for holding, I'm still looking into this for you.\"",
      "Warm transfer only — stay on the line to introduce the caller. Confirm the receiving handler is available first.",
      "Log claim number and caller type before ending. This helps track repeat callers and IVR eligibility.",
      "Carriers, law offices, and medical providers can submit via IVR Option 1 — no live agent needed. Let them know.",
    ],
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function Softphone() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(search);
  const intakeId = params.get("intakeId") ? parseInt(params.get("intakeId")!) : null;
  const urlPhone = params.get("phone") || null;
  const urlName = params.get("name") || null;
  const autoCall = params.get("autoCall") === "1";

  // ── Pull everything from the global softphone context ──
  const {
    sdkReady, sdkError, aircallRef,
    callState, activeCallInfo, wrapUpCallInfo, callDuration, lookupPhone,
    selectedDisposition, setSelectedDisposition, dispositionNote, setDispositionNote,
    savedDispositions, handleSaveDisposition, handleSkipDisposition,
    scriptCallerType, setScriptCallerType,
    handleClickToCall,
    setWidgetOpen,
    setLinkedIntakeId, setLinkedIntakeName, setLinkedIntakePhone, setAutoDialPending,
  } = useSoftphone();

  // ── Sync URL params into the global context ──
  useEffect(() => {
    setLinkedIntakeId(intakeId);
    setLinkedIntakeName(urlName);
    setLinkedIntakePhone(urlPhone);
    if (autoCall && urlPhone) {
      setAutoDialPending(urlPhone);
    }
    // Hide the floating widget while we're on the full page
    setWidgetOpen(false);
    return () => {
      // When leaving the page, show the floating widget again
      setWidgetOpen(true);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Linked intake record ──
  const { data: linkedRecord } = trpc.intake.get.useQuery(
    { id: intakeId! },
    { enabled: intakeId != null && intakeId > 0 }
  );

  // ── Expandable intake record panel ──
  const [intakePanelOpen, setIntakePanelOpen] = useState(false);

  // ── Caller lookup ──
  const { data: callerHistory } = trpc.callers.history.useQuery(
    { phone: lookupPhone! },
    { enabled: !!lookupPhone }
  );

  // ── Auto-set script from linked record ──
  useEffect(() => {
    if (linkedRecord?.callerType) {
      setScriptCallerType(linkedRecord.callerType);
    }
  }, [linkedRecord?.callerType, setScriptCallerType]);

  // ── Auto-update caller name when lookup resolves ──
  useEffect(() => {
    if (!callerHistory) return;
    const latestIntake = callerHistory.intakeRecords?.[0];
    if (latestIntake?.callerType) {
      setScriptCallerType(latestIntake.callerType);
    }
  }, [callerHistory, setScriptCallerType]);

  // ── SMS placeholder ──
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

  // ── Helpers ──
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
  const ScriptIcon = activeScript.icon;

  const callerTypeLabel: Record<string, string> = {
    carrier: "Insurance Carrier",
    law_office: "Law Office",
    medical_provider: "Medical Provider",
    member: "Member / Insured",
    claimant: "Claimant",
    police: "Police / Government",
    wrong_department: "Wrong Department",
    unknown: "Unknown",
  };

  // The Aircall iframe lives in a globally-persistent fixed div managed by
  // FloatingSoftphone. When we're on /softphone, FloatingSoftphone detects the
  // route and switches the container to static positioning so it flows into the
  // page layout. We just need to render a portal target div with the same id.
  // No DOM manipulation needed — the container is already in the right place.

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

        {/* ── Linked Intake Record — Collapsible Banner ── */}
        {linkedRecord && (
          <div className="mb-5 rounded-xl border border-primary/20 bg-primary/5 overflow-hidden">
            {/* Summary row — always visible */}
            <div className="px-5 py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <FileText className="w-4 h-4 text-[#ff6221] flex-shrink-0" />
                <span className="text-xs font-semibold text-[#ff6221] uppercase tracking-wide flex-shrink-0">
                  Linked Record #{linkedRecord.id}
                </span>
                <Badge variant="outline" className={linkedRecord.status === "open"
                  ? "border-amber-300 text-amber-700 bg-amber-50 text-xs flex-shrink-0"
                  : "border-green-300 text-green-700 bg-green-500/10 text-xs flex-shrink-0"}>
                  {linkedRecord.status}
                </Badge>
                <span className="font-semibold text-foreground truncate">{linkedRecord.callerName || "Unknown caller"}</span>
                {linkedRecord.callerOrg && (
                  <span className="text-muted-foreground text-xs truncate hidden sm:block">· {linkedRecord.callerOrg}</span>
                )}
                {linkedRecord.callbackPhone && (
                  <button
                    onClick={() => handleClickToCall(linkedRecord.callbackPhone!)}
                    className="flex items-center gap-1 text-[#ff6221] hover:underline font-medium text-xs flex-shrink-0"
                  >
                    <Phone className="w-3 h-3" /> {linkedRecord.callbackPhone}
                    {sdkReady && <span className="text-[10px] text-green-600">(click to call)</span>}
                  </button>
                )}
                {linkedRecord.whipClaimNumber && (
                  <span className="flex items-center gap-1 text-muted-foreground text-xs flex-shrink-0 hidden md:flex">
                    <ClipboardList className="w-3 h-3" /> {linkedRecord.whipClaimNumber}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  size="sm"
                  className="text-xs bg-[#ff6221] hover:bg-[#e5541a] text-white h-7 px-3"
                  onClick={() => setShowCallbackDialog(true)}
                >
                  <PhoneCall className="w-3 h-3 mr-1" /> Log Callback
                </Button>
                <button
                  onClick={() => navigate(`/intake/${linkedRecord.id}`)}
                  className="flex items-center gap-1 text-xs text-foreground hover:text-[#ff6221] font-medium transition-colors"
                  title="Open full record"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setIntakePanelOpen((v) => !v)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  title={intakePanelOpen ? "Collapse" : "Expand record details"}
                >
                  {intakePanelOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Expanded detail panel */}
            {intakePanelOpen && (
              <div className="border-t border-primary/10 px-5 py-4 bg-background/60">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {/* Caller info */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Caller Info</p>
                    <div className="space-y-1 text-sm">
                      {linkedRecord.callerName && (
                        <div className="flex items-center gap-2">
                          <User className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="font-medium">{linkedRecord.callerName}</span>
                        </div>
                      )}
                      {linkedRecord.callerOrg && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>{linkedRecord.callerOrg}</span>
                        </div>
                      )}
                      {linkedRecord.callerType && (
                        <div className="flex items-center gap-2">
                          <Badge className={`text-xs ${callerTypeColor(linkedRecord.callerType)}`}>
                            {callerTypeLabel[linkedRecord.callerType] ?? linkedRecord.callerType}
                          </Badge>
                        </div>
                      )}
                      {linkedRecord.callbackPhone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                          <button onClick={() => handleClickToCall(linkedRecord.callbackPhone!)} className="text-[#ff6221] hover:underline font-medium">
                            {linkedRecord.callbackPhone}
                          </button>
                        </div>
                      )}
                      {linkedRecord.callbackEmail && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate">{linkedRecord.callbackEmail}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Claim info */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Claim Details</p>
                    <div className="space-y-1 text-sm">
                      {linkedRecord.whipClaimNumber && (
                        <div className="flex items-center gap-2">
                          <ClipboardList className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="font-mono font-medium">{linkedRecord.whipClaimNumber}</span>
                        </div>
                      )}
                      {linkedRecord.callerRefNumber && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>Ref: {linkedRecord.callerRefNumber}</span>
                        </div>
                      )}
                      {linkedRecord.handlerName && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <User className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>Handler: {linkedRecord.handlerName}</span>
                        </div>
                      )}
                      {linkedRecord.priority && linkedRecord.priority !== "normal" && (
                        <Badge className={`text-xs ${linkedRecord.priority === "urgent" ? "bg-red-500/15 text-red-700" : "bg-orange-100 text-orange-700"}`}>
                          {linkedRecord.priority.toUpperCase()}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Message / notes */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Message</p>
                    {linkedRecord.message ? (
                      <p className="text-xs text-muted-foreground italic leading-relaxed bg-muted/40 rounded-md px-3 py-2">
                        &#8220;{linkedRecord.message}&#8221;
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">No message recorded.</p>
                    )}
                    {linkedRecord.notes && (
                      <>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-2">Notes</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">{linkedRecord.notes}</p>
                      </>
                    )}
                    {nextRecord && (
                      <button
                        onClick={() => navigate(`/softphone?intakeId=${nextRecord.id}`)}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors mt-2"
                        title={`Next: #${nextRecord.id} — ${nextRecord.callerName || 'Unknown'}`}
                      >
                        Next record <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── Left column: Aircall Phone + call context ── */}
          <div className="lg:col-span-1 space-y-4">

            {/* Aircall Workspace iframe — the persistent container is moved here */}
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
              {/* The globally-persistent Aircall container is rendered here by
                  FloatingSoftphone when on the /softphone route. It switches
                  from fixed/hidden to static/full-size automatically. */}
              <div
                id="aircall-phone-page-slot"
                className="flex items-center justify-center bg-gray-50"
                style={{ minHeight: 666 }}
              />
            </Card>

            {/* Active call context */}
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
          </div>

          {/* ── Right column: KPIs + Script + Tips + History ── */}
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
                  value: handlerStats && (handlerStats as { stats?: { avgDurationMin?: number } }).stats?.avgDurationMin != null
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

            {/* ── Call Script + Coaching Tips ── */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {/* Call Script */}
              <Card className={`border ${activeScript.color}`}>
                <CardHeader className="pb-2 pt-4">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <ScriptIcon className={`w-4 h-4 ${activeScript.accentColor}`} />
                      {activeScript.title}
                    </CardTitle>
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
                      <option value="police">Police / Gov</option>
                      <option value="wrong_department">Wrong Dept</option>
                    </select>
                  </div>
                  {linkedRecord?.callerType && linkedRecord.callerType !== "unknown" && scriptCallerType === linkedRecord.callerType && (
                    <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-green-500" />
                      Auto-matched to linked record's caller type
                    </p>
                  )}
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

              {/* Coaching Tips */}
              <Card className="border border-amber-100 bg-amber-50/30">
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-[#ff6221]" />
                    Call Coaching Tips
                    {linkedRecord?.callerType && linkedRecord.callerType !== "unknown" && (
                      <Badge className={`ml-auto text-[10px] ${callerTypeColor(linkedRecord.callerType)}`}>
                        {callerTypeLabel[linkedRecord.callerType] ?? linkedRecord.callerType}
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pb-4">
                  {activeScript.tips.map((tip, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <div className="w-5 h-5 rounded-full bg-[#ff6221]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-[10px] font-bold text-[#ff6221]">{i + 1}</span>
                      </div>
                      <p className={`text-xs leading-relaxed ${tip.startsWith("⚠️") ? "text-red-700 font-medium" : "text-gray-700"}`}>{tip}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

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

            {/* Caller history panel */}
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
