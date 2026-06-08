// Client-side test report builder for admin Tests panel.
// Pure functions — no server calls. Builds markdown + JSON from existing
// in-memory test results and provides fix-prompt templates.

import type { TestResult } from "@/lib/admin-tests.functions";

export type ReportTestStatus = "pass" | "fail" | "warn" | "skip";

export type ReportTest = {
  id: string;
  name: string;
  category: string;
  critical?: boolean;
  status: ReportTestStatus;
  expected: string | null;
  actual: string | null;
  error: string | null;
  likely_cause: string | null;
  file_hint: string | null;
  duration_ms: number;
};

export type ReportCategory = {
  name: string;
  tests: ReportTest[];
};

export type Report = {
  report_generated_at: string;
  app_url: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
    not_run: number;
    launch_ready: boolean;
    duration_ms: number;
  };
  launch_readiness: {
    ready: boolean;
    critical_tests: { name: string; status: ReportTestStatus | "skip"; error: string | null }[];
  };
  categories: ReportCategory[];
  environment: {
    supabase_url: string;
    app_version: string;
    admin_display_name: string;
  };
};

// Spec category order for the summary table + markdown sections.
export const SPEC_CATEGORIES = [
  "Data Integrity",
  "Security & RLS",
  "Scoring Engine",
  "Round Multipliers",
  "Tournament Winner",
  "Prediction Locking",
  "Standings Trigger",
  "Ligas",
  "Pre-WC Test Matches",
  "Launch Readiness",
] as const;

// Map source UI category (the emoji-prefixed labels in TestsPanel) → spec name.
export const CATEGORY_TO_SPEC: Record<string, string> = {
  "📊 Data Integrity": "Data Integrity",
  "🔐 Auth & RLS": "Security & RLS",
  "⚽ Scoring Engine": "Scoring Engine",
  "✖️ Multipliers": "Round Multipliers",
  "🏆 Tournament Winner": "Tournament Winner",
  "🔒 Prediction Locking": "Prediction Locking",
  "🏟️ Standings Trigger": "Standings Trigger",
  "🤝 Ligas": "Ligas",
  "🧪 Pre-WC Test Matches": "Pre-WC Test Matches",
};

// Likely-cause and file-hint maps for known failing tests.
export const LIKELY_CAUSES: Record<string, string> = {
  "match-count": "Match import incomplete or is_test filter is excluding real matches.",
  "score-md-caller": "score_matchday DB function still uses auth.uid() instead of _caller_id.",
  "score-match-caller": "score_match DB function still uses auth.uid() instead of _caller_id.",
  "validate-trg": "validate_prediction trigger is missing or scoped to wrong columns, blocking scoring UPDATEs.",
  "admin-exists": "No row with role='admin' exists in user_roles for any auth user.",
  "matches-public": "RLS policy on matches blocks anon SELECT.",
  "standings-trigger-exists": "AFTER UPDATE trigger on matches calling recalculate_group_standings is missing.",
  "no-test-matches": "Test matches/predictions remain in production tables.",
  "no-test-users": "Test users remain in profiles.",
  "no-null-mult": "Some matches have points_multiplier IS NULL.",
  "mult-r32": "Round of 32 matches have wrong points_multiplier (expected 2).",
  "rls-predictions": "predictions table has a SELECT policy using (true), exposing all predictions publicly.",
  "liga-code-format": "Leagues exist with invite_code not matching MRC-XXXX format.",
};

export const FILE_HINTS: Record<string, string> = {
  "match-count": "supabase migrations + src/components/admin/FixtureImportBanner.tsx",
  "score-md-caller": "supabase migration for score_matchday + src/lib/game.functions.ts",
  "score-match-caller": "supabase migration for score_match + src/lib/game.functions.ts",
  "score-match-exists": "supabase migration defining public.score_match",
  "validate-trg": "supabase migration for validate_prediction trigger on predictions",
  "admin-exists": "user_roles table seed",
  "matches-public": "RLS policies on public.matches",
  "standings-trigger-exists": "supabase migration creating recalculate_group_standings trigger",
  "no-test-matches": "admin Advanced → Test Data panel",
  "no-test-users": "admin Advanced → Test Data panel",
  "no-null-mult": "supabase migration backfilling matches.points_multiplier",
  "rls-predictions": "RLS policies on public.predictions",
  "liga-code-format": "supabase migration / leagues invite_code generator",
};

