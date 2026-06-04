import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { joinLeagueFn } from "@/lib/game.functions";

export const Route = createFileRoute("/_authenticated/leagues/join")({
  head: () => ({ meta: [{ title: "Unirse a la liga · Marcador" }] }),
  validateSearch: (search: Record<string, unknown>): { code?: string } => {
    const raw = typeof search.code === "string" ? search.code.toUpperCase() : "";
    return /^MRC-[A-Z0-9]{4}$/.test(raw) ? { code: raw } : {};
  },
  beforeLoad: ({ search }) => {
    if (!search.code) throw redirect({ to: "/leagues" });
  },
  component: JoinLeaguePage,
});

function JoinLeaguePage() {
  const { me } = Route.useRouteContext();
  const { code } = Route.useSearch();
  const navigate = useNavigate();

  const join = useMutation({
    mutationFn: () => joinLeagueFn({ data: { invite_code: code! } }),
    onSuccess: (r) => {
      toast.success("¡Te uniste a la liga!");
      navigate({ to: "/leagues/$id", params: { id: r.id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Código inválido."),
  });

  return (
    <AppShell displayName={me.profile?.display_name} isAdmin={me.is_admin}>
      <div className="max-w-md mx-auto py-12">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-card text-center">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            Invitación a una liga
          </div>
          <h1 className="font-display font-bold text-2xl mt-2">Unirse a la liga</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Vas a unirte con el código
          </p>
          <div className="mt-4 font-score font-bold text-3xl tracking-widest text-primary">
            {code}
          </div>
          <div className="mt-6 flex gap-2">
            <button
              onClick={() => navigate({ to: "/leagues" })}
              className="flex-1 rounded-xl border border-border bg-secondary px-4 py-2.5 text-sm font-bold"
            >
              Cancelar
            </button>
            <button
              onClick={() => join.mutate()}
              disabled={join.isPending}
              className="flex-1 rounded-xl bg-amber-gradient px-4 py-2.5 text-sm font-bold shadow-glow disabled:opacity-40"
            >
              {join.isPending ? "Uniéndose…" : "Unirse"}
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
