## El Marcador — Leaderboard screen

Rebuild `src/routes/_authenticated/leaderboard.tsx` as a tabbed leaderboard titled **"El Marcador"** with three views, plus add the data plumbing on the server.

### Tabs

1. **Overall** — all users ranked by cumulative points across all matchdays. Columns: rank · display name + country flag · total points · "last MD" delta (points earned in the most recent scored matchday).
2. **This Matchday** — most recent scored matchday only. Ranked by `matchday_scores.total_points` for that matchday. Header shows the matchday name (e.g. "Matchday 3 — Group Stage").
3. **My Leagues** — dropdown listing leagues the user belongs to (from `getMyLeagues`). On selection, shows the Overall-style table filtered to that league's members. Empty state if user is in no leagues, with a link to `/leagues`.

### Shared row design

- Rank cell, with a `Trophy` icon (lucide) in `text-amber-glow` next to ranks 1–3.
- Display name + small `You` chip when `row.id === me.id`.
- Country flag rendered from `src/lib/teamFlags.ts` (reuse the existing map; fall back to country text if no flag).
- Right side: big tabular-nums total, with a smaller "+N last MD" muted line beneath it (Overall + My Leagues). For This Matchday, show just the matchday total.
- Logged-in user row gets `bg-primary/10 ring-1 ring-primary/30` so it stands out in amber.
- Empty/loading skeletons consistent with `play.tsx`.

### Server functions (add to `src/lib/game.functions.ts`)

- Extend `getLeaderboard` to also return `last_md_points` per user — join the most recent scored matchday's `matchday_scores` row. Keep the existing `league_id` filter; reuse for My Leagues.
- New `getMatchdayLeaderboard({ matchday_id?, league_id? })`: if `matchday_id` is omitted, resolve the latest `matchdays.is_scored = true` row. Returns `{ matchday: { id, name }, rows: [{ id, display_name, country, favourite_team, total_points, rank }] }` sourced from `matchday_scores` joined to `profiles` (+ optional `league_members` filter). Returns `{ matchday: null, rows: [] }` if nothing scored yet.

### Client

- Use shadcn `Tabs` for the three views (`overall` / `matchday` / `leagues`).
- `useQuery` per tab keyed on `["leaderboard", tab, leagueId?]`.
- My Leagues: shadcn `Select` populated from `getMyLeagues`; default to the first league; the table query is enabled only when a league is selected.
- Page `head()` title: `"El Marcador · Marcador"`; H1: `El Marcador`; subtitle: tournament tagline.

### Technical notes

- All new queries follow the existing `useQuery({ queryFn: () => fn({ data: {...} }) })` pattern already in this file — no loader changes needed.
- Country → flag lookup uses the same emoji map as team flags; add a tiny `countryFlags` helper (or extend `teamFlags.ts`) only if a country isn't already covered.
- No schema migrations required — `matchday_scores` already exists from the previous turn and is populated by `adminScoreMatchdayFn`.
