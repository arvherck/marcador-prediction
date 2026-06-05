import { createFileRoute } from "@tanstack/react-router";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/public/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.STRIPE_SECRET_KEY;
        const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!secret || !whSecret) {
          return new Response("Stripe not configured", { status: 500 });
        }

        const sig = request.headers.get("stripe-signature");
        if (!sig) return new Response("Missing signature", { status: 400 });

        const body = await request.text();

        const Stripe = (await import("stripe")).default;
        const stripe = new Stripe(secret);

        let event: import("stripe").Stripe.Event;
        try {
          event = await stripe.webhooks.constructEventAsync(body, sig, whSecret);
        } catch (err) {
          console.error("[stripe-webhook] signature verification failed", err);
          return new Response("Invalid signature", { status: 400 });
        }

        if (event.type !== "checkout.session.completed") {
          return new Response("ok", { status: 200 });
        }

        const session = event.data.object as import("stripe").Stripe.Checkout.Session;
        const sessionId = session.id;
        const amount = session.amount_total ?? 0;
        const currency = session.currency ?? "eur";
        const metaUserId = (session.metadata?.user_id ?? "guest").toString();
        const userId = UUID_RE.test(metaUserId) ? metaUserId : null;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { error: insertErr } = await supabaseAdmin
          .from("donations")
          .insert({
            stripe_session_id: sessionId,
            amount_cents: amount,
            currency,
            user_id: userId,
          });

        // Ignore duplicate-key (idempotent retries)
        if (insertErr && !/duplicate key/i.test(insertErr.message)) {
          console.error("[stripe-webhook] insert error", insertErr);
          return new Response("DB error", { status: 500 });
        }

        if (userId) {
          const { error: updErr } = await supabaseAdmin
            .from("profiles")
            .update({ donor: true })
            .eq("user_id", userId);
          if (updErr) console.error("[stripe-webhook] profile update error", updErr);
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
