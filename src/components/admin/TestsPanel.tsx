import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { TestDataPanel } from "@/components/admin/TestDataPanel";
import {
  buildReport,
  toMarkdown,
  toJson,
  loadHistory,
  saveToHistory,
  formatHistoryLabel,
  downloadFilename,
  type Report,
  type RunResult,
} from "@/lib/test-report";

import {
  testAdminExists,
  testBoosterDoubles,
  testGroupStageConfirmed,
  testKickoffLock,
  testKickoffRange,
  testMatchCount,
  testMatchdays,
  testMatchesPublicReadable,
  testNoDuplicateMatches,
  testPredictionsRlsAnon,
  testProfilesRlsAnon,
  testScoringCorrectResult,
  testScoringExact,
  testScoringWrongResult,
  testStandingsPopulated,
  testStandingsTrigger,
  testEdgeExactScoreline,
  testEdgeCorrectResultWrongScore,
  testEdgeWrongFirstScorer,
  testEdgeDrawCorrect,
  testEdgeZeroZeroDraw,
  testEdgeZeroZeroBooster,
  testEdgeWrongResult,
  testEdgeAwayWin,
  testEdgeBooster,
  testEdgeUnderdogAt10pct,
  testEdgeUnderdogBelow10pct,
  testEdgeRescoreNoDouble,
  testEdgeResultCorrection,
  testEdgeMultiplierR32,
  testEdgeMultiplierBoosterStack,
  testEdgeMultiplierUnderdogFlat,
  testLockUiPastMatch,
  testLockServerRejectsPastInsert,
  testLockServerRejectsCompleted,
  testLockServerRejectsUpdate,
  testLockServerAcceptsFuture,
  testLockReopensWhenKickoffMovedFuture,
  testLockRelocksWhenKickoffMovedPast,
  testStandingsVerifier,
  testMultiplierGroupStage,
  testMultiplierR32,
  testMultiplierR16,
  testMultiplierQF,
  testMultiplierSemi,
  testMultiplierFinal,
  testMultiplierAppliesR32Scoring,
  testBoosterWithGroupMultiplier,
  testBoosterWithSemifinal,
  testUnderdogFlatR32,
  testTournamentPredictionsTableExists,
  testTournamentSettingsTableExists,
  testTournamentWinnerAwards50,
  testTournamentWinnerWrongAwards0,
  testStandingsTriggerExists,
  testLigaInviteCodeFormat,
  testLigaJoinValidCode,
  testLigaJoinInvalidCode,
  testLigaJoinTwice,
  testValidatePredictionTriggerScoped,
  testScoreMatchdayUsesCallerId,
  testScoreMatchExists,
  testScoreMatchUsesCallerId,
  testNoNullMultiplier,
  testNoTestMatches,
  testNoTestUsers,
  testKnockoutPlaceholdersSet,
  testRulesRouteExists,
  testPreWcFriendliesExist,
  testPreWcBelgiumTunisia,
  testPreWcScoringBelgium13,
  testPreWcExcludedFromLeaderboard,
  testUiTestMatchesExist,
  testUiLiveMatchState,
  testUiTbdBlocksPrediction,
  adminGetUiTestPreviewFn,
  adminSetUiTestPreviewFn,

  type TestResult,
} from "@/lib/admin-tests.functions";

type Category =
  | "📊 Data Integrity"
  | "🔐 Auth & RLS"
  | "⚽ Scoring Engine"
  | "✖️ Multipliers"
  | "🏆 Tournament Winner"
  | "🔒 Prediction Locking"
  | "🏟️ Standings Trigger"
  | "🤝 Ligas"
  | "🧪 Pre-WC Test Matches";

type TestDef = {
  id: string;
  label: string;
  category: Category;
  critical?: boolean;
  run: () => Promise<TestResult>;
};

