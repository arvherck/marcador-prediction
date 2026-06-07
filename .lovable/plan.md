## Goal

Auto-recalculate World Cup group standings the moment an admin saves a group-stage result, and surface those updates live on the Grupos screen and in the admin panel.

## 1. Database trigger (migration)

Add a Postgres trigger that owns standings math — clients never write to `wc_standings` directly anymore.

- `public.recalculate_team_standing(_team text)` (security definer): wipe and recompute one team's row by scanning every `matches` row in their group where `status = 'completed'` and `home_score`/`away_score` are non-null. Sets `played, won, drawn, lost, goals_for, goals_against, goal_difference, points`. Upserts into `wc_standings` (insert if missing, keyed by `team`+`group_id`).
- `public.recalculate_group_standings()` trigger function (AFTER INSERT OR UPDATE OR DELETE on `matches`): fires when `group_letter IS NOT NULL` and any of `status / home_score / away_score / home_team / away_team` changed (or on insert/delete). Recalculates both `OLD.home_team`/`OLD.away_team` and `NEW.home_team`/`NEW.away_team` so:
  - Status `upcoming → completed` adds the result.
  - Score correction on an already-completed match re-derives totals from scratch.
  - Status `completed → upcoming` removes the result (because the scan filters on `status = 'completed'`).
- Bind trigger `AFTER INSERT OR UPDATE OR DELETE ON public.matches FOR EACH ROW`.
- Reset existing data: `UPDATE public.wc_standings SET played=0, won=0, drawn=0, lost=0, goals_for=0, goals_against=0, goal_difference=0, points=0;` then run the recalc once for every team currently in `wc_standings` so any pre-existing completed matches are reflected.
- No new GRANTs needed — `wc_standings` already exists with its policies; the trigger runs as table owner.

## 2. Server functions

- `src/lib/groups.functions.ts`
  - Remove `adminSaveGroupStandingsFn` (manual standings edits are now incorrect — the trigger is the source of truth). Replace any admin UI that called it.
  - Tighten the head-to-head tiebreaker in `sortStandings`: after points / GD / GF, compute mini-league points between teams currently tied on those three, then fall back to alphabetical. Implemented client-side using the rows returned (we don't need raw H2H from the DB because all completed group matches are already counted; for H2H specifically we'll add an optional `matches` payload from the loader).
  - Extend `loadAll` to also fetch completed group matches per group so H2H tiebreaker can be computed; return them on `GroupWithStandings` as `completedMatches` (just `{home_team, away_team, home_score, away_score}`).
  - Also return any `live` match flag per group (`hasLiveMatch: boolean`) and the max `updated_at` from `wc_standings` rows in the group (`updatedAt: string`).

- `src/lib/game.functions.ts`
  - `adminSetResultFn` already sets `status = 'completed'`; after the update, fetch the two affected standings rows and return them in the response as `standingsImpact: { home: StandingRow, away: StandingRow } | null` (null for knockouts). The admin UI shows this in the toast.

## 3. Grupos screen — live + visuals

`src/routes/_authenticated/grupos.tsx`:

- Subscribe to `postgres_changes` on `public.wc_standings` (and `public.matches` for the LIVE flag) via the browser `supabase` client inside a `useEffect`. On any event, call `queryClient.invalidateQueries({ queryKey: ["groups", ...] })`.
- Ensure realtime is enabled for both tables (migration: `ALTER PUBLICATION supabase_realtime ADD TABLE public.wc_standings, public.matches;` — guarded with `DO` block in case already added).
- `GroupCard` updates:
  - Show a small red pulsing "LIVE" pill in the header if `group.hasLiveMatch`.
  - Show `Updated <relative time>` under the table (refreshes on every query result).
  - Row styling by sorted index:
    - 0,1: amber left border (`border-l-2 border-l-amber-glow`) + faint amber bg.
    - 2: default.
    - 3: `opacity-60`.
  - Flash animation: track previous row signature (points|gd|gf|w|d|l) in a `ref`; if a row changes between renders, add a one-shot `animate-flash` class. Add `@keyframes flash` to `src/styles.css` (subtle bg pulse using `--accent`).

## 4. Admin panel feedback

`src/routes/_authenticated/admin.tsx`:

- After `adminSetResultFn` resolves in `ResultRow` and in `saveAll`, if `standingsImpact` is present, show a multi-line toast:
  ```
  Result saved ✅
  Standings updated:
  Brazil: 3pts (1W 0D 0L)
  Morocco: 0pts (0W 0D 1L)
  ```
- Remove the manual "save standings" UI that called `adminSaveGroupStandingsFn` (if present), replaced with a read-only display reading from `wc_standings` and a note: "Standings update automatically when group-stage results are saved."

## 5. Tests

`src/lib/admin-tests.functions.ts` + `src/components/admin/TestsPanel.tsx`:

- New test `Standings trigger works`:
  1. Find a group-stage match (`group_letter IS NOT NULL`) currently `upcoming`.
  2. Snapshot current `wc_standings` for `home_team` and `away_team`.
  3. Update the match: `home_score=2, away_score=1, status='completed', first_scorer='home', is_final=true`.
  4. Re-read standings; assert home delta `+3 pts, +1 W, +2 GF, +1 GA, +1 P`; away delta `+0 pts, +1 L, +1 GF, +2 GA, +1 P`.
  5. Revert match (`home_score=null, away_score=null, status='upcoming', first_scorer=null, is_final=false`).
  6. Re-read standings; assert equal to original snapshot.
- Pass/fail messages match the spec.

## Technical notes

- The trigger uses `RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`.
- Knockout matches (`group_letter IS NULL`) are ignored by both the trigger guard and the team-recalc scan.
- H2H tiebreaker is computed in JS from completed-match payload to avoid a second DB round-trip per render.
- No schema changes to `wc_standings` columns; only data reset + trigger attachment.
- No new RLS or GRANTs required.

## Files touched

- New migration: trigger + functions + realtime publication + standings reset/recalc.
- `src/lib/groups.functions.ts` — extend loader, drop manual save fn.
- `src/lib/game.functions.ts` — return `standingsImpact` from `adminSetResultFn`.
- `src/routes/_authenticated/grupos.tsx` — realtime, visuals, flash.
- `src/routes/_authenticated/admin.tsx` — toast, remove manual standings editor.
- `src/lib/admin-tests.functions.ts`, `src/components/admin/TestsPanel.tsx` — new test.
- `src/styles.css` — `@keyframes flash` + `.animate-flash` utility.
