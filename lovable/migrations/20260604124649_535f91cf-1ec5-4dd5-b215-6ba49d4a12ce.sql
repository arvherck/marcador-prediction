
CREATE TABLE app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE profiles (
  user_id UUID PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  country TEXT NOT NULL,
  favourite_team TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE matchdays (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  is_scored BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE matches (
  id SERIAL PRIMARY KEY,
  matchday_id INT NOT NULL REFERENCES matchdays(id) ON DELETE CASCADE,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  kickoff_at TIMESTAMPTZ NOT NULL,
  home_score INT,
  away_score INT,
  first_scorer TEXT, -- 'home' | 'away' | 'none'
  is_final BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE predictions (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  match_id INT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  home_goals INT NOT NULL,
  away_goals INT NOT NULL,
  first_scorer TEXT NOT NULL, -- 'home' | 'away' | 'none'
  booster BOOLEAN NOT NULL DEFAULT FALSE,
  points INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, match_id)
);

CREATE TABLE leagues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  owner_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE league_members (
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id, user_id)
);

CREATE INDEX idx_matches_matchday ON matches(matchday_id);
CREATE INDEX idx_predictions_user ON predictions(user_id);
CREATE INDEX idx_predictions_match ON predictions(match_id);

-- Seed an initial matchday with 6 sample matches
INSERT INTO matchdays (id, name, starts_at) VALUES (1, 'Matchday 1 — Group Stage', now() + interval '2 days');
SELECT setval('matchdays_id_seq', 1, true);

INSERT INTO matches (matchday_id, home_team, away_team, kickoff_at) VALUES
(1, 'Mexico', 'Canada', now() + interval '2 days'),
(1, 'USA', 'Argentina', now() + interval '2 days 3 hours'),
(1, 'Brazil', 'Spain', now() + interval '2 days 6 hours'),
(1, 'France', 'Germany', now() + interval '3 days'),
(1, 'England', 'Netherlands', now() + interval '3 days 3 hours'),
(1, 'Portugal', 'Uruguay', now() + interval '3 days 6 hours');
