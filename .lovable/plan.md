## Scope

Automate populating Round of 32 → Final based on group results, with an admin-confirmation step for 3rd-place slots, manual overrides, and a realtime unlock notification on the play screen. Keep the currently-seeded R32/R16/QF/SF/Final pairings as-is; only the team names get filled in.

## 1. Database migration

One migration adds columns, seeds placeholders from the existing `home_team`/`away_team` text, and ships the new RPC.

`matches` (additive only — group-stage rows unaffected):
- `home_placeholder TEXT NULL`
- `away_placeholder TEXT NULL`
- `auto_populated BOOLEAN NOT NULL DEFAULT false`

`wc_standings` (for the fair-play tiebreaker):
- `yellow_cards INT NOT NULL DEFAULT 0`
- `red_cards INT NOT NULL DEFAULT 0`

Data backfill in the same migration:
- For every knockout row (ids 79–110), copy the current `home_team` → `home_placeholder` and `away_team` → `away_placeholder`. These strings already follow stable patterns we can parse:
  - `Winner Group X`
  - `Runner-up Group X`
  - `Best 3rd Place N` (N = 1..8)
  - `Winner R32 Match N` / `Winner R16 Match N` / `Winner QF Match N`
  - `Winner Semifinal N` / `Loser Semifinal N`
- Then null out `home_team`/`away_team` for knockout rows so the UI relies on placeholders until populated, and set `teams_confirmed=false` (already false today for these rows).

`matches.home_team` and `away_team` are currently `NOT NULL` — the migration changes them to nullable so unpopulated knockout rows can sit empty.

RLS / GRANT: no new tables, so no new policies. Existing matches policies cover the new columns.

## 2. DB functions

### `populate_knockout_brackets(_caller_id uuid, _third_assignment jsonb DEFAULT NULL) RETURNS jsonb`

- Admin-only via `has_role(_caller_id,'admin')`.
- Guard: every group-stage match must have `status='completed'`. If not, return `{ ok:false, reason:'group_stage_incomplete', remaining: N }`.
- Compute group winners + runners-up from `wc_standings` (already ranked by `points, goal_difference, goals_for`; group letter resolved via `wc_groups`).
- Compute the 8 best 3rd-placed teams ranked by `points DESC, goal_difference DESC, goals_for DESC, (yellow_cards + 3*red_cards) ASC, group_letter ASC`.
- If `_third_assignment` is NULL, return `{ ok:false, reason:'needs_third_confirmation', third_teams:[...], third_slots:[1..8] }` — the admin UI then re-calls with the user-confirmed mapping.
- Otherwise:
  - For each knockout match, parse its `home_placeholder`/`away_placeholder` and resolve to a team name when possible:
    - `Winner Group X` → group X winner
    - `Runner-up Group X` → group X runner-up
    - `Best 3rd Place N` → `_third_assignment[N]`
    - `Winner R32 Match N` / `Winner R16 Match N` / `Winner QF Match N` / `Winner Semifinal N` / `Loser Semifinal N` → look up source match; if it has `is_final=true`, use winner/loser; otherwise leave as placeholder.
  - For every match where BOTH sides resolved AND the row was not manually overridden (`auto_populated` is true OR both team columns are NULL), update `home_team`, `away_team`, set `teams_confirmed=true`, `auto_populated=true`.
  - Never overwrite a row where `auto_populated=false` AND `home_team IS NOT NULL` (admin override protection).
- Returns `{ ok:true, populated:[match ids], pending:[match ids with unresolved placeholders] }`.

