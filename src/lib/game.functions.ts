import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type MatchRow = {
  id: number;
  matchday_id: number;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  home_score: number | null;
  away_score: number | null;
  first_scorer: string | null;
  is_final: boolean;
  prediction: {
    home_goals: number;
    away_goals: number;
    first_scorer: string;
    booster: boolean;
    points: number | null;
  } | null;
  locked: boolean;
};

export const getCurrentMatchday = createServerFn({ method: "GET" }).handler(async () => {
  const { pool } = await import("./lovable/database");
  const { loadCurrentUser } = await import("./auth.server");
  const me = await loadCurrentUser();

  const md = await pool.query(
    `SELECT * FROM matchdays
     ORDER BY (is_scored) ASC, starts_at ASC
     LIMIT 1`,
  );
  if (!md.rows.length) return null;
  const matchday = md.rows[0];

  const matches = await pool.query(
    `SELECT m.*, p.home_goals AS p_home, p.away_goals AS p_away,
            p.first_scorer AS p_first, p.booster AS p_booster, p.points AS p_points
     FROM matches m
     LEFT JOIN predictions p
       ON p.match_id = m.id AND p.user_id = $1
     WHERE m.matchday_id = $2
     ORDER BY m.kickoff_at ASC, m.id ASC`,
    [me?.id ?? "00000000-0000-0000-0000-000000000000", matchday.id],
  );

  const now = Date.now();
  const rows: MatchRow[] = matches.rows.map((r: Record<string, unknown> & { kickoff_at: string }) => ({
    id: r.id,
    matchday_id: r.matchday_id,
    home_team: r.home_team,
    away_team: r.away_team,
    kickoff_at: r.kickoff_at,
    home_score: r.home_score,
    away_score: r.away_score,
    first_scorer: r.first_scorer,
    is_final: r.is_final,
    locked: new Date(r.kickoff_at).getTime() <= now,
    prediction:
      r.p_home !== null && r.p_home !== undefined
        ? {
            home_goals: r.p_home,
            away_goals: r.p_away,
            first_scorer: r.p_first,
            booster: r.p_booster,
            points: r.p_points,
          }
        : null,
  }));

  return { matchday, matches: rows };
});

const scorerEnum = z.enum(["home", "away", "none"]);

export const savePredictionFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      match_id: z.number().int(),
      home_goals: z.number().int().min(0).max(20),
      away_goals: z.number().int().min(0).max(20),
      first_scorer: scorerEnum,
    }),
  )
  .handler(async ({ data }) => {
    const { pool } = await import("./lovable/database");
    const { requireUser } = await import("./auth.server");
    const me = await requireUser();
    const match = await pool.query(
      "SELECT kickoff_at FROM matches WHERE id=$1",
      [data.match_id],
    );
    if (!match.rows.length) throw new Error("Match not found.");
    if (new Date(match.rows[0].kickoff_at).getTime() <= Date.now())
      throw new Error("Predictions are locked for this match.");
    await pool.query(
      `INSERT INTO predictions (user_id, match_id, home_goals, away_goals, first_scorer)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id, match_id) DO UPDATE
       SET home_goals=EXCLUDED.home_goals,
           away_goals=EXCLUDED.away_goals,
           first_scorer=EXCLUDED.first_scorer,
           updated_at=now()`,
      [me.id, data.match_id, data.home_goals, data.away_goals, data.first_scorer],
    );
    return { ok: true };
  });

export const setBoosterFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ matchday_id: z.number().int(), match_id: z.number().int() }))
  .handler(async ({ data }) => {
    const { pool } = await import("./lovable/database");
    const { requireUser } = await import("./auth.server");
    const me = await requireUser();
    // verify the match belongs to matchday and not locked
    const m = await pool.query(
      "SELECT kickoff_at FROM matches WHERE id=$1 AND matchday_id=$2",
      [data.match_id, data.matchday_id],
    );
    if (!m.rows.length) throw new Error("Match not found.");
    if (new Date(m.rows[0].kickoff_at).getTime() <= Date.now())
      throw new Error("Too late to change booster — match has started.");
    // ensure prediction exists
    await pool.query(
      `INSERT INTO predictions (user_id, match_id, home_goals, away_goals, first_scorer, booster)
       VALUES ($1,$2,0,0,'none',true)
       ON CONFLICT (user_id, match_id) DO NOTHING`,
      [me.id, data.match_id],
    );
    // clear booster on other matches in this matchday, set on this one
    await pool.query(
      `UPDATE predictions p
       SET booster=false
       FROM matches m
       WHERE p.match_id = m.id AND m.matchday_id=$1 AND p.user_id=$2`,
      [data.matchday_id, me.id],
    );
    await pool.query(
      `UPDATE predictions SET booster=true WHERE user_id=$1 AND match_id=$2`,
      [me.id, data.match_id],
    );
    return { ok: true };
  });

