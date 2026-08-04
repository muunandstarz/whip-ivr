import { useEffect, useRef, useState, useCallback } from "react";
import { Scale } from "lucide-react";

/**
 * PolicyLookupTooltip
 *
 * When an agent highlights text anywhere inside a container that has
 * data-policy-lookup="true", a small floating tooltip appears offering
 * "Look up policy". Clicking it navigates to /kb/knowledge?tab=policy&scenario=<selected>
 * which pre-fills the Policy & Terms Lookup scenario field.
 *
 * Usage: wrap a claim-notes element with <PolicyLookupZone>…</PolicyLookupZone>
 */

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  text: string;
}

export function PolicyLookupZone({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div data-policy-lookup="true" className={className}>
      {children}
    </div>
  );
}

export function PolicyLookupTooltip() {
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0, text: "" });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    setTooltip(prev => ({ ...prev, visible: false }));
  }, []);

  useEffect(() => {
    function onSelectionChange() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        // Delay hide so click on tooltip registers first
        hideTimeout.current = setTimeout(hide, 200);
        return;
      }

      const selectedText = sel.toString().trim();
      if (selectedText.length < 3) {
        hideTimeout.current = setTimeout(hide, 200);
        return;
      }

      // Check if selection is inside a policy-lookup zone
      const range = sel.getRangeAt(0);
      const container = range.commonAncestorContainer;
      const el = container.nodeType === Node.TEXT_NODE ? container.parentElement : container as Element;
      const zone = el?.closest('[data-policy-lookup="true"]');
      if (!zone) {
        hideTimeout.current = setTimeout(hide, 200);
        return;
      }

      // Cancel any pending hide
      if (hideTimeout.current) clearTimeout(hideTimeout.current);

      // Position tooltip above the selection
      const rect = range.getBoundingClientRect();
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;

      setTooltip({
        visible: true,
        x: rect.left + scrollX + rect.width / 2,
        y: rect.top + scrollY - 8,
        text: selectedText,
      });
    }

    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
    };
  }, [hide]);

  // Hide on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        hide();
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [hide]);

  if (!tooltip.visible) return null;

  const handleLookup = () => {
    const encoded = encodeURIComponent(tooltip.text.slice(0, 500));
    window.location.href = `/kb/knowledge?tab=policy&scenario=${encoded}`;
    hide();
  };

  return (
    <div
      ref={tooltipRef}
      onMouseDown={e => e.preventDefault()} // prevent selection loss
      style={{
        position: "absolute",
        left: tooltip.x,
        top: tooltip.y,
        transform: "translate(-50%, -100%)",
        zIndex: 9999,
        pointerEvents: "auto",
      }}
      className="animate-in fade-in zoom-in-95 duration-150"
    >
      <button
        onClick={handleLookup}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg shadow-lg border border-border bg-popover text-popover-foreground text-xs font-medium hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors whitespace-nowrap"
        style={{ transformOrigin: "bottom center" }}
      >
        <Scale className="h-3 w-3 shrink-0" />
        Look up policy
      </button>
      {/* Arrow */}
      <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0"
        style={{ borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "5px solid var(--border)" }} />
    </div>
  );
}
