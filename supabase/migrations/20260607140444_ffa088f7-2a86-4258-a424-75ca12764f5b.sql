
-- Restrict profiles read to owner only. Public leaderboard data is exposed via SECURITY DEFINER RPCs that select limited columns.
DROP POLICY IF EXISTS "profiles readable" ON public.profiles;
CREATE POLICY "users read own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Revoke EXECUTE from anon on SECURITY DEFINER functions (defense in depth).
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_league_member(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.my_leagues() FROM anon;
REVOKE EXECUTE ON FUNCTION public.global_leaderboard(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.matchday_leaderboard(integer, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.score_matchday(integer) FROM anon, authenticated;
