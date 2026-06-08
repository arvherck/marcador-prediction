# Round multiplier for knockout scoring

Add a per-match `points_multiplier` that scales all base scoring points for knockout rounds, keeps booster and underdog semantics intact, surfaces the multiplier on the Play screen + admin panel, and updates Mi Marcador's breakdown to group by round.

## DB migration

Single migration:

1. `ALTER TABLE public.matches ADD COLUMN points_multiplier INT NOT NULL DEFAULT 1`.
2. Backfill using actual DB phase strings:
   - `Group Stage` → 1
   - `Round of 32` → 2
   - `Round of 16` → 3
   - `Quarterfinal`, `Third Place` → 4
   - `Semifinal` → 5
   - `Final` → 6
3. Trigger `trg_set_points_multiplier` BEFORE INSERT OR UPDATE OF phase ON matches: if `NEW.points_multiplier` was not explicitly set (i.e. equals current default for the row's phase) OR `phase` changed, recompute from phase via the same mapping. Implemented as: always set `NEW.points_multiplier = COALESCE(NEW.points_multiplier, <phase_default>)` on INSERT, and on UPDATE only overwrite when OLD.phase IS DISTINCT FROM NEW.phase AND the multiplier value was not changed in this update. (Admin manual overrides via "Edit multiplier" survive — only phase changes auto-recompute.)
4. Replace `public.score_matchday` and `public.score_match` so the per-prediction calculation becomes:

```sql
pts := 0;
-- existing additive checks (result, home goals, away goals, goal diff, first scorer)
pts := pts * m.points_multiplier;
IF p.booster THEN pts := pts * 2; END IF;
-- underdog +5 added AFTER, flat (unchanged):
IF ... share < 0.1 THEN pts := pts + 5; END IF;
```

Preserve the existing `validate_prediction` admin-bypass and all other logic verbatim; only the multiply line is added before the booster step.

5. Re-score all already-scored matchdays (`SELECT score_matchday(id, '<system-admin-uuid>') FROM matchdays WHERE is_scored = true`) so historical knockout points reflect the multiplier. Use any admin user id (look up via `SELECT user_id FROM user_roles WHERE role='admin' LIMIT 1`).

After migration, types regenerate automatically — no manual `types.ts` edit needed.

## Server functions

`src/lib/game.functions.ts`:
- Extend `MatchRow` and its DB select with `points_multiplier: number`.
- Add `phase: string` and `points_multiplier: number` to the admin match-list select (already present for phase).
- Admin "Edit multiplier" endpoint: new `setMatchMultiplierFn(match_id, multiplier)` server fn — admin-gated, validates `multiplier ∈ {1,2,3,4,5,6}`, updates `matches.points_multiplier`.
- Add `getMyPointsByRoundFn()` returning rows shaped `{ round_key, round_label, total_points, order }` aggregated from `predictions JOIN matches` grouped by matchday→round bucket (Group Stage = MD 1+2+3; each knockout MD is its own bucket; Third Place rolled into Quarterfinals visually? — keep it as "Third Place" row only when matchday 8 has points, otherwise omit; treat each phase as its own bar except group stage which is combined). Returns ordered list: Group Stage, R32, R16, QF, Third Place (if any), SF, Final.

`src/lib/scoring-explain.ts`:
- When `points_multiplier > 1`, append a "Round ×N" annotation line so the breakdown explains the boost. Total still comes from `p.points` (stored) so it stays authoritative.

## UI — Play screen

`src/components/play/MatchCard.tsx`:
- Show a small amber pill `×N` in the top-left corner next to the existing phase label when `match.points_multiplier > 1`. Title/aria-label: `Points multiplied ×N in this round`. Use the existing amber-glow tokens; no new colors.
- "How points work" collapsible card at the top of the Play screen (above the matchday selector) using a `<details>` element with semantic markup. Body lists the multiplier table per round (with example "up to Npts per match" derived from 13 × multiplier), booster note, and underdog flat +5 note.

`src/components/play/PastMatchesPanel.tsx` and `ByDateView.tsx`: also show the `×N` pill where the phase label appears (same pattern).

## UI — Mi Marcador

`src/routes/_authenticated/me.tsx`:
- Replace the `BarChart` data source from `getMyMatchdayScoresFn` to `getMyPointsByRoundFn`. Keep the existing `BarChart` SVG component but adapt props to `{ round_key, round_label, total_points }`. Section title becomes "Points per round".
- Rank-over-time chart stays per-matchday (rank only makes sense per scored matchday).

## UI — Admin

`src/routes/_authenticated/admin.tsx` `ResultRow`:
- Show `×N multiplier` chip next to each knockout match row (hide for `×1`).
- Add an "Edit multiplier" inline control (small dropdown 1–6) that calls `setMatchMultiplierFn`. Refetch admin match list after success.

## Edge case tests

`src/lib/admin-tests.functions.ts` — add three tests to the existing `EDGE_TESTS` block and `TestsPanel.tsx`:
- `testEdgeMultiplierR32` — temporary match with `points_multiplier=2`, exact-scoreline prediction → expect `13 × 2 = 26` points.
- `testEdgeMultiplierBoosterStack` — temporary match with multiplier=5 (Semifinal), booster=true, exact scoreline → expect `13 × 5 × 2 = 130`.
- `testEdgeMultiplierUnderdogFlat` — multiplier=2, underdog scoreline (share <10%), exact match, no booster → expect `(13 × 2) + 5 = 31` (underdog +5 NOT multiplied).

These tests use the existing `withTempScenario` / `seedMatchAndPrediction` / `scoreAndGetPoints` helpers; the temp match insert just sets `points_multiplier` explicitly (the BEFORE trigger respects the supplied value on INSERT).

The existing `testEdgeExactScoreline` and other group-stage edge tests must continue to pass with `points_multiplier=1` defaulted on temp matches (which uses phase='Group Stage' equivalent). Verify by inspecting the helper after migration.

## Not changing

- Booster mechanic, underdog detection logic, streak tracking, leaderboard SQL, prediction lock trigger admin bypass, knockout cascade, group standings recalculation — all untouched.
- No new tables. No RLS changes (matches policies already cover the new column).

## Open question

The spec says "When admin creates new matches, automatically set points_multiplier based on the phase selected." Confirming: the BEFORE INSERT trigger above does this server-side regardless of where the insert comes from (admin UI, CSV importer, knockout populator). No client changes required to the admin create-match form. OK?
