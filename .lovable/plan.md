## Goal
Find and fix why `Join` shows "Invalid invite code." for `MRC-YRLL` even though the league exists and `find_league_by_code('MRC-YRLL')` returns its UUID at the DB level.

## What we know
- League `Skåntoret` exists with `invite_code = 'MRC-YRLL'`, owner `172e8216…` (Anthony). Diego (`47f2538c…`) is NOT yet a member.
- `find_league_by_code` is `SECURITY DEFINER`, granted `EXECUTE` to `authenticated`, and returns the UUID when called from psql.
- `league_members` RLS allows `INSERT` when `user_id = auth.uid()` — Diego is allowed to insert.
- The toast text "Invalid invite code." comes from exactly one place: `joinLeagueFn` line 584, thrown when `supabase.rpc('find_league_by_code', …)` returns a null/empty `data`. So the RPC is being called but returning nothing at runtime, or returning an unexpected shape that the handler treats as null.
- The latest network snapshot has no `POST /_serverFn/...` for the join attempt — the snapshot is older than the screenshot, so we don't yet have a confirmed server-side trace of the failing call.
- The captured session JWT belongs to Anthony, but the screenshot's header shows "Diego" — the session may have changed between snapshot and screenshot, so the failing request is most likely from Diego's session, not Anthony's.

## Likely causes (ranked)
1. **RPC return shape**: `supabase-js` `.rpc()` on a SQL scalar function occasionally returns `data` wrapped (e.g. `[{ find_league_by_code: '…' }]` or an empty array) instead of the scalar UUID we assume. If `data` is `[]` or an object, `if (!leagueId)` is false-ish only when it's `null`/`""`/`0`/`undefined`, but `leagueId as string` would still be wrong; however an empty array is truthy, so this alone wouldn't trigger the toast. Need a server log to confirm.
2. **Input drift**: the client sends `{ invite_code: 'MRC-YRLL' }` and the Zod transform re-uppercases + re-prefixes — confirmed safe for `YRLL`. Could still be wrong for an unexpected character (e.g. an em-dash `—` typed via autocorrect on macOS). The input field strips non `[A-Z0-9]`, so this should be safe, but worth logging the exact `data.invite_code` server-side.
3. **Auth/role mismatch**: if Diego's session token is expired/invalid by the time the RPC runs, PostgREST silently downgrades to `anon`, which has no `EXECUTE` on the function → returns `{ data: null, error: 42501 }`. Our handler throws `Invalid invite code.` only when `!leagueId` AND `!rpcErr`; a 42501 should hit the `rpcErr` branch. But the safeError wrapping might be wrong here too. Need the error object logged.

## Plan

1. **Add temporary server-side diagnostics** in `joinLeagueFn` (no behavior change):
   - `console.error('[joinLeague] input', data.invite_code, 'user', userId);`
   - `console.error('[joinLeague] rpc result', { leagueId, rpcErr });`
   This will surface in `stack_modern--server-function-logs` and tell us exactly which branch fired and what the RPC returned.

2. **Reproduce in the preview** with the actual Diego account:
   - Open `/leagues` while signed in as Diego.
   - Submit `YRLL`.
   - Capture the new `POST /_serverFn/…` request + server log line.

3. **Apply the fix based on what the logs show**, choosing one of:
   - **(A)** If `leagueId` is `null` but no `rpcErr`, the RPC didn't match — log the exact `data.invite_code` byte-by-byte; add `.trim().toUpperCase()` on the server even after Zod, and switch to a direct `from('leagues').select('id').eq('invite_code', code).maybeSingle()` fallback (still safe via SECURITY DEFINER if needed; otherwise add a permissive `SELECT` policy for `authenticated` keyed on `invite_code`).
   - **(B)** If `rpcErr` is `42501 permission denied`, the session is unauthenticated at PostgREST — verify `attachSupabaseAuth` is still wired in `src/start.ts` and that `requireSupabaseAuth` succeeded (it would have thrown earlier if not, so this would imply token propagation drift); fix by re-asserting the `Authorization` header on the per-request supabase client.
   - **(C)** If the RPC returns an unexpected shape (array/object), unwrap it explicitly: `const leagueId = Array.isArray(data) ? data[0]?.find_league_by_code : data;`.

4. **Remove the diagnostic `console.error` lines** once the root cause is fixed and verified by a second repro.

5. **Verify** end-to-end:
   - Diego joins `MRC-YRLL` → toast "Joined the league!", redirected/refresh shows Skåntoret in "Your leagues".
   - Anthony (already owner) joining `MRC-YRLL` is still a silent no-op (no error toast).
   - Joining a real-but-mistyped code (`MRC-XXXX`) still shows "Invalid invite code.".

## Out of scope
- Changing the invite-code format, RLS structure, or the share-link / pending-invite signup flow. Only the join path is touched.