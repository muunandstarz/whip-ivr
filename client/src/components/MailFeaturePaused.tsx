import { Link } from "wouter";
import { Inbox, Settings2 } from "lucide-react";
import WhipLayout from "@/components/WhipLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";

export default function MailFeaturePaused({ feature }: { feature: "Mailroom" | "Mail / Fax Bot" }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  return (
    <WhipLayout>
      <div className="mx-auto flex min-h-[60vh] max-w-xl items-center px-6 py-12">
        <div className="w-full rounded-2xl border bg-card p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
            <Inbox className="h-6 w-6 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">{feature} is temporarily paused</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            This feature is not processing or assigning new work and is hidden from navigation until an administrator turns it back on.
          </p>
          {isAdmin && (
            <Link href="/settings">
              <Button className="mt-6 gap-2 bg-[#ff6221] text-white hover:bg-[#e5541a]">
                <Settings2 className="h-4 w-4" /> Open Settings
              </Button>
            </Link>
          )}
        </div>
      </div>
    </WhipLayout>
  );
}
