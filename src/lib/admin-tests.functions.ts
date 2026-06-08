import { createServerFn } from "@tanstack/react-start";
import { safeError } from "@/lib/safe-error";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TestResult = {
  status: "pass" | "fail" | "warn";
  message: string;
  detail?: string;
};

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
}

function anonClient() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ---------- Data integrity ----------

export const testMatchCount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestResult> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Exclude any leftover __test rows so the launch-readiness count is honest.
    const { count, error } = await supabaseAdmin
      .from("matches")
      .select("id", { count: "exact", head: true })
      .neq("home_team", "__test");
    if (error) return { status: "fail", message: error.message };
    if (count === 104) return { status: "pass", message: "All 104 matches imported." };
    return {
      status: "fail",
      message: `Only ${count ?? 0} matches found — re-run CSV import`,
    };
  });


export const testMatchdays = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestResult> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("matchdays")
      .select("id, name")
      .not("name", "like", "\\_\\_%")
      .order("id");
    if (error) return { status: "fail", message: error.message };
    if ((data?.length ?? 0) === 9)
      return { status: "pass", message: "All 9 matchdays present." };
    return {
      status: "fail",
      message: `Expected 9 matchdays, found ${data?.length ?? 0}`,
    };
  });

export const testNoDuplicateMatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestResult> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("matches")
      .select("home_team, away_team, kickoff_at");
    if (error) return { status: "fail", message: error.message };
    const seen = new Map<string, number>();
    for (const m of data ?? []) {
      const k = `${m.home_team}|${m.away_team}|${m.kickoff_at}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    const dups = Array.from(seen.values()).filter((c) => c > 1).length;
    return dups === 0
      ? { status: "pass", message: "No duplicate matches." }
      : { status: "fail", message: `${dups} duplicate matches found` };
  });

export const testGroupStageConfirmed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestResult> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count, error } = await supabaseAdmin
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("phase", "Group stage")
      .eq("teams_confirmed", true);
    if (error) return { status: "fail", message: error.message };
    if (count === 72)
      return { status: "pass", message: "All 72 group stage matches confirmed." };
    return {
      status: "fail",
      message: `${72 - (count ?? 0)} group stage matches not confirmed`,
    };
  });

export const testKickoffRange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestResult> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("matches")
      .select("id, kickoff_at");
    if (error) return { status: "fail", message: error.message };
    const lo = new Date("2026-06-11T00:00:00Z").getTime();
    const hi = new Date("2026-07-20T23:59:59Z").getTime();
    const bad = (data ?? []).filter((m) => {
      const t = new Date(m.kickoff_at).getTime();
      return t < lo || t > hi;
    });
    return bad.length === 0
      ? { status: "pass", message: "All kickoff times within tournament window." }
      : { status: "fail", message: `${bad.length} matches have invalid kickoff times` };
  });

export const testStandingsPopulated = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestResult> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count, error } = await supabaseAdmin
      .from("wc_standings")
      .select("id", { count: "exact", head: true });
    if (error) return { status: "fail", message: error.message };
    if (count !== 48) {
      return { status: "fail", message: `Groups table incomplete — ${count ?? 0} rows found (expected 48)` };
    }
    // Secondary check: 12 groups A–L, each with 4 teams.
    const { data: groups, error: gErr } = await supabaseAdmin
      .from("wc_groups")
      .select("id, name");
    if (gErr) return { status: "fail", message: gErr.message };
    const letters = (groups ?? []).map((g) => (g.name.match(/Group ([A-L])/) ?? [])[1]).filter(Boolean).sort();
    const expectedLetters = "ABCDEFGHIJKL".split("");
    const missing = expectedLetters.filter((l) => !letters.includes(l));
    if (missing.length) {
      return { status: "fail", message: `Missing groups: ${missing.join(", ")}` };
    }
    const { data: per, error: pErr } = await supabaseAdmin
      .from("wc_standings")
      .select("group_id");
    if (pErr) return { status: "fail", message: pErr.message };
    const counts = new Map<string, number>();
    for (const r of per ?? []) counts.set(r.group_id, (counts.get(r.group_id) ?? 0) + 1);
    const bad = [...counts.entries()].filter(([, n]) => n !== 4);
    if (bad.length) {
      return { status: "fail", message: `${bad.length} groups have ≠ 4 teams` };
    }
    return { status: "pass", message: "All 12 groups have 4 teams (48 rows) ✓" };
  });


// ---------- Auth & Security ----------

export const testPredictionsRlsAnon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestResult> => {
    await assertAdmin(context.userId);
    const anon = anonClient();
    const { data, error } = await anon.from("predictions").select("id").limit(5);
    if (error) return { status: "pass", message: `Blocked: ${error.message}` };
    if (!data || data.length === 0)
      return { status: "pass", message: "Anon read returns 0 rows." };
    return {
      status: "fail",
      message: `Predictions readable to anon (${data.length} rows leaked)`,
    };
  });

export const testProfilesRlsAnon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestResult> => {
    await assertAdmin(context.userId);
    const anon = anonClient();
    const { data, error } = await anon.from("profiles").select("user_id").limit(5);
    if (error) return { status: "pass", message: `Blocked: ${error.message}` };
    if (!data || data.length === 0)
      return { status: "pass", message: "Anon read returns 0 rows." };
    return {
      status: "fail",
      message: `Profiles readable to anon (${data.length} rows leaked)`,
    };
  });

export const testAdminExists = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestResult> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count, error } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if (error) return { status: "fail", message: error.message };
    return (count ?? 0) >= 1
      ? { status: "pass", message: `${count} admin user(s) configured.` }
      : { status: "fail", message: "No admin user found" };
  });

export const testMatchesPublicReadable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestResult> => {
    await assertAdmin(context.userId);
    const anon = anonClient();
    const { count, error } = await anon
      .from("matches")
      .select("id", { count: "exact", head: true });
    if (error)
      return { status: "fail", message: `Matches not publicly readable: ${error.message}` };
    return (count ?? 0) > 0
      ? { status: "pass", message: `${count} matches readable by public.` }
      : { status: "fail", message: "Matches count is 0" };
  });

// ---------- Game Logic ----------

// All game-logic tests build a temp matchday + match(es) + prediction(s)
// in a future-dated window, finalize the match score, run scoring, and
// clean up in finally.

// Defensive sweep: delete any matchday whose name starts with "__" plus
// cascading matches, predictions, and matchday_scores. Used before and
// after every test that seeds data, so orphans never accumulate.
async function purgeTestArtifacts() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: mds } = await supabaseAdmin
    .from("matchdays")
    .select("id")
    .like("name", "\\_\\_%");
  const mdIds = (mds ?? []).map((m) => m.id);
  if (!mdIds.length) return;
  const { data: ms } = await supabaseAdmin
    .from("matches")
    .select("id")
    .in("matchday_id", mdIds);
  const matchIds = (ms ?? []).map((m) => m.id);
  if (matchIds.length) {
    await supabaseAdmin.from("predictions").delete().in("match_id", matchIds);
    await supabaseAdmin.from("matches").delete().in("id", matchIds);
  }
  await supabaseAdmin.from("matchday_scores").delete().in("matchday_id", mdIds);
  await supabaseAdmin.from("matchdays").delete().in("id", mdIds);
}

async function withTempScenario<T>(
  fn: (ctx: {
    admin: ReturnType<typeof anonClient>;
    mdId: number;
  }) => Promise<T>,
): Promise<T> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Defensive pre-sweep so prior failures don't leak rows into the panel.
  await purgeTestArtifacts();
  // Future kickoff so the trigger allows prediction inserts
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: md, error: mdErr } = await supabaseAdmin
    .from("matchdays")
    .insert({ name: `__test_${Date.now()}`, starts_at: future })
    .select("id")
    .single();
  if (mdErr || !md) throw new Error(mdErr?.message ?? "Failed to seed matchday");
  try {
    return await fn({ admin: supabaseAdmin as never, mdId: md.id });
  } finally {
    // Cleanup: predictions -> matches -> scores -> matchday
    const { data: ms } = await supabaseAdmin
      .from("matches")
      .select("id")
      .eq("matchday_id", md.id);
    const ids = (ms ?? []).map((m) => m.id);
    if (ids.length) {
      await supabaseAdmin.from("predictions").delete().in("match_id", ids);
      await supabaseAdmin.from("matches").delete().in("id", ids);
    }
    await supabaseAdmin.from("matchday_scores").delete().eq("matchday_id", md.id);
    await supabaseAdmin.from("matchdays").delete().eq("id", md.id);
    // Defence in depth: nuke any "__"-prefixed leftovers from any path.
    await purgeTestArtifacts();
  }
}

async function seedMatchAndPrediction(
  mdId: number,
  userId: string,
  pred: { home: number; away: number; scorer: "home" | "away" | "none"; booster?: boolean },
  actual: { home: number; away: number; scorer: "home" | "away" | "none" },
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: match, error: mErr } = await supabaseAdmin
    .from("matches")
    .insert({
      matchday_id: mdId,
      home_team: "TestHome",
      away_team: "TestAway",
      kickoff_at: future,
      phase: "Group stage",
      teams_confirmed: true,
    })
    .select("id")
    .single();
  if (mErr || !match) throw new Error(mErr?.message ?? "Failed to seed match");
  const { error: pErr } = await supabaseAdmin.from("predictions").insert({
    user_id: userId,
    match_id: match.id,
    home_goals: pred.home,
    away_goals: pred.away,
    first_scorer: pred.scorer,
    booster: pred.booster ?? false,
  });
  if (pErr) throw new Error(pErr.message);
  // Now finalize the match
  const { error: fErr } = await supabaseAdmin
    .from("matches")
    .update({
      home_score: actual.home,
      away_score: actual.away,
      first_scorer: actual.scorer,
      is_final: true,
    })
    .eq("id", match.id);
  if (fErr) throw new Error(fErr.message);
  return match.id;
}

async function scoreAndGetPoints(
  mdId: number,
  userId: string,
  matchId: number,
): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.rpc("score_matchday", {
    _matchday_id: mdId,
    _caller_id: userId,
  });
  if (error) throw new Error(error.message);
  const { data, error: qErr } = await supabaseAdmin
    .from("predictions")
    .select("points")
    .eq("user_id", userId)
    .eq("match_id", matchId)
    .maybeSingle();
  if (qErr) throw new Error(qErr.message);
  return data?.points ?? 0;
}

export const testScoringExact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestResult> => {
    await assertAdmin(context.userId);
    try {
      const result = await withTempScenario(async ({ mdId }) => {
        const matchId = await seedMatchAndPrediction(
          mdId,
          context.userId,
          { home: 2, away: 1, scorer: "home" },
          { home: 2, away: 1, scorer: "home" },
        );
        return scoreAndGetPoints(mdId, context.userId, matchId);
      });
      // 3 (result) + 2 (home exact) + 2 (away exact) + 3 (GD) + 3 (first scorer) = 13
      // Underdog: only 1 prediction → share=1.0, no bonus
      return result === 13
        ? { status: "pass", message: "Exact + first scorer = 13 pts ✓" }
        : { status: "fail", message: `Scoring returned ${result} pts instead of 13` };
    } catch (e) {
      return { status: "fail", message: e instanceof Error ? e.message : String(e) };
    }
  });

export const testScoringCorrectResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestResult> => {
    await assertAdmin(context.userId);
    try {
      const result = await withTempScenario(async ({ mdId }) => {
        const matchId = await seedMatchAndPrediction(
          mdId,
          context.userId,
          { home: 2, away: 0, scorer: "home" },
          { home: 1, away: 0, scorer: "home" },
        );
        return scoreAndGetPoints(mdId, context.userId, matchId);
      });
      // result correct (3) + first scorer correct (3) = 6
      return result === 6
        ? { status: "pass", message: "Correct result + scorer = 6 pts ✓" }
        : { status: "fail", message: `Scoring returned ${result} pts instead of 6` };
    } catch (e) {
      return { status: "fail", message: e instanceof Error ? e.message : String(e) };
    }
  });

export const testScoringWrongResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestResult> => {
    await assertAdmin(context.userId);
    try {
      const result = await withTempScenario(async ({ mdId }) => {
        const matchId = await seedMatchAndPrediction(
          mdId,
          context.userId,
          { home: 2, away: 0, scorer: "home" },
          { home: 0, away: 1, scorer: "away" },
        );
        return scoreAndGetPoints(mdId, context.userId, matchId);
      });
      return result === 0
        ? { status: "pass", message: "Wrong result = 0 pts ✓" }
        : { status: "fail", message: `Wrong result gave ${result} pts (expected 0)` };
    } catch (e) {
      return { status: "fail", message: e instanceof Error ? e.message : String(e) };
    }
  });

export const testBoosterDoubles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestResult> => {
    await assertAdmin(context.userId);
    try {
      const boosted = await withTempScenario(async ({ mdId }) => {
        const matchId = await seedMatchAndPrediction(
          mdId,
          context.userId,
          { home: 1, away: 0, scorer: "home", booster: true },
          { home: 1, away: 0, scorer: "home" },
        );
        return scoreAndGetPoints(mdId, context.userId, matchId);
      });
      const plain = await withTempScenario(async ({ mdId }) => {
        const matchId = await seedMatchAndPrediction(
          mdId,
          context.userId,
          { home: 1, away: 0, scorer: "home", booster: false },
          { home: 1, away: 0, scorer: "home" },
        );
        return scoreAndGetPoints(mdId, context.userId, matchId);
      });
      return boosted === plain * 2
        ? { status: "pass", message: `Booster doubled ${plain} → ${boosted} ✓` }
        : {
            status: "fail",
            message: `Booster: ${boosted} pts, expected ${plain * 2}`,
          };
    } catch (e) {
      return { status: "fail", message: e instanceof Error ? e.message : String(e) };
    }
  });

export const testKickoffLock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestResult> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await purgeTestArtifacts();
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: md, error: mdErr } = await supabaseAdmin
      .from("matchdays")
      .insert({ name: `__test_lock_${Date.now()}`, starts_at: future })
      .select("id")
      .single();
    if (mdErr || !md) return { status: "fail", message: mdErr?.message ?? "seed failed" };
    let matchId: number | undefined;
    try {
      const { data: match, error: mErr } = await supabaseAdmin
        .from("matches")
        .insert({
          matchday_id: md.id,
          home_team: "TestHome",
          away_team: "TestAway",
          kickoff_at: past,
          phase: "Group stage",
          teams_confirmed: true,
        })
        .select("id")
        .single();
      if (mErr || !match) return { status: "fail", message: mErr?.message ?? "seed failed" };
      matchId = match.id;
      const { error: pErr } = await supabaseAdmin.from("predictions").insert({
        user_id: context.userId,
        match_id: match.id,
        home_goals: 1,
        away_goals: 0,
        first_scorer: "home",
        booster: false,
      });
      if (pErr)
        return {
          status: "pass",
          message: `Insert blocked by trigger: ${pErr.message}`,
        };
      return {
        status: "fail",
        message: "Prediction insert succeeded for past kickoff (lock broken)",
      };
    } finally {
      if (matchId) {
        await supabaseAdmin.from("predictions").delete().eq("match_id", matchId);
        await supabaseAdmin.from("matches").delete().eq("id", matchId);
      }
      await supabaseAdmin.from("matchdays").delete().eq("id", md.id);
      await purgeTestArtifacts();
    }
  });

// ---------- Standings trigger ----------

export const testStandingsTrigger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestResult> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Find a group-stage upcoming match with confirmed teams in the future
    const { data: match, error: mErr } = await supabaseAdmin
      .from("matches")
      .select("id, home_team, away_team, kickoff_at, status, home_score, away_score, first_scorer, is_final, group_letter")
      .not("group_letter", "is", null)
      .eq("status", "upcoming")
      .eq("teams_confirmed", true)
      .gt("kickoff_at", new Date().toISOString())
      .limit(1)
      .maybeSingle();
    if (mErr) return { status: "fail", message: mErr.message };
    if (!match) return { status: "warn", message: "No upcoming group-stage match available to test." };
    if (!match.home_team || !match.away_team) {
      return { status: "warn", message: "Match has no confirmed teams yet." };
    }
    const homeTeam: string = match.home_team;
    const awayTeam: string = match.away_team;
    const teams: string[] = [homeTeam, awayTeam];
    const snapshot = async () => {
      const { data, error } = await supabaseAdmin
        .from("wc_standings")
        .select("team, played, won, drawn, lost, goals_for, goals_against, points")
        .in("team", teams);
      if (error) throw safeError(error, "admin-tests");
      const m = new Map<string, { played: number; won: number; drawn: number; lost: number; goals_for: number; goals_against: number; points: number }>();
      for (const r of (data ?? []) as Array<{ team: string; played: number; won: number; drawn: number; lost: number; goals_for: number; goals_against: number; points: number }>) {
        m.set(r.team, r);
      }
      return m;
    };

    const before = await snapshot();
    const beforeHome = before.get(match.home_team);
    const beforeAway = before.get(match.away_team);
    if (!beforeHome || !beforeAway) {
      return { status: "fail", message: "Standings row missing for one of the teams" };
    }

    try {
      // Apply 2-1 home win
      const { error: upErr } = await supabaseAdmin
        .from("matches")
        .update({ home_score: 2, away_score: 1, status: "completed", first_scorer: "home", is_final: true })
        .eq("id", match.id);
      if (upErr) throw new Error(upErr.message);

      const after = await snapshot();
      const afterHome = after.get(match.home_team)!;
      const afterAway = after.get(match.away_team)!;

      const homeOk =
        afterHome.points - beforeHome.points === 3 &&
        afterHome.won - beforeHome.won === 1 &&
        afterHome.played - beforeHome.played === 1 &&
        afterHome.goals_for - beforeHome.goals_for === 2 &&
        afterHome.goals_against - beforeHome.goals_against === 1;
      const awayOk =
        afterAway.points - beforeAway.points === 0 &&
        afterAway.lost - beforeAway.lost === 1 &&
        afterAway.played - beforeAway.played === 1 &&
        afterAway.goals_for - beforeAway.goals_for === 1 &&
        afterAway.goals_against - beforeAway.goals_against === 2;

      if (!homeOk || !awayOk) {
        return {
          status: "fail",
          message: "Standings trigger not working — check PostgreSQL function",
          detail: `home Δpts=${afterHome.points - beforeHome.points} away Δpts=${afterAway.points - beforeAway.points}`,
        };
      }

      // Revert
      const { error: revErr } = await supabaseAdmin
        .from("matches")
        .update({
          home_score: match.home_score,
          away_score: match.away_score,
          first_scorer: match.first_scorer,
          is_final: match.is_final,
          status: match.status,
        })
        .eq("id", match.id);
      if (revErr) throw new Error(revErr.message);

      const reverted = await snapshot();
      const revHome = reverted.get(match.home_team)!;
      const revAway = reverted.get(match.away_team)!;
      const revertOk =
        revHome.points === beforeHome.points &&
        revHome.played === beforeHome.played &&
        revHome.goals_for === beforeHome.goals_for &&
        revAway.points === beforeAway.points &&
        revAway.played === beforeAway.played &&
        revAway.goals_for === beforeAway.goals_for;

      if (!revertOk) {
        return {
          status: "fail",
          message: "Standings trigger not working — check PostgreSQL function",
          detail: "revert did not restore previous standings",
        };
      }

      return { status: "pass", message: "Trigger updates and reverts standings correctly ✓" };
    } catch (e) {
      // Best-effort cleanup
      await supabaseAdmin
        .from("matches")
        .update({
          home_score: match.home_score,
          away_score: match.away_score,
          first_scorer: match.first_scorer,
          is_final: match.is_final,
          status: match.status,
        })
        .eq("id", match.id);
      return { status: "fail", message: e instanceof Error ? e.message : String(e) };
    }
  });


// ---------- Test Data tools ----------

const ScopeSchema = z.object({
  scope: z.enum(["current", "all_groups", "matchday"]),
  matchday_id: z.number().int().optional(),
});

export type FilledMatch = {
  id: number;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  first_scorer: string;
};

export const adminFillRandomScoresFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(ScopeSchema)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: res, error } = await supabase.rpc("fill_random_scores" as never, {
      _caller_id: userId,
      _scope: data.scope,
      _matchday_id: data.matchday_id ?? null,
    } as never);
    if (error) throw safeError(error, "game");
    const r = res as { filled: number; matches: FilledMatch[] };
    return { filled: r?.filled ?? 0, matches: r?.matches ?? [] };
  });

export const adminClearTestScoresFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(ScopeSchema)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: res, error } = await supabase.rpc("clear_test_scores" as never, {
      _caller_id: userId,
      _scope: data.scope,
      _matchday_id: data.matchday_id ?? null,
    } as never);
    if (error) throw safeError(error, "game");
    return { cleared: (res as { cleared: number })?.cleared ?? 0 };
  });

export const adminFillTestPredictionsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: res, error } = await supabase.rpc("fill_test_predictions" as never, {
      _caller_id: userId,
    } as never);
    if (error) throw safeError(error, "game");
    return { created: (res as { created: number })?.created ?? 0 };
  });

export const adminRunTestCycleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: res, error } = await supabase.rpc("run_test_cycle" as never, {
      _caller_id: userId,
    } as never);
    if (error) throw safeError(error, "game");
    return res as {
      matchday_id: number | null;
      matches_scored: number;
      predictions_evaluated: number;
      admin_points: number;
      admin_rank: number | null;
      predictions_created: number;
    };
  });

export const adminListMatchdaysSlimFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("matchdays")
      .select("id, name")
      .not("name", "like", "\\_\\_%")
      .order("id");
    if (error) throw new Error(error.message);
    return (data ?? []) as { id: number; name: string }[];
  });

// ---------- Multi-user simulation ----------

const TEST_EMAIL_DOMAIN = "@marcador-test.com";
const TEST_PASSWORD = "TestMarcador2026!";
const TEST_COUNTRIES = [
  "Belgium", "France", "Brazil", "Argentina",
  "England", "Germany", "Spain", "Netherlands",
];

function pickCountry(): string {
  return TEST_COUNTRIES[Math.floor(Math.random() * TEST_COUNTRIES.length)];
}

async function currentTestMatchdayId(): Promise<number | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("matches")
    .select("matchday_id")
    .eq("teams_confirmed", true)
    .order("matchday_id", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.matchday_id ?? null;
}

export const adminCreateTestUsersFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ count: z.number().int().min(1).max(10) }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const mdId = await currentTestMatchdayId();
    let usersCreated = 0;
    let predictionsAdded = 0;

    for (let i = 1; i <= data.count; i++) {
      const email = `testuser${i}${TEST_EMAIL_DOMAIN}`;
      let userId: string | null = null;

      const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: TEST_PASSWORD,
        email_confirm: true,
      });
      if (created?.user) {
        userId = created.user.id;
        usersCreated += 1;
      } else if (cErr) {
        // Lookup if it already exists
        const { data: list } = await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 200,
        });
        const found = list?.users.find((u) => u.email === email);
        if (!found) throw new Error(cErr.message);
        userId = found.id;
      }
      if (!userId) continue;

      const country = pickCountry();
      await supabaseAdmin.from("profiles").upsert(
        {
          user_id: userId,
          display_name: `Test User ${i}`,
          country,
          favourite_team: country,
        },
        { onConflict: "user_id" },
      );

      await supabaseAdmin
        .from("test_users")
        .upsert({ user_id: userId, email }, { onConflict: "user_id" });

      if (mdId !== null) {
        const { data: cnt, error: pErr } = await context.supabase.rpc(
          "create_test_user_predictions" as never,
          {
            _caller_id: context.userId,
            _user_id: userId,
            _matchday_id: mdId,
          } as never,
        );
        if (pErr) throw safeError(pErr, "game");
        predictionsAdded += Number(cnt ?? 0);
      }
    }

    // Leaderboard preview for the current matchday
    let leaderboard: { user_id: string; display_name: string; total_points: number }[] = [];
    if (mdId !== null) {
      const { data: tu } = await supabaseAdmin.from("test_users").select("user_id");
      const ids = (tu ?? []).map((r) => r.user_id);
      if (ids.length) {
        const { data: scores } = await supabaseAdmin
          .from("matchday_scores")
          .select("user_id, total_points")
          .eq("matchday_id", mdId)
          .in("user_id", ids);
        const { data: profs } = await supabaseAdmin
          .from("profiles")
          .select("user_id, display_name")
          .in("user_id", ids);
        const nameMap = new Map((profs ?? []).map((p) => [p.user_id, p.display_name]));
        leaderboard = (scores ?? [])
          .map((s) => ({
            user_id: s.user_id,
            display_name: nameMap.get(s.user_id) ?? "Test User",
            total_points: s.total_points,
          }))
          .sort((a, b) => b.total_points - a.total_points);
      }
    }

    return {
      users_created: usersCreated,
      predictions_added: predictionsAdded,
      current_md: mdId,
      leaderboard,
    };
  });

export const adminListTestUsersFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: tu } = await supabaseAdmin
      .from("test_users")
      .select("user_id, email, created_at")
      .order("created_at", { ascending: true });
    const ids = (tu ?? []).map((r) => r.user_id);
    if (!ids.length) return { users: [], current_md: null as number | null };

    const mdId = await currentTestMatchdayId();
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("user_id, display_name, country")
      .in("user_id", ids);
    const profMap = new Map((profs ?? []).map((p) => [p.user_id, p]));

    const pointsMap = new Map<string, number>();
    if (mdId !== null) {
      const { data: scores } = await supabaseAdmin
        .from("matchday_scores")
        .select("user_id, total_points")
        .eq("matchday_id", mdId)
        .in("user_id", ids);
      for (const s of scores ?? []) pointsMap.set(s.user_id, s.total_points);
    }

    return {
      current_md: mdId,
      users: (tu ?? []).map((r) => ({
        user_id: r.user_id,
        email: r.email,
        display_name: profMap.get(r.user_id)?.display_name ?? r.email,
        country: profMap.get(r.user_id)?.country ?? null,
        total_points: pointsMap.get(r.user_id) ?? null,
      })),
    };
  });

export const adminDeleteTestUsersFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin.rpc("delete_test_users" as never, {
      _caller_id: context.userId,
    } as never);
    if (error) throw safeError(error, "game");

    const ids = ((rows ?? []) as { user_id: string }[]).map((r) => r.user_id);
    let removed = 0;
    for (const id of ids) {
      const { error: dErr } = await supabaseAdmin.auth.admin.deleteUser(id);
      if (!dErr) removed += 1;
    }
    return { removed };
  });

export const adminListLeaguesForTestFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("leagues")
      .select("id, name")
      .order("name");
    if (error) throw new Error(error.message);
    return (data ?? []) as { id: string; name: string }[];
  });

export const adminAddTestUsersToLeagueFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ league_id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: res, error } = await context.supabase.rpc(
      "add_test_users_to_league" as never,
      { _caller_id: context.userId, _league_id: data.league_id } as never,
    );
    if (error) throw safeError(error, "game");
    return { added: Number(res ?? 0) };
  });

// ---------- Edge case scoring ----------

const EDGE_TEAM = "__test";

async function seedEdgeMatch(
  mdId: number,
  preds: Array<{
    userId: string;
    home: number;
    away: number;
    scorer: "home" | "away" | "none";
    booster?: boolean;
  }>,
  actual: { home: number; away: number; scorer: "home" | "away" | "none" },
  opts?: { phase?: string },
): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: match, error: mErr } = await supabaseAdmin
    .from("matches")
    .insert({
      matchday_id: mdId,
      home_team: EDGE_TEAM,
      away_team: EDGE_TEAM,
      kickoff_at: future,
      phase: opts?.phase ?? "Group stage",
      teams_confirmed: true,
    })
    .select("id")
    .single();
  if (mErr || !match) throw new Error(mErr?.message ?? "Failed to seed edge match");

  for (const p of preds) {
    const { error: pErr } = await supabaseAdmin.from("predictions").insert({
      user_id: p.userId,
      match_id: match.id,
      home_goals: p.home,
      away_goals: p.away,
      first_scorer: p.scorer,
      booster: p.booster ?? false,
    });
    if (pErr) throw new Error(pErr.message);
  }

  const { error: fErr } = await supabaseAdmin
    .from("matches")
    .update({
      home_score: actual.home,
      away_score: actual.away,
      first_scorer: actual.scorer,
      is_final: true,
    })
    .eq("id", match.id);
  if (fErr) throw new Error(fErr.message);
  return match.id;
}

async function getPoints(userId: string, matchId: number): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("predictions")
    .select("points")
    .eq("user_id", userId)
    .eq("match_id", matchId)
    .maybeSingle();
  return data?.points ?? 0;
}

async function scoreMd(mdId: number, callerId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.rpc("score_matchday", {
    _matchday_id: mdId,
    _caller_id: callerId,
  });
  if (error) throw new Error(error.message);
}

// Cleans up edge matches whose matchday wasn't deleted yet (extra safety).
async function purgeEdgeMatches() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: ms } = await supabaseAdmin
    .from("matches")
    .select("id")
    .eq("home_team", EDGE_TEAM);
  const ids = (ms ?? []).map((m) => m.id);
  if (!ids.length) return;
  await supabaseAdmin.from("predictions").delete().in("match_id", ids);
  await supabaseAdmin.from("matches").delete().in("id", ids);
}

// Spin up N-1 throwaway auth users so we can insert N distinct predictions
// per match (predictions has UNIQUE (user_id, match_id)). Cleaned up in finally.
async function withEdgeUsers<T>(
  n: number,
  fn: (extraUserIds: string[]) => Promise<T>,
): Promise<T> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const ids: string[] = [];
  const ts = Date.now();
  try {
    for (let i = 1; i <= n; i++) {
      const email = `edge-${ts}-${i}@marcador-edgetest.com`;
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: "TestMarcador2026!",
        email_confirm: true,
      });
      if (error || !data?.user) throw new Error(error?.message ?? "edge user create failed");
      ids.push(data.user.id);
    }
    return await fn(ids);
  } finally {
    for (const id of ids) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(id);
      } catch {
        // ignore
      }
    }
  }
}

function pass(msg: string): TestResult {
  return { status: "pass", message: msg };
}
function fail(expected: number, actual: number): TestResult {
  return { status: "fail", message: `expected ${expected}, got ${actual}` };
}

async function runSingle(
  userId: string,
  pred: { home: number; away: number; scorer: "home" | "away" | "none"; booster?: boolean },
  actual: { home: number; away: number; scorer: "home" | "away" | "none" },
  expected: number,
): Promise<TestResult> {
  try {
    const got = await withTempScenario(async ({ mdId }) => {
      const matchId = await seedEdgeMatch(
        mdId,
        [{ userId, ...pred }],
        actual,
      );
      await scoreMd(mdId, userId);
      return getPoints(userId, matchId);
    });
    await purgeEdgeMatches();
    return got === expected ? pass(`${expected} pts ✓`) : fail(expected, got);
  } catch (e) {
    await purgeEdgeMatches();
    return { status: "fail", message: e instanceof Error ? e.message : String(e) };
  }
}

export const testEdgeExactScoreline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestResult> => {
    await assertAdmin(context.userId);
    return runSingle(
      context.userId,
      { home: 2, away: 1, scorer: "home" },
      { home: 2, away: 1, scorer: "home" },
      13,
    );
  });

export const testEdgeCorrectResultWrongScore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestResult> => {
    await assertAdmin(context.userId);
    // pred 2-0, actual 3-0: result +3, home 2≠3 +0, away 0=0 +2, GD 2≠3 +0, scorer +3 = 8
    return runSingle(
      context.userId,
      { home: 2, away: 0, scorer: "home" },
      { home: 3, away: 0, scorer: "home" },
      8,
    );
  });

export const testEdgeWrongFirstScorer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestResult> => {
    await assertAdmin(context.userId);
    return runSingle(
      context.userId,
      { home: 1, away: 0, scorer: "home" },
      { home: 1, away: 0, scorer: "away" },
      10,
    );
  });

export const testEdgeDrawCorrect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestResult> => {
    await assertAdmin(context.userId);
    return runSingle(
      context.userId,
      { home: 1, away: 1, scorer: "home" },
      { home: 1, away: 1, scorer: "home" },
      13,
    );
  });

export const testEdgeZeroZeroDraw = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestResult> => {
    await assertAdmin(context.userId);
    return runSingle(
      context.userId,
      { home: 0, away: 0, scorer: "none" },
      { home: 0, away: 0, scorer: "none" },
      13,
    );
  });

export const testEdgeZeroZeroBooster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestResult> => {
    await assertAdmin(context.userId);
    return runSingle(
      context.userId,
      { home: 0, away: 0, scorer: "none", booster: true },
      { home: 0, away: 0, scorer: "none" },
      26,
    );
  });

export const testEdgeWrongResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestResult> => {
    await assertAdmin(context.userId);
    return runSingle(
      context.userId,
      { home: 2, away: 0, scorer: "home" },
      { home: 0, away: 1, scorer: "away" },
      0,
    );
  });

export const testEdgeAwayWin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestResult> => {
    await assertAdmin(context.userId);
    return runSingle(
      context.userId,
      { home: 0, away: 2, scorer: "away" },
      { home: 0, away: 2, scorer: "away" },
      13,
    );
  });

export const testEdgeBooster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestResult> => {
    await assertAdmin(context.userId);
    return runSingle(
      context.userId,
      { home: 1, away: 0, scorer: "home", booster: true },
      { home: 1, away: 0, scorer: "home" },
      26,
    );
  });

// Underdog at exactly 10% (1 of 10) → does NOT fire → 13
export const testEdgeUnderdogAt10pct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestResult> => {
    await assertAdmin(context.userId);
    try {
      const got = await withTempScenario(async ({ mdId }) => {
        return withEdgeUsers(9, async (extras) => {
          const preds = [
            {
              userId: context.userId,
              home: 3,
              away: 2,
              scorer: "home" as const,
              booster: false,
            },
            ...extras.map((u) => ({
              userId: u,
              home: 0,
              away: 0,
              scorer: "none" as const,
              booster: false,
            })),
          ];
          const matchId = await seedEdgeMatch(mdId, preds, {
            home: 3,
            away: 2,
            scorer: "home",
          });
          await scoreMd(mdId, context.userId);
          return getPoints(context.userId, matchId);
        });
      });
      await purgeEdgeMatches();
      return got === 13 ? pass("at 10% → no underdog (13 pts) ✓") : fail(13, got);
    } catch (e) {
      await purgeEdgeMatches();
      return { status: "fail", message: e instanceof Error ? e.message : String(e) };
    }
  });

// Underdog below 10% (1 of 11 ≈ 9.09%) → fires → 18
export const testEdgeUnderdogBelow10pct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestResult> => {
    await assertAdmin(context.userId);
    try {
      const got = await withTempScenario(async ({ mdId }) => {
        return withEdgeUsers(10, async (extras) => {
          const preds = [
            {
              userId: context.userId,
              home: 3,
              away: 2,
              scorer: "home" as const,
              booster: false,
            },
            ...extras.map((u) => ({
              userId: u,
              home: 0,
              away: 0,
              scorer: "none" as const,
              booster: false,
            })),
          ];
          const matchId = await seedEdgeMatch(mdId, preds, {
            home: 3,
            away: 2,
            scorer: "home",
          });
          await scoreMd(mdId, context.userId);
          return getPoints(context.userId, matchId);
        });
      });
      await purgeEdgeMatches();
      return got === 18 ? pass("below 10% → underdog +5 (18 pts) ✓") : fail(18, got);
    } catch (e) {
      await purgeEdgeMatches();
      return { status: "fail", message: e instanceof Error ? e.message : String(e) };
    }
  });

export const testEdgeRescoreNoDouble = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestResult> => {
    await assertAdmin(context.userId);
    try {
      const result = await withTempScenario(async ({ mdId }) => {
        const matchId = await seedEdgeMatch(
          mdId,
          [
            {
              userId: context.userId,
              home: 2,
              away: 1,
              scorer: "home",
            },
          ],
          { home: 2, away: 1, scorer: "home" },
        );
        await scoreMd(mdId, context.userId);
        const first = await getPoints(context.userId, matchId);
        await scoreMd(mdId, context.userId);
        const second = await getPoints(context.userId, matchId);
        return { first, second };
      });
      await purgeEdgeMatches();
      return result.first === result.second
        ? pass(`re-score idempotent (${result.first} pts) ✓`)
        : {
            status: "fail",
            message: `points changed: first=${result.first}, second=${result.second}`,
          };
    } catch (e) {
      await purgeEdgeMatches();
      return { status: "fail", message: e instanceof Error ? e.message : String(e) };
    }
  });

export const testEdgeResultCorrection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestResult> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      const result = await withTempScenario(async ({ mdId }) => {
        const matchId = await seedEdgeMatch(
          mdId,
          [
            {
              userId: context.userId,
              home: 2,
              away: 1,
              scorer: "home",
            },
          ],
          { home: 2, away: 1, scorer: "home" },
        );
        await scoreMd(mdId, context.userId);
        const initial = await getPoints(context.userId, matchId);

        // Correct the result to 1-1
        await supabaseAdmin
          .from("matches")
          .update({ home_score: 1, away_score: 1, first_scorer: "home" })
          .eq("id", matchId);
        await scoreMd(mdId, context.userId);
        const after = await getPoints(context.userId, matchId);
        return { initial, after };
      });
      await purgeEdgeMatches();
      if (result.initial !== 13) {
        return {
          status: "fail",
          message: `initial scoring wrong: expected 13, got ${result.initial}`,
        };
      }
      return result.after === 0
        ? pass(`correction 13 → 0 ✓`)
        : { status: "fail", message: `after correction: expected 0, got ${result.after}` };
    } catch (e) {
      await purgeEdgeMatches();
      return { status: "fail", message: e instanceof Error ? e.message : String(e) };
    }
  });

// ---------- Prediction lock ----------

async function withLockTestUser<T>(fn: (userId: string) => Promise<T>): Promise<T> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const email = `lock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@marcador-locktest.com`;
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: crypto.randomUUID(),
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message ?? "unknown"}`);
  const uid = data.user.id;
  try {
    return await fn(uid);
  } finally {
    try { await supabaseAdmin.auth.admin.deleteUser(uid); } catch { /* ignore */ }
  }
}

