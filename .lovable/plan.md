## Ligas — Spanish-branded leagues hub

Rename and rebuild the existing Leagues area as "Ligas", with code-format enforcement, share links, league ranks, and a 3-league creation cap.

### Server (`src/lib/game.functions.ts`)

- **Invite code format `MRC-XXXX`**: change `genCode()` to return `"MRC-"` + 4 chars from the 32-char unambiguous alphabet. Keep collision retry.
- **`createLeagueFn`**: before insert, count leagues where `owner_id = me.id`. If `>= 3`, throw `"You've reached the 3-league creation limit."`.
- **`joinLeagueFn`**: normalize input by uppercasing and trimming, and accept either `MRC-XXXX` or bare `XXXX` (auto-prefix). Keep the existing UNIQUE constraint behavior.
- **`getMyLeagues`** (extend): also return `my_rank` and `my_points` per league, computed from `matchday_scores` aggregated per league member (dense rank desc by total). Shape: `{ id, name, invite_code, owner_id, member_count, my_points, my_rank }`. `my_rank` is `null` if user has no scored predictions yet.

### Route `src/routes/_authenticated/leagues.tsx` — "Ligas"

- H1 "Ligas", tagline in Spanish-flavored copy.
- Two cards at top: **Crear liga** (name input + Create button, disabled with hint when at the 3-league cap) and **Unirse con código** (code input pre-formatted with the `MRC-` prefix visible).
- **My leagues list**: each row shows league name, member count, invite code chip (monospace), a "Copiar enlace" button that copies `${window.location.origin}/leagues/join?code=MRC-XXXX` to clipboard (toast confirmation), and a right-aligned rank badge ("#3 of 12 · 42 pts" or "Sin puntos aún").
- 3-league cap: read `getMyLeagues().filter(l => l.owner_id === me.id).length` and disable the Create button when `>= 3`, with a hint line.

### New route `src/routes/_authenticated/leagues.join.tsx`

- `validateSearch` with zod: `{ code: z.string().regex(/^MRC-[A-Z0-9]{4}$/).optional() }`.
- On mount, if `code` is present and user is authenticated, show a confirmation card ("Unirse a la liga con código MRC-XXXX") with a Join button that calls `joinLeagueFn`. On success, navigate to `/leagues/$id`.
- If no code, redirect to `/leagues`.

### Nav (`src/components/AppShell.tsx`)

- Rename the `/leagues` tab label from "Leagues" to "Ligas" (desktop nav + mobile bottom bar). Keep the route path `/leagues` so existing share links still work.

### Notes

- No DB migration needed — `invite_code` is already `text UNIQUE`, fits `MRC-XXXX`.
- `getMyLeagues` already scopes to the current user, so adding `my_rank`/`my_points` is a single SQL join with a `RANK() OVER (PARTITION BY league_id ORDER BY ...)` subquery.
- League detail page (`/leagues/$id`) is out of scope for this task and left unchanged.
