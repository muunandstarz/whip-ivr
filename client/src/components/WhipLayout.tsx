import { Link, useLocation } from "wouter";
import OnboardingModal from "@/components/OnboardingModal";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LayoutDashboard,
  PhoneIncoming,
  BarChart3,
  Settings,
  LogOut,
  PlusCircle,
  Menu,
  X,
  Users,
  PhoneCall,
  Phone,
  Star,
  UserCog,
  LayoutGrid,
  SlidersHorizontal,
  Sun,
  Moon,
  Contrast,
  ListChecks,
  ClipboardCheck,
} from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { useTheme, type Theme } from "@/contexts/ThemeContext";

// ── Nav items for admin users ────────────────────────────────────────────────
const ADMIN_NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/intake", label: "Intake Records", icon: PhoneIncoming },
  { href: "/handler-queue", label: "Handler Queue", icon: Users },
  { href: "/callback-log", label: "Callback Log", icon: ListChecks },
  { href: "/call-tracking", label: "Call Tracking", icon: PhoneCall },
  { href: "/qa", label: "Weekly QA", icon: Star },
  { href: "/loss-intake", label: "Loss Intake", icon: ClipboardCheck },
  { href: "/softphone", label: "Softphone", icon: Phone },
  { href: "/users", label: "User Management", icon: UserCog },
  { href: "/settings", label: "Settings", icon: SlidersHorizontal },
];

// ── Nav items for handler view (own or impersonated) ─────────────────────────
const HANDLER_NAV_ITEMS_BASE = [
  { href: "/softphone", label: "Softphone", icon: Phone },
  { href: "/my-dashboard", label: "My Dashboard", icon: LayoutGrid },
  { href: "/intake", label: "Intake Records", icon: PhoneIncoming },
];
// Handler IDs authorized for Loss Intake (Carlito=4, Ana=6, Bennet=30003)
const LOSS_INTAKE_HANDLER_IDS = new Set([4, 6, 30003]);
const LOSS_INTAKE_NAV = { href: "/loss-intake", label: "Loss Intake", icon: ClipboardCheck };