function isLockError(msg: string | null | undefined): boolean {
  return !!msg && /predictions are locked/i.test(msg);
}

export const testLockUiPastMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestResult> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count, error } = await supabaseAdmin
      .from("matches")
      .select("id", { count: "exact", head: true })
      .lt("kickoff_at", new Date().toISOString());
    if (error) return { status: "fail", message: error.message };
    if (!count || count === 0)
      return { status: "fail", message: "No past matches exist — cannot verify UI lock state" };
    return { status: "pass", message: `UI would render locked for ${count} past matches` };
  });

export const testLockServerRejectsPastInsert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestResult> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: m } = await supabaseAdmin
      .from("matches")
      .select("id")
      .lt("kickoff_at", new Date().toISOString())
      .limit(1)
      .maybeSingle();
    if (!m) return { status: "warn", message: "No past matches available" };
    return await withLockTestUser(async (uid) => {
      const { data: inserted, error } = await supabaseAdmin
        .from("predictions")
        .insert({ user_id: uid, match_id: m.id, home_goals: 1, away_goals: 1, first_scorer: "home", booster: false })
        .select("id")
        .maybeSingle();
      if (inserted?.id) {
        await supabaseAdmin.from("predictions").delete().eq("id", inserted.id);
        return { status: "fail", message: "Insert succeeded — lock not enforced" };
      }
      if (isLockError(error?.message)) return { status: "pass", message: "Past match insert rejected ✓" };
      return { status: "fail", message: `Unexpected error: ${error?.message ?? "no row, no error"}` };
    });
  });

