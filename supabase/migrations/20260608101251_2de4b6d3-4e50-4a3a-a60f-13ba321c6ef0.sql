
-- 1) Columns + backfill
ALTER TABLE public.matchday_scores
  ADD COLUMN IF NOT EXISTS correct_results       int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exact_scores          int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS correct_first_scorers int NOT NULL DEFAULT 0;

WITH agg AS (
  SELECT pr.user_id, m.matchday_id,
    SUM(CASE WHEN m.is_final AND m.home_score IS NOT NULL AND m.away_score IS NOT NULL
              AND SIGN(pr.home_goals - pr.away_goals) = SIGN(m.home_score - m.away_score)
            THEN 1 ELSE 0 END)::int AS cr,
    SUM(CASE WHEN m.is_final AND pr.home_goals = m.home_score AND pr.away_goals = m.away_score
            THEN 1 ELSE 0 END)::int AS es,
    SUM(CASE WHEN m.is_final AND pr.first_scorer IS NOT NULL AND pr.first_scorer = m.first_scorer
            THEN 1 ELSE 0 END)::int AS fs
  FROM public.predictions pr
  JOIN public.matches m ON m.id = pr.match_id
  GROUP BY pr.user_id, m.matchday_id
)
UPDATE public.matchday_scores ms
SET correct_results = agg.cr,
    exact_scores = agg.es,
    correct_first_scorers = agg.fs
FROM agg
WHERE ms.user_id = agg.user_id AND ms.matchday_id = agg.matchday_id;

