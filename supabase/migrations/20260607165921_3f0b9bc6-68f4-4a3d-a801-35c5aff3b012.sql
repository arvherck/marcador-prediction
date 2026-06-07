
CREATE OR REPLACE FUNCTION public.recalculate_team_standing(_team text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _gid int;
  _played int := 0; _won int := 0; _drawn int := 0; _lost int := 0;
  _gf int := 0; _ga int := 0;
  m RECORD;
BEGIN
  IF _team IS NULL THEN RETURN; END IF;

  SELECT s.group_id INTO _gid
  FROM public.wc_standings s
  WHERE s.team = _team
  LIMIT 1;

  IF _gid IS NULL THEN RETURN; END IF;

  FOR m IN
    SELECT home_team, away_team, home_score, away_score
    FROM public.matches
    WHERE group_letter IS NOT NULL
      AND status = 'completed'
      AND home_score IS NOT NULL
      AND away_score IS NOT NULL
      AND (home_team = _team OR away_team = _team)
  LOOP
    _played := _played + 1;
    IF m.home_team = _team THEN
      _gf := _gf + m.home_score; _ga := _ga + m.away_score;
      IF m.home_score > m.away_score THEN _won := _won + 1;
      ELSIF m.home_score = m.away_score THEN _drawn := _drawn + 1;
      ELSE _lost := _lost + 1;
      END IF;
    ELSE
      _gf := _gf + m.away_score; _ga := _ga + m.home_score;
      IF m.away_score > m.home_score THEN _won := _won + 1;
      ELSIF m.away_score = m.home_score THEN _drawn := _drawn + 1;
      ELSE _lost := _lost + 1;
      END IF;
    END IF;
  END LOOP;

  UPDATE public.wc_standings
  SET played = _played,
      won = _won,
      drawn = _drawn,
      lost = _lost,
      goals_for = _gf,
      goals_against = _ga,
      updated_at = now()
  WHERE team = _team AND group_id = _gid;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_group_standings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  teams text[] := ARRAY[]::text[];
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.group_letter IS NOT NULL THEN
    teams := teams || NEW.home_team || NEW.away_team;
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.group_letter IS NOT NULL THEN
    teams := teams || OLD.home_team || OLD.away_team;
  END IF;

  IF array_length(teams, 1) IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM public.recalculate_team_standing(t)
  FROM (SELECT DISTINCT unnest(teams) AS t) s
  WHERE t IS NOT NULL;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recalculate_group_standings ON public.matches;
CREATE TRIGGER trg_recalculate_group_standings
AFTER INSERT OR UPDATE OR DELETE ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.recalculate_group_standings();

UPDATE public.wc_standings
SET played = 0, won = 0, drawn = 0, lost = 0,
    goals_for = 0, goals_against = 0,
    updated_at = now();

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT team FROM public.wc_standings LOOP
    PERFORM public.recalculate_team_standing(r.team);
  END LOOP;
END $$;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.wc_standings;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
