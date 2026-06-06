// Pure helpers for the By Date view. No React.
import type { MatchRow } from "@/lib/game.functions";

export type DayBucket = {
  key: string; // YYYY-MM-DD in local time
  date: Date; // midnight local time
  matches: MatchRow[];
  predicted: number;
  available: number; // teams_confirmed
  phase: string | null; // dominant phase label for the day
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function localDayKey(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function todayKey(): string {
  return localDayKey(new Date());
}

export function diffInDays(a: Date, b: Date): number {
  const ms = startOfLocalDay(a).getTime() - startOfLocalDay(b).getTime();
  return Math.round(ms / 86_400_000);
}

export function groupByDate(matches: MatchRow[]): DayBucket[] {
  const map = new Map<string, DayBucket>();
  for (const m of matches) {
    const d = new Date(m.kickoff_at);
    const key = localDayKey(d);
    const existing = map.get(key);
    if (existing) {
      existing.matches.push(m);
    } else {
      map.set(key, {
        key,
        date: startOfLocalDay(d),
        matches: [m],
        predicted: 0,
        available: 0,
        phase: null,
      });
    }
  }
  const buckets = Array.from(map.values());
  for (const b of buckets) {
    b.matches.sort((x, y) => x.kickoff_at.localeCompare(y.kickoff_at));
    b.predicted = b.matches.filter((m) => m.prediction).length;
    b.available = b.matches.filter((m) => m.teams_confirmed).length;
    // dominant phase = phase of the first match that has one
    b.phase = b.matches.find((m) => m.phase)?.phase ?? null;
  }
  buckets.sort((a, b) => a.date.getTime() - b.date.getTime());
  return buckets;
}

const PHASE_LABEL: Record<string, string> = {
  group: "Group Stage",
  r32: "Round of 32",
  round_of_32: "Round of 32",
  "round-of-32": "Round of 32",
  r16: "Round of 16",
  round_of_16: "Round of 16",
  "round-of-16": "Round of 16",
  qf: "Quarterfinals",
  quarterfinal: "Quarterfinals",
  quarterfinals: "Quarterfinals",
  sf: "Semifinals",
  semifinal: "Semifinals",
  semifinals: "Semifinals",
  third: "Third-place Playoff",
  third_place: "Third-place Playoff",
  "3rd": "Third-place Playoff",
  final: "Final",
};

export function phaseLabel(phase: string | null): string | null {
  if (!phase) return null;
  const k = phase.toLowerCase().replace(/\s+/g, "_");
  return PHASE_LABEL[k] ?? PHASE_LABEL[phase.toLowerCase()] ?? phase;
}

function weekdayLong(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: "long" });
}
function weekdayShort(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: "short" });
}
function dayMonth(d: Date) {
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long" });
}
function dayMonthShort(d: Date) {
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

// "Today · Thursday 11 June", "Round of 32 · Sunday 28 June", etc.
export function smartDayLabel(date: Date, phase: string | null): string {
  const now = new Date();
  const delta = diffInDays(date, now);
  const ph = phaseLabel(phase);
  const isKnockout = ph && ph !== "Group Stage";

  // Knockout days override the leading label
  if (isKnockout) {
    return `${ph} · ${weekdayLong(date)} ${dayMonth(date)}`;
  }

  if (delta === 0) return `Today · ${weekdayLong(date)} ${dayMonth(date)}`;
  if (delta === 1) return `Tomorrow · ${weekdayLong(date)} ${dayMonth(date)}`;

  // same ISO week (Mon-Sun) as today, within next 6 days
  if (delta > 1 && delta <= 6) {
    return `This ${weekdayLong(date)} · ${dayMonth(date)}`;
  }
  if (delta > 6 && delta <= 13) {
    return `Next Week · ${weekdayLong(date)} ${dayMonth(date)}`;
  }
  return `${weekdayLong(date)} ${dayMonth(date)}`;
}

// Short pill label e.g. "Today", "Tomorrow", "Sat 13 Jun"
export function pillDayLabel(date: Date): string {
  const delta = diffInDays(date, new Date());
  if (delta === 0) return "Today";
  if (delta === 1) return "Tomorrow";
  return `${weekdayShort(date)} ${dayMonthShort(date)}`;
}

// Find the first day index whose phase differs from `fromPhase` and lies at or after fromIndex.
export function findNextPhaseBoundary(
  days: DayBucket[],
  fromIndex: number,
  fromPhase: string | null,
): number | null {
  for (let i = fromIndex; i < days.length; i++) {
    if ((days[i].phase ?? null) !== (fromPhase ?? null)) return i;
  }
  return null;
}
