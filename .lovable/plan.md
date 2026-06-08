# Predictions Closing Soon — Play screen banner

## Goal
Add a top-of-page urgency banner on `/play` that surfaces matches kicking off within the next 2 hours that the user has not yet predicted, plus a subtle pulsing highlight on the corresponding match cards. Guest users do not see the banner (they cannot predict).

## When to show
A match qualifies as "imminent + unpredicted" when ALL are true:
- `teams_confirmed === true`
- `status === 'upcoming'` (raw status, so the match has not kicked off / locked)
- `kickoff_at` is in the future and within the next 2 hours (`<= now + 2h`)
- `prediction === null` (user has not submitted)

The banner is shown iff there is at least one such match. The nearest one (smallest `kickoff_at`) drives the countdown text and styling.

## Banner content + styling
Position: very top of `PlayPage`, above `<TournamentBanner />` and the header. Full-width strip, rounded, non-dismissible.

States (driven by minutes-until-kickoff of the nearest match):
- `> 30 min`: amber background (`bg-amber-glow/15` + amber border + dark text), pulsing ⏰
  - 1 match: `⏰ {Home} vs {Away} kicks off in {Xh Ym} — predict now!`
  - N>1 matches: `⏰ {N} matches kick off in under 2 hours — you haven't predicted them all yet!`
- `5–30 min`: red background (`bg-red-500/15` + red border), 🔴
  - `🔴 {Home} vs {Away} kicks off in {M} minutes — last chance to predict!`
- `< 5 min`: red background, 🔴
  - `🔴 Predictions locking in {M} minutes!` (or `< 1 minute` when sub-minute)

Right side: a "Predict now →" button. Behavior:
- If current view is `date`: scroll-into-view the DOM node of the nearest unpredicted match (smooth, center).
- If current view is `matchday`: switch search to `view=date` first (so the card is rendered), then scroll on next tick. Also if `view=matchday` and the nearest match's matchday differs from the selected `md`, update `md` to the nearest match's matchday as a fallback before the scroll. (Spec allows either; we'll route to date view + scroll which always works.)

Live countdown: re-render every 1s via a `useNow(1000)` hook scoped to the banner (and the highlighted cards). Stop the interval when the page unmounts.

The banner auto-hides when no qualifying matches remain (user submits prediction → query invalidation removes it; or kickoff passes → effective status flips and the match is filtered out by `status === 'upcoming'` + future kickoff check).

## Match card highlight
In `ByDateView` and `ByMatchdayView`, wrap each rendered `MatchCard` in a `<div id="match-{id}" className={...}>` (or pass the id/classes via a new prop on `MatchCard`). When that match qualifies as imminent+unpredicted, add a pulsing amber ring: `ring-2 ring-amber-glow/60 animate-pulse rounded-2xl` (or a custom keyframe to keep it subtle — slower than `animate-pulse`). The id is needed so the banner's "Predict now →" can scroll to it.

The existing per-card "Locks in Xh Ym" countdown is untouched.

## Implementation

### New file: `src/components/play/ClosingSoonBanner.tsx`
- Props: `matches: Match[]`, `view: 'date'|'matchday'`, `onSwitchToDate: (matchId: string, mdId: number) => void`.
- Computes `imminent = matches.filter(qualifies)` on every render, sorted by `kickoff_at`.
- Returns `null` when empty.
- Uses a local `useNow(1000)` hook so the countdown ticks each second without re-fetching.
- Renders the strip + "Predict now →" button. The button:
  - `view === 'date'`: `document.getElementById('match-' + nearest.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })`.
  - `view === 'matchday'`: calls `onSwitchToDate(nearest.id, nearest.matchday_id)` which updates search to `{ view: 'date' }`, then on next animation frame scrolls to the id.

### Edit `src/routes/_authenticated/play.tsx`
- Import and render `<ClosingSoonBanner />` at the top of the returned tree (above `TournamentBanner`), only when `!guest`.
- Pass `view`, `matches`, and an `onSwitchToDate` that calls `navigate({ search: ... view: 'date' })` then schedules a `requestAnimationFrame` scroll.

### Edit `src/components/play/ByDateView.tsx` and `ByMatchdayView.tsx`
- Wrap each MatchCard render with `<div id={`match-${m.id}`} className={isImminentUnpredicted(m) ? 'rounded-2xl ring-2 ring-amber-glow/60 animate-[pulse_2s_ease-in-out_infinite]' : ''}>`. Helper lives in a shared util, e.g. `src/lib/imminent.ts`, exporting `isImminentUnpredicted(match, nowMs)` and `MS_2H = 2*60*60*1000`.
- To keep the ring "live" (so it disappears when kickoff passes), use the same `useNow(60_000)` at the view level so the boolean refreshes once a minute (sufficient for the 2h window edge).

### New file: `src/lib/imminent.ts`
- `MS_2H`, `qualifies(match, nowMs)`, `formatCountdown(msRemaining)` returning `"1h 23m"` / `"23 minutes"` / `"4 minutes"` / `"< 1 minute"`.

### New file: `src/hooks/useNow.ts`
- `useNow(intervalMs)` returning `Date.now()` and re-rendering on each tick. Cleaned up on unmount.

## Out of scope
- No dismiss / persistence.
- No push or email notifications.
- No changes to scoring, locking logic, or the per-card countdown.
- Guest users: banner not rendered (no predictions possible).
