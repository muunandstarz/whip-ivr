import WhipLayout from "@/components/WhipLayout";
import { UnifiedCOITab } from "@/pages/DocGenerator";
import { useAuth } from "@/_core/hooks/useAuth";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { AlertTriangle, FileText, ShieldCheck } from "lucide-react";

// Liability team: Jayla (Injury) and the active/legacy Giovanni/Geovanni PD
// profiles. This mirrors the sidebar gate and uses the effective preview
// profile so an administrator cannot access it in Admin View.
const LIABILITY_COI_HANDLER_IDS = new Set([2, 90002, 330001]);

export default function MetroCarsCOI() {
  const { user, loading } = useAuth();
  const { impersonating, isImpersonating } = useImpersonation();
  const effectiveHandlerId = isImpersonating ? impersonating?.id : user?.handlerProfileId;
  const hasLiabilityAccess = effectiveHandlerId != null && LIABILITY_COI_HANDLER_IDS.has(effectiveHandlerId);

  if (loading) {
    return (
      <WhipLayout>
        <div className="flex min-h-[50vh] items-center justify-center bg-slate-50 text-sm text-slate-500">Loading certificate workspace…</div>
      </WhipLayout>
    );
  }

  if (!hasLiabilityAccess) {
    return (
      <WhipLayout>
        <main className="min-h-full bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
          <section className="mx-auto max-w-2xl rounded-xl border border-amber-200 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-amber-50 p-2 text-amber-700"><AlertTriangle className="h-5 w-5" aria-hidden="true" /></div>
              <div>
                <h1 className="text-lg font-semibold text-slate-950">MetroCars COI is restricted to the Liability Team</h1>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  This certificate workspace is available only while viewing as an authorized Liability handler. Select the appropriate Liability handler in the profile menu or return to the Knowledge Base.
                </p>
              </div>
            </div>
          </section>
        </main>
      </WhipLayout>
    );
  }

  return (
    <WhipLayout>
      <div className="min-h-full bg-slate-50">
        <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-7xl items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-white">
              <FileText className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold text-slate-950">MetroCars Certificate of Insurance</h1>
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                  <ShieldCheck className="h-3 w-3" aria-hidden="true" /> Liability Team Only
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Use this restored MetroCars certificate workflow for Liability claims. It is fixed to MetroCars and does not issue a Klutch certificate.
              </p>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <UnifiedCOITab carrierMode="metrocars" />
        </main>
      </div>
    </WhipLayout>
  );
}
