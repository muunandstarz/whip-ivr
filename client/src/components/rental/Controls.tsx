import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { ExternalLink, Printer, Download } from "lucide-react";

export function Field({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const id = useId();
  return (
    <label className="r-field" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        {...props}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </label>
  );
}
export function Select({
  label,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <label className="r-field" htmlFor={id}>
      <span>{label}</span>
      <select id={id} {...props}>
        {children}
      </select>
    </label>
  );
}
export function Check({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="r-check">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span>{label}</span>
    </label>
  );
}
export function Note({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label className="r-field r-wide" htmlFor={id}>
      <span>{label}</span>
      <textarea
        id={id}
        rows={3}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
      />
    </label>
  );
}
export function Card({
  title,
  detail,
  children,
  className = "",
}: {
  title: string;
  detail?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`r-card ${className}`}>
      <div className="r-card-head">
        <h2>{title}</h2>
        {detail && <p>{detail}</p>}
      </div>
      <div className="r-card-body">{children}</div>
    </section>
  );
}
export function ErrorNotice({ message }: { message?: string | null }) {
  return message ? (
    <div className="r-error" role="alert">
      {message}
    </div>
  ) : null;
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="r-empty">
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function PacketLinks({ url }: { url: string }) {
  return (
    <div className="r-actions">
      <a
        className="r-button"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
      >
        <ExternalLink size={16} />
        View PDF
      </a>
      <a
        className="r-button"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Printer size={16} />
        Open to print
      </a>
      <a
        className="r-button"
        href={url}
        download
        target="_blank"
        rel="noopener noreferrer"
      >
        <Download size={16} />
        Download PDF
      </a>
    </div>
  );
}
export const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The request failed. Please try again.";
export const dateDisplay = (
  value: string | number | Date | null | undefined
) => (value ? new Date(value).toLocaleString() : "Not recorded");
export const money = (value: number) =>
  value.toLocaleString("en-US", { style: "currency", currency: "USD" });
export function localDateTime(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return adjusted.toISOString().slice(0, 16);
}
export const isoDateTime = (value: string) =>
  value ? new Date(value).toISOString() : "";
