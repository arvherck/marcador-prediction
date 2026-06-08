CREATE OR REPLACE FUNCTION public.fill_test_predictions(_caller_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  s RECORD;
  created int := 0;
  md_id int;
  pick_id integer;
BEGIN
  IF NOT public.has_role(_caller_id, 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  FOR r IN
    SELECT m.id, m.matchday_id
      FROM public.matches m
     WHERE m.teams_confirmed = true
       AND m.status IN ('upcoming','completed')
       AND NOT EXISTS (
         SELECT 1 FROM public.predictions p
          WHERE p.match_id = m.id AND p.user_id = _caller_id
       )
  LOOP
    SELECT * INTO s FROM public._random_test_scoreline();
    INSERT INTO public.predictions(user_id, match_id, home_goals, away_goals, first_scorer, booster)
    VALUES (_caller_id, r.id, s.home_goals, s.away_goals, s.first_scorer, false);
    created := created + 1;
  END LOOP;

  FOR md_id IN
    SELECT DISTINCT m.matchday_id
      FROM public.predictions p
      JOIN public.matches m ON m.id = p.match_id
     WHERE p.user_id = _caller_id
  LOOP
    SELECT p.id INTO pick_id
      FROM public.predictions p
      JOIN public.matches m ON m.id = p.match_id
     WHERE p.user_id = _caller_id AND m.matchday_id = md_id
     ORDER BY random() LIMIT 1;
    IF pick_id IS NOT NULL THEN
      UPDATE public.predictions SET booster = false
       WHERE user_id = _caller_id
         AND match_id IN (SELECT id FROM public.matches WHERE matchday_id = md_id)
         AND booster = true;
      UPDATE public.predictions SET booster = true WHERE id = pick_id;
    END IF;
  END LOOP;

  INSERT INTO public.api_sync_log(action, description, actor_id, meta)
  VALUES ('test_data',
          'fill_test_predictions (' || created || ' created)',
          _caller_id,
          jsonb_build_object('count', created));

  RETURN jsonb_build_object('created', created);
END;
$function$;