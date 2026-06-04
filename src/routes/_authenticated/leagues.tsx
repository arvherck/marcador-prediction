import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { createLeagueFn, getMyLeagues, joinLeagueFn } from "@/lib/game.functions";

export const Route = createFileRoute("/_authenticated/leagues")({
  head: () => ({ meta: [{ title: "Leagues · Marcador" }] }),
  component: LeaguesPage,
});

function LeaguesPage() {
  const { me } = Route.useRouteContext();
  const qc = useQueryClient();
  const leagues = useQuery({ queryKey: ["leagues"], queryFn: () => getMyLeagues() });
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  const create = useMutation({
    mutationFn: () => createLeagueFn({ data: { name } }),
    onSuccess: (r) => {
      toast.success(`League created. Code: ${r.invite_code}`);
      setName("");
      qc.invalidateQueries({ queryKey: ["leagues"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed."),
  });

  const join = useMutation({
    mutationFn: () => joinLeagueFn({ data: { invite_code: code } }),
    onSuccess: () => {
      toast.success("Joined.");
      setCode("");
      qc.invalidateQueries({ queryKey: ["leagues"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed."),
  });

  return (
    <AppShell displayName={me.profile?.display_name} isAdmin={me.is_admin}>
      <div className="mb-6">
        <h1 className="font-display font-bold text-2xl md:text-3xl">Leagues</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Play with friends in private mini-leagues.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-3 mb-8">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
            Create a league
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="League name"
            className="w-full rounded-xl bg-input border border-border px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/50"
          />
          <button
            onClick={() => create.mutate()}
            disabled={!name.trim() || create.isPending}
            className="mt-3 w-full rounded-xl bg-amber-gradient px-4 py-2.5 text-sm font-bold shadow-glow disabled:opacity-40"
          >
            Create
          </button>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
            Join with code
          </div>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABC123"
            className="w-full rounded-xl bg-input border border-border px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/50 font-score tracking-widest uppercase"
          />
          <button
            onClick={() => join.mutate()}
            disabled={!code.trim() || join.isPending}
            className="mt-3 w-full rounded-xl border border-border bg-secondary px-4 py-2.5 text-sm font-bold disabled:opacity-40"
          >
            Join
          </button>
        </div>
      </div>

      <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
        Your leagues
      </div>
      <div className="space-y-2">
        {leagues.data?.length === 0 && (
          <div className="text-sm text-muted-foreground py-8 text-center">
            No leagues yet. Create one and share the code with friends.
          </div>
        )}
        {leagues.data?.map((l) => (
          <Link
            key={l.id}
            to="/leagues/$id"
            params={{ id: l.id }}
            className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 hover:bg-secondary transition"
          >
            <div>
              <div className="font-semibold">{l.name}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {l.member_count} member{l.member_count === 1 ? "" : "s"}
              </div>
            </div>
            <div className="font-score font-bold tracking-widest text-primary">
              {l.invite_code}
            </div>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
