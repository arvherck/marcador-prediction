import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell } from "@/components/auth/AuthShell";

export const Route = createFileRoute("/auth/new-password")({
  head: () => ({
    meta: [
      { title: "Set a new password · Marcador" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NewPasswordPage,
});

function NewPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        toast.error("Reset link expired or invalid. Please request a new one.");
        navigate({ to: "/auth/reset", replace: true });
        return;
      }
      setReady(true);
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return toast.error("Password must be at least 8 characters.");
    if (password !== confirm) return toast.error("Passwords don't match.");
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      await supabase.auth.signOut();
      toast.success("Password updated. Please sign in.");
      navigate({ to: "/auth", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update password.");
    } finally {
      setLoading(false);
    }
  };

  if (!ready) {
    return (
      <AuthShell>
        <p className="text-sm text-muted-foreground text-center">Loading…</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1 className="font-display font-bold text-3xl mb-1">Set a new password</h1>
      <p className="text-sm text-muted-foreground mb-8">Choose a strong password you haven't used before.</p>

      <form onSubmit={submit} className="space-y-3">
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="New password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl bg-input border border-border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/50"
        />
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="Confirm new password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full rounded-xl bg-input border border-border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/50"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-amber-gradient px-4 py-3 text-sm font-bold shadow-glow disabled:opacity-50"
        >
          {loading ? "..." : "Update password"}
        </button>
      </form>
    </AuthShell>
  );
}
