import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import {
  getCurrentMatchday,
  savePredictionFn,
  setBoosterFn,
  type MatchRow,
} from "@/lib/game.functions";

export const Route = createFileRoute("/_authenticated/play")({
  head: () => ({ meta: [{ title: "Play · Marcador" }] }),
  component: PlayPage,
});

function PlayPage() {
  const { me } = Route.useRouteContext();
  const q = useQuery({ queryKey: ["matchday"], queryFn: () => getCurrentMatchday() });

  return (
    <AppShell displayName={me.profile?.display_name} isAdmin={me.is_admin}>
      {q.isLoading && <SkeletonList />}
      {q.data === null && (
        <div className="text-center py-20 text-muted-foreground">
          No matchday available yet. Check back soon.
        </div>
      )}
      {q.data && (
        <>
          <div className="mb-6">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">
              Current matchday
            </div>
            <h1 className="font-display font-bold text-2xl md:text-3xl mt-1">
              {q.data.matchday.name}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Predictions lock at kickoff. Apply one 2× booster per matchday.
            </p>
          </div>
          <div className="space-y-3">
            {q.data.matches.map((m) => {
              const mdId = q.data!.matchday.id;
              return <MatchCard key={m.id} match={m} matchdayId={mdId} />;
            })}
          </div>
          <ScoringLegend />
        </>
      )}
    </AppShell>
  );
}

function MatchCard({ match, matchdayId }: { match: MatchRow; matchdayId: number }) {
  const qc = useQueryClient();
  const [home, setHome] = useState<number>(match.prediction?.home_goals ?? 0);
  const [away, setAway] = useState<number>(match.prediction?.away_goals ?? 0);
  const [scorer, setScorer] = useState<"home" | "away" | "none">(
    (match.prediction?.first_scorer as "home" | "away" | "none") ?? "home",
  );
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setHome(match.prediction?.home_goals ?? 0);
    setAway(match.prediction?.away_goals ?? 0);
    setScorer((match.prediction?.first_scorer as "home" | "away" | "none") ?? "home");
    setDirty(false);
  }, [match.id, match.prediction?.home_goals, match.prediction?.away_goals, match.prediction?.first_scorer]);

  const save = useMutation({
    mutationFn: () =>
      savePredictionFn({
        data: { match_id: match.id, home_goals: home, away_goals: away, first_scorer: scorer },
      }),
    onSuccess: () => {
      toast.success("Prediction saved.");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["matchday"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save."),
  });

  const boost = useMutation({
    mutationFn: () => setBoosterFn({ data: { matchday_id: matchdayId, match_id: match.id } }),
    onSuccess: () => {
      toast.success("Booster set.");
      qc.invalidateQueries({ queryKey: ["matchday"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed."),
  });

  const kickoff = new Date(match.kickoff_at);
  const change = (side: "h" | "a", delta: number) => {
    if (match.locked) return;
    setDirty(true);
    if (side === "h") setHome((v) => Math.max(0, Math.min(20, v + delta)));
    else setAway((v) => Math.max(0, Math.min(20, v + delta)));
  };

  return (
    <div
      className={`rounded-2xl border bg-card shadow-card overflow-hidden ${
        match.prediction?.booster ? "border-primary/60 shadow-glow" : "border-border"
      }`}
    >
      <div className="px-4 py-2.5 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {kickoff.toLocaleString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        <div className="flex items-center gap-2">
          {match.prediction?.points !== null && match.prediction?.points !== undefined && (
            <span className="font-score text-amber-glow font-bold">
              +{match.prediction.points} pts
            </span>
          )}
          {match.locked ? (
            <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
              Locked
            </span>
          ) : (
            <button
              onClick={() => boost.mutate()}
              disabled={boost.isPending}
              className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md transition ${
                match.prediction?.booster
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {match.prediction?.booster ? "2× boosted" : "Apply 2×"}
            </button>
          )}
        </div>
      </div>

      <div className="px-4 pb-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <TeamSide name={match.home_team} actual={match.home_score} />
          <div className="flex items-center gap-2">
            <ScoreStepper value={home} onChange={(d) => change("h", d)} locked={match.locked} />
            <span className="text-muted-foreground font-score text-xl">·</span>
            <ScoreStepper value={away} onChange={(d) => change("a", d)} locked={match.locked} />
          </div>
          <TeamSide name={match.away_team} actual={match.away_score} alignRight />
        </div>

        <div className="mt-4">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
            First team to score
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {(["home", "none", "away"] as const).map((opt) => (
              <button
                key={opt}
                disabled={match.locked}
                onClick={() => {
                  setScorer(opt);
                  setDirty(true);
                }}
                className={`rounded-lg px-2 py-2 text-xs font-semibold border transition ${
                  scorer === opt
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border text-muted-foreground hover:text-foreground"
                } ${match.locked ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                {opt === "home"
                  ? match.home_team
                  : opt === "away"
                  ? match.away_team
                  : "No goals / 0-0"}
              </button>
            ))}
          </div>
        </div>

        {!match.locked && (
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending || !dirty}
            className="mt-4 w-full rounded-xl bg-amber-gradient px-4 py-2.5 text-sm font-bold shadow-glow disabled:opacity-40"
          >
            {save.isPending
              ? "Saving…"
              : match.prediction
              ? dirty
                ? "Update prediction"
                : "Saved"
              : "Lock in prediction"}
          </button>
        )}
      </div>
    </div>
  );
}

function TeamSide({
  name,
  actual,
  alignRight,
}: {
  name: string;
  actual: number | null;
  alignRight?: boolean;
}) {
  return (
    <div className={`min-w-0 ${alignRight ? "text-right" : ""}`}>
      <div className="font-semibold text-sm md:text-base truncate">{name}</div>
      {actual !== null && (
        <div className="font-score text-amber-glow text-xs mt-0.5">Final: {actual}</div>
      )}
    </div>
  );
}

function ScoreStepper({
  value,
  onChange,
  locked,
}: {
  value: number;
  onChange: (delta: number) => void;
  locked: boolean;
}) {
  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={() => onChange(1)}
        disabled={locked}
        className="size-6 rounded-md hover:bg-secondary text-muted-foreground disabled:opacity-30"
        aria-label="Increase"
      >
        ▲
      </button>
      <div className="font-score text-3xl md:text-4xl font-bold w-10 text-center tabular-nums">
        {value}
      </div>
      <button
        type="button"
        onClick={() => onChange(-1)}
        disabled={locked || value === 0}
        className="size-6 rounded-md hover:bg-secondary text-muted-foreground disabled:opacity-30"
        aria-label="Decrease"
      >
        ▼
      </button>
    </div>
  );
}

function ScoringLegend() {
  const items = [
    ["+3", "Correct result"],
    ["+2", "Correct home goals"],
    ["+2", "Correct away goals"],
    ["+3", "Correct goal difference"],
    ["+3", "Correct first scorer"],
    ["2×", "Booster multiplier"],
  ];
  return (
    <div className="mt-8 rounded-2xl border border-border bg-card/60 p-4">
      <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
        Scoring
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        {items.map(([pts, label]) => (
          <div key={label} className="flex items-center gap-2">
            <span className="font-score font-bold text-primary w-9">{pts}</span>
            <span className="text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="rounded-2xl border border-border bg-card h-32 animate-pulse" />
      ))}
    </div>
  );
}
