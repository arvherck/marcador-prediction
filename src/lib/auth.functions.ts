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
