import { useEffect, useRef, useState } from "react";
import { createFreshPdfPreview, type PdfPreviewSnapshot } from "@/lib/freshPdfPreview";

export function useFreshPdfPreview(fingerprint: string) {
  const owner = useRef<ReturnType<typeof createFreshPdfPreview> | null>(null);
  if (!owner.current) owner.current = createFreshPdfPreview();
  const [snapshot, setSnapshot] = useState<PdfPreviewSnapshot | null>(null);
  useEffect(() => {
    owner.current!.clear();
    setSnapshot(null);
  }, [fingerprint]);
  useEffect(() => () => owner.current!.clear(), []);
  return {
    // The fingerprint check hides stale content during render, before effects run.
    url: snapshot?.fingerprint === fingerprint ? owner.current.current(fingerprint) : null,
    replace: (blob: Blob) => {
      setSnapshot(owner.current!.replace(blob, fingerprint));
    },
    clear: () => { owner.current!.clear(); setSnapshot(null); },
  };
}
