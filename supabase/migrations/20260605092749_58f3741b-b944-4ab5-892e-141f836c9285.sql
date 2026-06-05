
CREATE TABLE public.wc_groups (
  id int PRIMARY KEY,
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.wc_groups TO anon, authenticated;
GRANT ALL ON public.wc_groups TO service_role;
ALTER TABLE public.wc_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wc_groups readable" ON public.wc_groups FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admins manage wc_groups" ON public.wc_groups FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.wc_standings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id int NOT NULL REFERENCES public.wc_groups(id) ON DELETE CASCADE,
  team text NOT NULL,
  played int NOT NULL DEFAULT 0,
  won int NOT NULL DEFAULT 0,
  drawn int NOT NULL DEFAULT 0,
  lost int NOT NULL DEFAULT 0,
  goals_for int NOT NULL DEFAULT 0,
  goals_against int NOT NULL DEFAULT 0,
  goal_difference int GENERATED ALWAYS AS (goals_for - goals_against) STORED,
  points int GENERATED ALWAYS AS (won * 3 + drawn) STORED,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, team)
);

GRANT SELECT ON public.wc_standings TO anon, authenticated;
GRANT ALL ON public.wc_standings TO service_role;
ALTER TABLE public.wc_standings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wc_standings readable" ON public.wc_standings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admins manage wc_standings" ON public.wc_standings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_wc_standings_updated_at
  BEFORE UPDATE ON public.wc_standings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.wc_groups (id, name) VALUES
  (1,'Group A'),(2,'Group B'),(3,'Group C'),(4,'Group D'),
  (5,'Group E'),(6,'Group F'),(7,'Group G'),(8,'Group H'),
  (9,'Group I'),(10,'Group J'),(11,'Group K'),(12,'Group L');

INSERT INTO public.wc_standings (group_id, team) VALUES
  (1,'Mexico'),(1,'South Korea'),(1,'Czechia'),(1,'South Africa'),
  (2,'Switzerland'),(2,'Canada'),(2,'Qatar'),(2,'Bosnia & Herzegovina'),
  (3,'Brazil'),(3,'Morocco'),(3,'Scotland'),(3,'Haiti'),
  (4,'United States'),(4,'Turkey'),(4,'Australia'),(4,'Paraguay'),
  (5,'Germany'),(5,'Ecuador'),(5,'Ivory Coast'),(5,'Curaçao'),
  (6,'Netherlands'),(6,'Japan'),(6,'Sweden'),(6,'Tunisia'),
  (7,'Belgium'),(7,'Iran'),(7,'Egypt'),(7,'New Zealand'),
  (8,'Spain'),(8,'Uruguay'),(8,'Saudi Arabia'),(8,'Cape Verde'),
  (9,'France'),(9,'Senegal'),(9,'Norway'),(9,'Iraq'),
  (10,'Argentina'),(10,'Austria'),(10,'Algeria'),(10,'Jordan'),
  (11,'Portugal'),(11,'Colombia'),(11,'DR Congo'),(11,'Uzbekistan'),
  (12,'England'),(12,'Croatia'),(12,'Panama'),(12,'Ghana');
