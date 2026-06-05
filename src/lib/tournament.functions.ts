import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { TEAMS_2026 } from "@/lib/teams";

const teamSchema = z.string().refine((t) => (TEAMS_2026 as readonly string[]).includes(t), {
  message: "Invalid team",
});

export type TournamentStatus = {
  myPick: { predicted_winner: string; points_awarded: number | null } | null;
  locked: boolean;
  actualWinner: string | null;
};

export const getTournamentStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TournamentStatus> => {
    const { supabase, userId } = context;
    const [{ data: pick, error: pErr }, { data: settings, error: sErr }] = await Promise.all([
      supabase
        .from("tournament_predictions")
        .select("predicted_winner, points_awarded")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("tournament_settings")
        .select("predictions_locked, actual_winner")
        .eq("id", 1)
        .maybeSingle(),
    ]);
    if (pErr) throw new Error(pErr.message);
    if (sErr) throw new Error(sErr.message);
    return {
      myPick: pick ?? null,
      locked: settings?.predictions_locked ?? false,
      actualWinner: settings?.actual_winner ?? null,
    };
  });

export const getTournamentStatusPublic = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ locked: boolean; actualWinner: string | null }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("tournament_settings")
      .select("predictions_locked, actual_winner")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      locked: data?.predictions_locked ?? false,
      actualWinner: data?.actual_winner ?? null,
    };
  },
);

export const submitTournamentPickFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ predicted_winner: teamSchema }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: settings, error: sErr } = await supabase
      .from("tournament_settings")
      .select("predictions_locked")
      .eq("id", 1)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (settings?.predictions_locked) throw new Error("Tournament predictions are closed.");

    const { error } = await supabase.from("tournament_predictions").insert({
      user_id: userId,
      predicted_winner: data.predicted_winner,
    });
    if (error) {
      if (error.code === "23505") throw new Error("You've already locked in your champion.");
      throw new Error(error.message);
    }
    return { ok: true };
  });

async function assertAdminAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
}

export const adminLockTournamentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ locked: z.boolean() }))
  .handler(async ({ data, context }) => {
    await assertAdminAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("tournament_settings")
      .update({ predictions_locked: data.locked, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminSetTournamentWinnerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ winner: teamSchema }))
  .handler(async ({ data, context }) => {
    await assertAdminAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: sErr } = await supabaseAdmin
      .from("tournament_settings")
      .update({ actual_winner: data.winner, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (sErr) throw new Error(sErr.message);

    // Award points to all predictions
    const { data: preds, error: pErr } = await supabaseAdmin
      .from("tournament_predictions")
      .select("id, predicted_winner");
    if (pErr) throw new Error(pErr.message);

    for (const p of preds ?? []) {
      const pts = p.predicted_winner === data.winner ? 50 : 0;
      const { error } = await supabaseAdmin
        .from("tournament_predictions")
        .update({ points_awarded: pts })
        .eq("id", p.id);
      if (error) throw new Error(error.message);
    }
    return { ok: true, scored: preds?.length ?? 0 };
  });
