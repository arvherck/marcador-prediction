import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Loader2, Lock, Radio, Trophy, Zap } from "lucide-react";
import {
  savePredictionFn,
  setBoosterFn,
  type MatchRow,
  type MatchStatus,
} from "@/lib/game.functions";
import { teamFlag } from "@/lib/teamFlags";
import { reconcilePrediction, type Scorer } from "@/lib/prediction-consistency";
import { explainPoints } from "@/lib/scoring-explain";

type SaveState = "idle" | "saving" | "saved" | "error";

function formatCountdown(ms: number): string {
  if (ms <= 0) return "Locked";
  const totalMin = Math.floor(ms / 60_000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const minutes = totalMin % 60;
  if (days > 0) return `Locks in ${days}d ${hours}h`;
  if (hours >= 3) return `Locks in ${hours}h`;
  if (hours > 0) return `Locks in ${hours}h ${minutes}m`;
  return `Locks in ${minutes}m`;
}

function scorerLabelFor(match: MatchRow, scorer: string | null | undefined): string {
  if (!scorer || scorer === "none") return "No goal";
  if (scorer === "home") return `${match.home_team} scored first`;
  if (scorer === "away") return `${match.away_team} scored first`;
  return scorer;
}

export function MatchCard({
  match,
  boostedMatchIdInMatchday,
  onChanged,
  guest,
  onGuestAction,
}: {
  match: MatchRow;
  boostedMatchIdInMatchday: number | null;
  onChanged: () => void;
  guest?: boolean;
  onGuestAction?: () => void;
}) {
  const qc = useQueryClient();
  const isBoosted = boostedMatchIdInMatchday === match.id;
  const otherBoosted = boostedMatchIdInMatchday !== null && !isBoosted;
  const kickoff = new Date(match.kickoff_at);
  const hasResult =
    match.is_final && match.home_score !== null && match.away_score !== null;
  const placeholder = !match.teams_confirmed;
  const status: MatchStatus = match.effective_status;
  const disabled = match.locked || placeholder || !!guest;

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (status !== "upcoming") return;
    const ms = kickoff.getTime() - Date.now();
    if (ms <= 0) return;
    const tick = ms < 3 * 60 * 60 * 1000 ? 30_000 : 5 * 60_000;
    const id = setInterval(() => setNow(Date.now()), tick);
    return () => clearInterval(id);
  }, [status, kickoff]);

  const [home, setHome] = useState(match.prediction?.home_goals ?? 0);
  const [away, setAway] = useState(match.prediction?.away_goals ?? 0);
  const [scorer, setScorer] = useState<Scorer>(
    (match.prediction?.first_scorer as Scorer) ?? "home",
  );
  const [hint, setHint] = useState<string | null>(null);
  const [state, setState] = useState<SaveState>(
    match.prediction ? "saved" : "idle",
  );
  const dirtyRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setHome(match.prediction?.home_goals ?? 0);
    setAway(match.prediction?.away_goals ?? 0);
    setScorer((match.prediction?.first_scorer as Scorer) ?? "home");
    setState(match.prediction ? "saved" : "idle");
    setHint(null);
    dirtyRef.current = false;
  }, [
    match.id,
    match.prediction?.home_goals,
    match.prediction?.away_goals,
    match.prediction?.first_scorer,
  ]);

  const showHint = (msg: string | undefined) => {
    if (hintTimer.current) clearTimeout(hintTimer.current);
    if (!msg) {
      setHint(null);
      return;
    }
    setHint(msg);
    hintTimer.current = setTimeout(() => setHint(null), 4000);
  };

  const apply = (
    next: { home?: number; away?: number; scorer?: Scorer },
    changed: "home" | "away" | "scorer",
  ) => {
    const r = reconcilePrediction({
      home: next.home ?? home,
      away: next.away ?? away,
      scorer: next.scorer ?? scorer,
      changed,
      homeTeam: match.home_team ?? undefined,
      awayTeam: match.away_team ?? undefined,
    });
    setHome(r.home);
    setAway(r.away);
    setScorer(r.scorer);
    showHint(r.hint);
  };

  useEffect(() => {
    if (disabled) return;
    if (!dirtyRef.current) return;
    if (timer.current) clearTimeout(timer.current);
    setState("saving");
    timer.current = setTimeout(async () => {
      try {
        await savePredictionFn({
          data: {
            match_id: match.id,
            home_goals: home,
            away_goals: away,
            first_scorer: scorer,
          },
        });
        setState("saved");
        dirtyRef.current = false;
        onChanged();
      } catch (e) {
        setState("error");
        toast.error(e instanceof Error ? e.message : "Save failed");
      }
    }, 800);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [home, away, scorer]);

  const touch = () => {
    if (guest) {
      onGuestAction?.();
      return false;
    }
    dirtyRef.current = true;
    return true;
  };

  const boost = useMutation({
    mutationFn: () =>
      setBoosterFn({ data: { matchday_id: match.matchday_id, match_id: match.id } }),
    onSuccess: (res) => {
      if (res && (res as { applied?: boolean }).applied === false) {
        toast("Booster removed.");
      } else {
        toast.success("2× booster applied.");
      }
      qc.invalidateQueries({ queryKey: ["all-matches"] });
      qc.invalidateQueries({ queryKey: ["matchdays-progress"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed."),
  });


  // Placeholder (teams TBD) card
  if (placeholder) {
    return (
      <div className="rounded-2xl border border-border bg-card/40 px-4 py-3 opacity-70">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="tabular-nums">
            {kickoff.toLocaleString(undefined, {
              weekday: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {match.group_letter && (
            <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
              Group {match.group_letter}
            </span>
          )}
        </div>
        <div className="mt-2 text-sm font-medium text-muted-foreground">
          {match.home_team ?? match.home_placeholder ?? "TBD"} <span className="opacity-60">vs</span> {match.away_team ?? match.away_placeholder ?? "TBD"}
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground/80">
          Teams TBD — predictions open soon
        </div>
        {(match.stadium || match.city) && (
          <div className="mt-1 text-[10px] text-muted-foreground/70 truncate">
            {[match.stadium, match.city].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border bg-card shadow-card overflow-hidden transition ${
        match.locked
          ? "opacity-75 border-border"
          : isBoosted
          ? "border-amber-glow shadow-glow ring-1 ring-amber-glow/50"
          : "border-border"
      }`}
    >
      <div className="px-4 py-2.5 flex items-center justify-between text-xs border-b border-border/50 bg-background/40">
        <span className="text-muted-foreground tabular-nums">
          {kickoff.toLocaleString(undefined, {
            weekday: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        <div className="flex items-center gap-2">
          {match.group_letter && (
            <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Group {match.group_letter}
            </span>
          )}
          {match.phase && !match.group_letter && (
            <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {match.phase}
            </span>
          )}
          {match.points_multiplier > 1 && (
            <span
              className="rounded-md bg-amber-glow/15 text-amber-glow px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
              title={`Points multiplied ×${match.points_multiplier} in this round`}
              aria-label={`Points multiplied ×${match.points_multiplier} in this round`}
            >
              {match.points_multiplier}×
            </span>
          )}
          <StatusPill state={state} status={status} />
        </div>
      </div>

      <div className="px-4 pt-5 pb-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <TeamSide name={match.home_team ?? ""} />
          <ScorePair
            home={home}
            away={away}
            onChange={(side, delta) => {
              if (!touch()) return;
              if (side === "h") apply({ home: Math.max(0, Math.min(20, home + delta)) }, "home");
              else apply({ away: Math.max(0, Math.min(20, away + delta)) }, "away");
            }}
            locked={disabled}
            scoresLocked={scorer === "none"}
            homeDecDisabled={scorer === "home" && home <= 1}
            awayDecDisabled={scorer === "away" && away <= 1}
          />
          <TeamSide name={match.away_team ?? ""} alignRight />
        </div>

        {hint && !disabled && (
          <div className="mt-2 text-center text-[11px] text-muted-foreground italic">
            {hint}
          </div>
        )}

        {(match.stadium || match.city) && (
          <div className="mt-2 text-center text-[11px] text-muted-foreground truncate">
            {[match.stadium, match.city].filter(Boolean).join(" · ")}
          </div>
        )}

        {status === "upcoming" && !guest && (
          <div className="mt-2 text-center text-[11px] text-muted-foreground tabular-nums">
            {formatCountdown(kickoff.getTime() - now)}
          </div>
        )}

        {status === "live" && (
          <div className="mt-3 text-center text-[11px] text-muted-foreground inline-flex items-center justify-center gap-1.5 w-full">
            <Lock size={11} /> Match in progress — predictions locked
          </div>
        )}

        {status === "cancelled" && (
          <div className="mt-3 text-center text-xs text-muted-foreground italic">
            Match cancelled
          </div>
        )}

        {hasResult && status === "completed" && (
          <div className="mt-3 flex flex-col items-center gap-1">
            <div className="flex items-center justify-center gap-2 text-xs">
              <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                FT
              </span>
              <span className="font-score font-bold text-amber-glow text-base tabular-nums">
                {match.home_score} – {match.away_score}
              </span>
            </div>
            <PointsBreakdown match={match} />
          </div>
        )}

        {(status === "live" || status === "completed" || status === "cancelled") &&
          match.prediction && (
            <div className="mt-2 text-center text-[11px] text-muted-foreground">
              <span className="opacity-80">Your prediction: </span>
              <span className="font-score font-bold text-foreground tabular-nums">
                {match.prediction.home_goals}-{match.prediction.away_goals}
              </span>
              <span className="opacity-80">
                {" "}· {scorerLabelFor(match, match.prediction.first_scorer)}
              </span>
              {match.prediction.booster && (
                <span className="ml-1 text-amber-glow font-bold">· 2×</span>
              )}
            </div>
          )}

        <div className="mt-5">
          <div className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground mb-2">
            First team to score
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {(["home", "none", "away"] as const).map((opt) => {
              const active = scorer === opt;
              const label =
                opt === "home"
                  ? `${teamFlag(match.home_team ?? "")} ${match.home_team ?? ""}`
                  : opt === "away"
                  ? `${match.away_team ?? ""} ${teamFlag(match.away_team ?? "")}`
                  : "No goal";
              return (
                <button
                  key={opt}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    if (!touch()) return;
                    apply({ scorer: opt }, "scorer");
                  }}
                  className={`rounded-lg px-2 py-2 text-xs font-semibold border transition truncate ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-primary/50"
                  } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          {!match.locked ? (
            <button
              onClick={() => {
                if (guest) {
                  onGuestAction?.();
                  return;
                }
                boost.mutate();
              }}
              disabled={boost.isPending || (otherBoosted && !isBoosted)}
              className={`inline-flex items-center gap-1 text-[11px] uppercase tracking-wider font-bold px-2.5 py-1.5 rounded-md transition ${
                isBoosted
                  ? "bg-amber-gradient text-primary-foreground shadow-glow"
                  : otherBoosted
                  ? "bg-secondary/40 text-muted-foreground/40 cursor-not-allowed"
                  : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
              }`}
              title={
                isBoosted
                  ? "Remove 2× booster"
                  : otherBoosted
                  ? "Booster already used on another match in this matchday"
                  : "Apply 2× booster"
              }
            >
              <Zap size={12} fill={isBoosted ? "currentColor" : "none"} />
              {isBoosted ? "2× active" : "2× boost"}
            </button>

          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
              <Lock size={10} /> Locked
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function TeamSide({ name, alignRight }: { name: string; alignRight?: boolean }) {
  return (
    <div
      className={`min-w-0 flex items-center gap-2 ${
        alignRight ? "justify-end flex-row-reverse" : ""
      }`}
    >
      <span className="text-2xl md:text-3xl leading-none shrink-0">{teamFlag(name)}</span>
      <div className={`font-semibold text-sm md:text-base truncate ${alignRight ? "text-right" : ""}`}>
        {name}
      </div>
    </div>
  );
}

function ScorePair({
  home,
  away,
  onChange,
  locked,
  scoresLocked,
  homeDecDisabled,
  awayDecDisabled,
}: {
  home: number;
  away: number;
  onChange: (side: "h" | "a", delta: number) => void;
  locked: boolean;
  scoresLocked?: boolean;
  homeDecDisabled?: boolean;
  awayDecDisabled?: boolean;
}) {
  const allLocked = locked || !!scoresLocked;
  return (
    <div className="flex items-center gap-2 md:gap-3">
      <ScoreStepper
        value={home}
        onChange={(d) => onChange("h", d)}
        locked={allLocked}
        decDisabled={homeDecDisabled}
      />
      <span className="font-score text-3xl text-muted-foreground/60 leading-none">:</span>
      <ScoreStepper
        value={away}
        onChange={(d) => onChange("a", d)}
        locked={allLocked}
        decDisabled={awayDecDisabled}
      />
    </div>
  );
}

function ScoreStepper({
  value,
  onChange,
  locked,
  decDisabled,
}: {
  value: number;
  onChange: (delta: number) => void;
  locked: boolean;
  decDisabled?: boolean;
}) {
  return (
    <div className="flex flex-col items-center select-none">
      <button
        type="button"
        onClick={() => onChange(1)}
        disabled={locked}
        className="size-6 rounded-md hover:bg-secondary text-muted-foreground disabled:opacity-30 transition"
        aria-label="Increase"
      >
        ▲
      </button>
      <div
        className={`font-score font-bold w-14 text-center tabular-nums leading-none py-1 text-4xl md:text-5xl ${
          locked ? "text-muted-foreground" : "text-foreground"
        }`}
      >
        {value}
      </div>
      <button
        type="button"
        onClick={() => onChange(-1)}
        disabled={locked || decDisabled || value === 0}
        className="size-6 rounded-md hover:bg-secondary text-muted-foreground disabled:opacity-30 transition"
        aria-label="Decrease"
      >
        ▼
      </button>
    </div>
  );
}

function StatusPill({ state, status }: { state: SaveState; status: MatchStatus }) {
  if (status === "live") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-destructive">
        <Radio size={10} className="animate-pulse" /> Live
      </span>
    );
  }
  if (status === "completed") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-success">
        <Check size={10} /> Full time
      </span>
    );
  }
  if (status === "cancelled") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
        Cancelled
      </span>
    );
  }
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Loader2 size={10} className="animate-spin" /> Saving
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-success">
        <Check size={10} /> Saved
      </span>
    );
  }
  if (state === "error") {
    return <span className="text-[10px] uppercase font-bold text-destructive">Error</span>;
  }
  return null;
}

function PointsBreakdown({ match }: { match: MatchRow }) {
  const { lines, total, boosted } = explainPoints(match);
  if (!lines.length && total === 0 && match.prediction?.points == null) return null;
  const positive = total > 0;
  return (
    <div
      className={`text-[11px] tabular-nums inline-flex items-center gap-1 flex-wrap justify-center ${
        positive ? "text-success" : "text-muted-foreground"
      }`}
    >
      {lines.map((l, i) => (
        <span key={i}>
          +{l.pts} {l.label.toLowerCase()}
          {i < lines.length - 1 ? " · " : ""}
        </span>
      ))}
      <span className="font-bold inline-flex items-center gap-1 ml-1">
        <Trophy size={11} />
        {boosted ? `${total} pts (2×)` : `${total} pts`}
      </span>
    </div>
  );
}
