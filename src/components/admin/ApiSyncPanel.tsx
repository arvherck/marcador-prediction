import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  getApiStatusFn,
  syncFixturesFn,
  syncStandingsFn,
  syncLiveScoresFn,
  syncSquadsFn,
} from "@/lib/api-football.functions";

function formatExpiry(expires_at: string | null | undefined): string {
  if (!expires_at) return "no cache";
  const ms = new Date(expires_at).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const m = Math.floor(ms / 60000);
  if (m < 60) return `expires in ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `expires in ${h}h`;
  return `expires in ${Math.floor(h / 24)}d`;
}

function formatFetched(fetched_at: string | null | undefined): string {
  if (!fetched_at) return "never synced";
  const ms = Date.now() - new Date(fetched_at).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function ApiSyncPanel() {
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ["api-status"],
    queryFn: () => getApiStatusFn(),
    refetchInterval: 30_000,
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["api-status"] });

  const onResult = (label: string) => (r: any) => {
    if (r?.warning) toast.warning(r.warning);
    const noun = r?.cached ? "Cache hit" : `Synced ${r?.count ?? 0}`;
    toast.success(`${label}: ${noun}`);
    invalidate();
  };
  const onError = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : "Sync failed");

  const fixtures = useMutation({
    mutationFn: () => syncFixturesFn({ data: undefined as any }),
    onSuccess: onResult("Fixtures"),
    onError,
  });
  const standings = useMutation({
    mutationFn: () => syncStandingsFn({ data: undefined as any }),
    onSuccess: onResult("Standings"),
    onError,
  });
  const live = useMutation({
    mutationFn: () => syncLiveScoresFn({ data: undefined as any }),
    onSuccess: onResult("Live"),
    onError,
  });
  const [squadsConfirmed, setSquadsConfirmed] = useState(false);
  const squads = useMutation({
    mutationFn: () =>
      syncSquadsFn({ data: { confirmed: squadsConfirmed } }),
    onSuccess: (r) => {
      onResult("Squads")(r);
      setSquadsConfirmed(false);
    },
    onError: (e) => {
      onError(e);
      if (e instanceof Error && e.message.includes("Re-run with confirmation")) {
        setSquadsConfirmed(true);
      }
    },
  });

  const data = status.data;
  const calls = data?.calls_made ?? 0;
  const limit = data?.limit ?? 100;
  const warnAt = data?.warn_at ?? 90;
  const cache = data?.cache ?? {
    fixtures: null,
    standings: null,
    live_fixtures: null,
    squads_index: null,
  };
  const livePossible = data?.live_possible ?? false;

  const counterColor =
    calls >= limit
      ? "text-red-500"
      : calls >= warnAt
        ? "text-amber-500"
        : "text-emerald-500";

  return (
    <div className="rounded-2xl border border-border bg-card p-4 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-semibold text-lg">API sync</h2>
        <div className={`text-sm font-mono font-semibold ${counterColor}`}>
          API calls today: {calls} / {limit}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <SyncCard
          label="Sync Fixtures"
          help="24h cache"
          meta={cache.fixtures}
          loading={fixtures.isPending}
          onClick={() => fixtures.mutate()}
        />
        <SyncCard
          label="Sync Standings"
          help="2h cache"
          meta={cache.standings}
          loading={standings.isPending}
          onClick={() => standings.mutate()}
        />
        <SyncCard
          label="Sync Live Scores"
          help={livePossible ? "3m cache" : "no live matches"}
          meta={cache.live_fixtures}
          loading={live.isPending}
          disabled={!livePossible}
          onClick={() => live.mutate()}
        />
        <SyncCard
          label={squadsConfirmed ? "Confirm Sync Squads" : "Sync Squads"}
          help={
            squadsConfirmed
              ? "click again to confirm expensive sync"
              : "7d cache · up to 48 calls"
          }
          meta={cache.squads_index}
          loading={squads.isPending}
          onClick={() => squads.mutate()}
        />
      </div>
    </div>
  );
}

function SyncCard({
  label,
  help,
  meta,
  loading,
  disabled,
  onClick,
}: {
  label: string;
  help: string;
  meta: { fetched_at: string; expires_at: string } | null;
  loading: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || disabled}
      className="text-left rounded-xl border border-border bg-background hover:bg-accent/40 disabled:opacity-50 disabled:cursor-not-allowed p-3 transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-sm">{label}</span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {help}
        </span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {loading ? "syncing…" : formatFetched(meta?.fetched_at)} ·{" "}
        {formatExpiry(meta?.expires_at)}
      </div>
    </button>
  );
}