### `cascade_knockout_winners(_caller_id uuid) RETURNS jsonb`
- Same admin guard.
- Walks all knockout matches: whenever a source match is `is_final=true`, resolve dependent placeholders downstream by calling the same parser as above, but only the "Winner/Loser R32/R16/QF/Semifinal Match N" branch. Never touches a manually overridden row.
- Returns `{ ok:true, populated:[...], pending:[...] }`.
- Called automatically by a `BEFORE UPDATE` trigger on `matches` when `is_final` flips false → true (the trigger calls `cascade_knockout_winners` with the row's last admin caller via `current_setting('app.current_admin_id', true)::uuid`; if unset, the trigger is a no-op and the admin must press the manual button — keeps the trigger safe under non-admin paths).

### `reset_knockout_match(_caller_id uuid, _match_id int) RETURNS void`
- Admin-only. Sets `home_team=NULL, away_team=NULL, teams_confirmed=false, auto_populated=false` on that match (placeholders preserved). Used by the "Reset to placeholder" button.

## 3. Server functions (`src/lib/game.functions.ts`)

All authed + admin-gated:
- `adminBracketStatus()` → counts populated vs pending per phase, returns the 32 knockout rows with `{id, phase, home_team, away_team, home_placeholder, away_placeholder, auto_populated, is_final, teams_confirmed}` plus `groupStageComplete: boolean` and `bestThirdsPreview: [{team, group, points, gd, gf}]` when group stage is complete.
- `adminPopulateBracket({ thirdAssignment?: Record<1..8, string> })` → calls `populate_knockout_brackets` and then `cascade_knockout_winners` for good measure. Returns the RPC result; UI uses the `needs_third_confirmation` branch to render the confirmation dialog.
- `adminOverrideKnockoutTeams({ matchId, home_team?, away_team? })` → updates the row, sets `auto_populated=false`, `teams_confirmed = (home_team IS NOT NULL AND away_team IS NOT NULL)`.
- `adminResetKnockoutMatch({ matchId })` → calls `reset_knockout_match`.
- `adminUpdateStandingsCards({ team, yellow_cards, red_cards })` → updates `wc_standings` (used in the 3rd-place confirmation dialog only if admin wants to tweak ranking).

## 4. Admin UI — new "Knockout Bracket" section

New panel `src/components/admin/KnockoutBracketPanel.tsx` rendered inside `src/routes/_authenticated/admin.tsx` under a new tab/section:

- Top banner:
  - When group stage incomplete: muted "Group stage in progress — N matches remaining."
  - When complete and any R32 still pending: success banner "✅ All group matches complete — Round of 32 bracket ready to populate" + `Populate bracket` button.
  - When fully populated: subtle "Bracket up to date" badge.
- Status grid grouped by phase (R32 / R16 / QF / SF / 3rd / Final) showing each row: placeholder text in muted, populated team in bold; inline `Edit teams` and `Reset to placeholder` controls per row.
- "Populate bracket" click → calls `adminPopulateBracket()` with no args. If response is `needs_third_confirmation`, opens a `ThirdPlaceConfirmDialog`:
  - Lists the 8 ranked 3rd-place qualifiers with their group + stats.
  - 8 slot dropdowns labelled "Best 3rd Place 1..8"; defaults map slot N → Nth ranked team.
  - On confirm, re-call `adminPopulateBracket({ thirdAssignment })`.
- Cards panel (collapsible) lets admin edit yellow/red cards per team if they want to influence the ranking, then re-run.

No changes to the existing `score_matchday`, `recalculate_team_standing`, or scoring panels.

## 5. Play screen — realtime unlock toast

- Migration adds `matches` to the supabase_realtime publication (if not already).
- `src/routes/_authenticated/play.tsx` subscribes to postgres_changes on `matches` (UPDATE) filtered to `teams_confirmed=true`. Compare to previous cached value: when a row flips `teams_confirmed false→true`, fire a Sonner toast: `"🔓 {home_team} vs {away_team} — ¡abierto para predicciones!"` (Spanish, matching app voice), then `queryClient.invalidateQueries()` for the play queries so the card re-renders unlocked. No page refresh.

## 6. Render placeholders in user-facing views

`MatchCard.tsx`, `ByMatchdayView.tsx`, `ByDateView.tsx` currently show `home_team`/`away_team` directly. With those columns nullable for knockouts, fall back to `home_placeholder` / `away_placeholder` when null, and disable the prediction form when `teams_confirmed=false` (already the trigger behaviour in `validate_prediction`).

## Technical notes

- Placeholder parser is implemented in pl/pgSQL using simple regex / `starts_with` checks against the 6 known patterns. No external matrix data.
- Admin override is preserved because every update path checks `auto_populated`. Toggling `auto_populated=false` is the contract for "manual — don't touch".
- The trigger uses a session GUC (`SET LOCAL app.current_admin_id = ...` set inside `score_matchday` and the admin server fns) to avoid running cascades from non-admin contexts; safe no-op otherwise.
- New columns are nullable / defaulted so the deployment is non-breaking; existing predictions/queries keep working.
- No edge functions, no new tables, no policy changes.
