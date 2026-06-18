/**
 * FloatingSoftphone
 *
 * ARCHITECTURE — THE ONLY RELIABLE APPROACH:
 *
 * The Aircall iframe container is created ONCE, appended to <body>, and
 * NEVER moved, reparented, or resized to 0. DOM reparenting kills WebRTC.
 *
 * The container stays `position: fixed` in <body> forever.
 * CSS transitions change its size/position between two modes:
 *
 *   WIDGET MODE (all pages except /softphone):
 *     - Bottom-right corner, 340×500px, opacity:0 (hidden) or opacity:1 (expanded)
 *
 *   PAGE MODE (/softphone):
 *     - Left column of the softphone page, 376×666px, opacity:1
 *     - The page renders a matching placeholder div so the layout doesn't shift
 *
 * The floating widget overlay (dock bar, disposition panel, call info) is a
 * SEPARATE React component rendered on top via z-index. It never touches the
 * Aircall container directly.
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

// ─── Aircall Container Manager ────────────────────────────────────────────────
// This hook creates the container once and updates its CSS position/size
// based on mode. The container NEVER moves between DOM parents.

function useAircallContainer(isOnSoftphonePage: boolean, widgetVisible: boolean) {
  const { initAircall } = useSoftphone();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const initializedRef = useRef(false);

  // Create the container once on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    let container = document.getElementById("aircall-global-phone-container") as HTMLDivElement | null;
    if (!container) {
      container = document.createElement("div");
      container.id = "aircall-global-phone-container";
      // Start hidden in widget position
      Object.assign(container.style, {
        position: "fixed",
        bottom: "80px",
        right: "16px",
        width: "340px",
        height: "500px",
        zIndex: "9995",
        borderRadius: "12px",
        overflow: "hidden",
        opacity: "0",
        pointerEvents: "none",
        transition: "opacity 0.2s ease, width 0.3s ease, height 0.3s ease, bottom 0.3s ease, right 0.3s ease, border-radius 0.3s ease",
      });
      document.body.appendChild(container);
    }
    containerRef.current = container;

    // Pre-request microphone for optimal audio quality
    if (navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      }).then((stream) => {
        stream.getTracks().forEach((t) => t.stop());
      }).catch(() => {});
    }

    // Initialize the Aircall SDK into this container
    initAircall(container);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update container CSS when mode changes — NO DOM reparenting
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Helper to snap container onto the page slot
    function snapToSlot() {
      if (!container) return;
      const slot = document.getElementById("aircall-phone-page-slot");
      if (!slot) return;
      const rect = slot.getBoundingClientRect();
      Object.assign(container.style, {
        bottom: "auto",
        right: "auto",
        top: `${rect.top}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        borderRadius: "0 0 12px 12px",
        opacity: "1",
        pointerEvents: "auto",
        zIndex: "9995",
      });
    }

    if (isOnSoftphonePage) {
      // PAGE MODE: overlay the page slot, keep aligned on scroll/resize
      const slot = document.getElementById("aircall-phone-page-slot");
      if (slot) {
        snapToSlot();
      } else {
        // Slot not in DOM yet — retry after paint
        requestAnimationFrame(snapToSlot);
      }

      // Keep aligned when user scrolls or window resizes
      // Note: WhipLayout uses overflow-auto on <main>, so scroll events fire on
      // that element, not on window. We listen to both to be safe.
      window.addEventListener("scroll", snapToSlot, { passive: true });
      window.addEventListener("resize", snapToSlot, { passive: true });

      // Also attach to the layout's main scroll container
      const mainEl = document.querySelector("main.flex-1") as HTMLElement | null;
      if (mainEl) {
        mainEl.addEventListener("scroll", snapToSlot, { passive: true });
      }

      // Also observe the slot itself for layout changes
      let ro: ResizeObserver | null = null;
      const slotEl = document.getElementById("aircall-phone-page-slot");
      if (slotEl && typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(snapToSlot);
        ro.observe(slotEl);
      }

      return () => {
        window.removeEventListener("scroll", snapToSlot);
        window.removeEventListener("resize", snapToSlot);
        if (mainEl) mainEl.removeEventListener("scroll", snapToSlot);
        ro?.disconnect();
      };
    } else {
      // WIDGET MODE: Aircall container stacks directly ABOVE the widget header bar.
      // Widget header is at bottom:16px, height ~44px.
      // Container sits at bottom: 16+44=60px so it appears above the header.
      Object.assign(container.style, {
        top: "auto",
        bottom: "60px",
        right: "16px",
        left: "auto",
        width: "356px",
        height: "500px",
        borderRadius: "12px 12px 0 0",
        opacity: widgetVisible ? "1" : "0",
        pointerEvents: widgetVisible ? "auto" : "none",
        zIndex: "9995",
      });
    }
  }, [isOnSoftphonePage, widgetVisible]);

  return containerRef;
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
  const isOnSoftphonePage = location.startsWith("/softphone");

  // widgetVisible = the Aircall iframe is shown in widget mode.
  // CRITICAL: during an active/ringing/incoming call, ALWAYS keep the iframe
  // visible even if the user minimizes the widget. Hiding the iframe while a
  // WebRTC call is active causes Aircall SDK to drop the call.
  const callIsLive = callState === "active" || callState === "ringing" || callState === "incoming";
  const widgetVisible = !isOnSoftphonePage && widgetOpen && (widgetExpanded || callIsLive);

  // Manage the persistent container (never reparented)
  useAircallContainer(isOnSoftphonePage, widgetVisible);

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
    // During an active call, collapsing would hide the iframe and drop the call.
    // Instead, just collapse the overlay UI — the iframe stays visible.
    setWidgetExpanded((v: boolean) => !v);
  }, [setWidgetExpanded]);

  const handleClose = useCallback(() => {
    if (callState !== "idle" && callState !== "wrap_up") {
      toast.warning("You're on a call — the softphone stays active in the background.");
      return;
    }
    setWidgetOpen(false);
    setWidgetExpanded(false);
    setShowDisposition(false);
  }, [callState, setWidgetOpen, setWidgetExpanded]);

  const handleOpenFullPage = useCallback(() => {
    navigate("/softphone");
  }, [navigate]);

  const handleMute = useCallback(() => {
    setMuted((v) => !v);
    toast.info(muted ? "Unmuted" : "Muted");
  }, [muted]);

  const handleHold = useCallback(() => {
    setOnHold((v) => !v);
    toast.info(onHold ? "Resumed" : "Call on hold");
  }, [onHold]);

  // ── Floating widget launcher button (shown when widget is closed) ──
  const showLauncher = !isOnSoftphonePage && widgetOpen === false;
  const showDockBar = !isOnSoftphonePage && widgetOpen === true;

  // ── Disposition panel content ──
  const DispositionPanel = (
    <div className="p-3 space-y-2">
      <div className="text-xs font-semibold text-orange-300 uppercase tracking-wide">
        Wrap-Up — {wrapUpCallInfo?.name || activeCallInfo?.name || "Unknown Caller"}
      </div>
      <div>
        <Label className="text-[10px] text-gray-400 mb-1 block">Disposition</Label>
        <Select value={selectedDisposition ?? ""} onValueChange={setSelectedDisposition}>
          <SelectTrigger className="h-7 text-xs bg-white/10 border-white/20 text-white">
            <SelectValue placeholder="Select outcome…" />
          </SelectTrigger>
          <SelectContent>
            {DISPOSITION_GROUPS.map((g) => (
              <div key={g.group}>
                <div className="px-2 py-1 text-[10px] font-semibold text-gray-400 uppercase">{g.group}</div>
                {g.items.map((item) => (
                  <SelectItem key={item.value} value={item.value} className="text-xs">{item.label}</SelectItem>
                ))}
              </div>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-[10px] text-gray-400 mb-1 block">Notes</Label>
        <Textarea
          value={dispositionNote}
          onChange={(e) => setDispositionNote(e.target.value)}
          placeholder="Optional call notes…"
          className="h-16 text-xs bg-white/10 border-white/20 text-white placeholder:text-gray-500 resize-none"
        />
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!selectedDisposition}
          onClick={() => { handleSaveDisposition(); setShowDisposition(false); }}
          className="flex-1 h-7 text-xs bg-orange-500 hover:bg-orange-600 text-white"
        >
          <CheckCircle2 className="w-3 h-3 mr-1" /> Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => { handleSkipDisposition(); setShowDisposition(false); }}
          className="h-7 text-xs text-gray-400 hover:text-white"
        >
          Skip
        </Button>
      </div>
    </div>
  );

  // ── Expanded widget content (dial pad spacer + call controls) ──
  const ExpandedContent = (
    <div className="flex flex-col">
      {/* Call controls when active */}
      {(callState === "active" || callState === "ringing" || callState === "incoming") && (
        <div className="px-3 pb-2 flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleMute}
            className={`flex-1 h-7 text-xs ${muted ? "bg-red-500/20 text-red-300" : "text-gray-300 hover:text-white"}`}
          >
            {muted ? <MicOff className="w-3 h-3 mr-1" /> : <Mic className="w-3 h-3 mr-1" />}
            {muted ? "Unmute" : "Mute"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleHold}
            className={`flex-1 h-7 text-xs ${onHold ? "bg-yellow-500/20 text-yellow-300" : "text-gray-300 hover:text-white"}`}
          >
            {onHold ? <Play className="w-3 h-3 mr-1" /> : <Pause className="w-3 h-3 mr-1" />}
            {onHold ? "Resume" : "Hold"}
          </Button>
        </div>
      )}

      {/* Status line */}
      <div className="px-3 pb-2">
        <div className="text-[10px] text-gray-400 flex items-center gap-1">
          {sdkReady
            ? <><Wifi className="w-3 h-3 text-green-400" /> Connected</>
            : <><WifiOff className="w-3 h-3 text-red-400" /> {sdkError || "Not connected — log in below"}</>
          }
        </div>
      </div>

      {/* The Aircall iframe sits ABOVE the header bar (bottom:60px), so no spacer needed */}
    </div>
  );

  return (
    <>
      {/* ── Launcher button (when widget is fully closed) ── */}
      {showLauncher && (
        <button
          onClick={() => { setWidgetOpen(true); setWidgetExpanded(true); }}
          className="fixed bottom-6 right-6 z-[9999] w-14 h-14 rounded-full bg-[#171b31] border-2 border-[#ff6221] shadow-lg flex items-center justify-center hover:scale-110 transition-transform"
          title="Open Softphone"
        >
          <Phone className="w-6 h-6 text-[#ff6221]" />
          {(callState === "active" || callState === "ringing" || callState === "incoming") && (
            <span className="absolute top-0 right-0 w-4 h-4 rounded-full bg-green-500 border-2 border-white animate-pulse" />
          )}
        </button>
      )}

      {/* ── Dock bar + expanded panel (when widget is open) ── */}
      {showDockBar && (
        <>
          {/* Disposition panel — rendered as a SEPARATE fixed overlay above the iframe.
              z-[10001] so it sits above the Aircall container (z-9995) AND the header (z-[10000]).
              Only shown during wrap_up. Does NOT collapse the iframe. */}
          {showDisposition && callState === "wrap_up" && (
            <div
              className="fixed z-[10001] border border-white/10 rounded-2xl shadow-2xl overflow-hidden bg-[#171b31]"
              style={{
                bottom: "60px",
                right: "16px",
                width: "356px",
              }}
            >
              {DispositionPanel}
            </div>
          )}

          {/* Header dock bar — always visible when widget is open */}
          <div
            className="fixed z-[10000] border border-white/10 rounded-2xl shadow-2xl bg-[#0f1220]"
            style={{
              bottom: "16px",
              right: "16px",
              width: "356px",
            }}
          >
            <div className="flex items-center gap-2 px-3 py-2">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${callStateColor(callState)}`} />
              <span className="text-xs font-semibold text-white flex-1 truncate">
                {callState !== "idle"
                  ? `${callStateLabel(callState)} — ${activeCallInfo?.name || activeCallInfo?.number || "Unknown"}`
                  : "Aircall Softphone"
                }
              </span>
              {callState === "active" && (
                <span className="text-[10px] text-green-400 font-mono">{formatDuration(callDuration)}</span>
              )}
              {linkedIntakeId && callState !== "idle" && (
                <button
                  onClick={() => navigate(`/intake/${linkedIntakeId}`)}
                  className="text-[10px] text-orange-400 hover:text-orange-300 underline"
                  title="View linked intake"
                >
                  #{linkedIntakeId}
                </button>
              )}
              {/* During an active call, minimize hides the iframe overlay but keeps audio alive.
                  The iframe stays visible (widgetVisible stays true via callIsLive guard). */}
              <button
                onClick={handleToggleExpand}
                className="text-gray-400 hover:text-white p-0.5"
                title={widgetExpanded ? "Minimize" : "Expand"}
              >
                {widgetExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </button>
              <button onClick={handleOpenFullPage} className="text-gray-400 hover:text-white p-0.5" title="Open full softphone">
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
              <button onClick={handleClose} className="text-gray-400 hover:text-white p-0.5" title="Close softphone">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Expanded call controls (mute/hold) — only shown when expanded and on a live call */}
            {widgetExpanded && !showDisposition && ExpandedContent}
          </div>
        </>
      )}
    </>
  );
}
