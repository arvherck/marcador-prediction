# Profile Editing on Mi Marcador

## 1. Server function

Add `updateProfileFn` in `src/lib/auth.functions.ts`:

- `createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])`
- Zod input:
  - `display_name`: trim, min 2, max 40, regex `/^[\p{L}\p{N} _-]+$/u` (letters/digits/spaces/`_-`)
  - `country`: trim, min 2, max 60
  - `favourite_team`: trim, min 2, max 60
- Handler:
  1. Query `profiles` for any other row where `display_name = data.display_name AND user_id <> userId`. If found, throw a typed error → frontend maps to "This display name is already taken — please choose another".
  2. Upsert into `profiles` on `user_id` with the three fields.
  3. Return `{ ok: true }`.

Keep `completeOnboardingFn` unchanged (onboarding flow can stay distinct).

## 2. Inline edit form on Mi Marcador

Edit `src/routes/_authenticated/me.tsx`:

- Replace the header block (lines ~66–88) with a new `ProfileHeader` component that holds `editing` state.
- Display mode:
  - Existing "Profile / Mi Marcador" header
  - Amber circle avatar showing initials derived from current `display_name` (1–2 chars), reusing the `bg-amber-gradient` styling used in `AppShell`'s "M" badge
  - Name · country · favourite team line
  - Small **✏️ Edit** amber text button to the right of the name
  - Donor badge, total points box, streak row (unchanged)
- Edit mode (replaces the name/country/team line, keeps total/streak below):
  - Display name input with live character count `X / 40` and inline validation errors
  - Country input (placeholder "Where you're tuning in from")
  - Favourite team `<select>` populated from `TEAMS_2026` (alphabetical, current value pre-selected)
  - Full-width amber **Save changes** button
  - **Cancel** text link below that resets local state and returns to display mode
  - Inline error region for server/validation errors

## 3. Save flow

- Client-side validation first (lengths, character regex). On fail, show inline error, do not call server.
- If all fields equal current profile values, just exit edit mode (no server call).
- `useMutation` calling `updateProfileFn`:
  - `onSuccess`:
    - `router.invalidate()` so `me.profile` (from route context loader) refreshes
    - `queryClient.invalidateQueries()` for `["leaderboard"]`, `["my-history"]`, `["my-stats"]` so leaderboards and history show the new name immediately
    - Toast: `Profile updated ✓`
    - Switch to display mode
  - `onError`: map `display_name_taken` error code → "This display name is already taken — please choose another"; otherwise generic "Could not save profile. Please try again."
- Avatar initials derive from the form's current `display_name` value while editing for live preview.

## 4. Verifications (no code changes expected)

- Leaderboard RPCs already join `profiles` live — display name updates flow through automatically.
- Predictions-by-matchday admin viewer reads `profiles.display_name` live — same.

## Files

- Modified: `src/lib/auth.functions.ts` (add `updateProfileFn`)
- Modified: `src/routes/_authenticated/me.tsx` (new inline `ProfileHeader` with display/edit modes)
- No migration required.

## Out of scope

- Email and password are not editable here.
- No avatar image upload — initials only.
- No redirect to onboarding screen after edit.
