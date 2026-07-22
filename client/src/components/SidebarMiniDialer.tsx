/**
 * SidebarMiniDialer
 *
 * A compact, collapsible dialer widget embedded in the sidebar.
 * Uses the global SoftphoneContext to initiate calls via Aircall SDK.
 */
import { useState, useCallback } from "react";
import { Phone, ChevronDown, ChevronUp, Delete, PhoneOff } from "lucide-react";
import { useSoftphone } from "@/contexts/SoftphoneContext";
import { useLocation } from "wouter";

const DIAL_KEYS = [
  ["1", ""],
  ["2", "ABC"],
  ["3", "DEF"],
  ["4", "GHI"],
  ["5", "JKL"],
  ["6", "MNO"],
  ["7", "PQRS"],
  ["8", "TUV"],
  ["9", "WXYZ"],
  ["*", ""],
  ["0", "+"],
  ["#", ""],
] as const;

export default function SidebarMiniDialer() {
  const [expanded, setExpanded] = useState(false);
  const [number, setNumber] = useState("");
  const { handleClickToCall, callState, sdkReady, activeCallInfo } = useSoftphone();
  const [, navigate] = useLocation();

  const handleKey = useCallback((key: string) => {
    setNumber((prev) => (prev.length < 20 ? prev + key : prev));
  }, []);

  const handleBackspace = useCallback(() => {
    setNumber((prev) => prev.slice(0, -1));
  }, []);

  const handleCall = useCallback(() => {
    if (!number.trim()) return;
    handleClickToCall(number.trim());
    // Navigate to softphone page so user can see the full call UI
    navigate(`/softphone?phone=${encodeURIComponent(number.trim())}&autoCall=1`);
  }, [number, handleClickToCall, navigate]);

  const isOnCall = callState === "active" || callState === "ringing" || callState === "incoming";

  return (
    <div className="mx-3 mb-2 rounded-lg overflow-hidden border border-white/10 bg-white/5">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-white/70 hover:text-white hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
            isOnCall ? "bg-green-400 animate-pulse" : sdkReady ? "bg-green-400/60" : "bg-white/20"
          }`} />
          <span className="text-xs font-medium">
            {isOnCall ? (activeCallInfo?.name || "On Call") : "Dialer"}
          </span>
        </div>
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5" />
        ) : (
          <ChevronUp className="w-3.5 h-3.5" />
        )}
      </button>

      {/* Expanded dialer */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {/* Number display */}
          <div className="flex items-center gap-1 bg-white/10 rounded-md px-2 py-1.5">
            <span className="flex-1 text-white text-sm font-mono tracking-widest min-h-[1.25rem]">
              {number || <span className="text-white/30 text-xs">Enter number</span>}
            </span>
            {number.length > 0 && (
              <button
                onClick={handleBackspace}
                className="text-white/40 hover:text-white/80 transition-colors p-0.5"
              >
                <Delete className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Dial pad */}
          <div className="grid grid-cols-3 gap-1">
            {DIAL_KEYS.map(([key, sub]) => (
              <button
                key={key}
                onClick={() => handleKey(key)}
                className="flex flex-col items-center justify-center py-1.5 rounded-md bg-white/8 hover:bg-white/15 active:bg-white/20 transition-colors"
              >
                <span className="text-white text-sm font-medium leading-none">{key}</span>
                {sub && <span className="text-white/30 text-[8px] leading-none mt-0.5">{sub}</span>}
              </button>
            ))}
          </div>

          {/* Call button */}
          <button
            onClick={handleCall}
            disabled={!number.trim() || isOnCall}
            className={`w-full flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${
              !number.trim() || isOnCall
                ? "bg-white/10 text-white/30 cursor-not-allowed"
                : "bg-green-500 hover:bg-green-400 text-white shadow-lg shadow-green-500/20"
            }`}
          >
            {isOnCall ? (
              <>
                <PhoneOff className="w-3.5 h-3.5" />
                On Call
              </>
            ) : (
              <>
                <Phone className="w-3.5 h-3.5" />
                Call
              </>
            )}
          </button>

          {!sdkReady && (
            <p className="text-white/30 text-[10px] text-center">
              Softphone not connected
            </p>
          )}
        </div>
      )}
    </div>
  );
}
