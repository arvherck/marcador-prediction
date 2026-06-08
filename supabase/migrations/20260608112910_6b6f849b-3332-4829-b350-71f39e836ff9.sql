CREATE OR REPLACE FUNCTION public.create_test_user_predictions(_caller_id uuid, _user_id uuid, _matchday_id integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  s RECORD;
  use_real boolean;
  created int := 0;
  pick_id integer;
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
$function$;