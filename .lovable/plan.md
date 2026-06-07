## Goal
Make score predictions and "first to score" always logically consistent, auto-correcting silently with a small hint when the system rewrites the user's input. Apply the same rules to user prediction cards (Play screen) and admin result entry.

## Consistency rules (single source of truth)

Implement a small pure helper `reconcilePrediction({ home, away, scorer, changed })` returning `{ home, away, scorer, hint? }`.

Logic:
- `changed === "scorer"`:
  - if `scorer === "none"` → force `home = 0, away = 0`, hint "No goal selected — score set to 0-0".
  - if `scorer === "home"` and `home === 0` → set `home = 1`, hint "Home goals set to 1 — home team scores first".
  - if `scorer === "away"` and `away === 0` → set `away = 1`, hint "Away goals set to 1 — away team scores first".
- `changed === "home"` or `"away"`:
  - if `home === 0 && away === 0` → force `scorer = "none"`, hint "0-0 — set to no goal".
  - else if `scorer === "home" && home === 0` → switch to `away` if `away > 0`, otherwise `none`. Hint matches the destination.
  - else if `scorer === "away" && away === 0` → switch to `home` if `home > 0`, otherwise `none`.

The helper is called on every user edit; it never blocks, never throws.

## Play screen — `src/components/play/MatchCard.tsx`
- Add `reconcilePrediction` (co-located util or in `src/lib/prediction-consistency.ts`).
- Replace the three setters with a single `apply(next, changed)` that runs the helper, calls `setHome/setAway/setScorer`, marks dirty, and stores the latest hint in local state.
- `ScorePair.onChange` and the scorer buttons feed into `apply`.
- Disable the inc/dec buttons that would create an inconsistent state purely as UX polish (auto-correct is the real guard):
  - `scorer === "none"` → score steppers disabled (`No goal — score locked at 0-0`).
  - `scorer === "home"` → home decrement disabled at `home === 1`.
  - `scorer === "away"` → away decrement disabled at `away === 1`.
- Render the most recent hint below the score row as a small muted line (text-[11px] text-muted-foreground), auto-clearing after ~4s or on next manual edit.
- Booster, lock, placeholder, save flow untouched. Used by both featured cards and the full schedule (they all render `MatchCard`).

## Admin — `src/routes/_authenticated/admin.tsx`
- Import the same `reconcilePrediction` helper.
- In `ResultRow`, wrap `onDraftChange` so every score/scorer change is reconciled before being written to the draft, and stash a per-row hint to render under the inputs.
- Disable home decrement when `scorer === "home" && current.home === 1`, away decrement when `scorer === "away" && current.away === 1`, and disable both score inputs (with hint) when `scorer === "none"`. For the `<input type="number">`, enforce via `min` and by clamping on change rather than blocking the input.
- `saveAll` and the single-row `Save` button additionally run a final reconcile + a hard guard:
  - If `home === 0 && scorer === "home"` or `away === 0 && scorer === "away"`, show inline error "Inconsistent result — {team} cannot score first with 0 goals" on that row, skip the save for that row, and toast "Fix inconsistencies before saving" (saveAll continues with the valid rows but still surfaces the count).
  - If both scores are 0, force `scorer = "none"` and proceed.

## Files
- New: `src/lib/prediction-consistency.ts` (pure helper + types).
- Edit: `src/components/play/MatchCard.tsx` — wire helper, hint UI, disabled stepper states.
- Edit: `src/routes/_authenticated/admin.tsx` — wire helper into `ResultRow`, add per-row inline error, guard `saveAll` and `save`.

No DB or server-function changes. No new packages.
