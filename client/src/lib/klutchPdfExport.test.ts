// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  exportKlutchPdf,
  getKlutchCaptureSheets,
  installKlutchPdfBridge,
  isKlutchFrameMessage,
  isKlutchPdfFileName,
  prepareKlutchCaptureClone,
} from "./klutchPdfExport";

const renderer = vi.hoisted(() => ({
  capture: vi.fn(),
  constructor: vi.fn(),
  setProperties: vi.fn(),
  addPage: vi.fn(),
  addImage: vi.fn(),
  output: vi.fn(),
}));
vi.mock("html2canvas", () => ({ default: renderer.capture }));
vi.mock("jspdf", () => ({
  jsPDF: function (options: unknown) {
    renderer.constructor(options);
    return {
      setProperties: renderer.setProperties,
      addPage: renderer.addPage,
      addImage: renderer.addImage,
      output: renderer.output,
    };
  },
}));

let dispose: (() => void) | undefined;
let canvases: HTMLCanvasElement[];
let downloads: Array<{ connected: boolean; fileName: string; href: string }>;

beforeEach(() => {
  document.title = "Whip Knowledge Base";
  canvases = [];
  downloads = [];
  vi.clearAllMocks();
  renderer.capture.mockImplementation(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1632;
    canvas.height = 2112;
    vi.spyOn(canvas, "toDataURL").mockReturnValue("data:image/png;base64,test");
    canvases.push(canvas);
    return canvas;
  });
  renderer.output.mockImplementation(
    () => new Blob(["test PDF"], { type: "application/pdf" })
  );
  vi.spyOn(URL, "createObjectURL").mockReturnValue(
    "blob:https://example.com/klutch-test"
  );
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement
  ) {
    downloads.push({
      connected: this.isConnected,
      fileName: this.download,
      href: this.href,
    });
  });
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.replaceChildren();
});

function preparedDocument(pageCount = 2) {
  const doc = document.implementation.createHTMLDocument(
    "Prepared first-party document"
  );
  doc.body.innerHTML =
    '<div class="sheet" id="outside">Not a PDF page</div><div id="allroot" style="display:none;position:fixed;left:-30000px;width:816px"></div>';
  const root = doc.getElementById("allroot")!;
  for (let index = 0; index < pageCount; index++) {
    const sheet = doc.createElement("div");
    sheet.className = "sheet";
    sheet.style.cssText =
      "width:816px;height:1056px;transform:scale(.5);overflow:hidden";
    sheet.innerHTML = `Page ${index + 1}<footer style="position:absolute;bottom:24px">Footer ${index + 1}</footer><div class="pending">Pending</div><div class="error">Error notice</div>`;
    root.appendChild(sheet);
  }
  return doc;
}

function bridge() {
  const frame = document.createElement("iframe");
  // happy-dom does not create a browsing context for this detached test document.
  const post = vi.fn();
  Object.defineProperties(frame, {
    contentWindow: { value: { postMessage: post }, configurable: true },
    contentDocument: {
      value: document.implementation.createHTMLDocument("Frame"),
      configurable: true,
    },
  });
  dispose = installKlutchPdfBridge(frame);
  const send = (
    data: unknown,
    origin = window.location.origin,
    source: MessageEventSource | null = frame.contentWindow
  ) => {
    const event = new MessageEvent("message", { data, origin });
    Object.defineProperty(event, "source", { value: source });
    window.dispatchEvent(event);
  };
  return { frame, post, send };
}

