## Add "Download my data" GDPR export

### Server function: `src/lib/auth.functions.ts`
Add `exportMyDataFn` (GET, `requireSupabaseAuth`). Queries (all scoped to `userId`):
- `profiles` — display_name, country, favourite_team, created_at, current_streak, longest_streak.
- `tournament_predictions` — predicted_winner, created_at, points_awarded.
- `predictions` joined with `matches` (home_team, away_team, kickoff_at, phase) → list with predicted_home_goals, predicted_away_goals, predicted_first_scorer, booster_applied, points_earned, submitted_at.
- Leagues: call existing `my_leagues()` RPC; map to `{ name, invite_code, role: owner_id===userId ? "owner" : "member", joined_at }` (fetch `joined_at` from `league_members` for the user).
- Totals: call `global_leaderboard()` RPC, find row where `id === userId` → `total_points`, `overall_rank` (null if absent).

Return object matches the spec exactly. No emails, no auth data.

### Mi Marcador page: `src/routes/_authenticated/me.tsx`
Add a new `<YourDataSection />` rendered just above `<DangerZone />`:
- Card with heading "Your data", subtext per spec, "Download my data" button.
- On click: call `useServerFn(exportMyDataFn)`, build a `Blob` with `JSON.stringify(data, null, 2)`, create object URL, programmatically click an `<a>` with `download="marcador-data-export.json"`, revoke URL.
- Show `toast.success("Your data export is downloading ✓")` after trigger; toast.error on failure.
- Loading state on button while fetching.

### Out of scope
- No DB migrations, no admin UI, no rate limit (small file, authenticated only).
