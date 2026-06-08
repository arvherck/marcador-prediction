import { useQuery } from "@tanstack/react-query";
import { adminGetAppStateFn, type AppState } from "@/lib/admin-reset.functions";

type Tone = "green" | "amber" | "red";

function dotClass(tone: Tone) {
  if (tone === "green") return "bg-success";
  if (tone === "amber") return "bg-amber-glow";
  return "bg-destructive";
}

function Pill({
  tone,
  title,
  detail,
}: {
  tone: Tone;
  title: string;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 flex items-start gap-2">
      <span className={`mt-1.5 inline-block w-2.5 h-2.5 rounded-full ${dotClass(tone)}`} />
      <div className="min-w-0">
        <div className="text-sm font-medium leading-tight">{title}</div>
        {detail && (
          <div className="text-xs text-muted-foreground truncate">{detail}</div>
        )}
      </div>
    </div>
  );
}

export function AppStateDashboard() {
  const q = useQuery({
    queryKey: ["admin-app-state"],
    queryFn: () => adminGetAppStateFn(),
    refetchInterval: 30_000,
  });

  const s: AppState | undefined = q.data;
  const isClean = s?.app_clean ?? false;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden mb-4">
      <div className="px-4 py-3 flex items-center justify-between border-b border-border gap-3">
        <div className="min-w-0">
          <div className="font-semibold flex items-center gap-2">
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${isClean ? "bg-success" : "bg-destructive"}`} />
            {isClean ? "App is in clean go-live state" : "Test data present"}
          </div>
          <div className="text-xs text-muted-foreground">
            Auto-refreshes every 30 seconds.
          </div>
        </div>
        <button
          onClick={() => q.refetch()}
          disabled={q.isFetching}
          className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          {q.isFetching ? "…" : "↻ Refresh state"}
        </button>
      </div>

      {q.isLoading || !s ? (
        <div className="px-4 py-6 text-sm text-muted-foreground">Loading app state…</div>
      ) : (
        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <Pill
            tone={s.predictions.total === 0 ? "green" : "red"}
            title={`${s.predictions.total} predictions in database`}
            detail={
              s.predictions.total > 0
                ? `${s.predictions.real_users} from real users · ${s.predictions.test_users} from test users`
                : "No predictions stored."
            }
          />
          <Pill
            tone={s.test_users === 0 ? "green" : "red"}
            title={`${s.test_users} test users exist`}
            detail={s.test_users === 0 ? "No test users present." : "Remove before launch."}
          />
          <Pill
            tone={s.real_match_scores === 0 ? "green" : "red"}
            title={`${s.real_match_scores} matches have test scores`}
            detail={
              s.real_match_scores === 0
                ? "No real matches have scores."
                : "Real (non-test) matches have results stored."
            }
          />
          <Pill
            tone={s.orphan_test_matchdays === 0 ? "green" : "red"}
            title={
              s.orphan_test_matchdays === 0
                ? "No orphaned __ matchdays"
                : `${s.orphan_test_matchdays} orphaned __test matchdays found`
            }
          />
          <Pill
            tone="green"
            title={`${s.tournament_predictions} users have picked a winner`}
            detail="Informational only."
          />
          <Pill
            tone={s.scored_matchdays === 0 ? "green" : "amber"}
            title={`${s.scored_matchdays} matchdays have been scored`}
            detail={
              s.scored_matchdays === 0
                ? "No matchdays scored yet."
                : "Normal after a real matchday — amber during testing."
            }
          />
        </div>
      )}
    </div>
  );
}
