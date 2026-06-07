
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'upcoming';

ALTER TABLE public.matches
  DROP CONSTRAINT IF EXISTS matches_status_check;

ALTER TABLE public.matches
  ADD CONSTRAINT matches_status_check
  CHECK (status IN ('upcoming', 'live', 'completed', 'cancelled'));

UPDATE public.matches
  SET status = CASE WHEN is_final THEN 'completed' ELSE 'upcoming' END;

CREATE INDEX IF NOT EXISTS matches_matchday_status_idx
  ON public.matches (matchday_id, status);

CREATE OR REPLACE FUNCTION public.validate_prediction()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
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
  IF m_row.kickoff_at <= now() OR m_row.status <> 'upcoming' THEN
    RAISE EXCEPTION 'Predictions are locked for this match';
  END IF;
  RETURN NEW;
END;
$function$;
