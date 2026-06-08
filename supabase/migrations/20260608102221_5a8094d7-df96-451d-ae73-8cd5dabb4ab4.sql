
ALTER TABLE public.predictions ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.predictions DROP CONSTRAINT IF EXISTS predictions_user_id_fkey;
ALTER TABLE public.predictions
  ADD CONSTRAINT predictions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.delete_my_account(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  l RECORD;
  new_owner uuid;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id required';
  END IF;

  -- 1. Anonymise predictions (preserve underdog stats)
  UPDATE public.predictions SET user_id = NULL WHERE user_id = _user_id;

  -- 2. Drop matchday scores
  DELETE FROM public.matchday_scores WHERE user_id = _user_id;

  -- 3. Transfer / delete owned leagues
  FOR l IN SELECT id FROM public.leagues WHERE owner_id = _user_id LOOP
    SELECT lm.user_id INTO new_owner
      FROM public.league_members lm
     WHERE lm.league_id = l.id AND lm.user_id <> _user_id
     ORDER BY lm.joined_at ASC NULLS LAST
     LIMIT 1;
    IF new_owner IS NULL THEN
      DELETE FROM public.leagues WHERE id = l.id;
    ELSE
      UPDATE public.leagues SET owner_id = new_owner WHERE id = l.id;
    END IF;
  END LOOP;

  -- 4. League memberships
  DELETE FROM public.league_members WHERE user_id = _user_id;

  -- 5. Tournament winner pick
  DELETE FROM public.tournament_predictions WHERE user_id = _user_id;

  -- 6. Feedback (explicit per spec)
  DELETE FROM public.feedback WHERE user_id = _user_id;

  -- 7. User roles
  DELETE FROM public.user_roles WHERE user_id = _user_id;

  -- 8. Profile
  DELETE FROM public.profiles WHERE user_id = _user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_my_account(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_account(uuid) TO service_role;
