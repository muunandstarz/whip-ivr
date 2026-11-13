const ROOT_ID = "allroot";
const SHEET_WIDTH = 816;
const SHEET_HEIGHT = 1056;
const ASSET_TIMEOUT_MS = 15_000;

export function isKlutchPdfFileName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 150 &&
    /^Klutch-[A-Za-z0-9-]+(?:\.pdf)$/.test(value)
  );
}

/** A same-origin sibling frame is not authorized: only this exact iframe is. */
export function isKlutchFrameMessage(
  event: Pick<MessageEvent, "origin" | "source">,
  frame: Pick<HTMLIFrameElement, "contentWindow">,
  origin: string
): boolean {
  return (
    origin !== "null" &&
    event.origin === origin &&
    frame.contentWindow !== null &&
    event.source === frame.contentWindow
  );
}

export function getKlutchCaptureSheets(
  frameDocument: Document,
  rootId: unknown
): HTMLElement[] {
  if (rootId !== ROOT_ID)
    throw new Error("The PDF capture root must be allroot.");
  const root = frameDocument.getElementById(ROOT_ID);
  if (!root) throw new Error("The prepared PDF document is unavailable.");
  const sheets = Array.from(root.querySelectorAll<HTMLElement>(".sheet"));
  if (!sheets.length)
    throw new Error("The prepared PDF document has no pages.");
  return sheets;
}

async function withAssetTimeout<T>(
  work: Promise<T>,
  message: string
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(message)),
          ASSET_TIMEOUT_MS
        );
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

async function waitForAssets(frameDocument: Document, sheets: HTMLElement[]) {
  if (frameDocument.fonts) {
    await withAssetTimeout(
      frameDocument.fonts.ready,
      "Document fonts did not become ready. Please retry the PDF download."
    );
  }
  const images = sheets.flatMap(sheet =>
    Array.from(sheet.querySelectorAll<HTMLImageElement>("img"))
  );
  await Promise.all(
    images.map(async image => {
      if (!image.complete) {
        let onLoad: () => void = () => {};
        let onError: () => void = () => {};
        try {
          await withAssetTimeout(
            new Promise<void>((resolve, reject) => {
              onLoad = resolve;
              onError = () =>
                reject(new Error("A document image could not be loaded."));
              image.addEventListener("load", onLoad, { once: true });
              image.addEventListener("error", onError, { once: true });
            }),
            "A document image did not become ready. Please retry the PDF download."
          );
        } finally {
          image.removeEventListener("load", onLoad);
          image.removeEventListener("error", onError);
        }
      }
      if (!image.naturalWidth)
        throw new Error("A document image could not be loaded.");
      if (typeof image.decode === "function") {
        await withAssetTimeout(
          image.decode(),
          "A document image could not be decoded."
        );
      }
    })
  );
}

/** Modify only html2canvas's private clone, never the live document or status UI. */
export async function prepareKlutchCaptureClone(clonedDocument: Document) {
  const sheets = getKlutchCaptureSheets(clonedDocument, ROOT_ID);
  const root = clonedDocument.getElementById(ROOT_ID)!;
  const set = (element: HTMLElement, values: Record<string, string>) => {
    for (const [property, value] of Object.entries(values)) {
      element.style.setProperty(property, value, "important");
    }
  };
  set(root, {
    display: "block",
    position: "absolute",
    left: "0",
    top: "0",
    right: "auto",
    bottom: "auto",
    width: `${SHEET_WIDTH}px`,
    height: "auto",
    "max-height": "none",
    overflow: "visible",
    transform: "none",
    translate: "none",
    scale: "none",
    rotate: "none",
    visibility: "visible",
    opacity: "1",
  });
  for (const sheet of sheets) {
    set(sheet, {
      display: "block",
      position: "relative",
      left: "auto",
      top: "auto",
      right: "auto",
      bottom: "auto",
      width: `${SHEET_WIDTH}px`,
      height: `${SHEET_HEIGHT}px`,
      "min-width": `${SHEET_WIDTH}px`,
      "max-width": `${SHEET_WIDTH}px`,
      "min-height": `${SHEET_HEIGHT}px`,
      "max-height": `${SHEET_HEIGHT}px`,
      "box-sizing": "border-box",
      margin: "0",
      transform: "none",
      translate: "none",
      scale: "none",
      rotate: "none",
      "box-shadow": "none",
      overflow: "visible",
      visibility: "visible",
      opacity: "1",
    });
  }
  await waitForAssets(clonedDocument, sheets);
}

function downloadKlutchPdf(
  blob: Blob,
  fileName: string,
  hostDocument: Document
) {
  const url = URL.createObjectURL(blob);
  const anchor = hostDocument.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  let clicked = false;
  try {
    hostDocument.body.appendChild(anchor);
    anchor.click();
    clicked = true;
  } finally {
    anchor.remove();
    // Keep the object URL alive while the browser starts its local download.
    if (clicked) setTimeout(() => URL.revokeObjectURL(url), 60_000);
    else URL.revokeObjectURL(url);
  }
}

