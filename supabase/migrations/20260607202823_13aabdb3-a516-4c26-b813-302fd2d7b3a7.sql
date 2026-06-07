CREATE OR REPLACE FUNCTION public.find_league_by_code(_code text)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.leagues WHERE invite_code = _code LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.find_league_by_code(text) TO authenticated;