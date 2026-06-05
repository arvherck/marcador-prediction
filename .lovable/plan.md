## Root cause

Empty black boxes aren't (only) an RLS problem. The Play screen calls `getCurrentMatchday`, the Leaderboard calls `getLeaderboard` / `getMatchdayLeaderboard` — **every one of those server functions is `.middleware([requireSupabaseAuth])`**. A guest has no Supabase session, so the bearer attacher sends no `Authorization` header, the middleware throws `Unauthorized`, the query returns no data, and the cards render with no content.

Adding `anon` RLS policies alone won't fix it — the request never reaches the database.

## Fix

Two parts: (a) make the read paths work for guests at the server-fn layer, (b) add the anon-readable RLS policies the user requested as defense-in-depth and so a future direct-from-browser read would also work.

### 1. Public read server functions (no auth middleware)

In `src/lib/game.functions.ts`, add three new public server fns that import `supabaseAdmin` inside the handler (per the TanStack Supabase rules — server-only import lives inside `.handler()`):

- `getCurrentMatchdayPublic()` — same query shape as `getCurrentMatchday`, but **omits predictions** entirely (every match's `prediction` is `null`, `locked` still computed from kickoff). No `requireSupabaseAuth`.
- `getLeaderboardPublic({ league_id? })` — calls the existing `global_leaderboard` RPC via `supabaseAdmin`. League scoping stays available but unused for guests.
- `getMatchdayLeaderboardPublic({ matchday_id?, league_id? })` — same for `matchday_leaderboard` RPC.

These use `supabaseAdmin` (service role) but only project the same safe columns the authenticated versions already return. They are pure reads. No writes are exposed publicly.

### 2. Route guest queries through the public fns

- `src/routes/_authenticated/play.tsx`: switch the `useQuery` `queryFn` to `guest ? getCurrentMatchdayPublic() : getCurrentMatchday()`. Existing guest-gated submit/booster buttons already block writes via `guestGate.require(...)`, so no write-path change is needed.
- `src/routes/_authenticated/leaderboard.tsx`: same swap for `getLeaderboard` and `getMatchdayLeaderboard`. The "My leagues" tab is already hidden when `guest` is true, so `getMyLeagues` stays auth-only.

### 3. Database — anon RLS policies (defense-in-depth, as requested)

One migration via the migration tool:

- `matchdays`: `CREATE POLICY "matchdays readable to anon" ON public.matchdays FOR SELECT TO anon USING (true);` plus `GRANT SELECT ON public.matchdays TO anon;`
- `matches`: `CREATE POLICY "matches readable to anon" ON public.matches FOR SELECT TO anon USING (true);` plus `GRANT SELECT ON public.matches TO anon;`
- `matchday_scores`: `CREATE POLICY "matchday_scores readable to anon" ON public.matchday_scores FOR SELECT TO anon USING (true);` plus `GRANT SELECT ON public.matchday_scores TO anon;`
- `profiles`: **do not** expose the base table to `anon` (it has `favourite_team`, which the user excluded). Instead create a `security_invoker` view `public.public_profiles` exposing only `user_id, display_name, country`, grant `SELECT` to `anon` and `authenticated` on the view. No new policy on `profiles` itself. The leaderboard RPCs are `SECURITY DEFINER` and keep working unchanged.

No write policies, no insert/update/delete grants for `anon` — guests stay read-only at the DB layer too.

### 4. Untouched

- `src/routes/_authenticated.tsx` guest sessionStorage flow — unchanged.
- All write/mutation server fns (`savePredictionFn`, `setBoosterFn`, `createLeagueFn`, etc.) keep `requireSupabaseAuth` — guests still get prompted to sign up when they hit a write.
- `meFn`, `completeOnboardingFn`, admin fns — unchanged.

## Verification

1. Sign out, click "Continue as guest", open `/play` — 6 match cards render with team names, flags, kickoff times, and zeroed steppers; the bottom CTA shows "Sign up to predict".
2. Try to tap booster or change a score and submit — the existing `guestGate` modal still appears.
3. Open `/leaderboard` as a guest — Overall and Matchday tabs populate from the public RPCs; "My leagues" tab is absent.
4. Sign in normally — Play screen still shows the user's saved predictions and the submit bar (authenticated path unchanged).