const TESTS: TestDef[] = [
  // 📊 Data Integrity
  { id: "match-count", label: "All matches imported (104)", category: "📊 Data Integrity", critical: true, run: () => testMatchCount() },
  { id: "matchdays", label: "All 9 matchdays created", category: "📊 Data Integrity", run: () => testMatchdays() },
  { id: "no-dupes", label: "No duplicate matches", category: "📊 Data Integrity", run: () => testNoDuplicateMatches() },
  { id: "group-confirmed", label: "All 72 group stage matches confirmed", category: "📊 Data Integrity", run: () => testGroupStageConfirmed() },
  { id: "kickoff-range", label: "Kickoff times in tournament window", category: "📊 Data Integrity", run: () => testKickoffRange() },
  { id: "standings", label: "Groups table populated (12 × 4 = 48)", category: "📊 Data Integrity", run: () => testStandingsPopulated() },
  { id: "no-null-mult", label: "No matches with null multiplier", category: "📊 Data Integrity", critical: true, run: () => testNoNullMultiplier() },
  { id: "no-test-matches", label: "No test data in production", category: "📊 Data Integrity", critical: true, run: () => testNoTestMatches() },
  { id: "no-test-users", label: "No test users in production", category: "📊 Data Integrity", critical: true, run: () => testNoTestUsers() },
  { id: "ko-placeholders", label: "All knockout matches have placeholders", category: "📊 Data Integrity", critical: true, run: () => testKnockoutPlaceholdersSet() },
  { id: "rules-route", label: "Rules page accessible", category: "📊 Data Integrity", critical: true, run: () => testRulesRouteExists() },

  // 🔐 Auth & RLS
  { id: "rls-predictions", label: "RLS blocks anon read of predictions", category: "🔐 Auth & RLS", run: () => testPredictionsRlsAnon() },
  { id: "rls-profiles", label: "RLS blocks anon read of profiles", category: "🔐 Auth & RLS", run: () => testProfilesRlsAnon() },
  { id: "admin-exists", label: "Admin role assigned", category: "🔐 Auth & RLS", critical: true, run: () => testAdminExists() },
  { id: "matches-public", label: "Matches readable by public", category: "🔐 Auth & RLS", critical: true, run: () => testMatchesPublicReadable() },
  { id: "validate-trg", label: "validate_prediction trigger preserved", category: "🔐 Auth & RLS", critical: true, run: () => testValidatePredictionTriggerScoped() },

  // ⚽ Scoring Engine
  { id: "score-exact", label: "Group Stage exact + scorer = 13 pts (×1)", category: "⚽ Scoring Engine", run: () => testScoringExact() },
  { id: "score-correct", label: "Group Stage correct result + scorer = 6 pts (×1)", category: "⚽ Scoring Engine", run: () => testScoringCorrectResult() },
  { id: "score-wrong", label: "Wrong result = 0 pts", category: "⚽ Scoring Engine", run: () => testScoringWrongResult() },
  { id: "booster", label: "Booster doubles points (Group Stage 13×1×2 = 26)", category: "⚽ Scoring Engine", run: () => testBoosterDoubles() },
  { id: "lock", label: "Predictions lock at kickoff", category: "⚽ Scoring Engine", run: () => testKickoffLock() },
  { id: "score-md-caller", label: "score_matchday uses _caller_id", category: "⚽ Scoring Engine", critical: true, run: () => testScoreMatchdayUsesCallerId() },
  { id: "score-match-exists", label: "score_match function exists", category: "⚽ Scoring Engine", run: () => testScoreMatchExists() },
  { id: "score-match-caller", label: "score_match uses _caller_id", category: "⚽ Scoring Engine", run: () => testScoreMatchUsesCallerId() },

  // ✖️ Multipliers
  { id: "mult-group", label: "Group Stage multiplier ×1", category: "✖️ Multipliers", run: () => testMultiplierGroupStage() },
  { id: "mult-r32", label: "Round of 32 multiplier ×2", category: "✖️ Multipliers", run: () => testMultiplierR32() },
  { id: "mult-r16", label: "Round of 16 multiplier ×3", category: "✖️ Multipliers", run: () => testMultiplierR16() },
  { id: "mult-qf", label: "Quarterfinal / Third Place multiplier ×4", category: "✖️ Multipliers", run: () => testMultiplierQF() },
  { id: "mult-semi", label: "Semifinal multiplier ×5", category: "✖️ Multipliers", run: () => testMultiplierSemi() },
  { id: "mult-final", label: "Final multiplier ×6", category: "✖️ Multipliers", run: () => testMultiplierFinal() },
  { id: "mult-apply-r32", label: "Multiplier applies in scoring (R32: 13×2 = 26)", category: "✖️ Multipliers", run: () => testMultiplierAppliesR32Scoring() },
  { id: "mult-boost-group", label: "Booster applies after multiplier (13×1×2 = 26)", category: "✖️ Multipliers", run: () => testBoosterWithGroupMultiplier() },
  { id: "mult-boost-semi", label: "Booster + Semifinal (13×5×2 = 130)", category: "✖️ Multipliers", run: () => testBoosterWithSemifinal() },
  { id: "mult-underdog", label: "Underdog bonus NOT multiplied (13×2 + 5 = 31)", category: "✖️ Multipliers", run: () => testUnderdogFlatR32() },

  // 🏆 Tournament Winner
  { id: "tp-table", label: "tournament_predictions table exists", category: "🏆 Tournament Winner", run: () => testTournamentPredictionsTableExists() },
  { id: "ts-table", label: "tournament_settings table exists", category: "🏆 Tournament Winner", run: () => testTournamentSettingsTableExists() },
  { id: "tp-50", label: "Correct winner awards +50 points", category: "🏆 Tournament Winner", run: () => testTournamentWinnerAwards50() },
  { id: "tp-0", label: "Wrong winner awards 0 points", category: "🏆 Tournament Winner", run: () => testTournamentWinnerWrongAwards0() },

  // 🏟️ Standings Trigger
  { id: "standings-trigger-exists", label: "Standings trigger exists", category: "🏟️ Standings Trigger", critical: true, run: () => testStandingsTriggerExists() },
  { id: "standings-trigger", label: "Standings update on result entry", category: "🏟️ Standings Trigger", run: () => testStandingsTrigger() },

  // 🤝 Ligas
  { id: "liga-code-format", label: "Liga invite codes match MRC-XXXX", category: "🤝 Ligas", run: () => testLigaInviteCodeFormat() },
  { id: "liga-join-valid", label: "Join with valid code succeeds", category: "🤝 Ligas", run: () => testLigaJoinValidCode() },
  { id: "liga-join-invalid", label: "Join with invalid code rejected", category: "🤝 Ligas", run: () => testLigaJoinInvalidCode() },
  { id: "liga-join-twice", label: "Cannot join same liga twice (idempotent)", category: "🤝 Ligas", run: () => testLigaJoinTwice() },

  // 🧪 Pre-WC Test Matches
  { id: "prewc-exist", label: "Pre-WC friendly test matches exist", category: "🧪 Pre-WC Test Matches", run: () => testPreWcFriendliesExist() },
  { id: "prewc-belgium", label: "Belgium 5-0 Tunisia stored correctly", category: "🧪 Pre-WC Test Matches", run: () => testPreWcBelgiumTunisia() },
  { id: "prewc-score-13", label: "Perfect 5-0 Belgium prediction scores 13 pts", category: "🧪 Pre-WC Test Matches", run: () => testPreWcScoringBelgium13() },
  { id: "prewc-leaderboard", label: "Test matchday excluded from leaderboard", category: "🧪 Pre-WC Test Matches", run: () => testPreWcExcludedFromLeaderboard() },
  { id: "ui-test-exist", label: "UI test matches exist (4)", category: "🧪 Pre-WC Test Matches", run: () => testUiTestMatchesExist() },
  { id: "ui-test-live", label: "Live match card state is testable", category: "🧪 Pre-WC Test Matches", run: () => testUiLiveMatchState() },
  { id: "ui-test-tbd", label: "TBD match blocks predictions", category: "🧪 Pre-WC Test Matches", run: () => testUiTbdBlocksPrediction() },

];

