import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { getLeaderboard } from "@/lib/game.functions";

export const Route = createFileRoute("/_authenticated/leaderboard")({
  head: () => ({ meta: [{ title: "Leaderboard · Marcador" }] }),
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const { me } = Route.useRouteContext();
  const q = useQuery({
    queryKey: ["leaderboard", "global"],
    queryFn: () => getLeaderboard({ data: {} }),
  });

  return (
    <AppShell displayName={me.profile?.display_name} isAdmin={me.is_admin}>
      <div className="mb-6">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Global</div>
        <h1 className="font-display font-bold text-2xl md:text-3xl mt-1">Leaderboard</h1>
      </div>
      {q.isLoading && <div className="text-muted-foreground text-sm">Loading…</div>}
      {q.data && (
        <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
          {q.data.length === 0 && (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No scores yet. Lock in your predictions to get on the board.
            </div>
          )}
          {q.data.map((row, i) => (
            <div
              key={row.id}
              className={`flex items-center justify-between px-4 py-3 border-b border-border last:border-0 ${
                row.id === me.id ? "bg-primary/5" : ""
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`font-score font-bold w-7 text-center text-sm ${
                    i < 3 ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {i + 1}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate">
                    {row.display_name}
                    {row.id === me.id && (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-primary font-bold">
                        You
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {row.country} · ♥ {row.favourite_team}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-score font-bold text-xl text-amber-glow tabular-nums">
                  {row.total_points}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  pts
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
