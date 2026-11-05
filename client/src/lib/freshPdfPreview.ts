export type PdfPreviewSnapshot = { url: string; fingerprint: string };
export type PdfObjectUrls = Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;

/** Owns only ephemeral browser URLs. An edited draft can never expose an older PDF. */
export function createFreshPdfPreview(urls: PdfObjectUrls = URL) {
  let snapshot: PdfPreviewSnapshot | null = null;
  const clear = () => {
    if (snapshot) urls.revokeObjectURL(snapshot.url);
    snapshot = null;
  };
  return {
    clear,
    replace(blob: Blob, fingerprint: string): PdfPreviewSnapshot {
      clear();
      snapshot = { url: urls.createObjectURL(blob), fingerprint };
      return snapshot;
    },
    current(fingerprint: string): string | null {
      return snapshot?.fingerprint === fingerprint ? snapshot.url : null;
    },
  };
}