type RunState = "idle" | "running" | TestResult;

const ICON: Record<string, string> = {
  idle: "⏳",
  running: "…",
  pass: "✅",
  fail: "❌",
  warn: "⚠️",
};

const EDGE_TESTS: TestDef[] = [
  { id: "edge-exact", label: "Exact scoreline (all points)", category: "⚽ Scoring Engine", run: () => testEdgeExactScoreline() },
  { id: "edge-correct-wrong-score", label: "Correct result, wrong score", category: "⚽ Scoring Engine", run: () => testEdgeCorrectResultWrongScore() },
  { id: "edge-wrong-scorer", label: "Correct result, wrong first scorer", category: "⚽ Scoring Engine", run: () => testEdgeWrongFirstScorer() },
  { id: "edge-draw", label: "Draw predicted correctly", category: "⚽ Scoring Engine", run: () => testEdgeDrawCorrect() },
  { id: "edge-00-draw", label: "0-0 draw predicted correctly", category: "⚽ Scoring Engine", run: () => testEdgeZeroZeroDraw() },
  { id: "edge-00-boost", label: "0-0 draw with booster", category: "⚽ Scoring Engine", run: () => testEdgeZeroZeroBooster() },
  { id: "edge-wrong", label: "Wrong result (zero points)", category: "⚽ Scoring Engine", run: () => testEdgeWrongResult() },
  { id: "edge-away", label: "Correct away win", category: "⚽ Scoring Engine", run: () => testEdgeAwayWin() },
  { id: "edge-booster", label: "Booster doubles points", category: "⚽ Scoring Engine", run: () => testEdgeBooster() },
  { id: "edge-underdog-below", label: "Underdog bonus fires below 10%", category: "⚽ Scoring Engine", run: () => testEdgeUnderdogBelow10pct() },
  { id: "edge-underdog-at", label: "Underdog bonus does NOT fire at 10%", category: "⚽ Scoring Engine", run: () => testEdgeUnderdogAt10pct() },
  { id: "edge-rescore", label: "Re-scoring does not double points", category: "⚽ Scoring Engine", run: () => testEdgeRescoreNoDouble() },
  { id: "edge-correction", label: "Result correction recalculates correctly", category: "⚽ Scoring Engine", run: () => testEdgeResultCorrection() },
  { id: "edge-mul-r32", label: "Round multiplier ×2 applies in R32", category: "⚽ Scoring Engine", run: () => testEdgeMultiplierR32() },
  { id: "edge-mul-boost", label: "Booster applies after round multiplier", category: "⚽ Scoring Engine", run: () => testEdgeMultiplierBoosterStack() },
  { id: "edge-mul-underdog", label: "Underdog +5 stays flat after multiplier", category: "⚽ Scoring Engine", run: () => testEdgeMultiplierUnderdogFlat() },
];

