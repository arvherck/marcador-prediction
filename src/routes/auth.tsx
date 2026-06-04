import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { signInFn, signUpFn } from "@/lib/auth.functions";
import { setGuest, clearGuest } from "@/lib/guest";

export const Route = createFileRoute("/auth")({
  head: () => {
    const url = "https://marcador-prediction.lovable.app/auth";
    const title = "Sign in or create your account · Marcador";
    const description =
      "Sign in to Marcador or create a free account to predict every World Cup 2026 matchday, run private leagues, and join the global leaderboard.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const router = useRouter();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") await signUpFn({ data: { email, password } });
      else await signInFn({ data: { email, password } });
      clearGuest();
      toast.success("Welcome to Marcador.");
      await router.invalidate();
      navigate({ to: "/onboarding" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const continueAsGuest = () => {
    setGuest(true);
    toast("Guest mode on.");
    navigate({ to: "/play" });
  };

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
        <div className="w-full max-w-sm">
          <h1 className="font-display font-bold text-3xl mb-1">
            {mode === "signin" ? "Welcome back" : "Join the scoreboard"}
          </h1>
          <p className="text-sm text-muted-foreground mb-8">
            {mode === "signin"
              ? "Sign in to make this matchday's calls."
              : "Create an account in seconds."}
          </p>

          <button
            type="button"
            onClick={() => toast.info("Google sign-in: ask your admin to configure OAuth credentials.")}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold hover:bg-secondary transition mb-4"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <div className="relative my-4 text-center text-xs uppercase tracking-widest text-muted-foreground">
            <span className="bg-background px-3 relative z-10">or email</span>
            <span className="absolute inset-x-0 top-1/2 h-px bg-border -z-0" />
          </div>

          <form onSubmit={submit} className="space-y-3">
            <label htmlFor="auth-email" className="sr-only">
              Email
            </label>
            <input
              id="auth-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl bg-input border border-border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/50"
            />
            <label htmlFor="auth-password" className="sr-only">
              Password
            </label>
            <input
              id="auth-password"
              name="password"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              minLength={8}
              placeholder="Password (min 8 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl bg-input border border-border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/50"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-amber-gradient px-4 py-3 text-sm font-bold shadow-glow disabled:opacity-50"
            >
              {loading ? "..." : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => setMode((m) => (m === "signin" ? "signup" : "signin"))}
            className="mt-6 w-full text-sm text-muted-foreground hover:text-foreground"
          >
            {mode === "signin"
              ? "New here? Create an account →"
              : "Already on Marcador? Sign in →"}
          </button>

          <div className="relative my-5 text-center text-xs uppercase tracking-widest text-muted-foreground">
            <span className="bg-background px-3 relative z-10">o</span>
            <span className="absolute inset-x-0 top-1/2 h-px bg-border -z-0" />
          </div>

          <button
            type="button"
            onClick={continueAsGuest}
            className="w-full rounded-xl border border-border bg-secondary/40 px-4 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary transition"
          >
            Continue as guest
          </button>
          <p className="mt-2 text-[11px] text-center text-muted-foreground/70">
            Read-only. You can't predict or appear on the leaderboard.
          </p>
        </div>
      </main>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.4 14.6 2.5 12 2.5 6.8 2.5 2.6 6.7 2.6 12s4.2 9.5 9.4 9.5c5.4 0 9-3.8 9-9.2 0-.6-.1-1.1-.2-1.6H12z"
      />
    </svg>
  );
}
