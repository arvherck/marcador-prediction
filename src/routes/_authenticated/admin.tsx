import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import {
  adminAddMatchdayFn,
  adminListMatchdays,
  adminScoreMatchdayFn,
  adminSetResultFn,
  makeMeAdminFn,
} from "@/lib/game.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin · Marcador" }] }),
  component: AdminPage,
});

type Match = {
  id: number;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  home_score: number | null;
  away_score: number | null;
  first_scorer: string | null;
  is_final: boolean;
};
type Matchday = {
  id: number;
  name: string;
  starts_at: string;
  is_scored: boolean;
  matches: Match[] | null;
};

function AdminPage() {
  const { me } = Route.useRouteContext();
  const qc = useQueryClient();

  const claim = useMutation({
    mutationFn: () => makeMeAdminFn(),
    onSuccess: () => {
      toast.success("You're now admin. Reload to see tools.");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed."),
  });

  if (!me.is_admin) {
    return (
      <AppShell displayName={me.profile?.display_name}>
        <div className="max-w-md mx-auto text-center py-16">
          <h1 className="font-display font-bold text-2xl">Admin area</h1>
          <p className="text-sm text-muted-foreground mt-2">
            You're not an admin. If no admin exists yet, you can claim it (first user only).
          </p>
          <button
            onClick={() => claim.mutate()}
            className="mt-6 rounded-xl bg-amber-gradient px-5 py-2.5 text-sm font-bold shadow-glow"
          >
            Claim admin
          </button>
        </div>
      </AppShell>
    );
  }

  return <AdminInner displayName={me.profile?.display_name} />;
}

function AdminInner({ displayName }: { displayName?: string }) {
  const qc = useQueryClient();
  const mds = useQuery({ queryKey: ["admin-mds"], queryFn: () => adminListMatchdays() });

  return (
    <AppShell displayName={displayName} isAdmin>
      <h1 className="font-display font-bold text-2xl md:text-3xl mb-6">Admin</h1>

      <NewMatchdayForm onCreated={() => qc.invalidateQueries({ queryKey: ["admin-mds"] })} />

      <div className="mt-8 space-y-6">
        {(mds.data as Matchday[] | undefined)?.map((md) => (
          <MatchdayBlock key={md.id} md={md} onChange={() => qc.invalidateQueries()} />
        ))}
      </div>
    </AppShell>
  );
}

function MatchdayBlock({ md, onChange }: { md: Matchday; onChange: () => void }) {
  const score = useMutation({
    mutationFn: () => adminScoreMatchdayFn({ data: { matchday_id: md.id } }),
    onSuccess: () => {
      toast.success("Matchday scored.");
      onChange();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed."),
  });

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between border-b border-border">
        <div>
          <div className="font-semibold">{md.name}</div>
          <div className="text-xs text-muted-foreground">
            {new Date(md.starts_at).toLocaleString()}
          </div>
        </div>
        {md.is_scored ? (
          <span className="text-xs font-bold text-success uppercase tracking-wider">
            Scored
          </span>
        ) : (
          <button
            onClick={() => score.mutate()}
            disabled={score.isPending}
            className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-bold disabled:opacity-40"
          >
            Score matchday
          </button>
        )}
      </div>
      <div className="divide-y divide-border">
        {md.matches?.map((m) => <ResultRow key={m.id} m={m} onChange={onChange} />)}
      </div>
    </div>
  );
}

function ResultRow({ m, onChange }: { m: Match; onChange: () => void }) {
  const [home, setHome] = useState<number>(m.home_score ?? 0);
  const [away, setAway] = useState<number>(m.away_score ?? 0);
  const [scorer, setScorer] = useState<"home" | "away" | "none">(
    (m.first_scorer as "home" | "away" | "none") ?? "home",
  );
  const save = useMutation({
    mutationFn: () =>
      adminSetResultFn({
        data: { match_id: m.id, home_score: home, away_score: away, first_scorer: scorer },
      }),
    onSuccess: () => {
      toast.success("Result saved.");
      onChange();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed."),
  });

  return (
    <div className="px-4 py-3 flex items-center gap-3 flex-wrap">
      <div className="flex-1 min-w-[160px] font-medium text-sm">
        {m.home_team} <span className="text-muted-foreground">vs</span> {m.away_team}
      </div>
      <input
        type="number"
        min={0}
        value={home}
        onChange={(e) => setHome(parseInt(e.target.value || "0"))}
        className="w-14 rounded-lg bg-input border border-border px-2 py-1.5 font-score text-center"
      />
      <span className="text-muted-foreground">–</span>
      <input
        type="number"
        min={0}
        value={away}
        onChange={(e) => setAway(parseInt(e.target.value || "0"))}
        className="w-14 rounded-lg bg-input border border-border px-2 py-1.5 font-score text-center"
      />
      <select
        value={scorer}
        onChange={(e) => setScorer(e.target.value as "home" | "away" | "none")}
        className="rounded-lg bg-input border border-border px-2 py-1.5 text-xs"
      >
        <option value="home">{m.home_team} scored first</option>
        <option value="away">{m.away_team} scored first</option>
        <option value="none">No goals</option>
      </select>
      <button
        onClick={() => save.mutate()}
        disabled={save.isPending}
        className="rounded-lg bg-amber-gradient px-3 py-1.5 text-xs font-bold disabled:opacity-40"
      >
        {m.is_final ? "Update" : "Save"}
      </button>
    </div>
  );
}

function NewMatchdayForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [matches, setMatches] = useState(
    Array.from({ length: 6 }).map(() => ({ home_team: "", away_team: "", kickoff_at: "" })),
  );

  const create = useMutation({
    mutationFn: () =>
      adminAddMatchdayFn({
        data: {
          name,
          starts_at: new Date(startsAt).toISOString(),
          matches: matches.map((m) => ({
            home_team: m.home_team,
            away_team: m.away_team,
            kickoff_at: new Date(m.kickoff_at).toISOString(),
          })),
        },
      }),
    onSuccess: () => {
      toast.success("Matchday created.");
      setName("");
      setStartsAt("");
      setMatches(Array.from({ length: 6 }).map(() => ({ home_team: "", away_team: "", kickoff_at: "" })));
      onCreated();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed."),
  });

  return (
    <details className="rounded-2xl border border-border bg-card p-4">
      <summary className="cursor-pointer font-semibold">+ New matchday (6 fixtures)</summary>
      <div className="mt-4 space-y-2">
        <input
          placeholder="Matchday name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg bg-input border border-border px-3 py-2 text-sm"
        />
        <input
          type="datetime-local"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          className="w-full rounded-lg bg-input border border-border px-3 py-2 text-sm"
        />
        {matches.map((m, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_1.4fr] gap-2">
            <input
              placeholder="Home"
              value={m.home_team}
              onChange={(e) =>
                setMatches((arr) =>
                  arr.map((x, j) => (j === i ? { ...x, home_team: e.target.value } : x)),
                )
              }
              className="rounded-lg bg-input border border-border px-3 py-2 text-sm"
            />
            <input
              placeholder="Away"
              value={m.away_team}
              onChange={(e) =>
                setMatches((arr) =>
                  arr.map((x, j) => (j === i ? { ...x, away_team: e.target.value } : x)),
                )
              }
              className="rounded-lg bg-input border border-border px-3 py-2 text-sm"
            />
            <input
              type="datetime-local"
              value={m.kickoff_at}
              onChange={(e) =>
                setMatches((arr) =>
                  arr.map((x, j) => (j === i ? { ...x, kickoff_at: e.target.value } : x)),
                )
              }
              className="rounded-lg bg-input border border-border px-3 py-2 text-sm"
            />
          </div>
        ))}
        <button
          onClick={() => create.mutate()}
          disabled={create.isPending}
          className="mt-2 w-full rounded-xl bg-amber-gradient px-4 py-2.5 text-sm font-bold disabled:opacity-40"
        >
          Create matchday
        </button>
      </div>
    </details>
  );
}
