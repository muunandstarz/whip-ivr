import WhipLayout from "@/components/WhipLayout";
import { FileText, ShieldCheck } from "lucide-react";

/**
 * Dedicated Knowledge Base home for the owner-supplied Klutch policy-document
 * workflow. The document surface remains a first-party Whip route, but it is
 * intentionally kept outside Document Generator because it owns policy records,
 * term history, and policy-document controls rather than a single letter form.
 */
export default function KlutchPolicyDocuments() {
  return (
    <WhipLayout>
      <div className="flex h-full min-h-0 flex-col bg-[#f7f8f6]">
        <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#003c43] text-[#d6f25c]">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-base font-semibold text-slate-950">Klutch Policy Documents</h1>
                <span className="hidden rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:inline">
                  Knowledge Base
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-600">
                Policy declarations, coverage notices, cancellations, and endorsements.
              </p>
            </div>
            <FileText className="ml-auto hidden h-5 w-5 text-slate-400 sm:block" aria-hidden="true" />
          </div>
        </header>
        <iframe
          src="/klutch-policy-documents.html"
          title="Klutch Policy Documents"
          className="min-h-[calc(100vh-10rem)] flex-1 border-0 bg-[#f7f8f6]"
        />
      </div>
    </WhipLayout>
  );
}
