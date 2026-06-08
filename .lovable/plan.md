# Edge case score tester

Adds a new "Scoring edge cases" card to the existing 🧪 Tests section that runs 13 isolated, fully-automated scoring tests in temporary matchdays.

Reuses the existing `withTempScenario` / `seedMatchAndPrediction` / `scoreAndGetPoints` helpers in `src/lib/admin-tests.functions.ts` (already prefix matchdays with `__test_` and purge on every run). All temp matches will use `home_team='__test'` as requested for the manual cleanup query, on top of the existing prefix-based purge.

## Heads-up on existing test conflict

The user's spec for **Correct result wrong score** (pred 2-0 vs actual 1-0) expects 8 pts: `3 result + 2 away (0=0) + 3 scorer`. The existing `testScoringCorrectResult` runs the same scenario but asserts 6 — it's wrong and will start failing once the matching edge-case test passes. I'll leave it untouched and surface the discrepancy in the new panel; if you want me to also update the old test or remove it, say so.

## 1. New server functions (append to `src/lib/admin-tests.functions.ts`)

All under a new `// ---------- Edge case scoring ----------` section. Each one: `assertAdmin` → `withTempScenario` → `seedMatchAndPrediction` (with `home_team:'__test'`, `away_team:'__test'`) → `scoreAndGetPoints` → assert exact integer → returns `{ status:'pass'|'fail', message }` with expected vs actual on fail. Try/finally is already guaranteed by `withTempScenario`.

Single-user tests (12 of 13):

- `testEdgeExactScoreline` — 2-1 home/home → 13
- `testEdgeCorrectResultWrongScore` — pred 2-0/home, actual 3-0/home → 8
- `testEdgeWrongFirstScorer` — pred 1-0/home, actual 1-0/away → 10
- `testEdgeDrawCorrect` — 1-1/home both sides → 13
- `testEdgeZeroZeroDraw` — 0-0/none both sides → 13
- `testEdgeZeroZeroBooster` — 0-0/none booster, actual 0-0 → 26
- `testEdgeWrongResult` — pred 2-0, actual 0-1 → 0
- `testEdgeAwayWin` — 0-2/away both sides → 13
- `testEdgeBooster` — 1-0/home booster, actual 1-0/home → 26
- `testEdgeUnderdog10pct` — see below (NOT below threshold → 13)
- `testEdgeUnderdogBelow10pct` — see below (fires → 18)
- `testEdgeRescoreNoDouble` — score once, capture pts, score same matchday again, assert unchanged
- `testEdgeResultCorrection` — actual 2-1 vs pred 2-1 → 13, update match to 1-1, re-score, assert 0

### Underdog tests

`predictions.user_id` FKs `auth.users` with a unique `(user_id, match_id)`, so the N predictions need N distinct auth users. New helper `withExtraTestUsers(n, fn)` does:

1. Loops `i=1..n-1` calling `supabaseAdmin.auth.admin.createUser({ email: 'edge-${ts}-${i}@marcador-edgetest.com', password: TestMarcador2026!, email_confirm: true })` and collects ids.
2. Runs `fn(ids)`.
3. In `finally`, deletes those auth users (CASCADE removes their predictions).

For the **below 10%** test (N=11): admin predicts 3-2 (boosterless), 10 helper users predict 0-0. Actual = 3-2/home. Score, read admin's points, assert 18 (`3+2+2+3+3 + 5` underdog; no booster, no first-scorer mismatch).

For the **at 10%** test (N=10): admin predicts 3-2, 9 helpers predict 0-0. Actual = 3-2/home. Admin should get exactly 13 (no +5 because share = 0.1 is NOT `< 0.1`).

### Rescore + correction tests

Both use the existing `seedMatchAndPrediction` then call `score_matchday` twice via the `supabaseAdmin.rpc('score_matchday', ...)` helper. The correction variant updates `matches.home_score / away_score / first_scorer` between scoring runs.

## 2. Wire into `TestsPanel.tsx`

Add a new card **above** "Pre-release checks" (so it sits between `<TestDataPanel />` and the existing panel):

- Header: "Scoring edge cases" + helper "Verifies the scoring engine against tricky scenarios that are commonly miscalculated."
- "▶ Run all edge case tests" button (sequential like existing `runAll`)
- 13 rows, each: status icon (✅/❌/⏳) + label + "Run" button
- Failures show `expected X, got Y` from the server fn's message
- New `EDGE_TESTS: TestDef[]` array using the same `RunState` machinery already in the file (refactor: pull `RunState`, `ICON`, and run helpers into either a small shared block or copy locally — copy is fine, the panel is internal)

No DB migration. No changes to scoring functions, no changes to `TestDataPanel`, no changes to other admin tests. All cleanup goes through the existing `purgeTestArtifacts` (matchday-name prefix) plus an extra fallback `DELETE FROM matches WHERE home_team='__test'` at the end of each test for belt-and-braces safety.