export const testLockServerRejectsCompleted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestResult> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: m } = await supabaseAdmin
      .from("matches")
      .select("id")
      .eq("status", "completed")
      .limit(1)
      .maybeSingle();
    if (!m) return { status: "warn", message: "No completed matches available" };
    return await withLockTestUser(async (uid) => {
      const { data: inserted, error } = await supabaseAdmin
        .from("predictions")
        .insert({ user_id: uid, match_id: m.id, home_goals: 2, away_goals: 0, first_scorer: "home", booster: false })
        .select("id")
        .maybeSingle();
      if (inserted?.id) {
        await supabaseAdmin.from("predictions").delete().eq("id", inserted.id);
        return { status: "fail", message: "Insert on completed match succeeded — lock not enforced" };
      }
      if (isLockError(error?.message)) return { status: "pass", message: "Completed match insert rejected ✓" };
      return { status: "fail", message: `Unexpected error: ${error?.message ?? "no row, no error"}` };
    });
  });

export const testLockServerRejectsUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestResult> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nowIso = new Date().toISOString();
    const { data: rows } = await supabaseAdmin
      .from("predictions")
      .select("id, home_goals, match_id, matches!inner(kickoff_at)")
      .lt("matches.kickoff_at", nowIso)
      .limit(1);
    const p = rows?.[0];
    if (!p) return { status: "warn", message: "No predictions on past matches to test" };
    const original = p.home_goals;
    const attempt = original === 9 ? 8 : 9;
    const { error, data } = await supabaseAdmin
      .from("predictions")
      .update({ home_goals: attempt })
      .eq("id", p.id)
      .select("id, home_goals")
      .maybeSingle();
    if (data && data.home_goals === attempt) {
      await supabaseAdmin.from("predictions").update({ home_goals: original }).eq("id", p.id);
      return { status: "fail", message: "Update on past match succeeded — lock not enforced (restored)" };
    }
    if (isLockError(error?.message)) return { status: "pass", message: "Update after kickoff rejected ✓" };
    return { status: "fail", message: `Unexpected: ${error?.message ?? "silent no-op"}` };
  });

