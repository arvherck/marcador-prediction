REVOKE EXECUTE ON FUNCTION public.find_league_by_code(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.find_league_by_code(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.find_league_by_code(text) TO authenticated;