const LOCK_TESTS: TestDef[] = [
  { id: "lock-ui-past", label: "UI: past matches render locked", category: "🔒 Prediction Locking", run: () => testLockUiPastMatch() },
  { id: "lock-srv-past", label: "Server rejects insert on past match", category: "🔒 Prediction Locking", run: () => testLockServerRejectsPastInsert() },
  { id: "lock-srv-completed", label: "Server rejects insert on completed match", category: "🔒 Prediction Locking", run: () => testLockServerRejectsCompleted() },
  { id: "lock-srv-update", label: "Server rejects update after kickoff", category: "🔒 Prediction Locking", run: () => testLockServerRejectsUpdate() },
  { id: "lock-future-ok", label: "Future match accepts prediction", category: "🔒 Prediction Locking", run: () => testLockServerAcceptsFuture() },
  { id: "lock-reopen", label: "Moving kickoff to future reopens predictions", category: "🔒 Prediction Locking", run: () => testLockReopensWhenKickoffMovedFuture() },
  { id: "lock-relock", label: "Moving kickoff back to past re-locks", category: "🔒 Prediction Locking", run: () => testLockRelocksWhenKickoffMovedPast() },
];

const CATEGORY_ORDER: Category[] = [
  "📊 Data Integrity",
  "🔐 Auth & RLS",
  "⚽ Scoring Engine",
  "✖️ Multipliers",
  "🏆 Tournament Winner",
  "🏟️ Standings Trigger",
  "🔒 Prediction Locking",
  "🤝 Ligas",
  "🧪 Pre-WC Test Matches",
];