// Fix-prompt templates keyed by test id. Each receives result context.
type FixCtx = {
  name: string;
  expected: string | null;
  actual: string | null;
  error: string | null;
  file_hint: string | null;
};

export const FIX_PROMPT_TEMPLATES: Record<string, (c: FixCtx) => string> = {
  "match-count": (c) =>
    `The matches table has ${c.actual ?? "unknown"} matches instead of 104. Re-run the CSV import in the Advanced section or check that the is_test filter is not excluding real matches from the count.`,
  "score-md-caller": () =>
    `The score_matchday PostgreSQL function still uses auth.uid() instead of _caller_id. Update the function to accept _caller_id uuid as a second parameter and replace auth.uid() with _caller_id in the has_role() check. Also update adminScoreMatchdayFn in src/lib/game.functions.ts to pass userId as _caller_id.`,
  "score-match-caller": () =>
    `The score_match PostgreSQL function still uses auth.uid() instead of _caller_id. Update the function to accept _caller_id uuid as a second parameter and replace auth.uid() with _caller_id in the has_role() check. Also update the caller in src/lib/game.functions.ts to pass userId as _caller_id.`,
  "validate-trg": () =>
    `The validate_prediction trigger is missing or incorrectly scoped. Recreate it as BEFORE INSERT OR UPDATE OF home_goals, away_goals, first_scorer, booster ON public.predictions so that the scoring engine's UPDATE to the points column is not blocked.`,
  "admin-exists": () =>
    `No admin user found in user_roles. Run in Lovable SQL editor: INSERT INTO user_roles (user_id, role) SELECT id, 'admin' FROM auth.users WHERE email = 'gandalftheswole76@gmail.com';`,
  "matches-public": () =>
    `The matches table RLS policy is blocking anonymous read access. Add: CREATE POLICY matches_public_read ON matches FOR SELECT USING (true);`,
  "standings-trigger-exists": () =>
    `The group standings trigger is missing. The trigger should fire AFTER UPDATE on matches when status changes to completed and group_letter is not null, calling recalculate_group_standings() for both home_team and away_team.`,
  "no-test-matches": () =>
    `Test data found in production tables. Go to admin Panel de Control → Advanced → Test Data → Remove test users and Clear test scores before going live.`,
  "no-test-users": () =>
    `Test users found in production. Go to admin Panel de Control → Advanced → Test Data → Remove test users before going live.`,
  "no-null-mult": () =>
    `Some matches have null points_multiplier. Run: UPDATE matches SET points_multiplier = CASE phase WHEN 'Group stage' THEN 1 WHEN 'Round of 32' THEN 2 WHEN 'Round of 16' THEN 3 WHEN 'Quarterfinal' THEN 4 WHEN 'Third Place' THEN 4 WHEN 'Semifinal' THEN 5 WHEN 'Final' THEN 6 ELSE 1 END WHERE points_multiplier IS NULL;`,
  "mult-r32": () =>
    `Round of 32 matches have wrong multiplier. Run: UPDATE matches SET points_multiplier = 2 WHERE phase = 'Round of 32';`,
  "rls-predictions": () =>
    `The predictions table is publicly readable — this is a security risk. Check RLS policies on predictions table and ensure no policy has USING (true) for SELECT. Only users should be able to read their own predictions.`,
  "liga-code-format": () =>
    `Some leagues have malformed invite codes not matching MRC-XXXX format. Run: UPDATE leagues SET invite_code = 'MRC-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT), 1, 4)) WHERE invite_code NOT LIKE 'MRC-____';`,
};

