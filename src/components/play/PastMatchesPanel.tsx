import { useMemo } from "react";
import { Trophy } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { groupByDate, smartDayLabel } from "@/lib/date-labels";
import { teamFlag } from "@/lib/teamFlags";
import type { MatchRow } from "@/lib/game.functions";

export function PastMatchesPanel({
  open,
  onOpenChange,
  matches,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  matches: MatchRow[];
}) {
  const now = Date.now();
  const past = useMemo(
    () =>
      matches.filter((m) => new Date(m.kickoff_at).getTime() < now),
    [matches, now],
  );
  const groups = useMemo(() => groupByDate(past).reverse(), [past]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-full sm:max-w-md overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle className="font-display">
            Past matches & results
          </SheetTitle>
        </SheetHeader>
        {groups.length === 0 ? (
          <div className="mt-8 text-sm text-muted-foreground text-center">
            No completed matches yet.
          </div>
        ) : (
          <div className="mt-4 space-y-6 pb-12">
            {groups.map((g) => (
              <section key={g.key} className="space-y-2">
                <h3 className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  {smartDayLabel(g.date, g.phase)}
                </h3>
                <ul className="space-y-2">
                  {g.matches.map((m) => (
                    <PastMatchRow key={m.id} match={m} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function PastMatchRow({ match }: { match: MatchRow }) {
  const hasResult =
    match.is_final && match.home_score !== null && match.away_score !== null;
  const p = match.prediction;
  return (
    <li className="rounded-xl border border-border bg-card/60 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <div className="min-w-0 flex items-center gap-2 truncate">
          <span className="text-lg leading-none">{teamFlag(match.home_team ?? "")}</span>
          <span className="font-semibold truncate">{match.home_team ?? match.home_placeholder ?? "TBD"}</span>
        </div>
        <div className="font-score font-bold tabular-nums text-base whitespace-nowrap">
          {hasResult ? (
            <span>
              {match.home_score} <span className="text-muted-foreground">–</span>{" "}
              {match.away_score}
            </span>
          ) : (
            <span className="text-muted-foreground text-xs uppercase">TBD</span>
          )}
        </div>
        <div className="min-w-0 flex items-center gap-2 justify-end truncate">
          <span className="font-semibold truncate">{match.away_team ?? match.away_placeholder ?? "TBD"}</span>
          <span className="text-lg leading-none">{teamFlag(match.away_team ?? "")}</span>
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          {p
            ? `Your pick: ${p.home_goals}–${p.away_goals}${
                p.booster ? " · 2×" : ""
              }`
            : "No prediction"}
        </span>
        {p?.points != null ? (
          <span className="inline-flex items-center gap-1 font-score font-bold text-amber-glow">
            <Trophy size={11} /> +{p.points}
          </span>
        ) : hasResult ? (
          <span className="text-muted-foreground/70">Pending</span>
        ) : null}
      </div>
    </li>
  );
}
