import { forwardRef } from "react";
import { Zap } from "lucide-react";
import { teamFlag } from "@/lib/teamFlags";
import type { MatchRow } from "@/lib/game.functions";

type Props = {
  matchdayName: string;
  displayName: string;
  matches: MatchRow[];
  drafts: Record<number, { home: number; away: number }>;
  boostedMatchId: number | null;
};

export const PicksShareCard = forwardRef<HTMLDivElement, Props>(function PicksShareCard(
  { matchdayName, displayName, matches, drafts, boostedMatchId },
  ref,
) {
  return (
    <div
      ref={ref}
      className="relative w-[360px] rounded-3xl overflow-hidden text-foreground"
      style={{
        background:
          "linear-gradient(160deg, oklch(0.22 0.03 60) 0%, oklch(0.13 0.02 60) 100%)",
        boxShadow: "0 30px 60px -20px rgba(0,0,0,0.6)",
      }}
    >
      {/* Amber glow header */}
      <div
        className="px-6 pt-6 pb-5"
        style={{
          background:
            "linear-gradient(135deg, oklch(0.82 0.17 75) 0%, oklch(0.72 0.2 50) 100%)",
        }}
      >
        <div className="text-[10px] uppercase tracking-[0.3em] font-bold text-primary-foreground/80">
          El Marcador
        </div>
        <div className="mt-1 font-display font-bold text-2xl text-primary-foreground leading-tight">
          {matchdayName}
        </div>
        <div className="mt-1 text-xs text-primary-foreground/80">
          Picks de <span className="font-bold">{displayName}</span>
        </div>
      </div>

      <div className="px-5 py-4 space-y-2">
        {matches.map((m) => {
          const d = drafts[m.id] ?? { home: 0, away: 0 };
          const boosted = boostedMatchId === m.id;
          return (
            <div
              key={m.id}
              className={`rounded-xl px-3 py-2.5 flex items-center gap-2 ${
                boosted
                  ? "bg-primary/15 ring-1 ring-primary/60"
                  : "bg-background/40"
              }`}
            >
              <div className="flex-1 min-w-0 flex items-center gap-1.5">
                <span className="text-lg">{teamFlag(m.home_team)}</span>
                <span className="text-xs font-semibold truncate">{m.home_team}</span>
              </div>
              <div className="font-score font-bold text-base tabular-nums px-2 text-amber-glow">
                {d.home}–{d.away}
              </div>
              <div className="flex-1 min-w-0 flex items-center gap-1.5 justify-end">
                <span className="text-xs font-semibold truncate text-right">{m.away_team}</span>
                <span className="text-lg">{teamFlag(m.away_team)}</span>
              </div>
              {boosted && (
                <Zap size={14} className="text-primary shrink-0" fill="currentColor" />
              )}
            </div>
          );
        })}
      </div>

      <div className="px-6 pb-5 pt-1 flex items-center justify-between text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
        <span>marcador.app</span>
        <span className="font-bold text-amber-glow">⚽ predict · boost · win</span>
      </div>
    </div>
  );
});
