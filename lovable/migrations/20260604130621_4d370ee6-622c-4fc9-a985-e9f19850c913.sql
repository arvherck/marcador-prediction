CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE IF NOT EXISTS public.matchday_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  matchday_id INTEGER NOT NULL REFERENCES public.matchdays(id) ON DELETE CASCADE,
  total_points INTEGER NOT NULL DEFAULT 0,
  rank INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, matchday_id)
);
CREATE INDEX IF NOT EXISTS idx_matchday_scores_matchday ON public.matchday_scores(matchday_id);
DROP TRIGGER IF EXISTS update_matchday_scores_updated_at ON public.matchday_scores;
CREATE TRIGGER update_matchday_scores_updated_at
BEFORE UPDATE ON public.matchday_scores
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();