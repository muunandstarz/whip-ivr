// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createReceiptRequestKey, downloadReceipt } from "./receiptBrowser";

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });

describe("receipt browser compatibility", () => {
  it("uses native UUID support when present", () => {
    const uuid = "a41e674d-3dc5-479f-aa1a-e83ed51d63e2";
    expect(createReceiptRequestKey({ randomUUID: () => uuid } as Crypto)).toBe(uuid);
  });
  it("creates schema-valid secure v4 retry keys without randomUUID", () => {
    const keys = new Set<string>();
    const fallback = { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) } as Crypto;
    for (let i = 0; i < 50; i++) {
      const key = createReceiptRequestKey(fallback);
      expect(z.string().uuid().safeParse(key).success).toBe(true);
      expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      keys.add(key);
    }
    expect(keys.size).toBe(50);
  });
  it("does not substitute insecure random IDs when browser cryptography is missing", () => {
    expect(() => createReceiptRequestKey({} as Crypto)).toThrow("secure receipt request");
  });
  it("attaches the download link before clicking and removes it afterward", () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function(this: HTMLAnchorElement) {
      expect(this.isConnected).toBe(true);
      expect(this.download).toBe("Total_Recon_Payment_Receipt_00012345.pdf");
      expect(this.href).toBe("blob:https://example.com/sample");
    });
    downloadReceipt("blob:https://example.com/sample", "Total_Recon_Payment_Receipt_00012345.pdf");
    expect(click).toHaveBeenCalledOnce();
    expect(document.querySelector("a")).toBeNull();
  });
  it("cleans the link up even when browser delivery throws", () => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => { throw Error("Blocked download"); });
    expect(() => downloadReceipt("blob:test", "receipt.pdf")).toThrow("Blocked download");
    expect(document.querySelector("a")).toBeNull();
  });
});
