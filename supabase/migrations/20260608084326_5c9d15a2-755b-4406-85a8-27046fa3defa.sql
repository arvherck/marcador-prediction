
-- 1. New columns
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS home_placeholder TEXT,
  ADD COLUMN IF NOT EXISTS away_placeholder TEXT,
  ADD COLUMN IF NOT EXISTS auto_populated BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.wc_standings
  ADD COLUMN IF NOT EXISTS yellow_cards INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS red_cards INT NOT NULL DEFAULT 0;

-- 2. Allow nullable team names for unpopulated knockout rows
ALTER TABLE public.matches ALTER COLUMN home_team DROP NOT NULL;
ALTER TABLE public.matches ALTER COLUMN away_team DROP NOT NULL;

-- 3. Backfill placeholders for existing knockout fixtures and clear team names
--    where they still hold the placeholder text. matchday_id >= 4 are knockouts.
UPDATE public.matches
SET home_placeholder = COALESCE(home_placeholder, home_team),
    away_placeholder = COALESCE(away_placeholder, away_team)
WHERE matchday_id >= 4;

UPDATE public.matches
SET home_team = NULL,
    away_team = NULL,
    teams_confirmed = false
WHERE matchday_id >= 4
  AND (
    home_team ~* '^(Winner|Runner-up|Best|Loser) '
    OR away_team ~* '^(Winner|Runner-up|Best|Loser) '
  );

-- 4. Helper: resolve a placeholder label to a real team name.
--    Returns NULL when it cannot be resolved yet.
CREATE OR REPLACE FUNCTION public.resolve_knockout_placeholder(
  _label TEXT,
  _winners JSONB,        -- { "A": "Spain", ... }
  _runners JSONB,        -- { "A": "Italy", ... }
  _thirds  JSONB         -- { "1": "Senegal", ..., "8": "..." }
) RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  letter TEXT;
  n      INT;
  src_id INT;
  src    RECORD;
BEGIN
  IF _label IS NULL THEN RETURN NULL; END IF;

  -- "Winner Group X"
  letter := substring(_label FROM '^Winner Group ([A-L])$');
  IF letter IS NOT NULL THEN RETURN _winners ->> letter; END IF;

  -- "Runner-up Group X"
  letter := substring(_label FROM '^Runner-up Group ([A-L])$');
  IF letter IS NOT NULL THEN RETURN _runners ->> letter; END IF;

  -- "Best 3rd Place N"
  n := NULLIF(substring(_label FROM '^Best 3rd Place ([1-8])$'), '')::INT;
  IF n IS NOT NULL THEN RETURN _thirds ->> n::TEXT; END IF;

  -- "Winner R32 Match N" / "Winner R16 Match N" / "Winner QF Match N"
  -- Match numbers in the spec are 1-based per round. We resolve by ordering
  -- the round's rows by id and taking the Nth.
  IF _label ~ '^Winner (R32|R16|QF) Match [0-9]+$' THEN
    n := substring(_label FROM 'Match ([0-9]+)$')::INT;
    SELECT id INTO src_id FROM public.matches
     WHERE phase = CASE
       WHEN _label LIKE 'Winner R32%' THEN 'Round of 32'
       WHEN _label LIKE 'Winner R16%' THEN 'Round of 16'
       ELSE 'Quarterfinal'
     END
     ORDER BY id
     OFFSET n - 1 LIMIT 1;
    IF src_id IS NULL THEN RETURN NULL; END IF;
    SELECT * INTO src FROM public.matches WHERE id = src_id;
    IF NOT src.is_final OR src.home_score IS NULL OR src.away_score IS NULL THEN
      RETURN NULL;
    END IF;
    IF src.home_score > src.away_score THEN RETURN src.home_team;
    ELSIF src.away_score > src.home_score THEN RETURN src.away_team;
    ELSE RETURN NULL;  -- tie should not happen in knockouts; leave pending
    END IF;
  END IF;

  -- "Winner Semifinal N" / "Loser Semifinal N"
  IF _label ~ '^(Winner|Loser) Semifinal [12]$' THEN
    n := substring(_label FROM '([12])$')::INT;
    SELECT id INTO src_id FROM public.matches
     WHERE phase = 'Semifinal'
     ORDER BY id
     OFFSET n - 1 LIMIT 1;
    IF src_id IS NULL THEN RETURN NULL; END IF;
    SELECT * INTO src FROM public.matches WHERE id = src_id;
    IF NOT src.is_final OR src.home_score IS NULL OR src.away_score IS NULL THEN
      RETURN NULL;
    END IF;
    IF _label LIKE 'Winner%' THEN
      RETURN CASE WHEN src.home_score > src.away_score THEN src.home_team ELSE src.away_team END;
    ELSE
      RETURN CASE WHEN src.home_score > src.away_score THEN src.away_team ELSE src.home_team END;
    END IF;
  END IF;

  RETURN NULL;
