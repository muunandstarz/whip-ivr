import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  PhoneIncoming,
  BarChart3,
  Settings,
  LogOut,
  PlusCircle,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/intake", label: "Intake Records", icon: PhoneIncoming },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/ivr-setup", label: "IVR Setup", icon: Settings },
];

export default function WhipLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, isAuthenticated, loading } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => {
      window.location.href = "/";
    },
    onError: () => toast.error("Logout failed"),
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#171b31] gap-6">
        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-full bg-[#ff6221] flex items-center justify-center">
            <PhoneIncoming className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Whip Claims IVR</h1>
          <p className="text-white/60 text-sm">AI-powered call intake management</p>
        </div>
        <Button
          className="bg-[#ff6221] hover:bg-[#e5541a] text-white px-8"
          onClick={() => (window.location.href = getLoginUrl())}
        >
          Sign in to continue
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#171b31] text-white flex flex-col transition-transform duration-200 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0 lg:static lg:flex`}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-white/10">
          <div className="w-8 h-8 rounded-lg bg-[#ff6221] flex items-center justify-center flex-shrink-0">
            <PhoneIncoming className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="font-bold text-sm leading-tight">Whip Claims</div>
            <div className="text-white/50 text-xs">AI Voice IVR</div>
          </div>
          <button
            className="ml-auto lg:hidden text-white/60 hover:text-white"
            onClick={() => setMobileOpen(false)}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* New Intake Button */}
        <div className="px-4 py-3">
          <Link href="/intake/new">
            <Button
              size="sm"
              className="w-full bg-[#ff6221] hover:bg-[#e5541a] text-white gap-2"
              onClick={() => setMobileOpen(false)}
            >
              <PlusCircle className="w-4 h-4" />
              New Intake
            </Button>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-2 space-y-0.5">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? location === "/" : location.startsWith(href);
            return (
              <Link key={href} href={href}>
                <button
                  onClick={() => setMobileOpen(false)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    active
                      ? "bg-white/15 text-white font-medium"
                      : "text-white/60 hover:bg-white/8 hover:text-white"
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {label}
                </button>
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="px-4 py-4 border-t border-white/10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-[#ff6221]/20 flex items-center justify-center text-[#ff6221] text-xs font-bold">
              {user?.name?.charAt(0)?.toUpperCase() || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{user?.name || "User"}</div>
              <div className="text-xs text-white/50 truncate">{user?.email || ""}</div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-white/60 hover:text-white hover:bg-white/10 gap-2 justify-start"
            onClick={() => logout.mutate()}
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </Button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 border-b bg-white sticky top-0 z-30">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-gray-600 hover:text-gray-900"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-[#ff6221] flex items-center justify-center">
              <PhoneIncoming className="w-3 h-3 text-white" />
            </div>
            <span className="font-semibold text-sm text-[#171b31]">Whip Claims IVR</span>
          </div>
        </header>

        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
