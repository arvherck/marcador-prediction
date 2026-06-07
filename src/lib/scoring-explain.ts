import type { MatchRow } from "./game.functions";

export type PointsLine = { label: string; pts: number };

export function explainPoints(match: MatchRow): {
  lines: PointsLine[];
  total: number;
  boosted: boolean;
} {
  const p = match.prediction;
  const hs = match.home_score;
  const as_ = match.away_score;
  if (!p || hs === null || as_ === null || !match.is_final) {
    return { lines: [], total: 0, boosted: false };
  }
  const lines: PointsLine[] = [];
  const sign = (n: number) => (n > 0 ? 1 : n < 0 ? -1 : 0);

  const predDiff = p.home_goals - p.away_goals;
  const actDiff = hs - as_;

  if ((p.home_goals === hs && p.away_goals === as_) || sign(predDiff) === sign(actDiff)) {
    lines.push({ label: "Result", pts: 3 });
  }
  if (p.home_goals === hs) lines.push({ label: "Home goals", pts: 2 });
  if (p.away_goals === as_) lines.push({ label: "Away goals", pts: 2 });
  if (predDiff === actDiff) lines.push({ label: "Goal diff", pts: 3 });
  if (p.first_scorer && p.first_scorer === match.first_scorer)
    lines.push({ label: "First scorer", pts: 3 });

  const subtotal = lines.reduce((s, l) => s + l.pts, 0);
  const total = p.points ?? (p.booster ? subtotal * 2 : subtotal);

  return { lines, total, boosted: p.booster };
}
