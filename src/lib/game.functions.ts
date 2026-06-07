import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MatchStatus = "upcoming" | "live" | "completed" | "cancelled";

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
  stadium: string | null;
  city: string | null;
  host_country: string | null;
  group_letter: string | null;
  phase: string | null;
  teams_confirmed: boolean;
  status: MatchStatus;
  effective_status: MatchStatus;
  prediction: {
    home_goals: number;
    away_goals: number;
    first_scorer: string;
    booster: boolean;
    points: number | null;
  } | null;
  locked: boolean;
};

const scorerEnum = z.enum(["home", "away", "none"]);

function mapMatch(
  m: {
    id: number;
    matchday_id: number;
    home_team: string;
    away_team: string;
    kickoff_at: string;
    home_score: number | null;
    away_score: number | null;
    first_scorer: string | null;
    is_final: boolean;
    phase: string | null;
    stadium?: string | null;
    city?: string | null;
    host_country?: string | null;
    group_letter?: string | null;
    teams_confirmed?: boolean;
    status?: string | null;
  },
  p: {
    home_goals: number;
    away_goals: number;
    first_scorer: string;
    booster: boolean;
    points: number | null;
  } | undefined,
  now: number,
): MatchRow {
  const status = ((m.status as MatchStatus | null | undefined) ?? "upcoming") as MatchStatus;
  const kickoffPassed = new Date(m.kickoff_at).getTime() <= now;
  const effective_status: MatchStatus =
    status === "upcoming" && kickoffPassed ? "live" : status;
  return {
    id: m.id,
    matchday_id: m.matchday_id,
    home_team: m.home_team,
    away_team: m.away_team,
    kickoff_at: m.kickoff_at,
    home_score: m.home_score,
    away_score: m.away_score,
    first_scorer: m.first_scorer,
    is_final: m.is_final,
    stadium: m.stadium ?? null,
    city: m.city ?? null,
    host_country: m.host_country ?? null,
    group_letter: m.group_letter ?? null,
    phase: m.phase ?? null,
    teams_confirmed: m.teams_confirmed ?? true,
    status,
    effective_status,
    locked: effective_status !== "upcoming",
    prediction: p
      ? {
          home_goals: p.home_goals,
          away_goals: p.away_goals,
          first_scorer: p.first_scorer,
          booster: p.booster,
          points: p.points,
        }
      : null,
  };
}

// ---------- Authenticated reads ----------

export const getAllMatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: matches, error: mErr }, { data: preds, error: pErr }] = await Promise.all([
      supabase
        .from("matches")
        .select("*")
        .order("kickoff_at", { ascending: true })
        .order("id", { ascending: true }),
      supabase.from("predictions").select("*").eq("user_id", userId),
    ]);
    if (mErr) throw new Error(mErr.message);
    if (pErr) throw new Error(pErr.message);
    const predByMatch = new Map<number, (typeof preds)[number]>();
    for (const p of preds ?? []) predByMatch.set(p.match_id, p);
    const now = Date.now();
    const rows: MatchRow[] = (matches ?? []).map((m) => mapMatch(m, predByMatch.get(m.id), now));
    return rows;
  });

export const getAllMatchesPublic = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: matches, error } = await supabaseAdmin
    .from("matches")
    .select("*")
    .order("kickoff_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);
  const now = Date.now();
  return (matches ?? []).map((m) => mapMatch(m, undefined, now));
});

