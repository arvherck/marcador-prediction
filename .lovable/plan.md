# Prediction lock tester

Add a new card to the admin Panel de Control → 🧪 Tests section that verifies prediction locking works correctly at both the UI level (checks computed locked state) and the server level (attempts inserts/updates and confirms the `validate_prediction` trigger rejects them with `Predictions are locked for this match`).

## Important constraint — admin bypass

The existing `validate_prediction` trigger short-circuits when `auth.uid()` is an admin (so the test data tools can seed predictions on completed matches). That means we cannot meaningfully test the lock as the admin user — every insert would silently bypass the trigger.

To exercise the real lock path, the server tests will:
- Use `supabaseAdmin` (service role) to attempt the insert/update. With service role, `auth.uid()` is `NULL`, so the admin-bypass clause is false and the trigger's lock check runs exactly as it does for a real signed-in non-admin user.
- Use a dedicated ephemeral test user as `user_id` (so we never touch real user data and so we satisfy the FK on `predictions.user_id`). The user is created at the start of the run via the Supabase auth admin API and deleted at the end.

This is the only practical way to exercise the trigger without running an OAuth/sign-in flow for a fake user. The card description will note: "Tests run as a temporary non-admin user against the same `validate_prediction` trigger real users hit."

## What to build

### 1. Server functions — `src/lib/admin-tests.functions.ts`

Add a new `// ---------- Prediction lock ----------` section with 7 server functions, all wrapped with `requireSupabaseAuth` + `assertAdmin(context.userId)` (same pattern as existing tests). Each returns a `TestResult`.

Shared helper (file-private):

```ts
async function withLockTestUser<T>(fn: (userId: string) => Promise<T>): Promise<T> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const email = `lock-${Date.now()}-${Math.random().toString(36).slice(2,8)}@marcador-locktest.com`;
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email, password: crypto.randomUUID(), email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  const uid = data.user.id;
  try {
    return await fn(uid);
  } finally {
    // CASCADE on auth.users removes predictions/profiles
    await supabaseAdmin.auth.admin.deleteUser(uid);
  }
}
```

Tests:

1. `testLockUiPastMatch` — pick `matches` where `kickoff_at < now()` (any status), confirm at least one exists; pass with message "UI would render locked for X past matches"; fail if none exist.
2. `testLockServerRejectsPastInsert` — find a past-kickoff match. `withLockTestUser` → attempt `supabaseAdmin.from("predictions").insert({user_id, match_id, home_goals:1, away_goals:1, first_scorer:'home'})`. Pass if error message contains `Predictions are locked`; fail if insert succeeds (rollback the row).
3. `testLockServerRejectsCompleted` — find a match with `status='completed'`, attempt same insert, expect lock error.
4. `testLockServerRejectsUpdate` — find any existing prediction on a past match (`predictions JOIN matches WHERE kickoff_at < now()`). Save the prediction's current `home_goals`, attempt `update({ home_goals: <other value> })`. Pass if rejected; if it accidentally succeeds, restore the original value and fail. If no such prediction exists, return `warn` with "no predictions on past matches to test".
5. `testLockServerAcceptsFuture` — find a match with `kickoff_at > now()` AND `teams_confirmed=true`. `withLockTestUser` → insert prediction → pass if accepted → delete the prediction. Fail with the actual error if rejected.
6. `testLockReopensWhenKickoffMovedFuture` — pick a completed match. Save `kickoff_at` + `status` + `is_final`. Update to `kickoff_at = now()+2h`, `status='upcoming'`, `is_final=false` (the trigger checks both `kickoff_at` and `status`). `withLockTestUser` → attempt insert → pass if accepted. In `finally`: delete the test prediction, restore original `kickoff_at`/`status`/`is_final`. Fail with the error if rejected.
7. `testLockRelocksWhenKickoffMovedPast` — pick an upcoming match with `kickoff_at > now()` and `teams_confirmed=true`. Save `kickoff_at`. Temporarily update to `now() - 1h`. `withLockTestUser` → attempt insert → pass if rejected with lock error. Always restore `kickoff_at` in `finally`.

All tests use `try/finally` to guarantee restoration of any temporarily modified match fields and cleanup of any test rows. Errors thrown by the trigger surface as `error.message` on the supabase response (`postgrest` returns 4xx with message); detection uses a case-insensitive `Predictions are locked` substring check.

### 2. UI — `src/components/admin/TestsPanel.tsx`

Add a new `LOCK_TESTS: TestDef[]` array and a `<PredictionLockPanel />` card, rendered between `<EdgeCasesPanel />` and the existing "Pre-release checks" card. Visual style identical to `EdgeCasesPanel` (same card chrome, "▶ Run all" button, individual ▶ Run per row, ✅/❌/⚠️/⏳ status icons, message line).

Header:
- Title: "Prediction locking"
- Subtitle: "Verifies predictions cannot be submitted or modified after kickoff. Runs as a temporary non-admin user against the real lock trigger."

Rows (in order):
1. "UI: past matches render locked"
2. "Server rejects insert on past match"
3. "Server rejects insert on completed match"
4. "Server rejects update after kickoff"
5. "Future match accepts prediction"
6. "Moving kickoff to future reopens predictions"
7. "Moving kickoff back to past re-locks"

Reuses existing `RunState`, `ICON`, and per-row run-state machinery — extract the small list-rendering block from `EdgeCasesPanel` if convenient, or duplicate (same as today's pattern).

## What will NOT change

- `validate_prediction` trigger (and its admin bypass for test data tools) — untouched.
- `score_match` / `score_matchday` / any scoring logic — untouched.
- `TestDataPanel`, edge-case tests, and the existing "Predictions lock at kickoff" check under Pre-release — all untouched.
- No new DB migration. No new tables. No changes to real user data.
- No emails sent — `supabaseAdmin.auth.admin.createUser` with `email_confirm: true` does not trigger signup emails.

## Cleanup guarantees

- Every test that mutates a match wraps the mutation in `try/finally` and restores the original `kickoff_at`/`status`/`is_final`.
- Every test that creates a test user uses `withLockTestUser`, which deletes the user in `finally` (CASCADE removes predictions/profile).
- "Future match accepts prediction" deletes the inserted prediction before the test user is removed.

## Files touched

- `src/lib/admin-tests.functions.ts` — add ~7 exported `createServerFn` test handlers + `withLockTestUser` helper.
- `src/components/admin/TestsPanel.tsx` — add `LOCK_TESTS` array, new imports, render `<PredictionLockPanel />` above Pre-release checks.
