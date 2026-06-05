## Dark/Light Mode Toggle

### Theme strategy
- Use Tailwind v4 class-based dark variant already configured (`@custom-variant dark (&:is(.dark *))`).
- Move current dark color tokens out of `:root` into `.dark`. Add a light palette under `:root` using the brief's hex values (converted to oklch), keeping amber primary unchanged for both.
- Replace the gradient `body` background with a theme-aware variant (light: subtle warm gradient over `#F5F0E8`; dark: existing pitch gradient).

### Persistence + no-flash
- Inject a tiny inline script into `<head>` (via `head.scripts` in `__root.tsx`) that, before render, reads `localStorage["marcador_theme"]`, falls back to `prefers-color-scheme`, defaults to dark, and sets `html.className` to `dark` or `light`.
- Remove the hard-coded `className="dark"` on `<html>` in `RootShell`.
- Create `src/lib/theme.ts` with `getTheme()`, `setTheme(t)` (updates `html` class + localStorage), and a `useTheme()` hook subscribing to changes.

### Toggle button
- New `src/components/ThemeToggle.tsx` using `Sun`/`Moon` from `lucide-react`. Shows the icon for the *opposite* mode (sun in dark, moon in light). `transition-colors duration-200`.
- Place in `AppShell` header between display name and Sign out button (and visible for guests too, before the Exit button).

### Profile sync (optional, signed-in users)
- Migration: add `theme_preference text` nullable to `profiles`.
- On sign-in / `meFn`: if profile has `theme_preference` and no localStorage value, apply it.
- On toggle while signed in: fire-and-forget update to `profiles.theme_preference` via a new `setThemePreferenceFn` server function (`requireSupabaseAuth`).

### Sonner toaster
- Make `<Toaster theme={...} />` react to current theme via `useTheme()`.

### Audit screens for light-mode legibility
Most components already use semantic tokens (`bg-card`, `text-muted-foreground`, `border-border`), so the new tokens will flow through. Targeted sweep for any hard-coded dark-only classes (`bg-black`, `text-white`, `bg-white/5`, `border-white/10`, raw hex) across: landing, auth, onboarding, play, leaderboard, grupos, leagues, me, admin. Replace offenders with semantic tokens or `dark:` variants (e.g. `bg-white/5 dark:bg-white/5 bg-black/5`).

### Files
- edit `src/styles.css` (light tokens in `:root`, dark tokens moved into `.dark`, theme-aware body background)
- edit `src/routes/__root.tsx` (no-flash inline script, drop static `dark` class, dynamic Toaster theme)
- new `src/lib/theme.ts`
- new `src/components/ThemeToggle.tsx`
- edit `src/components/AppShell.tsx` (mount toggle)
- new migration adding `profiles.theme_preference`
- edit `src/lib/auth.functions.ts` (return + apply preference)
- new `src/lib/theme.functions.ts` (`setThemePreferenceFn`)
- sweep + minor edits to any screen using hard-coded dark-only colors

### Technical details
- Light tokens (approx):
  - `--background: oklch(0.96 0.012 80)` (#F5F0E8)
  - `--card: oklch(1 0 0)` (#FFFFFF)
  - `--foreground: oklch(0.18 0.025 60)` (#1A1209)
  - `--muted-foreground: oklch(0.47 0.025 65)` (#6B5E4E)
  - `--border: oklch(0.87 0.018 75)` (#E0D5C5)
  - `--input: oklch(0.92 0.015 75)` (#EDE8DF)
  - `--primary`, `--primary-foreground`, `--ring` unchanged (amber).
- The no-flash script is small (~250 bytes) and uses `document.documentElement.classList.add(...)`.
