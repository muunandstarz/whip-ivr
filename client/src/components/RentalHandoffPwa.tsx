import { useEffect, type ReactNode } from "react";
export default function RentalHandoffPwa({ children }: { children: ReactNode }) {
  useEffect(() => {
    const title = document.title;
    document.title = "MetroCars Rental Handoff";
    const manifest = document.createElement("link");
    manifest.rel = "manifest"; manifest.href = "/rental-handoff.webmanifest";
    const touch = document.createElement("link");touch.rel = "apple-touch-icon";touch.href = "/manus-storage/metrocars-actual-icon-192_59bbbf43.png";
    document.head.append(manifest, touch);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/rental-handoff-sw.js", { scope: "/rental-handoff" }).catch(() => { /* Browser may forbid install; normal web workflow remains available. */ });
    return () => { document.title = title; manifest.remove();touch.remove(); };
  }, []);
  return <>{children}</>;
}
