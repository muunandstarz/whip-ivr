import { useState } from "react";
import { Info } from "lucide-react";

interface InfoTooltipProps {
  text: string;
  className?: string;
}

export function InfoTooltip({ text, className = "" }: InfoTooltipProps) {
  const [visible, setVisible] = useState(false);

  return (
    <span className={`relative inline-flex items-center ${className}`}>
      <button
        type="button"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        className="w-4 h-4 rounded-full text-gray-400 hover:text-gray-600 flex items-center justify-center focus:outline-none"
        aria-label="More information"
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      {visible && (
        <span
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 rounded-lg bg-primary text-white text-xs px-3 py-2 shadow-lg leading-relaxed pointer-events-none"
          role="tooltip"
        >
          {text}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#171b31]" />
        </span>
      )}
    </span>
  );
}
