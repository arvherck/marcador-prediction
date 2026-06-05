import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const setThemePreferenceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ theme: z.enum(["dark", "light"]) }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("profiles")
      .update({ theme_preference: data.theme })
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
