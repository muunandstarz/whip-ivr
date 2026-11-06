/** Request identity only: final receipt numbers are always allocated by the server. */
export function createReceiptRequestKey(source: Pick<Crypto, "randomUUID" | "getRandomValues"> = globalThis.crypto): string {
  if (typeof source?.randomUUID === "function") return source.randomUUID();
  if (typeof source?.getRandomValues !== "function") throw new Error("This browser cannot create a secure receipt request. Open the dashboard in an up-to-date browser over HTTPS.");
  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Attaching the link before clicking also supports browsers that reject detached links. */
export function downloadReceipt(url: string, name: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.hidden = true;
  document.body.appendChild(link);
  try { link.click(); } finally { link.remove(); }
}