END $$;

-- 5. populate_knockout_brackets
CREATE OR REPLACE FUNCTION public.populate_knockout_brackets(
  _caller_id UUID,
  _third_assignment JSONB DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  remaining INT;
  winners JSONB := '{}'::jsonb;
  runners JSONB := '{}'::jsonb;
  thirds_ranked JSONB := '[]'::jsonb;
  third_teams_top8 JSONB := '[]'::jsonb;
  r RECORD;
  m RECORD;
  new_home TEXT;
  new_away TEXT;
  populated INT[] := ARRAY[]::INT[];
  pending   INT[] := ARRAY[]::INT[];
BEGIN
  IF NOT public.has_role(_caller_id, 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- Guard: group stage must be complete
  SELECT COUNT(*) INTO remaining
  FROM public.matches
  WHERE matchday_id BETWEEN 1 AND 3
    AND status <> 'completed';
  IF remaining > 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'group_stage_incomplete', 'remaining', remaining);
  END IF;

  -- Group winners + runners-up: rank within group by points, GD, GF, alpha
  FOR r IN
    WITH ranked AS (
      SELECT g.name AS group_name,
             substring(g.name FROM 'Group ([A-L])') AS letter,
             s.team,
             ROW_NUMBER() OVER (
               PARTITION BY g.id
               ORDER BY s.points DESC, s.goal_difference DESC, s.goals_for DESC, s.team ASC
             ) AS rk
      FROM public.wc_standings s
      JOIN public.wc_groups g ON g.id = s.group_id
    )
    SELECT letter, team, rk FROM ranked WHERE rk IN (1, 2)
  LOOP
    IF r.rk = 1 THEN
      winners := winners || jsonb_build_object(r.letter, r.team);
    ELSE
      runners := runners || jsonb_build_object(r.letter, r.team);
    END IF;
  END LOOP;

  -- Best 8 third-placed teams (ranked: pts, gd, gf, fair-play, letter)
  WITH ranked AS (
    SELECT s.team,
           substring(g.name FROM 'Group ([A-L])') AS letter,
           s.points, s.goal_difference AS gd, s.goals_for AS gf,
           (s.yellow_cards + 3 * s.red_cards) AS fair_play,
           ROW_NUMBER() OVER (
             PARTITION BY g.id
             ORDER BY s.points DESC, s.goal_difference DESC, s.goals_for DESC, s.team ASC
           ) AS rk
    FROM public.wc_standings s
    JOIN public.wc_groups g ON g.id = s.group_id
  ),
  third_place AS (
    SELECT team, letter, points, gd, gf, fair_play
    FROM ranked WHERE rk = 3
    ORDER BY points DESC, gd DESC, gf DESC, fair_play ASC, letter ASC
    LIMIT 8
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'team', team, 'group', letter, 'points', points,
           'gd', gd, 'gf', gf, 'fair_play', fair_play
         )), '[]'::jsonb)
  INTO thirds_ranked
  FROM third_place;

  IF jsonb_array_length(thirds_ranked) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_enough_thirds',
      'have', jsonb_array_length(thirds_ranked));
  END IF;

  -- If admin hasn't confirmed slot assignment yet, return ranked teams
  IF _third_assignment IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'needs_third_confirmation',
      'third_teams', thirds_ranked,
      'winners', winners,
      'runners', runners,
      'third_slots', jsonb_build_array(1,2,3,4,5,6,7,8)
    );
  END IF;

  -- Apply: walk every knockout row and try to resolve both sides
  FOR m IN
    SELECT id, phase, home_team, away_team, home_placeholder, away_placeholder,
           auto_populated
    FROM public.matches
    WHERE matchday_id >= 4
    ORDER BY id
  LOOP
    -- Skip rows where admin manually set teams (auto_populated=false AND
    -- at least one team name set)
    IF m.auto_populated = false AND (m.home_team IS NOT NULL OR m.away_team IS NOT NULL) THEN
      CONTINUE;
    END IF;

    new_home := public.resolve_knockout_placeholder(
      m.home_placeholder, winners, runners, _third_assignment);
    new_away := public.resolve_knockout_placeholder(
      m.away_placeholder, winners, runners, _third_assignment);

    IF new_home IS NOT NULL AND new_away IS NOT NULL THEN
      UPDATE public.matches
      SET home_team = new_home,
          away_team = new_away,
          teams_confirmed = true,
          auto_populated = true
      WHERE id = m.id;
      populated := populated || m.id;
    ELSE
      pending := pending || m.id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'populated', populated,
    'pending', pending,
    'winners', winners,
    'runners', runners,
    'third_assignment', _third_assignment
  );