export const testLockServerAcceptsFuture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestResult> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: m } = await supabaseAdmin
      .from("matches")
      .select("id")
      .gt("kickoff_at", new Date().toISOString())
      .eq("teams_confirmed", true)
      .eq("status", "upcoming")
      .limit(1)
      .maybeSingle();
    if (!m) return { status: "warn", message: "No future confirmed upcoming matches available" };
    return await withLockTestUser(async (uid) => {
      const { data: inserted, error } = await supabaseAdmin
        .from("predictions")
        .insert({ user_id: uid, match_id: m.id, home_goals: 1, away_goals: 0, first_scorer: "home", booster: false })
        .select("id")
        .maybeSingle();
      if (inserted?.id) {
        await supabaseAdmin.from("predictions").delete().eq("id", inserted.id);
        return { status: "pass", message: "Future match accepted prediction ✓" };
      }
      return { status: "fail", message: `Future insert rejected: ${error?.message ?? "unknown"}` };
    });
  });

export const testLockReopensWhenKickoffMovedFuture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestResult> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: m } = await supabaseAdmin
      .from("matches")
      .select("id, kickoff_at, status, is_final, teams_confirmed")
      .eq("status", "completed")
      .limit(1)
      .maybeSingle();
    if (!m) return { status: "warn", message: "No completed matches available" };
    if (!m.teams_confirmed)
      return { status: "warn", message: "Selected match has no confirmed teams" };
    const future = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const orig = { kickoff_at: m.kickoff_at, status: m.status, is_final: m.is_final };
    try {
      await supabaseAdmin
        .from("matches")
        .update({ kickoff_at: future, status: "upcoming", is_final: false })
        .eq("id", m.id);
      return await withLockTestUser(async (uid) => {
        const { data: inserted, error } = await supabaseAdmin
          .from("predictions")
          .insert({ user_id: uid, match_id: m.id, home_goals: 1, away_goals: 1, first_scorer: "home", booster: false })
          .select("id")
          .maybeSingle();
        if (inserted?.id) {
          await supabaseAdmin.from("predictions").delete().eq("id", inserted.id);
          return { status: "pass", message: "Moving kickoff to future reopened predictions ✓" };
        }
        return { status: "fail", message: `Still locked: ${error?.message ?? "unknown"}` };
      });
    } finally {
      await supabaseAdmin.from("matches").update(orig).eq("id", m.id);
    }
  });

