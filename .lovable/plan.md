## Goal
Add a client-side test report export feature to the 🧪 Tests section of the admin Panel de Control. No changes to existing test logic or test cases — pure read-on-top of current `TestsPanel` state.

## UI changes (in `src/components/admin/TestsPanel.tsx`)

1. Next to **▶ Run all tests** in the "Full test suite" header, add three buttons:
   - **📋 Copy report** → builds markdown, writes to clipboard, toast: *"Report copied ✓ — paste into Claude or Lovable"*.
   - **⬇️ Download report** → builds JSON, downloads as `marcador-test-report-YYYYMMDD-HHmm.json`.
   - **📜 History** → dropdown (popover) listing last 5 reports from localStorage; clicking one re-displays its results.
   - All three disabled until `allRun === true` at least once in the session (or a historical report is loaded).

2. Add a collapsible info box at the top of `TestsPanel` with the 5-step "How to use this report" instructions (default collapsed; uses existing card styling).

3. When viewing a historical report, render a banner at top:
   *"Viewing historical report from {time} — click 'Run all tests' for current results"*, plus a "Return to live" button. Clicking **Run all tests** also clears historical view.

## Report generation (new file `src/lib/test-report.ts`)

Pure helper module, no server calls. Exports:

- `buildReport(tests, results, env)` → in-memory structure with summary, launch readiness, categories, environment.
- `toMarkdown(report)` → exact markdown spec in the prompt (header, Launch Readiness with critical list, Failed Tests with category/error/expected/actual/likely cause/file hint, Warnings, Passed compact list, Category Summary table with all 10 categories from spec, Suggested Fix Prompts for failed tests only, Environment).
- `toJson(report)` → JSON shape per spec (pretty-printed 2-space).
- `FIX_PROMPT_TEMPLATES: Record<testId, (ctx) => string>` — lookup keyed by test id covering the templates in the prompt; fallback generic template for any other failure.
- `FILE_HINTS: Record<testId, string>` — short file/function hint per known test (e.g. `score_matchday` → `supabase migrations + src/lib/game.functions.ts`). Generic empty for others.
- `LIKELY_CAUSES: Record<testId, string>` — one-sentence diagnoses for known failures.

## State changes in `TestsPanel`

- Track `startedAt` / `finishedAt` to compute `duration_ms` (set in `runAll`; per-test durations optional, default 0 if not measured cheaply — store `Date.now()` deltas around each `runOne` inside `runAll` to populate `duration_ms` per test).
- Track `lastReport` so Copy/Download act on the most recent run.
- On `runAll` completion: build report, save into `localStorage` key `marcador_test_reports` as newest-first array, capped at 5. Wrap reads/writes in try/catch (fail silently).
- `historicalView: report | null` — when set, render results from the historical report's per-test status instead of live `state`.

## Category mapping for report

The spec's "Category Summary" lists 10 categories including some not in current `TESTS` array (e.g. *Security & RLS* vs current *🔐 Auth & RLS*, *Round Multipliers* vs *✖️ Multipliers*, plus *Launch Readiness* as a virtual category derived from `critical` flag). Mapping table:

```text
spec category          → source
Data Integrity         → "📊 Data Integrity"
Security & RLS         → "🔐 Auth & RLS"
Scoring Engine         → "⚽ Scoring Engine" + EDGE_TESTS
Round Multipliers      → "✖️ Multipliers"
Tournament Winner      → "🏆 Tournament Winner"
Prediction Locking     → "🔒 Prediction Locking" + LOCK_TESTS
Standings Trigger      → "🏟️ Standings Trigger" + standings verifier
Ligas                  → "🤝 Ligas"
Pre-WC Test Matches    → "🧪 Pre-WC Test Matches"
Launch Readiness       → virtual: all tests with critical=true
```

Edge cases, lock tests, and standings verifier currently live in sibling panels with their own state. Decision needed (see question below).

## Environment fields

- `supabase_url`: `import.meta.env.VITE_SUPABASE_URL`
- `app_version`: read from `package.json` via Vite `?raw` import or hardcode `__APP_VERSION__` via `define`. Simplest: import `version` from `../../package.json`.
- `admin_display_name`: from existing auth context / profile query already used elsewhere in admin panel.
- `app_url`: `window.location.origin`.

## Out of scope

- No new server functions, migrations, or test logic changes.
- No edits to the "Run all tests" function beyond adding report capture.

---

## One clarifying question

The current panel runs **TESTS** (main suite), **EDGE_TESTS**, **LOCK_TESTS**, and **standings verifier** as separate "Run all" buttons with isolated state. The spec's report covers Scoring Engine edge cases, Prediction Locking, and Standings Trigger as their own categories.

Two options:
- **A. Main "Run all tests" runs only `TESTS`** (current behavior); report covers only those. Edge/Lock/Standings categories appear in summary only if user ran them separately, otherwise show as "not run".
- **B. Make "Run all tests" run everything** (TESTS + EDGE_TESTS + LOCK_TESTS + standings verifier) so a single click produces a complete report. Longer runtime but matches the spec's intent of a one-button complete report.

I'd recommend **B** so the exported report is genuinely self-contained. Confirm before I implement, or say "A" to keep current scope.