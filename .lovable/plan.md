# Fix: login does nothing / can't reach app pages

## Root cause

`signInFn` correctly verifies the password and writes the session, but the session cookie is configured with `SameSite=Lax`. The Lovable preview renders the app inside a cross-origin iframe, and browsers drop `SameSite=Lax` cookies on cross-site responses. So the `Set-Cookie` from sign-in is silently discarded, the next `meFn` call sees no session, and `_authenticated`'s `beforeLoad` redirects back to `/auth`.

Network log confirms it: `signInFn` returns `{ ok: true }`, then `meFn` immediately returns `null`.

## Change

In `src/lib/auth.server.ts`, update the session cookie options:

- `sameSite: "lax"` → `sameSite: "none"`
- keep `secure: true` (required when `SameSite=None`)
- keep `httpOnly: true`, `path: "/"`

That's the only code change needed.

## Why this is safe

- `Secure` is already true, which is the requirement for `SameSite=None`.
- The cookie is still `httpOnly`, so JS can't read it.
- This is the standard fix for any app that needs to work both standalone and inside the Lovable preview iframe.

## Verification

After the change:
1. Reload `/auth`, sign in with the test account.
2. `signInFn` POST → `meFn` GET should now return the user object (not null).
3. The router should navigate to `/onboarding` (or `/play` if onboarding is already complete) instead of bouncing back to `/auth`.
