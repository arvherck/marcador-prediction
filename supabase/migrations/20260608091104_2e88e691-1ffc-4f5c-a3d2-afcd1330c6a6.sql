
-- Registry of fake test users created via the admin Multi-user simulation tool
CREATE TABLE public.test_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, DELETE ON public.test_users TO authenticated;
GRANT ALL ON public.test_users TO service_role;

ALTER TABLE public.test_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage test users"
  ON public.test_users
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Create varied predictions for one test user in a given matchday.
-- ~20% chance per prediction (when match already has a real score) to copy
-- the actual scoreline so some users score points after scoring runs.
CREATE OR REPLACE FUNCTION public.create_test_user_predictions(
  _caller_id uuid,
  _user_id uuid,
  _matchday_id int
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r RECORD;
  s RECORD;
  use_real boolean;
  created int := 0;
  pick_id uuid;
BEGIN
  IF NOT public.has_role(_caller_id, 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  FOR r IN
    SELECT id, home_score, away_score, first_scorer
      FROM public.matches
     WHERE matchday_id = _matchday_id
       AND teams_confirmed = true
       AND NOT EXISTS (
         SELECT 1 FROM public.predictions p
          WHERE p.match_id = matches.id AND p.user_id = _user_id
       )
  LOOP
    use_real := (r.home_score IS NOT NULL AND random() < 0.20);
    IF use_real THEN
      INSERT INTO public.predictions(user_id, match_id, home_goals, away_goals, first_scorer, booster)
      VALUES (_user_id, r.id, r.home_score, r.away_score,
              COALESCE(r.first_scorer, 'none'), false);
    ELSE
      SELECT * INTO s FROM public._random_test_scoreline();
      INSERT INTO public.predictions(user_id, match_id, home_goals, away_goals, first_scorer, booster)
      VALUES (_user_id, r.id, s.home_goals, s.away_goals, s.first_scorer, false);
    END IF;
    created := created + 1;
  END LOOP;

  -- Pick one random prediction in this matchday as the booster
  SELECT p.id INTO pick_id
    FROM public.predictions p
    JOIN public.matches m ON m.id = p.match_id
   WHERE p.user_id = _user_id AND m.matchday_id = _matchday_id
   ORDER BY random() LIMIT 1;
  IF pick_id IS NOT NULL THEN
    UPDATE public.predictions SET booster = true WHERE id = pick_id;
  END IF;

  INSERT INTO public.api_sync_log(action, description, actor_id, meta)
  VALUES ('test_data',
          'create_test_user_predictions user=' || _user_id::text || ' md=' || _matchday_id,
          _caller_id,
          jsonb_build_object('user_id', _user_id, 'matchday_id', _matchday_id, 'count', created));

  RETURN created;
END;
$$;

-- Remove all game data tied to every test_users row.
-- Returns the user_ids that were registered (the server fn deletes
-- their auth.users rows separately via the admin API).
CREATE OR REPLACE FUNCTION public.delete_test_users(_caller_id uuid)
RETURNS TABLE(user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  ids uuid[];
  cnt int;
BEGIN
  IF NOT public.has_role(_caller_id, 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT ARRAY_AGG(t.user_id) INTO ids FROM public.test_users t;
  IF ids IS NULL THEN
    RETURN;
  END IF;
  cnt := array_length(ids, 1);

  DELETE FROM public.predictions     WHERE predictions.user_id     = ANY(ids);
  DELETE FROM public.matchday_scores WHERE matchday_scores.user_id = ANY(ids);
  DELETE FROM public.league_members  WHERE league_members.user_id  = ANY(ids);
  DELETE FROM public.profiles        WHERE profiles.user_id        = ANY(ids);
  DELETE FROM public.test_users      WHERE test_users.user_id      = ANY(ids);

  INSERT INTO public.api_sync_log(action, description, actor_id, meta)
  VALUES ('test_data',
          'delete_test_users (' || cnt || ' users)',
          _caller_id,
          jsonb_build_object('count', cnt));

  RETURN QUERY SELECT unnest(ids);
END;
$$;

CREATE OR REPLACE FUNCTION public.add_test_users_to_league(
  _caller_id uuid,
  _league_id uuid
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  added int;
BEGIN
  IF NOT public.has_role(_caller_id, 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  WITH ins AS (
    INSERT INTO public.league_members(league_id, user_id)
    SELECT _league_id, t.user_id FROM public.test_users t
    ON CONFLICT (league_id, user_id) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO added FROM ins;

  INSERT INTO public.api_sync_log(action, description, actor_id, meta)
  VALUES ('test_data',
          'add_test_users_to_league (' || added || ' added)',
          _caller_id,
          jsonb_build_object('league_id', _league_id, 'added', added));

  RETURN added;
END;
$$;
