DROP TRIGGER IF EXISTS validate_prediction_trigger ON public.predictions;
DROP TRIGGER IF EXISTS validate_prediction ON public.predictions;
DROP TRIGGER IF EXISTS trg_validate_prediction ON public.predictions;

CREATE TRIGGER validate_prediction_trigger
BEFORE INSERT OR UPDATE OF home_goals, away_goals, first_scorer, booster
ON public.predictions
FOR EACH ROW
EXECUTE FUNCTION public.validate_prediction();