describe("Klutch PDF filename and source validation", () => {
  it.each([
    "Klutch-Policy-ABC123.pdf",
    "Klutch-123.pdf",
    `Klutch-${"A".repeat(139)}.pdf`,
  ])("accepts exact safe filenames: %s", value => {
    expect(isKlutchPdfFileName(value)).toBe(true);
  });
  it.each([
    undefined,
    null,
    1,
    {},
    "",
    "Policy-1.pdf",
    "Klutch-.pdf",
    "Klutch-policy.PDF",
    "Klutch-policy.pdf.exe",
    "../Klutch-policy.pdf",
    "Klutch-path/file.pdf",
    "Klutch-policy\\file.pdf",
    "Klutch-policy name.pdf",
    "Klutch-policy_name.pdf",
    "https://example.com/Klutch-policy.pdf",
    "Klutch-<script>.pdf",
    "Klutch-policy.pdf\n",
    `Klutch-${"A".repeat(140)}.pdf`,
  ])("rejects unsafe or non-exact filenames: %s", value => {
    expect(isKlutchPdfFileName(value)).toBe(false);
  });
  it("requires both the exact source window and the exact non-opaque origin", () => {
    const { frame } = bridge();
    const origin = window.location.origin;
    expect(
      isKlutchFrameMessage(
        { source: frame.contentWindow, origin },
        frame,
        origin
      )
    ).toBe(true);
    expect(
      isKlutchFrameMessage({ source: window, origin }, frame, origin)
    ).toBe(false);
    expect(isKlutchFrameMessage({ source: null, origin }, frame, origin)).toBe(
      false
    );
    expect(
      isKlutchFrameMessage(
        { source: frame.contentWindow, origin: "https://evil.example" },
        frame,
        origin
      )
    ).toBe(false);
    expect(
      isKlutchFrameMessage(
        { source: frame.contentWindow, origin: "null" },
        frame,
        "null"
      )
    ).toBe(false);
    expect(
      isKlutchFrameMessage(
        { source: null, origin },
        { contentWindow: null },
        origin
      )
    ).toBe(false);
  });
});

describe("Klutch capture boundaries and clone geometry", () => {
  it("captures only sheets under the fixed allroot, never the preview or arbitrary roots", () => {
    const doc = preparedDocument();
    const sheets = getKlutchCaptureSheets(doc, "allroot");
    expect(sheets).toHaveLength(2);
    expect(sheets.every(sheet => sheet.parentElement?.id === "allroot")).toBe(
      true
    );
    expect(() => getKlutchCaptureSheets(doc, "outside")).toThrow(
      "must be allroot"
    );
    expect(() => getKlutchCaptureSheets(doc, "#allroot")).toThrow(
      "must be allroot"
    );
    expect(() =>
      getKlutchCaptureSheets(preparedDocument(0), "allroot")
    ).toThrow("has no pages");
    doc.getElementById("allroot")!.remove();
    expect(() => getKlutchCaptureSheets(doc, "allroot")).toThrow("unavailable");
  });
  it("normalizes only the clone, removing scaling and offscreen placement without clipping footers or hiding notices", async () => {
    const live = preparedDocument();
    const clone = document.implementation.createHTMLDocument("Clone");
    clone.body.innerHTML = live.body.innerHTML;
    await prepareKlutchCaptureClone(clone);
    const root = clone.getElementById("allroot")!;
    expect(root.style.display).toBe("block");
    expect(root.style.position).toBe("absolute");
    expect(root.style.left).toBe("0px");
    expect(root.style.width).toBe("816px");
    expect(root.style.overflow).toBe("visible");
    for (const sheet of getKlutchCaptureSheets(clone, "allroot")) {
      expect(sheet.style.transform).toBe("none");
      expect(sheet.style.width).toBe("816px");
      expect(sheet.style.height).toBe("1056px");
      expect(sheet.style.overflow).toBe("visible");
      expect(sheet.style.getPropertyPriority("transform")).toBe("important");
      expect(sheet.querySelector("footer")?.textContent).toContain("Footer");
      expect(sheet.querySelector<HTMLElement>(".pending")?.style.display).toBe(
        ""
      );
      expect(sheet.querySelector<HTMLElement>(".error")?.style.display).toBe(
        ""
      );
    }
    expect(live.getElementById("allroot")!.style.left).toBe("-30000px");
    expect(live.getElementById("allroot")!.style.display).toBe("none");
    expect(
      live.querySelector<HTMLElement>("#allroot .sheet")!.style.transform
    ).toBe("scale(.5)");
    expect(clone.getElementById("outside")!.style.transform).toBe("");
  });
});

