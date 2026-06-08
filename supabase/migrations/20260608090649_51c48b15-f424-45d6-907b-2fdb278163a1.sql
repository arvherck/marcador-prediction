
-- 1. api_sync_log table
CREATE TABLE IF NOT EXISTS public.api_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  description text,
  actor_id uuid,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.api_sync_log TO authenticated;
GRANT ALL ON public.api_sync_log TO service_role;
ALTER TABLE public.api_sync_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read api_sync_log" ON public.api_sync_log;
CREATE POLICY "admins read api_sync_log" ON public.api_sync_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2. Relax validate_prediction for admins (additive — does not change
-- behaviour for normal users, and the points-only update bypass remains
-- intact because the trigger is scoped to specific columns).
CREATE OR REPLACE FUNCTION public.validate_prediction()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  m_row public.matches%ROWTYPE;
BEGIN
  -- Admins (test data tools) can bypass the kickoff/status lock.
  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  SELECT * INTO m_row FROM public.matches WHERE id = NEW.match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;
  IF m_row.teams_confirmed = false THEN
    RAISE EXCEPTION 'Teams not confirmed for this match';
  END IF;
  IF m_row.kickoff_at <= now() OR m_row.status <> 'upcoming' THEN
    RAISE EXCEPTION 'Predictions are locked for this match';
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Helper: random scoreline (returns home,away,first_scorer)
CREATE OR REPLACE FUNCTION public._random_test_scoreline()
RETURNS TABLE(home_goals int, away_goals int, first_scorer text)
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  bucket numeric := random();
  low text[] := ARRAY['0-0','1-0','0-1','1-1','2-0','0-2','2-1','1-2'];
  mid text[] := ARRAY['2-2','3-1','1-3','3-0','0-3','3-2','2-3'];
  high text[] := ARRAY['4-0','0-4','4-1','1-4','4-2','3-3','5-1','5-2'];
  pool text[];
  pick text;
  parts text[];
  h int; a int; fs text;
BEGIN
  IF bucket < 0.60 THEN pool := low;
  ELSIF bucket < 0.90 THEN pool := mid;
  ELSE pool := high;
  END IF;
  pick := pool[1 + floor(random() * array_length(pool, 1))::int];
  parts := string_to_array(pick, '-');
  h := parts[1]::int; a := parts[2]::int;
  IF h > 0 AND a = 0 THEN fs := 'home';
  ELSIF a > 0 AND h = 0 THEN fs := 'away';
  ELSIF h = 0 AND a = 0 THEN fs := 'none';
  ELSE fs := CASE WHEN random() < 0.5 THEN 'home' ELSE 'away' END;
  END IF;
  RETURN QUERY SELECT h, a, fs;
END;
$$;

