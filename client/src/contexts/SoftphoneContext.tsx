/**
 * SoftphoneContext
 *
 * Holds the Aircall SDK instance and all call state at the application root.
 * The SDK is initialized ONCE and never destroyed on navigation — this is the
 * key to persistent softphone behavior across the entire platform.
 *
 * The hidden phone container div is rendered inside FloatingSoftphone (in App.tsx)
 * and stays mounted for the lifetime of the app session.
 */
import React, {
  createContext, useContext, useRef, useState, useCallback, useEffect,
  type ReactNode,
} from "react";
// @ts-ignore — no types shipped with aircall-everywhere
import AircallPhone from "aircall-everywhere";

// ─── Types ───────────────────────────────────────────────────────────────────

export type CallState = "idle" | "ringing" | "active" | "incoming" | "wrap_up";

export interface ActiveCallInfo {
  name: string;
  number: string;
  callerType: string;
  direction: "inbound" | "outbound";
  aircallCallId?: number;
}

export interface SoftphoneContextValue {
  // SDK state
  sdkReady: boolean;
  sdkError: string | null;
  aircallRef: React.MutableRefObject<InstanceType<typeof AircallPhone> | null>;
  /** Attach this as a ref callback to the DOM container where Aircall injects its iframe */
  initAircall: (node: HTMLDivElement | null) => void;

  // Call state
  callState: CallState;
  activeCallInfo: ActiveCallInfo | null;
  wrapUpCallInfo: ActiveCallInfo | null;
  callDuration: number;
  lookupPhone: string | null;

  // Disposition / wrap-up
  selectedDisposition: string | null;
  setSelectedDisposition: (v: string | null) => void;
  dispositionNote: string;
  setDispositionNote: (v: string) => void;
  savedDispositions: Array<{ callId: number; disposition: string; note: string; name: string }>;
  handleSaveDisposition: () => void;
  handleSkipDisposition: () => void;

  // Script
  scriptCallerType: string;
  setScriptCallerType: (v: string) => void;

  // Actions
  handleClickToCall: (phone: string) => void;

  // Widget UI state (open/collapsed)
  widgetOpen: boolean;
  setWidgetOpen: (v: boolean) => void;
  widgetExpanded: boolean;
  setWidgetExpanded: React.Dispatch<React.SetStateAction<boolean>>;

  // Linked intake (set from softphone page URL params)
  linkedIntakeId: number | null;
  setLinkedIntakeId: (id: number | null) => void;
  linkedIntakeName: string | null;
  setLinkedIntakeName: (name: string | null) => void;
  linkedIntakePhone: string | null;
  setLinkedIntakePhone: (phone: string | null) => void;
  autoDialPending: string | null;
  setAutoDialPending: (phone: string | null) => void;
}

const SoftphoneContext = createContext<SoftphoneContextValue | null>(null);

