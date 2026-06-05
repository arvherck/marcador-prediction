import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Lock, Zap, Trophy, Share2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyBall } from "@/components/EmptyBall";
import { KickoffCountdown } from "@/components/KickoffCountdown";
import { ShareModal } from "@/components/ShareModal";
import { TournamentBanner } from "@/components/TournamentBanner";
import { useGuestGate } from "@/components/GuestGate";
import { useGuest } from "@/lib/guest";
import {
  getCurrentMatchday,
  getCurrentMatchdayPublic,
  savePredictionFn,
  setBoosterFn,
  type MatchRow,
} from "@/lib/game.functions";
import { teamFlag } from "@/lib/teamFlags";


export const Route = createFileRoute("/_authenticated/play")({
  head: () => {
    const url = "https://marcador-prediction.lovable.app/play";
    const title = "This matchday · Marcador";
    const description =
      "Predict the current World Cup 2026 matchday — six selected fixtures, exact scores, first scorer, and a 2× booster to double your call.";
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
  component: PlayPage,
});

type Scorer = "home" | "away" | "none";
type Draft = { home: number; away: number; scorer: Scorer; dirty: boolean };

function PlayPage() {
  const { me } = Route.useRouteContext();
  const guest = useGuest();
  const guestGate = useGuestGate();
  const q = useQuery({
    queryKey: ["matchday", guest ? "guest" : me.id],
    queryFn: () => (guest ? getCurrentMatchdayPublic() : getCurrentMatchday()),
  });
  const qc = useQueryClient();

  // Local draft state for all 6 cards
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [shareOpen, setShareOpen] = useState(false);


  useEffect(() => {
    if (!q.data) return;
    const next: Record<number, Draft> = {};
    for (const m of q.data.matches) {
      next[m.id] = {
        home: m.prediction?.home_goals ?? 0,
        away: m.prediction?.away_goals ?? 0,
        scorer: (m.prediction?.first_scorer as Scorer) ?? "home",
        dirty: false,
      };
    }
    setDrafts(next);
  }, [q.data]);

  const updateDraft = (id: number, patch: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch, dirty: true } }));

  const boostedMatchId = useMemo(
    () => q.data?.matches.find((m) => m.prediction?.booster)?.id ?? null,
    [q.data],
  );

  const boost = useMutation({
    mutationFn: (match_id: number) =>
      setBoosterFn({ data: { matchday_id: q.data!.matchday.id, match_id } }),
    onSuccess: () => {
      toast.success("2× booster applied.");
      qc.invalidateQueries({ queryKey: ["matchday"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed."),
  });

  const submitAll = useMutation({
    mutationFn: async () => {
      if (!q.data) return { saved: 0 };
      const dirty = q.data.matches.filter((m) => !m.locked && drafts[m.id]?.dirty);
      for (const m of dirty) {
        const d = drafts[m.id];
        await savePredictionFn({
          data: {
            match_id: m.id,
            home_goals: d.home,
            away_goals: d.away,
            first_scorer: d.scorer,
          },
        });
      }
      return { saved: dirty.length };
    },
    onSuccess: ({ saved }) => {
      if (saved === 0) toast("No changes to submit.");
      else {
        toast.success(`Submitted ${saved} prediction${saved === 1 ? "" : "s"}.`);
        setShareOpen(true);
      }
      qc.invalidateQueries({ queryKey: ["matchday"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed."),
  });

  const dirtyCount = q.data?.matches.filter(
    (m) => !m.locked && drafts[m.id]?.dirty,
  ).length ?? 0;

  const nextKickoff = useMemo(() => {
    if (!q.data) return null;
    const upcoming = q.data.matches
      .filter((m) => !m.locked)
      .map((m) => m.kickoff_at)
      .sort();
    return upcoming[0] ?? null;
  }, [q.data]);

  const allSaved = q.data && q.data.matches.length > 0 && dirtyCount === 0;
  const shareDrafts = useMemo(() => {
    const out: Record<number, { home: number; away: number }> = {};
    for (const id in drafts) out[id] = { home: drafts[id].home, away: drafts[id].away };
    return out;
  }, [drafts]);

  return (
    <AppShell displayName={me.profile?.display_name} isAdmin={me.is_admin}>
      {q.isLoading && <SkeletonList />}
      {q.data === null && (
        <EmptyBall
          title="No active matchday"
          sub="No matches available yet. Check back soon — the ball's about to roll."
        />
      )}
      {q.data && (
        <>
          {!guest && <TournamentBanner />}
          <header className="mb-5">
            <div className="text-xs uppercase tracking-[0.2em] text-amber-glow font-semibold">
              {q.data.matchday.name}
            </div>
            <h1 className="font-display font-bold text-3xl md:text-4xl mt-1 leading-tight">
              {q.data.matchday.name}
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              Predictions lock at kickoff. Apply one 2× booster per matchday.
            </p>
          </header>

          <div className="mb-5">
            <KickoffCountdown kickoffAt={nextKickoff} />
          </div>

          {q.data.matches.length === 0 ? (
            <EmptyBall
              title="This matchday has no fixtures yet"
              sub="The admin hasn't published them."
            />
          ) : (
            <div className="space-y-3 pb-28">
              {q.data.matches.map((m) => (
                <MatchCard
                  key={m.id}
                  match={m}
                  draft={drafts[m.id]}
                  onUpdate={(patch) => updateDraft(m.id, patch)}
                  boostedMatchId={boostedMatchId}
                  onToggleBooster={() => guestGate.require(() => boost.mutate(m.id), guest)}
                  boosterPending={boost.isPending}
                />
              ))}
            </div>
          )}

          {q.data.matches.length > 0 && <ScoringLegend />}

          {/* Sticky submit bar (hidden for guests) */}
          {q.data.matches.length > 0 && !guest && (
            <div className="fixed inset-x-0 bottom-16 md:bottom-6 z-30 px-4 pointer-events-none">
              <div className="max-w-2xl mx-auto pointer-events-auto flex gap-2">
                <button
                  onClick={() => guestGate.require(() => submitAll.mutate(), guest)}
                  disabled={submitAll.isPending || dirtyCount === 0}
                  className="flex-1 rounded-2xl bg-amber-gradient px-5 py-3.5 text-base font-bold text-primary-foreground shadow-glow disabled:opacity-40 disabled:cursor-not-allowed transition active:scale-[0.99]"
                >
                  {submitAll.isPending
                    ? "Submitting…"
                    : dirtyCount > 0
                    ? `Submit ${dirtyCount} prediction${dirtyCount === 1 ? "" : "s"}`
                    : "All saved"}
                </button>
                {allSaved && (
                  <button
                    onClick={() => setShareOpen(true)}
                    className="rounded-2xl bg-card border border-border px-4 py-3.5 text-sm font-bold flex items-center gap-2 shadow-card"
                    aria-label="Share picks"
                  >
                    <Share2 size={16} /> Share
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Guest CTA */}
          {q.data.matches.length > 0 && guest && (
            <div className="fixed inset-x-0 bottom-16 md:bottom-6 z-30 px-4 pointer-events-none">
              <div className="max-w-2xl mx-auto pointer-events-auto">
                <button
                  onClick={() => guestGate.setOpen(true)}
                  className="w-full rounded-2xl bg-amber-gradient px-5 py-3.5 text-base font-bold text-primary-foreground shadow-glow transition active:scale-[0.99]"
                >
                  Sign up to predict
                </button>
              </div>
            </div>
          )}

          <ShareModal
            open={shareOpen}
            onClose={() => setShareOpen(false)}
            matchdayName={q.data.matchday.name}
            displayName={me.profile?.display_name ?? "Player"}
            matches={q.data.matches}
            drafts={shareDrafts}
            boostedMatchId={boostedMatchId}
          />
        </>
      )}
      {guestGate.modal}
    </AppShell>
  );

}

function MatchCard({
  match,
  draft,
  onUpdate,
  boostedMatchId,
  onToggleBooster,
  boosterPending,
}: {
  match: MatchRow;
  draft: Draft | undefined;
  onUpdate: (p: Partial<Draft>) => void;
  boostedMatchId: number | null;
  onToggleBooster: () => void;
  boosterPending: boolean;
}) {
  const kickoff = new Date(match.kickoff_at);
  const isBoosted = boostedMatchId === match.id;
  const boosterDisabledOther = boostedMatchId !== null && !isBoosted;
  const hasResult = match.is_final && match.home_score !== null && match.away_score !== null;
  const home = draft?.home ?? 0;
  const away = draft?.away ?? 0;
  const scorer = draft?.scorer ?? "home";

  const change = (side: "h" | "a", delta: number) => {
    if (match.locked) return;
    if (side === "h") onUpdate({ home: Math.max(0, Math.min(20, home + delta)) });
    else onUpdate({ away: Math.max(0, Math.min(20, away + delta)) });
  };

  return (
    <div
      className={`rounded-2xl border bg-card shadow-card overflow-hidden transition ${
        match.locked
          ? "opacity-70 border-border"
          : isBoosted
          ? "border-primary shadow-glow"
          : "border-border"
      }`}
    >
      {/* Header strip */}
      <div className="px-4 py-2.5 flex items-center justify-between text-xs border-b border-border/50 bg-background/40">
        <span className="text-muted-foreground tabular-nums">
          {kickoff.toLocaleString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        <div className="flex items-center gap-2">
          {hasResult && match.prediction?.points !== null && match.prediction?.points !== undefined && (
            <span className="flex items-center gap-1 font-score text-amber-glow font-bold">
              <Trophy size={12} /> +{match.prediction.points} pts
            </span>
          )}
          {match.locked ? (
            <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
              <Lock size={12} /> Locked
            </span>
          ) : (
            <button
              onClick={onToggleBooster}
              disabled={boosterPending || boosterDisabledOther}
              className={`flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md transition ${
                isBoosted
                  ? "bg-primary text-primary-foreground shadow-glow"
                  : boosterDisabledOther
                  ? "bg-secondary/40 text-muted-foreground/40 cursor-not-allowed"
                  : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
              }`}
              aria-pressed={isBoosted}
            >
              <Zap size={12} fill={isBoosted ? "currentColor" : "none"} />
              {isBoosted ? "2× active" : "2× boost"}
            </button>
          )}
        </div>
      </div>

      {/* Score row — the hero */}
      <div className="px-4 pt-5 pb-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <TeamSide name={match.home_team} />
          <ScorePair
            home={home}
            away={away}
            onChange={change}
            locked={match.locked}
          />
          <TeamSide name={match.away_team} alignRight />
        </div>

        {/* Actual result */}
        {hasResult && (
          <div className="mt-3 flex items-center justify-center gap-2 text-xs">
            <span className="text-muted-foreground">Final</span>
            <span className="font-score font-bold text-amber-glow text-base tabular-nums">
              {match.home_score} – {match.away_score}
            </span>
          </div>
        )}

        {/* First scorer */}
        <div className="mt-5">
          <div className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground mb-2">
            First team to score
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {(["home", "none", "away"] as const).map((opt) => {
              const active = scorer === opt;
              const label =
                opt === "home"
                  ? `${teamFlag(match.home_team)} ${match.home_team}`
                  : opt === "away"
                  ? `${match.away_team} ${teamFlag(match.away_team)}`
                  : "0 – 0";
              return (
                <button
                  key={opt}
                  type="button"
                  disabled={match.locked}
                  onClick={() => onUpdate({ scorer: opt })}
                  className={`rounded-lg px-2 py-2 text-xs font-semibold border transition truncate ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-primary/50"
                  } ${match.locked ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
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
}: {
  home: number;
  away: number;
  onChange: (side: "h" | "a", delta: number) => void;
  locked: boolean;
}) {
  return (
    <div className="flex items-center gap-2 md:gap-3">
      <ScoreStepper value={home} onChange={(d) => onChange("h", d)} locked={locked} />
      <span className="font-score text-3xl text-muted-foreground/60 leading-none">:</span>
      <ScoreStepper value={away} onChange={(d) => onChange("a", d)} locked={locked} />
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
        disabled={locked || value === 0}
        className="size-6 rounded-md hover:bg-secondary text-muted-foreground disabled:opacity-30 transition"
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
    <div className="mt-6 rounded-2xl border border-border bg-card/60 p-4">
      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">
        Scoring
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        {items.map(([pts, label]) => (
          <div key={label} className="flex items-center gap-2">
            <span className="font-score font-bold text-primary w-9 tabular-nums">{pts}</span>
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
        <div key={i} className="rounded-2xl border border-border bg-card h-40 animate-pulse" />
      ))}
    </div>
  );
}
