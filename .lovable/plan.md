# Per-match scoring

Add a `Score` button to each individual match row in the admin Results & scoring section, so admins can award points for an early kickoff without waiting for the whole matchday.

## 1. Database migration

New function `public.score_match(_match_id int, _caller_id uuid) returns int`:

- Admin guard: `IF NOT public.has_role(_caller_id, 'admin') THEN RAISE EXCEPTION 'Forbidden'`.
- Load the match; if `status <> 'completed'` or `is_final = false`, `RAISE EXCEPTION 'Match is not yet complete'`.
- Recompute points for every prediction on that match using the exact same rules as `score_matchday` (result +3, home goals +2, away goals +2, GD +3, first scorer +3, booster x2, underdog +5 when exact scoreline share < 10%). Always recomputes from scratch, so re-runs are safe and correct after a result fix.
- Recalculate `matchday_scores` for the affected `matchday_id`: sum `predictions.points` across all final matches in that matchday per user, then `DENSE_RANK()` and upsert into `matchday_scores` (same SQL block as `score_matchday`).
- Do NOT touch `profiles.current_streak` / `longest_streak`, and do NOT flip `matchdays.is_scored`. Streaks remain matchday-level only.
- Returns the number of predictions updated.

Nothing else changes: `score_matchday`, the `validate_prediction` trigger fix, and other scoring logic stay exactly as they are.

## 2. Server function

In `src/lib/game.functions.ts` add `adminScoreMatchFn`, mirroring `adminScoreMatchdayFn`:

```ts
export const adminScoreMatchFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { match_id: number }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: count, error } = await supabase.rpc("score_match", {
      _match_id: data.match_id,
      _caller_id: userId,
    });
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  });
```

## 3. Admin UI (`src/routes/_authenticated/admin.tsx`, Results & scoring section)

- Per match row: render a new `Score` button next to the existing Save/Update button.
  - Enabled only when `match.status === 'completed'` (and result is final).
  - When disabled, render greyed-out with tooltip "Save a result first to enable scoring".
  - On click, call `adminScoreMatchFn({ data: { match_id } })`.
  - On success: inline "✓ {count} predictions scored" on the row, auto-clears after 3s (local `useState` keyed by match id + `setTimeout`).
  - On error: inline message in red with the error text.
- Per matchday header: show an amber dot + "● N matches need scoring" when there are completed/final matches in that matchday whose predictions still have `points IS NULL` (computed from already-loaded matchday matches + predictions, or a small derived count if available; falls back to count of completed matches if per-prediction points aren't loaded).
- Keep the existing "Run scoring" matchday button untouched.

## 4. Out of scope / preserved

- No changes to `score_matchday`, the matchday Run scoring button, `validate_prediction`, streaks, or any other scoring path.
- No new tables, no RLS changes (function is `SECURITY DEFINER` with explicit admin check).
