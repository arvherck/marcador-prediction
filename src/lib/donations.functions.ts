import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestHost } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const amountSchema = z.object({
  amount_cents: z.number().int().min(100).max(100000),
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const createDonationCheckoutFn = createServerFn({ method: "POST" })
  .inputValidator((input) => amountSchema.parse(input))
  .handler(async ({ data }) => {
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) throw new Error("Stripe is not configured.");

    // Optional auth — guests are allowed. Read bearer token if present.
    let userId: string | null = null;
    const authHeader = getRequestHeader("authorization");
    if (authHeader?.toLowerCase().startsWith("bearer ")) {
      const token = authHeader.slice(7);
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const url = process.env.SUPABASE_URL!;
        const anon = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const sb = createClient(url, anon);
        const { data: u } = await sb.auth.getUser(token);
        if (u.user && UUID_RE.test(u.user.id)) userId = u.user.id;
      } catch {
        /* guest checkout */
      }
    }

    const host = getRequestHost();
    const proto = host.startsWith("localhost") ? "http" : "https";
    const origin = `${proto}://${host}`;

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(secret);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      currency: "eur",
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: { name: "Marcador Donation" },
            unit_amount: data.amount_cents,
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/?donated=true`,
      cancel_url: `${origin}/`,
      metadata: {
        user_id: userId ?? "guest",
      },
    });

    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    return { url: session.url };
  });

export type DonationStats = {
  total_cents: number;
  donor_count: number;
  recent: Array<{
    id: string;
    amount_cents: number;
    currency: string;
    created_at: string;
    display_name: string | null;
  }>;
};

export const getDonationStatsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DonationStats> => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (!(roles ?? []).some((r) => r.role === "admin")) {
      throw new Error("Forbidden");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: all }, { data: donors }, { data: recent }] = await Promise.all([
      supabaseAdmin.from("donations").select("amount_cents"),
      supabaseAdmin.from("profiles").select("user_id").eq("donor", true),
      supabaseAdmin
        .from("donations")
        .select("id, amount_cents, currency, created_at, user_id")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const total_cents = (all ?? []).reduce((a, r) => a + (r.amount_cents ?? 0), 0);
    const donor_count = (donors ?? []).length;

    const ids = Array.from(
      new Set((recent ?? []).map((r) => r.user_id).filter((x): x is string => !!x)),
    );
    let nameMap = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", ids);
      nameMap = new Map((profs ?? []).map((p) => [p.user_id, p.display_name]));
    }

    return {
      total_cents,
      donor_count,
      recent: (recent ?? []).map((r) => ({
        id: r.id,
        amount_cents: r.amount_cents,
        currency: r.currency,
        created_at: r.created_at,
        display_name: r.user_id ? nameMap.get(r.user_id) ?? null : null,
      })),
    };
  });

export const getDonorIdsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("user_id")
    .eq("donor", true);
  return (data ?? []).map((r) => r.user_id);
});
