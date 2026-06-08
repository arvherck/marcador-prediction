import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell } from "@/components/auth/AuthShell";
import { recordConsentFn } from "@/lib/auth.functions";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({
    meta: [
      { title: "Confirming · Marcador" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CallbackPage,
});

function CallbackPage() {
  const navigate = useNavigate();
  const recordConsent = useServerFn(recordConsentFn);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const url = new URL(window.location.href);
      const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
      const hashParams = new URLSearchParams(hash);
      const type = url.searchParams.get("type") ?? hashParams.get("type");

      // Give supabase-js a tick to auto-exchange the hash/code into a session
      await new Promise((r) => setTimeout(r, 50));

      const { data: { user }, error } = await supabase.auth.getUser();
      if (cancelled) return;

      if (error || !user) {
        toast.error("Confirmation link expired or invalid.");
        navigate({ to: "/auth", replace: true });
        return;
      }

      if (type === "recovery") {
        navigate({ to: "/auth/new-password", replace: true });
        return;
      }

      // Email confirmation or OAuth success
      let { data: profile } = await supabase
        .from("profiles")
        .select("display_name, consent_recorded_at")
        .eq("user_id", user.id)
        .maybeSingle();

      // If the user ticked consent on the email signup screen, record it now.
      let consentPending = false;
      try {
        consentPending = window.sessionStorage.getItem("marcador_consent_pending") === "1";
        if (consentPending) window.sessionStorage.removeItem("marcador_consent_pending");
      } catch {
        /* ignore */
      }
      if (consentPending && !profile?.consent_recorded_at) {
        try {
          await recordConsent({ data: { age_confirmed: true, privacy_accepted: true } });
          const refreshed = await supabase
            .from("profiles")
            .select("display_name, consent_recorded_at")
            .eq("user_id", user.id)
            .maybeSingle();
          profile = refreshed.data ?? profile;
        } catch {
          /* ignore; user can re-consent at /consent */
        }
      }

      // Honor a pending invite link captured before sign-in.
      let pendingInvite: string | null = null;
      try {
        pendingInvite = window.sessionStorage.getItem("marcador_pending_invite");
        if (pendingInvite) window.sessionStorage.removeItem("marcador_pending_invite");
      } catch {
        /* ignore */
      }

      toast.success("Email confirmed! Welcome to Marcador ⚽");
      if (pendingInvite && profile?.display_name) {
        navigate({ to: "/leagues/join", search: { code: pendingInvite }, replace: true });
        return;
      }
      if (profile?.display_name) {
        navigate({ to: "/play", replace: true });
        return;
      }
      // No display name yet — gate on consent first (covers Google OAuth users).
      if (!profile?.consent_recorded_at) {
        navigate({ to: "/consent", replace: true });
        return;
      }
      navigate({ to: "/onboarding", replace: true });
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [navigate, recordConsent]);

  return (
    <AuthShell>
      <p className="text-sm text-muted-foreground text-center">Confirming your account…</p>
    </AuthShell>
  );
}
