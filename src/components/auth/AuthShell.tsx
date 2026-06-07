import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-6 py-5 max-w-6xl mx-auto w-full">
        <Link to="/" className="flex items-center gap-2">
          <div className="size-9 rounded-lg bg-amber-gradient flex items-center justify-center shadow-glow">
            <span className="font-score font-bold text-primary-foreground">M</span>
          </div>
          <span className="font-display font-bold tracking-tight">Marcador</span>
        </Link>
      </header>
      <main className="flex-1 flex items-center justify-center px-6 pb-12">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}

export function GoogleButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold hover:bg-secondary transition mb-4"
    >
      <svg viewBox="0 0 24 24" className="size-4">
        <path
          fill="#EA4335"
          d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.4 14.6 2.5 12 2.5 6.8 2.5 2.6 6.7 2.6 12s4.2 9.5 9.4 9.5c5.4 0 9-3.8 9-9.2 0-.6-.1-1.1-.2-1.6H12z"
        />
      </svg>
      Continue with Google
    </button>
  );
}

export function OrDivider({ label = "or email" }: { label?: string }) {
  return (
    <div className="relative my-4 text-center text-xs uppercase tracking-widest text-muted-foreground">
      <span className="bg-background px-3 relative z-10">{label}</span>
      <span className="absolute inset-x-0 top-1/2 h-px bg-border -z-0" />
    </div>
  );
}
