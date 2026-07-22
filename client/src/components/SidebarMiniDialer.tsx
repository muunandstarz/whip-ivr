/**
 * SidebarMiniDialer
 *
 * Compact sidebar dialer. Pressing Call dials immediately via the Aircall SDK.
 * The floating softphone widget does NOT open during the call — it only appears
 * at wrap-up so the handler can log a disposition.
 */
import { useState, useCallback } from "react";
import { Phone, ChevronDown, ChevronUp, Delete, PhoneOff } from "lucide-react";
import { useSoftphone } from "@/contexts/SoftphoneContext";

const DIAL_KEYS = [
  ["1", ""],   ["2", "ABC"], ["3", "DEF"],
  ["4", "GHI"],["5", "JKL"], ["6", "MNO"],
  ["7", "PQRS"],["8", "TUV"],["9", "WXYZ"],
  ["*", ""],   ["0", "+"],   ["#", ""],
] as const;

export default function SidebarMiniDialer() {
  const [expanded, setExpanded] = useState(true);
  const [number, setNumber] = useState("");

  const {
    callState,
    sdkReady,
    activeCallInfo,
    aircallRef,
    sidebarDialRef,
    setAutoDialPending,
    // deliberately NOT calling setWidgetOpen here — widget stays hidden until wrap-up
  } = useSoftphone();

  const handleKey = useCallback((key: string) => {
    setNumber((prev) => (prev.length < 20 ? prev + key : prev));
  }, []);

  const handleBackspace = useCallback(() => {
    setNumber((prev) => prev.slice(0, -1));
  }, []);

  const handleCall = useCallback(() => {
    const trimmed = number.trim();
    if (!trimmed) return;

    const digits = trimmed.replace(/\D/g, "");

    if (sdkReady && aircallRef.current) {
      // Flag that this came from the sidebar — suppresses widget opening
      sidebarDialRef.current = true;
      aircallRef.current.send("dial_number", { phone_number: digits }, () => {});
    } else {
      // Queue for when SDK connects — widget still stays hidden
      sidebarDialRef.current = true;
      setAutoDialPending(trimmed);
    }

    setNumber("");
  }, [number, sdkReady, aircallRef, setAutoDialPending]);

  const isOnCall = callState === "active" || callState === "ringing" || callState === "incoming";

  return (
    <div className="mx-3 mb-2 rounded-lg overflow-hidden border border-white/10 bg-white/5">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-2.5 py-1.5 text-white/70 hover:text-white hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
            isOnCall ? "bg-green-400 animate-pulse" : sdkReady ? "bg-green-400/60" : "bg-white/20"
          }`} />
          <span className="text-[11px] font-medium">
            {isOnCall ? (activeCallInfo?.name || "On Call") : "Dialer"}
          </span>
        </div>
        {expanded
          ? <ChevronDown className="w-3 h-3" />
          : <ChevronUp className="w-3 h-3" />}
      </button>

      {expanded && (
        <div className="px-2.5 pb-2.5 space-y-1.5">
          {/* Number display */}
          <div className="flex items-center gap-1 bg-white/10 rounded px-2 py-1">
            <span className="flex-1 text-white text-xs font-mono tracking-widest min-h-[1rem]">
              {number || <span className="text-white/30 text-[10px]">Enter number…</span>}
            </span>
            {number.length > 0 && (
              <button
                onClick={handleBackspace}
                className="text-white/40 hover:text-white/80 transition-colors"
              >
                <Delete className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Dial pad — 3 columns, tight */}
          <div className="grid grid-cols-3 gap-0.5">
            {DIAL_KEYS.map(([key, sub]) => (
              <button
                key={key}
                onClick={() => handleKey(key)}
                className="flex flex-col items-center justify-center py-1 rounded bg-white/8 hover:bg-white/15 active:bg-white/20 transition-colors"
              >
                <span className="text-white text-xs font-medium leading-none">{key}</span>
                {sub && <span className="text-white/30 text-[7px] leading-none mt-0.5">{sub}</span>}
              </button>
            ))}
          </div>

          {/* Call button */}
          <button
            onClick={handleCall}
            disabled={!number.trim() || isOnCall}
            className={`w-full flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-medium transition-all ${
              !number.trim() || isOnCall
                ? "bg-white/10 text-white/30 cursor-not-allowed"
                : "bg-green-500 hover:bg-green-400 text-white"
            }`}
          >
            {isOnCall ? (
              <><PhoneOff className="w-3 h-3" /> On Call</>
            ) : (
              <><Phone className="w-3 h-3" /> Call</>
            )}
          </button>

          <p className={`text-[9px] text-center ${sdkReady ? "text-green-400/50" : "text-white/25"}`}>
            {sdkReady ? "Connected" : "Not connected"}
          </p>
        </div>
      )}
    </div>
  );
}
