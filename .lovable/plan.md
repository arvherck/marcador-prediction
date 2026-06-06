
# Redesign the By Date view on /play

Goal: turn the long, overwhelming 104-match list into a focused, progressive
view that defaults to the next 3 days and lets users explore further with
intentional gestures.

Scope: presentation only. No database, server function, scoring, or booster
logic changes. The By Matchday tab is untouched.

Also quietly fix the runtime error `column matches.is_selected does not exist`
that's leaking from a stale code path — almost certainly the `getAllMatchesPublic`
serverFn still selecting `is_selected`. The fix is to drop that column from its
select. No behavior change.

## What the user will see

1. **Progress bar at the top of By Date** — amber-filled bar, `38 / 104 predicted`,
   plus an urgency line `X matches locking in the next 24 hours` (amber) when applicable,
   replacing today's plain summary text inside `ByDateView`. The existing summary in the
   page header stays.

2. **"View past matches & results"** subtle link above the progress bar.
   Opens a left slide-in panel (shadcn `Sheet side="left"`) listing all matches
   with `kickoff_at < now`, grouped by date, showing final score, the user's
   prediction, and points earned. Click outside to close.

3. **"Coming Up" pill strip** — horizontal scrollable row of date pills for
   every day that has at least one match in the tournament:
   `📅 Today · 3 matches`, `Tomorrow · 5`, `Sat 13 Jun · 4`, …
   - Active-window pills (the days currently visible below) glow amber
   - Fully-predicted days show a green ✓
   - Past dates are muted grey
   - Tapping a pill scrolls to that date and, if needed, expands the visible
     window so that date is included

4. **Default visible window = today through next 3 calendar days**.
   If that range has zero matches, extend forward to include the next day
   that does. Past matches are hidden.

5. **Smart date headers** instead of plain `Monday 15 June 2026`:
   - `Today · Thursday 11 June`
   - `Tomorrow · Friday 12 June`
   - `This Saturday · 13 June` (within current week)
   - `Next Week · Monday 22 June` (next ISO week)
   - For knockout days, prepend the round name derived from the matchday/phase
     of that day's first match: `Round of 32 · Sunday 28 June`,
     `Round of 16 · …`, `Quarterfinals · …`, `Semifinals · …`, `Final · …`.

6. **Progressive "Show more" strip** at the bottom of the visible window.
   Not a plain button — a 64px blurred fade overlay (`backdrop-blur-sm` +
   `bg-gradient-to-t from-background`) with a centered amber pill button:
   - `⚽ 18 more matches this week →` (expands window 3 → 7 days)
   - `🏆 Round of 32 starts in X days →` (expands to next phase boundary)
   - Continues progressively until the full schedule is shown
   New matches fade-and-slide in (CSS `animate-in fade-in slide-in-from-bottom-4`).
   When fully expanded, the fade and pill disappear.

7. **Empty states inside the visible window**:
   - All predicted: `You're all caught up! ✓  Next matches on <smart label>`
     with a button that expands the window to include that date.
   - Rest day inside the window: `Rest day ⚽ — Next matches on <date>` with a
     live countdown to the next kickoff.

## Files

- **edit** `src/components/play/ByDateView.tsx` — rewrite around the new model:
  `visibleWindowDays` state (3 → 7 → next-phase → all), derived `dayBuckets`
  (every day in the tournament with its matches and predicted counts),
  `pastDrawerOpen` state, the progress bar, the pill strip, the smart-label
  header, the fade+pill "Show more" strip, empty states, the past-matches
  Sheet. Keep using the existing `MatchCard` unchanged.
- **new** `src/components/play/ComingUpStrip.tsx` — horizontal pill scroller
  (reuses Tailwind, no new deps). Receives `days[]`, `activeDayKeys`, and an
  `onJump(dateKey)` callback.
- **new** `src/components/play/PastMatchesPanel.tsx` — Sheet content rendering
  completed matches grouped by date with score, user pick, and points.
- **new** `src/lib/date-labels.ts` — pure helpers: `smartDayLabel(date, phase)`,
  `phaseFromMatchday(matchdayId, phase)`, `groupByDate(matches)`,
  `findNextPhaseBoundary(days, fromIndex)`. Unit-testable, no React.
- **edit** `src/lib/game.functions.ts` — in `getAllMatchesPublic` (and any
  other serverFn that still references it), remove `is_selected` from the
  Supabase `.select(...)` to resolve the runtime error. No other backend
  changes.

## Technical notes

- All data already lives in the existing `getAllMatches` / `getAllMatchesPublic`
  result (`matches: MatchRow[]`). No new server functions, no schema changes.
- Past matches for the drawer = `matches.filter(m => new Date(m.kickoff_at) < now)`.
  Score and points are already on `MatchRow`.
- Locking-in-24h count = matches with `!m.locked && kickoff - now < 24h && !m.prediction`.
- Progress bar denominator = `matches.filter(m => m.teams_confirmed).length`,
  numerator = those with `m.prediction`.
- Phase boundary for the next "Show more" CTA: walk forward through day buckets,
  find the first day whose phase differs from the last currently-visible day's
  phase; label uses that phase.
- Realtime subscription, view toggle, By Matchday tab, MatchCard, ScoringLegend,
  TournamentBanner, guest gating — all unchanged.