export const getLeaderboard = createServerFn({ method: "GET" })
  .inputValidator(z.object({ league_id: z.string().uuid().optional() }).optional())
  .handler(async ({ data }) => {
    const { pool } = await import("./lovable/database");
    const leagueId = data?.league_id;
    const params: unknown[] = [];
    let scope = "";
    if (leagueId) {
      params.push(leagueId);
      scope = `JOIN league_members lm ON lm.user_id = u.id AND lm.league_id = $1`;
    }
    const { rows } = await pool.query(
      `SELECT u.id, p.display_name, p.country, p.favourite_team,
              COALESCE(SUM(pr.points),0)::int AS total_points,
              COUNT(pr.id) FILTER (WHERE pr.points IS NOT NULL)::int AS scored_predictions
       FROM app_users u
       JOIN profiles p ON p.user_id = u.id
       ${scope}
       LEFT JOIN predictions pr ON pr.user_id = u.id
       GROUP BY u.id, p.display_name, p.country, p.favourite_team
       ORDER BY total_points DESC, p.display_name ASC
       LIMIT 200`,
      params,
    );
    return rows as Array<{
      id: string;
      display_name: string;
      country: string;
      favourite_team: string;
      total_points: number;
      scored_predictions: number;
    }>;
  });

// Leagues
function genCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

export const createLeagueFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ name: z.string().trim().min(2).max(50) }))
  .handler(async ({ data }) => {
    const { pool } = await import("./lovable/database");
    const { requireUser } = await import("./auth.server");
    const me = await requireUser();
    let code = genCode();
    // retry on collision
    for (let i = 0; i < 5; i++) {
      const c = await pool.query("SELECT 1 FROM leagues WHERE invite_code=$1", [code]);
      if (!c.rows.length) break;
      code = genCode();
    }
    const { rows } = await pool.query(
      "INSERT INTO leagues (name, invite_code, owner_id) VALUES ($1,$2,$3) RETURNING id",
      [data.name, code, me.id],
    );
    await pool.query(
      "INSERT INTO league_members (league_id, user_id) VALUES ($1,$2)",
      [rows[0].id, me.id],
    );
    return { id: rows[0].id, invite_code: code };
  });

export const joinLeagueFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ invite_code: z.string().trim().toUpperCase().min(4).max(12) }))
  .handler(async ({ data }) => {
    const { pool } = await import("./lovable/database");
    const { requireUser } = await import("./auth.server");
    const me = await requireUser();
    const { rows } = await pool.query("SELECT id FROM leagues WHERE invite_code=$1", [
      data.invite_code,
    ]);
    if (!rows.length) throw new Error("Invalid invite code.");
    await pool.query(
      `INSERT INTO league_members (league_id, user_id) VALUES ($1,$2)
       ON CONFLICT DO NOTHING`,
      [rows[0].id, me.id],
    );
    return { id: rows[0].id };
  });

export const getMyLeagues = createServerFn({ method: "GET" }).handler(async () => {
  const { pool } = await import("./lovable/database");
  const { loadCurrentUser } = await import("./auth.server");
  const me = await loadCurrentUser();
  if (!me) return [];
  const { rows } = await pool.query(
    `SELECT l.id, l.name, l.invite_code, l.owner_id,
            (SELECT COUNT(*)::int FROM league_members WHERE league_id=l.id) AS member_count
     FROM leagues l
     JOIN league_members m ON m.league_id = l.id
     WHERE m.user_id = $1
     ORDER BY l.created_at DESC`,
    [me.id],
  );
  return rows as Array<{
    id: string;
    name: string;
    invite_code: string;
    owner_id: string;
    member_count: number;
  }>;
});