/** Local PDF only: no APIs, policy mutations, delivery, signatures, or print dialog. */
export async function exportKlutchPdf(
  frameDocument: Document,
  fileName: unknown,
  rootId: unknown,
  hostDocument: Document = document,
  isActive: () => boolean = () => true
): Promise<void> {
  if (!isKlutchPdfFileName(fileName))
    throw new Error("Invalid Klutch PDF filename.");
  const sheets = getKlutchCaptureSheets(frameDocument, rootId);
  const assertActive = () => {
    if (!isActive())
      throw new Error("The PDF document was closed before download.");
  };
  assertActive();
  await waitForAssets(frameDocument, sheets);
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  assertActive();
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "in",
    format: "letter",
    compress: true,
  });
  pdf.setProperties({
    title: fileName.slice(0, -4),
    author: "Klutch Insurance Company",
  });
  // Sequential captures bound memory usage and preserve the trusted DOM page order.
  for (let index = 0; index < sheets.length; index++) {
    const sheet = sheets[index];
    assertActive();
    const canvas = await html2canvas(sheet, {
      scale: 2,
      width: SHEET_WIDTH,
      height: SHEET_HEIGHT,
      windowWidth: SHEET_WIDTH,
      windowHeight: SHEET_HEIGHT,
      scrollX: 0,
      scrollY: 0,
      backgroundColor: "#ffffff",
      allowTaint: false,
      useCORS: true,
      logging: false,
      removeContainer: true,
      onclone: prepareKlutchCaptureClone,
    });
    try {
      assertActive();
      if (index > 0) pdf.addPage("letter", "portrait");
      pdf.addImage(
        canvas.toDataURL("image/png"),
        "PNG",
        0,
        0,
        8.5,
        11,
        undefined,
        "FAST"
      );
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
  assertActive();
  downloadKlutchPdf(pdf.output("blob"), fileName, hostDocument);
}

/** Install on the React host; dispose restores titles and cancels late downloads. */
export function installKlutchPdfBridge(
  frame: HTMLIFrameElement,
  hostWindow: Window = window
): () => void {
  const origin = hostWindow.location.origin;
  const titles = new Map<string, string>();
  let originalTitle: string | undefined;
  let mounted = true;
  let exporting = false;
  const restoreTitles = () => {
    if (originalTitle !== undefined) hostWindow.document.title = originalTitle;
    originalTitle = undefined;
    titles.clear();
  };
  const onMessage = (event: MessageEvent) => {
    if (!mounted || !isKlutchFrameMessage(event, frame, origin)) return;
    const data: unknown = event.data;
    if (!data || typeof data !== "object" || Array.isArray(data)) return;
    const request = data as Record<string, unknown>;
    const { type, requestId } = request;
    if (
      typeof requestId !== "string" ||
      !requestId.length ||
      requestId.length > 160
    )
      return;
    const source = frame.contentWindow!;
    const respond = (response: Record<string, unknown>) => {
      if (mounted && frame.contentWindow === source)
        source.postMessage(response, origin);
    };
    if (type === "klutch-print-title") {
      if (
        typeof request.title !== "string" ||
        !request.title.trim() ||
        request.title.length > 150
      )
        return;
      if (originalTitle === undefined)
        originalTitle = hostWindow.document.title;
      titles.delete(requestId);
      titles.set(requestId, request.title);
      hostWindow.document.title = request.title;
      respond({ type: "klutch-print-title-ready", requestId });
    } else if (type === "klutch-print-title-restore") {
      if (!titles.delete(requestId)) return;
      if (!titles.size) restoreTitles();
      else hostWindow.document.title = Array.from(titles.values()).at(-1)!;
    } else if (type === "klutch-export-pdf") {
      const failure = (message: string) =>
        respond({
          type: "klutch-export-pdf-result",
          requestId,
          ok: false,
          message,
        });
      if (!isKlutchPdfFileName(request.fileName))
        return failure("Invalid Klutch PDF filename.");
      if (request.rootId !== ROOT_ID)
        return failure("The PDF capture root must be allroot.");
      if (exporting)
        return failure(
          "A PDF download is already being prepared. Please wait and retry."
        );
      exporting = true;
      void (async () => {
        try {
          const frameDocument = frame.contentDocument;
          if (!frameDocument)
            throw new Error("The prepared PDF document is unavailable.");
          await exportKlutchPdf(
            frameDocument,
            request.fileName,
            request.rootId,
            hostWindow.document,
            () =>
              mounted &&
              frame.contentWindow === source &&
              frame.contentDocument === frameDocument
          );
          respond({ type: "klutch-export-pdf-result", requestId, ok: true });
        } catch (error) {
          failure(
            error instanceof Error
              ? error.message
              : "The PDF could not be downloaded. Please retry."
          );
        } finally {
          exporting = false;
        }
      })();
    }
  };
  hostWindow.addEventListener("message", onMessage);
  hostWindow.addEventListener("afterprint", restoreTitles);
  frame.addEventListener("load", restoreTitles);
  return () => {
    mounted = false;
    hostWindow.removeEventListener("message", onMessage);
    hostWindow.removeEventListener("afterprint", restoreTitles);
    frame.removeEventListener("load", restoreTitles);
    restoreTitles();
  };
}
