## GDPR consent on signup

### 1. DB migration — add to `public.profiles`
- `age_confirmed boolean NOT NULL DEFAULT false`
- `privacy_accepted boolean NOT NULL DEFAULT false`
- `consent_recorded_at timestamptz` (nullable; existing rows stay null per spec)

No new policies (existing self-update policy on profiles covers it).

### 2. Server function — `src/lib/auth.functions.ts`
Add `recordConsentFn` (POST, `requireSupabaseAuth`).
- Input (zod): `{ age_confirmed: true, privacy_accepted: true }` — both literal `true`.
- Upserts profile row with both flags + `consent_recorded_at = now()` (server time via `new Date().toISOString()`).
- Returns `{ ok: true }`.

### 3. Email signup screen — `src/routes/auth.signup.tsx`
Between confirm-password and "Create account" button:
- Checkbox 1: "I am 18 years of age or older" (state `age18`).
- Checkbox 2: "I agree to the [Privacy Policy](/privacy) and understand how my data is used" — link opens `/privacy` in new tab.
- Submit button disabled until both ticked.
- On submit attempt with one missing → inline red error text under that box ("Please confirm you are 18+ to continue" / "Please agree to the Privacy Policy to continue").
- On successful `supabase.auth.signUp`, set `sessionStorage.marcador_consent_pending = "1"` so consent can be recorded after email confirmation (no session exists pre-confirmation).

### 4. Callback routing — `src/routes/auth.callback.tsx`
After user is resolved:
- If `sessionStorage.marcador_consent_pending === "1"` → call `recordConsentFn`, clear flag, then continue current routing logic.
- Otherwise, if profile has no `consent_recorded_at` AND no `display_name` → redirect to new `/consent` route instead of `/onboarding`.
- Existing users (display_name already set) are NOT forced through consent — they go straight to `/play`.

### 5. New route — `src/routes/_authenticated/consent.tsx`
Intermediate screen used by Google OAuth (and as fallback for email users who lost sessionStorage).
- Heading: "One quick thing before you start".
- Same 2 checkboxes (with same inline validation + Privacy link).
- "Continue" button → `recordConsentFn` → `navigate({ to: "/onboarding" })`.
- Styled like onboarding (AuthShell-ish or matching dark card).

### Out of scope
- No backfill / re-prompt for existing users (per spec).
- No admin UI for viewing consent.
