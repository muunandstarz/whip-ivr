import { useId, type CSSProperties } from "react";
import { Fuel } from "lucide-react";
import { FUEL_LEVELS } from "@shared/rentalHandoff";
import "./FuelGauge.css";

export type FuelLevel = (typeof FUEL_LEVELS)[number];
const readings: Record<FuelLevel, { percent: number; description: string }> = {
  Full: { percent: 100, description: "Full tank" },
  "3/4": { percent: 75, description: "Three-quarter tank" },
  "1/2": { percent: 50, description: "Half tank" },
  "1/4": { percent: 25, description: "Quarter tank" },
  Empty: { percent: 0, description: "Empty tank" },
};

/** Native radios provide Tab, arrow-key and Space selection without a custom slider. */
export function FuelGauge({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: FuelLevel;
  onChange: (value: FuelLevel) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const reading = readings[value];
  return (
    <fieldset
      className="r-fuel-gauge"
      disabled={disabled}
      aria-describedby={`${id}-hint ${id}-reading`}
    >
      <legend>{label}</legend>
      <div className="r-fuel-display">
        <svg className="r-fuel-dial" viewBox="0 0 200 118" aria-hidden="true" focusable="false">
          <path className="r-fuel-track" d="M 20 94 A 80 80 0 0 1 180 94" />
          <g className="r-fuel-ticks">
            <path d="M 20 94 H 31 M 43 37 L 51 45 M 100 14 V 25 M 157 37 L 149 45 M 180 94 H 169" />
          </g>
          <g
            className="r-fuel-needle"
            style={{ "--fuel-angle": `${reading.percent * 1.8 - 180}deg` } as CSSProperties}
          >
            <path d="M 100 90 L 165 94 L 100 98 Z" />
          </g>
          <circle className="r-fuel-hub" cx="100" cy="94" r="7" />
          <text x="19" y="114">E</text>
          <text x="175" y="114">F</text>
        </svg>
        <div className="r-fuel-reading" id={`${id}-reading`} aria-live="polite" aria-atomic="true">
          <Fuel size={22} aria-hidden="true" />
          <strong>{value} <span>· {reading.percent}%</span></strong>
          <span>{reading.description}</span>
        </div>
      </div>
      <div className="r-fuel-options">
        {FUEL_LEVELS.map(level => (
          <label className="r-fuel-option" key={level} htmlFor={`${id}-${level}`}>
            <input
              id={`${id}-${level}`}
              type="radio"
              name={`fuel-${id}`}
              value={level}
              checked={value === level}
              disabled={disabled}
              onChange={() => { if (!disabled) onChange(level); }}
            />
            <span>{level}</span>
          </label>
        ))}
      </div>
      <small id={`${id}-hint`}>Match the dashboard reading. Use arrow keys to choose a fuel level.</small>
    </fieldset>
  );
}
