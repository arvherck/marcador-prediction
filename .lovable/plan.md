# Streak Tracker

## Database migration

Add to `profiles`:
- `current_streak int NOT NULL DEFAULT 0`
- `longest_streak int NOT NULL DEFAULT 0`

Update `public.score_matchday(_matchday_id int)` to also update streaks. To handle re-scoring without double counting, key off `matchday_scores` existence (which acts as an idempotent "has been scored" marker per user/matchday):

After the existing `INSERT ... ON CONFLICT` into `matchday_scores`, run a single SQL pass over `profiles`:

```sql
WITH participated AS (
  SELECT DISTINCT user_id FROM public.predictions p
  JOIN public.matches m ON m.id = p.match_id
  WHERE m.matchday_id = _matchday_id
),
-- Only adjust streaks if this matchday wasn't already scored before this run.
-- Use matchdays.is_scored flag captured BEFORE we set it to true.
...
```

Implementation: capture `was_scored boolean := (SELECT is_scored FROM matchdays WHERE id = _matchday_id);` at top of function. Only run the streak update block when `was_scored = false`. Then:

- For every profile with a row in `participated`: `current_streak = current_streak + 1`, `longest_streak = GREATEST(longest_streak, current_streak + 1)`.
- For every other profile: `current_streak = 0`.

This guarantees rescoring the same matchday is a no-op for streaks.

## Server functions

Extend `getCurrentMatchday` (in `src/lib/game.functions.ts`) to also return `streak: { current, longest }` from the caller's profile row. Extend `getMyProfile` (or whatever `me.tsx` uses — verify) similarly. Extend `global_leaderboard` SQL function to return `current_streak int` per row (join profiles), and update `src/lib/game.functions.ts` typing + leaderboard query.

Guest path (`getCurrentMatchdayPublic`) returns `streak: null`.

## UI

**Play header (`src/routes/_authenticated/play.tsx` ~line 158-173)**: Add a streak badge in the top-right of the header, next to/above `KickoffCountdown`. Render only when `streak.current >= 2`. Style: amber, bold, `🔥 {n}`, with a `title` tooltip "{n} matchday streak".

**Mi Marcador (`src/routes/_authenticated/me.tsx`)**: Add a stats row showing `🔥 Current streak: X matchdays` and `⭐ Longest streak: X matchdays`. If both are 0, show "No streak yet" instead.

**Leaderboard (`src/routes/_authenticated/leaderboard.tsx`)**: Next to each row's name, render `🔥 {n}` (amber, small) when `current_streak >= 3`.

## Files

- New migration (profile columns + updated `score_matchday` + updated `global_leaderboard`)
- Edit `src/lib/game.functions.ts` (return streak data; types)
- Edit `src/routes/_authenticated/play.tsx`, `me.tsx`, `leaderboard.tsx`
- `src/integrations/supabase/types.ts` regenerates after migration
