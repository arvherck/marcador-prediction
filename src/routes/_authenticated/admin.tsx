import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import {
  adminAddMatchFn,
  adminAddMatchdayFn,
  adminListMatchdays,
  adminListPredictionsFn,
  adminScoreMatchdayFn,
  adminSetResultFn,
} from "@/lib/game.functions";
import {
  getTournamentStatus,
  adminLockTournamentFn,
  adminSetTournamentWinnerFn,
} from "@/lib/tournament.functions";
import { TEAMS_2026 } from "@/lib/teams";
import {
  getGroups,
  adminSaveGroupStandingsFn,
  type GroupWithStandings,
} from "@/lib/groups.functions";
import { ApiSyncPanel } from "@/components/admin/ApiSyncPanel";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Panel de Control · Marcador" }] }),
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
  phase: string | null;
  is_selected: boolean;
};
type Matchday = {
  id: number;
  name: string;
  starts_at: string;
  is_scored: boolean;
  matches: Match[] | null;
};

const PHASES = [
  "Group stage",
  "Round of 16",
  "Quarterfinal",
  "Semifinal",
  "Final",
];

function AdminPage() {
  const { me } = Route.useRouteContext();

  if (!me.is_admin) {
    return (
      <AppShell displayName={me.profile?.display_name}>
        <div className="max-w-md mx-auto text-center py-16">
          <h1 className="font-display font-bold text-2xl">Not authorized</h1>
          <p className="text-sm text-muted-foreground mt-2">
            This section is restricted to admins.
          </p>
        </div>
      </AppShell>
    );
  }

  return <AdminInner displayName={me.profile?.display_name} />;
}

function AdminInner({ displayName }: { displayName?: string }) {
  const qc = useQueryClient();
  const mds = useQuery({ queryKey: ["admin-mds"], queryFn: () => adminListMatchdays() });
  const matchdays = (mds.data as Matchday[] | undefined) ?? [];

  return (
    <AppShell displayName={displayName} isAdmin>
      <h1 className="font-display font-bold text-2xl md:text-3xl mb-6">
        Panel de Control
      </h1>

      <Section title="New matchday (6 matches)">
        <NewMatchdayForm
          onCreated={() => qc.invalidateQueries({ queryKey: ["admin-mds"] })}
        />
      </Section>

      <Section title="Add match manually">
        <AddMatchForm
          matchdays={matchdays}
          onAdded={() => qc.invalidateQueries({ queryKey: ["admin-mds"] })}
        />
      </Section>

      <Section title="Results & scoring">
        <div className="space-y-6">
          {matchdays.map((md) => (
            <MatchdayBlock
              key={md.id}
              md={md}
              onChange={() => qc.invalidateQueries()}
            />
          ))}
          {!matchdays.length && (
            <p className="text-sm text-muted-foreground">No matchdays yet.</p>
          )}
        </div>
      </Section>

      <Section title="Predictions by matchday">
        <PredictionsViewer matchdays={matchdays} />
      </Section>

      <Section title="Tournament champion">
        <TournamentAdmin />
      </Section>

      <Section title="Group standings">
        <GroupStandingsAdmin />
      </Section>
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="font-display font-semibold text-lg mb-3">{title}</h2>
      {children}
    </section>
  );
}

