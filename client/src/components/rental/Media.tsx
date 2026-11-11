import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import { Camera, CheckCircle2, Upload, Eraser } from "lucide-react";
import type { RentalAsset } from "@shared/rentalHandoff";
import { ErrorNotice, errorMessage } from "./Controls";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export type AssetWithUrl = RentalAsset & { url: string };
export type UploadAsset = (
  kind: RentalAsset["kind"],
  base64: string,
  signerName?: string
) => Promise<unknown>;
export async function compressedPhoto(file: File): Promise<string> {
  if (!["image/jpeg", "image/png"].includes(file.type))
    throw new Error(
      "Choose a JPEG or PNG photo. Change your camera format if it uses HEIC."
    );
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error("This photo could not be opened."));
      image.src = url;
    });
    const scale = Math.min(
      1,
      1600 / Math.max(image.naturalWidth, image.naturalHeight)
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx)
      throw new Error("Photo compression is unavailable in this browser.");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL("image/jpeg", 0.82);
    if (result.length > 5 * 1024 * 1024)
      throw new Error(
        "The compressed photo is too large. Choose a smaller photo."
      );
    return result;
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function PhotoUpload({
  kind,
  label,
  guidance,
  assets,
  upload,
  disabled = false,
}: {
  kind: RentalAsset["kind"];
  label: string;
  guidance?: string;
  assets: AssetWithUrl[];
  upload: UploadAsset;
  disabled?: boolean;
}) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const matching = assets.filter(a => a.kind === kind);
  const asset = matching.at(-1);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const selectedPhoto = matching[Math.min(galleryIndex, matching.length - 1)];
  const choose = async (file?: File) => {
    if (!file || busy || disabled) return;
    setBusy(true);
    setError("");
    try {
      await upload(kind, await compressedPhoto(file));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="r-photo">
      <div className="r-photo-label">
        <Camera size={18} />
        <strong>{label}</strong>
        {asset && <CheckCircle2 size={16} className="r-teal" />}
      </div>
      {guidance && <small id={`${id}-guidance`}>{guidance}</small>}
      {asset && (
        <Dialog open={galleryOpen} onOpenChange={setGalleryOpen}>
          <DialogTrigger asChild>
            <button type="button" className="r-photo-preview" aria-label={`Expand photo: ${label}`} onClick={() => setGalleryIndex(matching.length - 1)}>
              <img src={asset.url} alt={label} />
            </button>
          </DialogTrigger>
          <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-5xl overflow-auto bg-background text-foreground sm:max-w-5xl" showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>{label} — photo gallery</DialogTitle>
              <DialogDescription>Saved original evidence. Photo {Math.min(galleryIndex + 1, matching.length)} of {matching.length}. No automatic analysis.</DialogDescription>
            </DialogHeader>
            {selectedPhoto && <img src={selectedPhoto.url} alt={`${label} enlarged photo ${galleryIndex + 1}`} className="h-auto max-h-[65dvh] w-full object-contain" />}
            <div className="flex flex-wrap items-center gap-3">
              {matching.length > 1 && <>
                <button type="button" className="r-button" aria-label="Previous photo" disabled={galleryIndex <= 0} onClick={() => setGalleryIndex(index => Math.max(0, index - 1))}>Previous</button>
                <button type="button" className="r-button" aria-label="Next photo" disabled={galleryIndex >= matching.length - 1} onClick={() => setGalleryIndex(index => Math.min(matching.length - 1, index + 1))}>Next</button>
              </>}
              <DialogClose asChild><button type="button" className="r-button" aria-label="Close photo gallery">Close photo gallery</button></DialogClose>
            </div>
          </DialogContent>
        </Dialog>
      )}
      <div className="r-actions">
        <label className={`r-button ${disabled || busy ? "r-disabled" : ""}`}>
          <Camera size={16} />
          {busy ? "Uploading…" : asset ? "Add another" : "Take photo"}
          <input
            type="file"
            accept="image/jpeg,image/png"
            capture="environment"
            aria-label={`Take photo: ${label}`}
            aria-describedby={guidance ? `${id}-guidance` : undefined}
            disabled={disabled || busy}
            onChange={e => {
              void choose(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <label className={`r-button ${disabled || busy ? "r-disabled" : ""}`}>
          <Upload size={16} />
          Choose file
          <input
            type="file"
            accept="image/jpeg,image/png"
            aria-label={`Choose file: ${label}`}
            aria-describedby={guidance ? `${id}-guidance` : undefined}
            disabled={disabled || busy}
            onChange={e => {
              void choose(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <ErrorNotice message={error} />
    </div>
  );
}
export function SignaturePad({
  kind,
  label,
  name,
  assets,
  upload,
  disabled = false,
}: {
  kind: RentalAsset["kind"];
  label: string;
  name: string;
  assets: AssetWithUrl[];
  upload: UploadAsset;
  disabled?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saved = assets.filter(a => a.kind === kind).at(-1);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const resize = () => {
      const rect = el.getBoundingClientRect();
      const ratio = Math.max(1, window.devicePixelRatio || 1);
      const copy = document.createElement("canvas");
      copy.width = el.width;
      copy.height = el.height;
      copy.getContext("2d")?.drawImage(el, 0, 0);
      el.width = Math.max(1, Math.round(rect.width * ratio));
      el.height = Math.round(170 * ratio);
      const ctx = el.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, el.width, el.height);
      ctx.drawImage(
        copy,
        0,
        0,
        copy.width,
        copy.height,
        0,
        0,
        el.width,
        el.height
      );
      ctx.scale(ratio, ratio);
      ctx.strokeStyle = "#122c45";
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    };
    resize();
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(resize)
        : undefined;
    observer?.observe(el);
    return () => observer?.disconnect();
  }, []);
  const point = (e: PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const clear = () => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, el.width, el.height);
    ctx.restore();
    setHasInk(false);
  };
  const save = async () => {
    if (!hasInk || !name.trim() || !canvas.current) return;
    setBusy(true);
    setError("");
    try {
      await upload(kind, canvas.current.toDataURL("image/png"), name.trim());
      clear();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="r-signature">
      <h3>{label}</h3>
      {saved && (
        <div className="r-signature-saved">
          <CheckCircle2 size={16} />
          Saved for {saved.signerName || name}{" "}
          <a href={saved.url} target="_blank" rel="noopener noreferrer">
            View signature
          </a>
        </div>
      )}
      <p>
        Sign with your finger, stylus or mouse. This is the rental agreement
        signature. Where the renter is also the cardholder and electronic
        authorization is permitted, the saved renter signature is also used with
        the explicit payment acknowledgment. It cannot authorize a different
        cardholder’s payment.
      </p>
      <canvas
        ref={canvas}
        aria-label={`${label} drawing area`}
        style={{ touchAction: "none" }}
        onPointerDown={e => {
          if (disabled || busy) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          last.current = point(e);
        }}
        onPointerMove={e => {
          if (!drawing.current || disabled) return;
          const ctx = canvas.current?.getContext("2d");
          const p = point(e);
          if (ctx && last.current) {
            ctx.beginPath();
            ctx.moveTo(last.current.x, last.current.y);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
            setHasInk(true);
          }
          last.current = p;
        }}
        onPointerUp={() => {
          drawing.current = false;
          last.current = null;
        }}
        onPointerCancel={() => {
          drawing.current = false;
          last.current = null;
        }}
      />
      <div className="r-actions">
        <button
          type="button"
          className="r-button"
          disabled={disabled || busy}
          onClick={clear}
        >
          <Eraser size={16} />
          Clear
        </button>
        <button
          type="button"
          className="r-button r-primary"
          disabled={disabled || busy || !hasInk || !name.trim()}
          onClick={() => void save()}
        >
          {busy ? "Saving…" : "Save signature"}
        </button>
      </div>
      {!name.trim() && <small>Enter the signer’s full name first.</small>}
      <ErrorNotice message={error} />
    </section>
  );
}
