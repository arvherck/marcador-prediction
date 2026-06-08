## Findings

- The admin button reaches `adminScoreMatchdayFn` and calls `score_matchday` with:
  - `_matchday_id: data.matchday_id`
  - `_caller_id: userId`
- The database function currently expects exactly those two parameters:
  - `score_matchday(_matchday_id integer, _caller_id uuid)`
- The latest server logs show the real failure:
  - `UPDATE requires a WHERE clause`
- The failing statement is inside `score_matchday`, in the streak update section:
  - `UPDATE public.profiles pf SET ...` has no `WHERE` clause.
- This is being blocked by the database safety rule that prevents broad updates without an explicit scope.
- The earlier kickoff-lock trigger fix is still present and correct:
  - `BEFORE INSERT OR UPDATE OF home_goals, away_goals, first_scorer, booster`
  - INSERT remains guarded, while scoring updates to `points` are not blocked.
- Matchday 1 data looks valid:
  - 24 matches
  - 24 final matches
  - 6 predictions from 1 user
  - `matchday_scores` currently has 0 rows for matchday 1

## Plan

1. Replace the broad profile streak update inside `public.score_matchday` with scoped updates that include explicit `WHERE` clauses.

2. Preserve the existing scoring behavior:
   - Users who made predictions for the matchday get their streak incremented.
   - Users who did not predict that matchday have their current streak reset when scoring runs for the first time.
   - Re-running scoring after the matchday is already scored recalculates points and matchday totals without incrementing streaks again.

3. Keep all existing admin checks and score calculation logic unchanged:
   - `_caller_id` still gates admin access through `has_role`.
   - Prediction points still update after kickoff.
   - `matchday_scores` still upserts totals and ranks.

4. Validate after the migration:
   - Run `score_matchday(1, <admin user id>)` against the backend.
   - Confirm predictions for matchday 1 receive non-null `points`.
   - Confirm `matchday_scores` gets a row for matchday 1.
   - Confirm the kickoff lock trigger remains scoped so inserts after kickoff are still rejected.