import { createServerFn } from "@tanstack/react-start";
import { safeError } from "@/lib/safe-error";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CurrentUser = {
  id: string;
  email: string;
  is_admin: boolean;
  profile: {
    display_name: string;
    country: string;
    favourite_team: string;
    current_streak: number;
    longest_streak: number;
    theme_preference: "dark" | "light" | null;
    donor: boolean;
  } | null;
};

export const meFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CurrentUser | null> => {
    const { supabase, userId, claims } = context;
    const [{ data: profile }, { data: roles }] = await Promise.all([
      supabase
        .from("profiles")
        .select("display_name, country, favourite_team, current_streak, longest_streak, theme_preference, donor")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    return {
      id: userId,
      email: (claims.email as string | undefined) ?? "",
      is_admin: (roles ?? []).some((r) => r.role === "admin"),
      profile: profile
        ? {
            display_name: profile.display_name,
            country: profile.country,
            favourite_team: profile.favourite_team,
            current_streak: (profile as { current_streak?: number }).current_streak ?? 0,
            longest_streak: (profile as { longest_streak?: number }).longest_streak ?? 0,
            theme_preference:
              ((profile as { theme_preference?: string | null }).theme_preference as
                | "dark"
                | "light"
                | null) ?? null,
            donor: Boolean((profile as { donor?: boolean }).donor),
          }
        : null,
    };
  });

export const completeOnboardingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      display_name: z.string().trim().min(2).max(40),
      country: z.string().trim().min(2).max(60),
      favourite_team: z.string().trim().min(2).max(60),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("profiles")
      .upsert(
        {
          user_id: userId,
          display_name: data.display_name,
          country: data.country,
          favourite_team: data.favourite_team,
        },
        { onConflict: "user_id" },
      );
    if (error) throw safeError(error, "auth");
    return { ok: true };
  });

export const updateProfileFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      display_name: z
        .string()
        .trim()
        .min(2)
        .max(40)
        .regex(/^[\p{L}\p{N} _-]+$/u, "Invalid characters in display name"),
      country: z.string().trim().min(2).max(60),
      favourite_team: z.string().trim().min(2).max(60),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Uniqueness check (case-insensitive) against other users
    const { data: existing, error: lookupErr } = await supabase
      .from("profiles")
      .select("user_id")
      .ilike("display_name", data.display_name)
      .neq("user_id", userId)
      .limit(1);
    if (lookupErr) throw safeError(lookupErr, "auth");
    if (existing && existing.length > 0) {
      throw new Error("display_name_taken");
    }

    const { error } = await supabase
      .from("profiles")
      .upsert(
        {
          user_id: userId,
          display_name: data.display_name,
          country: data.country,
          favourite_team: data.favourite_team,
        },
        { onConflict: "user_id" },
      );
    if (error) throw safeError(error, "auth");
    return { ok: true };
  });

export const recordConsentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      age_confirmed: z.literal(true),
      privacy_accepted: z.literal(true),
    }),
  )
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const now = new Date().toISOString();
    const { data: existing } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("profiles")
        .update({
          age_confirmed: true,
          privacy_accepted: true,
          consent_recorded_at: now,
        })
        .eq("user_id", userId);
      if (error) throw safeError(error, "auth");
    } else {
      const { error } = await supabase.from("profiles").insert({
        user_id: userId,
        display_name: "",
        country: "",
        favourite_team: "",
        age_confirmed: true,
        privacy_accepted: true,
        consent_recorded_at: now,
      });
      if (error) throw safeError(error, "auth");
    }
    return { ok: true };
  });

export const deleteAccountFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error: rpcErr } = await supabaseAdmin.rpc("delete_my_account", {
      _user_id: userId,
    });
    if (rpcErr) throw new Error("delete_failed: " + rpcErr.message);

    const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authErr) throw new Error("auth_delete_failed: " + authErr.message);

    return { ok: true };
  });

export const exportMyDataFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const [
      { data: profile },
      { data: tournament },
      { data: predictions },
      { data: memberships },
      { data: leaderboard },
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("display_name, country, favourite_team, created_at, current_streak, longest_streak")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("tournament_predictions")
        .select("predicted_winner, created_at, points_awarded")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("predictions")
        .select(
          "home_goals, away_goals, first_scorer, booster, points, created_at, matches!inner(home_team, away_team, kickoff_at, phase)",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: true }),
      supabase
        .from("league_members")
        .select("joined_at, leagues!inner(name, invite_code, owner_id)")
        .eq("user_id", userId),
      supabase.rpc("global_leaderboard", { _league_id: undefined }),
    ]);

    const myRow = (leaderboard ?? []).find(
      (r: { id: string }) => r.id === userId,
    ) as { total_points: number; rank: number } | undefined;

    type PredRow = {
      home_goals: number;
      away_goals: number;
      first_scorer: string;
      booster: boolean;
      points: number | null;
      created_at: string;
      matches: { home_team: string; away_team: string; kickoff_at: string; phase: string };
    };
    type LeagueRow = {
      joined_at: string;
      leagues: { name: string; invite_code: string; owner_id: string };
    };

    return {
      exported_at: new Date().toISOString(),
      profile: profile
        ? {
            display_name: profile.display_name,
            country: profile.country,
            favourite_team: profile.favourite_team,
            created_at: profile.created_at,
            current_streak: profile.current_streak ?? 0,
            longest_streak: profile.longest_streak ?? 0,
          }
        : null,
      tournament_prediction: tournament
        ? {
            predicted_winner: tournament.predicted_winner,
            created_at: tournament.created_at,
            points_awarded: tournament.points_awarded,
          }
        : null,
      predictions: ((predictions ?? []) as unknown as PredRow[]).map((p) => ({
        match: `${p.matches.home_team} vs ${p.matches.away_team}`,
        kickoff_at: p.matches.kickoff_at,
        phase: p.matches.phase,
        predicted_home_goals: p.home_goals,
        predicted_away_goals: p.away_goals,
        predicted_first_scorer: p.first_scorer,
        booster_applied: p.booster,
        points_earned: p.points,
        submitted_at: p.created_at,
      })),
      leagues: ((memberships ?? []) as unknown as LeagueRow[]).map((m) => ({
        name: m.leagues.name,
        invite_code: m.leagues.invite_code,
        role: m.leagues.owner_id === userId ? "owner" : "member",
        joined_at: m.joined_at,
      })),
      total_points: myRow?.total_points ?? 0,
      overall_rank: myRow?.rank ?? null,
    };
  });
