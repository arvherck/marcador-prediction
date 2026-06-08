CREATE OR REPLACE FUNCTION public.admin_diag(_caller_id uuid, _kind text, _arg text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_role(_caller_id, 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF _kind = 'trigger_exists' THEN
    SELECT jsonb_build_object(
      'exists', COUNT(*) > 0,
      'enabled', bool_and(t.tgenabled <> 'D')
    ) INTO result
    FROM pg_trigger t
    WHERE t.tgname = _arg
      AND NOT t.tgisinternal;
    RETURN COALESCE(result, jsonb_build_object('exists', false, 'enabled', false));

  ELSIF _kind = 'trigger_def' THEN
    SELECT jsonb_build_object(
      'exists', COUNT(*) > 0,
      'enabled', bool_and(t.tgenabled <> 'D'),
      'definition', string_agg(pg_get_triggerdef(t.oid), E'\n')
    ) INTO result
    FROM pg_trigger t
    WHERE t.tgname = _arg
      AND NOT t.tgisinternal;
    RETURN COALESCE(result, jsonb_build_object('exists', false, 'enabled', false, 'definition', null));

  ELSIF _kind = 'proc_exists' THEN
    SELECT jsonb_build_object('count', COUNT(*)) INTO result
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = _arg;
    RETURN result;

  ELSIF _kind = 'proc_body' THEN
    SELECT jsonb_build_object(
      'count', COUNT(*),
      'body', string_agg(p.prosrc, E'\n---\n')
    ) INTO result
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = _arg;
    RETURN result;

  ELSIF _kind = 'columns' THEN
    -- _arg is the table name (public schema)
    SELECT jsonb_build_object(
      'columns', COALESCE(jsonb_agg(column_name ORDER BY ordinal_position), '[]'::jsonb)
    ) INTO result
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = _arg;
    RETURN result;

  ELSE
    RAISE EXCEPTION 'Unknown kind: %', _kind;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_diag(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_diag(uuid, text, text) TO service_role;