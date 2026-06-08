## 1. Delete the orphaned `__probe` data now

Run a single SQL cleanup (via the data-insert tool) that targets only rows whose matchday name starts with `__`:

```sql
DELETE FROM predictions
 WHERE match_id IN (
   SELECT id FROM matches WHERE matchday_id IN (
     SELECT id FROM matchdays WHERE name LIKE '\_\_%' ESCAPE '\'
   )
 );
DELETE FROM matches
 WHERE matchday_id IN (
   SELECT id FROM matchdays WHERE name LIKE '\_\_%' ESCAPE '\'
 );
DELETE FROM matchday_scores
 WHERE matchday_id IN (
   SELECT id FROM matchdays WHERE name LIKE '\_\_%' ESCAPE '\'
 );
DELETE FROM matchdays WHERE name LIKE '\_\_%' ESCAPE '\';
```

Currently this only removes the single `__probe` row (id 13) plus any of its (zero) children. No production data is touched.

## 2. Harden the test suite cleanup

`src/lib/admin-tests.functions.ts` already wraps inserts in try/finally (`withTempScenario`, `testKickoffLock`), but `__probe` shows the safety net is needed. Changes:

- Add a `purgeTestArtifacts()` helper that deletes every `matchdays` row whose `name LIKE '\_\_%'` plus cascading `matches`, `predictions`, `matchday_scores`.
- Call `purgeTestArtifacts()` at the START of `withTempScenario` and `testKickoffLock` (defensive sweep before seeding) and again in their `finally` blocks (defence in depth in case the existing per-id cleanup misses anything, e.g. an id-mismatch or partial failure).
- Keep all existing try/finally logic.

## 3. Safety net: hide `__`-prefixed matchdays everywhere

Add a `.not("name", "like", "\\_\\_%")` filter to every query that lists matchdays for a UI or for a user-visible count. Files/locations:

- `src/lib/game.functions.ts`
  - `getPlayMatchdayStatus` (≈ line 146) — user Play view.
  - `adminListMatchdays` (≈ line 641) — admin Results & scoring panel.
  - `getFixtureStatsPublic` (≈ line 1123) — public matchday count.
- `src/lib/admin-tests.functions.ts`
  - `testMatchdays` (≈ line 56) — exclude `__` rows so the "expected 9" check stays correct even if a test is mid-flight.

No changes to scoring logic, RPCs (`score_matchday`, `matchday_leaderboard`, `my_leagues`), or any matchday whose name does not start with `__`.

## Technical notes

- PostgREST `.not("name", "like", "\\_\\_%")` escapes the literal underscores so we only match the double-underscore prefix, not any single-underscore name.
- The SQL cleanup uses the data-insert tool (DELETE on existing tables, no schema change → no migration needed).
- No new RLS, no new tables, no edge-function changes.
