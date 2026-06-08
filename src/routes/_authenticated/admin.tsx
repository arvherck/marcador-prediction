import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { TestsPanel } from "@/components/admin/TestsPanel";
import { KnockoutBracketPanel } from "@/components/admin/KnockoutBracketPanel";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import {
  adminAddMatchFn,
  adminAddMatchdayFn,
  adminListMatchdays,
  adminListPredictionsFn,
  adminMatchdayScoringSummaryFn,
  adminScoreMatchdayFn,
  adminScoreMatchFn,
  adminSetMatchStatusFn,
  adminSetResultFn,
  adminUpdateMatchTeamsFn,
  getFixtureStatsPublic,
} from "@/lib/game.functions";
import {
  getTournamentStatus,
  adminLockTournamentFn,
  adminSetTournamentWinnerFn,
} from "@/lib/tournament.functions";
import { TEAMS_2026 } from "@/lib/teams";
import {
  getGroups,
  type GroupWithStandings,
} from "@/lib/groups.functions";
import { ApiSyncPanel } from "@/components/admin/ApiSyncPanel";
import { DonationsPanel } from "@/components/admin/DonationsPanel";
import { reconcilePrediction, isConsistent, type Scorer } from "@/lib/prediction-consistency";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Panel de Control · Marcador" }] }),
  component: AdminPage,
});

type MatchStatusT = "upcoming" | "live" | "completed" | "cancelled";
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
  teams_confirmed?: boolean;
  status?: MatchStatusT | null;
  unscored_count?: number;
};
type Matchday = {
  id: number;
  name: string;
  starts_at: string;
  is_scored: boolean;
  matches: Match[] | null;
  prediction_count?: number;
  unscored_match_count?: number;
};

function effectiveStatus(m: Match): MatchStatusT {
  const s = (m.status ?? "upcoming") as MatchStatusT;
  if (s === "upcoming" && new Date(m.kickoff_at).getTime() <= Date.now()) return "live";
  return s;
}