export const getMatchdaysWithProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [
      { data: mds, error: mdErr },
      { data: matches, error: mErr },
      { data: preds, error: pErr },
    ] = await Promise.all([
      supabase
        .from("matchdays")
        .select("id, name, starts_at, is_scored")
        .order("starts_at", { ascending: true }),
      supabase.from("matches").select("id, matchday_id, kickoff_at, teams_confirmed, is_final"),
      supabase.from("predictions").select("match_id").eq("user_id", userId),
    ]);
    if (mdErr) throw new Error(mdErr.message);
    if (mErr) throw new Error(mErr.message);
    if (pErr) throw new Error(pErr.message);
    const predSet = new Set((preds ?? []).map((p) => p.match_id));
    const byMd = new Map<number, { total: number; available: number; predicted: number }>();
    for (const m of matches ?? []) {
      const tc = (m as { teams_confirmed?: boolean }).teams_confirmed ?? true;
      const row = byMd.get(m.matchday_id) ?? { total: 0, available: 0, predicted: 0 };
      row.total += 1;
      if (tc) row.available += 1;
      if (predSet.has(m.id)) row.predicted += 1;
      byMd.set(m.matchday_id, row);
    }
    return (mds ?? []).map((md) => {
      const r = byMd.get(md.id) ?? { total: 0, available: 0, predicted: 0 };
      return {
        id: md.id,
        name: md.name,
        starts_at: md.starts_at,
        is_scored: md.is_scored,
        total: r.total,
        available: r.available,
        predicted: r.predicted,
      };
    });
  });

export const getPlayOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const nowIso = new Date().toISOString();
    const [
      { count: totalConfirmed },
      { count: openCount },
      { data: nextRow },
      { data: predRows },
    ] = await Promise.all([
      supabase
        .from("matches")
        .select("id", { count: "exact", head: true })
        .eq("teams_confirmed", true),
      supabase
        .from("matches")
        .select("id", { count: "exact", head: true })
        .eq("teams_confirmed", true)
        .gt("kickoff_at", nowIso),
      supabase
        .from("matches")
        .select("kickoff_at, home_team, away_team")
        .eq("teams_confirmed", true)
        .gt("kickoff_at", nowIso)
        .order("kickoff_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("predictions")
        .select("match_id, match:matches(teams_confirmed)")
        .eq("user_id", userId),
    ]);
    const predicted = (predRows ?? []).filter(
      (p) => (p.match as { teams_confirmed?: boolean } | null)?.teams_confirmed !== false,
    ).length;
    return {
      total: totalConfirmed ?? 0,
      open: openCount ?? 0,
      predicted,
      remaining: Math.max(0, (openCount ?? 0) - predicted),
      next: nextRow
        ? {
            kickoff_at: nextRow.kickoff_at,
            home_team: nextRow.home_team,
            away_team: nextRow.away_team,
          }
        : null,
    };
  });

// ---------- Write paths ----------

export const savePredictionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      match_id: z.number().int(),
      home_goals: z.number().int().min(0).max(20),
      away_goals: z.number().int().min(0).max(20),
      first_scorer: scorerEnum,
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: match, error: mErr } = await supabase
      .from("matches")
      .select("kickoff_at, status, teams_confirmed")
      .eq("id", data.match_id)
      .maybeSingle();
    if (mErr) throw new Error(mErr.message);
    if (!match) throw new Error("Match not found.");
    if ((match as { teams_confirmed?: boolean }).teams_confirmed === false)
      throw new Error("Teams not confirmed yet.");
    if (
      new Date(match.kickoff_at).getTime() <= Date.now() ||
      (match.status ?? "upcoming") !== "upcoming"
    ) {
      throw new Error("Predictions are locked for this match");
    }
    const { error } = await supabase.from("predictions").upsert(
      {
        user_id: userId,
        match_id: data.match_id,
        home_goals: data.home_goals,
        away_goals: data.away_goals,
        first_scorer: data.first_scorer,
      },
      { onConflict: "user_id,match_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setBoosterFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ matchday_id: z.number().int(), match_id: z.number().int() }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: match, error: mErr } = await supabase
      .from("matches")
      .select("kickoff_at, teams_confirmed, status")
      .eq("id", data.match_id)
      .eq("matchday_id", data.matchday_id)
      .maybeSingle();
    if (mErr) throw new Error(mErr.message);
    if (!match) throw new Error("Match not found.");
    if ((match as { teams_confirmed?: boolean }).teams_confirmed === false)
      throw new Error("Teams not confirmed yet.");
    if (
      new Date(match.kickoff_at).getTime() <= Date.now() ||
      (match.status ?? "upcoming") !== "upcoming"
    )
      throw new Error("Too late to change booster — match is locked.");

    const { data: existing } = await supabase
      .from("predictions")
      .select("id")
      .eq("user_id", userId)
      .eq("match_id", data.match_id)
      .maybeSingle();
    if (!existing) {
      const { error } = await supabase.from("predictions").insert({
        user_id: userId,
        match_id: data.match_id,
        home_goals: 0,
        away_goals: 0,
        first_scorer: "none",
        booster: true,
      });
      if (error) throw new Error(error.message);
    }

    const { data: mdMatches } = await supabase
      .from("matches")
      .select("id")
      .eq("matchday_id", data.matchday_id);
    const otherIds = (mdMatches ?? []).map((m) => m.id).filter((id) => id !== data.match_id);
    if (otherIds.length) {
      const { error: clrErr } = await supabase
        .from("predictions")
        .update({ booster: false })
        .eq("user_id", userId)
        .in("match_id", otherIds);
      if (clrErr) throw new Error(clrErr.message);
    }
    const { error: setErr } = await supabase
      .from("predictions")
      .update({ booster: true })
      .eq("user_id", userId)
      .eq("match_id", data.match_id);
    if (setErr) throw new Error(setErr.message);
    return { ok: true };
  });

