# Fix login + onboarding (502 / Worker hang)

## What's happening end-to-end

1. `POST signInFn` succeeds (200, `{ ok: true }`) and the cookie is now sent (the previous `sameSite: "none"` fix worked).
2. `GET meFn` immediately after sign-in returns **502** with the runtime error: *"The Workers runtime canceled this request because it detected that your Worker's code had hung and would never generate a response."*
3. Same hang on every subsequent server function — including `completeOnboardingFn` on the onboarding page.

So the auth/session logic is correct now; the database call inside the second server function never returns, and Cloudflare kills the request.

## Root cause

`src/lib/lovable/database.ts` exports a **module-level `pg.Pool`**:

```ts
export const pool = new Pool({ connectionString: DATABASE_URL, ssl: true, max: 2, idleTimeoutMillis: 5000 })
```

On Cloudflare Workers (workerd + nodejs_compat), TCP sockets do **not** survive across requests. The first request in a fresh isolate opens a socket and works (that's why `signInFn` succeeds). Any later request reuses the cached `Pool`'s "idle" client whose underlying socket is already dead — `pool.query` waits forever for a response that will never come, so the Worker hangs and gets killed.

This matches every observed symptom exactly: first DB call after a cold start works, every following one hangs.

## Fix

Stop reusing connections across requests. Use a fresh `pg.Client` per query and end it when done.

### 1. New helper `src/lib/db.ts`

```ts
import { Client } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required");

export const pool = {
  async query<T = any>(text: string, params?: any[]) {
    const client = new Client({ connectionString: DATABASE_URL, ssl: true });
    await client.connect();
    try {
      return await client.query<T>(text, params);
    } finally {
      await client.end().catch(() => {});
    }
  },
};
```

Same `pool.query(...)` shape, so no call-site rewrites needed.

### 2. Repoint imports

Replace `from "./lovable/database"` / `from "@/lib/lovable/database"` with `from "@/lib/db"` (or relative equivalent) in:

- `src/lib/auth.server.ts`
- `src/lib/auth.functions.ts`
- `src/lib/game.functions.ts`

Leave `src/lib/lovable/database.ts` untouched (it's auto-generated).

## Verification

Use the preview browser:
1. Sign in with the existing test account → should land on `/onboarding` (or `/play` if already onboarded), not hang.
2. Submit the onboarding form → should redirect to `/play`.
3. Confirm in network panel that `meFn` and `completeOnboardingFn` return 200, not 502.
4. Reload `/play` to confirm the session survives and subsequent server fn calls (game data) also succeed.
