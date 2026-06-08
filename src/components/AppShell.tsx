import { Link, useLocation, useRouter } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useGuest, clearGuest } from "@/lib/guest";
import { useGuestGate } from "@/components/GuestGate";
import { supabase } from "@/integrations/supabase/client";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DonateModal } from "@/components/DonateModal";
import { FeedbackButton } from "@/components/feedback/FeedbackButton";

const tabs = [
  { to: "/play", label: "Play", icon: BallIcon, guest: true },
  { to: "/leaderboard", label: "Tabla", icon: TableIcon, guest: true },
  { to: "/grupos", label: "Grupos", icon: GroupsIcon, guest: true },
  { to: "/leagues", label: "Ligas", icon: LeagueIcon, guest: false },
  { to: "/me", label: "Mi Marcador", icon: UserIcon, guest: false },
] as const;


export function AppShell({
  children,
  displayName,
  isAdmin,
}: {
  children: ReactNode;
  displayName?: string;
  isAdmin?: boolean;
}) {
  const loc = useLocation();
  const router = useRouter();
  const guest = useGuest();
  const guestGate = useGuestGate();
  const [donateOpen, setDonateOpen] = useState(false);

  const logout = async () => {
    if (guest) {
      clearGuest();
      router.navigate({ to: "/" });
      return;
    }
    await supabase.auth.signOut();
    toast.success("Signed out.");
    await router.invalidate();
    router.navigate({ to: "/" });
  };


  const renderTab = (t: typeof tabs[number], variant: "top" | "bottom") => {
    const Icon = t.icon;
    const active = loc.pathname.startsWith(t.to);
    if (guest && !t.guest) {
      const cls =
        variant === "top"
          ? `px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
            }`
          : `flex flex-col items-center gap-1 py-3 text-[11px] font-medium transition ${
              active ? "text-primary" : "text-muted-foreground"
            }`;
      return (
        <button
          key={t.to}
          type="button"
          onClick={() => guestGate.setOpen(true)}
          className={cls}
        >
          {variant === "bottom" && <Icon active={active} />}
          {t.label}
        </button>
      );
    }
    if (variant === "top") {
      return (
        <NavLink key={t.to} to={t.to} active={active}>
          {t.label}
        </NavLink>
      );
    }
    return (
      <Link
        key={t.to}
        to={t.to}
        className={`flex flex-col items-center gap-1 py-3 text-[11px] font-medium transition ${
          active ? "text-primary" : "text-muted-foreground"
        }`}
      >
        <Icon active={active} />
        {t.label}
      </Link>
    );
  };

  return (
    <div className="min-h-screen flex flex-col pb-20 md:pb-0">
      <header className="sticky top-0 z-30 backdrop-blur bg-background/80 border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/play" className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-amber-gradient flex items-center justify-center shadow-glow">
              <span className="font-score font-bold text-primary-foreground text-sm">M</span>
            </div>
            <span className="font-display font-bold tracking-tight">Marcador</span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {tabs.map((t) => renderTab(t, "top"))}
            {!guest && isAdmin && (
              <NavLink to="/admin" active={loc.pathname.startsWith("/admin")}>
                Panel
              </NavLink>
            )}
          </nav>
          <div className="flex items-center gap-3">
            {guest ? (
              <span className="hidden sm:inline text-[10px] uppercase tracking-widest font-bold text-amber-glow border border-primary/40 rounded px-1.5 py-0.5">
                Guest
              </span>
            ) : (
              displayName && (
                <span className="hidden sm:inline text-xs text-muted-foreground">
                  {displayName}
                </span>
              )
            )}
            <ThemeToggle />
            <button
              onClick={logout}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors duration-200"
            >
              {guest ? "Exit" : "Sign out"}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6">{children}</main>

      <footer className="max-w-3xl mx-auto w-full px-4 py-4 text-center">
        <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => setDonateOpen(true)}
            className="hover:text-amber-glow transition-colors"
          >
            Support Marcador
          </button>
          <span aria-hidden>·</span>
          <Link to="/rules" className="hover:text-amber-glow transition-colors">
            Rules
          </Link>
          <span aria-hidden>·</span>
          <Link to="/privacy" className="hover:text-amber-glow transition-colors">
            Privacy
          </Link>
          <span aria-hidden>·</span>
          <FeedbackButton displayName={displayName} />
        </div>
      </footer>


      <nav className="fixed md:hidden bottom-0 inset-x-0 z-30 border-t border-border bg-background/95 backdrop-blur">
        <div className="grid grid-cols-4 max-w-md mx-auto">
          {tabs.map((t) => renderTab(t, "bottom"))}
        </div>
      </nav>
      {guestGate.modal}
      <DonateModal open={donateOpen} onOpenChange={setDonateOpen} />
    </div>
  );
}

function NavLink({
  to,
  active,
  children,
}: {
  to: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
        active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}

function BallIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      {active && <circle cx="12" cy="12" r="3" fill="currentColor" />}
    </svg>
  );
}
function TableIcon({ active: _ }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}
function LeagueIcon({ active: _ }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 9V5h12v4a6 6 0 1 1-12 0Z" />
      <path d="M9 21h6M12 15v6" />
    </svg>
  );
}
function UserIcon({ active: _ }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </svg>
  );
}
function GroupsIcon({ active: _ }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

