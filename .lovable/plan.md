# Groups screen — World Cup 2026 standings

## Database (one migration)

Two new public tables.

**wc_groups**: `id int PK`, `name text NOT NULL`.

**wc_standings**: `id uuid PK default gen_random_uuid()`, `group_id int NOT NULL REFERENCES wc_groups(id) ON DELETE CASCADE`, `team text NOT NULL`, `played int NOT NULL DEFAULT 0`, `won int NOT NULL DEFAULT 0`, `drawn int NOT NULL DEFAULT 0`, `lost int NOT NULL DEFAULT 0`, `goals_for int NOT NULL DEFAULT 0`, `goals_against int NOT NULL DEFAULT 0`, `goal_difference int GENERATED ALWAYS AS (goals_for - goals_against) STORED`, `points int GENERATED ALWAYS AS (won*3 + drawn) STORED`, `updated_at timestamptz NOT NULL DEFAULT now()`. Unique `(group_id, team)`.

GRANTs (both tables): `SELECT` to `anon, authenticated`; `ALL` to `service_role`; admins update via policies.

RLS:
- `wc_groups`: SELECT to anon+authenticated (true); ALL to authenticated using `has_role(auth.uid(),'admin')`.
- `wc_standings`: same pattern.

Update trigger on `wc_standings` via existing `public.update_updated_at_column()`.

Seed `wc_groups` rows 1..12 (Group A..L) and `wc_standings` with the 48 teams listed (4 per group), all stats 0. Use the same migration.

Note: `played` is required to default to 0 but is editable by admin per spec — we store it directly (not generated) so admin's `W+D+L` calculation can be written and the column can also stand alone if needed. Spec literally says default 0; admin auto-calculates client-side.

## Server functions (`src/lib/groups.functions.ts`)

- `getGroupsPublic` (no auth, `supabaseAdmin`) → returns `Array<{ id, name, standings: Array<{ id, team, played, won, drawn, lost, goals_for, goals_against, goal_difference, points }> }>` sorted by `group.id` then by points desc, GD desc, GF desc.
- `getGroups` (auth) → same shape, via `requireSupabaseAuth` client.
- `adminSaveGroupStandingsFn` (auth + `assertAdmin`) → input `{ group_id, rows: [{ id, won, drawn, lost, goals_for, goals_against }] (length 4) }`, validates each row belongs to that group, updates `played = won+drawn+lost` plus all editable cols in a single `UPSERT`/4 updates, sets `updated_at`.

## UI

### New route `src/routes/_authenticated/grupos.tsx`

Public-friendly under the `_authenticated` layout (guest sessionStorage flow already lets guests reach `/leaderboard`; same pattern). `queryFn` picks `getGroupsPublic` for guests, otherwise `getGroups`.

Layout: `grid grid-cols-1 md:grid-cols-2 gap-4`. Each card = group name header + standings table with columns `Team P W D L GF GA GD Pts`.

Row styling:
- index 0 and 1 → amber (qualification): `text-amber-glow font-semibold` + subtle amber left border.
- index 2 → normal.
- index 3 → `opacity-60`.

If every team in a group has `played === 0`, replace the table body with a centered "Tournament starts 11 June 2026" message.

Standard `head()` with route-specific title/description/og.

### Navigation (`src/components/AppShell.tsx`)

Insert `{ to: "/grupos", label: "Grupos", icon: GroupsIcon, guest: true }` between `Tabla` and `Ligas`. Add a small `GroupsIcon` SVG (3x3 grid or trophy-style) matching existing icon component style.

### Admin panel (`src/routes/_authenticated/admin.tsx`)

Add a new `<Section title="Group standings">` containing `<GroupStandingsAdmin />`:
- Group selector (`<Select>` Group A..L), defaults to A.
- Loads that group's 4 rows.
- Renders 4 editable rows: team name (read-only), number inputs for W, D, L, GF, GA; computed display cells for P (=W+D+L), GD (=GF-GA), Pts (=W*3+D).
- "Save group" button → calls `adminSaveGroupStandingsFn`, toasts success, invalidates the `groups` query.

## Files

- New migration (tables, RLS, GRANTs, trigger, seed data)
- New `src/lib/groups.functions.ts`
- New `src/routes/_authenticated/grupos.tsx`
- Edit `src/components/AppShell.tsx` (nav entry + icon)
- Edit `src/routes/_authenticated/admin.tsx` (admin section)
- `src/integrations/supabase/types.ts` regenerates after migration
