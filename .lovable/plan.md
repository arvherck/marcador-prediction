## Root cause

`src/routes/auth.tsx` declares route `/auth` and also becomes the layout parent for every sibling that starts with `auth.` (`auth.signup`, `auth.reset`, `auth.new-password`, `auth.callback`) under TanStack's file-based routing. Confirmed in `routeTree.gen.ts` — `AuthRouteWithChildren`.

But `AuthPage` returns the full login form, not `<Outlet />`. Result: navigating to `/auth/signup` matches the parent `/auth` route, re-renders the login form, and the signup component never mounts. Same problem for `/auth/reset`, `/auth/new-password`, and `/auth/callback` — they're all currently dead.

## Fix

Rename `src/routes/auth.tsx` → `src/routes/auth.index.tsx`. This converts `/auth` into a leaf route and makes `auth.signup`, `auth.reset`, `auth.new-password`, `auth.callback` siblings instead of children. Each will render on its own.

Inside the moved file, no code changes needed — `createFileRoute("/auth")` still maps correctly because the URL is determined by the filename prefix (`auth.index` → `/auth`).

The route tree regenerates automatically on the next build/dev pass.

## Files

- `src/routes/auth.tsx` → renamed to `src/routes/auth.index.tsx` (single `mv`, no content edits).

No other files need changes. No DB, no UI redesign, no logic changes.

## Verification

After the rename, click "New here? Create an account →" from `/auth` and confirm the signup form renders. Also spot-check `/auth/reset` loads the reset page.
