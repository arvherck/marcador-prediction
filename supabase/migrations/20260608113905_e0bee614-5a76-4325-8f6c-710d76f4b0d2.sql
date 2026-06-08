-- 1. Add is_test flag
ALTER TABLE public.matchdays ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

-- 2. Create the test matchday and 6 matches
DO $$
DECLARE
  md_id integer;
BEGIN
  -- Idempotent: only insert if not present
  SELECT id INTO md_id FROM public.matchdays
    WHERE name = 'Test — Pre-WC Friendlies (June 2026)' AND is_test = true;

  IF md_id IS NULL THEN
    INSERT INTO public.matchdays (name, starts_at, is_scored, is_test)
    VALUES ('Test — Pre-WC Friendlies (June 2026)', '2026-06-04 19:00:00+00', false, true)
    RETURNING id INTO md_id;

    INSERT INTO public.matches
      (matchday_id, home_team, away_team, kickoff_at, home_score, away_score, first_scorer,
       stadium, city, status, is_final, teams_confirmed, points_multiplier, phase)
    VALUES
      (md_id, 'France',   'Ivory Coast', '2026-06-04 19:10:00+00', 1, 2, 'home',
        'Stade de la Beaujoire',     'Nantes, France',     'completed', true, true, 1, 'Friendly'),
      (md_id, 'Belgium',  'Tunisia',     '2026-06-06 13:00:00+00', 5, 0, 'home',
        'Roi Baudouin Stadium',       'Brussels, Belgium',  'completed', true, true, 1, 'Friendly'),
      (md_id, 'Scotland', 'Bolivia',     '2026-06-06 17:00:00+00', 4, 0, 'home',
        'Sports Illustrated Stadium', 'New Jersey, USA',    'completed', true, true, 1, 'Friendly'),
      (md_id, 'England',  'New Zealand', '2026-06-07 21:00:00+00', 1, 0, 'home',
        'Raymond James Stadium',      'Tampa, USA',         'completed', true, true, 1, 'Friendly'),
      (md_id, 'USA',      'Germany',     '2026-06-07 23:00:00+00', 1, 2, 'away',
        'Soldier Field',              'Chicago, USA',       'completed', true, true, 1, 'Friendly'),
      (md_id, 'Brazil',   'Egypt',       '2026-06-07 22:00:00+00', 2, 1, 'home',
        'TQL Stadium',                'Cincinnati, USA',    'completed', true, true, 1, 'Friendly');
  END IF;
END $$;

-- 3. Update global_leaderboard RPC to exclude is_test matchdays
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
  SELECT user_id, display_name, country, favourite_team,
         total_points, scored_predictions, last_md_points, current_streak::int,
         DENSE_RANK() OVER (ORDER BY total_points DESC, cr DESC, es DESC, fs DESC)::int AS rank,
         cr, es, fs
  FROM base
  ORDER BY total_points DESC, cr DESC, es DESC, fs DESC, display_name ASC
  LIMIT 200;
END $function$;

-- 4. Update matchday_leaderboard RPC: default branch excludes is_test
CREATE OR REPLACE FUNCTION public.matchday_leaderboard(_matchday_id integer DEFAULT NULL::integer, _league_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(matchday_id integer, matchday_name text, id uuid, display_name text, country text, favourite_team text, total_points integer, rank integer, correct_results integer, exact_scores integer, correct_first_scorers integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE md_id INT; md_name TEXT;
BEGIN
  IF _matchday_id IS NOT NULL THEN
    SELECT m.id, m.name INTO md_id, md_name FROM public.matchdays m WHERE m.id = _matchday_id;
  ELSE
    SELECT m.id, m.name INTO md_id, md_name
      FROM public.matchdays m
     WHERE m.is_scored = true AND m.is_test = false
     ORDER BY m.starts_at DESC LIMIT 1;
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