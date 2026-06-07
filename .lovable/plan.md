## Fix "Run scoring" admin RPC error

**Root cause:** `score_matchday` checks `public.has_role(auth.uid(), 'admin')`, but `auth.uid()` is null when the function is invoked via Supabase RPC from a server function, so the admin check throws `Forbidden`.

### 1. Database migration — update `score_matchday`

Replace the function with a new signature that takes the caller id as a parameter:

- Old: `score_matchday(_matchday_id int)`
- New: `score_matchday(_matchday_id int, _caller_id uuid)`

Change only the admin guard:

```sql
IF NOT public.has_role(_caller_id, 'admin') THEN
  RAISE EXCEPTION 'Forbidden';
END IF;
```

All other scoring logic stays exactly as-is. Also `DROP FUNCTION public.score_matchday(int)` so the old signature is gone and PostgREST exposes only the new one.

### 2. Update `adminScoreMatchdayFn` in `src/lib/game.functions.ts`

Pass `userId` from the `requireSupabaseAuth` middleware context:

```ts
const { data: count, error } = await supabase.rpc("score_matchday", {
  _matchday_id: data.matchday_id,
  _caller_id: userId,
});
```

### 3. Other admin RPCs

Audited `.rpc(...)` calls in `src/lib/game.functions.ts`:

- `find_league_by_code`, `matchday_leaderboard`, `global_leaderboard`, `my_leagues` — none use `auth.uid()` for an admin check (leaderboards/my_leagues use `auth.uid()` only for per-user scoping, which is the correct behavior; they're not admin-gated).
- Only `score_matchday` needs the fix.

### 4. Verify

1. Open `/admin`, enter a result for a match, click "Run scoring".
2. Confirm success toast.
3. Leaderboard reflects new points.

### Files

- New migration (drop old signature + recreate with `_caller_id`).
- `src/lib/game.functions.ts` (`adminScoreMatchdayFn` RPC call).
