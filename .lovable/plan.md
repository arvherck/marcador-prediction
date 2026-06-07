## Database

Migration adds a `status` column to `public.matches`:
- `status text NOT NULL DEFAULT 'upcoming'`
- CHECK constraint allowing only `'upcoming' | 'live' | 'completed' | 'cancelled'`
- Backfill existing rows: any row with `is_final = true` → `'completed'`, otherwise `'upcoming'`
- Index on `(matchday_id, status)` for the admin summary

Update `public.validate_prediction()` trigger so inserts/updates on `predictions` are rejected when `m_row.kickoff_at <= now()` OR `m_row.status <> 'upcoming'`. Error message unchanged: "Predictions are locked for this match".

No client-side / server-side auto-transition of `upcoming → live`. Server is the single source of truth for locking; UI just renders "live" when kickoff has passed but status is still `'upcoming'`.

## Server functions (`src/lib/game.functions.ts`)

- Extend `MatchRow` with `status: 'upcoming' | 'live' | 'completed' | 'cancelled'` and a derived `effective_status` (server computes: if `status === 'upcoming' && kickoff_at <= now` → `'live'`, else `status`).
- Update `mapMatch` to read `m.status` and compute both `status` and `effective_status`. `locked` becomes `effective_status !== 'upcoming'`.
- Update all match-select queries to include `status` (they already use `select("*")`, so this works automatically once the column exists).
- `savePredictionFn`: before upsert, fetch `matches.kickoff_at, status` and throw "Predictions are locked for this match" when locked. Belt-and-braces alongside the trigger so we get a clean error message before hitting Postgres.
- `setBoosterFn`: also check `status === 'upcoming'`.
- `adminSetResultFn`: include `status: 'completed'` in the update.
- New `adminSetMatchStatusFn({ match_id, status })`:
  - Admin-only via `assertAdmin`.
  - When setting `'upcoming'` on a match with `is_final = true`, also clear `home_score`/`away_score`/`first_scorer`/`is_final` so predictions can reopen cleanly.
  - Returns `{ ok: true }`.
- Extend `getMatchdaysWithProgress` (used by admin) to also return per-matchday `status_counts: { upcoming, live, completed, cancelled }` and `completed_count` so the admin UI can render the summary line and gate the "Run scoring" button without an extra round-trip.

## MatchCard UI (`src/components/play/MatchCard.tsx`)

Render four visual states keyed off `effective_status`:

- **upcoming**: existing card. Add a kickoff countdown line below the score row using `KickoffCountdown` (already in the codebase) — "Locks in 2h 34m" when <3h, "Locks in 1d 4h" otherwise. Hide when `disabled` (placeholder/guest already covered) or boosted ribbon would conflict (still show — small muted line under city/stadium row).
- **live**: pulsing red `🔴 LIVE` badge in the status-pill slot (replaces `StatusPill`). Score steppers and scorer buttons disabled; padlock + "Match in progress" subtext. If `match.prediction` exists, render a read-only summary row: "Your prediction: H-A · {home/away/no-goal} scored first".
- **completed**: show final score (already does), append "FT" badge in the status pill. If `match.prediction` exists with `points != null`, render a small breakdown line computed locally from the components the scoring engine awards (result, goal-difference, exact-home, exact-away, first-scorer, booster, underdog). Since the server only persists the total, the breakdown is a best-effort reconstruction from prediction vs match — wrap in a helper `explainPoints(prediction, match)` in `src/lib/scoring-explain.ts` that mirrors `score_matchday`'s rules and returns `Array<{ label, pts }>` plus a total. Render green when total > 0, muted "0 pts" otherwise.
- **cancelled**: muted "Match cancelled" text, no inputs, show prediction greyed out if present.

Auto-correct/consistency logic from the previous turn stays intact and only runs when not locked.

## Admin panel (`src/routes/_authenticated/admin.tsx`)

`MatchdayBlock` header summary line:
> "Matchday 1 — Group Stage · ✅ 18 completed · 🔴 4 live · 🟡 2 upcoming · ⛔ 1 cancelled"
(skip zero-count segments). Live count uses `effective_status` computed client-side from `kickoff_at + status`.

`ResultRow` additions:
- Status badge with emoji + label next to the team names.
- "Change status" dropdown (compact `<select>`) calling a new mutation around `adminSetMatchStatusFn`.
  - Setting to `'upcoming'` shows a `window.confirm`: "This will reopen predictions for {home} vs {away}. Continue?".
  - Setting to `'completed'` when no scores entered (`current.home === 0 && current.away === 0 && current.scorer === 'none' && !m.is_final`) shows `window.confirm`: "No score entered. Mark as completed anyway?".
- Existing Save flow already auto-sets `status='completed'` via `adminSetResultFn`; on success update toast to "Result saved · Match marked as completed".

"Run scoring" button:
- Disabled when `completed_count === 0`.
- Label: `Run scoring ({completed_count} completed match{es})`.
- On success toast already exists; extend it to `"X predictions scored · avg Y pts"` by querying scored predictions count + avg via a tiny new server fn `adminMatchdayScoringSummaryFn({ matchday_id })` that returns `{ predictions_scored, avg_points }`.

## Files

- New migration: `status` column + CHECK + backfill + updated `validate_prediction()`.
- Edit `src/lib/game.functions.ts`: types, mapMatch, savePredictionFn guard, setBoosterFn guard, adminSetResultFn writes status, new adminSetMatchStatusFn, extended getMatchdaysWithProgress, new adminMatchdayScoringSummaryFn.
- New `src/lib/scoring-explain.ts`: pure helper mirroring `score_matchday` rules (no underdog because that requires aggregate data; the breakdown shows components we can determine locally and the persisted total).
- Edit `src/components/play/MatchCard.tsx`: status-driven rendering, countdown, live/completed/cancelled variants, prediction summary, points breakdown.
- Edit `src/routes/_authenticated/admin.tsx`: matchday status summary, per-row status badge + change dropdown with confirms, gated Run scoring button + count, post-scoring summary toast.
- Edit `src/components/admin/TestsPanel.tsx` + `src/lib/admin-tests.functions.ts`: add a critical test "Match status enforces lock" that attempts to insert a prediction on a `cancelled` future match and expects rejection.

No changes to RLS or grants.
