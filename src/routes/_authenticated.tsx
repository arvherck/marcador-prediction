import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { meFn } from "@/lib/auth.functions";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    const me = await meFn();
    if (!me) throw redirect({ to: "/auth" });
    if (!me.profile && location.pathname !== "/onboarding") {
      throw redirect({ to: "/onboarding" });
    }
    return { me };
  },
  component: () => <Outlet />,
});