describe("Klutch local PDF generation", () => {
  it("renders sequential Letter pages at scale 2, with exact metadata, PNG compression, and attached-anchor download", async () => {
    vi.useFakeTimers();
    const doc = preparedDocument();
    const sheets = getKlutchCaptureSheets(doc, "allroot");
    await exportKlutchPdf(doc, "Klutch-Policy-ABC123.pdf", "allroot");
    expect(renderer.constructor).toHaveBeenCalledWith({
      orientation: "portrait",
      unit: "in",
      format: "letter",
      compress: true,
    });
    expect(renderer.setProperties).toHaveBeenCalledWith({
      title: "Klutch-Policy-ABC123",
      author: "Klutch Insurance Company",
    });
    expect(renderer.capture).toHaveBeenCalledTimes(2);
    for (let index = 0; index < 2; index++) {
      expect(renderer.capture.mock.calls[index][0]).toBe(sheets[index]);
      expect(renderer.capture.mock.calls[index][1]).toMatchObject({
        scale: 2,
        width: 816,
        height: 1056,
        scrollX: 0,
        scrollY: 0,
        allowTaint: false,
        useCORS: true,
        onclone: prepareKlutchCaptureClone,
      });
    }
    expect(renderer.capture.mock.invocationCallOrder[1]).toBeGreaterThan(
      renderer.addImage.mock.invocationCallOrder[0]
    );
    expect(renderer.addPage).toHaveBeenCalledOnce();
    expect(renderer.addPage).toHaveBeenCalledWith("letter", "portrait");
    expect(renderer.addImage).toHaveBeenCalledTimes(2);
    expect(renderer.addImage).toHaveBeenCalledWith(
      "data:image/png;base64,test",
      "PNG",
      0,
      0,
      8.5,
      11,
      undefined,
      "FAST"
    );
    expect(renderer.output).toHaveBeenCalledWith("blob");
    expect(downloads).toEqual([
      {
        connected: true,
        fileName: "Klutch-Policy-ABC123.pdf",
        href: "blob:https://example.com/klutch-test",
      },
    ]);
    expect(document.querySelector("a")).toBeNull();
    expect(
      canvases.every(canvas => canvas.width === 0 && canvas.height === 0)
    ).toBe(true);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(
      "blob:https://example.com/klutch-test"
    );
  });
  it("validates filename and root before starting any renderer work", async () => {
    await expect(
      exportKlutchPdf(
        preparedDocument(),
        "https://evil.test/file.pdf",
        "allroot"
      )
    ).rejects.toThrow("filename");
    await expect(
      exportKlutchPdf(preparedDocument(), "Klutch-Policy.pdf", "outside")
    ).rejects.toThrow("must be allroot");
    expect(renderer.capture).not.toHaveBeenCalled();
    expect(downloads).toEqual([]);
  });
  it("waits for document fonts before capture", async () => {
    const doc = preparedDocument(1);
    let ready!: () => void;
    Object.defineProperty(doc, "fonts", {
      value: {
        ready: new Promise<void>(resolve => {
          ready = resolve;
        }),
      },
    });
    const work = exportKlutchPdf(doc, "Klutch-Policy.pdf", "allroot");
    expect(renderer.capture).not.toHaveBeenCalled();
    ready();
    await work;
    expect(renderer.capture).toHaveBeenCalledOnce();
  });
  it("fails visibly on broken images instead of silently dropping document content", async () => {
    const doc = preparedDocument(1);
    const image = doc.createElement("img");
    Object.defineProperties(image, {
      complete: { value: true },
      naturalWidth: { value: 0 },
    });
    doc.querySelector("#allroot .sheet")!.appendChild(image);
    await expect(
      exportKlutchPdf(doc, "Klutch-Policy.pdf", "allroot")
    ).rejects.toThrow("image could not be loaded");
    expect(renderer.capture).not.toHaveBeenCalled();
    expect(downloads).toEqual([]);
  });
  it("cancels a late download after unmount without producing a partial PDF", async () => {
    let active = true;
    renderer.capture.mockImplementationOnce(async () => {
      active = false;
      return document.createElement("canvas");
    });
    await expect(
      exportKlutchPdf(
        preparedDocument(),
        "Klutch-Policy.pdf",
        "allroot",
        document,
        () => active
      )
    ).rejects.toThrow("closed before download");
    expect(renderer.capture).toHaveBeenCalledOnce();
    expect(downloads).toEqual([]);
  });
  it("removes the download anchor and revokes its object URL if the browser blocks the click", async () => {
    vi.mocked(HTMLAnchorElement.prototype.click).mockImplementation(() => {
      throw new Error("Blocked download");
    });
    await expect(
      exportKlutchPdf(preparedDocument(1), "Klutch-Policy.pdf", "allroot")
    ).rejects.toThrow("Blocked download");
    expect(document.querySelector("a")).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(
      "blob:https://example.com/klutch-test"
    );
  });
});

