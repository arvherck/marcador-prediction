# Feedback System Plan

## 1. Database (migration)

New table `public.feedback`:
- `id uuid pk default gen_random_uuid()`
- `user_id uuid null` (FK `profiles.user_id`, on delete set null)
- `display_name text null`
- `category text not null check (category in ('bug','suggestion','question','other'))`
- `message text not null check (char_length(message) between 10 and 1000)`
- `page text null`
- `created_at timestamptz not null default now()`
- `is_read boolean not null default false`
- `admin_notes text null`

Indexes: `(is_read, created_at desc)`, `(user_id, created_at desc)`.

GRANTs:
- `GRANT INSERT ON public.feedback TO anon, authenticated` (guests can submit)
- `GRANT SELECT ON public.feedback TO authenticated` (filtered by RLS)
- `GRANT ALL ON public.feedback TO service_role`

RLS:
- Insert anon: allow when `user_id IS NULL` and message length valid
- Insert authenticated: allow when `user_id = auth.uid()` OR `user_id IS NULL`
- Select authenticated: allow when `user_id = auth.uid()` OR `public.has_role(auth.uid(),'admin')`
- Update authenticated: only admins (for `is_read`, `admin_notes`)

Realtime:
- `ALTER PUBLICATION supabase_realtime ADD TABLE public.feedback;`

Rate limiting via trigger (`BEFORE INSERT`):
- If `NEW.user_id IS NOT NULL` and `(SELECT count(*) FROM feedback WHERE user_id = NEW.user_id AND created_at > now() - interval '24 hours') >= 5` → `RAISE EXCEPTION 'rate_limit_exceeded'`
- For guests (user_id null): rate-limit per page+message hash isn't reliable; skip server enforcement (the modal will only be shown once per session via localStorage soft limit). Acceptable since RLS still bounds the table.

Admin helper RPC `feedback_unread_count()` (SECURITY DEFINER, admin-only) returning int — used for badge without exposing rows.

## 2. Frontend — submission

New `src/components/feedback/FeedbackModal.tsx`:
- shadcn `Dialog` + `Select` + `Textarea` + `Button`
- Category options with emojis (bug/suggestion/question/other)
- Character counter `X / 1000`, validates 10–1000
- Pulls `display_name` from current profile (or "Guest" when signed-out)
- Auto-captures `window.location.pathname + search`
- On submit → insert via `supabase.from('feedback').insert(...)` directly (RLS-safe). Maps `rate_limit_exceeded` error to friendly message.
- Success → `toast.success("Thanks for your feedback! ⚽")` and close

Footer link "Send feedback" added in:
- `src/components/AppShell.tsx` footer (next to Rules · Support)
- `src/routes/index.tsx` landing footer
- `src/routes/rules.tsx` footer

Single shared `FeedbackButton` wrapper component used in all three.

## 3. Admin Panel — Feedback tab

`src/components/admin/FeedbackPanel.tsx`:
- Header with filter bar (category select, read/unread toggle, search input)
- "Mark all as read" button
- Table rows (date, user/Guest, category badge color-coded, message preview, page, bold if unread)
- Click row → expandable detail card: full message, user details, page URL, admin notes textarea (autosave on blur), Mark read/unread buttons
- Data fetched via direct `supabase.from('feedback').select('*, profiles(display_name, ...)')` (admin RLS allows)
- Mutations: `update({ is_read })`, `update({ admin_notes })`

Wire tab into `src/routes/_authenticated/admin.tsx` sidebar nav with `💬 Feedback` label and badge count.

## 4. Realtime unread badge

In the admin route:
- `useQuery(['feedback-unread'])` calling `supabase.rpc('feedback_unread_count')`
- Subscribe to `feedback` channel on mount; on any `INSERT` or `UPDATE`, invalidate the query
- Badge shows count + red dot when > 0

## 5. Guest support

Modal works without auth — `user_id` null, `display_name` "Guest". Insert allowed by anon RLS policy.

## 6. Files

- migration (new)
- `src/components/feedback/FeedbackModal.tsx` (new)
- `src/components/feedback/FeedbackButton.tsx` (new)
- `src/components/admin/FeedbackPanel.tsx` (new)
- edits: `src/components/AppShell.tsx`, `src/routes/index.tsx`, `src/routes/rules.tsx`, `src/routes/_authenticated/admin.tsx`

## Open question

Guest rate limiting: server-side per-IP isn't available without extra infra. Plan uses a client-side soft cap (5/day via localStorage) for guests; authenticated users get the hard DB-trigger limit. OK to proceed?
