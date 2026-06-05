# Tournament Winner Prediction

One-time pick of the 2026 World Cup champion. Worth +50 bonus points if correct. Locks before the first kickoff.

## Note
Your message was cut off after "replace the banner with". I'm assuming the locked-in state shows the user's pick (team name) and, after the final is set by admin, a result badge (✅ +50 / ❌ 0). Tell me if you wanted something different.

## Database (one migration)

**`tournament_predictions`**
- `id` uuid PK, `user_id` uuid UNIQUE FK→profiles(user_id), `predicted_winner` text, `points_awarded` int null, `created_at` timestamptz
- RLS: user can SELECT/INSERT own row (no UPDATE — one shot). Admin SELECT all.
- GRANT select, insert to authenticated; ALL to service_role.

**`tournament_settings`** (singleton, id=1)
- `actual_winner` text null, `predictions_locked` bool default false, `updated_at` timestamptz
- RLS: SELECT to anon + authenticated. UPDATE only via admin server fn (no policy).
- Seed row with id=1.

**Constant** `TEAMS_2026` (32 teams, alphabetical) in `src/lib/teams.ts`. Used by UI dropdown and server-side validation (z.enum).

## Server functions (`src/lib/tournament.functions.ts`)

- `getTournamentStatus` (auth) → `{ myPick: {predicted_winner, points_awarded} | null, locked: boolean, actualWinner: string | null }`
- `getTournamentStatusPublic` (no auth, supabaseAdmin) → `{ locked, actualWinner }` for guests
- `submitTournamentPickFn` (auth) → validates team in TEAMS_2026, checks `predictions_locked=false`, inserts (will fail on unique violation if already picked)
- `adminLockTournamentFn` (auth + assertAdmin) → sets `predictions_locked=true`
- `adminSetTournamentWinnerFn` (auth + assertAdmin) → input: winner team; sets `actual_winner`, then UPDATE `tournament_predictions` SET `points_awarded = CASE WHEN predicted_winner=winner THEN 50 ELSE 0 END`

## Leaderboard integration

Update `global_leaderboard` SQL function: add `COALESCE((SELECT points_awarded FROM tournament_predictions WHERE user_id=p.user_id), 0)` to `total_points`. Bonus only counts once admin scores it (null until then).

## UI

**Play screen banner** (`src/routes/_authenticated/play.tsx`, above matchday card)
- Hidden for guests (or show locked read-only state)
- States:
  1. No pick + not locked → Card with title "Pick your champion", Select (32 teams alphabetical), "Lock in my pick" button → calls `submitTournamentPickFn`, then invalidates query
  2. Has pick, no result yet → Card "Your champion: 🏆 {team}" + small "Locked in" subtitle
  3. Has pick + actualWinner set → Same card + badge: correct shows "+50 bonus points", wrong shows "Better luck next time"
  4. Locked + no pick → Muted card "Tournament predictions are closed"

**Admin tab** (`src/routes/_authenticated/admin.tsx`): add "Tournament" section with Lock button + Set Winner dropdown + Apply.

## Files
- new: `supabase/migrations/<ts>_tournament.sql`, `src/lib/tournament.functions.ts`, `src/lib/teams.ts`, `src/components/TournamentBanner.tsx`
- edited: `src/routes/_authenticated/play.tsx`, `src/routes/_authenticated/admin.tsx`
