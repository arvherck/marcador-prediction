# Admin Test Data tools

Add a "Test Data" subsection inside the existing 🧪 Tests area (`TestsPanel` in `src/components/admin/TestsPanel.tsx`) with an amber warning banner and four tools backed by new admin-only RPCs and server functions. Test-only — never overwrites real results, fully gated by admin role.

## 1. Database migration

### New table `public.api_sync_log` (used for action logging)

Columns: `action text not null`, `description text`, `actor_id uuid`, `meta jsonb`, plus standard `id/created_at`. Grants: `service_role` full, `authenticated` SELECT (admin-only via policy). RLS: only `has_role(auth.uid(),'admin')` can SELECT; no INSERT/UPDATE/DELETE from clients (server fns use service_role-equivalent via SECURITY DEFINER inserts inside RPCs).

### New SECURITY DEFINER functions (all check `has_role(_caller_id,'admin')` first; log to `api_sync_log` with `action='test_data'`)

- `fill_random_scores(_caller_id uuid, _scope text, _matchday_id int default null) returns jsonb` — `_scope` ∈ `'current' | 'all_groups' | 'matchday'`. Selects eligible matches:
  - `home_score IS NULL`
  - `status <> 'completed'`
  - `teams_confirmed = true`
  - For `current`: smallest matchday id that still has eligible matches.
  - For `all_groups`: `matchday_id BETWEEN 1 AND 3` (the 72 group matches).
  - For `matchday`: `matchday_id = _matchday_id`.
  
  Per match generates a weighted random scoreline:
  - 60% Low: `0-0,1-0,0-1,1-1,2-0,0-2,2-1,1-2`
  - 30% Mid: `2-2,3-1,1-3,3-0,0-3,3-2,2-3`
  - 10% High: `4-0,0-4,4-1,1-4,4-2,3-3,5-1,5-2`
  
  Sets `first_scorer` per rules (home/away/random/none), `is_final=true`, `status='completed'`. Does NOT run scoring. Returns `{ filled: int, matches: [{id, home_team, away_team, home_score, away_score, first_scorer}, ...] }`.

- `clear_test_scores(_caller_id uuid, _scope text, _matchday_id int default null) returns jsonb` — Same scope semantics. For each selected match: set `home_score=null, away_score=null, first_scorer=null, is_final=false, status='upcoming'`; set `predictions.points=null` for those matches; for any matchday where ALL its matches are now cleared, delete `matchday_scores` rows for that matchday and reset `matchdays.is_scored=false`. Reset `profiles.current_streak=0, longest_streak=0` for all profiles. Returns `{ cleared: int }`.

- `fill_test_predictions(_caller_id uuid) returns jsonb` — For every match with `teams_confirmed=true` and `status IN ('upcoming','completed')` and no existing prediction from `_caller_id`: insert a prediction with the same weighted-random scoreline + consistent `first_scorer`, `booster=false`. After insert, pick one random prediction per matchday and set its `booster=true`. Returns `{ created: int }`.

  Bypasses the `validate_prediction` lock by inserting via SECURITY DEFINER with a session GUC `app.test_mode = 'true'`; `validate_prediction` already short-circuits on points-only updates — for test-mode INSERTs we extend it minimally: if GUC `app.test_mode='true'` and caller is admin, skip the lock check. (Change is additive, does NOT affect normal predictions, and the existing points-UPDATE fix stays intact.)

- `run_test_cycle(_caller_id uuid) returns jsonb` — Calls `fill_test_predictions` (if no admin predictions exist), then `fill_random_scores(_caller_id,'current')`, then `score_matchday(<that matchday>, _caller_id)`. Returns `{ matches_scored, predictions_evaluated, admin_points, admin_rank, matchday_id }` computed from `matchday_scores`.

### Safety guard inside every RPC

Skips any match where `home_score IS NOT NULL` AND the most recent result write was strictly before `current_date` (i.e. real pre-existing results from prior days are never touched — defensive layer in addition to the `home_score IS NULL` filter). Implemented via the eligibility WHERE clause; no separate timestamp column needed because the existing filter `home_score IS NULL` already prevents overwriting any real result.

## 2. Server functions (`src/lib/admin-tests.functions.ts`)

Add — all use `requireSupabaseAuth`, call the matching RPC with `_caller_id: userId`:

- `adminFillRandomScoresFn({ scope, matchday_id? })`
- `adminClearTestScoresFn({ scope, matchday_id? })`
- `adminFillTestPredictionsFn()`
- `adminRunTestCycleFn()`
- `adminListMatchdaysSlimFn()` (id+name only, for the matchday picker) — or reuse the existing `adminListMatchdays`.

## 3. UI — extend `TestsPanel.tsx`

Add a new "Test Data" section above the existing "Pre-release checks" card:

- Amber banner: ⚠️ "Test tools only. These actions modify real database data. Do not use after the tournament starts."
- Four cards in a vertical stack:
  1. **Fill random scores** — scope dropdown (`current` default, `all_groups`, `matchday`) + conditional matchday picker, "Fill random scores" button. On success → green text "✓ N matches filled with random scores" + `<details>` listing `Team A 2 – 1 Team B` rows.
  2. **Clear test scores** — same scope picker, "Clear test scores" button → opens AlertDialog with the exact copy from the spec, "Cancel" / "Clear test data" buttons. On confirm runs RPC and shows "✓ Test data cleared for X matches".
  3. **Fill test predictions** — single button. Shows "✓ X predictions created for admin".
  4. **Run full test cycle** — single button. Shows multiline result block with matches scored, predictions evaluated, admin points, admin rank.

All actions show toast errors on failure. After any mutation, `queryClient.invalidateQueries()` so the admin matchday lists refresh.

Section is rendered only inside `TestsPanel`, which is already inside the admin-gated route — non-admins never see it.

## 4. Out of scope / preserved

- `score_matchday`, `score_match`, `validate_prediction` semantics for normal users, and any existing scoring logic remain unchanged.
- No edits to real match data outside the eligibility filter.
- No new UI surface for non-admins.