describe("Klutch parent bridge contracts", () => {
  it("ignores unrelated origins, other frames, opaque origins, and malformed messages", () => {
    const { send, post } = bridge();
    const request = {
      type: "klutch-print-title",
      requestId: "print-1",
      title: "Klutch-Policy",
    };
    send(request, "https://evil.test");
    send(request, window.location.origin, window);
    send(request, "null");
    send(null);
    send({ ...request, requestId: "" });
    send({ ...request, title: {} });
    expect(document.title).toBe("Whip Knowledge Base");
    expect(post).not.toHaveBeenCalled();
  });
  it("acknowledges a safe title with exact target origin and restores only the matching request", () => {
    const { send, post } = bridge();
    send({
      type: "klutch-print-title",
      requestId: "print-1",
      title: "Klutch-Policy",
    });
    expect(document.title).toBe("Klutch-Policy");
    expect(post).toHaveBeenCalledWith(
      { type: "klutch-print-title-ready", requestId: "print-1" },
      window.location.origin
    );
    send({ type: "klutch-print-title-restore", requestId: "other" });
    expect(document.title).toBe("Klutch-Policy");
    send({ type: "klutch-print-title-restore", requestId: "print-1" });
    expect(document.title).toBe("Whip Knowledge Base");
  });
  it("restores nested requests and the original title on afterprint, iframe reload, and unmount", () => {
    const { frame, send, post } = bridge();
    send({ type: "klutch-print-title", requestId: "one", title: "Klutch-One" });
    send({ type: "klutch-print-title", requestId: "two", title: "Klutch-Two" });
    send({ type: "klutch-print-title-restore", requestId: "two" });
    expect(document.title).toBe("Klutch-One");
    window.dispatchEvent(new Event("afterprint"));
    expect(document.title).toBe("Whip Knowledge Base");
    send({
      type: "klutch-print-title",
      requestId: "three",
      title: "Klutch-Three",
    });
    frame.dispatchEvent(new Event("load"));
    expect(document.title).toBe("Whip Knowledge Base");
    send({
      type: "klutch-print-title",
      requestId: "four",
      title: "Klutch-Four",
    });
    dispose!();
    expect(document.title).toBe("Whip Knowledge Base");
    const calls = post.mock.calls.length;
    send({
      type: "klutch-print-title",
      requestId: "late",
      title: "Klutch-Late",
    });
    expect(post).toHaveBeenCalledTimes(calls);
  });
  it("returns explicit failures for invalid filenames, arbitrary roots, and missing pages", async () => {
    const { send, post } = bridge();
    send({
      type: "klutch-export-pdf",
      requestId: "bad-file",
      fileName: "../Klutch-Policy.pdf",
      rootId: "allroot",
    });
    send({
      type: "klutch-export-pdf",
      requestId: "bad-root",
      fileName: "Klutch-Policy.pdf",
      rootId: "preview",
    });
    send({
      type: "klutch-export-pdf",
      requestId: "missing",
      fileName: "Klutch-Policy.pdf",
      rootId: "allroot",
    });
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(3));
    for (const [response, target] of post.mock.calls) {
      expect(response).toMatchObject({
        type: "klutch-export-pdf-result",
        ok: false,
        message: expect.any(String),
      });
      expect(target).toBe(window.location.origin);
    }
    expect(renderer.capture).not.toHaveBeenCalled();
  });
  it("serializes capture, returns success after download, and reports renderer errors", async () => {
    const { frame, send, post } = bridge();
    frame.contentDocument!.body.innerHTML =
      '<div id="allroot"><div class="sheet">Trusted policy</div></div>';
    const request = {
      type: "klutch-export-pdf",
      requestId: "pdf-1",
      fileName: "Klutch-Policy.pdf",
      rootId: "allroot",
    };
    send(request);
    send({ ...request, requestId: "pdf-2" });
    expect(post).toHaveBeenCalledWith(
      {
        type: "klutch-export-pdf-result",
        requestId: "pdf-2",
        ok: false,
        message: expect.stringContaining("already being prepared"),
      },
      window.location.origin
    );
    await vi.waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        { type: "klutch-export-pdf-result", requestId: "pdf-1", ok: true },
        window.location.origin
      )
    );
    expect(downloads).toHaveLength(1);
    renderer.capture.mockRejectedValueOnce(new Error("Capture failed"));
    send({ ...request, requestId: "pdf-3" });
    await vi.waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        {
          type: "klutch-export-pdf-result",
          requestId: "pdf-3",
          ok: false,
          message: "Capture failed",
        },
        window.location.origin
      )
    );
    expect(downloads).toHaveLength(1);
  });
});