export function TestsPanel() {
  const [state, setState] = useState<Record<string, RunState>>({});

  const runOne = async (t: TestDef) => {
    setState((s) => ({ ...s, [t.id]: "running" }));
    try {
      const r = await t.run();
      setState((s) => ({ ...s, [t.id]: r }));
    } catch (e) {
      setState((s) => ({
        ...s,
        [t.id]: { status: "fail", message: e instanceof Error ? e.message : String(e) },
      }));
    }
  };

  const runAll = async () => {
    for (const t of TESTS) await runOne(t);
  };

  const criticals = TESTS.filter((t) => t.critical);
  const allRun = TESTS.every((t) => {
    const s = state[t.id];
    return s && s !== "idle" && s !== "running" && typeof s !== "string";
  });
  const counts = TESTS.reduce(
    (acc, t) => {
      const s = state[t.id];
      if (s && typeof s !== "string") acc[s.status]++;
      return acc;
    },
    { pass: 0, fail: 0, warn: 0 } as Record<"pass" | "fail" | "warn", number>,
  );
  const criticalsRun = criticals.every((t) => {
    const s = state[t.id];
    return s && s !== "idle" && s !== "running" && typeof s !== "string";
  });
  const criticalsPassing = criticals.every((t) => {
    const s = state[t.id];
    return s && typeof s !== "string" && s.status === "pass";
  });
  const anyCriticalFailed = criticals.some((t) => {
    const s = state[t.id];
    return s && typeof s !== "string" && s.status === "fail";
  });

  const grouped = TESTS.reduce(
    (acc, t) => {
      (acc[t.category] = acc[t.category] ?? []).push(t);
      return acc;
    },
    {} as Record<Category, TestDef[]>,
  );

  const renderTestRow = (t: TestDef) => {
    const s = state[t.id];
    const status =
      !s || s === "idle" ? "idle" : s === "running" ? "running" : s.status;
    const message =
      s && typeof s !== "string" ? s.message : s === "running" ? "Running…" : "Not run";
    return (
      <div key={t.id} className="px-4 py-2.5 flex items-center gap-3">
        <span className="text-base w-6 text-center">{ICON[status]}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium flex items-center gap-2">
            {t.label}
            {t.critical && (
              <span className="text-[9px] uppercase tracking-wider bg-primary/15 text-primary px-1.5 py-0.5 rounded">
                critical
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate">{message}</div>
        </div>
        <button
          onClick={() => runOne(t)}
          disabled={s === "running"}
          className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          ▶ Run
        </button>
      </div>
    );
  };

  return (
    <>
      <UiTestPreviewPanel />
      <TestDataPanel />
      <EdgeCasesPanel />
      <PredictionLockPanel />
      <StandingsVerifierPanel />


      {/* 🚀 Launch Readiness */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden mb-4">
        <div className="px-4 py-3 flex items-center justify-between border-b border-border">
          <div>
            <div className="font-semibold">🚀 Launch Readiness</div>
            <div className="text-xs text-muted-foreground">
              Critical checks that must pass before going live. ({criticals.length} tests)
            </div>
          </div>
          <button
            onClick={async () => {
              for (const t of criticals) await runOne(t);
            }}
            className="rounded-lg bg-amber-gradient px-3 py-1.5 text-xs font-bold text-primary-foreground"
          >
            ▶ Run launch checks
          </button>
        </div>
        {criticalsRun && (
          <div
            className={`px-4 py-3 text-sm font-bold border-b border-border ${
              anyCriticalFailed
                ? "bg-destructive/10 text-destructive"
                : criticalsPassing
                  ? "bg-success/10 text-success"
                  : "bg-amber-500/10 text-amber-glow"
            }`}
          >
            {anyCriticalFailed
              ? "❌ Fix these issues before going live"
              : "✅ App is ready for launch 🚀"}
          </div>
        )}
        <div className="divide-y divide-border">{criticals.map(renderTestRow)}</div>
      </div>

      {/* Full suite, grouped */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between border-b border-border">
          <div>
            <div className="font-semibold">Full test suite</div>
            <div className="text-xs text-muted-foreground">
              {TESTS.length} tests across {CATEGORY_ORDER.length} categories.
            </div>
          </div>
          <button
            onClick={runAll}
            className="rounded-lg bg-amber-gradient px-3 py-1.5 text-xs font-bold text-primary-foreground"
          >
            ▶ Run all tests
          </button>
        </div>

        {allRun && (
          <div className="px-4 py-3 text-xs text-muted-foreground border-b border-border">
            ✅ {counts.pass} passed · ❌ {counts.fail} failed · ⚠️ {counts.warn} warnings · {TESTS.length} total
          </div>
        )}

        {CATEGORY_ORDER.map((cat) => {
          const tests = grouped[cat];
          if (!tests || tests.length === 0) return null;
          return (
            <div key={cat} className="border-b border-border last:border-b-0">
              <div className="px-4 py-2 text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/30">
                {cat} ({tests.length})
              </div>
              <div className="divide-y divide-border">{tests.map(renderTestRow)}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function EdgeCasesPanel() {
  const [state, setState] = useState<Record<string, RunState>>({});
  const runOne = async (t: TestDef) => {
    setState((s) => ({ ...s, [t.id]: "running" }));
    try {
      const r = await t.run();
      setState((s) => ({ ...s, [t.id]: r }));
    } catch (e) {
      setState((s) => ({
        ...s,
        [t.id]: { status: "fail", message: e instanceof Error ? e.message : String(e) },
      }));
    }
  };
  const runAll = async () => {
    for (const t of EDGE_TESTS) await runOne(t);
  };
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden mb-4">
      <div className="px-4 py-3 flex items-center justify-between border-b border-border">
        <div>
          <div className="font-semibold">Scoring edge cases</div>
          <div className="text-xs text-muted-foreground">
            Verifies the scoring engine against tricky scenarios that are commonly miscalculated.
          </div>
        </div>
        <button
          onClick={runAll}
          className="rounded-lg bg-amber-gradient px-3 py-1.5 text-xs font-bold text-primary-foreground"
        >
          ▶ Run all edge case tests
        </button>
      </div>
      <div className="divide-y divide-border">
        {EDGE_TESTS.map((t) => {
          const s = state[t.id];
          const status =
            !s || s === "idle" ? "idle" : s === "running" ? "running" : s.status;
          const message =
            s && typeof s !== "string"
              ? s.message
              : s === "running"
                ? "Running…"
                : "Not run";
          return (
            <div key={t.id} className="px-4 py-2.5 flex items-center gap-3">
              <span className="text-base w-6 text-center">{ICON[status]}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{t.label}</div>
                <div className="text-xs text-muted-foreground truncate">{message}</div>
              </div>
              <button
                onClick={() => runOne(t)}
                disabled={s === "running"}
                className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
              >
                ▶ Run
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PredictionLockPanel() {
  const [state, setState] = useState<Record<string, RunState>>({});
  const runOne = async (t: TestDef) => {
    setState((s) => ({ ...s, [t.id]: "running" }));
    try {
      const r = await t.run();
      setState((s) => ({ ...s, [t.id]: r }));
    } catch (e) {
      setState((s) => ({
        ...s,
        [t.id]: { status: "fail", message: e instanceof Error ? e.message : String(e) },
      }));
    }
  };
  const runAll = async () => {
    for (const t of LOCK_TESTS) await runOne(t);
  };
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden mb-4">
      <div className="px-4 py-3 flex items-center justify-between border-b border-border">
        <div>
          <div className="font-semibold">Prediction locking</div>
          <div className="text-xs text-muted-foreground">
            Verifies predictions cannot be submitted or modified after kickoff. Runs as a temporary non-admin user against the real lock trigger.
          </div>
        </div>
        <button
          onClick={runAll}
          className="rounded-lg bg-amber-gradient px-3 py-1.5 text-xs font-bold text-primary-foreground"
        >
          ▶ Run all lock tests
        </button>
      </div>
      <div className="divide-y divide-border">
        {LOCK_TESTS.map((t) => {
          const s = state[t.id];
          const status =
            !s || s === "idle" ? "idle" : s === "running" ? "running" : s.status;
          const message =
            s && typeof s !== "string"
              ? s.message
              : s === "running"
                ? "Running…"
                : "Not run";
          return (
            <div key={t.id} className="px-4 py-2.5 flex items-center gap-3">
              <span className="text-base w-6 text-center">{ICON[status]}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{t.label}</div>
                <div className="text-xs text-muted-foreground truncate">{message}</div>
              </div>
              <button
                onClick={() => runOne(t)}
                disabled={s === "running"}
                className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
              >
                ▶ Run
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StandingsVerifierPanel() {
  const [s, setS] = useState<RunState>("idle");
  const run = async () => {
    setS("running");
    try {
      const r = await testStandingsVerifier();
      setS(r);
    } catch (e) {
      setS({ status: "fail", message: e instanceof Error ? e.message : String(e) });
    }
  };
  const status = s === "idle" || s === "running" ? s : s.status;
  const message =
    s && typeof s !== "string" ? s.message : s === "running" ? "Running…" : "Not run";
  const detail = s && typeof s !== "string" ? s.detail : undefined;
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden mb-4">
      <div className="px-4 py-3 flex items-center justify-between border-b border-border">
        <div>
          <div className="font-semibold">Group standings accuracy</div>
          <div className="text-xs text-muted-foreground">
            Applies known Group A results, verifies every standings column and tiebreaker order, then restores originals.
          </div>
        </div>
        <button
          onClick={run}
          disabled={s === "running"}
          className="rounded-lg bg-amber-gradient px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50"
        >
          ▶ Run standings verification
        </button>
      </div>
      <div className="px-4 py-2.5 flex items-start gap-3">
        <span className="text-base w-6 text-center">{ICON[status]}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">Standings calculate correctly from results</div>
          <div className="text-xs text-muted-foreground">{message}</div>
          {detail && (
            <pre className="mt-2 text-[11px] leading-relaxed bg-muted/40 rounded p-2 whitespace-pre-wrap font-mono">
{detail}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

function UiTestPreviewPanel() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["ui-test-preview"],
    queryFn: () => adminGetUiTestPreviewFn(),
    refetchInterval: 30_000,
  });
  const m = useMutation({
    mutationFn: (enabled: boolean) => adminSetUiTestPreviewFn({ data: { enabled } }),
    onSuccess: (r) => {
      qc.setQueryData(["ui-test-preview"], r);
      qc.invalidateQueries({ queryKey: ["all-matches"] });
      qc.invalidateQueries({ queryKey: ["matchdays-progress"] });
      toast.success(r.enabled ? "UI test preview enabled (30 min)" : "UI test preview disabled");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });
  const enabled = q.data?.enabled ?? false;
  const expiresAt = q.data?.expiresAt ?? null;
  const minutesLeft =
    expiresAt ? Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 60_000)) : 0;
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden mb-4">
      <div className="px-4 py-3 border-b border-border">
        <div className="font-semibold">UI Test Preview</div>
        <div className="text-xs text-muted-foreground">
          Show the hidden test matchday on the Play screen for your admin account only.
        </div>
      </div>
      <div className="px-4 py-3 flex items-center justify-between gap-3">
        <div className="text-sm">
          <div className="font-medium">Preview UI test matches in Play screen</div>
          <div className="text-xs text-muted-foreground">
            Auto-disables after 30 minutes. Admin-only — does not affect other users.
            {enabled && expiresAt && (
              <span className="ml-1 text-amber-glow font-medium">
                · {minutesLeft}m left
              </span>
            )}
          </div>
        </div>
        <Switch
          checked={enabled}
          disabled={m.isPending || q.isLoading}
          onCheckedChange={(v) => m.mutate(v)}
        />
      </div>
    </div>
  );
}
