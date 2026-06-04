import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { getLeaderboard, getMyLeagues } from "@/lib/game.functions";

export const Route = createFileRoute("/_authenticated/leagues/$id")({
  head: ({ params }) => {
    const url = `https://marcador-prediction.lovable.app/leagues/${params.id}`;
    const title = "League standings · Marcador";
    const description =
      "Private Marcador league standings — track your friends' World Cup 2026 predictions, points per matchday, and ranking inside this league.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "robots", content: "noindex" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: LeagueDetailPage,
});

function LeagueDetailPage() {
  const { id } = Route.useParams();
  const { me } = Route.useRouteContext();
  const leagues = useQuery({ queryKey: ["leagues"], queryFn: () => getMyLeagues() });
  const board = useQuery({
    queryKey: ["leaderboard", "league", id],
    queryFn: () => getLeaderboard({ data: { league_id: id } }),
  });
  const league = leagues.data?.find((l) => l.id === id);

  return (
    <AppShell displayName={me.profile?.display_name} isAdmin={me.is_admin}>
      <Link to="/leagues" className="text-xs text-muted-foreground hover:text-foreground">
        ← All leagues
      </Link>
      <div className="mt-3 mb-6">
        <h1 className="font-display font-bold text-2xl md:text-3xl">
          {league?.name ?? "League"}
        </h1>
        {league && (
          <p className="text-sm text-muted-foreground mt-1">
            Invite code{" "}
            <span className="font-score font-bold tracking-widest text-primary">
              {league.invite_code}
            </span>
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
        {board.data?.map((row, i) => (
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
                <div className="font-semibold text-sm truncate">{row.display_name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  ♥ {row.favourite_team}
                </div>
              </div>
            </div>
            <div className="font-score font-bold text-xl text-amber-glow tabular-nums">
              {row.total_points}
            </div>
          </div>
        ))}
        {board.data?.length === 0 && (
          <div className="p-8 text-center text-muted-foreground text-sm">No members yet.</div>
        )}
      </div>
    </AppShell>
  );
}
