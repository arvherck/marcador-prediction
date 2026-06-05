
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS donor boolean NOT NULL DEFAULT false;

CREATE TABLE public.donations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'eur',
  stripe_session_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.donations TO authenticated;
GRANT ALL ON public.donations TO service_role;

ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read donations"
  ON public.donations FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