export function genericFixPrompt(c: FixCtx): string {
  return `Test '${c.name}' failed: ${c.error ?? "(no error message)"}. Expected ${c.expected ?? "n/a"} but got ${c.actual ?? "n/a"}. Check ${c.file_hint ?? "the relevant module"} and verify the implementation is correct.`;
}

export type RunResult = {
  id: string;
  name: string;
  category: string; // source UI category label
  critical?: boolean;
  // Either a real TestResult, "skip" (not run) or null
  result: TestResult | null;
  duration_ms: number;
};

// Parse "expected X, got Y" or "expected: X actual: Y" patterns out of a message.
function parseExpectedActual(msg: string | undefined): { expected: string | null; actual: string | null } {
  if (!msg) return { expected: null, actual: null };
  const m1 = /expected[:\s]+([^,;]+?)[,;]\s*(?:got|actual)[:\s]+([^,;]+)/i.exec(msg);
  if (m1) return { expected: m1[1].trim(), actual: m1[2].trim() };
  const m2 = /(\d+)\s*(?:vs|!=|≠|<>|expected)\s*(\d+)/i.exec(msg);
  if (m2) return { expected: m2[2].trim(), actual: m2[1].trim() };
  return { expected: null, actual: null };
}

export function buildReport(args: {
  runs: RunResult[];
  durationMs: number;
  env: { supabase_url: string; app_version: string; admin_display_name: string };
  appUrl: string;
  generatedAt?: string;
}): Report {
  const { runs, durationMs, env, appUrl } = args;
  const reportTests: ReportTest[] = runs.map((r) => {
    const result = r.result;
    const status: ReportTestStatus = result ? (result.status as ReportTestStatus) : "skip";
    const msg = result?.message ?? null;
    const { expected, actual } = parseExpectedActual(msg ?? undefined);
    return {
      id: r.id,
      name: r.name,
      category: CATEGORY_TO_SPEC[r.category] ?? r.category,
      critical: r.critical,
      status,
      expected,
      actual,
      error: status === "fail" ? msg : null,
      likely_cause: status === "fail" ? (LIKELY_CAUSES[r.id] ?? null) : null,
      file_hint: FILE_HINTS[r.id] ?? null,
      duration_ms: r.duration_ms,
    };
  });

  const passed = reportTests.filter((t) => t.status === "pass").length;
  const failed = reportTests.filter((t) => t.status === "fail").length;
  const warnings = reportTests.filter((t) => t.status === "warn").length;
  const notRun = reportTests.filter((t) => t.status === "skip").length;
  const total = reportTests.length;

  const criticals = reportTests.filter((t) => t.critical);
  const criticalFailed = criticals.some((t) => t.status === "fail" || t.status === "skip");
  const launchReady = !criticalFailed && criticals.length > 0;

  // Build categories using SPEC ordering; include Launch Readiness virtual category.
  const catMap = new Map<string, ReportTest[]>();
  for (const c of SPEC_CATEGORIES) catMap.set(c, []);
  for (const t of reportTests) {
    const arr = catMap.get(t.category) ?? [];
    arr.push(t);
    catMap.set(t.category, arr);
  }
  // Launch Readiness = critical tests (cross-referenced, not duplicated counts).
  catMap.set(
    "Launch Readiness",
    reportTests.filter((t) => t.critical),
  );

  const categories: ReportCategory[] = SPEC_CATEGORIES.map((name) => ({
    name,
    tests: catMap.get(name) ?? [],
  }));

  return {
    report_generated_at: args.generatedAt ?? new Date().toISOString(),
    app_url: appUrl,
    summary: {
      total,
      passed,
      failed,
      warnings,
      not_run: notRun,
      launch_ready: launchReady,
      duration_ms: durationMs,
    },
    launch_readiness: {
      ready: launchReady,
      critical_tests: criticals.map((t) => ({
        name: t.name,
        status: t.status,
        error: t.error,
      })),
    },
    categories,
    environment: env,
  };
}




