# Update Pre-release test suite

Bring `🧪 Tests` in sync with the round-multiplier scoring, tournament-winner flow, standings trigger, ligas, and prediction-lock features. Adds ~25 new tests, updates 4 existing ones, and regroups the summary by feature category.

## Phase / trigger names in the live DB (used by every new test)

- Phases: `Group Stage`, `Round of 32`, `Round of 16`, `Quarterfinal`, `Third Place`, `Semifinal`, `Final` (single, exact casing).
- Standings trigger name: `trg_recalculate_group_standings` (on `public.matches`).
- Validate-prediction trigger name: `validate_prediction_trigger`, scoped `BEFORE INSERT OR UPDATE OF home_goals, away_goals, first_scorer, booster`.
- Test data convention: rows seeded by tests use matchday name prefix `__test_` and are purged via the existing `purgeTestArtifacts()` helper.

## 1. Update 4 existing tests (`src/lib/admin-tests.functions.ts`)

| Test fn | Change |
|---|---|
| `testScoringExact` | No code change — already uses `phase: "Group Stage"` (×1) and expects 13. Add inline comment "Group Stage — multiplier ×1". |
| `testScoringCorrectResult` | No expected-points change (still 6); add Group Stage comment. |
| `testBoosterDoubles` | Reword to use a Group Stage match with explicit expectation 13×1×2 = 26 (currently uses 1–0 / 5 base pts; rewrite prediction to 2–1 home so base = 13 and assert boosted = 26). Update message accordingly. |
| `testMatchCount` | Update label to "All matches imported" and filter out test rows: `from('matches').select(..., {count}).neq('home_team','__test')`. Expected stays 104. |
| `testStandingsPopulated` | Keep 48 expected. Add a secondary assertion: exactly 12 groups (A–L) and every group has 4 rows; status `fail` if any group is off. |

## 2. New test functions (added to `src/lib/admin-tests.functions.ts`)

All exported as `createServerFn` + `requireSupabaseAuth`, returning `TestResult`. Use `supabaseAdmin` for SQL; use the existing `withTempScenario` / `seedEdgeMatch` / `purgeTestArtifacts` helpers where applicable. Helper for raw SQL: add a small `runSql(sql)` wrapper that uses the existing `pg_proc` / `pg_trigger` queries via `supabaseAdmin.rpc` style — implemented with `supabaseAdmin.from('pg_proc')`-style queries is not possible, so use a tiny `_exec_sql` admin-only RPC OR query through `supabaseAdmin` against information_schema-equivalents via existing functions. Implementation detail: each test uses `supabaseAdmin.rpc("...")` where possible, and falls back to direct table queries (`pg_trigger`, `pg_proc`) by adding a single new SECURITY DEFINER read-only function `admin_diag(query_kind text, args jsonb) → jsonb` (migration) that returns the small JSON the tests need (trigger existence, function body presence). This keeps tests in the app without granting broad SQL execution.

### Round multiplier (7 tests)
- `testMultiplierGroupStage` — every `phase='Group Stage'` row has `points_multiplier = 1`.
- `testMultiplierR32` — all `Round of 32` rows = 2.
- `testMultiplierR16` — all `Round of 16` rows = 3.
- `testMultiplierQF` — all `phase IN ('Quarterfinal','Third Place')` rows = 4.
- `testMultiplierSemi` — `Semifinal` rows = 5.
- `testMultiplierFinal` — `Final` rows = 6.
- `testMultiplierAppliesR32Scoring` — seed a `__test_` matchday + a match with `phase='Round of 32'` (trigger sets multiplier=2 automatically), seed prediction 2-1 home/home, finalize 2-1 home/home, score, expect 26.

### Booster + multiplier (2 tests)
- `testBoosterWithGroupMultiplier` — same as updated `testBoosterDoubles` but exported separately; expects 13×1×2 = 26.
- `testBoosterWithSemifinal` — seed `phase='Semifinal'`, prediction with booster, exact 1-0 home/home, expects 13×5×2 = 130.

### Underdog flat (1 test)
- `testUnderdogFlatR32` — seed R32 test match + 11 users (use existing `withEdgeUsers` helper pattern); user A predicts 3-2, 10 others predict varied non-3-2 scores; actual 3-2; expect user A points = 26 + 5 = 31.

### Tournament winner (4 tests)
- `testTournamentPredictionsTableExists` — query `information_schema.columns` (via `admin_diag` RPC) and assert columns `{id,user_id,predicted_winner,created_at,points_awarded}` all present in `tournament_predictions`.
- `testTournamentSettingsTableExists` — assert `{id, actual_winner, predictions_locked}` present in `tournament_settings`.
- `testTournamentWinnerAwards50` — upsert admin's `tournament_predictions` row with `predicted_winner='Brazil'`, set `tournament_settings.actual_winner='Brazil'`, call `adminSetTournamentWinnerFn` server-side equivalent (or its underlying loop) directly, read back `points_awarded`, expect 50. `try/finally` restores prior values (capture before-state, write back; also `delete` the inserted pred if none existed).
- `testTournamentWinnerWrongAwards0` — same harness, `predicted_winner='France'`, `actual_winner='Brazil'`, expect 0 (not null).

### Standings trigger (1 new test; existing `testStandingsTrigger` kept)
- `testStandingsTriggerExists` — uses `admin_diag('trigger_exists','trg_recalculate_group_standings')`, expect true.
- (The existing `testStandingsTrigger` already covers "updates on result entry" via restore — keep as-is.)

