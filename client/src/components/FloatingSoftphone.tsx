/**
 * FloatingSoftphone
 *
 * A persistent floating softphone widget that lives at the application root.
 *
 * KEY DESIGN PRINCIPLE:
 * The Aircall iframe container is appended to <body> ONCE via an imperative
 * useEffect and is NEVER removed or re-mounted. This keeps the SDK alive
 * across all page navigations.
 *
 * When on /softphone: the container is CSS-repositioned to fill the page's
 * left column phone slot (identified by #aircall-phone-page-slot).
 * When elsewhere: the container is shown as a floating widget or hidden.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { useSoftphone } from "@/contexts/SoftphoneContext";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Phone, PhoneIncoming, PhoneOutgoing,
  ExternalLink, X, Mic, MicOff, Pause, Play,
  CheckCircle2, ChevronDown, ChevronUp, Wifi, WifiOff,
} from "lucide-react";
import { toast } from "sonner";

// ─── Disposition codes ────────────────────────────────────────────────────────

const DISPOSITION_GROUPS = [
  {
    group: "Claim Actions",
    items: [
      { value: "claim_update", label: "Claim Status Update" },
      { value: "new_claim_fnol", label: "New Claim / FNOL" },
      { value: "coverage_question", label: "Coverage Question" },
      { value: "pip_billing_inquiry", label: "PIP / Billing Inquiry" },
      { value: "demand_letter", label: "Demand Letter / Legal" },
      { value: "subrogation", label: "Subrogation / Recovery" },
    ],
  },
  {
    group: "Call Outcomes",
    items: [
      { value: "callback_completed", label: "Callback Completed" },
      { value: "left_voicemail", label: "Left Voicemail" },
      { value: "no_answer", label: "No Answer" },
      { value: "follow_up_scheduled", label: "Follow-Up Scheduled" },
      { value: "resolved_closed", label: "Resolved — Case Closed" },
    ],
  },
  {
    group: "Transfers & Routing",
    items: [
      { value: "transfer_to_handler", label: "Transferred to Handler" },
      { value: "transfer_to_supervisor", label: "Escalated to Supervisor" },
      { value: "transfer_to_adjuster", label: "Transferred to Adjuster" },
      { value: "ivr_eligible", label: "IVR Eligible — Advised Press 1" },
    ],
  },
  {
    group: "Other",
    items: [
      { value: "wrong_number", label: "Wrong Number / Misrouted" },
      { value: "duplicate_call", label: "Duplicate / Repeat Call" },
      { value: "language_barrier", label: "Language Barrier" },
      { value: "spam_robocall", label: "Spam / Robocall" },
      { value: "test_call", label: "Test Call (Internal)" },
    ],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(s: number) {
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

function callStateColor(state: string) {
  switch (state) {
    case "active": return "bg-green-500";
    case "ringing": return "bg-yellow-400 animate-pulse";
    case "incoming": return "bg-blue-500 animate-pulse";
    case "wrap_up": return "bg-orange-500";
    default: return "bg-gray-400";
  }
}

function callStateLabel(state: string) {
  switch (state) {
    case "active": return "On Call";
    case "ringing": return "Ringing…";
    case "incoming": return "Incoming";
    case "wrap_up": return "Wrap-Up";
    default: return "Ready";
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FloatingSoftphone() {
  const [location, navigate] = useLocation();
  const {
    sdkReady, sdkError, initAircall,
    callState, activeCallInfo, wrapUpCallInfo, callDuration,
    selectedDisposition, setSelectedDisposition, dispositionNote, setDispositionNote,
    handleSaveDisposition, handleSkipDisposition,
    widgetOpen, setWidgetOpen, widgetExpanded, setWidgetExpanded,
    linkedIntakeId,
  } = useSoftphone();

  const [muted, setMuted] = useState(false);
  const [onHold, setOnHold] = useState(false);
  const [showDisposition, setShowDisposition] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isOnSoftphonePage = location.startsWith("/softphone");

  // ── Create the persistent Aircall container once, append to body ──────────
  // This runs once on mount. The container is NEVER removed from the DOM.
  useEffect(() => {
    // Check if already created (e.g. HMR)
    let container = document.getElementById("aircall-global-phone-container") as HTMLDivElement | null;
    if (!container) {
      container = document.createElement("div");
      container.id = "aircall-global-phone-container";
      document.body.appendChild(container);
    }
    containerRef.current = container;
    // Pre-request microphone with optimal audio constraints for telephony.
    // This ensures the browser's audio processing pipeline (echo cancellation,
    // noise suppression, auto gain) is active before Aircall initializes WebRTC.
    if (navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,   // Telephony-optimized sample rate
          channelCount: 1,     // Mono — standard for voice calls
        },
      }).then((stream) => {
        // Release the stream immediately — we just needed to prime the permission
        // and let the browser configure its audio pipeline. Aircall will request
        // its own stream when a call starts.
        stream.getTracks().forEach((t) => t.stop());
      }).catch(() => {
        // Permission denied or not available — Aircall will handle its own prompt
      });
    }

    // Initialize the SDK into this container
    initAircall(container);

    return () => {
      // On unmount (app teardown only), clean up
      // Do NOT remove the container — it must outlive component re-renders
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Move the Aircall container into/out of the page slot via DOM reparenting ─
  // When on /softphone: move the container node into #aircall-phone-page-slot.
  // When elsewhere: move it back to <body> and hide it.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (isOnSoftphonePage) {
      // Poll for the slot (it may not be in the DOM yet on first render)
      let attempts = 0;
      const tryMove = () => {
        const slot = document.getElementById("aircall-phone-page-slot");
        if (slot) {
          // Move the container into the slot
          slot.appendChild(container);
          Object.assign(container.style, {
            position: "relative",
            width: "100%",
            height: "100%",
            minHeight: "666px",
            top: "", left: "", bottom: "", right: "",
            zIndex: "1",
            borderRadius: "0",
            boxShadow: "none",
            overflow: "hidden",
          });
        } else if (attempts < 20) {
          attempts++;
          setTimeout(tryMove, 50);
        }
      };
      requestAnimationFrame(tryMove);
    } else {
      // Move back to body and hide
      if (container.parentNode !== document.body) {
        document.body.appendChild(container);
      }
      Object.assign(container.style, {
        position: "fixed",
        bottom: "-9999px",
        right: "-9999px",
        top: "auto",
        left: "auto",
        width: "1px",
        height: "1px",
        zIndex: "9998",
        overflow: "hidden",
      });
    }
  }, [isOnSoftphonePage, location]); // eslint-disable-line react-hooks/exhaustive-deps

  // Show disposition panel when wrap_up starts
  useEffect(() => {
    if (callState === "wrap_up") {
      setShowDisposition(true);
      setWidgetExpanded(true);
      setWidgetOpen(true);
    }
  }, [callState, setWidgetExpanded, setWidgetOpen]);

  // Auto-open on incoming call
  useEffect(() => {
    if (callState === "incoming") {
      setWidgetOpen(true);
      setWidgetExpanded(true);
    }
  }, [callState, setWidgetOpen, setWidgetExpanded]);

  const handleToggleExpand = useCallback(() => {
    setWidgetExpanded((v: boolean) => !v);
  }, [setWidgetExpanded]);

  const handleClose = useCallback(() => {
    if (callState !== "idle" && callState !== "wrap_up") {
      toast.warning("You're on a call — the softphone stays active in the background.");
      return;
    }
    setWidgetOpen(false);
    setWidgetExpanded(false);
  }, [callState, setWidgetOpen, setWidgetExpanded]);

  const handleOpenFullPage = useCallback(() => {
    const params = new URLSearchParams();
    if (linkedIntakeId) params.set("intakeId", String(linkedIntakeId));
    navigate(`/softphone${params.toString() ? "?" + params.toString() : ""}`);
    setWidgetExpanded(false);
  }, [navigate, linkedIntakeId, setWidgetExpanded]);

  const isOnCall = callState === "active" || callState === "ringing" || callState === "incoming";

  // ── Dock bar ──────────────────────────────────────────────────────────────

  const dockBar = (
    <div
      className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
      onClick={handleToggleExpand}
    >
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${callStateColor(callState)}`} />
      <div className="flex-shrink-0">
        {callState === "incoming" ? (
          <PhoneIncoming className="w-4 h-4 text-blue-400" />
        ) : callState === "ringing" ? (
          <PhoneOutgoing className="w-4 h-4 text-yellow-400" />
        ) : callState === "active" ? (
          <Phone className="w-4 h-4 text-green-400" />
        ) : (
          <Phone className="w-4 h-4 text-gray-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-white truncate">
            {isOnCall && activeCallInfo
              ? activeCallInfo.name || activeCallInfo.number
              : callState === "wrap_up"
              ? "Wrap-Up Required"
              : "Aircall Softphone"}
          </span>
          {isOnCall && (
            <span className="text-xs text-gray-300 flex-shrink-0">
              {formatDuration(callDuration)}
            </span>
          )}
        </div>
        <div className="text-[10px] text-gray-400">
          {callStateLabel(callState)}
          {sdkReady ? "" : " · Not connected"}
        </div>
      </div>
      {isOnCall && (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            className={`p-1 rounded ${muted ? "text-red-400" : "text-gray-300 hover:text-white"}`}
            title={muted ? "Unmute" : "Mute"}
            onClick={() => setMuted((m) => !m)}
          >
            {muted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
          </button>
          <button
            className={`p-1 rounded ${onHold ? "text-yellow-400" : "text-gray-300 hover:text-white"}`}
            title={onHold ? "Resume" : "Hold"}
            onClick={() => setOnHold((h) => !h)}
          >
            {onHold ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}
      <button className="text-gray-400 hover:text-white flex-shrink-0" onClick={(e) => { e.stopPropagation(); handleToggleExpand(); }}>
        {widgetExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
      </button>
      {callState === "idle" && (
        <button
          className="text-gray-500 hover:text-white flex-shrink-0"
          onClick={(e) => { e.stopPropagation(); handleClose(); }}
          title="Close softphone"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );

  // ── Expanded panel content ────────────────────────────────────────────────

  const expandedContent = widgetExpanded && (
    <div className="border-t border-white/10">
      {callState === "wrap_up" && showDisposition && (
        <div className="p-3 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-orange-300">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Call Wrap-Up — {wrapUpCallInfo?.name || wrapUpCallInfo?.number || "Unknown"}
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-gray-300">Disposition *</Label>
            <Select value={selectedDisposition ?? ""} onValueChange={setSelectedDisposition}>
              <SelectTrigger className="h-8 text-xs bg-white/10 border-white/20 text-white">
                <SelectValue placeholder="Select disposition…" />
              </SelectTrigger>
              <SelectContent>
                {DISPOSITION_GROUPS.map((g) => (
                  <div key={g.group}>
                    <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                      {g.group}
                    </div>
                    {g.items.map((item) => (
                      <SelectItem key={item.value} value={item.value} className="text-xs">
                        {item.label}
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-gray-300">Notes</Label>
            <Textarea
              value={dispositionNote}
              onChange={(e) => setDispositionNote(e.target.value)}
              placeholder="Optional call notes…"
              className="text-xs h-16 resize-none bg-white/10 border-white/20 text-white placeholder:text-gray-500"
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 h-7 text-xs bg-[#ff6221] hover:bg-[#e55510] text-white"
              disabled={!selectedDisposition}
              onClick={handleSaveDisposition}
            >
              Save & Close
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-gray-400 hover:text-white"
              onClick={handleSkipDisposition}
            >
              Skip
            </Button>
          </div>
        </div>
      )}

      {callState !== "wrap_up" && (
        <div className="p-2">
          <div className="text-[10px] text-gray-400 mb-1 flex items-center gap-1">
            {sdkReady
              ? <><Wifi className="w-3 h-3 text-green-400" /> Connected</>
              : <><WifiOff className="w-3 h-3 text-red-400" /> {sdkError || "Not connected — log in below"}</>
            }
          </div>
          <div className="text-[11px] text-gray-300 text-center py-2">
            The Aircall phone is active in the background.
          </div>
          <Button
            size="sm"
            className="w-full h-7 text-xs bg-white/10 hover:bg-white/20 text-white border border-white/20"
            onClick={handleOpenFullPage}
          >
            <ExternalLink className="w-3 h-3 mr-1" /> Open Full Softphone
          </Button>
        </div>
      )}
    </div>
  );

  // Don't render the floating widget UI when on the softphone page
  // (the page renders the full dial pad directly via the repositioned container)
  if (isOnSoftphonePage) return null;

  return (
    <>
      {/* ── Floating widget shell ─────────────────────────────────────────── */}
      {widgetOpen && (
        <div
          style={{
            position: "fixed",
            bottom: "16px",
            right: "16px",
            width: "340px",
            zIndex: 9999,
            borderRadius: "12px",
            background: "linear-gradient(135deg, #171b31 0%, #1e2340 100%)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08)",
            overflow: "hidden",
          }}
        >
          {dockBar}
          {expandedContent}
        </div>
      )}

      {/* ── Collapsed launcher button ─────────────────────────────────────── */}
      {!widgetOpen && (
        <button
          onClick={() => setWidgetOpen(true)}
          style={{
            position: "fixed",
            bottom: "16px",
            right: "16px",
            zIndex: 9999,
            width: "48px",
            height: "48px",
            borderRadius: "50%",
            background: callState !== "idle" ? "#ff6221" : "#171b31",
            border: "2px solid rgba(255,255,255,0.15)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
          title="Open Softphone"
        >
          {callState === "incoming" ? (
            <PhoneIncoming className="w-5 h-5 text-white animate-bounce" />
          ) : (
            <Phone className="w-5 h-5 text-white" />
          )}
          {callState !== "idle" && (
            <span
              style={{
                position: "absolute",
                top: "2px",
                right: "2px",
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                background: callState === "active" ? "#22c55e" : "#facc15",
                border: "2px solid #171b31",
              }}
            />
          )}
        </button>
      )}
    </>
  );
}
