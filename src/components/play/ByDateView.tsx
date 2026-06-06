import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MatchCard } from "./MatchCard";
import type { MatchRow } from "@/lib/game.functions";

function dateKey(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" });
}

function dateLabel(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function isToday(iso: string) {
  const d = new Date(iso);
  const n = new Date();
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  );
}

function formatCountdown(target: Date) {
  const ms = target.getTime() - Date.now();
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
  }
  return `${h}h ${m}m`;
}

export function ByDateView({
  matches,
  guest,
  onGuestAction,
}: {
  matches: MatchRow[];
  guest?: boolean;
  onGuestAction?: () => void;
}) {
  const qc = useQueryClient();
  const [showPast, setShowPast] = useState(false);
  const now = Date.now();

  // booster per matchday
  const boostedByMd = useMemo(() => {
    const m = new Map<number, number>();
    for (const x of matches) {
      if (x.prediction?.booster) m.set(x.matchday_id, x.id);
    }
    return m;
  }, [matches]);

  const groups = useMemo(() => {
    const map = new Map<string, MatchRow[]>();
    for (const m of matches) {
      const k = dateKey(m.kickoff_at);
      const arr = map.get(k) ?? [];
      arr.push(m);
      map.set(k, arr);
    }
    const out = Array.from(map.entries()).map(([k, items]) => ({
      key: k,
      // representative date for sorting/labelling
      ref: items[0].kickoff_at,
      items: items.sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at)),
    }));
    out.sort((a, b) => a.ref.localeCompare(b.ref));
    return out;
  }, [matches]);

  const visibleGroups = useMemo(() => {
    if (showPast) return groups;
    return groups.filter((g) => {
      // include the group if any match is today or future
      const last = g.items[g.items.length - 1];
      return new Date(last.kickoff_at).getTime() >= startOfToday();
    });
  }, [groups, showPast]);

  const nextUpcomingId = useMemo(() => {
    for (const g of visibleGroups) {
      for (const m of g.items) {
        if (new Date(m.kickoff_at).getTime() > now && m.teams_confirmed) return m.id;
      }
    }
    return null;
  }, [visibleGroups, now]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["all-matches"] });
    qc.invalidateQueries({ queryKey: ["matchdays-progress"] });
    qc.invalidateQueries({ queryKey: ["play-overview"] });
  };

  return (
    <div className="space-y-6 pb-12">
      {!showPast && groups.length > visibleGroups.length && (
        <button
          onClick={() => setShowPast(true)}
          className="text-xs font-bold text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
        >
          Show past matches
        </button>
      )}
      {visibleGroups.map((g) => {
        const predicted = g.items.filter((m) => m.prediction).length;
        const today = isToday(g.ref);
        return (
          <section key={g.key} className="space-y-2">
            <div className="sticky top-0 z-10 -mx-2 px-2 py-2 bg-background/85 backdrop-blur border-b border-border/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="font-display font-bold text-base md:text-lg">
                  {dateLabel(g.ref)}
                </h2>
                {today && (
                  <span className="rounded-md bg-amber-gradient text-primary-foreground text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5">
                    Today
                  </span>
                )}
              </div>
              <span className="text-[11px] text-muted-foreground">
                {g.items.length} match{g.items.length === 1 ? "" : "es"} · {predicted} predicted
              </span>
            </div>
            <div className="space-y-3">
              {g.items.map((m) => (
                <div key={m.id} className="relative">
                  {m.id === nextUpcomingId && (
                    <CountdownChip kickoff={new Date(m.kickoff_at)} />
                  )}
                  <MatchCard
                    match={m}
                    boostedMatchIdInMatchday={boostedByMd.get(m.matchday_id) ?? null}
                    onChanged={invalidate}
                    guest={guest}
                    onGuestAction={onGuestAction}
                  />
                </div>
              ))}
            </div>
          </section>
        );
      })}
      {visibleGroups.length === 0 && (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No upcoming matches.
        </div>
      )}
    </div>
  );
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function CountdownChip({ kickoff }: { kickoff: Date }) {
  const txt = formatCountdown(kickoff);
  if (!txt) return null;
  return (
    <div className="absolute -top-2 left-3 z-10 rounded-md bg-amber-gradient text-primary-foreground text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 shadow-glow">
      Next in {txt}
    </div>
  );
}
