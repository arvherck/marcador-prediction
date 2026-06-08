# Leaderboard Tiebreakers

Add a 4-level tiebreaker to all leaderboards, with the data computed during scoring and stored on `matchday_scores`.

## 1. Migration — `matchday_scores` columns

Add three integer columns, default 0, NOT NULL:

- `correct_results` — predictions where the 1X2 result was correct (regardless of exact score)
- `exact_scores` — predictions where both `home_goals` and `away_goals` match
- `correct_first_scorers` — predictions where `first_scorer` matches the actual first scorer

Backfill from existing `predictions` joined to `matches` for all scored matchdays, so existing rows have correct values before the UI starts using them.

## 2. Migration — scoring functions

Update `score_matchday` and `score_match` to:

- Accumulate `r_hit`, `e_hit`, `fs_hit` per `(user_id, matchday_id)` while scoring predictions (only for completed/final matches in that matchday).
- Replace the rank CTE so totals include the tiebreaker counts, and use a single multi-column ordering everywhere:

  ```sql
  ORDER BY total_points DESC,
           correct_results DESC,
           exact_scores DESC,
           correct_first_scorers DESC,
           p.display_name ASC
  ```

  with `DENSE_RANK() OVER (ORDER BY total_points DESC, correct_results DESC, exact_scores DESC, correct_first_scorers DESC)` (display_name not part of rank — it's just the final deterministic display sort).

- `INSERT ... ON CONFLICT (user_id, matchday_id) DO UPDATE` also sets the three tiebreaker columns.

## 3. Migration — RPCs

Update both RPCs to return + order by the tiebreakers:

- `matchday_leaderboard` — return `correct_results`, `exact_scores`, `correct_first_scorers` from `matchday_scores`; ORDER BY tiebreakers + `display_name`.
- `global_leaderboard` — aggregate per-user sums of the three counters from `matchday_scores` (so global tiebreakers reflect cumulative performance); add them to the returned columns; ORDER BY `total_points DESC, sum(correct_results) DESC, sum(exact_scores) DESC, sum(correct_first_scorers) DESC, display_name ASC`. Tournament winner points still added to `total_points` as today.

Both RPCs gain a `rank int` column computed with `DENSE_RANK()` using the same tiebreaker ordering, so the client doesn't need to recompute. `matchday_leaderboard` already returns `rank`; `global_leaderboard` will start returning it (currently the client uses array index — switch to RPC rank).

League filtering on both RPCs is unchanged (still uses `league_members`).

## 4. Server function types

Update return types in `src/lib/game.functions.ts` for `getLeaderboard`, `getLeaderboardPublic`, `getMatchdayLeaderboard`, `getMatchdayLeaderboardPublic` to include `rank`, `correct_results`, `exact_scores`, `correct_first_scorers`.

## 5. Leaderboard UI — `src/routes/_authenticated/leaderboard.tsx`

- Extend `OverallRow` / `MatchdayRow` with `rank`, `correct_results`, `exact_scores`, `correct_first_scorers`.
- `OverallTab` switches from `i + 1` to `row.rank`. Compute a `tied` flag by checking whether any neighbour shares the same `rank`.
- `Row` component:
  - When `tied`, prefix the rank with `=` (e.g. `= 3`). Trophy still shown for ranks 1–3; the `=` sits in the secondary rank slot used today for top-3.
  - When `tied`, wrap the row in a shadcn `Tooltip`/`title` showing: `Tied on points — ranked by correct results (X), exact scores (Y), correct first scorers (Z)`.
- Same logic for `MatchdayTab` and `LeaguesTab` (which already reuses `OverallTab`).

## 6. Out of scope

- No change to per-prediction `points` scoring math; only aggregation/order changes.
- No backend metric for streak tiebreakers.

## Files

- New migration: `matchday_scores` columns + backfill + updated `score_matchday`, `score_match`, `global_leaderboard`, `matchday_leaderboard`.
- Modified: `src/lib/game.functions.ts` (types only).
- Modified: `src/routes/_authenticated/leaderboard.tsx` (rank from RPC, `=` indicator, tooltip).
