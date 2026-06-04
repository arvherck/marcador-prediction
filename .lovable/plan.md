## Finishing touches

### 1. `src/components/EmptyBall.tsx` — animated football illustration

Pure-CSS/SVG football (black-and-white pentagon ball) with a gentle bounce + shadow pulse via Tailwind `animate-bounce` plus a custom keyframe added in `src/styles.css` (`@keyframes ball-spin` for a slow rotation). Component `<EmptyBall label="..." sub="..." />` renders ball + headline + subline, centered. Used by:
- Play page when `q.data === null` or no matches
- Mi Marcador when user has no scored predictions
- Leaderboard when no rows

### 2. `src/components/KickoffCountdown.tsx` — bold lock countdown

Computes time until the earliest non-locked match's `kickoff_at`. Updates every second via `useEffect` + `setInterval`. Renders four big tiles (D / H / M / S) with `font-score`, amber gradient background, subtle pulse when <10 min, "BLOQUEO INMINENTE" red flash when <60s. If all matches are locked, renders nothing (or "Jornada bloqueada"). Drop into `play.tsx` directly under the matchday header.

### 3. Shareable summary card after submit

- New `src/components/PicksShareCard.tsx`: 1080×1350 logical layout (scales responsively, but locked aspect for screenshot). Amber-dark gradient bg, "EL MARCADOR" wordmark, matchday name, user display name, then a stacked list of all 6 picks (flag · team · score · team · flag) with the boosted pick highlighted with ⚡ and a glow ring. Footer: "marcador.app". Built with normal DOM (no canvas) so users can screenshot it.
- New `src/components/ShareModal.tsx`: lightweight modal (fixed inset, backdrop blur) rendering `PicksShareCard` plus three buttons: **Copiar imagen** (uses `html-to-image` → clipboard), **Descargar PNG** (download), **Cerrar**. Install one tiny dep: `html-to-image` (Worker-safe, browser-only — only invoked in event handlers).
- Hook into `play.tsx`: after `submitAll` `onSuccess` with `saved > 0`, set `showShare = true` and open the modal. Also add a persistent "Compartir mis picks" button in the sticky bar once all 6 are saved, so users can re-share without resubmitting.

### 4. `src/routes/_authenticated/me.tsx` — "Mi Marcador" profile

Three sections:

1. **Historial de predicciones** — table grouped by matchday: match, pick, real, points. Reuses existing data via a new `getMyHistoryFn` server function that returns `{ matchday_id, matchday_name, matches: [{ home_team, away_team, home_score, away_score, pred_home, pred_away, pred_first, points, booster }] }[]`.
2. **Puntos por jornada** — simple bar chart. Pure-SVG bars (no recharts dep): one bar per scored matchday, height ∝ points, amber gradient fill, value label on top, matchday label below. Reuses `matchday_scores` via new `getMyMatchdayScoresFn` returning `{ matchday_id, name, total_points, rank }[]` ordered by `starts_at`.
3. **Ranking en el tiempo** — same data as #2 but a line chart of `rank` over matchdays (lower = better; y-axis inverted). Pure SVG polyline + dots, amber stroke, rank annotations.

Server additions in `src/lib/game.functions.ts`:
- `getMyHistoryFn` (GET, auth) — joins `predictions` + `matches` + `matchdays` for current user, ordered by matchday `starts_at` then kickoff.
- `getMyMatchdayScoresFn` (GET, auth) — `SELECT ms.*, md.name, md.starts_at FROM matchday_scores ms JOIN matchdays md ... WHERE user_id = me.id ORDER BY md.starts_at`.

Nav: add **"Mi Marcador"** tab to `AppShell` (`/me`), with a small user icon. Desktop nav becomes 4 tabs; mobile bottom nav becomes 4 columns (`grid-cols-4`).

### Technical notes

- Bar/line charts hand-rolled in SVG, no charting lib (keeps bundle small, matches "simple" brief).
- `html-to-image` is browser-only; gate any call behind an event handler (already the case).
- All new copy in Spanish to match Marcador's existing tone: "Mi Marcador", "Compartir mis picks", "Bloqueo en…", "Sin predicciones todavía".
- Empty-state animation uses CSS only (no Lottie) — keeps it fast.

### Out of scope

- Editing display name / avatar on Mi Marcador (existing onboarding owns that).
- Server-side OG image generation for share card (client-side screenshot is sufficient per brief).
