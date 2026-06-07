# Admin panel refactor + pre-release test suite

Scope: presentation/admin-UX only, plus one new server function module
exposing read-only test runners. No game-logic, scoring, or RLS changes.

## 1. Layout & navigation

**Edit `src/routes/_authenticated/admin.tsx`:**

- Wrap the page in a two-column layout (sticky left sidebar on `md:`, top
  pill tabs on mobile) with anchor links + `IntersectionObserver` to
  highlight the active section:
  - 📊 Overview (`#overview`) — `FixtureImportBanner` + summary counts
  - ⚽ Results & Scoring (`#results`)
  - 🔄 API Sync (`#api-sync`) — existing `ApiSyncPanel`
  - 🏆 Tournament (`#tournament`) — champion + group standings
  - 💰 Donations (`#donations`)
  - 🧪 Tests (`#tests`)
- Each `Section` gets an `id` matching the sidebar anchor.
- Sections scroll into view via `scrollIntoView({ behavior: "smooth" })`.

**FixtureImportBanner:** add a close (×) button + 5s auto-dismiss
(`useEffect` setTimeout, persisted via `sessionStorage` key so it doesn't
re-show on every navigation in the same session).

**Advanced (collapsed by default):** move `New matchday` and
`Add match manually` into a single `<details>` block at the bottom of
the page labeled `▶ Advanced: Add matches manually`.

## 2. Results & Scoring improvements

Rewrite `MatchdayBlock` and its row component:

- **Collapsible matchday header** — `<details open={!md.is_scored}>` with
  summary showing name, date, `X matches`, and scoring status badge
  (`Scored ✓` green or `Pending` amber). Chevron ▼/▶ via CSS marker.
- **"Save all" button** in the header — disabled when no rows are dirty;
  iterates dirty rows and calls `adminSetResultFn` per row (parallel),
  toasts a single summary.
- **Dirty-row affordance** — local `dirtyIds: Set<number>` in
  `MatchdayBlock`. Rows with unsaved edits get `border-l-2 border-amber-500`.
  On save success: swap to `border-l-2 border-success` + ✓ badge for 2s
  (setTimeout → clear), then return to neutral.
- **Teams confirmed checkbox** — render only when
  `phase !== "Group stage"` (i.e. knockout rounds). Group rows render
  only score inputs + first-scorer select.
- **First scorer dropdown** — hide entirely when
  `phase !== "Group stage" && !teams_confirmed`.
- **Knockout team confirmation flow** — replace the existing
  "Confirm teams" button:
  - When `!teams_confirmed`: two text inputs prefilled with current
    placeholder names + a primary `Confirm & unlock` button. On submit,
    call `adminUpdateMatchTeamsFn` (already exists) with the new names
    and `teams_confirmed: true`. Show toast + invalidate.
  - When `teams_confirmed`: show real team names with a subtle
    `Edit teams` link that toggles back to the input view.

## 3. Pre-release test suite

**New file `src/lib/admin-tests.functions.ts`** — one `createServerFn`
per test, guarded with the existing `assertAdminAdmin` pattern. Each
returns `{ status: "pass" | "fail" | "warn"; message: string; detail?: string }`.

Data integrity (use `supabaseAdmin` reads):
- `testMatchCount` — `count(*) from matches = 104`
- `testMatchdays` — 9 rows in `matchdays`
- `testNoDuplicateMatches` — `group by (home_team, away_team, kickoff_at) having count > 1`
- `testGroupStageConfirmed` — `count(*) from matches where phase='Group stage' and teams_confirmed = true = 72`
- `testKickoffRange` — all `kickoff_at` between `2026-06-11` and `2026-07-20`
- `testStandingsPopulated` — `count(*) from wc_standings = 48`

Auth & security:
- `testPredictionsRlsAnon` — instantiate an anon Supabase client inline
  (publishable key, no session), select from `predictions`; pass if
  permission denied OR 0 rows
- `testProfilesRlsAnon` — same pattern on `profiles`. NOTE: current
  policy allows authenticated read; for anon it should return 0/blocked.
- `testAdminExists` — `count(*) from user_roles where role='admin' >= 1`
- `testMatchesPublicReadable` — anon client `select count from matches > 0`

Game logic (each test is self-contained; creates fixtures in a
transaction-style sequence and cleans up in a `try/finally`):
- `testScoringExactPlusFirstScorer` — insert temp match (kickoff in
  future, set `is_final` after) + prediction 2-1 + first scorer match,
  call `score_matchday(temp_md_id)`, assert `points = 13`. Cleanup
  removes the temp matchday + match + prediction + matchday_scores rows.
- `testScoringCorrectResultWrongScore` — 2-0 vs 1-0 → expect 3
- `testScoringWrongResult` — 2-0 vs 0-1 → expect 0
- `testBoosterDoubles` — booster true, correct exact 1-0 → expect
  `2 * non_boosted_points`
- `testUnderdogBonus` — 20 temp users (use existing profiles or seed
  user_ids) all predicting same score except 1 predicting actual →
  the unique predictor gets +5 bonus
- `testKickoffLock` — attempt insert into `predictions` for a temp
  match with `kickoff_at` in the past; expect rejection via the
  `validate_prediction` trigger

All temp data uses a sentinel matchday name like `__test_<uuid>` so
cleanup is unambiguous; tests run in a fixed `__test` matchday id
range and always `delete from matches/matchdays/predictions where
matchday_id = temp_id` in `finally`.

**New component `src/components/admin/TestsPanel.tsx`:**

- Test registry array: `{ id, label, category, critical, run: () => Promise<TestResult> }`.
- Rows grouped by category with a ▶ Run button + status icon
  (`⏳ ✅ ❌ ⚠️`). State stored in `useState<Record<id, TestResult | "running" | null>>`.
- "▶ Run all tests" button at the top — sequential `for…of` loop so
  game-logic tests don't race on temp ids.
- Summary bar after a full run: `✅ N passed · ❌ N failed · ⚠️ N warning`.
- Launch banner:
  - Green `App is ready for launch 🚀` if every test marked
    `critical` is passing.
  - Red `Fix issues before launch` if any critical test failed.
- Critical set: `testMatchCount`, `testAdminExists`,
  `testMatchesPublicReadable`, `testScoringExactPlusFirstScorer`,
  `testKickoffLock`.

## 4. Files

- **edit** `src/routes/_authenticated/admin.tsx` — sidebar, dismissible
  banner, Advanced collapse, mount `<TestsPanel />`, simplified
  `MatchdayBlock` (collapsible, Save all, dirty borders, knockout edit
  flow, conditional first-scorer/teams-confirmed).
- **new** `src/components/admin/TestsPanel.tsx` — UI, test registry,
  run-all flow, launch banner.
- **new** `src/lib/admin-tests.functions.ts` — all server-fn test runners.

No DB migrations, no scoring logic edits, no RLS edits. Existing
`adminUpdateMatchTeamsFn` already supports updating team names +
`teams_confirmed` so no backend additions are needed for the knockout
flow.
