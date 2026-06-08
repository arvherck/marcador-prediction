import { useState } from "react";
import { TestDataPanel } from "@/components/admin/TestDataPanel";
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
  testLockUiPastMatch,
  testLockServerRejectsPastInsert,
  testLockServerRejectsCompleted,
  testLockServerRejectsUpdate,
  testLockServerAcceptsFuture,
  testLockReopensWhenKickoffMovedFuture,
  testLockRelocksWhenKickoffMovedPast,
  testStandingsVerifier,
  type TestResult,
} from "@/lib/admin-tests.functions";

type TestDef = {
  id: string;
  label: string;
  category: "Data integrity" | "Auth & security" | "Game logic";
  critical?: boolean;
  run: () => Promise<TestResult>;
};

const TESTS: TestDef[] = [
  { id: "match-count", label: "All 104 matches imported", category: "Data integrity", critical: true, run: () => testMatchCount() },
  { id: "matchdays", label: "All 9 matchdays created", category: "Data integrity", run: () => testMatchdays() },
  { id: "no-dupes", label: "No duplicate matches", category: "Data integrity", run: () => testNoDuplicateMatches() },
  { id: "group-confirmed", label: "All 72 group stage matches confirmed", category: "Data integrity", run: () => testGroupStageConfirmed() },
  { id: "kickoff-range", label: "Kickoff times in tournament window", category: "Data integrity", run: () => testKickoffRange() },
  { id: "standings", label: "Groups table populated (48 rows)", category: "Data integrity", run: () => testStandingsPopulated() },

  { id: "rls-predictions", label: "RLS blocks anon read of predictions", category: "Auth & security", run: () => testPredictionsRlsAnon() },
  { id: "rls-profiles", label: "RLS blocks anon read of profiles", category: "Auth & security", run: () => testProfilesRlsAnon() },
  { id: "admin-exists", label: "Admin role assigned", category: "Auth & security", critical: true, run: () => testAdminExists() },
  { id: "matches-public", label: "Matches readable by public", category: "Auth & security", critical: true, run: () => testMatchesPublicReadable() },

  { id: "score-exact", label: "Scoring engine — exact + first scorer (13 pts)", category: "Game logic", critical: true, run: () => testScoringExact() },
  { id: "score-correct", label: "Scoring engine — correct result + scorer (6 pts)", category: "Game logic", run: () => testScoringCorrectResult() },
  { id: "score-wrong", label: "Scoring engine — wrong result (0 pts)", category: "Game logic", run: () => testScoringWrongResult() },
  { id: "booster", label: "Booster doubles points", category: "Game logic", run: () => testBoosterDoubles() },
  { id: "lock", label: "Predictions lock at kickoff", category: "Game logic", critical: true, run: () => testKickoffLock() },
  { id: "standings-trigger", label: "Standings trigger works", category: "Game logic", critical: true, run: () => testStandingsTrigger() },
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
  { id: "edge-exact", label: "Exact scoreline (all points)", category: "Game logic", run: () => testEdgeExactScoreline() },
  { id: "edge-correct-wrong-score", label: "Correct result, wrong score", category: "Game logic", run: () => testEdgeCorrectResultWrongScore() },
  { id: "edge-wrong-scorer", label: "Correct result, wrong first scorer", category: "Game logic", run: () => testEdgeWrongFirstScorer() },
  { id: "edge-draw", label: "Draw predicted correctly", category: "Game logic", run: () => testEdgeDrawCorrect() },
  { id: "edge-00-draw", label: "0-0 draw predicted correctly", category: "Game logic", run: () => testEdgeZeroZeroDraw() },
  { id: "edge-00-boost", label: "0-0 draw with booster", category: "Game logic", run: () => testEdgeZeroZeroBooster() },
  { id: "edge-wrong", label: "Wrong result (zero points)", category: "Game logic", run: () => testEdgeWrongResult() },
  { id: "edge-away", label: "Correct away win", category: "Game logic", run: () => testEdgeAwayWin() },
  { id: "edge-booster", label: "Booster doubles points", category: "Game logic", run: () => testEdgeBooster() },
  { id: "edge-underdog-below", label: "Underdog bonus fires below 10%", category: "Game logic", run: () => testEdgeUnderdogBelow10pct() },
  { id: "edge-underdog-at", label: "Underdog bonus does NOT fire at 10%", category: "Game logic", run: () => testEdgeUnderdogAt10pct() },
  { id: "edge-rescore", label: "Re-scoring does not double points", category: "Game logic", run: () => testEdgeRescoreNoDouble() },
  { id: "edge-correction", label: "Result correction recalculates correctly", category: "Game logic", run: () => testEdgeResultCorrection() },
];

const LOCK_TESTS: TestDef[] = [
  { id: "lock-ui-past", label: "UI: past matches render locked", category: "Auth & security", run: () => testLockUiPastMatch() },
  { id: "lock-srv-past", label: "Server rejects insert on past match", category: "Auth & security", run: () => testLockServerRejectsPastInsert() },
  { id: "lock-srv-completed", label: "Server rejects insert on completed match", category: "Auth & security", run: () => testLockServerRejectsCompleted() },
  { id: "lock-srv-update", label: "Server rejects update after kickoff", category: "Auth & security", run: () => testLockServerRejectsUpdate() },
  { id: "lock-future-ok", label: "Future match accepts prediction", category: "Auth & security", run: () => testLockServerAcceptsFuture() },
  { id: "lock-reopen", label: "Moving kickoff to future reopens predictions", category: "Auth & security", run: () => testLockReopensWhenKickoffMovedFuture() },
  { id: "lock-relock", label: "Moving kickoff back to past re-locks", category: "Auth & security", run: () => testLockRelocksWhenKickoffMovedPast() },
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
  const criticalsPassing = TESTS.filter((t) => t.critical).every((t) => {
    const s = state[t.id];
    return s && typeof s !== "string" && s.status === "pass";
  });
  const anyCriticalFailed = TESTS.filter((t) => t.critical).some((t) => {
    const s = state[t.id];
    return s && typeof s !== "string" && s.status === "fail";
  });

  const grouped = TESTS.reduce(
    (acc, t) => {
      (acc[t.category] = acc[t.category] ?? []).push(t);
      return acc;
    },
    {} as Record<string, TestDef[]>,
  );

  return (
    <>
      <TestDataPanel />
      <EdgeCasesPanel />
      <PredictionLockPanel />
      <StandingsVerifierPanel />
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between border-b border-border">
        <div>
          <div className="font-semibold">Pre-release checks</div>
          <div className="text-xs text-muted-foreground">
            Run before going live. Critical tests must pass.
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
            ? "❌ Fix issues before launch"
            : criticalsPassing
              ? "✅ App is ready for launch 🚀"
              : "⚠️ Some checks need attention"}
          <span className="ml-3 text-xs font-normal opacity-80">
            ✅ {counts.pass} · ❌ {counts.fail} · ⚠️ {counts.warn}
          </span>
        </div>
      )}

      {Object.entries(grouped).map(([cat, tests]) => (
        <div key={cat} className="border-b border-border last:border-b-0">
          <div className="px-4 py-2 text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/30">
            {cat}
          </div>
          <div className="divide-y divide-border">
            {tests.map((t) => {
              const s = state[t.id];
              const status =
                !s || s === "idle"
                  ? "idle"
                  : s === "running"
                    ? "running"
                    : s.status;
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
            })}
          </div>
        </div>
      ))}
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
