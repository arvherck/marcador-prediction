import type { MatchRow } from "@/lib/game.functions";

export const MS_2H = 2 * 60 * 60 * 1000;

/** A match the user must predict urgently: confirmed, still upcoming, kicks off in <= 2h, no prediction. */
export function isImminentUnpredicted(m: MatchRow, nowMs: number): boolean {
  if (!m.teams_confirmed) return false;
  if (m.status !== "upcoming") return false;
  if (m.prediction) return false;
  const ko = new Date(m.kickoff_at).getTime();
  const delta = ko - nowMs;
  return delta > 0 && delta <= MS_2H;
}

/** Format remaining ms as "1h 23m" / "23 minutes" / "4 minutes" / "< 1 minute". */
export function formatCountdown(msRemaining: number): string {
  if (msRemaining <= 0) return "< 1 minute";
  const totalMin = Math.floor(msRemaining / 60_000);
  if (totalMin < 1) return "< 1 minute";
  if (totalMin < 60) return `${totalMin} minute${totalMin === 1 ? "" : "s"}`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m}m`;
}
