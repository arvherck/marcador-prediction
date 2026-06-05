import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { meFn, type CurrentUser } from "@/lib/auth.functions";
import { supabase } from "@/integrations/supabase/client";

const GUEST_ALLOWED = new Set(["/play", "/leaderboard"]);

const GUEST_ME: CurrentUser = {
  id: "",
  email: "",
  is_admin: false,
  profile: null,
};

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) {
      const me = await meFn();
      if (me?.profile?.theme_preference && typeof window !== "undefined") {
        try {
          if (!window.localStorage.getItem("marcador_theme")) {
            const { setTheme } = await import("@/lib/theme");
            setTheme(me.profile.theme_preference);
          }
        } catch {
          /* ignore */
        }
      }
      if (me && !me.profile && location.pathname !== "/onboarding") {
        throw redirect({ to: "/onboarding" });
      }
      return { me: me ?? GUEST_ME, isGuest: false };
    }
    if (typeof window !== "undefined") {
      try {
        const guest = window.sessionStorage.getItem("marcador_guest") === "1";
        if (guest && GUEST_ALLOWED.has(location.pathname)) {
          return { me: GUEST_ME, isGuest: true };
        }
      } catch {
        /* fallthrough */
      }
    }
    throw redirect({ to: "/auth" });
  },
  component: () => <Outlet />,
});
