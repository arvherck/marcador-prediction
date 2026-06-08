import { useMutation } from "@tanstack/react-query";
import { adminQuickTestCheckFn, type QuickCheck } from "@/lib/admin-reset.functions";

type CheckRow = { ok: boolean; label: string };

function buildChecks(r: QuickCheck): CheckRow[] {
  return [
    {
      ok: r.scored_real_matchdays === 0,
      label:
        r.scored_real_matchdays === 0
          ? "No real matchdays are scored yet"
          : `${r.scored_real_matchdays} matchdays are already scored. Running test data tools may mix with real data. Consider running tests in isolation.`,
    },
    {
      ok: r.real_user_live_predictions === 0,
      label:
        r.real_user_live_predictions === 0
          ? "No real users have live predictions on upcoming matches"
          : `${r.real_user_live_predictions} real users have live predictions. Clearing test scores will not affect these — but Fill Random Scores may overwrite real results if you select 'all group stage'.`,
    },
    {
      ok: r.orphan_test_artifacts === 0,
      label:
        r.orphan_test_artifacts === 0
          ? "No orphaned __test matchday artifacts"
          : "Orphaned test artifacts found. Running 'Purge test artifacts' first is recommended.",
    },
    {
      ok: r.leftover_test_users === 0,
      label:
        r.leftover_test_users === 0
          ? "No leftover test users from previous sessions"
          : `${r.leftover_test_users} test users from a previous session still exist. Remove them before creating new ones.`,
    },
  ];
}

export function QuickTestCheckCard() {
  const m = useMutation({ mutationFn: () => adminQuickTestCheckFn() });
  const rows = m.data ? buildChecks(m.data) : null;
  const allOk = rows ? rows.every((r) => r.ok) : false;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden mb-4">
      <div className="px-4 py-3 flex items-center justify-between gap-3 border-b border-border">
        <div className="min-w-0">
          <div className="font-semibold">⚡ Quick test check</div>
          <div className="text-xs text-muted-foreground">
            5-second pre-flight that verifies the app is in a safe state for testing.
          </div>
        </div>
        <button
          onClick={() => m.mutate()}
          disabled={m.isPending}
          className="rounded-lg bg-amber-gradient px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50"
        >
          {m.isPending ? "Checking…" : "⚡ Run quick check"}
        </button>
      </div>
      {rows && (
        <div className="px-4 py-3 space-y-1.5 text-sm">
          {rows.map((r, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="w-5 text-center">{r.ok ? "✅" : "⚠️"}</span>
              <div className="flex-1">{r.label}</div>
            </div>
          ))}
          <div
            className={`mt-2 text-xs font-medium ${allOk ? "text-success" : "text-amber-glow"}`}
          >
            {allOk
              ? "✅ App is in a clean test state"
              : "⚠️ Proceed with caution — see warnings above"}
          </div>
        </div>
      )}
      {m.error && (
        <div className="px-4 pb-3 text-xs text-destructive">
          {m.error instanceof Error ? m.error.message : String(m.error)}
        </div>
      )}
    </div>
  );
}
