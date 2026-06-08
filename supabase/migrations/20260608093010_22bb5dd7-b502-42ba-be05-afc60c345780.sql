
-- 1) Add points_multiplier column to matches
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS points_multiplier INT NOT NULL DEFAULT 1;

-- 2) Backfill from phase
UPDATE public.matches SET points_multiplier = 1 WHERE phase = 'Group Stage';
UPDATE public.matches SET points_multiplier = 2 WHERE phase = 'Round of 32';
UPDATE public.matches SET points_multiplier = 3 WHERE phase = 'Round of 16';
UPDATE public.matches SET points_multiplier = 4 WHERE phase IN ('Quarterfinal', 'Third Place');
UPDATE public.matches SET points_multiplier = 5 WHERE phase = 'Semifinal';
UPDATE public.matches SET points_multiplier = 6 WHERE phase = 'Final';

-- 3) Phase → default multiplier function + BEFORE INSERT/UPDATE trigger
CREATE OR REPLACE FUNCTION public.phase_default_multiplier(_phase text)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _phase = 'Round of 32' THEN 2
    WHEN _phase = 'Round of 16' THEN 3
    WHEN _phase IN ('Quarterfinal', 'Third Place') THEN 4
    WHEN _phase = 'Semifinal' THEN 5
    WHEN _phase = 'Final' THEN 6
    ELSE 1
  END
$$;

CREATE OR REPLACE FUNCTION public.set_points_multiplier()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Only override the default if the caller didn't set one explicitly (i.e. it's still 1).
    -- If caller passed any value (including 1) for a knockout phase, respect it as override.
    -- Heuristic: if value equals 1 AND phase has a non-1 default, treat as "not set" and recompute.
    IF NEW.points_multiplier = 1 THEN
      NEW.points_multiplier := public.phase_default_multiplier(NEW.phase);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Recompute only when phase changes AND multiplier wasn't explicitly changed in same update
    IF NEW.phase IS DISTINCT FROM OLD.phase
       AND NEW.points_multiplier IS NOT DISTINCT FROM OLD.points_multiplier THEN
      NEW.points_multiplier := public.phase_default_multiplier(NEW.phase);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_points_multiplier ON public.matches;
CREATE TRIGGER trg_set_points_multiplier
  BEFORE INSERT OR UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.set_points_multiplier();

-- 4) Replace score_matchday and score_match to apply multiplier
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
      -- Apply round multiplier BEFORE booster
      pts := pts * COALESCE(m.points_multiplier, 1);
      IF p.booster THEN pts := pts * 2; END IF;
      -- Underdog flat bonus, NOT multiplied
      IF p.home_goals = m.home_score AND p.away_goals = m.away_score AND total_preds > 0 THEN
        share := COALESCE((tally->>(p.home_goals || '-' || p.away_goals))::numeric, 0) / total_preds;
        IF share < 0.1 THEN pts := pts + 5; END IF;
      END IF;
      UPDATE public.predictions SET points = pts WHERE id = p.id;
    END LOOP;
  END LOOP;

  WITH totals AS (
    SELECT pr.user_id, COALESCE(SUM(pr.points),0)::int AS total_points
    FROM public.predictions pr
    JOIN public.matches mm ON mm.id = pr.match_id
    WHERE mm.matchday_id = _matchday_id
    GROUP BY pr.user_id
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
    pts := pts * COALESCE(m.points_multiplier, 1);
    IF p.booster THEN pts := pts * 2; END IF;
    IF p.home_goals = m.home_score AND p.away_goals = m.away_score AND total_preds > 0 THEN
      share := COALESCE((tally->>(p.home_goals || '-' || p.away_goals))::numeric, 0) / total_preds;
      IF share < 0.1 THEN pts := pts + 5; END IF;
    END IF;
    UPDATE public.predictions SET points = pts WHERE id = p.id;
    scored_count := scored_count + 1;
  END LOOP;

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
$function$;

-- 5) Re-score already-scored matchdays so historical knockout points reflect new multipliers.
--    (Matchdays 1-3 are group stage so multiplier=1 → no change, but safe to re-run.)
DO $$
DECLARE
  admin_id uuid;
  md_id int;
BEGIN
  SELECT user_id INTO admin_id FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  IF admin_id IS NOT NULL THEN
    FOR md_id IN SELECT id FROM public.matchdays WHERE is_scored = true ORDER BY id LOOP
      PERFORM public.score_matchday(md_id, admin_id);
    END LOOP;
  END IF;
END $$;
