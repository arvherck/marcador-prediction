
-- Tournament winner prediction
CREATE TABLE public.tournament_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  predicted_winner text NOT NULL,
  points_awarded int,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.tournament_predictions TO authenticated;
GRANT ALL ON public.tournament_predictions TO service_role;
ALTER TABLE public.tournament_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own tournament pick"
  ON public.tournament_predictions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "users insert own tournament pick"
  ON public.tournament_predictions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE TABLE public.tournament_settings (
  id int PRIMARY KEY DEFAULT 1,
  actual_winner text,
  predictions_locked boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tournament_settings_singleton CHECK (id = 1)
);
GRANT SELECT ON public.tournament_settings TO anon, authenticated;
GRANT ALL ON public.tournament_settings TO service_role;
ALTER TABLE public.tournament_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tournament settings readable"
  ON public.tournament_settings FOR SELECT TO anon, authenticated
  USING (true);

INSERT INTO public.tournament_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Add tournament bonus to global leaderboard
CREATE OR REPLACE FUNCTION public.global_leaderboard(_league_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, display_name text, country text, favourite_team text, total_points integer, scored_predictions integer, last_md_points integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE last_md INT;
BEGIN
  SELECT m.id INTO last_md FROM public.matchdays m WHERE m.is_scored = true ORDER BY m.starts_at DESC LIMIT 1;
  RETURN QUERY
  SELECT p.user_id, p.display_name, p.country, p.favourite_team,
         (COALESCE(SUM(pr.points),0)
          + COALESCE((SELECT tp.points_awarded FROM public.tournament_predictions tp WHERE tp.user_id = p.user_id), 0)
         )::int,
         COUNT(pr.id) FILTER (WHERE pr.points IS NOT NULL)::int,
         COALESCE((SELECT ms.total_points FROM public.matchday_scores ms WHERE ms.user_id = p.user_id AND ms.matchday_id = last_md), 0)::int
  FROM public.profiles p
  LEFT JOIN public.predictions pr ON pr.user_id = p.user_id
  WHERE _league_id IS NULL
    OR EXISTS (SELECT 1 FROM public.league_members lm WHERE lm.user_id = p.user_id AND lm.league_id = _league_id)
  GROUP BY p.user_id, p.display_name, p.country, p.favourite_team
  ORDER BY 5 DESC, p.display_name ASC
  LIMIT 200;
END $function$;