// Admin
export const adminListMatchdays = createServerFn({ method: "GET" }).handler(async () => {
  const { pool } = await import("./lovable/database");
  const { requireUser } = await import("./auth.server");
  const me = await requireUser();
  if (!me.is_admin) throw new Error("Forbidden");
  const { rows } = await pool.query(
    `SELECT md.*,
            (SELECT json_agg(m ORDER BY m.kickoff_at) FROM matches m WHERE m.matchday_id=md.id) AS matches
     FROM matchdays md ORDER BY md.starts_at ASC`,
  );
  return rows;
});

export const adminSetResultFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      match_id: z.number().int(),
      home_score: z.number().int().min(0).max(50),
      away_score: z.number().int().min(0).max(50),
      first_scorer: scorerEnum,
    }),
  )
  .handler(async ({ data }) => {
    const { pool } = await import("./lovable/database");
    const { requireUser } = await import("./auth.server");
    const me = await requireUser();
    if (!me.is_admin) throw new Error("Forbidden");
    await pool.query(
      `UPDATE matches SET home_score=$1, away_score=$2, first_scorer=$3, is_final=true WHERE id=$4`,
      [data.home_score, data.away_score, data.first_scorer, data.match_id],
    );
    return { ok: true };
  });

export const adminScoreMatchdayFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ matchday_id: z.number().int() }))
  .handler(async ({ data }) => {
    const { pool } = await import("./lovable/database");
    const { requireUser } = await import("./auth.server");
    const me = await requireUser();
    if (!me.is_admin) throw new Error("Forbidden");
    const { rows: matches } = await pool.query(
      "SELECT * FROM matches WHERE matchday_id=$1 AND is_final=true",
      [data.matchday_id],
    );
    for (const m of matches) {
      const { rows: preds } = await pool.query(
        "SELECT * FROM predictions WHERE match_id=$1",
        [m.id],
      );
      for (const p of preds) {
        let pts = 0;
        const actualResult =
          m.home_score > m.away_score ? "H" : m.home_score < m.away_score ? "A" : "D";
        const predResult =
          p.home_goals > p.away_goals ? "H" : p.home_goals < p.away_goals ? "A" : "D";
        if (actualResult === predResult) pts += 3;
        if (p.home_goals === m.home_score) pts += 2;
        if (p.away_goals === m.away_score) pts += 2;
        if (p.home_goals - p.away_goals === m.home_score - m.away_score) pts += 3;
        if (p.first_scorer && p.first_scorer === m.first_scorer) pts += 3;
        if (p.booster) pts *= 2;
        await pool.query("UPDATE predictions SET points=$1 WHERE id=$2", [pts, p.id]);
      }
    }
    await pool.query("UPDATE matchdays SET is_scored=true WHERE id=$1", [data.matchday_id]);
    return { ok: true };
  });

export const adminAddMatchdayFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      name: z.string().trim().min(2).max(80),
      starts_at: z.string(),
      matches: z
        .array(
          z.object({
            home_team: z.string().trim().min(2),
            away_team: z.string().trim().min(2),
            kickoff_at: z.string(),
          }),
        )
        .length(6),
    }),
  )
  .handler(async ({ data }) => {
    const { pool } = await import("./lovable/database");
    const { requireUser } = await import("./auth.server");
    const me = await requireUser();
    if (!me.is_admin) throw new Error("Forbidden");
    const md = await pool.query(
      "INSERT INTO matchdays (name, starts_at) VALUES ($1,$2) RETURNING id",
      [data.name, data.starts_at],
    );
    const mdId = md.rows[0].id;
    for (const m of data.matches) {
      await pool.query(
        "INSERT INTO matches (matchday_id, home_team, away_team, kickoff_at) VALUES ($1,$2,$3,$4)",
        [mdId, m.home_team, m.away_team, m.kickoff_at],
      );
    }
    return { id: mdId };
  });

export const makeMeAdminFn = createServerFn({ method: "POST" }).handler(async () => {
  // Bootstrap helper: first user can claim admin if no admin exists yet.
  const { pool } = await import("./lovable/database");
  const { requireUser } = await import("./auth.server");
  const me = await requireUser();
  const { rows } = await pool.query("SELECT COUNT(*)::int AS c FROM app_users WHERE is_admin=true");
  if (rows[0].c > 0 && !me.is_admin) throw new Error("An admin already exists.");
  await pool.query("UPDATE app_users SET is_admin=true WHERE id=$1", [me.id]);
  return { ok: true };
});
