# Donations via Stripe

Voluntary, low-pressure donations using the existing `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` secrets. Stripe Checkout (hosted) for the payment flow — no custom card form. No features gated.

## 1. Database (one migration)

- `profiles`: add `donor boolean not null default false`.
- New `donations` table: `id uuid pk`, `user_id uuid null` (nullable for guests), `amount_cents int`, `currency text default 'eur'`, `stripe_session_id text unique`, `created_at timestamptz default now()`.
- GRANTs: `authenticated` → `SELECT` on `donations` (admin-only via RLS), `service_role` → ALL.
- RLS: `donations` readable only by admins (`has_role(auth.uid(),'admin')`); writes only via service role (webhook).

## 2. Server: Stripe Checkout

- Add `stripe` npm package.
- `src/lib/donations.functions.ts`:
  - `createDonationCheckoutFn({ amount_cents: number })` — `createServerFn` POST, validates amount ≥ 100 and ≤ 100000 with zod.
    - Reads current user (optional — uses `supabase.auth.getUser()` via a soft auth helper; not gated by `requireSupabaseAuth` so guests work).
    - Calls Stripe with `STRIPE_SECRET_KEY`: `mode: 'payment'`, EUR, one line item "Marcador Donation", `success_url = ${origin}/?donated=true`, `cancel_url = ${origin}/`, `metadata: { user_id: userId ?? 'guest' }`.
    - Returns `{ url }`.
- For the optional-auth user lookup, the server fn reads the bearer token via `getRequestHeader('Authorization')` and calls `supabase.auth.getUser(token)` manually (skipping `requireSupabaseAuth` which would 401 guests).

## 3. Webhook (TanStack server route, not edge function)

User asked for a Supabase Edge Function, but per project conventions webhooks live in TanStack server routes. I'll put it at `src/routes/api/public/stripe-webhook.ts`:

- Reads raw body, verifies signature with `stripe.webhooks.constructEvent` and `STRIPE_WEBHOOK_SECRET`.
- On `checkout.session.completed`:
  - Insert into `donations` (idempotent on `stripe_session_id`).
  - If `metadata.user_id` is a real UUID, update `profiles.donor = true` via `supabaseAdmin`.
- Returns 200 / 400 on signature failure.
- Requires `STRIPE_WEBHOOK_SECRET` secret — will request via `add_secret`. Webhook URL to give to Stripe: `https://project--ivtitpkkapywtrkpxbin.lovable.app/api/public/stripe-webhook`.

## 4. UI

- **Footer link** (`src/components/AppShell.tsx`): small muted "Support Marcador" text, opens modal.
- **`<DonateModal />`** (new): title "Support Marcador ⚽", subtitle, 2×2 grid of preset cards (☕ €3, 🍺 €5, 🍕 €10, 🏆 €25), custom EUR input (min 1), amber "Donate" button → calls `createDonationCheckoutFn` → `window.location.href = url`. Small print "Secure payment via Stripe. No account needed."
- **Success toast**: in `__root.tsx` (or AppShell), on mount check `?donated=true` → sonner toast "Thank you for supporting Marcador! 🏆" → `router.navigate({ search: {} , replace: true })` to strip the param.

## 5. Donor recognition

- Update `meFn` to return `donor`.
- Update `global_leaderboard` SQL function to also return `donor boolean` from `profiles`.
- Leaderboard row: render ⭐ next to display name when `donor`.
- Mi Marcador (`/me`): show "⭐ Marcador Supporter" line if donor.

## 6. Admin Panel — Donations section

At bottom of `_authenticated/admin.tsx`:
- `getDonationStatsFn` (admin-gated): returns `{ total_cents, donor_count, recent: [{ amount_cents, created_at, display_name | null }] }` (joins `profiles`; null for guests).
- Card with the three stats and a table of the last 20 donations.

## Open questions

1. **Edge Function vs TanStack server route for the webhook?** Project convention is server routes under `src/routes/api/public/`. I'll use that unless you specifically want a Supabase Edge Function.
2. **`STRIPE_WEBHOOK_SECRET`** isn't in your secrets yet — I'll request it after you approve the plan, with instructions for creating the Stripe webhook endpoint and copying the signing secret.
3. **Currency** locked to EUR — confirm?

## Files

New: migration, `src/lib/donations.functions.ts`, `src/routes/api/public/stripe-webhook.ts`, `src/components/DonateModal.tsx`, `src/components/admin/DonationsPanel.tsx`.
Edited: `src/components/AppShell.tsx` (footer + success toast), `src/lib/auth.functions.ts` (return donor), `src/routes/_authenticated/admin.tsx`, `src/routes/_authenticated/me.tsx`, `src/routes/_authenticated/leaderboard.tsx`, regenerated `types.ts`.