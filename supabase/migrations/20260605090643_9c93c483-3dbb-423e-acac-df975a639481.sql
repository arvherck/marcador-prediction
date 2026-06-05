-- Allow anonymous (guest) read access to public-facing game data.
CREATE POLICY "matchdays readable to anon" ON public.matchdays FOR SELECT TO anon USING (true);
GRANT SELECT ON public.matchdays TO anon;

CREATE POLICY "matches readable to anon" ON public.matches FOR SELECT TO anon USING (true);
GRANT SELECT ON public.matches TO anon;

CREATE POLICY "matchday_scores readable to anon" ON public.matchday_scores FOR SELECT TO anon USING (true);
GRANT SELECT ON public.matchday_scores TO anon;

-- For profiles, expose only non-sensitive columns via a view; do NOT widen base table to anon.
CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = on) AS
  SELECT user_id, display_name, country
  FROM public.profiles;

GRANT SELECT ON public.public_profiles TO anon, authenticated;