-- 4. fill_random_scores
CREATE OR REPLACE FUNCTION public.fill_random_scores(
  _caller_id uuid,
  _scope text,
  _matchday_id int DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_md int;
  r RECORD;
  s RECORD;
  filled jsonb := '[]'::jsonb;
  cnt int := 0;
BEGIN
  IF NOT public.has_role(_caller_id, 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF _scope = 'current' THEN
    SELECT MIN(matchday_id) INTO target_md
      FROM public.matches
      WHERE home_score IS NULL
        AND status <> 'completed'
        AND teams_confirmed = true;
  END IF;

  FOR r IN
    SELECT * FROM public.matches
    WHERE home_score IS NULL
      AND status <> 'completed'
      AND teams_confirmed = true
      AND (
        (_scope = 'current'    AND matchday_id = target_md) OR
        (_scope = 'all_groups' AND matchday_id BETWEEN 1 AND 3) OR
        (_scope = 'matchday'   AND matchday_id = _matchday_id)
      )
  LOOP
    SELECT * INTO s FROM public._random_test_scoreline();
    UPDATE public.matches
       SET home_score = s.home_goals,
           away_score = s.away_goals,
           first_scorer = s.first_scorer,
           is_final = true,
           status = 'completed'
     WHERE id = r.id;
    cnt := cnt + 1;
    filled := filled || jsonb_build_object(
      'id', r.id,
      'home_team', r.home_team,
      'away_team', r.away_team,
      'home_score', s.home_goals,
      'away_score', s.away_goals,
      'first_scorer', s.first_scorer
    );
  END LOOP;

  INSERT INTO public.api_sync_log(action, description, actor_id, meta)
  VALUES ('test_data',
          'fill_random_scores ' || _scope || ' (' || cnt || ' matches)',
          _caller_id,
          jsonb_build_object('scope', _scope, 'matchday_id', _matchday_id, 'count', cnt));

  RETURN jsonb_build_object('filled', cnt, 'matches', filled);
END;
$$;

-- 5. clear_test_scores
CREATE OR REPLACE FUNCTION public.clear_test_scores(
  _caller_id uuid,
  _scope text,
  _matchday_id int DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_md int;
  cleared int := 0;
  affected_mds int[];
BEGIN
  IF NOT public.has_role(_caller_id, 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF _scope = 'current' THEN
    SELECT MIN(matchday_id) INTO target_md
      FROM public.matches
      WHERE status = 'completed' AND home_score IS NOT NULL;
  END IF;

  WITH targets AS (
    SELECT id, matchday_id FROM public.matches
    WHERE (
        (_scope = 'current'    AND matchday_id = target_md) OR
        (_scope = 'all_groups' AND matchday_id BETWEEN 1 AND 3) OR
        (_scope = 'matchday'   AND matchday_id = _matchday_id)
      )
  ),
  pred_reset AS (
    UPDATE public.predictions p
       SET points = NULL
      FROM targets t
     WHERE p.match_id = t.id
    RETURNING 1
  ),
  match_reset AS (
    UPDATE public.matches m
       SET home_score = NULL,
           away_score = NULL,
           first_scorer = NULL,
           is_final = false,
           status = 'upcoming'
      FROM targets t
     WHERE m.id = t.id
    RETURNING m.matchday_id
  )
  SELECT COUNT(*)::int, ARRAY_AGG(DISTINCT matchday_id)
    INTO cleared, affected_mds
    FROM match_reset;

  -- Drop matchday_scores + reset is_scored when all matches in a matchday are cleared
  IF affected_mds IS NOT NULL THEN
    DELETE FROM public.matchday_scores
     WHERE matchday_id = ANY(affected_mds)
       AND NOT EXISTS (
         SELECT 1 FROM public.matches
          WHERE matchday_id = matchday_scores.matchday_id
            AND status = 'completed'
       );
    UPDATE public.matchdays
       SET is_scored = false
     WHERE id = ANY(affected_mds)
       AND NOT EXISTS (
         SELECT 1 FROM public.matches
          WHERE matchday_id = matchdays.id
            AND status = 'completed'
       );
  END IF;

  -- Reset all streak counters
  UPDATE public.profiles
     SET current_streak = 0,
         longest_streak = 0,
         updated_at = now()
   WHERE current_streak <> 0 OR longest_streak <> 0;

  INSERT INTO public.api_sync_log(action, description, actor_id, meta)
  VALUES ('test_data',
          'clear_test_scores ' || _scope || ' (' || cleared || ' matches)',
          _caller_id,
          jsonb_build_object('scope', _scope, 'matchday_id', _matchday_id, 'count', cleared));

  RETURN jsonb_build_object('cleared', cleared);
END;
$$;

-- 6. fill_test_predictions
CREATE OR REPLACE FUNCTION public.fill_test_predictions(_caller_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  s RECORD;
  created int := 0;
  md_id int;
  pick_id uuid;
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

  -- Pick a random booster per matchday for this user
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
$$;

-- 7. run_test_cycle
CREATE OR REPLACE FUNCTION public.run_test_cycle(_caller_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pred_result jsonb;
  fill_result jsonb;
  target_md int;
  users_scored int;
  matches_scored int;
  predictions_evaluated int;
  admin_points int := 0;
  admin_rank int;
BEGIN
  IF NOT public.has_role(_caller_id, 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- Step 1: only fill predictions if admin has none
  IF NOT EXISTS (SELECT 1 FROM public.predictions WHERE user_id = _caller_id) THEN
    pred_result := public.fill_test_predictions(_caller_id);
  ELSE
    pred_result := jsonb_build_object('created', 0);
  END IF;

  -- Step 2: fill random scores for current matchday
  fill_result := public.fill_random_scores(_caller_id, 'current', NULL);
  matches_scored := COALESCE((fill_result->>'filled')::int, 0);

  -- Step 3: determine the matchday and score it
  SELECT MIN(matchday_id) INTO target_md
    FROM public.matches
   WHERE status = 'completed' AND is_final = true
     AND matchday_id IN (
       SELECT DISTINCT (m->>'id')::int -- match id, not matchday
         FROM jsonb_array_elements(fill_result->'matches') m
     );
  IF target_md IS NULL THEN
    SELECT matchday_id INTO target_md FROM public.matches
     WHERE id = ((fill_result->'matches'->0)->>'id')::int;
  END IF;

  IF target_md IS NOT NULL THEN
    users_scored := public.score_matchday(target_md, _caller_id);
  END IF;

  -- Stats
  SELECT COUNT(*) INTO predictions_evaluated
    FROM public.predictions p
    JOIN public.matches m ON m.id = p.match_id
   WHERE m.matchday_id = target_md AND p.points IS NOT NULL;

  SELECT total_points, rank INTO admin_points, admin_rank
    FROM public.matchday_scores
   WHERE user_id = _caller_id AND matchday_id = target_md;

  INSERT INTO public.api_sync_log(action, description, actor_id, meta)
  VALUES ('test_data',
          'run_test_cycle matchday=' || COALESCE(target_md::text,'?'),
          _caller_id,
          jsonb_build_object('matchday_id', target_md,
                             'matches_scored', matches_scored,
                             'predictions_evaluated', predictions_evaluated));

  RETURN jsonb_build_object(
    'matchday_id', target_md,
    'matches_scored', matches_scored,
    'predictions_evaluated', predictions_evaluated,
    'admin_points', COALESCE(admin_points, 0),
    'admin_rank', admin_rank,
    'predictions_created', COALESCE((pred_result->>'created')::int, 0)
  );
END;
$$;
