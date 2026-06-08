# Account deletion (GDPR)

## Goal
Let signed-in users permanently delete their Marcador account and personal data from the Mi Marcador page. Predictions are anonymised (kept for stats), everything else user-scoped is removed.

## Database migration

There is no `email_log` table in this project — that step from the spec is skipped.

Current FKs on `user_id` are mostly `ON DELETE CASCADE` (profiles, predictions, league_members, matchday_scores, user_roles, test_users). To preserve predictions for the underdog-bonus stats we must change the predictions FK and make the column nullable.

Migration:
- `ALTER TABLE public.predictions ALTER COLUMN user_id DROP NOT NULL`.
- `ALTER TABLE public.predictions DROP CONSTRAINT predictions_user_id_fkey, ADD CONSTRAINT predictions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL` (re-add as SET NULL so even if anonymisation order ever slips, predictions still survive auth.users deletion).
- Create `public.delete_my_account(_user_id uuid)` — `SECURITY DEFINER`, `search_path=public`, callable by `service_role` only (the server fn calls it via admin client). Body, in one transaction:
  1. `UPDATE predictions SET user_id = NULL WHERE user_id = _user_id` (anonymise).
  2. `DELETE FROM matchday_scores WHERE user_id = _user_id`.
  3. League ownership transfer: for each `leagues.owner_id = _user_id`, pick the earliest remaining `league_members.user_id` (other than _user_id) by `league_members.joined_at`/`created_at` if present, otherwise any → `UPDATE leagues SET owner_id = <member>`. If the league has no other members → `DELETE FROM leagues WHERE id = <id>` (cascades league_members).
  4. `DELETE FROM league_members WHERE user_id = _user_id`.
  5. `DELETE FROM tournament_predictions WHERE user_id = _user_id`.
  6. `DELETE FROM feedback WHERE user_id = _user_id` (spec says delete; FK is already SET NULL but the spec is explicit).
  7. `DELETE FROM user_roles WHERE user_id = _user_id`.
  8. `DELETE FROM profiles WHERE user_id = _user_id`.
- `GRANT EXECUTE ON FUNCTION public.delete_my_account(uuid) TO service_role`; revoke from public/authenticated.

The auth.users deletion is performed by the server function via `supabaseAdmin.auth.admin.deleteUser(userId)` AFTER `delete_my_account` returns. With predictions' FK now `SET NULL`, even the cascade path from auth.users would not destroy predictions.

## Server function — `src/lib/auth.functions.ts`

Add `deleteAccountFn`:
- `createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(...)`.
- Inside handler:
  - `const { userId } = context`.
  - `const { supabaseAdmin } = await import('@/integrations/supabase/client.server')` (per the import-graph rules — don't import at module scope in a `.functions.ts` file).
  - `const { error: rpcErr } = await supabaseAdmin.rpc('delete_my_account', { _user_id: userId })`. If error → throw `new Error('delete_failed: ' + rpcErr.message)` (no partial-delete fallback needed because the RPC body is one statement-list and Postgres wraps it in a single transaction; if any step fails the whole RPC rolls back).
  - `const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(userId)`. If error → throw.
  - Return `{ ok: true }`.

No client-side rollback is required since profile rows aren't deleted until the RPC succeeds, and the auth user is deleted last.

## Mi Marcador page — `src/routes/_authenticated/me.tsx`

At the very bottom of the page, after every existing section, render a new `DangerZone` component:
- Outer `<section>` with `border border-red-500/40 rounded-2xl bg-red-500/5 p-5 mt-10`.
- Heading "Danger zone" (red), subheading "Delete your account", subtext exactly per spec.
- Red "Delete my account" button (variant via tailwind classes) → opens a controlled `DeleteAccountDialog`.

`DeleteAccountDialog` (local component, uses existing `Dialog` from `@/components/ui/dialog` if available — otherwise inline modal styled the same way as other modals in the project):
- Title and bulleted warning per spec.
- Controlled `<input>` with placeholder `Type DELETE to confirm`; tracked in local state.
- "Permanently delete my account" button disabled until `confirm === 'DELETE'`.
- On confirm: `setStatus('deleting')`, call `deleteAccountFn` via `useServerFn`.
  - On success: `await supabase.auth.signOut()` (browser client), `queryClient.clear()`, then `window.location.assign('/?deleted=true')` (full reload guarantees no stale auth state slips back in).
  - On error: show inline error, re-enable buttons.

Loading state shows "Deleting your account…" in the dialog body.

## Landing page — `src/routes/index.tsx`

- Add a `?deleted` search param (zod-validated, optional boolean/string).
- When set, render a dismissible banner at the top of the landing hero:
  - Text: "Your account has been deleted. Thanks for playing Marcador."
  - Auto-dismiss after a few seconds OR include a small `×` button — pick `×` button for clarity; on click, `navigate({ search: {} })` to drop the param.

## Rules page — `src/routes/rules.tsx`

Add a new "Your data" section near the bottom (above the existing footer/credits) with the GDPR copy exactly per spec.

## Admin view note

The spec asks for a "Deleted user" label in admin logs. Two places it shows up automatically:
- `feedback.user_id` is set to NULL by the existing FK → in `FeedbackPanel`, when `user_id == null` (or `display_name` missing) render `Deleted user` in italics. Update only that label render — no schema/RPC changes.

No further admin UI changes are needed (predictions don't show user-attached names anywhere admin-facing today).

## Out of scope
- No new "deletion audit log" table.
- No email confirmation step.
- No undo / soft-delete grace period — deletion is immediate per spec.
- Other users' leaderboards refresh on their own via existing query invalidation; no extra broadcast needed.

## Files touched
- New migration (FK swap + nullability + `delete_my_account` function + grant).
- `src/lib/auth.functions.ts` — add `deleteAccountFn`.
- `src/routes/_authenticated/me.tsx` — add Danger zone section + DeleteAccountDialog.
- `src/routes/index.tsx` — handle `?deleted` banner.
- `src/routes/rules.tsx` — add "Your data" section.
- `src/components/admin/FeedbackPanel.tsx` — render "Deleted user" when `user_id` is null.
