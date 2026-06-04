import { Link, useLocation, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { signOutFn } from "@/lib/auth.functions";
import { toast } from "sonner";

const tabs = [
  { to: "/play", label: "Play", icon: BallIcon },
  { to: "/leaderboard", label: "Table", icon: TableIcon },
  { to: "/leagues", label: "Ligas", icon: LeagueIcon },
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

  const logout = async () => {
    await signOutFn();
    toast.success("Signed out.");
    await router.invalidate();
    router.navigate({ to: "/" });
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
            {tabs.map((t) => (
              <NavLink key={t.to} to={t.to} active={loc.pathname.startsWith(t.to)}>
                {t.label}
              </NavLink>
            ))}
            {isAdmin && (
              <NavLink to="/admin" active={loc.pathname.startsWith("/admin")}>
                Panel
              </NavLink>
            )}

          </nav>
          <div className="flex items-center gap-3">
            {displayName && (
              <span className="hidden sm:inline text-xs text-muted-foreground">
                {displayName}
              </span>
            )}
            <button
              onClick={logout}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6">{children}</main>

      <nav className="fixed md:hidden bottom-0 inset-x-0 z-30 border-t border-border bg-background/95 backdrop-blur">
        <div className="grid grid-cols-3 max-w-md mx-auto">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = loc.pathname.startsWith(t.to);
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
          })}
        </div>
      </nav>
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