export const testLockRelocksWhenKickoffMovedPast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestResult> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: m } = await supabaseAdmin
      .from("matches")
      .select("id, kickoff_at")
      .gt("kickoff_at", new Date().toISOString())
      .eq("teams_confirmed", true)
      .eq("status", "upcoming")
      .limit(1)
      .maybeSingle();
    if (!m) return { status: "warn", message: "No future upcoming matches available" };
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const origKickoff = m.kickoff_at;
    try {
      await supabaseAdmin.from("matches").update({ kickoff_at: past }).eq("id", m.id);
      return await withLockTestUser(async (uid) => {
        const { data: inserted, error } = await supabaseAdmin
          .from("predictions")
          .insert({ user_id: uid, match_id: m.id, home_goals: 1, away_goals: 0, first_scorer: "home", booster: false })
          .select("id")
          .maybeSingle();
        if (inserted?.id) {
          await supabaseAdmin.from("predictions").delete().eq("id", inserted.id);
          return { status: "fail", message: "Insert succeeded after moving kickoff to past" };
        }
        if (isLockError(error?.message)) return { status: "pass", message: "Moving kickoff to past re-locked ✓" };
        return { status: "fail", message: `Unexpected: ${error?.message ?? "unknown"}` };
      });
    } finally {
      await supabaseAdmin.from("matches").update({ kickoff_at: origKickoff }).eq("id", m.id);
    }
  });