// ---------- Leaderboards ----------

export const getLeaderboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ league_id: z.string().uuid().optional() }).optional())
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data?.league_id) {
      const { data: member } = await supabase
        .from("league_members")
        .select("user_id")
        .eq("league_id", data.league_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (!member) throw new Error("Forbidden");
    }
    const { data: rows, error } = await supabase.rpc(
      "global_leaderboard",
      data?.league_id ? { _league_id: data.league_id } : {},
    );
    if (error) {
      console.error("[getLeaderboard]", error);
      throw new Error("Unable to load leaderboard.");
    }
    return (rows ?? []) as Array<{
      id: string;
      display_name: string;
      country: string;
      favourite_team: string;
      total_points: number;
      scored_predictions: number;
      last_md_points: number;
      current_streak: number;
    }>;
  });


export const getMatchdayLeaderboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z
      .object({
        matchday_id: z.number().int().optional(),
        league_id: z.string().uuid().optional(),
      })
      .optional(),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data?.league_id) {
      const { data: member } = await supabase
        .from("league_members")
        .select("user_id")
        .eq("league_id", data.league_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (!member) throw new Error("Forbidden");
    }
    const args: { _matchday_id?: number; _league_id?: string } = {};
    if (data?.matchday_id != null) args._matchday_id = data.matchday_id;
    if (data?.league_id) args._league_id = data.league_id;
    const { data: rows, error } = await supabase.rpc("matchday_leaderboard", args);
    if (error) {
      console.error("[getMatchdayLeaderboard]", error);
      throw new Error("Unable to load leaderboard.");
    }
    const list = (rows ?? []) as Array<{
      matchday_id: number;
      matchday_name: string;
      id: string;
      display_name: string;
      country: string;
      favourite_team: string;
      total_points: number;
      rank: number | null;
    }>;
    if (!list.length) return { matchday: null, rows: [] as Array<never> };
    return {
      matchday: { id: list[0].matchday_id, name: list[0].matchday_name },
      rows: list.map(({ id, display_name, country, favourite_team, total_points, rank }) => ({
        id,
        display_name,
        country,
        favourite_team,
        total_points,
        rank,
      })),
    };
  });

