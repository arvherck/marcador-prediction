import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell } from "@/components/auth/AuthShell";

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
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", user.id)
        .maybeSingle();

      toast.success("Email confirmed! Welcome to Marcador ⚽");
      navigate({ to: profile?.display_name ? "/play" : "/onboarding", replace: true });
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <AuthShell>
      <p className="text-sm text-muted-foreground text-center">Confirming your account…</p>
    </AuthShell>
  );
}
