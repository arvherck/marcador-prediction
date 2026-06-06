import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lock, Zap, Check, Loader2 } from "lucide-react";
import {
  getAllMatchdays,
  getMatchdayAllMatches,
  savePredictionFn,
  setBoosterFn,
  type MatchRow,
} from "@/lib/game.functions";
import { teamFlag } from "@/lib/teamFlags";
import { supabase } from "@/integrations/supabase/client";

type Scorer = "home" | "away" | "none";

export function AllMatchesView({
  initialMatchdayId,
}: {
  initialMatchdayId: number | null;
}) {
  const qc = useQueryClient();
  const mdsQ = useQuery({ queryKey: ["all-mds"], queryFn: () => getAllMatchdays() });
  const [activeMd, setActiveMd] = useState<number | null>(initialMatchdayId);

  useEffect(() => {
    if (activeMd == null && mdsQ.data && mdsQ.data.length > 0) {
      const next =
        mdsQ.data.find((md) => md.available > md.predicted) ??
        mdsQ.data.find((md) => md.available > 0) ??
        mdsQ.data[0];
      setActiveMd(next.id);
    }
  }, [mdsQ.data, activeMd]);

  // Realtime: announce newly confirmed matches
  useEffect(() => {
    const ch = supabase
      .channel("matches-confirmed")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "matches" },
        (payload) => {
          const oldRow = payload.old as { teams_confirmed?: boolean } | null;
          const newRow = payload.new as {
            teams_confirmed?: boolean;
            home_team?: string;
            away_team?: string;
          } | null;
          if (oldRow?.teams_confirmed === false && newRow?.teams_confirmed === true) {
            toast(`New match available to predict: ${newRow.home_team} vs ${newRow.away_team}`);
            qc.invalidateQueries({ queryKey: ["all-mds"] });
            qc.invalidateQueries({ queryKey: ["all-matches"] });
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [qc]);

  return (
    <div className="mt-8">
      <h2 className="font-display font-bold text-xl mb-1">Predict all matches</h2>
      <p className="text-xs text-muted-foreground mb-3">
        Auto-saved as you type. One booster per matchday across all your picks.
      </p>

      {/* Matchday tabs */}
      <div className="-mx-4 px-4 overflow-x-auto pb-2 scrollbar-thin">
        <div className="flex gap-2 min-w-max">
          {(mdsQ.data ?? []).map((md, i) => {
            const active = md.id === activeMd;
            return (
              <button
                key={md.id}
                onClick={() => setActiveMd(md.id)}
                className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold border transition ${
                  active
                    ? "bg-primary text-primary-foreground border-primary shadow-glow"
                    : "bg-card text-muted-foreground border-border hover:text-foreground"
                }`}
              >
                MD{i + 1}{" "}
                <span className={active ? "opacity-90" : "opacity-60"}>
                  ({md.predicted}/{md.available})
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {activeMd != null && <MatchdayPanel matchdayId={activeMd} />}
    </div>
  );
}

function MatchdayPanel({ matchdayId }: { matchdayId: number }) {
  const q = useQuery({
    queryKey: ["all-matches", matchdayId],
    queryFn: () => getMatchdayAllMatches({ data: { matchday_id: matchdayId } }),
  });
  const qc = useQueryClient();

  const boostedMatchId = useMemo(
    () => q.data?.matches.find((m) => m.prediction?.booster)?.id ?? null,
    [q.data],
  );

  const boost = useMutation({
    mutationFn: (match_id: number) =>
      setBoosterFn({ data: { matchday_id: matchdayId, match_id } }),
    onSuccess: () => {
      toast.success("2× booster applied.");
      qc.invalidateQueries({ queryKey: ["all-matches", matchdayId] });
      qc.invalidateQueries({ queryKey: ["matchday"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed."),
  });

  if (q.isLoading) {
    return <div className="mt-4 text-sm text-muted-foreground">Loading matches…</div>;
  }
  if (!q.data || q.data.matches.length === 0) {
    return <div className="mt-4 text-sm text-muted-foreground">No matches.</div>;
  }

  return (
    <div className="mt-4 grid gap-2 pb-28">
      {q.data.matches.map((m) => (
        <CompactMatchCard
          key={m.id}
          match={m}
          boostedMatchId={boostedMatchId}
          onBoost={() => boost.mutate(m.id)}
          boosterPending={boost.isPending}
          onSaved={() => qc.invalidateQueries({ queryKey: ["all-mds"] })}
        />
      ))}
    </div>
  );
}

type SaveState = "idle" | "saving" | "saved" | "error";

function CompactMatchCard({
  match,
  boostedMatchId,
  onBoost,
  boosterPending,
  onSaved,
}: {
  match: MatchRow;
  boostedMatchId: number | null;
  onBoost: () => void;
  boosterPending: boolean;
  onSaved: () => void;
}) {
  const isBoosted = boostedMatchId === match.id;
  const boosterDisabledOther = boostedMatchId !== null && !isBoosted;
  const disabled = match.locked || !match.teams_confirmed;
  const [home, setHome] = useState(match.prediction?.home_goals ?? 0);
  const [away, setAway] = useState(match.prediction?.away_goals ?? 0);
  const [scorer, setScorer] = useState<Scorer>(
    (match.prediction?.first_scorer as Scorer) ?? "home",
  );
  const [state, setState] = useState<SaveState>(
    match.prediction ? "saved" : "idle",
  );
  const dirtyRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset local state when match identity / server prediction changes
  useEffect(() => {
    setHome(match.prediction?.home_goals ?? 0);
    setAway(match.prediction?.away_goals ?? 0);
    setScorer((match.prediction?.first_scorer as Scorer) ?? "home");
    setState(match.prediction ? "saved" : "idle");
    dirtyRef.current = false;
  }, [match.id, match.prediction?.home_goals, match.prediction?.away_goals, match.prediction?.first_scorer]);

  // Debounced auto-save
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
        onSaved();
      } catch (e) {
        setState("error");
        toast.error(e instanceof Error ? e.message : "Save failed");
      }
    }, 1000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [home, away, scorer]);

  const touch = () => {
    dirtyRef.current = true;
  };

  const kickoff = new Date(match.kickoff_at);
  const hasResult = match.is_final && match.home_score !== null && match.away_score !== null;

  if (!match.teams_confirmed) {
    return (
      <div className="rounded-xl border border-border bg-card/40 px-3 py-2.5 opacity-60">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            {kickoff.toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <span className="uppercase tracking-wider font-bold">Teams TBD</span>
        </div>
        <div className="mt-1.5 text-sm font-medium text-muted-foreground truncate">
          {match.home_team} vs {match.away_team}
        </div>
        {(match.stadium || match.city) && (
          <div className="mt-0.5 text-[10px] text-muted-foreground/70 truncate">
            {[match.stadium, match.city].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border bg-card px-3 py-2.5 ${
        isBoosted ? "border-primary shadow-glow" : "border-border"
      } ${match.locked ? "opacity-70" : ""}`}
    >
      <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1.5">
        <span className="tabular-nums">
          {kickoff.toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        <StatusPill state={state} locked={match.locked} />
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-lg shrink-0">{teamFlag(match.home_team)}</span>
          <span className="font-semibold text-sm truncate">{match.home_team}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <NumInput value={home} disabled={disabled} onChange={(v) => { setHome(v); touch(); }} />
          <span className="font-score text-lg text-muted-foreground/60">:</span>
          <NumInput value={away} disabled={disabled} onChange={(v) => { setAway(v); touch(); }} />
        </div>
        <div className="flex items-center gap-1.5 min-w-0 justify-end flex-row-reverse">
          <span className="text-lg shrink-0">{teamFlag(match.away_team)}</span>
          <span className="font-semibold text-sm truncate text-right">{match.away_team}</span>
        </div>
      </div>

      {(match.stadium || match.city) && (
        <div className="mt-1 text-center text-[10px] text-muted-foreground/80 truncate">
          {[match.stadium, match.city].filter(Boolean).join(" · ")}
        </div>
      )}

      {hasResult && (
        <div className="mt-1 text-center text-[11px]">
          <span className="text-muted-foreground">Final </span>
          <span className="font-score font-bold text-amber-glow tabular-nums">
            {match.home_score} – {match.away_score}
          </span>
        </div>
      )}

      <div className="mt-2 flex items-center gap-1.5">
        <div className="flex-1 grid grid-cols-3 gap-1">
          {(["home", "none", "away"] as const).map((opt) => {
            const active = scorer === opt;
            const label = opt === "home" ? "Home 1st" : opt === "away" ? "Away 1st" : "0–0";
            return (
              <button
                key={opt}
                disabled={disabled}
                onClick={() => { setScorer(opt); touch(); }}
                className={`rounded-md px-1.5 py-1 text-[10px] font-semibold border transition ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border text-muted-foreground hover:text-foreground"
                } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                {label}
              </button>
            );
          })}
        </div>
        {!match.locked && (
          <button
            onClick={onBoost}
            disabled={boosterPending || boosterDisabledOther}
            className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md transition ${
              isBoosted
                ? "bg-primary text-primary-foreground shadow-glow"
                : boosterDisabledOther
                ? "bg-secondary/40 text-muted-foreground/40 cursor-not-allowed"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
            title={
              boosterDisabledOther
                ? "Booster already used on another match in this matchday"
                : "Apply 2× booster"
            }
          >
            <Zap size={10} fill={isBoosted ? "currentColor" : "none"} />
            2×
          </button>
        )}
      </div>
    </div>
  );
}

function NumInput({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      min={0}
      max={20}
      disabled={disabled}
      value={value}
      onChange={(e) => {
        const n = Math.max(0, Math.min(20, parseInt(e.target.value || "0", 10) || 0));
        onChange(n);
      }}
      className="w-10 text-center font-score font-bold text-lg tabular-nums rounded-md bg-input border border-border py-0.5 disabled:opacity-50"
    />
  );
}

function StatusPill({ state, locked }: { state: SaveState; locked: boolean }) {
  if (locked) {
    return (
      <span className="inline-flex items-center gap-1 uppercase tracking-wider font-bold">
        <Lock size={10} /> Locked
      </span>
    );
  }
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Loader2 size={10} className="animate-spin" /> Saving…
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="inline-flex items-center gap-1 text-success">
        <Check size={10} /> Saved
      </span>
    );
  }
  if (state === "error") {
    return <span className="text-destructive font-semibold">Error</span>;
  }
  return null;
}
