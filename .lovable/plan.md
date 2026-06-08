# Multi-user simulation tool

Adds a "Multi-user simulation" card to the existing Test Data subsection in 🧪 Tests. Creates N fake auth users with profiles, varied predictions, optional liga membership — all gated by admin role and fully cleanable.

## 1. Database migration

### New table `public.test_users`

```
id          uuid PK default gen_random_uuid()
user_id     uuid not null references auth.users on delete cascade unique
email       text not null
created_at  timestamptz not null default now()
```

Grants: `SELECT, DELETE` to `authenticated`; `ALL` to `service_role`. RLS on; single policy: admins (`has_role(auth.uid(),'admin')`) can `ALL`. Used only as a registry so we can find what to clean up.

### New SECURITY DEFINER RPCs

- `create_test_user_predictions(_caller_id uuid, _user_id uuid, _matchday_id int) returns int` — inserts a varied random scoreline (same weighted buckets as `_random_test_scoreline`) for every `teams_confirmed=true` match in `_matchday_id` for `_user_id`. Picks one of those predictions and sets `booster=true`. For ~20% of inserts where the match already has `home_score IS NOT NULL`, copies the real result to seed some scoring hits. Admin check on `_caller_id`. Logs to `api_sync_log`. (`validate_prediction` already bypasses for admin role, and these inserts run via the admin server fn that uses `supabaseAdmin` — RLS is bypassed.)

- `delete_test_users(_caller_id uuid) returns int` — for every `user_id` in `test_users`, deletes `predictions`, `matchday_scores`, `league_members`, `profiles`, `test_users` rows. Returns count. Auth user rows are deleted separately by the server fn via the admin API. Admin check + log.

- `add_test_users_to_league(_caller_id uuid, _league_id uuid) returns int` — bulk-inserts every `test_users.user_id` into `league_members` (on conflict do nothing). Admin check + log. Returns count added.

## 2. Server functions (`src/lib/admin-tests.functions.ts`)

All use `requireSupabaseAuth` + `assertAdmin(userId)` and the admin Supabase client for auth-user operations.

- `adminCreateTestUsersFn({ count })` — `count` clamped 1–10. For each `i` in 1..count:
  1. `supabaseAdmin.auth.admin.createUser({ email: 'testuser{i}@marcador-test.com', password: 'TestMarcador2026!', email_confirm: true })`. If the email already exists, look up the existing user instead and reuse.
  2. Insert/upsert `profiles` row with `display_name: 'Test User {i}'`, random `country`/`favourite_team` from the 8-team list.
  3. Insert into `test_users (user_id, email)` on conflict do nothing.
  4. Call `create_test_user_predictions(userId, current_md)` where `current_md` = smallest matchday id with `teams_confirmed=true` matches.
  Returns `{ users_created, predictions_added, current_md, leaderboard_preview }` where the preview reads `matchday_scores` for those users (may be empty if scoring not yet run).

- `adminListTestUsersFn()` — returns the rows from `test_users` joined with `profiles.display_name` and any existing `matchday_scores.total_points` for the current matchday, plus a count, for the status display.

- `adminDeleteTestUsersFn()` — calls `delete_test_users`, then iterates the returned user_ids and calls `supabaseAdmin.auth.admin.deleteUser(id)` to remove auth rows. Returns `{ removed }`.

- `adminListLeaguesForTestFn()` — lists `id,name` from `leagues` for the dropdown.

- `adminAddTestUsersToLeagueFn({ league_id })` — calls `add_test_users_to_league`.

## 3. UI — extend `TestDataPanel.tsx`

Add a 5th card titled "Multi-user simulation" (below Run full test cycle):

- Number input (1–10, default 5) and **Create test users & predictions** button.
- **Remove all test users** button (with inline confirm dialog).
- Status block: shows current count + table of `Test User N — country — points` when any exist. Refreshed via `useQuery(['admin-test-users'])`.
- After creation, shows `✓ N test users created · M predictions added` plus a mini leaderboard.
- **Add test users to a liga** section: visible only when test users exist — `<select>` of existing leagues + button → toast `✓ Added N test users to {liga name}`.

All actions invalidate queries on success and show toast errors on failure.

## 4. Safety / preserved

- Every created email matches `@marcador-test.com`; the cleanup uses the `test_users` registry plus an email-suffix filter as a fallback.
- Admin role enforced in both server fns (`assertAdmin`) and RPCs (`has_role`).
- No changes to scoring, `validate_prediction`, `score_matchday`, `score_match`, or any real user data.
- All actions logged to `api_sync_log` with `action='test_data'`.