-- 2) score_matchday with tiebreakers
CREATE OR REPLACE FUNCTION public.score_matchday(_matchday_id integer, _caller_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  m RECORD; p RECORD; pts INT; tally JSONB; share NUMERIC; total_preds INT; users_count INT;
  was_scored BOOLEAN;
BEGIN
  IF NOT public.has_role(_caller_id, 'admin') THEN
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
      pts := pts * COALESCE(m.points_multiplier, 1);
      IF p.booster THEN pts := pts * 2; END IF;
      IF p.home_goals = m.home_score AND p.away_goals = m.away_score AND total_preds > 0 THEN
        share := COALESCE((tally->>(p.home_goals || '-' || p.away_goals))::numeric, 0) / total_preds;
        IF share < 0.1 THEN pts := pts + 5; END IF;
      END IF;
      UPDATE public.predictions SET points = pts WHERE id = p.id;
    END LOOP;
  END LOOP;

  WITH tb AS (
    SELECT pr.user_id,
      COALESCE(SUM(pr.points),0)::int AS total_points,
      SUM(CASE WHEN mm.is_final
                AND SIGN(pr.home_goals - pr.away_goals) = SIGN(COALESCE(mm.home_score,0) - COALESCE(mm.away_score,0))
              THEN 1 ELSE 0 END)::int AS cr,
      SUM(CASE WHEN mm.is_final AND pr.home_goals = mm.home_score AND pr.away_goals = mm.away_score
              THEN 1 ELSE 0 END)::int AS es,
      SUM(CASE WHEN mm.is_final AND pr.first_scorer IS NOT NULL AND pr.first_scorer = mm.first_scorer
              THEN 1 ELSE 0 END)::int AS fs
    FROM public.predictions pr
    JOIN public.matches mm ON mm.id = pr.match_id
    WHERE mm.matchday_id = _matchday_id
    GROUP BY pr.user_id
  ),
  ranked AS (
    SELECT user_id, total_points, cr, es, fs,
           DENSE_RANK() OVER (ORDER BY total_points DESC, cr DESC, es DESC, fs DESC)::int AS rnk
    FROM tb
  )
  INSERT INTO public.matchday_scores (user_id, matchday_id, total_points, rank, correct_results, exact_scores, correct_first_scorers)
  SELECT user_id, _matchday_id, total_points, rnk, cr, es, fs FROM ranked
  ON CONFLICT (user_id, matchday_id) DO UPDATE
    SET total_points = EXCLUDED.total_points,
        rank = EXCLUDED.rank,
        correct_results = EXCLUDED.correct_results,
        exact_scores = EXCLUDED.exact_scores,
        correct_first_scorers = EXCLUDED.correct_first_scorers,
        updated_at = now();

  IF NOT was_scored THEN
    UPDATE public.profiles pf
    SET current_streak = pf.current_streak + 1,
        longest_streak = GREATEST(pf.longest_streak, pf.current_streak + 1),
        updated_at = now()
    WHERE pf.user_id IN (
      SELECT DISTINCT pr.user_id
      FROM public.predictions pr
      JOIN public.matches mm ON mm.id = pr.match_id
      WHERE mm.matchday_id = _matchday_id
    );

    UPDATE public.profiles pf
    SET current_streak = 0,
        updated_at = now()
    WHERE pf.current_streak <> 0
      AND pf.user_id NOT IN (
        SELECT DISTINCT pr.user_id
        FROM public.predictions pr
        JOIN public.matches mm ON mm.id = pr.match_id
        WHERE mm.matchday_id = _matchday_id
      );
  END IF;

  SELECT COUNT(DISTINCT pr.user_id) INTO users_count
  FROM public.predictions pr JOIN public.matches mm ON mm.id = pr.match_id
  WHERE mm.matchday_id = _matchday_id;

  UPDATE public.matchdays SET is_scored = true WHERE id = _matchday_id;
  RETURN users_count;
END $function$;

-- 3) score_match with tiebreakers
CREATE OR REPLACE FUNCTION public.score_match(_match_id integer, _caller_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
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
    pts := pts * COALESCE(m.points_multiplier, 1);
    IF p.booster THEN pts := pts * 2; END IF;
    IF p.home_goals = m.home_score AND p.away_goals = m.away_score AND total_preds > 0 THEN
      share := COALESCE((tally->>(p.home_goals || '-' || p.away_goals))::numeric, 0) / total_preds;
      IF share < 0.1 THEN pts := pts + 5; END IF;
    END IF;
    UPDATE public.predictions SET points = pts WHERE id = p.id;
    scored_count := scored_count + 1;
  END LOOP;

  WITH tb AS (
    SELECT pr.user_id,
      COALESCE(SUM(pr.points),0)::int AS total_points,
      SUM(CASE WHEN mm.is_final
                AND SIGN(pr.home_goals - pr.away_goals) = SIGN(COALESCE(mm.home_score,0) - COALESCE(mm.away_score,0))
              THEN 1 ELSE 0 END)::int AS cr,
      SUM(CASE WHEN mm.is_final AND pr.home_goals = mm.home_score AND pr.away_goals = mm.away_score
              THEN 1 ELSE 0 END)::int AS es,
      SUM(CASE WHEN mm.is_final AND pr.first_scorer IS NOT NULL AND pr.first_scorer = mm.first_scorer
              THEN 1 ELSE 0 END)::int AS fs
    FROM public.predictions pr
    JOIN public.matches mm ON mm.id = pr.match_id
    WHERE mm.matchday_id = m.matchday_id
    GROUP BY pr.user_id
  ),
  ranked AS (
    SELECT user_id, total_points, cr, es, fs,
           DENSE_RANK() OVER (ORDER BY total_points DESC, cr DESC, es DESC, fs DESC)::int AS rnk
    FROM tb
  )
  INSERT INTO public.matchday_scores (user_id, matchday_id, total_points, rank, correct_results, exact_scores, correct_first_scorers)
  SELECT user_id, m.matchday_id, total_points, rnk, cr, es, fs FROM ranked
  ON CONFLICT (user_id, matchday_id) DO UPDATE
    SET total_points = EXCLUDED.total_points,
        rank = EXCLUDED.rank,
        correct_results = EXCLUDED.correct_results,
        exact_scores = EXCLUDED.exact_scores,
        correct_first_scorers = EXCLUDED.correct_first_scorers,
        updated_at = now();

  RETURN scored_count;
END;
$function$;

-- 4) matchday_leaderboard RPC
DROP FUNCTION IF EXISTS public.matchday_leaderboard(integer, uuid);
CREATE OR REPLACE FUNCTION public.matchday_leaderboard(_matchday_id integer DEFAULT NULL::integer, _league_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(matchday_id integer, matchday_name text, id uuid, display_name text, country text, favourite_team text,
               total_points integer, rank integer,
               correct_results integer, exact_scores integer, correct_first_scorers integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE md_id INT; md_name TEXT;
BEGIN
  IF _matchday_id IS NOT NULL THEN
    SELECT m.id, m.name INTO md_id, md_name FROM public.matchdays m WHERE m.id = _matchday_id;
  ELSE
    SELECT m.id, m.name INTO md_id, md_name FROM public.matchdays m WHERE m.is_scored = true ORDER BY m.starts_at DESC LIMIT 1;
  END IF;
  IF md_id IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT md_id, md_name, ms.user_id, p.display_name, p.country, p.favourite_team,
         ms.total_points::int,
         DENSE_RANK() OVER (ORDER BY ms.total_points DESC, ms.correct_results DESC, ms.exact_scores DESC, ms.correct_first_scorers DESC)::int,
         ms.correct_results, ms.exact_scores, ms.correct_first_scorers
  FROM public.matchday_scores ms
  JOIN public.profiles p ON p.user_id = ms.user_id
  WHERE ms.matchday_id = md_id
    AND (_league_id IS NULL OR EXISTS (SELECT 1 FROM public.league_members lm WHERE lm.user_id = ms.user_id AND lm.league_id = _league_id))
  ORDER BY ms.total_points DESC, ms.correct_results DESC, ms.exact_scores DESC, ms.correct_first_scorers DESC, p.display_name ASC
  LIMIT 200;
END $function$;

-- 5) global_leaderboard RPC (now returns rank + tiebreakers)
DROP FUNCTION IF EXISTS public.global_leaderboard(uuid);
CREATE OR REPLACE FUNCTION public.global_leaderboard(_league_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, display_name text, country text, favourite_team text,
               total_points integer, scored_predictions integer, last_md_points integer, current_streak integer,
               rank integer, correct_results integer, exact_scores integer, correct_first_scorers integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE last_md INT;
BEGIN
  SELECT m.id INTO last_md FROM public.matchdays m WHERE m.is_scored = true ORDER BY m.starts_at DESC LIMIT 1;
  RETURN QUERY
  WITH base AS (
    SELECT p.user_id, p.display_name, p.country, p.favourite_team, p.current_streak,
      (COALESCE(SUM(pr.points),0)
       + COALESCE((SELECT tp.points_awarded FROM public.tournament_predictions tp WHERE tp.user_id = p.user_id), 0)
      )::int AS total_points,
      COUNT(pr.id) FILTER (WHERE pr.points IS NOT NULL)::int AS scored_predictions,
      COALESCE((SELECT ms.total_points FROM public.matchday_scores ms WHERE ms.user_id = p.user_id AND ms.matchday_id = last_md), 0)::int AS last_md_points,
      COALESCE((SELECT SUM(ms.correct_results)::int       FROM public.matchday_scores ms WHERE ms.user_id = p.user_id), 0) AS cr,
      COALESCE((SELECT SUM(ms.exact_scores)::int          FROM public.matchday_scores ms WHERE ms.user_id = p.user_id), 0) AS es,
      COALESCE((SELECT SUM(ms.correct_first_scorers)::int FROM public.matchday_scores ms WHERE ms.user_id = p.user_id), 0) AS fs
    FROM public.profiles p
    LEFT JOIN public.predictions pr ON pr.user_id = p.user_id
    WHERE _league_id IS NULL
      OR EXISTS (SELECT 1 FROM public.league_members lm WHERE lm.user_id = p.user_id AND lm.league_id = _league_id)
    GROUP BY p.user_id, p.display_name, p.country, p.favourite_team, p.current_streak
  )
  SELECT user_id, display_name, country, favourite_team,
         total_points, scored_predictions, last_md_points, current_streak::int,
         DENSE_RANK() OVER (ORDER BY total_points DESC, cr DESC, es DESC, fs DESC)::int AS rank,
         cr, es, fs
  FROM base
  ORDER BY total_points DESC, cr DESC, es DESC, fs DESC, display_name ASC
  LIMIT 200;
END $function$;
