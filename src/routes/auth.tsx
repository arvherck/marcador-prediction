import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { setGuest, clearGuest } from "@/lib/guest";
import { lovable } from "@/integrations/lovable";
import { AuthShell, GoogleButton, OrDivider } from "@/components/auth/AuthShell";

export const Route = createFileRoute("/auth")({
  head: () => {
    const url = "https://marcador-prediction.lovable.app/auth";
    const title = "Sign in · Marcador";
    const description =
      "Sign in to Marcador to predict every World Cup 2026 matchday, run private leagues, and join the global leaderboard.";
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [resending, setResending] = useState(false);
  const navigate = useNavigate();
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/play", replace: true });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setNeedsConfirm(false);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (/confirm/i.test(error.message) || /not confirmed/i.test(error.message)) {
          setNeedsConfirm(true);
          throw new Error("Please confirm your email first. Check your inbox or resend the confirmation email.");
        }
        throw error;
      }
      clearGuest();
      toast.success("Welcome to Marcador.");
      await router.invalidate();
      navigate({ to: "/play" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const resendConfirmation = async () => {
    if (!email) {
      toast.error("Enter your email first.");
      return;
    }
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      toast.success("Email resent ✓");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not resend email.");
    } finally {
      setResending(false);
    }
  };

  const continueAsGuest = () => {
    setGuest(true);
    toast("Guest mode on.");
    navigate({ to: "/play" });
  };

  const googleSignIn = async () => {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/auth/callback`,
    });
    if (result.error) toast.error(result.error instanceof Error ? result.error.message : "Google sign-in failed.");
  };

  return (
    <AuthShell>
      <h1 className="font-display font-bold text-3xl mb-1">Welcome back</h1>
      <p className="text-sm text-muted-foreground mb-8">Sign in to make this matchday's calls.</p>

      <GoogleButton onClick={googleSignIn} />
      <OrDivider />

      <form onSubmit={submit} className="space-y-3">
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
        <input
          id="auth-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl bg-input border border-border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/50"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-amber-gradient px-4 py-3 text-sm font-bold shadow-glow disabled:opacity-50"
        >
          {loading ? "..." : "Sign in"}
        </button>
      </form>

      {needsConfirm && (
        <div className="mt-4 rounded-xl border border-border bg-secondary/40 p-3 text-sm">
          <p className="text-muted-foreground mb-2">
            Please confirm your email first. Check your inbox or resend below.
          </p>
          <button
            type="button"
            onClick={resendConfirmation}
            disabled={resending}
            className="w-full rounded-lg bg-amber-gradient px-3 py-2 text-xs font-bold shadow-glow disabled:opacity-50"
          >
            {resending ? "Sending..." : "Resend confirmation email"}
          </button>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-2 text-sm text-center">
        <Link to="/auth/signup" className="text-muted-foreground hover:text-foreground">
          New here? Create an account →
        </Link>
        <Link to="/auth/reset" className="text-muted-foreground hover:text-foreground">
          Forgot your password?
        </Link>
      </div>

      <OrDivider label="o" />

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
    </AuthShell>
  );
}