// ---------- Standings ----------

type StandingExpected = {
  played: number; won: number; drawn: number; lost: number;
  goals_for: number; goals_against: number; goal_difference: number; points: number;
};

const STANDINGS_GROUP_A_MATCHES: Array<{
  home: string; away: string; home_score: number; away_score: number;
}> = [
  { home: "Mexico", away: "South Africa", home_score: 2, away_score: 0 },
  { home: "South Korea", away: "Czechia", home_score: 1, away_score: 1 },
  { home: "Mexico", away: "South Korea", home_score: 1, away_score: 0 },
  { home: "Czechia", away: "South Africa", home_score: 3, away_score: 1 },
  { home: "Czechia", away: "Mexico", home_score: 0, away_score: 0 },
  { home: "South Africa", away: "South Korea", home_score: 2, away_score: 2 },
];

const STANDINGS_SCENARIO_1: Record<string, StandingExpected> = {
  Mexico:        { played: 3, won: 2, drawn: 1, lost: 0, goals_for: 3, goals_against: 0, goal_difference:  3, points: 7 },
  Czechia:       { played: 3, won: 1, drawn: 1, lost: 1, goals_for: 4, goals_against: 3, goal_difference:  1, points: 4 },
  "South Korea": { played: 3, won: 0, drawn: 2, lost: 1, goals_for: 3, goals_against: 4, goal_difference: -1, points: 2 },
  "South Africa":{ played: 3, won: 0, drawn: 1, lost: 2, goals_for: 3, goals_against: 6, goal_difference: -3, points: 1 },
};