END $$;

-- 6. cascade_knockout_winners — only resolves "Winner/Loser R32/R16/QF/SF Match N"
CREATE OR REPLACE FUNCTION public.cascade_knockout_winners(_caller_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m RECORD;
  new_home TEXT;
  new_away TEXT;
  populated INT[] := ARRAY[]::INT[];
  empty_obj JSONB := '{}'::jsonb;
BEGIN
  IF NOT public.has_role(_caller_id, 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  FOR m IN
    SELECT id, home_team, away_team, home_placeholder, away_placeholder, auto_populated
    FROM public.matches
    WHERE matchday_id >= 5  -- R16 and later
    ORDER BY id
  LOOP
    IF m.auto_populated = false AND (m.home_team IS NOT NULL OR m.away_team IS NOT NULL) THEN
      CONTINUE;
    END IF;

    new_home := public.resolve_knockout_placeholder(m.home_placeholder, empty_obj, empty_obj, empty_obj);
    new_away := public.resolve_knockout_placeholder(m.away_placeholder, empty_obj, empty_obj, empty_obj);

    -- Only update sides that actually resolved; keep the other side as-is if pending.
    IF new_home IS NOT NULL OR new_away IS NOT NULL THEN
      UPDATE public.matches
      SET home_team = COALESCE(new_home, home_team),
          away_team = COALESCE(new_away, away_team),
          teams_confirmed = (COALESCE(new_home, home_team) IS NOT NULL
                             AND COALESCE(new_away, away_team) IS NOT NULL),
          auto_populated = true
      WHERE id = m.id;
      IF (new_home IS NOT NULL AND m.home_team IS DISTINCT FROM new_home)
         OR (new_away IS NOT NULL AND m.away_team IS DISTINCT FROM new_away) THEN
        populated := populated || m.id;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'populated', populated);
END $$;

-- 7. reset_knockout_match
CREATE OR REPLACE FUNCTION public.reset_knockout_match(_caller_id UUID, _match_id INT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(_caller_id, 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  UPDATE public.matches
  SET home_team = NULL,
      away_team = NULL,
      teams_confirmed = false,
      auto_populated = false
  WHERE id = _match_id AND matchday_id >= 4;
END $$;

-- 8. Trigger: when a knockout match becomes final, cascade. Uses a session GUC
--    to identify the admin caller. If unset, the trigger is a no-op.
CREATE OR REPLACE FUNCTION public.trg_cascade_after_final()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller TEXT;
BEGIN
  IF NEW.matchday_id >= 4
     AND NEW.is_final = true
     AND COALESCE(OLD.is_final, false) = false THEN
    caller := current_setting('app.current_admin_id', true);
    IF caller IS NOT NULL AND length(caller) > 0 THEN
      PERFORM public.cascade_knockout_winners(caller::uuid);
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS matches_cascade_after_final ON public.matches;
CREATE TRIGGER matches_cascade_after_final
  AFTER UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.trg_cascade_after_final();
