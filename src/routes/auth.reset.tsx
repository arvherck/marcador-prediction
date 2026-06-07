import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell } from "@/components/auth/AuthShell";
import { CheckInboxPanel } from "@/components/auth/CheckInboxPanel";

export const Route = createFileRoute("/auth/reset")({
  head: () => ({
    meta: [
      { title: "Reset your password · Marcador" },
      { name: "description", content: "Reset your Marcador password." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPage,
});

function ResetPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const redirect = () =>
    typeof window !== "undefined"
      ? `${window.location.origin}/auth/callback?type=recovery`
      : undefined;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirect(),
      });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send reset link.");
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirect(),
    });
    if (error) throw error;
  };

  if (sent) {
    return (
      <AuthShell>
        <CheckInboxPanel
          email={email}
          description={
            <>
              We sent a password reset link to <strong className="text-foreground">{email}</strong>. Click it to choose a new password.
            </>
          }
          onResend={resend}
          bottomSlot={
            <Link to="/auth" className="text-muted-foreground hover:text-foreground">
              Back to sign in →
            </Link>
          }
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1 className="font-display font-bold text-3xl mb-1">Reset your password</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Enter your email and we'll send you a reset link.
      </p>

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
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-amber-gradient px-4 py-3 text-sm font-bold shadow-glow disabled:opacity-50"
        >
          {loading ? "..." : "Send reset link"}
        </button>
      </form>

      <div className="mt-6 text-sm text-center">
        <Link to="/auth" className="text-muted-foreground hover:text-foreground">
          Back to sign in →
        </Link>
      </div>
    </AuthShell>
  );
}