// Short one-line fix hints keyed by test id. Used in the spec markdown format.
// Takes priority over the long FIX_PROMPT_TEMPLATES when present.
export const FIX_HINTS: Record<string, string> = {
  "match-count": "Re-run CSV import in Advanced section",
  "no-null-mult":
    "Run: UPDATE matches SET points_multiplier = CASE phase WHEN 'Group stage' THEN 1 WHEN 'Round of 32' THEN 2 WHEN 'Round of 16' THEN 3 WHEN 'Quarterfinal' THEN 4 WHEN 'Semifinal' THEN 5 WHEN 'Final' THEN 6 ELSE 1 END WHERE points_multiplier IS NULL",
  "no-test-matches": "Go to Advanced → Test Data → Clear test scores",
  "no-test-users": "Go to Advanced → Test Data → Remove test users",
  "admin-exists":
    "Run SQL: INSERT INTO user_roles (user_id, role) SELECT id, 'admin' FROM auth.users WHERE email = 'gandalftheswole76@gmail.com'",
  "matches-public":
    "Add RLS policy: CREATE POLICY matches_public_read ON matches FOR SELECT USING (true)",
  "validate-trg":
    "Recreate trigger: BEFORE INSERT OR UPDATE OF home_goals, away_goals, first_scorer, booster ON predictions",
  "score-md-caller":
    "Update score_matchday to use _caller_id parameter instead of auth.uid()",
  "rls-predictions":
    "Check RLS policies on predictions — anon users should not be able to SELECT",
  "liga-join-valid":
    "Check joinLeagueFn — ensure find_league_by_code RPC exists and invite_code column is correct",
};

function shortFixHint(t: ReportTest): string {
  const hint = FIX_HINTS[t.id];
  if (hint) return hint;
  const tmpl = FIX_PROMPT_TEMPLATES[t.id];
  if (tmpl)
    return tmpl({
      name: t.name,
      expected: t.expected,
      actual: t.actual,
      error: t.error,
      file_hint: t.file_hint,
    });
  return `Inspect ${t.file_hint ?? "the relevant module"} and address: ${t.error ?? "(no error message)"}`;
}

export function toMarkdown(r: Report): string {
  const lines: string[] = [];
  lines.push("---");
  lines.push("# Marcador Test Report");
  lines.push(`Generated: ${r.report_generated_at}`);
  lines.push(`App URL: ${r.app_url}`);
  lines.push(
    `Total: ${r.summary.total} · ✅ ${r.summary.passed} · ❌ ${r.summary.failed} · ⚠️ ${r.summary.warnings}`,
  );
  lines.push(`Duration: ${r.summary.duration_ms}ms`);
  lines.push("");
  lines.push(
    `## 🚀 Launch Readiness: ${r.launch_readiness.ready ? "✅ READY" : "❌ NOT READY"}`,
  );
  for (const c of r.launch_readiness.critical_tests) {
    const icon = c.status === "pass" ? "✅" : "❌";
    lines.push(`${icon} ${c.name}`);
  }
  lines.push("");

  const allTests = r.categories
    .filter((c) => c.name !== "Launch Readiness")
    .flatMap((c) => c.tests);

  const failed = allTests.filter((t) => t.status === "fail");
  const warned = allTests.filter((t) => t.status === "warn");
  const passed = allTests.filter((t) => t.status === "pass");

  lines.push(`## ❌ Failed Tests (${failed.length})`);
  for (const t of failed) {
    lines.push(`### ${t.name}`);
    lines.push(`- Category: ${t.category}`);
    lines.push(`- Error: ${t.error ?? "(no message)"}`);
    lines.push(`- Expected: ${t.expected ?? "n/a"}`);
    lines.push(`- Actual: ${t.actual ?? "n/a"}`);
    lines.push(`- Fix: ${shortFixHint(t)}`);
    lines.push("");
  }

  lines.push(`## ⚠️ Warnings (${warned.length})`);
  for (const t of warned) lines.push(`- ${t.name}: ${t.error ?? ""}`);
  lines.push("");

  lines.push(`## ✅ Passed (${passed.length})`);
  for (const t of passed) lines.push(`- ${t.name}`);
  lines.push("");

  lines.push("## 📊 By Category");
  lines.push("| Category | ✅ | ❌ | ⚠️ |");
  lines.push("|---|---|---|---|");
  for (const c of r.categories) {
    const p = c.tests.filter((t) => t.status === "pass").length;
    const f = c.tests.filter((t) => t.status === "fail").length;
    const w = c.tests.filter((t) => t.status === "warn").length;
    lines.push(`| ${c.name} | ${p} | ${f} | ${w} |`);
  }
  lines.push("");

  lines.push("## Environment");
  lines.push(`- URL: ${r.app_url}`);
  lines.push(`- Admin: ${r.environment.admin_display_name}`);
  lines.push(`- Version: ${r.environment.app_version}`);
  lines.push("---");

  return lines.join("\n");
}

