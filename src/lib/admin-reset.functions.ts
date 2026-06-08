import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

// ───────────────────────── App State Dashboard ─────────────────────────

export type AppState = {
  predictions: { total: number; real_users: number; test_users: number };
  test_users: number;
  real_match_scores: number;
  orphan_test_matchdays: number;
  tournament_predictions: number;
  scored_matchdays: number;
  app_clean: boolean;
};

export const adminGetAppStateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AppState> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Test user ids
    const { data: testRows } = await supabaseAdmin.from("test_users").select("user_id");
    const testUserIds = (testRows ?? []).map((r) => r.user_id as string);
    const testUserCount = testUserIds.length;

    // Predictions totals
    const { count: predTotal } = await supabaseAdmin
      .from("predictions")
      .select("id", { count: "exact", head: true });

    let predTest = 0;
    if (testUserIds.length > 0) {
      const { count } = await supabaseAdmin
        .from("predictions")
        .select("id", { count: "exact", head: true })
        .in("user_id", testUserIds);
      predTest = count ?? 0;
    }
    const predTotalNum = predTotal ?? 0;
    const predReal = Math.max(0, predTotalNum - predTest);

    // Real match scores: matches with score where matchday is not is_test
    const { data: realTestMds } = await supabaseAdmin
      .from("matchdays")
      .select("id")
      .eq("is_test", true);
    const realTestMdIds = (realTestMds ?? []).map((m) => m.id as number);

    let realMatchScoresQuery = supabaseAdmin
      .from("matches")
      .select("id", { count: "exact", head: true })
      .not("home_score", "is", null);
    if (realTestMdIds.length > 0) {
      realMatchScoresQuery = realMatchScoresQuery.not(
        "matchday_id",
        "in",
        `(${realTestMdIds.join(",")})`,
      );
    }
    const { count: realScoreCount } = await realMatchScoresQuery;

    // Orphan test matchdays (name LIKE '__%')
    const { count: orphanCount } = await supabaseAdmin
      .from("matchdays")
      .select("id", { count: "exact", head: true })
      .like("name", "\\_\\_%");

    // Tournament predictions
    const { count: tpCount } = await supabaseAdmin
      .from("tournament_predictions")
      .select("user_id", { count: "exact", head: true });

    // Scored matchdays (real ones)
    const { count: scoredCount } = await supabaseAdmin
      .from("matchdays")
      .select("id", { count: "exact", head: true })
      .eq("is_scored", true)
      .eq("is_test", false);

    const total = predTotalNum;
    const realScores = realScoreCount ?? 0;
    const orphan = orphanCount ?? 0;
    const tp = tpCount ?? 0;
    const scored = scoredCount ?? 0;

    const appClean =
      total === 0 &&
      testUserCount === 0 &&
      realScores === 0 &&
      orphan === 0 &&
      scored === 0;

    return {
      predictions: { total, real_users: predReal, test_users: predTest },
      test_users: testUserCount,
      real_match_scores: realScores,
      orphan_test_matchdays: orphan,
      tournament_predictions: tp,
      scored_matchdays: scored,
      app_clean: appClean,
    };
  });

// ───────────────────────── Quick Test Check ─────────────────────────

export type QuickCheck = {
  scored_real_matchdays: number;
  real_user_live_predictions: number;
  orphan_test_artifacts: number;
  leftover_test_users: number;
};

export const adminQuickTestCheckFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<QuickCheck> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { count: scoredReal } = await supabaseAdmin
      .from("matchdays")
      .select("id", { count: "exact", head: true })
      .eq("is_scored", true)
      .eq("is_test", false);

    const { data: testRows } = await supabaseAdmin.from("test_users").select("user_id");
    const testIds = (testRows ?? []).map((r) => r.user_id as string);
    const leftoverTestUsers = testIds.length;

    // Upcoming matches in the future
    const { data: upcoming } = await supabaseAdmin
      .from("matches")
      .select("id")
      .eq("status", "upcoming")
      .gt("kickoff_at", new Date().toISOString());
    const upcomingIds = (upcoming ?? []).map((m) => m.id as number);

    let realLive = 0;
    if (upcomingIds.length > 0) {
      let q = supabaseAdmin
        .from("predictions")
        .select("user_id", { count: "exact", head: true })
        .in("match_id", upcomingIds);
      if (testIds.length > 0) {
        q = q.not("user_id", "in", `(${testIds.map((id) => `"${id}"`).join(",")})`);
      }
      const { count } = await q;
      realLive = count ?? 0;
    }

    const { count: orphan } = await supabaseAdmin
      .from("matchdays")
      .select("id", { count: "exact", head: true })
      .like("name", "\\_\\_%");

    return {
      scored_real_matchdays: scoredReal ?? 0,
      real_user_live_predictions: realLive,
      orphan_test_artifacts: orphan ?? 0,
      leftover_test_users: leftoverTestUsers,
    };
  });

// ───────────────────────── Reset to Go-Live State ─────────────────────────

export type ResetStep = {
  key: string;
  label: string;
  count: number;
  ok: boolean;
  error: string | null;
};

export type ResetResult = {
  ok: boolean;
  steps: ResetStep[];
};

