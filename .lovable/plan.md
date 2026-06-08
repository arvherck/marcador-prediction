## Root cause

The three "Scoring engine" tests and "Booster doubles points" all funnel through `scoreAndGetPoints()` in `src/lib/admin-tests.functions.ts`, which calls:

```ts
authedSupabase.rpc("score_matchday", { _matchday_id: mdId })
```

But the DB function signature is `score_matchday(_matchday_id INT, _caller_id UUID)` — it requires both args. PostgREST therefore rejects the call with `PGRST202 Could not find the function public.score_matchday(_matchday_id) in the schema cache` (confirmed in the dev-server log). The error is then re-thrown by `safeError`, surfacing as the generic "Something went wrong" for the booster test, and as the stale "duplicate key … matchdays_pkey" message that's still cached on the panel from earlier runs (will clear once tests stop throwing on the RPC).

The other game-logic tests (Predictions lock at kickoff, Standings trigger) don't touch `score_matchday`, which matches the screenshot (they're green).

## Fix

In `src/lib/admin-tests.functions.ts`, update `scoreAndGetPoints` to pass the caller id and call via the admin client (so we don't depend on the per-request auth client for an admin-gated RPC):

```ts
async function scoreAndGetPoints(mdId, userId, matchId) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.rpc("score_matchday", {
    _matchday_id: mdId,
    _caller_id: userId,
  });
  if (error) throw new Error(error.message);
  const { data, error: qErr } = await supabaseAdmin
    .from("predictions")
    .select("points")
    .eq("user_id", userId)
    .eq("match_id", matchId)
    .maybeSingle();
  if (qErr) throw new Error(qErr.message);
  return data?.points ?? 0;
}
```

Drop the now-unused `authedSupabase` parameter at the four call sites in `testScoringExact`, `testScoringCorrectResult`, `testScoringWrongResult`, and `testBoosterDoubles`.

## Verify

Re-run the Game Logic block in the Admin → Tests panel. Expect all six tests green (exact 13 pts, correct-result 6 pts, wrong-result 0 pts, booster doubles, lock, standings trigger).

## Out of scope

No DB migration, no signature change to `score_matchday`, no edits to other tests.