// Spec JSON shape — flatter than the in-memory Report.
type SpecJson = {
  generated_at: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
    launch_ready: boolean;
    duration_ms: number;
  };
  launch_readiness: {
    ready: boolean;
    tests: { id: string; name: string; status: "pass" | "fail"; error: string | null }[];
  };
  results: {
    id: string;
    name: string;
    category: string;
    status: ReportTestStatus;
    message: string | null;
    detail: string | null;
    duration_ms: number;
  }[];
  environment: { url: string; admin: string; version: string };
};

export function toJson(r: Report): string {
  const allTests = r.categories
    .filter((c) => c.name !== "Launch Readiness")
    .flatMap((c) => c.tests);
  const spec: SpecJson = {
    generated_at: r.report_generated_at,
    summary: {
      total: r.summary.total,
      passed: r.summary.passed,
      failed: r.summary.failed,
      warnings: r.summary.warnings,
      launch_ready: r.summary.launch_ready,
      duration_ms: r.summary.duration_ms,
    },
    launch_readiness: {
      ready: r.launch_readiness.ready,
      tests: r.launch_readiness.critical_tests.map((t) => ({
        id: t.name,
        name: t.name,
        status: t.status === "pass" ? "pass" : "fail",
        error: t.error,
      })),
    },
    results: allTests.map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category,
      status: t.status,
      message: t.error,
      detail: null,
      duration_ms: t.duration_ms,
    })),
    environment: {
      url: r.app_url,
      admin: r.environment.admin_display_name,
      version: r.environment.app_version,
    },
  };
  return JSON.stringify(spec, null, 2);
}

// localStorage history -------------------------------------------------------

const STORAGE_KEY = "marcador_test_history";
const LEGACY_STORAGE_KEY = "marcador_test_reports";
const MAX_HISTORY = 10;

function migrateLegacy() {
  try {
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!legacy) return;
    const current = localStorage.getItem(STORAGE_KEY);
    if (!current) localStorage.setItem(STORAGE_KEY, legacy);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* fail silently */
  }
}

export function loadHistory(): Report[] {
  try {
    migrateLegacy();
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as Report[];
  } catch {
    return [];
  }
}

export function saveToHistory(r: Report): void {
  try {
    const prev = loadHistory();
    const next = [r, ...prev].slice(0, MAX_HISTORY);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // fail silently
  }
}

export function formatHistoryLabel(r: Report): string {
  const d = new Date(r.report_generated_at);
  const fmt = d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const ready = r.summary.launch_ready ? "READY" : "NOT READY";
  return `${fmt} — ✅ ${r.summary.passed} passed · ❌ ${r.summary.failed} failed · ${ready}`;
}

export function downloadFilename(r: Report): string {
  const d = new Date(r.report_generated_at);
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `marcador-test-report-${stamp}.json`;
}

