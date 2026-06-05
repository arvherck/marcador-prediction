## Root cause

The bug is not RLS. The `profiles` table already has the correct policies:

- `profiles readable` — `SELECT TO authenticated USING (true)`
- `users insert own profile` — `INSERT WITH CHECK (user_id = auth.uid())`
- `users update own profile` — `UPDATE USING/WITH CHECK (user_id = auth.uid())`

I also confirmed in the live DB that `user_id` is the PRIMARY KEY of `profiles` (so the `upsert(..., { onConflict: "user_id" })` in `completeOnboardingFn` works), and the existing test user (`gandalftheswole76@gmail.com`) DOES have a saved profile row. So `meFn` returns the profile correctly.

The real bug is in `src/routes/auth.tsx`. After a successful `signInWithPassword`, line 59 unconditionally does:

```ts
navigate({ to: "/onboarding" });
```

That sends every returning user straight to the onboarding form, even though `_authenticated`'s `beforeLoad` would have already routed them to `/play` (because `me.profile` exists). Onboarding is under `_authenticated`, and its guard only redirects *away* when the profile is missing — it does not redirect *toward* play when it isn't, so the form renders and the user re-enters their data.

## Fix

Change the post–sign-in destination in `src/routes/auth.tsx` from `/onboarding` to `/play`. The `_authenticated` layout's `beforeLoad` is already the single source of truth: it calls `meFn()` and redirects to `/onboarding` only when `me.profile` is null. Returning users keep their profile and land on `/play`; brand-new sign-ups have no profile yet and get correctly bounced to `/onboarding` by the guard.

Specifically, in `submit()`:

```ts
clearGuest();
toast.success("Welcome to Marcador.");
await router.invalidate();
navigate({ to: "/play" });   // was "/onboarding"
```

No DB / RLS / migration changes are needed. No changes to `meFn` or `completeOnboardingFn`.

## Verification

1. Sign in as the existing user — should land on `/play` directly (no onboarding form).
2. Sign up a brand-new user — `_authenticated` guard sees `me.profile === null` and redirects to `/onboarding`; after submitting, `completeOnboardingFn` upserts on PK `user_id`, and subsequent sign-ins go straight to `/play`.
