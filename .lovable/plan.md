## Fix Ligas join flow

### 1. Database (migration)
Create a `SECURITY DEFINER` function so non-members can resolve an invite code to a league id without exposing other columns:

```sql
CREATE OR REPLACE FUNCTION public.find_league_by_code(_code text)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.leagues WHERE invite_code = _code LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.find_league_by_code(text) TO authenticated;
```

Leave the existing `leagues` SELECT policy untouched (members/owners only — keeps name/owner private).

### 2. `joinLeagueFn` (`src/lib/game.functions.ts`)
Replace the direct `from('leagues').select` lookup with `supabase.rpc('find_league_by_code', { _code: data.invite_code })`. If it returns null → "Invalid invite code." Then upsert into `league_members` as today.

### 3. Join input UX (`src/routes/_authenticated/leagues.tsx`)
- Keep the fixed `MRC-` prefix label.
- On change/paste: strip a leading `MRC-` (case-insensitive) from the user's input before storing, so the visible value is always the 4-char suffix.
- On submit: send `MRC-${code}` to `joinLeagueFn` (server validator also normalizes, but be explicit).

### 4. Invite link auto-join (`src/routes/_authenticated/leagues.join.tsx`)
The route already exists and pre-fills `code` from the URL. Add: on mount, if `code` is present, automatically call `joinLeagueFn` (no extra click) and navigate to `/leagues/$id` on success. Keep a Cancel button.

### 5. Unauthenticated invite handling
- `leagues.join.tsx` is under `_authenticated`, so unauth users are already redirected to `/auth`. Before redirect, the `_authenticated` guard should stash the intended URL.
  - Simpler approach: in `src/routes/_authenticated.tsx`, when redirecting to `/auth`, if `location.pathname === '/leagues/join'` save `location.href`'s `code` search param to `sessionStorage` under `marcador_pending_invite`.
- In `src/routes/auth.tsx` and `auth.callback.tsx`, after successful sign-in, if `sessionStorage.marcador_pending_invite` exists, clear it and navigate to `/leagues/join?code=MRC-XXXX` instead of `/play`.

### 6. Verify
After approval and migration: create a league as user A, copy invite link, open in user B's session → auto-joins and lands on the league page; both appear on the leaderboard.

### Files touched
- new migration (find_league_by_code function + grant)
- `src/lib/game.functions.ts` (joinLeagueFn rpc call)
- `src/routes/_authenticated/leagues.tsx` (paste-strip prefix)
- `src/routes/_authenticated/leagues.join.tsx` (auto-join on mount)
- `src/routes/_authenticated.tsx` (stash pending invite before redirect)
- `src/routes/auth.tsx` + `src/routes/auth.callback.tsx` (consume pending invite after login)
