# Remove "Featured 6" — Predict Every Match

Simplify Marcador so any match with `teams_confirmed = true` and a future kickoff is predictable. No more curated 6-match featured view.

## 1. Database migration

- Drop `is_selected` column from `matches` (or backfill `true` and stop reading it — I'll drop it to keep the schema clean).
- Set `teams_confirmed = true` for all matchdays 1–3 (already true from prior migration — re-assert).
- Set `teams_confirmed = false` for all knockout matchdays 4–9 where team names still match placeholder patterns (Winner/Loser/RU/TBD/1A/2A/…). The existing `auto_confirm_teams` trigger flips to true once admin sets real names.
- Confirm `matches` is in `supabase_realtime` publication (already added in prior migration).

## 2. Server functions (`src/lib/game.functions.ts`)

Remove or stop using anything keyed off `is_selected`. Add/keep:

- `getPlayOverview()` — returns `{ total_matches, predicted, remaining, next_kickoff_at }` across all matches with `teams_confirmed = true`.
- `getAllPredictableMatches()` — every match with `teams_confirmed = true OR matchday in knockouts (so we can show greyed placeholders too)`, including current user's prediction, points, final score. Used by both By-Date and By-Matchday views.
- `getMatchdaysWithProgress()` — list of all matchdays with `{ id, name, total, predicted, all_locked }` for the matchday tab bar.
- Keep `upsertPrediction` (auto-save), `setBooster` (one per matchday, atomic move), admin `confirmTeams`, `renameTeam`, `setMatchResult`, `scoreMatchday`.
- `getUpcomingMatchesPublic` — keep but switch from `is_selected` filter to `teams_confirmed = true AND kickoff_at > now()` ordered by kickoff, limit 3 (landing page preview).
- `getMyProfileStats()` — `{ predicted, total, accuracy_pct, most_predicted_winner, points_by_matchday: [{ matchday_name, points }] }`.

## 3. Play screen rewrite (`src/routes/_authenticated/play.tsx`)

Replace existing layout with:

- Top summary bar: `"{predicted} predictions submitted · {remaining} matches remaining"` and a `Next match in Xh Ym` chip.
- Toggle: `[By Date] [By Matchday]` — persisted in URL `?view=date|matchday` (default `date`).

New components in `src/components/play/`:

- `MatchCard.tsx` — full card (score steppers, first-scorer 3-button, 2x booster, auto-save 800ms, saved tick, locked padlock state, amber border when boosted, result + points breakdown when final, greyed placeholder state when `!teams_confirmed`).
- `ByDateView.tsx` — fetches all matches, groups by local date, sticky date headers with `"N matches · M predicted"`, `Today` chip, hides past dates behind a `Show past matches` toggle, countdown on first upcoming.
- `ByMatchdayView.tsx` — horizontal pill scroller `MD1 · MD2 · MD3 · R32 · R16 · QF · SF · F` (derived from matchday names) with completion badge (`✓`, `(x/y)`, none). Inside each tab: matchday summary line + the same date-grouped list scoped to that matchday.
- `useBoosterMutation`, `usePredictionAutosave` hooks for shared logic.

Realtime: subscribe to `postgres_changes` on `public.matches` for `UPDATE` where `teams_confirmed` flips true → toast `🔓 New match to predict: A vs B` and invalidate queries.

## 4. Profile page (`src/routes/_authenticated/profile.tsx`)

Add a stats panel using `getMyProfileStats`:

- `67 / 104 matches predicted` ring/progress.
- Accuracy %.
- Most predicted winner team.
- Bar chart of points per matchday (Recharts — already in stack).

## 5. Admin (`src/routes/_authenticated/admin.tsx`)

- Remove the "selected matches" toggle / column entirely.
- Per-matchday header: `"X matches · Y predicted by users"`.
- For each knockout match without confirmed teams: editable home/away inputs + `Confirm teams` button → calls `confirmTeams(matchId)`.
- Keep results entry + Run scoring unchanged.

## 6. Landing page (`src/routes/index.tsx`)

- Replace hero copy `Six matches each matchday` → `Predict every match. Every matchday.`
- Live preview already uses `getUpcomingMatchesPublic`; update server fn to drop `is_selected` filter so it shows the next 3 confirmed-team matches.

## 7. Scoring & leaderboard

No changes — `score_matchday` already iterates every match in a matchday. Booster enforcement happens at write time (one per matchday), so scoring stays as-is.

## Out of scope

- Push notifications (toast only, in-app realtime).
- Bracket auto-progression from completed knockout results.
- Bulk-prediction shortcuts.

## Files

- 1 migration: drop `is_selected`, re-assert `teams_confirmed` values.
- Edit: `src/lib/game.functions.ts`, `src/routes/_authenticated/play.tsx`, `src/routes/_authenticated/admin.tsx`, `src/routes/_authenticated/profile.tsx` (or current profile route), `src/routes/index.tsx`, `src/integrations/supabase/types.ts` (regenerated).
- New: `src/components/play/MatchCard.tsx`, `ByDateView.tsx`, `ByMatchdayView.tsx`, hooks.
- Delete: `src/components/play/AllMatchesView.tsx` (folded into new views).
