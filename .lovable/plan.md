## Goal
Make admin Tests section a one-stop "test → reset → re-test" workflow. Three new capabilities on top of what exists: live state dashboard, one-click reset to go-live state, pre-test safety check, plus a longer workflow guide. **No changes to any existing test logic or test cases.**

The export/history feature from the previous turn already covers section 5 — reconciliation listed below.

---

## 1. App State Dashboard (new component)

New component `AppStateDashboard` rendered at the very top of `TestsPanel`, above the how-to box.

Pulls counts via a new server fn `adminGetAppStateFn` (uses `supabaseAdmin` for accurate counts, gated by `assertAdmin(_caller_id)`):

```ts
{
  predictions: { total, real_users, test_users },
  test_users: number,
  real_match_scores: number,      // matches where home_score not null AND matchday.is_test=false AND home_team not in test sentinels
  orphan_test_matchdays: number,  // matchdays where name LIKE '\__%' AND is_test = false (orphans)
  tournament_predictions: number,
  scored_matchdays: number,       // matchdays where is_scored = true AND is_test = false
  app_clean: boolean              // true when all red indicators are zero
}
```

UI: grid of 6 status pills with colored dot (green/amber/red) + count + sub-label. Manual **↻ Refresh state** button. Auto-refresh via `useQuery({ refetchInterval: 30_000 })`. Header pill: 🟢 **App is in clean go-live state** / 🔴 **Test data present**.

## 2. Reset to Go-Live State

New prominent destructive card directly under the dashboard with a **🔄 Reset to go-live state** button (red, danger-style).

Click opens shadcn `AlertDialog` with the exact copy from the spec (what will/won't be deleted) plus a text input that requires literal uppercase `RESET` (case-sensitive `=== "RESET"`). Disabled "Reset app" button until match.

New server fn `adminResetToGoLiveFn` (uses `supabaseAdmin`, `assertAdmin(_caller_id)`), runs in this order, capturing per-step counts, never aborting the cascade on a single-step error (returns `{ ok, steps: [...], errors: [...] }`):

1. `DELETE FROM predictions` → count
2. `DELETE FROM matchday_scores` → count
3. `UPDATE matches SET home_score=null, away_score=null, first_scorer=null, is_final=false, status='upcoming' WHERE home_team NOT LIKE 'UI_Test%' AND home_team NOT LIKE '\_\_%' ESCAPE '\'` → count
4. `UPDATE wc_standings SET played=0, won=0, drawn=0, lost=0, goals_for=0, goals_against=0, points=0` → count
5. `UPDATE profiles SET current_streak=0, longest_streak=0` → count
6. Inline equivalent of `adminDeleteTestUsersFn` (call the existing DB function `delete_test_users(_caller_id)`)
7. Inline equivalent of `purgeTestArtifacts()` (currently a local helper in `admin-tests.functions.ts`) — extract into a small shared server helper and call from both places
8. `UPDATE matchdays SET is_scored=false WHERE COALESCE(is_test,false)=false` → count
9. Log to `api_sync_log` with action='reset_go_live' and full counts JSON

Success state in the modal: green check + per-step counts (matches spec copy). Partial failure: list which steps succeeded with counts and which failed with the error message; do not auto-close. After success, also invalidate the dashboard query so counts refresh.

> **NOTE — this wipes ALL predictions including from real users.** The spec is explicit ("Predictions from all users"). I'll honor it; surfacing here so it's not silent.

## 3. Pre-test Safety Check

Small card with **⚡ Quick test check** button. New server fn `adminQuickTestCheckFn` runs 4 fast SELECTs and returns:

```ts
{
  scored_real_matchdays: number,
  real_user_live_predictions: number,
  orphan_test_artifacts: number,
  leftover_test_users: number
}
```

UI shows the 4 checks with ✅/⚠️ icons and the warning copy from the spec. Footer: ✅ all clean / ⚠️ proceed with caution.

## 4. Workflow Guide

**Replace** the existing 5-step "How to use the test report" collapsible with the full 13-step **📋 Test workflow** guide from the spec, grouped into BEFORE / RUNNING AUTOMATED / RUNNING MANUAL / AFTER sections. Default collapsed.

## 5. Reconciliation with previously shipped export feature

The previous turn already shipped Copy/Download/History/markdown/JSON. I'll align it to this spec:

- Rename localStorage key `marcador_test_reports` → **`marcador_test_history`**; raise cap **5 → 10**. Migration: on first load, copy old key into new and delete old.
- Markdown header line condensed to spec: `Total: {n} · ✅ {n} · ❌ {n} · ⚠️ {n}` and `Duration: {X}ms`.
- Replace per-failure block with the simpler spec form (`Fix:` one-liner pulled from new `FIX_HINTS` map merged with existing templates — keep both, prefer spec hint when present).
- JSON shape adjusted to the flatter spec (`generated_at`, `summary`, `launch_readiness`, `results[]`, `environment`).
- History dropdown counter shows `📜 History ({n})`; entry label: `Jun 8 14:32 — ✅ 67 passed · ❌ 3 failed · NOT READY`.
- Historical-view banner already exists; copy stays.

The existing fix-prompt templates I built earlier are kept and the spec's `FIX_HINTS` are merged in (spec hint wins for the listed test ids).

---

## Files

- **New** `src/lib/admin-reset.functions.ts` — `adminGetAppStateFn`, `adminQuickTestCheckFn`, `adminResetToGoLiveFn` (all `requireSupabaseAuth` + admin role check; admin client loaded via `await import("@/integrations/supabase/client.server")` inside `.handler()` to keep client bundle clean).
- **New** `src/components/admin/AppStateDashboard.tsx`
- **New** `src/components/admin/ResetGoLiveCard.tsx` (uses `AlertDialog`, `Input`, `Button`)
- **New** `src/components/admin/QuickTestCheckCard.tsx`
- **New** `src/components/admin/TestWorkflowGuide.tsx` (collapsible)
- **Edit** `src/components/admin/TestsPanel.tsx` — render the four new cards at the top, swap info box for workflow guide, pass `adminDisplayName` through (already wired).
- **Edit** `src/lib/test-report.ts` — storage-key rename + cap=10, markdown/JSON format tweaks per spec, merge `FIX_HINTS`.
- **Edit** `src/lib/admin-tests.functions.ts` — export `purgeTestArtifacts` (or extract to a helper) so the reset fn can reuse it; **zero changes** to test logic.

## Out of scope

- No changes to any `test*` function bodies or test definitions.
- No DB migrations (uses existing tables/functions).
- No edits to `score_match` / `score_matchday` or any other scoring code.

---

## Two clarifying questions

1. **Reset deletes real users' predictions.** The spec is explicit and frames this as a pre-launch wipe, but it's irreversible. Confirm "delete ALL predictions including from real users" is intended — not just test-user predictions. (Default if no reply: follow the spec literally.)
2. **Step 3 WHERE clause:** spec excludes only `UI_Test%` and `__test%` from the match-score reset. There are also Pre-WC friendly test matches under matchday `is_test=true`. Should I expand the exclusion to "matches whose matchday is `is_test=true`" so Belgium-Tunisia and similar fixtures retain their stored test results? (Default if no reply: yes, expand — otherwise the Pre-WC scoring tests will fail right after a reset.)