## Panel de Control — email-allowlisted admin

### Allowlist

Add `src/lib/admin.ts` with `ADMIN_EMAILS = ["gandalftheswole76@gmail.com"]` and `isAdminEmail(email)`. In `loadCurrentUser` (`src/lib/auth.server.ts`), override `is_admin` to `true` whenever the user's email is in this list, so the existing `is_admin` flag drives every gate (nav link, route gate, server fns).

### Rebuild `src/routes/_authenticated/admin.tsx` as "Panel de Control"

Replace the current admin page with a plain, functional layout titled **Panel de Control**. Drop the `makeMeAdminFn` claim flow — access is purely email-based now. If a non-admin lands here, show a short "No autorizado" message.

Four sections, each a `<details>` or stacked card:

1. **Añadir partido** — manual single-match form: matchday selector (existing matchdays from `adminListMatchdays`), home team, away team, kickoff datetime, phase (text input: "Fase de grupos", "Octavos", "Cuartos", "Semifinal", "Final"), and a "Es uno de los 6 partidos seleccionados" checkbox. New server fn `adminAddMatchFn`.
2. **Registrar resultado** — reuses the existing per-match result row (home/away score + first scorer) inside each matchday block.
3. **Calcular puntuación** — the existing "Score matchday" button per matchday (calls `adminScoreMatchdayFn`, which we already wired up with underdog bonus + matchday_scores).
4. **Predicciones por jornada** — read-only table. Select a matchday → call new `adminListPredictionsFn` → render a table with columns: Usuario · Partido · Predicción · Resultado real · Booster · Puntos.

### Server (`src/lib/game.functions.ts`)

- **DB schema additions** via migration: add `phase TEXT` and `is_selected BOOLEAN DEFAULT false` to `matches`. (Both nullable / defaulted so existing rows stay valid.)
- **`adminAddMatchFn`** — admin-only; inserts a single match with phase + is_selected. Zod-validated.
- **`adminListPredictionsFn`** — admin-only; takes `matchday_id`, returns rows joining `predictions` + `matches` + `profiles` ordered by match kickoff then user display name.
- Update `adminListMatchdays` SELECT so the returned matches include the new `phase` and `is_selected` columns (already uses `SELECT *`, so no change needed beyond the migration).

### Nav

`AppShell` already conditionally renders the Admin tab when `me.is_admin` is true — no change needed; the email override flips that flag automatically. Rename the tab label from "Admin" to "Panel" for the new branding.

### Technical notes

- No new dependencies. `<table>` markup with `divide-y` is enough for the predictions view.
- The email override in `loadCurrentUser` is non-destructive: it only flips `is_admin` to true on read, it doesn't modify the DB. If you want it persisted, that's a follow-up.
- Out of scope: bulk match import, editing/deleting matches, league moderation.