// Public leaderboards are GLOBAL only — never accept league_id, since private
// league membership cannot be enforced for unauthenticated callers.
export const getLeaderboardPublic = createServerFn({ method: "GET" })
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("global_leaderboard", {});
    if (error) {
      console.error("[getLeaderboardPublic]", error);
      throw new Error("Unable to load leaderboard.");
    }
    return (rows ?? []) as Array<{
      id: string;
      display_name: string;
      country: string;
      favourite_team: string;
      total_points: number;
      scored_predictions: number;
      last_md_points: number;
      current_streak: number;
    }>;
  });

export const getMatchdayLeaderboardPublic = createServerFn({ method: "GET" })
  .inputValidator(
    z
      .object({
        matchday_id: z.number().int().optional(),
      })
      .optional(),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const args: { _matchday_id?: number } = {};
    if (data?.matchday_id != null) args._matchday_id = data.matchday_id;
    const { data: rows, error } = await supabaseAdmin.rpc("matchday_leaderboard", args);
    if (error) {
      console.error("[getMatchdayLeaderboardPublic]", error);
      throw new Error("Unable to load leaderboard.");
    }
    const list = (rows ?? []) as Array<{
      matchday_id: number;
      matchday_name: string;
      id: string;
      display_name: string;
      country: string;
      favourite_team: string;
      total_points: number;
      rank: number | null;
    }>;
    if (!list.length) return { matchday: null, rows: [] as Array<never> };
    return {
      matchday: { id: list[0].matchday_id, name: list[0].matchday_name },
      rows: list.map(({ id, display_name, country, favourite_team, total_points, rank }) => ({
        id,
        display_name,
        country,
        favourite_team,
        total_points,
        rank,
      })),
    };

  });

// ---------- Leagues ----------

function genCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 4; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `MRC-${s}`;
}

const MAX_OWNED_LEAGUES = 3;

export const createLeagueFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ name: z.string().trim().min(2).max(50) }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { count, error: cErr } = await supabase
      .from("leagues")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId);
    if (cErr) throw new Error(cErr.message);
    if ((count ?? 0) >= MAX_OWNED_LEAGUES)
      throw new Error("You've reached the 3-league creation limit.");

    let code = genCode();
    for (let i = 0; i < 5; i++) {
      const { data: existing } = await supabase
        .from("leagues")
        .select("id")
        .eq("invite_code", code)
        .maybeSingle();
      if (!existing) break;
      code = genCode();
    }
    const { data: league, error: insErr } = await supabase
      .from("leagues")
      .insert({ name: data.name, invite_code: code, owner_id: userId })
      .select("id")
      .single();
    if (insErr || !league) throw new Error(insErr?.message ?? "Failed to create league.");
    const { error: memErr } = await supabase
      .from("league_members")
      .insert({ league_id: league.id, user_id: userId });
    if (memErr) throw new Error(memErr.message);
    return { id: league.id, invite_code: code };
  });

export const joinLeagueFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z
      .object({ invite_code: z.string().trim().min(4).max(16) })
      .transform((v) => {
        let code = v.invite_code.toUpperCase().replace(/\s+/g, "");
        if (!code.startsWith("MRC-")) code = `MRC-${code}`;
        return { invite_code: code };
      }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: league } = await supabase
      .from("leagues")
      .select("id")
      .eq("invite_code", data.invite_code)
      .maybeSingle();
    if (!league) throw new Error("Invalid invite code.");
    const { error } = await supabase
      .from("league_members")
      .upsert(
        { league_id: league.id, user_id: userId },
        { onConflict: "league_id,user_id", ignoreDuplicates: true },
      );
    if (error) throw new Error(error.message);
    return { id: league.id };
  });

export const getMyLeagues = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase.rpc("my_leagues");
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      id: string;
      name: string;
      invite_code: string;
      owner_id: string;
      member_count: number;
      my_points: number;
      my_rank: number | null;
    }>;
  });

// ---------- Admin ----------

async function assertAdmin(supabase: ReturnType<typeof Object>, userId: string) {
  const c = supabase as unknown as {
    from: (t: string) => {
      select: (s: string) => {
        eq: (
          a: string,
          b: string,
        ) => { eq: (a: string, b: string) => { maybeSingle: () => Promise<{ data: unknown }> } };
      };
    };
  };
  const { data } = await c.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Forbidden");
}