const STATUS_META: Record<MatchStatusT, { icon: string; label: string; cls: string }> = {
  upcoming: { icon: "🟡", label: "Upcoming", cls: "bg-amber-glow/15 text-amber-glow" },
  live: { icon: "🔴", label: "Live", cls: "bg-destructive/15 text-destructive" },
  completed: { icon: "✅", label: "Completed", cls: "bg-success/15 text-success" },
  cancelled: { icon: "⛔", label: "Cancelled", cls: "bg-muted text-muted-foreground" },
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

const NAV = [
  { id: "overview", label: "Overview", icon: "📊" },
  { id: "results", label: "Results & Scoring", icon: "⚽" },
  { id: "bracket", label: "Knockout Bracket", icon: "🥊" },
  { id: "api-sync", label: "API Sync", icon: "🔄" },
  { id: "tournament", label: "Tournament", icon: "🏆" },
  { id: "donations", label: "Donations", icon: "💰" },
  { id: "tests", label: "Tests", icon: "🧪" },
  { id: "advanced", label: "Advanced", icon: "⚙️" },
];

function AdminInner({ displayName }: { displayName?: string }) {
  const qc = useQueryClient();
  const mds = useQuery({ queryKey: ["admin-mds"], queryFn: () => adminListMatchdays() });
  const matchdays = (mds.data as Matchday[] | undefined) ?? [];
  const [active, setActive] = useState<string>("overview");

  const jump = (id: string) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <AppShell displayName={displayName} isAdmin>
      <h1 className="font-display font-bold text-2xl md:text-3xl mb-6">
        Panel de Control
      </h1>

      <div className="md:flex md:gap-6">
        <nav className="md:w-48 md:flex-shrink-0 mb-4 md:mb-0">
          <div className="md:sticky md:top-4 flex md:flex-col gap-1 overflow-x-auto md:overflow-visible -mx-4 px-4 md:mx-0 md:px-0">
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => jump(n.id)}
                className={`shrink-0 md:shrink text-left px-3 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${
                  active === n.id
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <span className="mr-2">{n.icon}</span>
                {n.label}
              </button>
            ))}
          </div>
        </nav>

        <div className="flex-1 min-w-0">
          <Section id="overview" title="Overview">
            <FixtureImportBanner />
          </Section>

          <Section id="results" title="Results & scoring">
            <div className="space-y-4">
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

          <Section id="bracket" title="Knockout Bracket">
            <KnockoutBracketPanel />
          </Section>

          <Section id="api-sync" title="API Sync">
            <ApiSyncPanel />
          </Section>

          <Section id="tournament" title="Tournament">
            <div className="space-y-6">
              <TournamentAdmin />
              <div>
                <h3 className="font-display font-semibold text-base mb-2">Group standings</h3>
                <GroupStandingsAdmin />
              </div>
              <div>
                <h3 className="font-display font-semibold text-base mb-2">Predictions by matchday</h3>
                <PredictionsViewer matchdays={matchdays} />
              </div>
            </div>
          </Section>

          <Section id="donations" title="Donations">
            <DonationsPanel />
          </Section>

          <Section id="tests" title="Tests">
            <TestsPanel />
          </Section>

          <Section id="advanced" title="Advanced">
            <details className="rounded-2xl border border-border bg-card">
              <summary className="cursor-pointer px-4 py-3 font-semibold text-sm">
                ▶ Add matches manually
              </summary>
              <div className="border-t border-border p-4 space-y-4">
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                    New matchday
                  </h4>
                  <NewMatchdayForm
                    onCreated={() => qc.invalidateQueries({ queryKey: ["admin-mds"] })}
                  />
                </div>
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                    Add match
                  </h4>
                  <AddMatchForm
                    matchdays={matchdays}
                    onAdded={() => qc.invalidateQueries({ queryKey: ["admin-mds"] })}
                  />
                </div>
              </div>
            </details>
          </Section>
        </div>
      </div>
    </AppShell>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mb-8 scroll-mt-4">
      <h2 className="font-display font-semibold text-lg mb-3">{title}</h2>
      {children}
    </section>
  );
}

function FixtureImportBanner() {
  const q = useQuery({
    queryKey: ["fixture-stats"],
    queryFn: () => getFixtureStatsPublic(),
    staleTime: 60_000,
  });
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem("fixture-banner-dismissed") === "1";
  });
  useEffect(() => {
    if (dismissed || !q.data) return;
    const t = setTimeout(() => {
      setDismissed(true);
      sessionStorage.setItem("fixture-banner-dismissed", "1");
    }, 5000);
    return () => clearTimeout(t);
  }, [dismissed, q.data]);

  if (!q.data || dismissed) {
    return q.data ? (
      <div className="text-xs text-muted-foreground">
        {q.data.matches} matches · {q.data.matchdays} matchdays
      </div>
    ) : null;
  }
  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm font-medium text-foreground flex items-center justify-between gap-3">
      <div>
        <span className="text-primary font-bold">{q.data.matches}</span> matches imported across{" "}
        <span className="text-primary font-bold">{q.data.matchdays}</span> matchdays
      </div>
      <button
        onClick={() => {
          setDismissed(true);
          sessionStorage.setItem("fixture-banner-dismissed", "1");
        }}
        className="text-muted-foreground hover:text-foreground text-lg leading-none px-1"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
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
  const [confirmed, setConfirmed] = useState(true);

  const add = useMutation({
    mutationFn: () =>
      adminAddMatchFn({
        data: {
          matchday_id: Number(matchdayId),
          home_team: home,
          away_team: away,
          kickoff_at: new Date(kickoff).toISOString(),
          phase,
          teams_confirmed: confirmed,
        },
      }),
    onSuccess: () => {
      toast.success("Match added.");
      setHome("");
      setAway("");
      setKickoff("");
      setConfirmed(true);
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
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        Teams confirmed (open for predictions)
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

type RowDraft = {
  home: number;
  away: number;
  scorer: "home" | "away" | "none";
};

function MatchdayBlock({ md, onChange }: { md: Matchday; onChange: () => void }) {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<number, RowDraft>>({});
  const [savedFlash, setSavedFlash] = useState<Record<number, boolean>>({});

  const score = useMutation({
    mutationFn: async () => {
      const r = await adminScoreMatchdayFn({ data: { matchday_id: md.id } });
      try {
        const s = await adminMatchdayScoringSummaryFn({ data: { matchday_id: md.id } });
        return { ...r, summary: s };
      } catch {
        return { ...r, summary: null as null | { predictions_scored: number; avg_points: number } };
      }
    },
    onSuccess: (r) => {
      if (r.summary) {
        toast.success(
          `${r.summary.predictions_scored} predictions scored · avg ${r.summary.avg_points} pts`,
        );
      } else {
        toast.success("Matchday scored.");
      }
      onChange();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const counts = (md.matches ?? []).reduce(
    (acc, m) => {
      acc[effectiveStatus(m)] += 1;
      return acc;
    },
    { upcoming: 0, live: 0, completed: 0, cancelled: 0 } as Record<MatchStatusT, number>,
  );

  const setDraft = (matchId: number, patch: Partial<RowDraft>, base: RowDraft) => {
    setDrafts((d) => ({ ...d, [matchId]: { ...base, ...(d[matchId] ?? {}), ...patch } }));
  };
  const clearDraft = (matchId: number) => {
    setDrafts((d) => {
      const n = { ...d };
      delete n[matchId];
      return n;
    });
    setSavedFlash((s) => ({ ...s, [matchId]: true }));
    setTimeout(() => {
      setSavedFlash((s) => {
        const n = { ...s };
        delete n[matchId];
        return n;
      });
    }, 2000);
  };

  const dirtyCount = Object.keys(drafts).length;

  const saveAll = async () => {
    const entries = Object.entries(drafts);
    if (!entries.length) return;
    const valid: Array<[string, RowDraft]> = [];
    let skipped = 0;
    for (const [id, d] of entries) {
      let { home, away, scorer } = d;
      if (home === 0 && away === 0) scorer = "none";
      if (!isConsistent(home, away, scorer)) {
        skipped += 1;
        continue;
      }
      valid.push([id, { home, away, scorer }]);
    }
    if (!valid.length) {
      toast.error("Fix inconsistencies before saving");
      return;
    }
    try {
      await Promise.all(
        valid.map(([id, d]) =>
          adminSetResultFn({
            data: {
              match_id: Number(id),
              home_score: d.home,
              away_score: d.away,
              first_scorer: d.scorer,
            },
          }),
        ),
      );
      toast.success(
        `Saved ${valid.length} result(s)${skipped ? ` · ${skipped} skipped (inconsistent)` : ""}.`,
      );
      const ids = valid.map(([id]) => Number(id));
      setDrafts((d) => {
        const n = { ...d };
        ids.forEach((id) => delete n[id]);
        return n;
      });
      setSavedFlash((s) => {
        const n = { ...s };
        ids.forEach((id) => (n[id] = true));
        return n;
      });
      setTimeout(() => {
        setSavedFlash((s) => {
          const n = { ...s };
          ids.forEach((id) => delete n[id]);
          return n;
        });
      }, 2000);
      qc.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const total = md.matches?.length ?? 0;
  return (
    <details className="rounded-2xl border border-border bg-card overflow-hidden" open={!md.is_scored}>
      <summary className="px-4 py-3 flex items-center justify-between gap-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-muted-foreground text-xs chevron">▶</span>
          <div className="min-w-0">
            <div className="font-semibold truncate">{md.name}</div>
            <div className="text-xs text-muted-foreground truncate">
              {new Date(md.starts_at).toLocaleDateString()} · {total} match
              {total === 1 ? "" : "es"} · {md.prediction_count ?? 0} predicted
            </div>
            <div className="text-[11px] text-muted-foreground truncate mt-0.5">
              {(["completed", "live", "upcoming", "cancelled"] as MatchStatusT[])
                .filter((s) => counts[s] > 0)
                .map((s) => `${STATUS_META[s].icon} ${counts[s]} ${STATUS_META[s].label.toLowerCase()}`)
                .join(" · ") || "No matches"}
            </div>
            {(md.unscored_match_count ?? 0) > 0 && (
              <div className="text-[11px] font-bold text-amber-glow mt-0.5">
                ● {md.unscored_match_count} match{md.unscored_match_count === 1 ? "" : "es"} need scoring
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {dirtyCount > 0 && (
            <button
              onClick={(e) => {
                e.preventDefault();
                saveAll();
              }}
              className="rounded-lg bg-amber-gradient px-3 py-1.5 text-xs font-bold text-primary-foreground"
            >
              Save all ({dirtyCount})
            </button>
          )}
          {md.is_scored ? (
            <span className="text-xs font-bold text-success uppercase tracking-wider">
              Scored ✓
            </span>
          ) : (
            <button
              onClick={(e) => {
                e.preventDefault();
                score.mutate();
              }}
              disabled={score.isPending || counts.completed === 0}
              className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-bold disabled:opacity-40"
              title={counts.completed === 0 ? "Mark at least one match as completed first" : undefined}
            >
              Run scoring{counts.completed > 0 ? ` (${counts.completed} completed)` : ""}
            </button>
          )}
        </div>
      </summary>
      <div className="divide-y divide-border border-t border-border">
        {md.matches?.map((m) => (
          <ResultRow
            key={m.id}
            m={m}
            draft={drafts[m.id] ?? null}
            saved={!!savedFlash[m.id]}
            onDraftChange={(patch, base) => setDraft(m.id, patch, base)}
            onSaved={() => clearDraft(m.id)}
            onChange={onChange}
          />
        ))}
        {!md.matches?.length && (
          <div className="px-4 py-3 text-xs text-muted-foreground">
            No matches in this matchday.
          </div>
        )}
      </div>
    </details>
  );
}

function ResultRow({
  m,
  draft,
  saved,
  onDraftChange,
  onSaved,
  onChange,
}: {
  m: Match;
  draft: RowDraft | null;
  saved: boolean;
  onDraftChange: (patch: Partial<RowDraft>, base: RowDraft) => void;
  onSaved: () => void;
  onChange: () => void;
}) {
  const isKnockout = m.phase && m.phase !== "Group stage";
  const confirmed = m.teams_confirmed !== false;

  const base: RowDraft = {
    home: m.home_score ?? 0,
    away: m.away_score ?? 0,
    scorer: (m.first_scorer as "home" | "away" | "none") ?? "home",
  };
  const current = draft ?? base;
  const dirty = !!draft;
  const [hint, setHint] = useState<string | null>(null);
  const consistent = isConsistent(current.home, current.away, current.scorer);
  const inconsistencyMsg = !consistent
    ? current.scorer === "home"
      ? `Inconsistent — ${m.home_team} cannot score first with 0 home goals`
      : current.scorer === "away"
        ? `Inconsistent — ${m.away_team} cannot score first with 0 away goals`
        : "Inconsistent result"
    : null;

  const handleChange = (
    patch: { home?: number; away?: number; scorer?: Scorer },
    changed: "home" | "away" | "scorer",
  ) => {
    const r = reconcilePrediction({
      home: patch.home ?? current.home,
      away: patch.away ?? current.away,
      scorer: patch.scorer ?? current.scorer,
      changed,
      homeTeam: m.home_team,
      awayTeam: m.away_team,
    });
    onDraftChange({ home: r.home, away: r.away, scorer: r.scorer }, base);
    setHint(r.hint ?? null);
  };

  const save = useMutation({
    mutationFn: () => {
      if (!isConsistent(current.home, current.away, current.scorer)) {
        throw new Error(inconsistencyMsg ?? "Inconsistent result");
      }
      return adminSetResultFn({
        data: {
          match_id: m.id,
          home_score: current.home,
          away_score: current.away,
          first_scorer: current.scorer,
        },
      });
    },
    onSuccess: (res) => {
      const impact = (res as { standingsImpact?: { home: { team: string; points: number; won: number; drawn: number; lost: number }; away: { team: string; points: number; won: number; drawn: number; lost: number } } | null }).standingsImpact;
      if (impact) {
        const fmt = (r: { team: string; points: number; won: number; drawn: number; lost: number }) =>
          `${r.team}: ${r.points}pts (${r.won}W ${r.drawn}D ${r.lost}L)`;
        toast.success(`Result saved ✅\nStandings updated:\n${fmt(impact.home)}\n${fmt(impact.away)}`, {
          duration: 6000,
        });
      } else {
        toast.success("Result saved · Match marked as completed");
      }
      onSaved();
      onChange();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const eff = effectiveStatus(m);
  const changeStatus = useMutation({
    mutationFn: (next: MatchStatusT) =>
      adminSetMatchStatusFn({ data: { match_id: m.id, status: next } }),
    onSuccess: (_d, next) => {
      toast.success(`Status set to ${STATUS_META[next].label.toLowerCase()}.`);
      onChange();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const onChangeStatus = (next: MatchStatusT) => {
    if (next === (m.status ?? "upcoming")) return;
    if (next === "upcoming") {
      if (!window.confirm(`This will reopen predictions for ${m.home_team} vs ${m.away_team}. Continue?`)) return;
    }
    if (next === "completed" && current.home === 0 && current.away === 0 && current.scorer === "none" && !m.is_final) {
      if (!window.confirm("No score entered. Mark as completed anyway?")) return;
    }
    changeStatus.mutate(next);
  };

  const [editTeams, setEditTeams] = useState(false);
  const [homeName, setHomeName] = useState(m.home_team);
  const [awayName, setAwayName] = useState(m.away_team);
  const confirmAndUnlock = useMutation({
    mutationFn: () =>
      adminUpdateMatchTeamsFn({
        data: {
          match_id: m.id,
          home_team: homeName,
          away_team: awayName,
          teams_confirmed: true,
        },
      }),
    onSuccess: () => {
      toast.success("Teams confirmed — match unlocked.");
      setEditTeams(false);
      onChange();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const showEditor = isKnockout && (!confirmed || editTeams);
  const borderClass = saved
    ? "border-l-2 border-success"
    : dirty
      ? "border-l-2 border-amber-glow"
      : "border-l-2 border-transparent";

  return (
    <div className={`px-4 py-3 flex items-center gap-3 flex-wrap transition-colors ${borderClass}`}>
      <div className="flex-1 min-w-[200px] text-sm">
        {showEditor ? (
          <div className="flex items-center gap-1.5 flex-wrap">
            <input
              value={homeName}
              onChange={(e) => setHomeName(e.target.value)}
              placeholder="Home team"
              className="flex-1 min-w-0 rounded bg-input border border-border px-2 py-1 text-xs"
            />
            <span className="text-muted-foreground text-xs">vs</span>
            <input
              value={awayName}
              onChange={(e) => setAwayName(e.target.value)}
              placeholder="Away team"
              className="flex-1 min-w-0 rounded bg-input border border-border px-2 py-1 text-xs"
            />
            <button
              onClick={() => confirmAndUnlock.mutate()}
              disabled={confirmAndUnlock.isPending || !homeName || !awayName}
              className="rounded bg-amber-gradient text-primary-foreground px-2 py-1 text-xs font-bold disabled:opacity-40"
            >
              Confirm & unlock
            </button>
            {confirmed && (
              <button
                onClick={() => {
                  setEditTeams(false);
                  setHomeName(m.home_team);
                  setAwayName(m.away_team);
                }}
                className="text-xs text-muted-foreground hover:text-foreground px-1"
              >
                Cancel
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="font-medium">
              {m.home_team} <span className="text-muted-foreground">vs</span> {m.away_team}
            </div>
            <div className="text-[11px] text-muted-foreground flex items-center gap-2">
              <span>{m.phase ?? "—"}</span>
              {isKnockout && confirmed && (
                <button
                  onClick={() => setEditTeams(true)}
                  className="text-primary hover:underline"
                >
                  Edit teams
                </button>
              )}
              {saved && <span className="text-success font-bold">✓ saved</span>}
            </div>
          </>
        )}
      </div>
      {isKnockout && !showEditor && (
        <span
          className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${
            confirmed
              ? "bg-success/15 text-success"
              : "bg-amber-glow/15 text-amber-glow"
          }`}
        >
          {confirmed ? "confirmed" : "TBD"}
        </span>
      )}
      {(!isKnockout || confirmed) && (
        <>
          <input
            type="number"
            min={0}
            value={current.home}
            onChange={(e) =>
              handleChange({ home: Math.max(0, parseInt(e.target.value || "0")) }, "home")
            }
            disabled={current.scorer === "none"}
            className="w-14 rounded-lg bg-input border border-border px-2 py-1.5 font-score text-center disabled:opacity-60"
          />
          <span className="text-muted-foreground">–</span>
          <input
            type="number"
            min={0}
            value={current.away}
            onChange={(e) =>
              handleChange({ away: Math.max(0, parseInt(e.target.value || "0")) }, "away")
            }
            disabled={current.scorer === "none"}
            className="w-14 rounded-lg bg-input border border-border px-2 py-1.5 font-score text-center disabled:opacity-60"
          />
          <select
            value={current.scorer}
            onChange={(e) =>
              handleChange({ scorer: e.target.value as Scorer }, "scorer")
            }
            className="rounded-lg bg-input border border-border px-2 py-1.5 text-xs"
          >
            <option value="home">{m.home_team} scored first</option>
            <option value="away">{m.away_team} scored first</option>
            <option value="none">No goals</option>
          </select>
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending || !consistent}
            className="rounded-lg bg-amber-gradient px-3 py-1.5 text-xs font-bold disabled:opacity-40"
          >
            {m.is_final ? "Update" : "Save"}
          </button>
          <ScoreMatchButton match={m} onChange={onChange} />
          <span
            className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${STATUS_META[eff].cls}`}
            title={`Status: ${STATUS_META[eff].label}`}
          >
            {STATUS_META[eff].icon} {STATUS_META[eff].label}
          </span>
          <select
            value={m.status ?? "upcoming"}
            onChange={(e) => onChangeStatus(e.target.value as MatchStatusT)}
            disabled={changeStatus.isPending}
            className="rounded-lg bg-input border border-border px-2 py-1 text-[11px]"
            title="Change status"
          >
            <option value="upcoming">Upcoming</option>
            <option value="live">Live</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          {(hint || inconsistencyMsg) && (
            <div className={`basis-full text-[11px] mt-1 ${inconsistencyMsg ? "text-destructive font-medium" : "text-muted-foreground italic"}`}>
              {inconsistencyMsg ?? hint}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ScoreMatchButton({ match, onChange }: { match: Match; onChange: () => void }) {
  const qc = useQueryClient();
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const canScore = match.status === "completed" && match.is_final;
  const score = useMutation({
    mutationFn: () => adminScoreMatchFn({ data: { match_id: match.id } }),
    onSuccess: (r) => {
      setFlash({ kind: "ok", msg: `✓ ${r.predictions_scored} predictions scored` });
      setTimeout(() => setFlash(null), 3000);
      qc.invalidateQueries();
      onChange();
    },
    onError: (e) => {
      setFlash({ kind: "err", msg: e instanceof Error ? e.message : "Error" });
    },
  });
  return (
    <>
      <button
        onClick={() => score.mutate()}
        disabled={!canScore || score.isPending}
        title={canScore ? "Score this match now" : "Save a result first to enable scoring"}
        className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-bold disabled:opacity-40"
      >
        Score
      </button>
      {flash && (
        <span
          className={`text-[11px] font-medium ${flash.kind === "ok" ? "text-success" : "text-destructive"}`}
        >
          {flash.msg}
        </span>
      )}
    </>
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

  const create = useMutation({
    mutationFn: () =>
      adminAddMatchdayFn({
        data: {
          name,
          starts_at: new Date(startsAt).toISOString(),
        },
      }),
    onSuccess: () => {
      toast.success("Matchday created. Add matches below.");
      setName("");
      setStartsAt("");
      onCreated();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  return (
    <details className="rounded-2xl border border-border bg-card p-4">
      <summary className="cursor-pointer font-semibold">Create empty matchday</summary>
      <div className="mt-4 space-y-2">
        <input
          placeholder="Matchday name (e.g. Matchday 4)"
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
        <button
          onClick={() => create.mutate()}
          disabled={create.isPending || !name || !startsAt}
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
  const q = useQuery({ queryKey: ["groups", "auth"], queryFn: () => getGroups() });
  const groups = (q.data as GroupWithStandings[] | undefined) ?? [];
  const [groupId, setGroupId] = useState<number>(1);
  const selected = groups.find((g) => g.id === groupId);

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading groups…</p>;
  if (!groups.length) return <p className="text-sm text-muted-foreground">No groups found.</p>;

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-muted/40 border border-border px-3 py-2 text-xs text-muted-foreground">
        Standings update automatically when group-stage results are saved.
      </div>
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
              <th className="px-2 py-2">P</th>
              <th className="px-2 py-2">W</th>
              <th className="px-2 py-2">D</th>
              <th className="px-2 py-2">L</th>
              <th className="px-2 py-2">GF</th>
              <th className="px-2 py-2">GA</th>
              <th className="px-2 py-2">GD</th>
              <th className="px-2 py-2">Pts</th>
            </tr>
          </thead>
          <tbody>
            {(selected?.standings ?? []).map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="text-left px-3 py-2 font-medium">{r.team}</td>
                <td className="px-2 py-2 text-center">{r.played}</td>
                <td className="px-2 py-2 text-center">{r.won}</td>
                <td className="px-2 py-2 text-center">{r.drawn}</td>
                <td className="px-2 py-2 text-center">{r.lost}</td>
                <td className="px-2 py-2 text-center">{r.goals_for}</td>
                <td className="px-2 py-2 text-center">{r.goals_against}</td>
                <td className="px-2 py-2 text-center">
                  {r.goal_difference > 0 ? `+${r.goal_difference}` : r.goal_difference}
                </td>
                <td className="px-2 py-2 text-center font-bold text-amber-glow">{r.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

