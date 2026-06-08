import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { AuthShell, GoogleButton, OrDivider } from "@/components/auth/AuthShell";
import { CheckInboxPanel } from "@/components/auth/CheckInboxPanel";

export const Route = createFileRoute("/auth/signup")({
  head: () => {
    const url = "https://marcador-prediction.lovable.app/auth/signup";
    const title = "Create your account · Marcador";
    const description = "Join Marcador and start predicting every World Cup 2026 matchday.";
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
  component: SignupPage,
});

function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [age18, setAge18] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [showConsentErrors, setShowConsentErrors] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const redirect = () =>
    typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!age18 || !privacy) {
      setShowConsentErrors(true);
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirect() },
      });
      if (error) throw error;
      try {
        window.sessionStorage.setItem("marcador_consent_pending", "1");
      } catch {
        /* ignore */
      }
      setSentTo(email);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create account.");
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (!sentTo) return;
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: sentTo,
      options: { emailRedirectTo: redirect() },
    });
    if (error) throw error;
  };

  const googleSignIn = async () => {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: redirect() });
    if (result.error) toast.error(result.error instanceof Error ? result.error.message : "Google sign-in failed.");
  };

  if (sentTo) {
    return (
      <AuthShell>
        <CheckInboxPanel
          email={sentTo}
          onResend={resend}
          bottomSlot={
            <button
              type="button"
              onClick={() => {
                setSentTo(null);
                setEmail("");
                setPassword("");
                setConfirm("");
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              Wrong email? Sign up again →
            </button>
          }
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1 className="font-display font-bold text-3xl mb-1">Create your account</h1>
      <p className="text-sm text-muted-foreground mb-8">Join Marcador and start predicting.</p>

      <GoogleButton onClick={googleSignIn} />
      <OrDivider />

      <form onSubmit={submit} className="space-y-3">
        <input
          type="email"
          autoComplete="email"
          required
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl bg-input border border-border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/50"
        />
        <div>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl bg-input border border-border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/50"
          />
          <p className="mt-1 ml-1 text-[11px] text-muted-foreground">At least 8 characters</p>
        </div>
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="Confirm password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full rounded-xl bg-input border border-border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/50"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-amber-gradient px-4 py-3 text-sm font-bold shadow-glow disabled:opacity-50"
        >
          {loading ? "..." : "Create account"}
        </button>
      </form>

      <p className="mt-4 text-[11px] text-center text-muted-foreground leading-relaxed">
        By creating an account you agree to our{" "}
        <Link to="/rules" className="text-amber-glow hover:underline">Rules</Link>
        {" "}and{" "}
        <Link to="/privacy" className="text-amber-glow hover:underline">Privacy Policy</Link>.
      </p>

      <div className="mt-6 text-sm text-center">
        <Link to="/auth" className="text-muted-foreground hover:text-foreground">
          Already have an account? Sign in →
        </Link>
      </div>
    </AuthShell>
  );
}