export const adminListMatchdays = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: mds, error } = await supabase
      .from("matchdays")
      .select("*")
      .order("starts_at", { ascending: true });
    if (error) throw new Error(error.message);
    const { data: ms, error: mErr } = await supabase
      .from("matches")
      .select("*")
      .order("kickoff_at", { ascending: true });
    if (mErr) throw new Error(mErr.message);
    const { data: predCounts, error: pcErr } = await supabase
      .from("predictions")
      .select("match_id");
    if (pcErr) throw new Error(pcErr.message);
    const predsByMatch = new Map<number, number>();
    for (const p of predCounts ?? []) {
      predsByMatch.set(p.match_id, (predsByMatch.get(p.match_id) ?? 0) + 1);
    }
    const byMd = new Map<number, typeof ms>();
    for (const m of ms ?? []) {
      const arr = byMd.get(m.matchday_id) ?? [];
      arr.push(m);
      byMd.set(m.matchday_id, arr);
    }
    return (mds ?? []).map((md) => {
      const matches = byMd.get(md.id) ?? [];
      const predCount = matches.reduce(
        (sum, m) => sum + (predsByMatch.get(m.id) ?? 0),
        0,
      );
      return { ...md, matches, prediction_count: predCount };
    });
  });

export const adminSetResultFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      match_id: z.number().int(),
      home_score: z.number().int().min(0).max(50),
      away_score: z.number().int().min(0).max(50),
      first_scorer: scorerEnum,
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabase
      .from("matches")
      .update({
        home_score: data.home_score,
        away_score: data.away_score,
        first_scorer: data.first_scorer,
        is_final: true,
        status: "completed",
      })
      .eq("id", data.match_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminSetMatchStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      match_id: z.number().int(),
      status: z.enum(["upcoming", "live", "completed", "cancelled"]),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const patch: {
      status: "upcoming" | "live" | "completed" | "cancelled";
      is_final?: boolean;
      home_score?: number | null;
      away_score?: number | null;
      first_scorer?: string | null;
    } = { status: data.status };
    if (data.status === "upcoming") {
      patch.is_final = false;
      patch.home_score = null;
      patch.away_score = null;
      patch.first_scorer = null;
    }
    const { error } = await supabase
      .from("matches")
      .update(patch)
      .eq("id", data.match_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminMatchdayScoringSummaryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ matchday_id: z.number().int() }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: rows, error } = await supabase
      .from("predictions")
      .select("points, matches!inner(matchday_id)")
      .eq("matches.matchday_id", data.matchday_id)
      .not("points", "is", null);
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as Array<{ points: number | null }>;
    const scored = list.length;
    const avg = scored
      ? Math.round((list.reduce((s, r) => s + (r.points ?? 0), 0) / scored) * 10) / 10
      : 0;
    return { predictions_scored: scored, avg_points: avg };
  });

export const adminScoreMatchdayFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ matchday_id: z.number().int() }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: count, error } = await supabase.rpc("score_matchday", {
      _matchday_id: data.matchday_id,
    });
    if (error) {
      console.error("[adminScoreMatchdayFn]", error);
      throw new Error("Failed to score matchday.");
    }
    return { ok: true, users_scored: (count as number) ?? 0 };
  });


export const adminAddMatchdayFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      name: z.string().trim().min(2).max(80),
      starts_at: z.string(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: md, error } = await supabase
      .from("matchdays")
      .insert({ name: data.name, starts_at: data.starts_at })
      .select("id")
      .single();
    if (error || !md) throw new Error(error?.message ?? "Failed to create matchday.");
    return { id: md.id };
  });

