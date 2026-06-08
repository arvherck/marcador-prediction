import { useState } from "react";

export function TestWorkflowGuide() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-border bg-card mb-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-3 flex items-center justify-between text-left"
      >
        <div className="font-semibold text-sm">📋 Test workflow</div>
        <span className="text-xs text-muted-foreground">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 text-sm space-y-3">
          <section>
            <div className="font-medium mb-1">BEFORE TESTING</div>
            <ol className="ml-4 list-decimal space-y-0.5 text-muted-foreground">
              <li>Click <strong>⚡ Quick test check</strong> — confirm app is in clean state</li>
              <li>If not clean, click <strong>🔄 Reset to go-live state</strong> first</li>
            </ol>
          </section>
          <section>
            <div className="font-medium mb-1">RUNNING AUTOMATED TESTS</div>
            <ol className="ml-4 list-decimal space-y-0.5 text-muted-foreground" start={3}>
              <li>Click <strong>▶ Run all tests</strong> — all 70+ tests run automatically</li>
              <li>Click <strong>📋 Copy report</strong> — paste into Claude for analysis</li>
            </ol>
          </section>
          <section>
            <div className="font-medium mb-1">RUNNING MANUAL / E2E TESTS</div>
            <ol className="ml-4 list-decimal space-y-0.5 text-muted-foreground" start={5}>
              <li>Click <strong>Fill test predictions</strong> — creates predictions for admin user</li>
              <li>Click <strong>Fill random scores</strong> (current matchday) — fills results for those matches</li>
              <li>In Results &amp; Scoring → click <strong>Run scoring</strong> — verify points appear on leaderboard</li>
              <li>Click <strong>Multi-user simulation</strong> (5 users) — verify leaderboard rankings</li>
              <li>Test Ligas join flow manually</li>
              <li>Check mobile layout</li>
            </ol>
          </section>
          <section>
            <div className="font-medium mb-1">AFTER TESTING</div>
            <ol className="ml-4 list-decimal space-y-0.5 text-muted-foreground" start={11}>
              <li>Click <strong>🔄 Reset to go-live state</strong> — wipe all test data</li>
              <li>Click <strong>▶ Run all tests</strong> again — verify launch readiness tests all pass</li>
              <li>App is now ready for real users</li>
            </ol>
          </section>
        </div>
      )}
    </div>
  );
}
