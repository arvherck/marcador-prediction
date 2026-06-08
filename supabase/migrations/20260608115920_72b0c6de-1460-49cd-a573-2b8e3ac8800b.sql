CREATE OR REPLACE FUNCTION public.global_leaderboard(_league_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(id uuid, display_name text, country text, favourite_team text, total_points integer, scored_predictions integer, last_md_points integer, current_streak integer, rank integer, correct_results integer, exact_scores integer, correct_first_scorers integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE last_md INT;
BEGIN
  SELECT m.id INTO last_md FROM public.matchdays m
   WHERE m.is_scored = true AND m.is_test = false
   ORDER BY m.starts_at DESC LIMIT 1;
  RETURN QUERY
  WITH base AS (
    SELECT p.user_id, p.display_name, p.country, p.favourite_team, p.current_streak,
      (COALESCE((SELECT SUM(pr.points)
                   FROM public.predictions pr
                   JOIN public.matches mm ON mm.id = pr.match_id
                   JOIN public.matchdays md ON md.id = mm.matchday_id
                  WHERE pr.user_id = p.user_id AND md.is_test = false), 0)
       + COALESCE((SELECT tp.points_awarded FROM public.tournament_predictions tp WHERE tp.user_id = p.user_id), 0)
      )::int AS total_points,
      COALESCE((SELECT COUNT(pr.id)::int
                  FROM public.predictions pr
                  JOIN public.matches mm ON mm.id = pr.match_id
                  JOIN public.matchdays md ON md.id = mm.matchday_id
                 WHERE pr.user_id = p.user_id AND pr.points IS NOT NULL AND md.is_test = false), 0) AS scored_predictions,
      COALESCE((SELECT ms.total_points FROM public.matchday_scores ms WHERE ms.user_id = p.user_id AND ms.matchday_id = last_md), 0)::int AS last_md_points,
      COALESCE((SELECT SUM(ms.correct_results)::int
                  FROM public.matchday_scores ms
                  JOIN public.matchdays md ON md.id = ms.matchday_id
                 WHERE ms.user_id = p.user_id AND md.is_test = false), 0) AS cr,
      COALESCE((SELECT SUM(ms.exact_scores)::int
                  FROM public.matchday_scores ms
                  JOIN public.matchdays md ON md.id = ms.matchday_id
                 WHERE ms.user_id = p.user_id AND md.is_test = false), 0) AS es,
      COALESCE((SELECT SUM(ms.correct_first_scorers)::int
                  FROM public.matchday_scores ms
                  JOIN public.matchdays md ON md.id = ms.matchday_id
                 WHERE ms.user_id = p.user_id AND md.is_test = false), 0) AS fs
    FROM public.profiles p
    WHERE _league_id IS NULL
      OR EXISTS (SELECT 1 FROM public.league_members lm WHERE lm.user_id = p.user_id AND lm.league_id = _league_id)
  )
  SELECT base.user_id, base.display_name, base.country, base.favourite_team,
         base.total_points, base.scored_predictions, base.last_md_points, base.current_streak::int,
         DENSE_RANK() OVER (ORDER BY base.total_points DESC, base.cr DESC, base.es DESC, base.fs DESC)::int AS rank,
         base.cr, base.es, base.fs
  FROM base
  ORDER BY base.total_points DESC, base.cr DESC, base.es DESC, base.fs DESC, base.display_name ASC
  LIMIT 500;
END $function$;