export const adminAddMatchFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      matchday_id: z.number().int(),
      home_team: z.string().trim().min(1),
      away_team: z.string().trim().min(1),
      kickoff_at: z.string(),
      phase: z.string().trim().max(40).optional().nullable(),
      teams_confirmed: z.boolean().optional().default(true),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: row, error } = await supabase
      .from("matches")
      .insert({
        matchday_id: data.matchday_id,
        home_team: data.home_team,
        away_team: data.away_team,
        kickoff_at: data.kickoff_at,
        phase: data.phase ?? null,
        teams_confirmed: data.teams_confirmed ?? true,
      })
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Failed to add match.");
    return { id: row.id };
  });

export const adminListPredictionsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ matchday_id: z.number().int() }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: matches, error: mErr } = await supabase
      .from("matches")
      .select("*")
      .eq("matchday_id", data.matchday_id);
    if (mErr) throw new Error(mErr.message);
    const matchIds = (matches ?? []).map((m) => m.id);
    if (!matchIds.length) return [];
    const { data: preds, error: pErr } = await supabase
      .from("predictions")
      .select("*")
      .in("match_id", matchIds);
    if (pErr) throw new Error(pErr.message);
    const userIds = Array.from(new Set((preds ?? []).map((p) => p.user_id)));
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name")
      .in("user_id", userIds);
    const profileMap = new Map<string, string>();
    for (const p of profiles ?? []) profileMap.set(p.user_id, p.display_name);
    const matchMap = new Map<number, (typeof matches)[number]>();
    for (const m of matches ?? []) matchMap.set(m.id, m);
    return (preds ?? [])
      .map((p) => {
        const m = matchMap.get(p.match_id)!;
        return {
          id: p.id,
          home_goals: p.home_goals,
          away_goals: p.away_goals,
          pred_first_scorer: p.first_scorer,
          booster: p.booster,
          points: p.points,
          match_id: m.id,
          home_team: m.home_team,
          away_team: m.away_team,
          kickoff_at: m.kickoff_at,
          home_score: m.home_score,
          away_score: m.away_score,
          actual_first_scorer: m.first_scorer,
          is_final: m.is_final,
          display_name: profileMap.get(p.user_id) ?? null,
          email: "",
        };
      })
      .sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at) || a.match_id - b.match_id);
  });

export const adminSetTeamsConfirmedFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ match_id: z.number().int(), confirmed: z.boolean() }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabase
      .from("matches")
      .update({ teams_confirmed: data.confirmed })
      .eq("id", data.match_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminUpdateMatchTeamsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      match_id: z.number().int(),
      home_team: z.string().trim().min(1).max(80),
      away_team: z.string().trim().min(1).max(80),
      teams_confirmed: z.boolean().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const patch: {
      home_team: string;
      away_team: string;
      teams_confirmed?: boolean;
    } = {
      home_team: data.home_team,
      away_team: data.away_team,
    };
    if (typeof data.teams_confirmed === "boolean") {
      patch.teams_confirmed = data.teams_confirmed;
    }
    const { error } = await supabase
      .from("matches")
      .update(patch)
      .eq("id", data.match_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- History / Profile ----------

export const getMyHistoryFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: preds, error } = await supabase
      .from("predictions")
      .select("*, match:matches(*, matchday:matchdays(*))")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    type Row = (typeof preds)[number] & {
      match: {
        id: number;
        home_team: string;
        away_team: string;
        home_score: number | null;
        away_score: number | null;
        first_scorer: string | null;
        is_final: boolean;
        matchday: { id: number; name: string; starts_at: string };
      };
    };
    const map = new Map<
      number,
      {
        matchday_id: number;
        matchday_name: string;
        starts_at: string;
        matches: Array<{
          match_id: number;
          home_team: string;
          away_team: string;
          home_score: number | null;
          away_score: number | null;
          actual_first_scorer: string | null;
          is_final: boolean;
          pred_home: number;
          pred_away: number;
          pred_first: string | null;
          booster: boolean;
          points: number | null;
        }>;
      }
    >();
    for (const raw of (preds ?? []) as Row[]) {
      const md = raw.match.matchday;
      if (!map.has(md.id))
        map.set(md.id, {
          matchday_id: md.id,
          matchday_name: md.name,
          starts_at: md.starts_at,
          matches: [],
        });
      map.get(md.id)!.matches.push({
        match_id: raw.match.id,
        home_team: raw.match.home_team,
        away_team: raw.match.away_team,
        home_score: raw.match.home_score,
        away_score: raw.match.away_score,
        actual_first_scorer: raw.match.first_scorer,
        is_final: raw.match.is_final,
        pred_home: raw.home_goals,
        pred_away: raw.away_goals,
        pred_first: raw.first_scorer,
        booster: raw.booster,
        points: raw.points,
      });
    }
    return Array.from(map.values()).sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  });

