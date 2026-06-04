import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Share2, Trophy } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { createLeagueFn, getMyLeagues, joinLeagueFn } from "@/lib/game.functions";

export const Route = createFileRoute("/_authenticated/leagues")({
  head: () => {
    const url = "https://marcador-prediction.lovable.app/leagues";
    const title = "Ligas · Private prediction leagues · Marcador";
    const description =
      "Create or join private Marcador leagues to compete with friends across the World Cup 2026 — share an invite code and track your mini-table.";
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
  component: LeaguesPage,
});

const MAX_OWNED = 3;

function LeaguesPage() {
  const { me } = Route.useRouteContext();
  const qc = useQueryClient();
  const leagues = useQuery({ queryKey: ["leagues"], queryFn: () => getMyLeagues() });
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  const ownedCount = (leagues.data ?? []).filter((l) => l.owner_id === me.id).length;
  const atCap = ownedCount >= MAX_OWNED;

  const create = useMutation({
    mutationFn: () => createLeagueFn({ data: { name } }),
    onSuccess: (r) => {
      toast.success(`League created. Code: ${r.invite_code}`);
      setName("");
      qc.invalidateQueries({ queryKey: ["leagues"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Something went wrong."),
  });

  const join = useMutation({
    mutationFn: () => joinLeagueFn({ data: { invite_code: code } }),
    onSuccess: () => {
      toast.success("Joined the league!");
      setCode("");
      qc.invalidateQueries({ queryKey: ["leagues"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Invalid code."),
  });

  const copyShare = async (inviteCode: string) => {
    const url = `${window.location.origin}/leagues/join?code=${inviteCode}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard.");
    } catch {
      toast.error("Couldn't copy the link.");
    }
  };

  return (
    <AppShell displayName={me.profile?.display_name} isAdmin={me.is_admin}>
      <div className="mb-6">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">
          Community
        </div>
        <h1 className="font-display font-bold text-3xl md:text-4xl mt-1 tracking-tight">
          Ligas
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Compete with friends in private mini-leagues.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-3 mb-8">
        <div className="rounded-2xl border border-border bg-card p-4">
          <label
            htmlFor="league-name"
            className="block text-xs uppercase tracking-widest text-muted-foreground mb-3"
          >
            Create league
          </label>
          <input
            id="league-name"
            name="league_name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={50}
            placeholder="League name"
            className="w-full rounded-xl bg-input border border-border px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/50"
          />
          <button
            onClick={() => create.mutate()}
            disabled={!name.trim() || create.isPending || atCap}
            className="mt-3 w-full rounded-xl bg-amber-gradient px-4 py-2.5 text-sm font-bold shadow-glow disabled:opacity-40"
          >
            {atCap ? "Limit reached" : "Create"}
          </button>
          <div className="mt-2 text-[11px] text-muted-foreground">
            {ownedCount}/{MAX_OWNED} leagues created
            {atCap && " · max allowed"}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <label
            htmlFor="invite-code"
            className="block text-xs uppercase tracking-widest text-muted-foreground mb-3"
          >
            Join with code
          </label>
          <div className="flex items-stretch rounded-xl bg-input border border-border overflow-hidden focus-within:ring-2 focus-within:ring-primary/50">
            <span className="px-3 flex items-center font-score font-bold text-primary text-sm">
              MRC-
            </span>
            <input
              id="invite-code"
              name="invite_code"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))
              }
              placeholder="XXXX"
              className="flex-1 bg-transparent px-1 py-2.5 text-sm font-score tracking-widest uppercase outline-none"
            />
          </div>
          <button
            onClick={() => join.mutate()}
            disabled={code.length < 4 || join.isPending}
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
        {leagues.isLoading && (
          <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
        )}
        {leagues.data?.length === 0 && (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            You're not in any leagues yet. Create one or join with a code.
          </div>
        )}
        {leagues.data?.map((l) => (
          <div
            key={l.id}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 hover:bg-secondary/50 transition"
          >
            <Link
              to="/leagues/$id"
              params={{ id: l.id }}
              className="flex-1 min-w-0"
            >
              <div className="font-semibold truncate">{l.name}</div>
              <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                <span>
                  {l.member_count} member{l.member_count === 1 ? "" : "s"}
                </span>
                <span aria-hidden>·</span>
                <span className="font-score font-bold tracking-widest text-primary">
                  {l.invite_code}
                </span>
                {l.owner_id === me.id && (
                  <span className="text-[10px] uppercase tracking-wider text-primary font-bold">
                    Owner
                  </span>
                )}
              </div>
            </Link>

            <div className="flex items-center gap-3">
              <RankBadge rank={l.my_rank} points={l.my_points} memberCount={l.member_count} />
              <button
                onClick={() => copyShare(l.invite_code)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-secondary"
                title="Copy invite link"
              >
                <Share2 size={14} />
                Copy link
              </button>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}

function RankBadge({
  rank,
  points,
  memberCount,
}: {
  rank: number | null;
  points: number;
  memberCount: number;
}) {
  if (rank === null) {
    return (
      <div className="text-right">
        <div className="text-xs text-muted-foreground">No points yet</div>
      </div>
    );
  }
  return (
    <div className="text-right">
      <div className="font-score font-bold text-amber-glow flex items-center justify-end gap-1">
        {rank <= 3 && <Trophy size={14} className="fill-current" />}
        <span className="tabular-nums">
          #{rank}
          <span className="text-muted-foreground font-normal"> / {memberCount}</span>
        </span>
      </div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {points} pts
      </div>
    </div>
  );
}
