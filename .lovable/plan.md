# Rules & How-to-Play

Add two surfaces explaining Marcador's scoring system: a quick-reference modal on the Play screen, and a dedicated `/rules` page accessible without login.

## 1. HowToPlayModal (new)

`src/components/play/HowToPlayModal.tsx` — shadcn `Dialog` with scrollable body.

Sections (icon + heading + concise body):
- ⚽ The basics
- 📊 How to score points (table: result +3, home goals +2, away goals +2, GD +3, first scorer +3 → max 13 group)
- 🔥 Round multipliers (×1 through ×6 with max points)
- ⚡ 2× Booster (after multiplier; Final boosted = 156)
- 🦄 Underdog bonus (+5 flat, <10% pick rate)
- 🏆 Tournament winner (+50)
- 🔒 Prediction locking (kickoff)
- 📅 When results are scored

Footer: `Got it!` close button + `Read full rules →` `<Link to="/rules">`.

## 2. Play screen trigger

Edit `src/routes/_authenticated/play.tsx` header (lines 124–144). Add a small `?` icon button (lucide `HelpCircle`, ghost, `size="icon"`) absolutely positioned top-right of the header, opening `HowToPlayModal` via local `useState`.

Keep `<HowPointsWork />` strip as-is for now (it's complementary).

## 3. Public /rules route

`src/routes/rules.tsx` — `createFileRoute('/rules')`, no auth, with `head()` meta (title, description, og:title, og:description).

Layout: simple page (own minimal shell — header with Marcador logo linking home, dark theme tokens). Two-column on md+: sticky table of contents (left) linking to `#overview`, `#predictions`, `#scoring`, `#multipliers`, `#booster`, `#underdog`, `#winner`, `#consistency`, `#leaderboard`, `#general`, `#fairplay`; content (right).

Content sections mirror the prompt verbatim (1–11), using amber `text-amber-glow` for h2 headings, semantic table for scoring/multiplier breakdowns, callouts for examples.

Footer of page: "Last updated: June 2026", contact line, and `<Link to="/play">Ready to predict? → Start playing</Link>`.

## 4. Footer links

- `src/components/AppShell.tsx` footer (line 135–143): add `<Link to="/rules">Rules</Link>` separator `·` next to "Support Marcador".
- `src/routes/index.tsx` footer (line 116) + hero: add small `<Link to="/rules">How does it work? →</Link>` text link in hero, and `Rules` in footer.

## Out of scope

- No DB / serverFn / scoring logic changes — copy only.
- No changes to existing `HowPointsWork` strip.
- No i18n changes.
