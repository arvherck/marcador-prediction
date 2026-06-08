## Problem

Multi-user simulation throws "Something went wrong" after creating each test user.

Worker logs show repeated Postgres errors from the RPC `create_test_user_predictions`:

```
22P02 invalid input syntax for type uuid: "187"
22P02 invalid input syntax for type uuid: "433"
```

The numbers are sequential `public.predictions.id` values.

## Root cause

In `public.create_test_user_predictions(uuid, uuid, integer)` the booster-pick block declares the variable as `uuid` but `predictions.id` is an `integer`:

```sql
DECLARE
  pick_id uuid;          -- ← wrong type
BEGIN
  ...
  SELECT p.id INTO pick_id
    FROM public.predictions p
    JOIN public.matches m ON m.id = p.match_id
   WHERE p.user_id = _user_id AND m.matchday_id = _matchday_id
   ORDER BY random() LIMIT 1;
  IF pick_id IS NOT NULL THEN
    UPDATE public.predictions SET booster = true WHERE id = pick_id;
  END IF;
```

Assigning the integer prediction id into a `uuid` variable raises `22P02`, the RPC aborts, and the server function rethrows via `safeError(..., "game")` → generic toast.

## Fix

Single migration to redefine the function with `pick_id integer` (no other changes to the function body or signature).

```sql
CREATE OR REPLACE FUNCTION public.create_test_user_predictions(
  _caller_id uuid, _user_id uuid, _matchday_id integer
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r RECORD;
  s RECORD;
  use_real boolean;
  created int := 0;
  pick_id integer;   -- fixed
BEGIN
  -- (existing body, unchanged)
END;
$$;
```

No client code changes; no schema changes; no other RPCs touched.

## Verification

After the migration:
1. Reload the Admin → Tests page.
2. Click "Create test users & predictions" with count = 5.
3. Expect success toast `5 test users created · N predictions added` and the leaderboard preview populated.
4. Confirm no new `22P02` errors in worker logs.