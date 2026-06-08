
CREATE OR REPLACE FUNCTION public.score_match(_match_id int, _caller_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m RECORD;
  p RECORD;
  pts INT;
  tally JSONB;
  share NUMERIC;
  total_preds INT;
  scored_count INT := 0;
BEGIN
  IF NOT public.has_role(_caller_id, 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO m FROM public.matches WHERE id = _match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;
  IF m.status <> 'completed' OR m.is_final <> true THEN
    RAISE EXCEPTION 'Match is not yet complete';
  END IF;

  SELECT COUNT(*) INTO total_preds FROM public.predictions WHERE match_id = m.id;
  SELECT COALESCE(jsonb_object_agg(key, c), '{}'::jsonb) INTO tally FROM (
    SELECT (home_goals || '-' || away_goals) AS key, COUNT(*)::int AS c
    FROM public.predictions WHERE match_id = m.id GROUP BY 1
  ) t;

  FOR p IN SELECT * FROM public.predictions WHERE match_id = m.id LOOP
    pts := 0;
    IF (p.home_goals = m.home_score AND p.away_goals = m.away_score)
       OR (SIGN(p.home_goals - p.away_goals) = SIGN(COALESCE(m.home_score,0) - COALESCE(m.away_score,0))) THEN
      pts := pts + 3;
    END IF;
    IF p.home_goals = m.home_score THEN pts := pts + 2; END IF;
    IF p.away_goals = m.away_score THEN pts := pts + 2; END IF;
    IF (p.home_goals - p.away_goals) = (COALESCE(m.home_score,0) - COALESCE(m.away_score,0)) THEN pts := pts + 3; END IF;
    IF p.first_scorer IS NOT NULL AND p.first_scorer = m.first_scorer THEN pts := pts + 3; END IF;
    IF p.booster THEN pts := pts * 2; END IF;
    IF p.home_goals = m.home_score AND p.away_goals = m.away_score AND total_preds > 0 THEN
      share := COALESCE((tally->>(p.home_goals || '-' || p.away_goals))::numeric, 0) / total_preds;
      IF share < 0.1 THEN pts := pts + 5; END IF;
    END IF;
    UPDATE public.predictions SET points = pts WHERE id = p.id;
    scored_count := scored_count + 1;
  END LOOP;

  -- Recalculate matchday_scores for the affected matchday (totals + rank).
  WITH totals AS (
    SELECT pr.user_id, COALESCE(SUM(pr.points),0)::int AS total_points
    FROM public.predictions pr
    JOIN public.matches mm ON mm.id = pr.match_id
    WHERE mm.matchday_id = m.matchday_id
    GROUP BY pr.user_id
  ),
  ranked AS (
    SELECT user_id, total_points,
           DENSE_RANK() OVER (ORDER BY total_points DESC)::int AS rnk
    FROM totals
  )
  INSERT INTO public.matchday_scores (user_id, matchday_id, total_points, rank)
  SELECT user_id, m.matchday_id, total_points, rnk FROM ranked
  ON CONFLICT (user_id, matchday_id) DO UPDATE
    SET total_points = EXCLUDED.total_points,
        rank = EXCLUDED.rank,
        updated_at = now();

  RETURN scored_count;
END;
$$;
