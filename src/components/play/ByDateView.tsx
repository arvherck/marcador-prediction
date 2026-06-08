import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, History } from "lucide-react";
import { MatchCard } from "./MatchCard";
import { ComingUpStrip } from "./ComingUpStrip";
import { PastMatchesPanel } from "./PastMatchesPanel";
import {
  diffInDays,
  findNextPhaseBoundary,
  groupByDate,
  phaseLabel,
  smartDayLabel,
  todayKey,
  type DayBucket,
} from "@/lib/date-labels";
import type { MatchRow } from "@/lib/game.functions";
import { isImminentUnpredicted } from "@/lib/imminent";

const DEFAULT_WINDOW_DAYS = 3;
const SECOND_WINDOW_DAYS = 7;

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
  const [pastOpen, setPastOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // tick once a minute so countdowns/labels stay fresh
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // All buckets (entire tournament) for the strip
  const allDays = useMemo(() => groupByDate(matches), [matches]);

  // Future-or-today buckets only — what the main list draws from
  const futureDays = useMemo(
    () => allDays.filter((d) => diffInDays(d.date, new Date(now)) >= 0),
    [allDays, now],
  );

  // ------ Window state ------
  // null = use default 3-day window; number = explicit number of future buckets to show;
  // "all" = show everything remaining.
  const [windowState, setWindowState] = useState<"default" | "all" | number>(
    "default",
  );

  // pinnedKey: when the user taps a far-future pill we expand the window to
  // include it (without forcing "all").
  const [pinnedKey, setPinnedKey] = useState<string | null>(null);

  // Compute how many future day-buckets are visible
  const visibleCount = useMemo(() => {
    if (windowState === "all") return futureDays.length;

    let n: number;
    if (windowState === "default") {
      // Show buckets whose calendar-day is within today..today+DEFAULT_WINDOW_DAYS-1
      n = futureDays.filter(
        (d) => diffInDays(d.date, new Date(now)) < DEFAULT_WINDOW_DAYS,
      ).length;
      // Never empty: extend to first bucket
      if (n === 0 && futureDays.length > 0) n = 1;
    } else {
      n = windowState;
    }

    // Ensure pinned day is included
    if (pinnedKey) {
      const idx = futureDays.findIndex((d) => d.key === pinnedKey);
      if (idx >= 0) n = Math.max(n, idx + 1);
    }
    return Math.min(n, futureDays.length);
  }, [windowState, futureDays, now, pinnedKey]);

  const visibleDays = futureDays.slice(0, visibleCount);
  const hiddenDays = futureDays.slice(visibleCount);
  const activeKeys = useMemo(
    () => new Set(visibleDays.map((d) => d.key)),
    [visibleDays],
  );

  // ------ Progress + urgency ------
  const totalAvail = matches.filter((m) => m.teams_confirmed).length;
  const totalPred = matches.filter((m) => m.prediction).length;
  const lockingSoon = matches.filter((m) => {
    if (m.locked || m.prediction || !m.teams_confirmed) return false;
    const ms = new Date(m.kickoff_at).getTime() - now;
    return ms > 0 && ms <= 24 * 3_600_000;
  }).length;
  const hasPast = matches.some((m) => new Date(m.kickoff_at).getTime() < now);

  // booster per matchday
  const boostedByMd = useMemo(() => {
    const m = new Map<number, number>();
    for (const x of matches) {
      if (x.prediction?.booster) m.set(x.matchday_id, x.id);
    }
    return m;
  }, [matches]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["all-matches"] });
    qc.invalidateQueries({ queryKey: ["matchdays-progress"] });
    qc.invalidateQueries({ queryKey: ["play-overview"] });
  };

  // ------ Pill jump ------
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());
  const pendingScrollRef = useRef<string | null>(null);

  const handleJump = (key: string) => {
    // If past or already-loaded future, just scroll
    const day = allDays.find((d) => d.key === key);
    if (!day) return;
    if (diffInDays(day.date, new Date(now)) < 0) {
      setPastOpen(true);
      return;
    }
    if (!activeKeys.has(key)) {
      setPinnedKey(key);
      pendingScrollRef.current = key;
      return;
    }
    scrollToSection(key);
  };

  const scrollToSection = (key: string) => {
    const el = sectionRefs.current.get(key);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  useEffect(() => {
    if (pendingScrollRef.current && activeKeys.has(pendingScrollRef.current)) {
      const key = pendingScrollRef.current;
      pendingScrollRef.current = null;
      // wait a frame so the DOM has rendered new sections
      requestAnimationFrame(() => scrollToSection(key));
    }
  }, [activeKeys]);

  // ------ "Show more" CTA ------
  const showMore = useMemo(() => buildShowMoreCta(futureDays, visibleCount), [
    futureDays,
    visibleCount,
  ]);

  const handleShowMore = () => {
    if (!showMore) return;
    if (showMore.kind === "phase") {
      // expand to include the boundary day
      setWindowState(showMore.targetIndex + 1);
      return;
    }
    // week
    if (visibleCount < SECOND_WINDOW_DAYS) {
      setWindowState(SECOND_WINDOW_DAYS);
    } else {
      setWindowState("all");
    }
  };

  const noFuture = futureDays.length === 0;

  return (
    <div className="space-y-5 pb-12">
      {hasPast && (
        <button
          onClick={() => setPastOpen(true)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition"
        >
          <History size={12} /> View past matches &amp; results
        </button>
      )}

      <ProgressBlock
        predicted={totalPred}
        total={totalAvail}
        lockingSoon={lockingSoon}
      />

      <ComingUpStrip
        days={allDays}
        activeKeys={activeKeys}
        onJump={handleJump}
      />

      {noFuture && (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          The tournament is over. Tap “View past matches &amp; results” to revisit
          every fixture.
        </div>
      )}

      <div className="space-y-6">
        {visibleDays.map((g, idx) => (
          <DaySection
            key={g.key}
            bucket={g}
            isFirst={idx === 0}
            registerRef={(el) => {
              if (el) sectionRefs.current.set(g.key, el);
              else sectionRefs.current.delete(g.key);
            }}
            boostedByMd={boostedByMd}
            onInvalidate={invalidate}
            guest={guest}
            onGuestAction={onGuestAction}
            nowMs={now}
          />
        ))}
      </div>

      {visibleDays.length > 0 && showMore && (
        <ShowMoreStrip label={showMore.label} onClick={handleShowMore} />
      )}

      {visibleDays.length > 0 && !showMore && hiddenDays.length === 0 && (
        <div className="text-center text-xs text-muted-foreground pt-2">
          End of schedule.
        </div>
      )}

      <PastMatchesPanel
        open={pastOpen}
        onOpenChange={setPastOpen}
        matches={matches}
      />
    </div>
  );
}

// ------------------------------------------------------------------

function ProgressBlock({
  predicted,
  total,
  lockingSoon,
}: {
  predicted: number;
  total: number;
  lockingSoon: number;
}) {
  const pct = total > 0 ? Math.round((predicted / total) * 100) : 0;
  return (
    <div className="space-y-2">
      <div className="relative h-3 rounded-full bg-secondary overflow-hidden border border-border/60">
        <div
          className="absolute inset-y-0 left-0 bg-amber-gradient transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          <span className="font-bold text-foreground tabular-nums">
            {predicted}
          </span>{" "}
          / <span className="tabular-nums">{total}</span> predicted
        </span>
        {lockingSoon > 0 && (
          <span className="font-bold text-amber-glow">
            ⚠ {lockingSoon} match{lockingSoon === 1 ? "" : "es"} locking in the next 24h
          </span>
        )}
      </div>
    </div>
  );
}

function DaySection({
  bucket,
  isFirst,
  registerRef,
  boostedByMd,
  onInvalidate,
  guest,
  onGuestAction,
  nowMs,
}: {
  bucket: DayBucket;
  isFirst: boolean;
  registerRef: (el: HTMLElement | null) => void;
  boostedByMd: Map<number, number>;
  onInvalidate: () => void;
  guest?: boolean;
  onGuestAction?: () => void;
  nowMs: number;
}) {
  const allPredicted =
    bucket.available > 0 && bucket.predicted >= bucket.available;
  const nextKickoff = bucket.matches.find(
    (m) => new Date(m.kickoff_at).getTime() > nowMs,
  );
  return (
    <section
      ref={registerRef}
      className={`space-y-3 scroll-mt-4 ${isFirst ? "" : "animate-in fade-in slide-in-from-bottom-2 duration-300"}`}
    >
      <div className="sticky top-0 z-10 -mx-2 px-2 py-2 bg-background/85 backdrop-blur border-b border-border/50 flex items-center justify-between gap-3">
        <h2 className="font-display font-bold text-base md:text-lg truncate">
          {smartDayLabel(bucket.date, bucket.phase)}
        </h2>
        <span className="shrink-0 text-[11px] text-muted-foreground inline-flex items-center gap-1">
          {bucket.matches.length} match{bucket.matches.length === 1 ? "" : "es"} ·{" "}
          {bucket.predicted} predicted
          {allPredicted && <span className="text-success ml-1">✓</span>}
        </span>
      </div>
      <div className="space-y-3">
        {bucket.matches.map((m) => {
          const urgent = isImminentUnpredicted(m, nowMs);
          return (
            <div
              key={m.id}
              id={`match-${m.id}`}
              className={
                urgent
                  ? "rounded-2xl ring-2 ring-amber-glow/60 animate-pulse"
                  : ""
              }
            >
              <MatchCard
                match={m}
                boostedMatchIdInMatchday={boostedByMd.get(m.matchday_id) ?? null}
                onChanged={onInvalidate}
                guest={guest}
                onGuestAction={onGuestAction}
              />
            </div>
          );
        })}
      </div>
      {allPredicted && nextKickoff && (
        <p className="text-center text-[11px] text-muted-foreground">
          You're all caught up for this day ✓
        </p>
      )}
    </section>
  );
}

function ShowMoreStrip({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <div className="relative pt-6 -mt-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-t from-background via-background/80 to-transparent backdrop-blur-[2px]"
      />
      <div className="relative flex justify-center pt-2">
        <button
          onClick={onClick}
          className="inline-flex items-center gap-2 rounded-full bg-amber-gradient px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-glow hover:scale-[1.02] active:scale-[0.99] transition"
        >
          <span>{label}</span>
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Show-more CTA logic

type ShowMoreCta =
  | { kind: "week"; label: string }
  | { kind: "phase"; label: string; targetIndex: number };

function buildShowMoreCta(
  futureDays: DayBucket[],
  visibleCount: number,
): ShowMoreCta | null {
  if (visibleCount >= futureDays.length) return null;
  if (futureDays.length === 0) return null;

  const lastVisible = futureDays[visibleCount - 1];
  const phase = lastVisible?.phase ?? null;

  // Prefer a phase-boundary CTA if there's a different phase ahead
  const boundary = findNextPhaseBoundary(futureDays, visibleCount, phase);
  if (boundary !== null) {
    const boundaryDay = futureDays[boundary];
    const days = diffInDays(boundaryDay.date, new Date());
    const phName = phaseLabel(boundaryDay.phase) ?? "Next round";
    const when =
      days <= 0
        ? "today"
        : days === 1
        ? "tomorrow"
        : `in ${days} days`;
    return {
      kind: "phase",
      label: `🏆 ${phName} starts ${when}`,
      targetIndex: boundary,
    };
  }

  // Otherwise: more matches within the current phase / week
  const remainingMatches = futureDays
    .slice(visibleCount)
    .reduce((s, d) => s + d.matches.length, 0);
  return {
    kind: "week",
    label: `⚽ ${remainingMatches} more match${
      remainingMatches === 1 ? "" : "es"
    } ahead`,
  };
}

// Used by ByDateView for typing — re-export not needed.
export type { DayBucket };
