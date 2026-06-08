Add `is_test` matchday exclusion to three tests in `src/lib/admin-tests.functions.ts`. Pure additive filter — no other logic changes.

## 1. `testMatchCount` (lines 34–50)

Fetch `is_test = true` matchday ids, then add `.not("matchday_id", "in", "(...)")` to the existing query (guard against empty list to avoid a malformed `()` filter). Expected count stays 104.

## 2. `testGroupStageConfirmed` (lines 93–110)

Same pattern: load test matchday ids and add `.not("matchday_id", "in", "(...)")` plus `.neq("home_team", "__test")` to the existing `phase = 'Group stage' AND teams_confirmed = true` count. Expected count stays 72.

## 3. `testKickoffRange` (lines 112–130)

Same pattern: load test matchday ids, add `.not("matchday_id", "in", "(...)")` and `.neq("home_team", "__test")` to the select before applying the June 11 – July 20 2026 window check.

## Shared detail

In all three, build the exclusion list with:
```ts
const { data: testMdIds } = await supabaseAdmin
  .from("matchdays").select("id").eq("is_test", true);
const excludeIds = (testMdIds ?? []).map((m) => m.id);
```
and only chain `.not("matchday_id", "in", ...)` when `excludeIds.length > 0` (PostgREST rejects an empty `()`).

No other tests, no DB changes, no UI changes.
