
## Plan: Import Real 2026 World Cup Fixtures

### 1. Database schema migration
Add new nullable columns to `public.matches`:
- `stadium TEXT`
- `city TEXT`
- `host_country TEXT`
- `group_letter TEXT`

(Other existing columns — `phase`, `is_selected`, `home_score`, `away_score`, `first_scorer`, `is_final` — already cover the rest.)

### 2. Data wipe + import (single SQL transaction via insert tool)
- `DELETE FROM predictions;` (FK cascade safety — they reference matches)
- `DELETE FROM matchday_scores;` (reference matchdays)
- `DELETE FROM matches;`
- `DELETE FROM matchdays;`
- Reset sequences for `matchdays_id_seq` and `matches_id_seq`.
- Insert 9 matchdays with fixed IDs 1–9 and the names specified. `starts_at` = MIN(kickoff_utc) per matchday from the CSV.
- Insert 104 matches with `matchday_id`, `home_team`, `away_team`, `kickoff_at` (UTC), `phase` (round), `stadium`, `city`, `host_country`, `group_letter` (empty string treated as NULL for knockouts), scores NULL, `is_final=false`, `is_selected` per rule 4.

I'll generate the SQL by parsing the CSV in a script then feeding it through the insert tool.

### 3. `is_selected` auto-selection logic
- **Matchday 1**: first 6 by `kickoff_at`.
- **Matchdays 2 & 3**: pick 6 spread across distinct groups — order by kickoff, greedy pick one per unique group letter until 6 chosen (12 groups available, so always possible).
- **Matchdays 4–9 (knockouts)**: all matches `is_selected = true`.

### 4. Frontend updates

**Landing page (`src/routes/index.tsx`)** — live preview section
- Replace placeholder/static scores with a server-fn query for the next 3 matches where `kickoff_at > now()` ordered ascending. Render team names, kickoff, stadium · city.

**Play screen (`src/routes/_authenticated/play.tsx`)**
- Update active-matchday logic to: smallest `matchday_id` whose matches include at least one future `kickoff_at` AND `is_scored = false`.
- On each match card, add a small subtext line below team names: `{stadium} · {city}`.

**Admin panel (`src/routes/_authenticated/admin.tsx`)**
- Add a small confirmation banner / stat: "104 matches imported across 9 matchdays" — derived from a count query so it stays accurate.

### 5. Types
`src/integrations/supabase/types.ts` will be regenerated after the migration is approved; UI code can then use the new columns.

### Technical notes
- CSV has 104 rows + header; parsed in Python on the sandbox before issuing inserts.
- All times in CSV are already UTC; stored as `timestamptz`.
- `group_letter` left NULL when CSV's `group` is blank (knockouts).
- No changes to scoring logic, RLS, or grants — schema additions are purely additive nullable columns.

### Out of scope
- Bracket progression / auto-filling knockout team names later.
- Timezone conversion UI (display stays UTC-aware via existing components).