function AddMatchForm({
  matchdays,
  onAdded,
}: {
  matchdays: Matchday[];
  onAdded: () => void;
}) {
  const [matchdayId, setMatchdayId] = useState<number | "">("");
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [kickoff, setKickoff] = useState("");
  const [phase, setPhase] = useState<string>(PHASES[0]);
  const [isSelected, setIsSelected] = useState(false);

  const add = useMutation({
    mutationFn: () =>
      adminAddMatchFn({
        data: {
          matchday_id: Number(matchdayId),
          home_team: home,
          away_team: away,
          kickoff_at: new Date(kickoff).toISOString(),
          phase,
          is_selected: isSelected,
        },
      }),
    onSuccess: () => {
      toast.success("Match added.");
      setHome("");
      setAway("");
      setKickoff("");
      setIsSelected(false);
      onAdded();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
      <select
        value={matchdayId}
        onChange={(e) =>
          setMatchdayId(e.target.value === "" ? "" : Number(e.target.value))
        }
        className="w-full rounded-lg bg-input border border-border px-3 py-2 text-sm"
      >
        <option value="">Select matchday…</option>
        {matchdays.map((md) => (
          <option key={md.id} value={md.id}>
            {md.name}
          </option>
        ))}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <input
          placeholder="Home team"
          value={home}
          onChange={(e) => setHome(e.target.value)}
          className="rounded-lg bg-input border border-border px-3 py-2 text-sm"
        />
        <input
          placeholder="Away team"
          value={away}
          onChange={(e) => setAway(e.target.value)}
          className="rounded-lg bg-input border border-border px-3 py-2 text-sm"
        />
      </div>
      <input
        type="datetime-local"
        value={kickoff}
        onChange={(e) => setKickoff(e.target.value)}
        className="w-full rounded-lg bg-input border border-border px-3 py-2 text-sm"
      />
      <select
        value={phase}
        onChange={(e) => setPhase(e.target.value)}
        className="w-full rounded-lg bg-input border border-border px-3 py-2 text-sm"
      >
        {PHASES.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => setIsSelected(e.target.checked)}
        />
        One of the 6 selected matches
      </label>
      <button
        onClick={() => add.mutate()}
        disabled={
          add.isPending || !matchdayId || !home || !away || !kickoff
        }
        className="w-full rounded-xl bg-amber-gradient px-4 py-2.5 text-sm font-bold disabled:opacity-40"
      >
        Add match
      </button>
    </div>
  );
}

function MatchdayBlock({ md, onChange }: { md: Matchday; onChange: () => void }) {
  const score = useMutation({
    mutationFn: () => adminScoreMatchdayFn({ data: { matchday_id: md.id } }),
    onSuccess: () => {
      toast.success("Matchday scored.");
      onChange();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
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
            Run scoring
          </button>
        )}
      </div>
      <div className="divide-y divide-border">
        {md.matches?.map((m) => <ResultRow key={m.id} m={m} onChange={onChange} />)}
        {!md.matches?.length && (
          <div className="px-4 py-3 text-xs text-muted-foreground">
            No matches in this matchday.
          </div>
        )}
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
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  return (
    <div className="px-4 py-3 flex items-center gap-3 flex-wrap">
      <div className="flex-1 min-w-[160px] text-sm">
        <div className="font-medium">
          {m.home_team} <span className="text-muted-foreground">vs</span> {m.away_team}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {m.phase ?? "—"}
          {m.is_selected && " · ⭐ selected"}
        </div>
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

function PredictionsViewer({ matchdays }: { matchdays: Matchday[] }) {
  const [mdId, setMdId] = useState<number | "">("");
  const preds = useQuery({
    queryKey: ["admin-predictions", mdId],
    queryFn: () =>
      adminListPredictionsFn({ data: { matchday_id: Number(mdId) } }),
    enabled: typeof mdId === "number",
  });

  const rows = preds.data ?? [];

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <select
        value={mdId}
        onChange={(e) =>
          setMdId(e.target.value === "" ? "" : Number(e.target.value))
        }
        className="w-full rounded-lg bg-input border border-border px-3 py-2 text-sm mb-3"
      >
        <option value="">Select matchday…</option>
        {matchdays.map((md) => (
          <option key={md.id} value={md.id}>
            {md.name}
          </option>
        ))}
      </select>

      {typeof mdId !== "number" ? (
        <p className="text-sm text-muted-foreground">
          Select a matchday to view predictions.
        </p>
      ) : preds.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !rows.length ? (
        <p className="text-sm text-muted-foreground">No predictions.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2 pr-3">User</th>
                <th className="py-2 pr-3">Match</th>
                <th className="py-2 pr-3">Prediction</th>
                <th className="py-2 pr-3">Actual</th>
                <th className="py-2 pr-3">Booster</th>
                <th className="py-2 pr-3 text-right">Points</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 pr-3">
                    <div className="font-medium">
                      {r.display_name ?? "—"}
                    </div>
                    <div className="text-muted-foreground">{r.email}</div>
                  </td>
                  <td className="py-2 pr-3">
                    {r.home_team} vs {r.away_team}
                  </td>
                  <td className="py-2 pr-3 font-score">
                    {r.home_goals}-{r.away_goals}
                    {r.pred_first_scorer && r.pred_first_scorer !== "none" && (
                      <span className="ml-1 text-muted-foreground">
                        ({r.pred_first_scorer})
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 font-score">
                    {r.is_final
                      ? `${r.home_score}-${r.away_score}`
                      : "—"}
                  </td>
                  <td className="py-2 pr-3">{r.booster ? "★" : ""}</td>
                  <td className="py-2 pr-3 text-right font-bold">
                    {r.points ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  return (
    <details className="rounded-2xl border border-border bg-card p-4">
      <summary className="cursor-pointer font-semibold">Create matchday with 6 matches</summary>
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

function TournamentAdmin() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["tournament-status"],
    queryFn: () => getTournamentStatus(),
  });
  const [winner, setWinner] = useState("");

  const lock = useMutation({
    mutationFn: (locked: boolean) => adminLockTournamentFn({ data: { locked } }),
    onSuccess: () => {
      toast.success("Tournament lock updated.");
      qc.invalidateQueries({ queryKey: ["tournament-status"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const setW = useMutation({
    mutationFn: () => adminSetTournamentWinnerFn({ data: { winner } }),
    onSuccess: (r) => {
      toast.success(`Winner set. Scored ${r.scored} prediction(s).`);
      qc.invalidateQueries({ queryKey: ["tournament-status"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const locked = q.data?.locked ?? false;
  const actual = q.data?.actualWinner ?? null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-sm">Predictions lock</div>
          <div className="text-xs text-muted-foreground">
            {locked ? "Closed — no new picks allowed." : "Open — users can still pick."}
          </div>
        </div>
        <button
          onClick={() => lock.mutate(!locked)}
          disabled={lock.isPending}
          className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-bold disabled:opacity-40"
        >
          {locked ? "Unlock" : "Lock predictions"}
        </button>
      </div>

      <div className="border-t border-border pt-4">
        <div className="font-semibold text-sm mb-1">Actual winner</div>
        <div className="text-xs text-muted-foreground mb-2">
          {actual ? `Current: ${actual}` : "Not set. Setting this awards +50 to correct picks."}
        </div>
        <div className="flex gap-2">
          <select
            value={winner}
            onChange={(e) => setWinner(e.target.value)}
            className="flex-1 rounded-lg bg-input border border-border px-3 py-2 text-sm"
          >
            <option value="">Select winner…</option>
            {TEAMS_2026.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            onClick={() => setW.mutate()}
            disabled={!winner || setW.isPending}
            className="rounded-lg bg-amber-gradient px-3 py-2 text-xs font-bold disabled:opacity-40"
          >
            {setW.isPending ? "Scoring…" : "Set & score"}
          </button>
        </div>
      </div>
    </div>
  );
}

function GroupStandingsAdmin() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["groups", "auth"], queryFn: () => getGroups() });
  const groups = (q.data as GroupWithStandings[] | undefined) ?? [];
  const [groupId, setGroupId] = useState<number>(1);
  const selected = groups.find((g) => g.id === groupId);

  type Draft = { id: string; team: string; won: number; drawn: number; lost: number; goals_for: number; goals_against: number };
  const [drafts, setDrafts] = useState<Record<number, Draft[]>>({});

  const currentDrafts: Draft[] =
    drafts[groupId] ??
    (selected
      ? selected.standings.map((s) => ({
          id: s.id,
          team: s.team,
          won: s.won,
          drawn: s.drawn,
          lost: s.lost,
          goals_for: s.goals_for,
          goals_against: s.goals_against,
        }))
      : []);

  const setRow = (idx: number, patch: Partial<Draft>) => {
    const next = currentDrafts.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    setDrafts((d) => ({ ...d, [groupId]: next }));
  };

  const save = useMutation({
    mutationFn: () =>
      adminSaveGroupStandingsFn({
        data: {
          group_id: groupId,
          rows: currentDrafts.map((r) => ({
            id: r.id,
            won: r.won,
            drawn: r.drawn,
            lost: r.lost,
            goals_for: r.goals_for,
            goals_against: r.goals_against,
          })),
        },
      }),
    onSuccess: () => {
      toast.success("Group saved.");
      setDrafts((d) => {
        const next = { ...d };
        delete next[groupId];
        return next;
      });
      qc.invalidateQueries({ queryKey: ["groups"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading groups…</p>;
  if (!groups.length) return <p className="text-sm text-muted-foreground">No groups found.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm text-muted-foreground">Group</label>
        <select
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
          value={groupId}
          onChange={(e) => setGroupId(Number(e.target.value))}
        >
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm tabular-nums">
          <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">Team</th>
              <th className="px-2 py-2">W</th>
              <th className="px-2 py-2">D</th>
              <th className="px-2 py-2">L</th>
              <th className="px-2 py-2">GF</th>
              <th className="px-2 py-2">GA</th>
              <th className="px-2 py-2">P</th>
              <th className="px-2 py-2">GD</th>
              <th className="px-2 py-2">Pts</th>
            </tr>
          </thead>
          <tbody>
            {currentDrafts.map((r, i) => {
              const played = r.won + r.drawn + r.lost;
              const gd = r.goals_for - r.goals_against;
              const pts = r.won * 3 + r.drawn;
              return (
                <tr key={r.id} className="border-t border-border">
                  <td className="text-left px-3 py-2 font-medium">{r.team}</td>
                  {(["won", "drawn", "lost", "goals_for", "goals_against"] as const).map((k) => (
                    <td key={k} className="px-1 py-1.5">
                      <input
                        type="number"
                        min={0}
                        max={k.startsWith("goals") ? 200 : 50}
                        value={r[k]}
                        onChange={(e) =>
                          setRow(i, { [k]: Math.max(0, Number(e.target.value) || 0) })
                        }
                        className="w-14 rounded-md border border-border bg-background px-2 py-1 text-center"
                      />
                    </td>
                  ))}
                  <td className="px-2 py-2 text-center text-muted-foreground">{played}</td>
                  <td className="px-2 py-2 text-center text-muted-foreground">
                    {gd > 0 ? `+${gd}` : gd}
                  </td>
                  <td className="px-2 py-2 text-center font-bold text-amber-glow">{pts}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={() => save.mutate()}
        disabled={save.isPending}
        className="rounded-xl bg-amber-gradient px-4 py-2 text-sm font-bold shadow-glow disabled:opacity-60"
      >
        {save.isPending ? "Saving…" : "Save group"}
      </button>
    </div>
  );
}