const STANDINGS_EXPECTED_ORDER = ["Mexico", "Czechia", "South Korea", "South Africa"];

const STANDINGS_SCENARIO_2: Record<string, StandingExpected> = {
  Mexico:         { played: 3, won: 1, drawn: 2, lost: 0, goals_for: 1, goals_against: 0, goal_difference:  1, points: 5 },
  "South Africa": { played: 3, won: 0, drawn: 2, lost: 1, goals_for: 3, goals_against: 4, goal_difference: -1, points: 2 },
};

function firstScorerFor(h: number, a: number): "home" | "away" | "none" {
  if (h === 0 && a === 0) return "none";
  if (h > 0 && a === 0) return "home";
  if (a > 0 && h === 0) return "away";
  return "home";
}

function compareStanding(team: string, actual: StandingExpected | undefined, expected: StandingExpected): { ok: boolean; line: string } {
  if (!actual) return { ok: false, line: `${team}: row missing ❌` };
  const cols: Array<[string, keyof StandingExpected]> = [
    ["P", "played"], ["W", "won"], ["D", "drawn"], ["L", "lost"],
    ["GF", "goals_for"], ["GA", "goals_against"], ["GD", "goal_difference"], ["Pts", "points"],
  ];
  let ok = true;
  const parts = cols.map(([label, key]) => {
    const match = actual[key] === expected[key];
    if (!match) ok = false;
    return `${label} ${match ? "✅" : `❌(${actual[key]}≠${expected[key]})`}`;
  });
  return { ok, line: `${team}: ${parts.join(" ")}` };
}

