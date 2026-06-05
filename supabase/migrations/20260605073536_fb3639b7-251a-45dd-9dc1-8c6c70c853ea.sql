
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  country TEXT NOT NULL,
  favourite_team TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles readable" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.matchdays (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  is_scored BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.matchdays TO authenticated;
GRANT ALL ON public.matchdays TO service_role;
ALTER TABLE public.matchdays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "matchdays readable" ON public.matchdays FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage matchdays" ON public.matchdays FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.matches (
  id SERIAL PRIMARY KEY,
  matchday_id INT NOT NULL REFERENCES public.matchdays(id) ON DELETE CASCADE,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  kickoff_at TIMESTAMPTZ NOT NULL,
  home_score INT,
  away_score INT,
  first_scorer TEXT,
  is_final BOOLEAN NOT NULL DEFAULT FALSE,
  phase TEXT,
  is_selected BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_matches_matchday ON public.matches(matchday_id);
GRANT SELECT ON public.matches TO authenticated;
GRANT ALL ON public.matches TO service_role;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "matches readable" ON public.matches FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage matches" ON public.matches FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.predictions (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  match_id INT NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  home_goals INT NOT NULL,
  away_goals INT NOT NULL,
  first_scorer TEXT NOT NULL,
  booster BOOLEAN NOT NULL DEFAULT FALSE,
  points INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, match_id)
);
CREATE INDEX idx_predictions_user ON public.predictions(user_id);
CREATE INDEX idx_predictions_match ON public.predictions(match_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.predictions TO authenticated;
GRANT ALL ON public.predictions TO service_role;
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own predictions" ON public.predictions FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "users insert own predictions" ON public.predictions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "users update own predictions" ON public.predictions FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "users delete own predictions" ON public.predictions FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE TRIGGER trg_predictions_updated BEFORE UPDATE ON public.predictions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.leagues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leagues TO authenticated;
GRANT ALL ON public.leagues TO service_role;
ALTER TABLE public.leagues ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.league_members (
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.league_members TO authenticated;
GRANT ALL ON public.league_members TO service_role;
ALTER TABLE public.league_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_league_member(_league_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.league_members WHERE league_id = _league_id AND user_id = _user_id)
$$;
GRANT EXECUTE ON FUNCTION public.is_league_member(UUID, UUID) TO authenticated;

CREATE POLICY "leagues readable to members" ON public.leagues FOR SELECT TO authenticated USING (
  owner_id = auth.uid() OR public.is_league_member(id, auth.uid())
);
CREATE POLICY "users create own leagues" ON public.leagues FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "owners delete leagues" ON public.leagues FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE POLICY "members read league members" ON public.league_members FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR public.is_league_member(league_id, auth.uid())
);
CREATE POLICY "users join leagues" ON public.league_members FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "users leave leagues" ON public.league_members FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.matchday_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  matchday_id INT NOT NULL REFERENCES public.matchdays(id) ON DELETE CASCADE,
  total_points INT NOT NULL DEFAULT 0,
  rank INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, matchday_id)
);
CREATE INDEX idx_matchday_scores_matchday ON public.matchday_scores(matchday_id);
GRANT SELECT ON public.matchday_scores TO authenticated;
GRANT ALL ON public.matchday_scores TO service_role;
ALTER TABLE public.matchday_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "matchday_scores readable" ON public.matchday_scores FOR SELECT TO authenticated USING (true);
CREATE TRIGGER trg_matchday_scores_updated BEFORE UPDATE ON public.matchday_scores FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.global_leaderboard(_league_id UUID DEFAULT NULL)
RETURNS TABLE (
  id UUID, display_name TEXT, country TEXT, favourite_team TEXT,
  total_points INT, scored_predictions INT, last_md_points INT
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE last_md INT;
BEGIN
  SELECT m.id INTO last_md FROM public.matchdays m WHERE m.is_scored = true ORDER BY m.starts_at DESC LIMIT 1;
  RETURN QUERY
  SELECT p.user_id, p.display_name, p.country, p.favourite_team,
         COALESCE(SUM(pr.points),0)::int,
         COUNT(pr.id) FILTER (WHERE pr.points IS NOT NULL)::int,
         COALESCE((SELECT ms.total_points FROM public.matchday_scores ms WHERE ms.user_id = p.user_id AND ms.matchday_id = last_md), 0)::int
  FROM public.profiles p
  LEFT JOIN public.predictions pr ON pr.user_id = p.user_id
  WHERE _league_id IS NULL
    OR EXISTS (SELECT 1 FROM public.league_members lm WHERE lm.user_id = p.user_id AND lm.league_id = _league_id)
  GROUP BY p.user_id, p.display_name, p.country, p.favourite_team
  ORDER BY 5 DESC, p.display_name ASC
  LIMIT 200;
END $$;
GRANT EXECUTE ON FUNCTION public.global_leaderboard(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.matchday_leaderboard(_matchday_id INT DEFAULT NULL, _league_id UUID DEFAULT NULL)
RETURNS TABLE (
  matchday_id INT, matchday_name TEXT,
  id UUID, display_name TEXT, country TEXT, favourite_team TEXT,
  total_points INT, rank INT
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE md_id INT; md_name TEXT;
BEGIN
  IF _matchday_id IS NOT NULL THEN
    SELECT m.id, m.name INTO md_id, md_name FROM public.matchdays m WHERE m.id = _matchday_id;
  ELSE
    SELECT m.id, m.name INTO md_id, md_name FROM public.matchdays m WHERE m.is_scored = true ORDER BY m.starts_at DESC LIMIT 1;
  END IF;
  IF md_id IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT md_id, md_name, ms.user_id, p.display_name, p.country, p.favourite_team,
         ms.total_points::int, ms.rank
  FROM public.matchday_scores ms
  JOIN public.profiles p ON p.user_id = ms.user_id
  WHERE ms.matchday_id = md_id
    AND (_league_id IS NULL OR EXISTS (SELECT 1 FROM public.league_members lm WHERE lm.user_id = ms.user_id AND lm.league_id = _league_id))
  ORDER BY ms.total_points DESC, p.display_name ASC
  LIMIT 200;
END $$;
GRANT EXECUTE ON FUNCTION public.matchday_leaderboard(INT, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.my_leagues()
RETURNS TABLE (
  id UUID, name TEXT, invite_code TEXT, owner_id UUID,
  member_count INT, my_points INT, my_rank INT
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH league_totals AS (
    SELECT lm.league_id, lm.user_id,
           COALESCE(SUM(ms.total_points),0)::int AS total_points
    FROM public.league_members lm
    LEFT JOIN public.matchday_scores ms ON ms.user_id = lm.user_id
    GROUP BY lm.league_id, lm.user_id
  ),
  ranked AS (
    SELECT league_id, user_id, total_points,
           RANK() OVER (PARTITION BY league_id ORDER BY total_points DESC)::int AS rnk
    FROM league_totals
  )
  SELECT l.id, l.name, l.invite_code, l.owner_id,
         (SELECT COUNT(*)::int FROM public.league_members WHERE league_id = l.id),
         COALESCE(r.total_points, 0)::int,
         CASE WHEN COALESCE(r.total_points,0) > 0 THEN r.rnk ELSE NULL END
  FROM public.leagues l
  JOIN public.league_members m ON m.league_id = l.id AND m.user_id = auth.uid()
  LEFT JOIN ranked r ON r.league_id = l.id AND r.user_id = auth.uid()
  ORDER BY l.created_at DESC;
END $$;
GRANT EXECUTE ON FUNCTION public.my_leagues() TO authenticated;

CREATE OR REPLACE FUNCTION public.score_matchday(_matchday_id INT)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m RECORD; p RECORD; pts INT; tally JSONB; share NUMERIC; total_preds INT; users_count INT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  FOR m IN SELECT * FROM public.matches WHERE matchday_id = _matchday_id AND is_final = true LOOP
    SELECT COUNT(*) INTO total_preds FROM public.predictions WHERE match_id = m.id;
    SELECT COALESCE(jsonb_object_agg(key, c), '{}'::jsonb) INTO tally FROM (
      SELECT (home_goals || '-' || away_goals) AS key, COUNT(*)::int AS c
      FROM public.predictions WHERE match_id = m.id GROUP BY 1
    ) t;
    FOR p IN SELECT * FROM public.predictions WHERE match_id = m.id LOOP
      pts := 0;
      IF (p.home_goals = m.home_score AND p.away_goals = m.away_score)
         OR (SIGN(p.home_goals - p.away_goals) = SIGN(COALESCE(m.home_score,0) - COALESCE(m.away_score,0))) THEN
        pts := pts + 3;
      END IF;
      IF p.home_goals = m.home_score THEN pts := pts + 2; END IF;
      IF p.away_goals = m.away_score THEN pts := pts + 2; END IF;
      IF (p.home_goals - p.away_goals) = (COALESCE(m.home_score,0) - COALESCE(m.away_score,0)) THEN pts := pts + 3; END IF;
      IF p.first_scorer IS NOT NULL AND p.first_scorer = m.first_scorer THEN pts := pts + 3; END IF;
      IF p.booster THEN pts := pts * 2; END IF;
      IF p.home_goals = m.home_score AND p.away_goals = m.away_score AND total_preds > 0 THEN
        share := COALESCE((tally->>(p.home_goals || '-' || p.away_goals))::numeric, 0) / total_preds;
        IF share < 0.1 THEN pts := pts + 5; END IF;
      END IF;
      UPDATE public.predictions SET points = pts WHERE id = p.id;
    END LOOP;
  END LOOP;

  WITH totals AS (
    SELECT p.user_id, COALESCE(SUM(p.points),0)::int AS total_points
    FROM public.predictions p
    JOIN public.matches mm ON mm.id = p.match_id
    WHERE mm.matchday_id = _matchday_id
    GROUP BY p.user_id
  ),
  ranked AS (
    SELECT user_id, total_points,
           DENSE_RANK() OVER (ORDER BY total_points DESC)::int AS rnk
    FROM totals
  )
  INSERT INTO public.matchday_scores (user_id, matchday_id, total_points, rank)
  SELECT user_id, _matchday_id, total_points, rnk FROM ranked
  ON CONFLICT (user_id, matchday_id) DO UPDATE
    SET total_points = EXCLUDED.total_points, rank = EXCLUDED.rank, updated_at = now();

  SELECT COUNT(DISTINCT p.user_id) INTO users_count
  FROM public.predictions p JOIN public.matches mm ON mm.id = p.match_id
  WHERE mm.matchday_id = _matchday_id;

  UPDATE public.matchdays SET is_scored = true WHERE id = _matchday_id;
  RETURN users_count;
END $$;
GRANT EXECUTE ON FUNCTION public.score_matchday(INT) TO authenticated;

INSERT INTO public.matchdays (id, name, starts_at) VALUES (1, 'Matchday 1 — Group Stage', now() + interval '2 days');
SELECT setval('matchdays_id_seq', 1, true);
INSERT INTO public.matches (matchday_id, home_team, away_team, kickoff_at) VALUES
(1, 'Mexico', 'Canada', now() + interval '2 days'),
(1, 'USA', 'Argentina', now() + interval '2 days 3 hours'),
(1, 'Brazil', 'Spain', now() + interval '2 days 6 hours'),
(1, 'France', 'Germany', now() + interval '3 days'),
(1, 'England', 'Netherlands', now() + interval '3 days 3 hours'),
(1, 'Portugal', 'Uruguay', now() + interval '3 days 6 hours');
