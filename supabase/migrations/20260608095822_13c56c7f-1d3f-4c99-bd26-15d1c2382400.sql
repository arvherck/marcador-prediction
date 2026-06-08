
-- Feedback table
CREATE TABLE public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  display_name text NULL,
  category text NOT NULL CHECK (category IN ('bug','suggestion','question','other')),
  message text NOT NULL CHECK (char_length(message) BETWEEN 10 AND 1000),
  page text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_read boolean NOT NULL DEFAULT false,
  admin_notes text NULL
);

CREATE INDEX feedback_unread_idx ON public.feedback (is_read, created_at DESC);
CREATE INDEX feedback_user_idx ON public.feedback (user_id, created_at DESC);

GRANT INSERT ON public.feedback TO anon, authenticated;
GRANT SELECT, UPDATE ON public.feedback TO authenticated;
GRANT ALL ON public.feedback TO service_role;

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Insert policies
CREATE POLICY "Guests can submit feedback"
  ON public.feedback FOR INSERT TO anon
  WITH CHECK (user_id IS NULL);

CREATE POLICY "Users can submit their own feedback"
  ON public.feedback FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- Select policies
CREATE POLICY "Users can read their own feedback"
  ON public.feedback FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can read all feedback"
  ON public.feedback FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Update: admins only
CREATE POLICY "Admins can update feedback"
  ON public.feedback FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Rate limit trigger
CREATE OR REPLACE FUNCTION public.enforce_feedback_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent_count int;
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    SELECT COUNT(*) INTO recent_count
    FROM public.feedback
    WHERE user_id = NEW.user_id
      AND created_at > now() - interval '24 hours';
    IF recent_count >= 5 THEN
      RAISE EXCEPTION 'rate_limit_exceeded' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER feedback_rate_limit_trigger
BEFORE INSERT ON public.feedback
FOR EACH ROW EXECUTE FUNCTION public.enforce_feedback_rate_limit();

-- Unread count RPC (admin-only)
CREATE OR REPLACE FUNCTION public.feedback_unread_count()
RETURNS int
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN 0;
  END IF;
  SELECT COUNT(*) INTO c FROM public.feedback WHERE is_read = false;
  RETURN c;
END;
$$;

GRANT EXECUTE ON FUNCTION public.feedback_unread_count() TO authenticated;

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.feedback;
ALTER TABLE public.feedback REPLICA IDENTITY FULL;
