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
    const { count, error } = await supabaseAdmin
      .from("matches")
      .select("id", { count: "exact", head: true });
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
    return count === 48
      ? { status: "pass", message: "All 48 standings rows present." }
      : { status: "fail", message: `Groups table incomplete — ${count ?? 0} rows found` };
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
