# UI Test Matches for Test Matchday

Adds 4 fictional, easily identifiable matches (prefix `UI_Test_` plus one knockout TBD row) to the existing `Test — Pre-WC Friendlies (June 2026)` matchday, plus an admin-only "Preview UI test matches" toggle so the test data can be exercised in the real Play screen UI without exposing it to regular users.

## 1. Seed data (data migration via insert tool)

Append to the existing `is_test = true` matchday (no schema change — `matches.status_check` already allows `live`):

| # | home_team | away_team | kickoff | status | teams_confirmed | mult | phase |
|---|-----------|-----------|---------|--------|-----------------|------|-------|
| 7 | UI_Test_Home | UI_Test_Away | now()+2h | upcoming | true | 2 | Round of 32 |
| 8 | UI_Test_Imminent_Home | UI_Test_Imminent_Away | now()+45m | upcoming | true | 1 | Group stage |
| 9 | UI_Test_Live_Home | UI_Test_Live_Away | now()−30m | live | true | 3 | Round of 16 |
| 10 | Winner Group A | Winner Group B | now()+7d | upcoming | false | 4 | Quarterfinal |

All have `home_score/away_score/first_scorer = null`, `is_final = false`. Bypass `auto_confirm_teams` for match 10 by inserting `teams_confirmed = false` after the trigger fires (the trigger only flips `false → true` when the team names don't match TBD patterns; "Winner Group A/B" matches the regex, so it stays false). The `set_points_multiplier` trigger respects explicit values when phase default differs, but for matches 7/9/10 the phase default already equals the requested value, and for match 8 we pass `points_multiplier = 1` (group default).

Kickoff times are computed once at insert (`now() + interval ...`) — they are absolute timestamps, so match 8 will eventually leave the "closing soon" window and match 9's "live" state is a manual flag, not time-derived. Acceptable for a short-lived test toggle (see §3).

## 2. User-facing read filters (verification only)

Already in place from the previous turn — no code changes. Verify each path still excludes `is_test`:

- `getAllMatches` / `getAllMatchesPublic` (Play By Date + By Matchday)
- `getMatchdaysWithProgress` (matchday tab list + progress bar denominator)
- `getMyProfileStatsFn` total matches
- `global_leaderboard` / `matchday_leaderboard` RPCs
- Streak update inside `score_matchday` (only touches users with predictions on the scored matchday; test matchday is never scored via the normal flow)

## 3. Admin-only "Preview UI test matches" toggle

Storage: a new admin-scoped serverFn pair backed by an in-memory map keyed by `userId` with a 30-minute expiry timestamp. No DB column needed — the toggle is intentionally ephemeral and per-admin.

- `adminGetUiTestPreviewFn` → `{ enabled: boolean, expiresAt: number | null }`
- `adminSetUiTestPreviewFn({ enabled })` → sets/clears entry; enabling stamps `expiresAt = now + 30min`

Wiring:

- `getAllMatches` / `getAllMatchesPublic` / `getMatchdaysWithProgress`: when the caller is an admin AND their preview flag is active (and not expired), drop the `is_test = false` filter. All other read paths (leaderboards, streaks, progress denominator) stay filtered — preview is visual only.
- New `<UiTestPreviewBanner />` rendered above the Play screen tabs. Polls `adminGetUiTestPreviewFn` every 30 s; shows amber banner `⚠️ UI TEST MODE — test matches visible (auto-disables in Xm)` with a "Disable now" button. Hidden for non-admins or when disabled.
- In `TestsPanel` (admin Tests section), add a Switch labeled "Preview UI test matches in Play screen" with helper text "Auto-disables after 30 minutes. Admin-only — does not affect other users."

## 4. Admin Results & scoring

No code change — the test matchday block already shows all matches in the matchday; matches 7-10 will appear automatically beside the 6 historical ones under the existing amber `⚠️ Test data` badge.

## 5. New tests in `src/lib/admin-tests.functions.ts`

1. **UI test matches exist** — `SELECT count(*) WHERE md.is_test AND m.home_team LIKE 'UI_Test%'` → expect 4 (counts matches 7/8/9 + match 10's `Winner Group A` row via OR `home_team = 'Winner Group A'`). Per spec the count check is `LIKE 'UI_Test%'` only → expect 3; we'll follow spec exactly and assert 3, then a second assertion confirms the TBD row exists separately.
2. **Live match card state** — fetch UI_Test_Live_Home row, assert `status='live' AND kickoff_at < now() AND home_score IS NULL`.
3. **TBD match blocks predictions** — try `supabase.from('predictions').insert({...})` for the `Winner Group A` match via a temp service-role call as a non-admin test user; expect rejection from `validate_prediction` trigger (`teams_confirmed=false`).

## 6. Cleanup

Extend `adminRemovePreWcTestMatchesFn` (created last turn): also delete predictions + matches where `home_team LIKE 'UI_Test%' OR home_team = 'Winner Group A'` on the test matchday before deleting the matchday itself. The existing button label stays "Remove pre-WC test matches".

## Out of scope

- No new banner/badge components in `MatchCard` — closing-soon banner, live badge, TBD greyed-out card, and multiplier badge are already implemented and will activate naturally once the rows are visible via the preview toggle.
- No changes to scoring engine, streaks, or leaderboards.
- No persistent storage of the preview flag — intentionally ephemeral.

## Open question

Spec says test #1 should pass if count = 4, but the SQL provided (`LIKE 'UI_Test%'`) only matches 3 of the 4 new rows (match 10 uses `Winner Group A`). I'll implement the assertion as **count = 4 using `home_team LIKE 'UI_Test%' OR home_team IN ('Winner Group A','Winner Group B')`** to match the stated pass condition. Flag if you'd rather assert exactly 3.