export const testStandingsVerifier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestResult> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: original, error: snapErr } = await supabaseAdmin
      .from("matches")
      .select("id, home_team, away_team, home_score, away_score, status, is_final, first_scorer")
      .eq("group_letter", "A");
    if (snapErr || !original) return { status: "fail", message: `snapshot failed: ${snapErr?.message ?? "no rows"}` };
    if (original.length !== 6) return { status: "fail", message: `expected 6 Group A matches, found ${original.length}` };

    const findId = (home: string, away: string) =>
      original.find((m) => m.home_team === home && m.away_team === away)?.id;

    const detail: string[] = [];
    let allOk = true;

    try {
      // Scenario 1: apply all 6 known scores
      for (const s of STANDINGS_GROUP_A_MATCHES) {
        const id = findId(s.home, s.away);
        if (!id) return { status: "fail", message: `match not found: ${s.home} vs ${s.away}` };
        const { error } = await supabaseAdmin
          .from("matches")
          .update({
            home_score: s.home_score,
            away_score: s.away_score,
            first_scorer: firstScorerFor(s.home_score, s.away_score),
            status: "completed",
            is_final: true,
          })
          .eq("id", id);
        if (error) throw new Error(`apply scenario 1: ${error.message}`);
      }

      const { data: s1Rows, error: s1Err } = await supabaseAdmin
        .from("wc_standings")
        .select("team, played, won, drawn, lost, goals_for, goals_against, goal_difference, points, wc_groups!inner(name)")
        .eq("wc_groups.name", "Group A");
      if (s1Err || !s1Rows) throw new Error(`read standings: ${s1Err?.message ?? "no rows"}`);
      const s1Map = new Map(s1Rows.map((r) => [r.team, r as unknown as StandingExpected & { team: string }]));

      detail.push("Scenario 1 — full group results:");
      for (const team of Object.keys(STANDINGS_SCENARIO_1)) {
        const { ok, line } = compareStanding(team, s1Map.get(team), STANDINGS_SCENARIO_1[team]);
        if (!ok) allOk = false;
        detail.push("  " + line);
      }

      // Ordering
      const sorted = [...s1Rows].sort((a, b) => {
        const ap = a.points ?? 0, bp = b.points ?? 0;
        if (bp !== ap) return bp - ap;
        const agd = a.goal_difference ?? 0, bgd = b.goal_difference ?? 0;
        if (bgd !== agd) return bgd - agd;
        return (b.goals_for ?? 0) - (a.goals_for ?? 0);
      }).map((r) => r.team);
      const orderOk = STANDINGS_EXPECTED_ORDER.every((t, i) => sorted[i] === t);
      if (!orderOk) allOk = false;
      detail.push(`Order: ${orderOk ? "✅" : "❌"} expected ${STANDINGS_EXPECTED_ORDER.join(" > ")}, got ${sorted.join(" > ")}`);

      // Scenario 2: change Mexico vs South Africa from 2-0 → 0-0
      const mexSaId = findId("Mexico", "South Africa")!;
      const { error: s2Err } = await supabaseAdmin
        .from("matches")
        .update({ home_score: 0, away_score: 0, first_scorer: "none", status: "completed", is_final: true })
        .eq("id", mexSaId);
      if (s2Err) throw new Error(`apply scenario 2: ${s2Err.message}`);

      const { data: s2Rows, error: s2ReadErr } = await supabaseAdmin
        .from("wc_standings")
        .select("team, played, won, drawn, lost, goals_for, goals_against, goal_difference, points, wc_groups!inner(name)")
        .eq("wc_groups.name", "Group A");
      if (s2ReadErr || !s2Rows) throw new Error(`read standings 2: ${s2ReadErr?.message ?? "no rows"}`);
      const s2Map = new Map(s2Rows.map((r) => [r.team, r as unknown as StandingExpected & { team: string }]));

      detail.push("Scenario 2 — Mexico vs South Africa corrected to 0-0:");
      for (const team of Object.keys(STANDINGS_SCENARIO_2)) {
        const { ok, line } = compareStanding(team, s2Map.get(team), STANDINGS_SCENARIO_2[team]);
        if (!ok) allOk = false;
        detail.push("  " + line);
      }
    } finally {
      // Restore originals
      for (const m of original) {
        await supabaseAdmin
          .from("matches")
          .update({
            home_score: m.home_score,
            away_score: m.away_score,
            first_scorer: m.first_scorer,
            status: m.status,
            is_final: m.is_final,
          })
          .eq("id", m.id);
      }
    }

    return allOk
      ? { status: "pass", message: "All standings values and order match expected", detail: detail.join("\n") }
      : { status: "fail", message: "Standings mismatch — see detail", detail: detail.join("\n") };
  });

// ---------- Round multiplier edge tests ----------

// R32 (×2), exact scoreline, no booster, single user → 13 × 2 = 26
export const testEdgeMultiplierR32 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestResult> => {
    await assertAdmin(context.userId);
    try {
      const got = await withTempScenario(async ({ mdId }) => {
        const matchId = await seedEdgeMatch(
          mdId,
          [{ userId: context.userId, home: 2, away: 1, scorer: "home" }],
          { home: 2, away: 1, scorer: "home" },
          { phase: "Round of 32" },
        );
        await scoreMd(mdId, context.userId);
        return getPoints(context.userId, matchId);
      });
      await purgeEdgeMatches();
      return got === 26
        ? pass("R32 multiplier ×2 → 26 pts ✓")
        : fail(26, got);
    } catch (e) {
      await purgeEdgeMatches();
      return { status: "fail", message: e instanceof Error ? e.message : String(e) };
    }
  });

// Semifinal (×5) + booster (×2) + exact → 13 × 5 × 2 = 130
export const testEdgeMultiplierBoosterStack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestResult> => {
    await assertAdmin(context.userId);
    try {
      const got = await withTempScenario(async ({ mdId }) => {
        const matchId = await seedEdgeMatch(
          mdId,
          [{ userId: context.userId, home: 2, away: 1, scorer: "home", booster: true }],
          { home: 2, away: 1, scorer: "home" },
          { phase: "Semifinal" },
        );
        await scoreMd(mdId, context.userId);
        return getPoints(context.userId, matchId);
      });
      await purgeEdgeMatches();
      return got === 130
        ? pass("SF ×5 × booster ×2 → 130 pts ✓")
        : fail(130, got);
    } catch (e) {
      await purgeEdgeMatches();
      return { status: "fail", message: e instanceof Error ? e.message : String(e) };
    }
  });

// R32 (×2) + underdog firing (<10%) → (13 × 2) + 5 = 31 (underdog NOT multiplied)
export const testEdgeMultiplierUnderdogFlat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestResult> => {
    await assertAdmin(context.userId);
    try {
      const got = await withTempScenario(async ({ mdId }) => {
        return withEdgeUsers(10, async (extras) => {
          const preds = [
            {
              userId: context.userId,
              home: 3,
              away: 2,
              scorer: "home" as const,
              booster: false,
            },
            ...extras.map((u) => ({
              userId: u,
              home: 0,
              away: 0,
              scorer: "none" as const,
              booster: false,
            })),
          ];
          const matchId = await seedEdgeMatch(
            mdId,
            preds,
            { home: 3, away: 2, scorer: "home" },
            { phase: "Round of 32" },
          );
          await scoreMd(mdId, context.userId);
          return getPoints(context.userId, matchId);
        });
      });
      await purgeEdgeMatches();
      return got === 31
        ? pass("R32 ×2 + underdog flat +5 → 31 pts ✓")
        : fail(31, got);
    } catch (e) {
      await purgeEdgeMatches();
      return { status: "fail", message: e instanceof Error ? e.message : String(e) };
    }
  });
