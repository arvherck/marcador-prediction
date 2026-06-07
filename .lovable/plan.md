## Goal

Make Marcador's auth flow clear end-to-end: distinct sign-in and sign-up screens, a "check your inbox" screen after signup, proper handling when the user returns from the confirmation email, a friendly error if they try to sign in before confirming, and a full forgot-password flow.

Email confirmation in Supabase stays ON.

## New route map

```
/auth                  Sign in (existing route, simplified)
/auth/signup           Sign up + post-signup "Check your inbox" state
/auth/reset            Request password reset email
/auth/new-password     Set new password (arrives from reset email)
/auth/callback         Handles Supabase email-confirmation + recovery redirects
```

All public (top-level, not under `_authenticated/`). Each route gets its own `head()` with route-specific title and description.

## Screen-by-screen

### `/auth` — Sign in
- Heading: "Welcome back"
- Subtext: "Sign in to make this matchday's calls."
- Google button at top, then divider, then email + password fields
- Primary button: "Sign in" (amber)
- Below: "New here? Create an account →" links to `/auth/signup`
- "Forgot your password?" links to `/auth/reset`
- Keep "Continue as guest" block at bottom
- On `Email not confirmed` error: render inline notice with a "Resend confirmation email" button that calls `supabase.auth.resend({ type: 'signup', email })`, toast "Email resent ✓".

### `/auth/signup` — Sign up (two states in one route)

State A — form:
- Heading: "Create your account"
- Subtext: "Join Marcador and start predicting."
- Google button at top, divider, then email, password, confirm password
- Hint under password: "At least 8 characters"
- Client-side check: passwords match + length ≥ 8
- Primary button: "Create account" (amber)
- Below: "Already have an account? Sign in →"

State B — after successful `signUp()` (swap, do not navigate):
- Big ✉️ icon centered (lucide `Mail` in an amber tinted circle)
- Heading: "Check your inbox"
- Subtext: "We sent a confirmation link to **{email}**. Click it to activate your Marcador account."
- "Resend confirmation email" button
  - Disabled for 60s after signup; label shows "Resend in 45s" countdown
  - After 60s becomes active; on click calls `supabase.auth.resend({ type: 'signup', email })`, toast "Email resent ✓", restarts 60s cooldown
- Bottom link: "Wrong email? Sign up again →" returns to State A and clears the form
- Does NOT navigate to `/play` or `/onboarding`

### `/auth/reset` — Forgot password
- Heading: "Reset your password"
- Subtext: "Enter your email and we'll send you a reset link."
- Email field, button "Send reset link"
- Calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?type=recovery` })`
- On success swaps to a "Check your inbox for a password reset link." confirmation panel (same visual template as signup confirmation, no resend timer needed but include a "Resend" button with the same 60s cooldown for parity)

### `/auth/new-password` — Set new password
- Reached from the recovery email via `/auth/callback`
- Guard: if there is no active session with `aud` recovery, redirect to `/auth/reset`
- Fields: new password, confirm new password (≥ 8, match)
- Button: "Update password"
- Calls `supabase.auth.updateUser({ password })`
- On success: `supabase.auth.signOut()` then navigate `/auth` with toast "Password updated. Please sign in."

### `/auth/callback` — Email redirect handler
- Both signup confirmation and password recovery redirect here
- On mount:
  - Parse hash/query; supabase-js v2 auto-exchanges the code into a session
  - `const { data: { user } } = await supabase.auth.getUser()`
  - If URL `type=recovery` (or hash contains `type=recovery`): navigate `/auth/new-password`
  - Else (signup confirmation):
    - Toast: "Email confirmed! Welcome to Marcador ⚽"
    - Check `profiles` for `user_id = user.id` via existing pattern:
      - No profile → navigate `/onboarding`
      - Profile exists → navigate `/play`
  - On error: toast error, navigate `/auth`

## Supabase wiring

- `signUp` call sets `options.emailRedirectTo = `${window.location.origin}/auth/callback`` (replaces current `/play`).
- `resetPasswordForEmail` uses `${origin}/auth/callback?type=recovery`.
- No Supabase auth settings change required — email confirmation stays on. No new SQL migration.
- Existing onboarding/profile lookup logic is reused; no schema work.

## Shared pieces

- New `src/components/auth/CheckInboxPanel.tsx` — reusable ✉️ + heading + subtext + resend button with `cooldownSeconds` prop and `onResend` callback. Used by signup confirmation and reset confirmation.
- New `src/components/auth/AuthShell.tsx` — header with logo + centered card layout to keep the four auth screens visually consistent.
- Keep existing Google button + `lovable.auth.signInWithOAuth("google", ...)` flow on `/auth` and `/auth/signup`.
- Remove the Apple button from `/auth` (it was added in a previous turn but is out of scope here; leaving it would clutter the redesigned screens — confirm if the user wants it kept).

## Files

Create:
- `src/routes/auth.signup.tsx`
- `src/routes/auth.reset.tsx`
- `src/routes/auth.new-password.tsx`
- `src/routes/auth.callback.tsx`
- `src/components/auth/CheckInboxPanel.tsx`
- `src/components/auth/AuthShell.tsx`

Edit:
- `src/routes/auth.tsx` — sign-in only; add "Forgot password" link, inline "email not confirmed" resend, link to `/auth/signup`. Remove signup mode toggle.

`src/routeTree.gen.ts` regenerates automatically.

## Open question

The previous turn added an Apple sign-in button on `/auth`. Should the redesigned screens keep it alongside Google, or drop it? Your spec only mentions Google.
