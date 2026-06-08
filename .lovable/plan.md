# Make the 2× booster a toggle

## Server: `setBoosterFn` in `src/lib/game.functions.ts`

Add a check for the current state and branch:

1. Keep current input shape `{ matchday_id, match_id }` (no new parameter needed — server reads state).
2. Keep the kickoff/locked check unchanged (lines 380–394).
3. After the lock check, read the current prediction:
   - `select("id, booster")` for `(user_id, match_id)`.
4. If `existing?.booster === true`: simply update that row to `booster: false` and return `{ ok: true, applied: false }`. Skip the "clear others / set true" branch entirely so other matches are untouched.
5. Otherwise: keep the existing apply flow (insert a default prediction if none, clear booster on all other matchday predictions, set `booster: true` on this one), and return `{ ok: true, applied: true }`.

## UI: booster button in `src/components/play/MatchCard.tsx`

1. `boost.mutate()` already calls the same fn — switch the `onSuccess` to use the returned `applied` flag:
   - `applied === true` → `toast.success("2× booster applied.")`
   - `applied === false` → `toast("Booster removed.")`
2. Disabled logic — only disable when:
   - `boost.isPending`, OR
   - `match.locked` (already a separate branch shows the padlock), OR
   - `otherBoosted && !isBoosted` (another match in the matchday has the booster; user must remove it there first).
   Currently disabled is `boost.isPending || otherBoosted`, which blocks the active button from being clicked to remove — that's the bug. Allow click when `isBoosted` is true.
3. Visual states (no new tokens):
   - `isBoosted` → keep `bg-amber-gradient text-primary-foreground shadow-glow`, label `2× active`, filled `Zap`.
   - `otherBoosted` (and not boosted here) → muted/disabled style, label `2× boost`, tooltip unchanged.
   - Default → outline-ish `bg-secondary` style, label `2× boost`.
4. `title` tooltip: when `isBoosted`, show `"Remove 2× booster"`; otherwise keep the existing strings.
5. Locked branch (`match.locked` true) already renders the padlock — no change.

## Out of scope

No changes to scoring, queries, or other booster-related code paths. No new server fn; same endpoint, new branch.