export const getMyMatchdayScoresFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("matchday_scores")
      .select("matchday_id, total_points, rank, matchday:matchdays(name, starts_at)")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    type Row = {
      matchday_id: number;
      total_points: number;
      rank: number | null;
      matchday: { name: string; starts_at: string };
    };
    return ((data ?? []) as Row[])
      .map((r) => ({
        matchday_id: r.matchday_id,
        name: r.matchday.name,
        starts_at: r.matchday.starts_at,
        total_points: r.total_points,
        rank: r.rank,
      }))
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  });

export const getMyProfileStatsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ count: totalMatches }, { data: preds, error: pErr }] = await Promise.all([
      supabase
        .from("matches")
        .select("id", { count: "exact", head: true })
        .eq("teams_confirmed", true),
      supabase
        .from("predictions")
        .select("home_goals, away_goals, points, match:matches(home_team, away_team, is_final)")
        .eq("user_id", userId),
    ]);
    if (pErr) throw new Error(pErr.message);
    type Pred = {
      home_goals: number;
      away_goals: number;
      points: number | null;
      match: { home_team: string; away_team: string; is_final: boolean } | null;
    };
    const list = (preds ?? []) as Pred[];
    const scored = list.filter((p) => p.points != null);
    const withPoints = scored.filter((p) => (p.points ?? 0) > 0);
    const winnerCount = new Map<string, number>();
    for (const p of list) {
      const m = p.match;
      if (!m) continue;
      const winner =
        p.home_goals > p.away_goals
          ? m.home_team
          : p.away_goals > p.home_goals
          ? m.away_team
          : null;
      if (winner) winnerCount.set(winner, (winnerCount.get(winner) ?? 0) + 1);
    }
    let mostPredictedWinner: { team: string; count: number } | null = null;
    for (const [team, count] of winnerCount) {
      if (!mostPredictedWinner || count > mostPredictedWinner.count) {
        mostPredictedWinner = { team, count };
      }
    }
    return {
      predicted: list.length,
      total: totalMatches ?? 0,
      accuracy_pct: scored.length ? Math.round((withPoints.length / scored.length) * 100) : null,
      most_predicted_winner: mostPredictedWinner,
    };
  });

// ---------- Public reads ----------

export const getUpcomingMatchesPublic = createServerFn({ method: "GET" }).handler(
  async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nowIso = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("matches")
      .select("id, home_team, away_team, kickoff_at, stadium, city")
      .gt("kickoff_at", nowIso)
      .eq("is_final", false)
      .eq("teams_confirmed", true)
      .order("kickoff_at", { ascending: true })
      .limit(3);
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      id: number;
      home_team: string;
      away_team: string;
      kickoff_at: string;
      stadium: string | null;
      city: string | null;
    }>;
  },
);

export const getFixtureStatsPublic = createServerFn({ method: "GET" }).handler(
  async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ count: matchCount }, { count: mdCount }] = await Promise.all([
      supabaseAdmin.from("matches").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("matchdays").select("id", { count: "exact", head: true }),
    ]);
    return { matches: matchCount ?? 0, matchdays: mdCount ?? 0 };
  },
);
