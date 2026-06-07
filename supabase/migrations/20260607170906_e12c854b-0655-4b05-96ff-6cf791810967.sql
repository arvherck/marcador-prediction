
-- Restrict matchday_scores: drop permissive SELECT policies; own row + admin only
DROP POLICY IF EXISTS "matchday_scores readable" ON public.matchday_scores;
DROP POLICY IF EXISTS "matchday_scores readable to anon" ON public.matchday_scores;
REVOKE SELECT ON public.matchday_scores FROM anon;

CREATE POLICY "users read own matchday score"
  ON public.matchday_scores FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
