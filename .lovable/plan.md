# Cookie Notice Banner

Add a slim, dismissible informational cookie banner shown only on public pages to logged-out visitors.

## New component

`src/components/CookieNotice.tsx`
- Fixed bottom bar, dark background (use existing card/border tokens), high z-index (`z-50`), max-width container, small text, slim padding. Non-blocking — does not overlay full screen.
- Content: "Marcador uses essential cookies to keep you logged in. No tracking or advertising cookies are used." followed by two actions:
  - "Learn more" → `<Link to="/privacy" hash="cookies">` (anchor `#cookies` on the privacy page)
  - "Got it" → button that sets `localStorage.marcador_cookie_notice = "dismissed"` and hides the banner
- On mount: check `localStorage.marcador_cookie_notice`. If present, render nothing. Also check Supabase session via `supabase.auth.getSession()` — if a session exists, render nothing (and subscribe with `onAuthStateChange` so it disappears on login during the visit).
- SSR-safe: gate on a `mounted` state so nothing renders during SSR (avoids hydration mismatch and `window` access).

## Where it renders

Add `<CookieNotice />` to exactly the four public route components:
- `src/routes/index.tsx` (landing)
- `src/routes/auth.tsx` (or the actual auth route file used — confirm during edit; the spec says `/auth`)
- `src/routes/rules.tsx`
- `src/routes/privacy.tsx`

This keeps it out of all `_authenticated/*` pages by construction, satisfying "do not show to logged-in users / on any authenticated page."

## Privacy page anchor

In `src/routes/privacy.tsx`, ensure the Cookies section heading has `id="cookies"` so `/privacy#cookies` scrolls to it. Add the id if it isn't already there.

## Out of scope

- No consent gating (functional-only cookies, per spec).
- No server-side storage of dismissal.
- No changes to authenticated routes or auth flow.
