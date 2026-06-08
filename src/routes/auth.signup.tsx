import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Check, Circle, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell } from "@/components/auth/AuthShell";

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

function ReqRow({ met, label }: { met: boolean; label: string }) {
  return (
    <li
      className={`flex items-center gap-2 text-xs transition-colors ${
        met ? "text-emerald-500" : "text-muted-foreground"
      }`}
    >
      {met ? <Check className="size-3.5" /> : <Circle className="size-3.5" />}
      <span>{label}</span>
    </li>
  );
}

function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [age18, setAge18] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [showConsentErrors, setShowConsentErrors] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const len = password.length >= 8;
  const upper = /[A-Z]/.test(password);
  const lower = /[a-z]/.test(password);
  const digit = /[0-9]/.test(password);
  const metCount = [len, upper, lower, digit].filter(Boolean).length;
  const allMet = metCount === 4;
  const confirmMatches = confirm.length > 0 && confirm === password;
  const confirmMismatch = confirmTouched && confirm.length > 0 && confirm !== password;

  const strength =
    metCount === 0
      ? null
      : metCount <= 2
        ? { label: "Weak", color: "text-destructive", bar: "bg-destructive", width: "33%" }
        : metCount === 3
          ? { label: "Almost there", color: "text-amber-glow", bar: "bg-amber-glow", width: "66%" }
          : { label: "Strong", color: "text-emerald-500", bar: "bg-emerald-500", width: "100%" };

  const redirect = () =>
    typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!age18 || !privacy) {
      setShowConsentErrors(true);
      return;
    }
    if (!allMet) {
      toast.error("Password not strong enough. Please use at least 8 characters including uppercase, lowercase and a number.");
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
      const msg = err instanceof Error ? err.message : "";
      if (/password/i.test(msg) || /weak/i.test(msg)) {
        toast.error("Password not strong enough. Please use at least 8 characters including uppercase, lowercase and a number.");
      } else {
        toast.error(msg || "Could not create account.");
      }
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
                setConfirmTouched(false);
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

  const submitDisabled =
    loading || !age18 || !privacy || !allMet || password !== confirm;

  return (
    <AuthShell>
      <h1 className="font-display font-bold text-3xl mb-1">Create your account</h1>
      <p className="text-sm text-muted-foreground mb-8">Join Marcador and start predicting.</p>

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
          {password.length > 0 && (
            <div className="mt-2 space-y-2">
              <ul className="space-y-1 pl-1">
                <ReqRow met={len} label="At least 8 characters" />
                <ReqRow met={upper} label="One uppercase letter (A-Z)" />
                <ReqRow met={lower} label="One lowercase letter (a-z)" />
                <ReqRow met={digit} label="One number (0-9)" />
              </ul>
              {strength && (
                <div className="space-y-1">
                  <div className="h-1 w-full rounded-full bg-secondary overflow-hidden">
                    <div
                      className={`h-full ${strength.bar} transition-all duration-300`}
                      style={{ width: strength.width }}
                    />
                  </div>
                  <p className={`text-[11px] font-medium ${strength.color}`}>{strength.label}</p>
                </div>
              )}
            </div>
          )}
        </div>
        <div>
          <div className="relative">
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              placeholder="Confirm password"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                if (!confirmTouched) setConfirmTouched(true);
              }}
              className="w-full rounded-xl bg-input border border-border px-4 py-3 pr-10 text-sm outline-none focus:ring-2 focus:ring-primary/50"
            />
            {confirmMatches && (
              <Check
                className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-emerald-500"
                aria-label="Passwords match"
              />
            )}
            {confirmMismatch && (
              <X
                className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-destructive"
                aria-label="Passwords do not match"
              />
            )}
          </div>
          {confirmMismatch && (
            <p className="mt-1 ml-1 text-[11px] text-destructive">Passwords don't match</p>
          )}
        </div>

        <div className="space-y-2 pt-1">
          <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={age18}
              onChange={(e) => setAge18(e.target.checked)}
              className="mt-0.5 size-4 rounded border-border accent-amber-glow"
            />
            <span>I am 18 years of age or older</span>
          </label>
          {showConsentErrors && !age18 && (
            <p className="ml-6 text-[11px] text-destructive">
              Please confirm you are 18+ to continue
            </p>
          )}
          <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={privacy}
              onChange={(e) => setPrivacy(e.target.checked)}
              className="mt-0.5 size-4 rounded border-border accent-amber-glow"
            />
            <span>
              I agree to the{" "}
              <a
                href="/privacy"
                target="_blank"
                rel="noreferrer"
                className="text-amber-glow hover:underline"
              >
                Privacy Policy
              </a>{" "}
              and understand how my data is used
            </span>
          </label>
          {showConsentErrors && !privacy && (
            <p className="ml-6 text-[11px] text-destructive">
              Please agree to the Privacy Policy to continue
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={submitDisabled}
          className="w-full rounded-xl bg-amber-gradient px-4 py-3 text-sm font-bold shadow-glow disabled:opacity-50 disabled:cursor-not-allowed"
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