export function useSoftphone(): SoftphoneContextValue {
  const ctx = useContext(SoftphoneContext);
  if (!ctx) throw new Error("useSoftphone must be used inside SoftphoneProvider");
  return ctx;
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function SoftphoneProvider({ children }: { children: ReactNode }) {
  // SDK refs
  const aircallRef = useRef<InstanceType<typeof AircallPhone> | null>(null);
  const containerIdRef = useRef<string>("aircall-global-phone-container");
  const autoDialFiredRef = useRef(false);

  // SDK state
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState<string | null>(null);

  // Call state
  const [callState, setCallState] = useState<CallState>("idle");
  const [activeCallInfo, setActiveCallInfo] = useState<ActiveCallInfo | null>(null);
  const [wrapUpCallInfo, setWrapUpCallInfo] = useState<ActiveCallInfo | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [lookupPhone, setLookupPhone] = useState<string | null>(null);

  // Disposition
  const [selectedDisposition, setSelectedDisposition] = useState<string | null>(null);
  const [dispositionNote, setDispositionNote] = useState("");
  const [savedDispositions, setSavedDispositions] = useState<Array<{ callId: number; disposition: string; note: string; name: string }>>([]);

  // Script
  const [scriptCallerType, setScriptCallerType] = useState("unknown");

  // Widget UI
  const [widgetOpen, setWidgetOpen] = useState(false);
  const [widgetExpanded, setWidgetExpanded] = useState(false);

  // Linked intake
  const [linkedIntakeId, setLinkedIntakeId] = useState<number | null>(null);
  const [linkedIntakeName, setLinkedIntakeName] = useState<string | null>(null);
  const [linkedIntakePhone, setLinkedIntakePhone] = useState<string | null>(null);
  const [autoDialPending, setAutoDialPending] = useState<string | null>(null);

  // ── Timer helpers ──
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

  useEffect(() => () => stopTimer(), [stopTimer]);

  // ── Aircall SDK initialization ──
  // Called imperatively by FloatingSoftphone once the persistent body-level
  // container is created. The container is never removed from the DOM, so this
  // only fires once per session.
  const initAircall = useCallback((node: HTMLDivElement | null) => {
    if (!node) return; // Container is never unmounted — ignore null calls
    if (aircallRef.current) return; // Already initialized

    const containerId = containerIdRef.current;
    node.id = containerId;

    try {
      const phone = new AircallPhone({
        domToLoadWorkspace: `#${containerId}`,
        size: "auto",
        onLogin: () => {
          setSdkReady(true);
          setSdkError(null);
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
        // Auto-open the widget on incoming call
        setWidgetOpen(true);
      });

      // ── Call answered (inbound) ──
      phone.on("call_answered", () => {
        setCallState("active");
        startTimer();
      });

      // ── Outbound call initiated ──
      phone.on("outgoing_call", (callData: { call_id: number; to: string; from: string }) => {
        const rawPhone = callData.to || "";
        setActiveCallInfo((prev) => ({
          name: prev?.name || rawPhone,
          number: rawPhone,
          callerType: prev?.callerType || "unknown",
          direction: "outbound",
          aircallCallId: callData.call_id,
        }));
        setCallState("ringing");
        setWidgetOpen(true);
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
        setWrapUpCallInfo((prev) => prev ?? activeCallInfo);
        setCallState("wrap_up");
        setSelectedDisposition(null);
        setDispositionNote("");
        setLookupPhone(null);
      });

      // ── SDK ready — fire auto-dial if pending ──
      phone.on("ready", () => {
        setAutoDialPending((pending) => {
          if (pending && !autoDialFiredRef.current) {
            autoDialFiredRef.current = true;
            const digits = pending.replace(/\D/g, "");
            phone.send("dial_number", { phone_number: digits }, () => {});
          }
          return null;
        });
      });

      aircallRef.current = phone;
    } catch (err) {
      setSdkError("Failed to initialize Aircall phone. Please refresh.");
    }
  }, [startTimer, stopTimer]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-dial when SDK becomes ready and a pending dial exists ──
  useEffect(() => {
    if (sdkReady && autoDialPending && !autoDialFiredRef.current && aircallRef.current) {
      autoDialFiredRef.current = true;
      const digits = autoDialPending.replace(/\D/g, "");
      aircallRef.current.send("dial_number", { phone_number: digits }, () => {});
      setAutoDialPending(null);
    }
  }, [sdkReady, autoDialPending]);

  // Reset auto-dial flag when a new intake is linked
  useEffect(() => {
    autoDialFiredRef.current = false;
  }, [linkedIntakeId]);

  // ── Actions ──
  const handleClickToCall = useCallback((phone: string) => {
    if (!aircallRef.current || !sdkReady) {
      // Queue it for when the SDK is ready
      setAutoDialPending(phone);
      setWidgetOpen(true);
      return;
    }
    const digits = phone.replace(/\D/g, "");
    aircallRef.current.send("dial_number", { phone_number: digits }, () => {});
    setWidgetOpen(true);
  }, [sdkReady]);

  const handleSaveDisposition = useCallback(() => {
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
  }, [selectedDisposition, dispositionNote, wrapUpCallInfo]);

  const handleSkipDisposition = useCallback(() => {
    setCallState("idle");
    setCallDuration(0);
    setWrapUpCallInfo(null);
    setActiveCallInfo(null);
    setLookupPhone(null);
  }, []);

  const value: SoftphoneContextValue = {
    sdkReady, sdkError, aircallRef, initAircall,
    callState, activeCallInfo, wrapUpCallInfo, callDuration, lookupPhone,
    selectedDisposition, setSelectedDisposition, dispositionNote, setDispositionNote,
    savedDispositions, handleSaveDisposition, handleSkipDisposition,
    scriptCallerType, setScriptCallerType,
    handleClickToCall,
    widgetOpen, setWidgetOpen, widgetExpanded, setWidgetExpanded,
    linkedIntakeId, setLinkedIntakeId,
    linkedIntakeName, setLinkedIntakeName,
    linkedIntakePhone, setLinkedIntakePhone,
    autoDialPending, setAutoDialPending,
  };

  return (
    <SoftphoneContext.Provider value={value}>
      {children}
    </SoftphoneContext.Provider>
  );
}
