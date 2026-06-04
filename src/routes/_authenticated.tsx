import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { meFn } from "@/lib/auth.functions";
import type { CurrentUser } from "@/lib/auth.server";

const GUEST_ALLOWED = new Set(["/play", "/leaderboard"]);

const GUEST_ME: CurrentUser = {
  id: "",
  email: "",
  is_admin: false,
  profile: null,
};

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    const me = await meFn();
    if (me) {
      if (!me.profile && location.pathname !== "/onboarding") {
        throw redirect({ to: "/onboarding" });
      }
      return { me, isGuest: false };
    }
    // No real user — allow guest for a limited subset (client-only check).
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
