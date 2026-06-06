# All Matches Prediction Mode

Expand predictions beyond the 6 featured matches per matchday so users can predict every match where teams are known.

## 1. Database

Migration on `public.matches`:
- Add `teams_confirmed boolean NOT NULL DEFAULT false`.
- Backfill: `teams_confirmed = true` for all matchdays 1–3 (group stage, 72 matches). Knockout matches (matchdays 4–9) stay `false` until admin updates them.
- Add a trigger `auto_confirm_teams_on_update`: if `home_team` or `away_team` changes and neither new value matches a placeholder pattern (`Winner %`, `Loser %`, `RU %`, `1%`, `2%`, `3%`, `TBD%`), set `teams_confirmed = true`.

No changes to predictions / scoring schema. The existing scoring function already iterates every match in a matchday, so full-schedule predictions are automatically included in `matchday_scores` and the global leaderboard — no engine changes needed.

Add a server-side validation trigger on `predictions` to reject inserts/updates when the target match has `teams_confirmed = false` or `kickoff_at <= now()`.

## 2. Server functions (`src/lib/game.functions.ts`)

- `getAllMatchesForMatchday(matchdayId)` — returns every match in the matchday with venue, kickoff, `teams_confirmed`, current score, plus the user's prediction if any.
- `getMatchdayProgress()` — returns `[{ matchday_id, name, predicted_count, total_available }]` for the tab bar (available = `teams_confirmed AND kickoff_at > now()` OR scored).
- `upsertPrediction({ match_id, home_goals, away_goals, first_scorer, booster })` — single-match upsert used by debounced auto-save. Enforces: match teams confirmed, kickoff in future, only one booster per matchday across all that user's predictions in that matchday.
- Update `getMatchdayData` / `getCurrentMatchday` — unchanged (still `is_selected = true` for the featured view).

## 3. UI — Play screen (`src/routes/_authenticated/play.tsx`)

Top of page: segmented toggle `Featured (6) | All Matches`. Default = Featured. Selection persisted in URL search param `?view=featured|all` via `validateSearch`.

### Featured view
Unchanged.

### All Matches view
- Horizontal scroll tab bar of matchdays: `MD1 (6/6)`, `MD2 (2/16)`, …, with the current active matchday selected by default. Counts come from `getMatchdayProgress`.
- Grid of compact `MatchPredictionCard` components for the selected matchday:
  - Home / away team, kickoff (local time), `{stadium} · {city}` subtext.
  - Two number inputs (0–20) for goals.
  - First-scorer selector (Home / Away / No goal).
  - Booster toggle — disabled with tooltip if already used on another match in the matchday.
  - Auto-save: 1s debounce per card, calls `upsertPrediction`. Status pill cycles `Saving… → Saved ✓` (or `Error – retry`).
  - If `kickoff_at <= now()`: card locked, padlock icon, shows final/live score if present.
  - If `teams_confirmed = false`: card greyed, body replaced with "Teams TBD", inputs disabled.

New file: `src/components/play/MatchPredictionCard.tsx` (compact variant) + `src/components/play/AllMatchesView.tsx`.

## 4. Admin (`src/routes/_authenticated/admin.tsx` + `DonationsPanel`-style panel)

New `MatchesPanel`:
- Table of matches filtered by matchday: teams, kickoff, `is_selected`, `teams_confirmed` toggle, editable home/away team fields for knockouts.
- Toggling `teams_confirmed` calls `adminSetTeamsConfirmed({ match_id, confirmed })`.
- Editing a knockout team name calls `adminUpdateMatchTeams({ match_id, home_team, away_team })`; the DB trigger flips `teams_confirmed` automatically when both values look real.

### Realtime notification
On the All Matches view, subscribe to `postgres_changes` on `matches` (UPDATE where `teams_confirmed` flips false→true). On event, show a toast: `New match available to predict: {home} vs {away}` and invalidate the matchday progress query.

## 5. Scoring & leaderboard

No code changes — `score_matchday` already loops every match with `is_final = true` in the matchday and writes per-user totals into `matchday_scores`, which the global leaderboard sums. Confirm by reading the function (already in context) — full-schedule predictions are picked up for free.

Booster rule (one per matchday) is enforced at write time in `upsertPrediction`, not at scoring time.

## 6. Out of scope

- No bracket auto-progression. Admin manually edits knockout team names.
- No push notifications — only in-app toast via Supabase realtime for users with the page open.
- No bulk-prediction shortcuts (e.g. "predict 1-1 for all").

## Technical notes

- Files touched: 1 migration; `src/lib/game.functions.ts`; `src/routes/_authenticated/play.tsx`; new `src/components/play/AllMatchesView.tsx`, `MatchPredictionCard.tsx`, `MatchdayTabs.tsx`; `src/routes/_authenticated/admin.tsx` + new `MatchesPanel.tsx`.
- Types regenerated after migration.
- Realtime: enable `REPLICA IDENTITY FULL` and add `matches` to `supabase_realtime` publication in the migration.