### Liga (4 tests)
- `testLigaInviteCodeFormat` — query `leagues` and assert every `invite_code` matches `/^MRC-[A-Z0-9]{4}$/`.
- `testLigaJoinValidCode` — create a `__test` liga (`name='__test_liga'`, generated code), call `joinLeagueFn({invite_code})` via the existing function call path, assert membership row exists, cleanup.
- `testLigaJoinInvalidCode` — call `joinLeagueFn({invite_code: 'MRC-ZZZZ'})`, catch and assert the error message contains "not found" (or equivalent). Pass if rejected gracefully.
- `testLigaJoinTwice` — join `__test` liga once, then again; expect second call to either succeed idempotently (no duplicate row) or return a clean "already a member" message. Cleanup.

### Prediction lock (2 new; existing kept)
- `testCompletedMatchRejectsPrediction` — find a real match with `status='completed'` (if none, skip with `warn`); attempt anon-style insert via `supabaseAdmin` while temporarily flipping `auth.uid()` is not possible — instead, use the existing pattern in `testLockServerRejectsCompleted` (already covers this case). Add an alias test that explicitly states the lock works on completed matches, reusing that helper.
- `testValidatePredictionTriggerScoped` — `admin_diag` returns `tgname, tgtype, definition`; assert `validate_prediction_trigger` exists, enabled, and definition string contains `OF home_goals, away_goals, first_scorer, booster`.

### Scoring function signatures (3 tests)
- `testScoreMatchdayUsesCallerId` — `admin_diag('proc_body','score_matchday')`; assert body contains `_caller_id` and does NOT contain `auth.uid()`.
- `testScoreMatchExists` — `admin_diag('proc_exists','score_match')` returns 1.
- `testScoreMatchUsesCallerId` — same check for `score_match`.

### Data integrity (4 tests)
- `testNoNullMultiplier` — `count from matches where points_multiplier is null` = 0.
- `testNoTestMatches` — `count from matches where home_team='__test'` = 0.
- `testNoTestUsers` — `count from profiles where display_name like 'Test User %'` = 0.
- `testKnockoutPlaceholdersSet` — for `phase in (R32,R16,QF,Semifinal,Final)` and `teams_confirmed=false`, both `home_placeholder` and `away_placeholder` are non-null. Fail message includes the count.

### Routing (1 test, pure client check)
- `testRulesRouteExists` — import `routeTree` from `@/routeTree.gen` inside the function and assert the tree contains a route with path `/rules`. Returns pass/fail based on key presence.

## 3. New migration: `admin_diag` SECURITY DEFINER helper

Single read-only RPC to expose the small set of catalog facts the tests need without giving the app raw SQL access.

```
CREATE FUNCTION public.admin_diag(_caller_id uuid, _kind text, _arg text)
  RETURNS jsonb SECURITY DEFINER AS $$
  -- has_role(_caller_id,'admin') gate
  -- _kind in ('trigger_def','proc_body','proc_exists','columns','trigger_exists')
  -- returns jsonb describing the requested catalog row(s)
$$;
GRANT EXECUTE ON FUNCTION public.admin_diag(uuid,text,text) TO authenticated;
```

## 4. Panel rewrite (`src/components/admin/TestsPanel.tsx`)

- Add a `category` field with new buckets:
  `Data Integrity`, `Auth & RLS`, `Scoring Engine`, `Multipliers`, `Tournament Winner`, `Prediction Locking`, `Standings Trigger`, `Ligas`, `Launch Readiness`.
- Reassign existing tests to the new buckets. `Launch Readiness` is a derived view, not a separate import — it includes the 11 critical tests listed below.
- Render an emoji prefix per category: 📊 🔐 ⚽ ✖️ 🏆 🔒 🏟️ 🤝 🚀.
- Add a "Launch Readiness" panel at the top with only the critical subset and a single summary line:
  - all pass → `✅ App is ready for launch 🚀`
  - any fail → `❌ Fix these issues before going live`
- "Run all tests" runs every test across every section in order.

### Launch readiness set (`critical: true`)
1. `testMatchCount` — All matches imported (104)
2. `testNoTestMatches` — No test data in production
3. `testNoTestUsers` — No test users in production
4. `testAdminExists` — Admin role assigned
5. `testMatchesPublicReadable` — Matches readable by public
6. `testScoreMatchdayUsesCallerId` — score_matchday uses _caller_id
7. `testValidatePredictionTriggerScoped` — validate_prediction trigger preserved
8. `testNoNullMultiplier` — No matches with null multiplier
9. `testRulesRouteExists` — Rules page accessible
10. `testStandingsTriggerExists` — Standings trigger exists
11. `testKnockoutPlaceholdersSet` — All knockout matches have placeholders

## 5. Files changed

- `src/lib/admin-tests.functions.ts` — update 4 fns; add ~25 new exported test fns; small `admin_diag` wrapper helper.
- `src/components/admin/TestsPanel.tsx` — re-categorize, add Launch Readiness summary, import new tests.
- `supabase/migrations/*` — new `admin_diag` read-only RPC.

## Out of scope

- No changes to scoring SQL, triggers, or game logic — tests verify what already exists.
- No UI changes outside the Tests panel.
- No removal of existing edge-case tests; they remain under "Scoring Engine".
