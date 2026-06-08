import type { MatchRow } from "./game.functions";

export type PointsLine = { label: string; pts: number };

export function explainPoints(match: MatchRow): {
  lines: PointsLine[];
  total: number;
  boosted: boolean;
  multiplier: number;
} {
  const p = match.prediction;
  const hs = match.home_score;
  const as_ = match.away_score;
  const multiplier = match.points_multiplier ?? 1;
  if (!p || hs === null || as_ === null || !match.is_final) {
    return { lines: [], total: 0, boosted: false, multiplier };
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

  const baseSubtotal = lines.reduce((s, l) => s + l.pts, 0);
  const multiplied = baseSubtotal * multiplier;
  const boosted = p.booster ? multiplied * 2 : multiplied;
  // Underdog +5 flat — included in stored p.points only when it fired
  const total = p.points ?? boosted;

  if (multiplier > 1) {
    lines.push({ label: `Round ×${multiplier}`, pts: multiplied - baseSubtotal });
  }

  return { lines, total, boosted: p.booster, multiplier };
}
