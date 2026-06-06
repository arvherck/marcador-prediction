
-- Add teams_confirmed column
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS teams_confirmed boolean NOT NULL DEFAULT false;

-- Backfill: matchdays 1-3 (group stage) all confirmed; knockout (4-9) leave false
UPDATE public.matches SET teams_confirmed = true WHERE matchday_id <= 3;

-- Also confirm any knockout match whose team names already look real (no placeholder pattern)
UPDATE public.matches
SET teams_confirmed = true
WHERE matchday_id > 3
  AND home_team !~* '^(Winner|Loser|RU|TBD|1[A-Z]|2[A-Z]|3[A-Z]|W[0-9]|L[0-9])'
  AND away_team !~* '^(Winner|Loser|RU|TBD|1[A-Z]|2[A-Z]|3[A-Z]|W[0-9]|L[0-9])';

-- Trigger: auto-confirm when admin updates team names away from placeholder values
CREATE OR REPLACE FUNCTION public.auto_confirm_teams()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.teams_confirmed = false
     AND NEW.home_team !~* '^(Winner|Loser|RU|TBD|1[A-Z]|2[A-Z]|3[A-Z]|W[0-9]|L[0-9])'
     AND NEW.away_team !~* '^(Winner|Loser|RU|TBD|1[A-Z]|2[A-Z]|3[A-Z]|W[0-9]|L[0-9])'
     AND NEW.home_team IS NOT NULL
     AND NEW.away_team IS NOT NULL THEN
    NEW.teams_confirmed = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_confirm_teams ON public.matches;
CREATE TRIGGER trg_auto_confirm_teams
BEFORE INSERT OR UPDATE OF home_team, away_team ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.auto_confirm_teams();

-- Prediction validation trigger
CREATE OR REPLACE FUNCTION public.validate_prediction()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  m_row public.matches%ROWTYPE;
BEGIN
  SELECT * INTO m_row FROM public.matches WHERE id = NEW.match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;
  IF m_row.teams_confirmed = false THEN
    RAISE EXCEPTION 'Teams not confirmed for this match';
  END IF;
  IF m_row.kickoff_at <= now() THEN
    RAISE EXCEPTION 'Predictions are locked for this match';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_prediction ON public.predictions;
CREATE TRIGGER trg_validate_prediction
BEFORE INSERT OR UPDATE ON public.predictions
FOR EACH ROW EXECUTE FUNCTION public.validate_prediction();

-- Enable realtime for matches
ALTER TABLE public.matches REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
