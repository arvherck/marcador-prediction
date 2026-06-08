# Standings verifier

Add a "Group standings accuracy" card to the admin Panel de Control → 🧪 Tests section that runs three checks against the `wc_standings` table using a known Group A scenario, then restores the original match data.

## Approach

The `trg_recalculate_group_standings` trigger on `matches` already recomputes `wc_standings` on every INSERT/UPDATE/DELETE that touches a group match. `goal_difference` and `points` are generated columns (`goals_for - goals_against`, `won*3 + drawn`). The tests simply mutate Group A scores via `supabaseAdmin`, then read `wc_standings` rows back and compare.

Group A matches (verified): ids 7, 8, 31, 34, 59, 60 — Mexico, South Korea, Czechia, South Africa.

## Server functions — `src/lib/admin-tests.functions.ts`

Add a new `// ---------- Standings ----------` section with one combined runner (the three sub-tests share setup/teardown, so running them as separate server fns would force duplicate save/restore cycles and triple the runtime):

`testStandingsVerifier()` — admin-gated, returns `TestResult`.

Flow:
1. Snapshot the current 6 Group A matches (`home_score`, `away_score`, `status`, `is_final`, `first_scorer`).
2. `try`:
   a. **Scenario 1** — apply the 6 known scores from the spec, set `status='completed'`, `is_final=true`, `first_scorer` derived from the score (`home`/`away`/`none`).
   b. Query `wc_standings` for Group A and compare all 4 teams against the expected P/W/D/L/GF/GA/GD/Pts table.
   c. Verify rank ordering: Mexico > Czechia > South Korea > South Africa (sort by `points DESC, goal_difference DESC, goals_for DESC`).
   d. **Scenario 2** — change Mexico vs South Africa from 2-0 to 0-0; re-query and verify Mexico (P=3 W=1 D=2 L=0 GF=1 GA=0 GD=+1 Pts=5) and South Africa (P=3 W=0 D=2 L=1 GF=3 GA=4 GD=-1 Pts=2).
   e. Build a single `detail` string with per-team per-column ✅/❌ marks for both scenarios plus the ordering line. Return `pass` only if every value matches and ordering is correct; otherwise `fail` with the detail showing exactly which fields mismatched.
3. `finally`: restore each match to its snapshot in a single `update` per row. The trigger recomputes standings to their original state automatically.

Helper (file-private):

```ts
type StandingRow = { team: string; played: number; won: number; drawn: number;
  lost: number; goals_for: number; goals_against: number;
  goal_difference: number; points: number };
function check(actual: StandingRow, expected: Omit<StandingRow,'team'>): {ok:boolean; line:string}
```

## UI — `src/components/admin/TestsPanel.tsx`

Add `<StandingsVerifierPanel />` rendered between `<PredictionLockPanel />` and the "Pre-release checks" card. Same chrome as the other test cards (card border, header with title + subtitle, single "▶ Run standings verification" button, one row showing ✅/❌/⚠️/⏳ + message). The verifier returns one `TestResult` whose `message` is a one-line summary and whose `detail` (already on the `TestResult` type) is the multi-line per-team breakdown — render `detail` as a small preformatted block under the row when present.

Header:
- Title: "Group standings accuracy"
- Subtitle: "Applies known Group A results, verifies every standings column and tiebreaker order, then restores originals."

## Safety

- Only Group A's 6 matches are touched; no other matches, predictions, profiles, or scores are modified.
- All mutations and the verification happen inside a `try`; cleanup runs in `finally` regardless of assertion outcomes or thrown exceptions.
- No DB migration. No changes to triggers, `recalculate_team_standing`, or any scoring code.
- Test scores temporarily flip matches to `completed`; restoration uses the snapshot including original `status`/`is_final`/`first_scorer` so live data is unaffected once the run finishes.

## Files touched

- `src/lib/admin-tests.functions.ts` — add `testStandingsVerifier` + helper.
- `src/components/admin/TestsPanel.tsx` — import the new fn, add `<StandingsVerifierPanel />` component and render it above Pre-release checks.