export default function WhipLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { user, loading, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const showOnboarding = !!user && !user.onboardingSeenAt && !onboardingDismissed;
  const { impersonating, setImpersonating, isImpersonating } = useImpersonation();
  const { theme, setTheme } = useTheme();

  const isAdmin = user?.role === "admin";

  // Fetch handlers list for admin impersonation dropdown
  const { data: handlersList } = trpc.handlers.list.useQuery(undefined, {
    enabled: isAdmin,
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-primary gap-6 p-4">
        <div className="flex flex-col items-center gap-2 mb-2">
          <img
            src="/manus-storage/whip_logo_5e114d45.webp"
            alt="Whip"
            className="h-14 w-auto object-contain"
          />
          <h1 className="text-2xl font-bold text-white">Claims IVR</h1>
          <p className="text-white/60 text-sm">AI-powered call intake management</p>
        </div>
        <div className="bg-background rounded-xl shadow-2xl p-8 w-full max-w-sm flex flex-col items-center gap-4">
          <div className="text-foreground font-bold text-lg">Sign in to continue</div>
          <p className="text-muted-foreground text-sm text-center">
            Use your Whip Google account to sign in.
          </p>
          <Button
            className="w-full bg-[#ff6221] hover:bg-[#e5541a] text-white font-semibold gap-2"
            onClick={() => { window.location.href = getLoginUrl(); }}
          >
            Sign in with Google
          </Button>
        </div>
      </div>
    );
  }

  const displayName = user.name || user.email || "User";
  const displayEmail = user.email || "";
  const avatarInitial = displayName.charAt(0).toUpperCase();

  // Determine which nav to show:
  // - Admin with no impersonation → full admin nav
  // - Admin impersonating a handler → handler nav (with Loss Intake if impersonating an authorized handler)
  // - Non-admin → handler nav (with Loss Intake if authorized handler)
  const showLossIntake =
    isAdmin ||
    (user.handlerProfileId != null && LOSS_INTAKE_HANDLER_IDS.has(user.handlerProfileId));
  const handlerNavItems = showLossIntake
    ? [HANDLER_NAV_ITEMS_BASE[0], HANDLER_NAV_ITEMS_BASE[1], LOSS_INTAKE_NAV, HANDLER_NAV_ITEMS_BASE[2]]
    : HANDLER_NAV_ITEMS_BASE;
  const navItems: { href: string; label: string; icon: React.ElementType }[] =
    isAdmin && !isImpersonating ? ADMIN_NAV_ITEMS : handlerNavItems;

  return (
    <div className="min-h-screen flex bg-background">
      {showOnboarding && (
        <OnboardingModal onDismiss={() => setOnboardingDismissed(true)} />
      )}
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-primary text-white flex flex-col transition-transform duration-200 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0 lg:static lg:flex`}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-white/10">
          <img
            src="/manus-storage/whip_logo_5e114d45.webp"
            alt="Whip"
            className="h-10 w-auto object-contain flex-shrink-0"
          />
          <div>
            <div className="font-bold text-sm leading-tight text-white">Claims IVR</div>
            <div className="text-white/50 text-xs">AI Voice Intake</div>
          </div>
          <button
            className="ml-auto lg:hidden text-white/60 hover:text-white"
            onClick={() => setMobileOpen(false)}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Admin Impersonation Dropdown */}
        {isAdmin && (
          <div className="px-4 py-3 border-b border-white/10">
            <div className="flex items-center gap-2 mb-2">
              <UserCog className="w-3.5 h-3.5 text-[#ff6221]" />
              <span className="text-xs font-semibold text-white/70 uppercase tracking-wide">
                Viewing as
              </span>
            </div>
            <Select
              value={impersonating ? String(impersonating.id) : "admin"}
              onValueChange={(val) => {
                if (val === "admin") {
                  setImpersonating(null);
                } else {
                  const handler = handlersList?.find((h) => String(h.id) === val);
                  if (handler) {
                    setImpersonating({ id: handler.id, name: handler.name, email: handler.email ?? "" });
                    navigate("/my-dashboard");
                  }
                }
              }}
            >
              <SelectTrigger className="w-full bg-background/10 border-white/20 text-white text-sm h-8 focus:ring-[#ff6221]">
                <SelectValue placeholder="Admin View" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">
                  <span className="flex items-center gap-2">
                    <LayoutDashboard className="w-3.5 h-3.5" />
                    Admin View
                  </span>
                </SelectItem>
                {handlersList?.map((handler) => (
                  <SelectItem key={String(handler.id)} value={String(handler.id)}>
                    <span className="flex items-center gap-2">
                      <Users className="w-3.5 h-3.5" />
                      {handler.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isImpersonating && (
              <p className="text-xs text-amber-300 mt-1.5 flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />
                Handler view active
              </p>
            )}
          </div>
        )}

        {/* New Intake Button — admin only */}
        {isAdmin && !isImpersonating && (
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
        )}

        {/* Nav */}
        <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon }: { href: string; label: string; icon: React.ElementType }) => {
            const active = href === "/" ? location === "/" : location.startsWith(href);
            return (
              <Link key={href} href={href}>
                <button
                  onClick={() => setMobileOpen(false)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    active
                      ? "bg-background/15 text-white font-medium"
                      : "text-white/60 hover:bg-background/8 hover:text-white"
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {label}
                </button>
              </Link>
            );
          })}

          {/* Admin: show "Exit Handler View" button when impersonating */}
          {isAdmin && isImpersonating && (
            <button
              onClick={() => {
                setImpersonating(null);
                setMobileOpen(false);
              }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-amber-300 hover:bg-background/8 hover:text-amber-200 mt-2 border border-amber-400/30"
            >
              <UserCog className="w-4 h-4 flex-shrink-0" />
              Exit Handler View
            </button>
          )}
        </nav>

        {/* User */}
        <div className="px-4 py-4 border-t border-white/10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-[#ff6221]/20 flex items-center justify-center text-[#ff6221] text-xs font-bold flex-shrink-0">
              {avatarInitial}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{displayName}</div>
              <div className="text-xs text-white/50 truncate">
                {isAdmin ? "Admin" : "Handler"} · {displayEmail}
              </div>
            </div>
          </div>
          {/* Theme toggle */}
          <div className="flex items-center gap-1 mb-2">
            {([
              { value: "light" as Theme,         icon: Sun,      label: "Light" },
              { value: "dark" as Theme,           icon: Moon,     label: "Dark" },
              { value: "high-contrast" as Theme,  icon: Contrast, label: "HC" },
            ]).map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                title={label + " mode"}
                onClick={() => setTheme(value)}
                className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-xs transition-all ${
                  theme === value
                    ? "bg-background/20 text-white font-medium"
                    : "text-white/40 hover:text-white/70 hover:bg-background/10"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-white/60 hover:text-white hover:bg-background/10 gap-2 justify-start"
            onClick={() => logout().then(() => { window.location.href = "/"; })}
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
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 border-b bg-background sticky top-0 z-30">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-gray-600 hover:text-gray-900"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <img
              src="/manus-storage/whip_logo_5e114d45.webp"
              alt="Whip"
              className="h-7 w-auto object-contain"
            />
            <span className="font-semibold text-sm text-foreground">Claims IVR</span>
          </div>
          {isAdmin && isImpersonating && (
            <span className="ml-auto text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
              Viewing as {impersonating!.name}
            </span>
          )}
        </header>

        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
