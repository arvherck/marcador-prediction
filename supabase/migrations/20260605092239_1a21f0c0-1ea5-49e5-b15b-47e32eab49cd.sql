
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS current_streak int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS longest_streak int NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.score_matchday(_matchday_id integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  m RECORD; p RECORD; pts INT; tally JSONB; share NUMERIC; total_preds INT; users_count INT;
  was_scored BOOLEAN;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT is_scored INTO was_scored FROM public.matchdays WHERE id = _matchday_id;

  FOR m IN SELECT * FROM public.matches WHERE matchday_id = _matchday_id AND is_final = true LOOP
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
    END LOOP;
  END LOOP;

  WITH totals AS (
    SELECT p.user_id, COALESCE(SUM(p.points),0)::int AS total_points
    FROM public.predictions p
    JOIN public.matches mm ON mm.id = p.match_id
    WHERE mm.matchday_id = _matchday_id
    GROUP BY p.user_id
  ),
  ranked AS (
    SELECT user_id, total_points,
           DENSE_RANK() OVER (ORDER BY total_points DESC)::int AS rnk
    FROM totals
  )
  INSERT INTO public.matchday_scores (user_id, matchday_id, total_points, rank)
  SELECT user_id, _matchday_id, total_points, rnk FROM ranked
  ON CONFLICT (user_id, matchday_id) DO UPDATE
    SET total_points = EXCLUDED.total_points, rank = EXCLUDED.rank, updated_at = now();

  IF NOT was_scored THEN
    UPDATE public.profiles pf
    SET current_streak = CASE WHEN EXISTS (
          SELECT 1 FROM public.predictions pr
          JOIN public.matches mm ON mm.id = pr.match_id
          WHERE mm.matchday_id = _matchday_id AND pr.user_id = pf.user_id
        ) THEN pf.current_streak + 1 ELSE 0 END,
        longest_streak = CASE WHEN EXISTS (
          SELECT 1 FROM public.predictions pr
          JOIN public.matches mm ON mm.id = pr.match_id
          WHERE mm.matchday_id = _matchday_id AND pr.user_id = pf.user_id
        ) THEN GREATEST(pf.longest_streak, pf.current_streak + 1) ELSE pf.longest_streak END,
        updated_at = now();
  END IF;

  SELECT COUNT(DISTINCT p.user_id) INTO users_count
  FROM public.predictions p JOIN public.matches mm ON mm.id = p.match_id
  WHERE mm.matchday_id = _matchday_id;

  UPDATE public.matchdays SET is_scored = true WHERE id = _matchday_id;
  RETURN users_count;
END $function$;

DROP FUNCTION IF EXISTS public.global_leaderboard(uuid);

CREATE FUNCTION public.global_leaderboard(_league_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, display_name text, country text, favourite_team text, total_points integer, scored_predictions integer, last_md_points integer, current_streak integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE last_md INT;
BEGIN
  SELECT m.id INTO last_md FROM public.matchdays m WHERE m.is_scored = true ORDER BY m.starts_at DESC LIMIT 1;
  RETURN QUERY
  SELECT p.user_id, p.display_name, p.country, p.favourite_team,
         (COALESCE(SUM(pr.points),0)
          + COALESCE((SELECT tp.points_awarded FROM public.tournament_predictions tp WHERE tp.user_id = p.user_id), 0)
         )::int,
         COUNT(pr.id) FILTER (WHERE pr.points IS NOT NULL)::int,
         COALESCE((SELECT ms.total_points FROM public.matchday_scores ms WHERE ms.user_id = p.user_id AND ms.matchday_id = last_md), 0)::int,
         p.current_streak::int
  FROM public.profiles p
  LEFT JOIN public.predictions pr ON pr.user_id = p.user_id
  WHERE _league_id IS NULL
    OR EXISTS (SELECT 1 FROM public.league_members lm WHERE lm.user_id = p.user_id AND lm.league_id = _league_id)
  GROUP BY p.user_id, p.display_name, p.country, p.favourite_team, p.current_streak
  ORDER BY 5 DESC, p.display_name ASC
  LIMIT 200;
END $function$;
