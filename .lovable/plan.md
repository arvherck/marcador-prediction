## Goal

Seed a single hidden "Test — Pre-WC Friendlies (June 2026)" matchday with 6 real, verifiable June 2026 friendly results so we can sanity-check scoring against known outcomes, without polluting user-facing views, leaderboards or streaks. Add badge + cleanup tool in admin, plus targeted tests.

## 1. Schema migration

- `ALTER TABLE public.matchdays ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;`
- Insert the test matchday `"Test — Pre-WC Friendlies (June 2026)"`, `starts_at = 2026-06-04 19:00 UTC`, `is_scored = false`, `is_test = true`.
- Insert the 6 matches exactly as specified (teams, kickoff, scores, first_scorer, stadium, city), with `status='completed'`, `is_final=true`, `teams_confirmed=true`, `points_multiplier=1`, `phase='Friendly'`, linked to the new matchday id.

The match insert disables the `set_points_multiplier` and `recalculate_group_standings` triggers' interesting paths automatically because `phase='Friendly'` keeps `points_multiplier=1` and `group_letter` stays NULL.

## 2. Filter `is_test` matchdays from user-facing data

All edits in `src/lib/game.functions.ts`. Strategy: add an inner-join filter on `matchdays` wherever matches are read for players, and an `.eq("is_test", false)` on every direct `matchdays` list.

- `getAllMatches` and `getAllMatchesPublic` — change `.from("matches").select("*")` to `.select("*, matchdays!inner(is_test)")` + `.eq("matchdays.is_test", false)`; strip the joined field before returning.
- `getMatchdaysWithProgress` — keep `not name like __%`, also add `.eq("is_test", false)`.
- `getMyProfileStatsFn` (total matches count) — join matchdays and exclude `is_test=true`.
- `getMyMatchdayScoresFn` — embedded select on `matchdays(name, starts_at, is_test)`, filter out rows where `matchday.is_test=true` after fetch.

Two RPCs need updating (single migration):

- `global_leaderboard`: in the `predictions pr JOIN matches mm` aggregate, also `JOIN matchdays md ON md.id = mm.matchday_id` and `WHERE md.is_test = false`; same when summing `matchday_scores` columns and selecting `last_md_points` (already filters `is_scored=true`, which excludes the new matchday — but we still need to exclude its `correct_results/exact_scores/correct_first_scorers` tallies, so the inner joins are required).
- `matchday_leaderboard`: in the default `_matchday_id IS NULL` branch, restrict to `is_test=false` when selecting "latest scored matchday".

Streaks live inside `score_matchday` keyed by the matchday being scored; since the test matchday is never scored via the admin scoring action (it's already `is_final=true` but not scored, and we will not run `score_matchday` on it from the UI), streaks are unaffected. No code change needed for streaks.

## 3. Admin Results & scoring — visible with badge

`src/lib/game.functions.ts` → `adminListMatchdays`: keep returning the test matchday (do NOT filter `is_test`). Add `is_test` to the existing `.select("*")` (already covered by `*`).

`src/routes/_authenticated/admin.tsx` (Results & scoring section): when `md.is_test === true`, render the matchday card with:
- amber border (`border-amber-glow/60`)
- a warning row above the title: `⚠️ Test data — not a real World Cup matchday` in amber text.

No other behavior change — existing scoring controls remain available so we can manually score the test matchday for verification.

## 4. Admin Test Data panel — cleanup button

`src/components/admin/TestDataPanel.tsx` and `src/lib/admin-tests.functions.ts`:

- New server function `adminRemovePreWcTestMatchesFn` (POST, admin-only). Uses `supabaseAdmin` to:
  1. Find the matchday id by `name = 'Test — Pre-WC Friendlies (June 2026)' AND is_test = true` (maybeSingle).
  2. `DELETE FROM predictions WHERE match_id IN (...)`.
  3. `DELETE FROM matchday_scores WHERE matchday_id = $1`.
  4. `DELETE FROM matches WHERE matchday_id = $1` (6 expected).
  5. `DELETE FROM matchdays WHERE id = $1`.
  6. Return `{ removed: true, matches: 6 }` (or `removed: false` if not present).
- Add a new section in `TestDataPanel` titled "Pre-WC test matches" with a button `Remove pre-WC test matches`. On success: toast `✓ Pre-WC test matches removed`. On no-op: toast `No pre-WC test matches found`.

## 5. Tests in the 🧪 Tests panel

Add new category `🧪 Pre-WC Test Matches` (or place under 📊 Data Integrity). Four tests, all in `src/lib/admin-tests.functions.ts` and registered in `src/components/admin/TestsPanel.tsx`:

1. `testPreWcFriendliesExist` — counts matches via `from("matches").select("id", {count:"exact",head:true}).eq("matchdays.is_test", true)` (with inner join) on the named matchday. Pass when count = 6.
2. `testPreWcBelgiumTunisia` — reads `home_score, away_score, first_scorer` for `home_team='Belgium' AND away_team='Tunisia'` on the test matchday. Pass when `5,0,'home'`.
3. `testPreWcScoringBelgium13` — creates an ephemeral test user via `supabaseAdmin.auth.admin.createUser` (re-uses the `withLockTestUser` helper pattern), inserts a perfect 5-0/home prediction on Belgium-Tunisia, calls `score_match` via RPC, reads `predictions.points`, asserts `= 13`, then cleans up (delete prediction + delete auth user). This avoids polluting real users' totals.
4. `testPreWcExcludedFromLeaderboard` — calls `global_leaderboard()` RPC and verifies no row's `total_points` includes credit from the test matchday: simplest check is that the sum of `matchday_scores` for the test matchday is 0 (i.e. it isn't scored) AND that the RPC's join excludes is_test (sanity: insert a fake `matchday_scores` row for an admin user on the test matchday with `total_points=999`, recompute leaderboard via RPC, ensure admin's total didn't jump by 999, then delete the fake row). Pass when delta = 0.

## 6. Out of scope

- No changes to the existing scoring engine.
- No new user-facing UI for the test matchday (it stays hidden).
- No edits to streak logic (test matchday is never scored).

## Verification

1. Run the migration; admin Results & scoring shows the new amber-badged matchday with the 6 matches at the expected scores.
2. Play screen, By Date, By Matchday, leaderboard, streak counters, profile stats — nothing about the test matchday appears.
3. Run the 4 new tests → all pass.
4. Click "Remove pre-WC test matches" → toast confirms removal; tests #1–#4 then fail with `Pre-WC test matches not found` (expected).