import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  adminFillRandomScoresFn,
  adminClearTestScoresFn,
  adminFillTestPredictionsFn,
  adminRunTestCycleFn,
  adminListMatchdaysSlimFn,
  adminCreateTestUsersFn,
  adminListTestUsersFn,
  adminDeleteTestUsersFn,
  adminListLeaguesForTestFn,
  adminAddTestUsersToLeagueFn,
  type FilledMatch,
} from "@/lib/admin-tests.functions";

type Scope = "current" | "all_groups" | "matchday";

export function TestDataPanel() {
  const qc = useQueryClient();
  const [fillScope, setFillScope] = useState<Scope>("current");
  const [fillMd, setFillMd] = useState<number | "">("");
  const [clearScope, setClearScope] = useState<Scope>("current");
  const [clearMd, setClearMd] = useState<number | "">("");
  const [filled, setFilled] = useState<{ count: number; matches: FilledMatch[] } | null>(null);
  const [clearedMsg, setClearedMsg] = useState<string | null>(null);
  const [predMsg, setPredMsg] = useState<string | null>(null);
  const [cycleResult, setCycleResult] = useState<
    | null
    | {
        matchday_id: number | null;
        matches_scored: number;
        predictions_evaluated: number;
        admin_points: number;
        admin_rank: number | null;
      }
  >(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const mds = useQuery({
    queryKey: ["admin-matchdays-slim"],
    queryFn: () => adminListMatchdaysSlimFn(),
  });

  const fill = useMutation({
    mutationFn: () =>
      adminFillRandomScoresFn({
        data: {
          scope: fillScope,
          matchday_id: fillScope === "matchday" && fillMd ? Number(fillMd) : undefined,
        },
      }),
    onSuccess: (r) => {
      setFilled({ count: r.filled, matches: r.matches });
      toast.success(`${r.filled} matches filled`);
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const clear = useMutation({
    mutationFn: () =>
      adminClearTestScoresFn({
        data: {
          scope: clearScope,
          matchday_id: clearScope === "matchday" && clearMd ? Number(clearMd) : undefined,
        },
      }),
    onSuccess: (r) => {
      setClearedMsg(`✓ Test data cleared for ${r.cleared} matches`);
      setConfirmOpen(false);
      qc.invalidateQueries();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Error");
      setConfirmOpen(false);
    },
  });

  const fillPreds = useMutation({
    mutationFn: () => adminFillTestPredictionsFn(),
    onSuccess: (r) => {
      setPredMsg(`✓ ${r.created} predictions created for admin`);
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const cycle = useMutation({
    mutationFn: () => adminRunTestCycleFn(),
    onSuccess: (r) => {
      setCycleResult(r);
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const scopeLabel = (s: Scope, mdId?: number | "") => {
    if (s === "current") return "current matchday";
    if (s === "all_groups") return "all group stage matches (72)";
    const name = mds.data?.find((m) => m.id === Number(mdId))?.name;
    return name ? `matchday "${name}"` : "the selected matchday";
  };

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden mb-4">
      <div className="px-4 py-3 border-b border-border">
        <div className="font-semibold">Test Data</div>
        <div className="text-xs text-muted-foreground">
          Tools to seed and reset realistic test data for end-to-end checks.
        </div>
      </div>

      <div className="px-4 py-3 bg-amber-500/10 border-b border-border text-sm text-amber-glow font-medium flex items-start gap-2">
        <span aria-hidden>⚠️</span>
        <span>
          Test tools only. These actions modify real database data. Do not use after the
          tournament starts.
        </span>
      </div>

      {/* Tool 1: Fill random scores */}
      <div className="px-4 py-3 border-b border-border space-y-2">
        <div className="font-medium text-sm">Fill random scores</div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={fillScope}
            onChange={(e) => setFillScope(e.target.value as Scope)}
            className="rounded-lg bg-input border border-border px-2 py-1.5 text-xs"
          >
            <option value="current">Current matchday only</option>
            <option value="all_groups">All group stage matches (72)</option>
            <option value="matchday">Specific matchday</option>
          </select>
          {fillScope === "matchday" && (
            <select
              value={fillMd}
              onChange={(e) => setFillMd(e.target.value ? Number(e.target.value) : "")}
              className="rounded-lg bg-input border border-border px-2 py-1.5 text-xs"
            >
              <option value="">— pick matchday —</option>
              {mds.data?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => fill.mutate()}
            disabled={fill.isPending || (fillScope === "matchday" && !fillMd)}
            className="rounded-lg bg-amber-gradient px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-40"
          >
            Fill random scores
          </button>
        </div>
        {filled && (
          <div className="mt-2 text-xs">
            <div className="text-success font-bold">
              ✓ {filled.count} matches filled with random scores
            </div>
            {filled.matches.length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Show details
                </summary>
                <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground font-mono">
                  {filled.matches.map((m) => (
                    <li key={m.id}>
                      {m.home_team} {m.home_score} – {m.away_score} {m.away_team}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>

      {/* Tool 2: Clear test scores */}
      <div className="px-4 py-3 border-b border-border space-y-2">
        <div className="font-medium text-sm">Clear test scores</div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={clearScope}
            onChange={(e) => setClearScope(e.target.value as Scope)}
            className="rounded-lg bg-input border border-border px-2 py-1.5 text-xs"
          >
            <option value="current">Current matchday only</option>
            <option value="all_groups">All group stage matches (72)</option>
            <option value="matchday">Specific matchday</option>
          </select>
          {clearScope === "matchday" && (
            <select
              value={clearMd}
              onChange={(e) => setClearMd(e.target.value ? Number(e.target.value) : "")}
              className="rounded-lg bg-input border border-border px-2 py-1.5 text-xs"
            >
              <option value="">— pick matchday —</option>
              {mds.data?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={clear.isPending || (clearScope === "matchday" && !clearMd)}
            className="rounded-lg border border-destructive text-destructive px-3 py-1.5 text-xs font-bold disabled:opacity-40"
          >
            Clear test scores
          </button>
        </div>
        {clearedMsg && (
          <div className="text-xs text-success font-bold">{clearedMsg}</div>
        )}
      </div>

      {/* Tool 3: Fill test predictions */}
      <div className="px-4 py-3 border-b border-border space-y-2">
        <div className="font-medium text-sm">Fill test predictions</div>
        <div className="text-[11px] text-muted-foreground">
          Creates random predictions for the logged-in admin across all eligible matches.
        </div>
        <button
          onClick={() => fillPreds.mutate()}
          disabled={fillPreds.isPending}
          className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-bold disabled:opacity-40"
        >
          Fill test predictions
        </button>
        {predMsg && <div className="text-xs text-success font-bold">{predMsg}</div>}
      </div>

      {/* Tool 4: Run full test cycle */}
      <div className="px-4 py-3 space-y-2">
        <div className="font-medium text-sm">Run full test cycle</div>
        <div className="text-[11px] text-muted-foreground">
          Fills predictions (if none), fills random scores for the current matchday, then runs
          scoring.
        </div>
        <button
          onClick={() => cycle.mutate()}
          disabled={cycle.isPending}
          className="rounded-lg bg-amber-gradient px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-40"
        >
          {cycle.isPending ? "Running…" : "Run full test cycle"}
        </button>
        {cycleResult && (
          <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3 text-xs space-y-0.5">
            <div className="font-bold text-success">Test cycle complete:</div>
            <div>• {cycleResult.matches_scored} matches scored</div>
            <div>• {cycleResult.predictions_evaluated} predictions evaluated</div>
            <div>• Admin earned {cycleResult.admin_points} points</div>
            <div>
              • Admin rank: {cycleResult.admin_rank ?? "—"}
            </div>
          </div>
        )}
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-w-md w-full rounded-2xl border border-border bg-card p-5 space-y-3">
            <div className="text-base font-bold">Confirm clear</div>
            <div className="text-sm text-muted-foreground whitespace-pre-line">
              {`Clear all test scores for ${scopeLabel(clearScope, clearMd)}?

This will reset home_score, away_score, first_scorer to null and status back to 'upcoming' for all selected matches. Points earned on predictions will also be reset to null.

This cannot be undone.`}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={clear.isPending}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => clear.mutate()}
                disabled={clear.isPending}
                className="rounded-lg bg-destructive text-destructive-foreground px-3 py-1.5 text-xs font-bold disabled:opacity-40"
              >
                {clear.isPending ? "Clearing…" : "Clear test data"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
