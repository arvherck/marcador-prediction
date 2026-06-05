# API-Football Integration for World Cup 2026

## Step 1 — Discovery call (first thing in build mode)

Run a single server-side `curl` to `https://v3.football.api-sports.io/leagues?search=world` with header `x-apisports-key: $API_FOOTBALL_KEY` to find:
- League `id` for "FIFA World Cup"
- Available `season` (likely `2026`)

(Note: the correct host is `v3.football.api-sports.io`, not `v3.football-api.com` as in the brief — will verify in the discovery call.)

Hardcode the discovered `LEAGUE_ID` and `SEASON` as constants in `src/lib/api-football.ts`. Record the call in `api_usage` (counts as 1).

## Step 2 — Database

Migration adding two tables (with GRANTs + RLS; admin-only writes via server functions using `supabaseAdmin`, so no anon/auth grants needed beyond admin read for the counter):

- `api_cache`: `cache_key text unique`, `data jsonb`, `fetched_at timestamptz`, `expires_at timestamptz`
- `api_usage`: `date date unique`, `calls_made int default 0`

RLS: SELECT for authenticated admins only (checked via `has_role`); all writes via service role.

## Step 3 — Server library `src/lib/api-football.server.ts`

Server-only module (`.server.ts` so it never bundles to client). Uses `supabaseAdmin` + `process.env.API_FOOTBALL_KEY`.

Core helper `cachedFetch(cacheKey, ttlSeconds, endpoint)`:
1. Read `api_cache` by key — if `expires_at > now()`, return `data`.
2. Check today's `api_usage.calls_made`:
   - `>= 100` → throw "Daily API limit reached"
   - `>= 90` → set a warning flag on the returned envelope
3. `fetch` the endpoint, increment counter (upsert), upsert cache row with `expires_at = now() + ttl`.
4. Return `{ data, cached: false, fetched_at, expires_at, warning? }`.

Exposed functions:
- `getFixtures()` — `/fixtures?league=ID&season=SEASON`, TTL 24h
- `getLiveFixtures()` — `/fixtures?live=all&league=ID`, TTL 3min; guard: first query local `matches` table — only call if a match `kickoff_at` is within `[now-3h, now+10min]`, otherwise return empty
- `getStandings()` — `/standings?league=ID&season=SEASON`, TTL 2h
- `getSquads()` — `/players/squads?team=...` looped over 48 WC teams; returns count of API calls used; if `count > 5`, throw unless `confirmed=true` parameter passed

Plus utility: `getApiUsageToday()` returning `{ calls_made, limit: 100 }`.

## Step 4 — Server functions `src/lib/api-football.functions.ts`

Admin-gated `createServerFn` wrappers (check `has_role('admin')` via `requireSupabaseAuth` context):
- `syncFixturesFn`, `syncStandingsFn`, `syncLiveScoresFn`, `syncSquadsFn(confirmed: boolean)`
- `getApiStatusFn` — returns counter + cache metadata (last fetched, expires) for each of the 4 endpoints

Each sync function calls the corresponding cached fetcher and returns `{ cached, fetched_at, expires_at, count, warning? }`.

## Step 5 — Admin Panel UI

Add an **API Sync** section at the top of `src/routes/_authenticated/admin.tsx`:

- Header: `API calls today: X / 100` with color states (green <90, amber 90–99, red 100)
- Four buttons in a grid card:
  - **Sync Fixtures** — shows "Cached · expires in 23h" etc.
  - **Sync Standings** — shows expiry
  - **Sync Live Scores** — disabled when no match is live/imminent (derived from local `matches`)
  - **Sync Squads** — opens confirm dialog if estimated calls > 5
- Each button uses `useMutation` → calls the server fn → toast on success/error → invalidates the status query
- Live status query polls every 30s

## Step 6 — Security & limits

- API key only read inside `.server.ts` handlers via `process.env.API_FOOTBALL_KEY`
- All buttons admin-gated server-side (server fn re-checks role; client also hides for non-admins)
- Hard block at 100 calls; warning toast at 90
- All endpoints write through `cachedFetch` — no direct API access

## Files

**New**
- migration: `api_cache`, `api_usage` + RLS
- `src/lib/api-football.server.ts`
- `src/lib/api-football.functions.ts`
- `src/components/admin/ApiSyncPanel.tsx`

**Edited**
- `src/routes/_authenticated/admin.tsx` — mount `ApiSyncPanel` at top
- `src/integrations/supabase/types.ts` — regenerated after migration

## Open questions

1. After the discovery call, if **season 2026 is not yet in API-Football's data** (the WC is June 2026; the league row may exist with `season: 2026` already, or only friendlies/qualifiers may be present), should I fall back to the latest available season and surface a notice in admin, or fail loudly?
2. Sync Squads loops 48 teams = 48 calls — that's half the daily budget. Should the button instead sync **one group at a time** (4 teams = 4 calls), or keep the all-at-once flow behind a confirm?
3. Should successful syncs **also update local tables** (`matches.home_score/away_score/is_final` from fixtures, `wc_standings` from standings), or is this purely a read-through cache for now with manual admin entry continuing in parallel?