export const adminResetToGoLiveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ResetResult> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const steps: ResetStep[] = [];
    const record = async (
      key: string,
      label: string,
      fn: () => Promise<number>,
    ) => {
      try {
        const count = await fn();
        steps.push({ key, label, count, ok: true, error: null });
      } catch (e) {
        steps.push({
          key,
          label,
          count: 0,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    };

    // Test matchdays (preserve their match scores so Pre-WC tests keep passing)
    const { data: realTestMds } = await supabaseAdmin
      .from("matchdays")
      .select("id")
      .eq("is_test", true);
    const testMdIds = (realTestMds ?? []).map((m) => m.id as number);

    // Step 1: Delete all predictions
    await record("predictions", "Predictions deleted", async () => {
      const { count: before } = await supabaseAdmin
        .from("predictions")
        .select("id", { count: "exact", head: true });
      const { error } = await supabaseAdmin.from("predictions").delete().not("id", "is", null);
      if (error) throw error;
      return before ?? 0;
    });

    // Step 2: Delete all matchday_scores
    await record("matchday_scores", "Matchday scores deleted", async () => {
      const { count: before } = await supabaseAdmin
        .from("matchday_scores")
        .select("id", { count: "exact", head: true });
      const { error } = await supabaseAdmin
        .from("matchday_scores")
        .delete()
        .not("id", "is", null);
      if (error) throw error;
      return before ?? 0;
    });

    // Step 3: Reset real match scores (preserve UI test, __test_*, and is_test matchday matches)
    await record("match_scores", "Match scores reset", async () => {
      let q = supabaseAdmin
        .from("matches")
        .select("id", { count: "exact", head: true })
        .not("home_score", "is", null)
        .not("home_team", "like", "UI_Test%")
        .not("home_team", "like", "\\_\\_%");
      if (testMdIds.length > 0) {
        q = q.not("matchday_id", "in", `(${testMdIds.join(",")})`);
      }
      const { count: before } = await q;

      let upd = supabaseAdmin
        .from("matches")
        .update({
          home_score: null,
          away_score: null,
          first_scorer: null,
          is_final: false,
          status: "upcoming",
        })
        .not("home_team", "like", "UI_Test%")
        .not("home_team", "like", "\\_\\_%");
      if (testMdIds.length > 0) {
        upd = upd.not("matchday_id", "in", `(${testMdIds.join(",")})`);
      }
      const { error } = await upd;
      if (error) throw error;
      return before ?? 0;
    });

    // Step 4: Reset group standings to zero (goal_difference + points are generated)
    await record("standings", "Group standings reset to zero", async () => {
      const { count } = await supabaseAdmin
        .from("wc_standings")
        .select("id", { count: "exact", head: true });
      const { error } = await supabaseAdmin
        .from("wc_standings")
        .update({
          played: 0,
          won: 0,
          drawn: 0,
          lost: 0,
          goals_for: 0,
          goals_against: 0,
          yellow_cards: 0,
          red_cards: 0,
        })
        .not("id", "is", null);
      if (error) throw error;
      return count ?? 0;
    });


    // Step 5: Reset user streaks
    await record("streaks", "User streaks reset", async () => {
      const { count } = await supabaseAdmin
        .from("profiles")
        .select("user_id", { count: "exact", head: true })
        .or("current_streak.gt.0,longest_streak.gt.0");
      const { error } = await supabaseAdmin
        .from("profiles")
        .update({ current_streak: 0, longest_streak: 0 })
        .not("user_id", "is", null);
      if (error) throw error;
      return count ?? 0;
    });

    // Step 6: Remove test users (delete cascade via SQL function)
    await record("test_users", "Test users removed", async () => {
      const { data, error } = await supabaseAdmin.rpc("delete_test_users", {
        _caller_id: context.userId,
      });
      if (error) throw error;
      return Array.isArray(data) ? data.length : 0;
    });

    // Step 7: Purge orphaned __ test artifacts (matchdays + their matches/predictions/scores)
    await record("orphans", "Orphan test artifacts purged", async () => {
      const { data: mds } = await supabaseAdmin
        .from("matchdays")
        .select("id")
        .like("name", "\\_\\_%");
      const mdIds = (mds ?? []).map((m) => m.id as number);
      if (mdIds.length === 0) return 0;
      const { data: ms } = await supabaseAdmin
        .from("matches")
        .select("id")
        .in("matchday_id", mdIds);
      const matchIds = (ms ?? []).map((m) => m.id as number);
      if (matchIds.length) {
        await supabaseAdmin.from("predictions").delete().in("match_id", matchIds);
        await supabaseAdmin.from("matches").delete().in("id", matchIds);
      }
      await supabaseAdmin.from("matchday_scores").delete().in("matchday_id", mdIds);
      await supabaseAdmin.from("matchdays").delete().in("id", mdIds);
      return mdIds.length;
    });

    // Step 8: Reset matchday is_scored flags (real ones only)
    await record("scored_flags", "Matchday scored flags reset", async () => {
      const { count } = await supabaseAdmin
        .from("matchdays")
        .select("id", { count: "exact", head: true })
        .eq("is_scored", true)
        .eq("is_test", false);
      const { error } = await supabaseAdmin
        .from("matchdays")
        .update({ is_scored: false })
        .eq("is_test", false);
      if (error) throw error;
      return count ?? 0;
    });

    const ok = steps.every((s) => s.ok);

    // Log to sync log (best-effort)
    try {
      await supabaseAdmin.from("api_sync_log").insert({
        action: "reset_go_live",
        description: `Admin reset app to go-live state (${ok ? "ok" : "partial"})`,
        actor_id: context.userId,
        meta: { steps },
      });
    } catch {
      /* ignore */
    }

    return { ok, steps };
  });
