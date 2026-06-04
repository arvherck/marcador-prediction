# Continue as Guest

## Note on Supabase
The brief asks for `supabase.auth.signInAnonymously()`, but Marcador uses a custom cookie-session auth (`app_users` + bcrypt + `useSession`), not Supabase Auth. I'll implement the same intent — an ephemeral, no-profile, no-leaderboard guest session — using the existing stack. No new auth dependency.

## Behavior
- Guest state lives in `sessionStorage` only (cleared when the tab/app closes — matches "does not persist").
- No `app_users` row, no `profiles` row, no server session cookie.
- Guests can read: current matchday's 6 selected matches, global leaderboard, completed match results.
- Guests cannot: submit predictions, pick boosters, join/create leagues, appear on any leaderboard, access "Mi Marcador" or admin.

## Changes

### 1. Guest client state
- New `src/lib/guest.ts`: `isGuest()`, `setGuest(true|false)`, `clearGuest()` — backed by `sessionStorage.getItem("marcador_guest")`. SSR-safe (returns false when `window` is undefined).
- New hook `useGuest()` in same file returning a reactive boolean (subscribes to a custom event dispatched by `setGuest`).

### 2. Auth screen
- `src/routes/auth.tsx`: add a "Continuar como invitado" button below the email form (subtle, ghost style). On click: `setGuest(true)` → `navigate({ to: "/play" })`.

### 3. Route gate
- `src/routes/_authenticated.tsx`: allow entry when `meFn()` returns null **and** `isGuest()` is true, but only for a guest-allowed subset: `/play` and `/leaderboard`. Any other path under `_authenticated` (onboarding, leagues, me, admin) redirects to `/auth`. Skip the onboarding redirect for guests.
- Return `{ me: null, isGuest: true }` from `beforeLoad` so children can read it via `Route.useRouteContext()`.

### 4. Public server functions
The existing fetchers for matchday + leaderboard are likely auth-gated. I'll either:
- Add `currentMatchdayPublicFn` and `globalLeaderboardPublicFn` that don't call `requireUser()`, returning the same shape minus user-specific fields (no `myPrediction`, no `myRank`); or
- Make the existing fns tolerate a null user.

I'll pick the second when the existing fn already returns user-specific data optionally, otherwise add public siblings. Decided per-function while editing `src/lib/game.functions.ts`.

### 5. Play screen (read-only for guests)
- `src/routes/_authenticated/play.tsx`: when `isGuest`, fetch via the public fn, hide the submit/booster controls, replace the prediction inputs with disabled placeholders, and show the same matches + kickoff countdown.
- Intercept any prediction action with a shared `<GuestGate>` modal (see §7).

### 6. Leaderboard screen
- `src/routes/_authenticated/leaderboard.tsx`: fetch via public fn when guest. No "your rank" row.

### 7. Guest upsell prompt
- New `src/components/GuestGate.tsx`: a small modal component with the copy "Crea una cuenta gratis para hacer predicciones y competir en la tabla." + "Crear cuenta" button → `clearGuest()` then `navigate({ to: "/auth" })`, plus a "Seguir como invitado" dismiss.
- Helper `useGuestGate()` returns `{ require, modal }`. Wrap any guarded action: `require(() => doThing())`. Used in play (submit/booster) and leagues entry points.

### 8. Leagues entry points
- `src/components/AppShell.tsx`: when guest, the "Ligas" and "Mi Marcador" nav items either hide or open the GuestGate. I'll hide "Mi Marcador" (account-only concept) and keep "Ligas" visible but route it through GuestGate. Add a small "Invitado" badge near the avatar with a "Salir" link that calls `clearGuest()` → `/auth`.

### 9. Server-side safety
- Guests have no session cookie, so `requireUser()` on any mutation (`submitPredictionsFn`, `joinLeagueFn`, `createLeagueFn`) already throws. No server changes needed for protection — the GuestGate is purely UX.

### 10. Persistence
- `sessionStorage` clears on tab close, satisfying "does not persist". On reload within the same tab the guest stays in — acceptable and standard. If you want hard "every reload = back to login," I'll switch to in-memory `useState` at the root instead; flag if you prefer that.

## Files
- New: `src/lib/guest.ts`, `src/components/GuestGate.tsx`
- Edit: `src/routes/auth.tsx`, `src/routes/_authenticated.tsx`, `src/routes/_authenticated/play.tsx`, `src/routes/_authenticated/leaderboard.tsx`, `src/components/AppShell.tsx`, `src/lib/game.functions.ts` (add public read fns as needed)

## Out of scope
- Converting a guest session into a real account while preserving any in-memory picks (guests can't make picks anyway).
- Server-side anonymous user rows.
