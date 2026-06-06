import { useEffect, useMemo, useRef } from "react";
import { Check } from "lucide-react";
import { ByDateView } from "./ByDateView";
import type { MatchRow } from "@/lib/game.functions";

type MdProgress = {
  id: number;
  name: string;
  starts_at: string;
  is_scored: boolean;
  total: number;
  available: number;
  predicted: number;
};

function shortLabel(name: string) {
  // "Matchday 1" -> "MD1", "Round of 32" -> "R32", etc.
  const m = name.match(/Matchday\s*(\d+)/i);
  if (m) return `MD${m[1]}`;
  const r = name.match(/Round of (\d+)/i);
  if (r) return `R${r[1]}`;
  if (/quarter/i.test(name)) return "QF";
  if (/semi/i.test(name)) return "SF";
  if (/final/i.test(name)) return "F";
  return name.slice(0, 4);
}

export function ByMatchdayView({
  matchdays,
  matches,
  activeMd,
  onActive,
  guest,
  onGuestAction,
}: {
  matchdays: MdProgress[];
  matches: MatchRow[];
  activeMd: number | null;
  onActive: (id: number) => void;
  guest?: boolean;
  onGuestAction?: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<number, HTMLButtonElement>());

  // Auto-pick current matchday on first render if none selected
  useEffect(() => {
    if (activeMd != null) return;
    if (!matchdays.length) return;
    const now = Date.now();
    const next =
      matchdays.find((md) =>
        matches.some(
          (m) => m.matchday_id === md.id && new Date(m.kickoff_at).getTime() > now,
        ),
      ) ?? matchdays[0];
    onActive(next.id);
  }, [activeMd, matchdays, matches, onActive]);

  // Scroll active tab into view
  useEffect(() => {
    if (activeMd == null) return;
    const el = tabRefs.current.get(activeMd);
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeMd]);

  const activeMdRow = matchdays.find((md) => md.id === activeMd) ?? null;
  const activeMatches = useMemo(
    () => matches.filter((m) => m.matchday_id === activeMd),
    [matches, activeMd],
  );

  const summary = useMemo(() => {
    if (!activeMatches.length) return null;
    const sorted = [...activeMatches].sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at));
    const first = new Date(sorted[0].kickoff_at);
    const last = new Date(sorted[sorted.length - 1].kickoff_at);
    const sameMonth = first.getMonth() === last.getMonth();
    const fmt = (d: Date, withMonth: boolean) =>
      withMonth
        ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
        : d.toLocaleDateString(undefined, { day: "numeric" });
    const range =
      first.toDateString() === last.toDateString()
        ? fmt(first, true)
        : `${fmt(first, true)}–${fmt(last, !sameMonth)}`;
    const predicted = activeMatches.filter((m) => m.prediction).length;
    return { range, total: activeMatches.length, predicted };
  }, [activeMatches]);

  return (
    <div className="pb-12">
      <div
        ref={scrollRef}
        className="-mx-4 px-4 overflow-x-auto pb-2 mb-4"
      >
        <div className="flex gap-2 min-w-max">
          {matchdays.map((md) => {
            const active = md.id === activeMd;
            const complete = md.available > 0 && md.predicted >= md.available;
            const partial = md.predicted > 0 && !complete;
            return (
              <button
                key={md.id}
                ref={(el) => {
                  if (el) tabRefs.current.set(md.id, el);
                }}
                onClick={() => onActive(md.id)}
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold border transition ${
                  active
                    ? "bg-primary text-primary-foreground border-primary shadow-glow"
                    : "bg-card text-muted-foreground border-border hover:text-foreground"
                }`}
              >
                <span>{shortLabel(md.name)}</span>
                {complete ? (
                  <Check size={12} className={active ? "" : "text-success"} />
                ) : partial ? (
                  <span className={active ? "opacity-90" : "opacity-70"}>
                    ({md.predicted}/{md.available})
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {activeMdRow && summary && (
        <div className="mb-4 rounded-xl border border-border bg-card/50 px-4 py-3">
          <h2 className="font-display font-bold text-lg">{activeMdRow.name}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {summary.range} · {summary.total} match{summary.total === 1 ? "" : "es"} ·{" "}
            {summary.predicted} predicted
          </p>
        </div>
      )}

      <ByDateView matches={activeMatches} guest={guest} onGuestAction={onGuestAction} />
    </div>
  );
}
