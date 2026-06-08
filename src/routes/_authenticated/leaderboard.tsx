import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Trophy } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getLeaderboard,
  getLeaderboardPublic,
  getMatchdayLeaderboard,
  getMatchdayLeaderboardPublic,
  getMyLeagues,
} from "@/lib/game.functions";
import { getDonorIdsFn } from "@/lib/donations.functions";
import { useGuest } from "@/lib/guest";
import { teamFlag } from "@/lib/teamFlags";

export const Route = createFileRoute("/_authenticated/leaderboard")({
  head: () => {
    const url = "https://marcador-prediction.lovable.app/leaderboard";
    const title = "Global leaderboard · Marcador";
    const description =
      "Live World Cup 2026 prediction standings — see who tops the global Marcador table, with points from matchday results and exact scores.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: LeaderboardPage,
});

type OverallRow = {
  id: string;
  display_name: string;
  country: string;
  favourite_team: string;
  total_points: number;
  last_md_points: number;
  current_streak: number;
  rank?: number | null;
  correct_results?: number;
  exact_scores?: number;
  correct_first_scorers?: number;
};

type MatchdayRow = {
  id: string;
  display_name: string;
  country: string;
  favourite_team: string;
  total_points: number;
  rank: number | null;
  correct_results?: number;
  exact_scores?: number;
  correct_first_scorers?: number;
};

function LeaderboardPage() {
  const { me } = Route.useRouteContext();
  const guest = useGuest();

  return (
    <AppShell displayName={me.profile?.display_name} isAdmin={me.is_admin}>
      <div className="mb-6">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">
          Standings
        </div>
        <h1 className="font-display font-bold text-3xl md:text-4xl mt-1 tracking-tight">
          El Marcador
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Every point. Every matchday. Every league.
        </p>
      </div>

      <Tabs defaultValue="overall" className="w-full">
        <TabsList className={`grid w-full ${guest ? "grid-cols-2" : "grid-cols-3"} mb-4`}>
          <TabsTrigger value="overall">Overall</TabsTrigger>
          <TabsTrigger value="matchday">This Matchday</TabsTrigger>
          {!guest && <TabsTrigger value="leagues">My Leagues</TabsTrigger>}
        </TabsList>

        <TabsContent value="overall">
          <OverallTab meId={me.id} isGuest={guest} />
        </TabsContent>
        <TabsContent value="matchday">
          <MatchdayTab meId={me.id} isGuest={guest} />
        </TabsContent>
        {!guest && (
          <TabsContent value="leagues">
            <LeaguesTab meId={me.id} />
          </TabsContent>
        )}
      </Tabs>
    </AppShell>
  );
}

function OverallTab({ meId, isGuest, leagueId }: { meId: string; isGuest?: boolean; leagueId?: string }) {
  const q = useQuery({
    queryKey: ["leaderboard", "overall", leagueId ?? "global", isGuest ? "guest" : "auth"],
    queryFn: () =>
      isGuest
        ? getLeaderboardPublic()
        : getLeaderboard({ data: leagueId ? { league_id: leagueId } : {} }),

  });
  const rows = (q.data ?? []) as OverallRow[];
  const ids = rows.map((r) => r.id);
  const donors = useQuery({
    queryKey: ["donor-ids", ids],
    queryFn: () => getDonorIdsFn({ data: { user_ids: ids } }),
    enabled: ids.length > 0,
  });
  const donorSet = new Set<string>(donors.data ?? []);

  if (q.isLoading) return <SkeletonBoard />;
  if (!rows.length) return <EmptyState />;

  const rankCounts = new Map<number, number>();
  rows.forEach((r) => {
    const k = r.rank ?? 0;
    rankCounts.set(k, (rankCounts.get(k) ?? 0) + 1);
  });

  return (
    <Board>
      {rows.map((row, i) => {
        const rk = row.rank ?? i + 1;
        const tied = (rankCounts.get(rk) ?? 0) > 1 && row.rank != null;
        return (
          <Row
            key={row.id}
            rank={rk}
            tied={tied}
            tieInfo={
              tied
                ? `Tied on points — ranked by correct results (${row.correct_results ?? 0}), exact scores (${row.exact_scores ?? 0}), correct first scorers (${row.correct_first_scorers ?? 0})`
                : undefined
            }
            isMe={row.id === meId}
            name={row.display_name}
            country={row.country}
            favourite={row.favourite_team}
            primary={row.total_points}
            streak={row.current_streak}
            donor={donorSet.has(row.id)}
            secondary={
              row.last_md_points > 0 ? `+${row.last_md_points} last MD` : "—"
            }
          />
        );
      })}
    </Board>
  );
}

function MatchdayTab({ meId, isGuest }: { meId: string; isGuest?: boolean }) {
  const q = useQuery({
    queryKey: ["leaderboard", "matchday", isGuest ? "guest" : "auth"],
    queryFn: () =>
      isGuest
        ? getMatchdayLeaderboardPublic({ data: {} })
        : getMatchdayLeaderboard({ data: {} }),
  });
  const data = q.data;
  const rows = (data?.rows ?? []) as MatchdayRow[];
  const ids = rows.map((r) => r.id);
  const donors = useQuery({
    queryKey: ["donor-ids", ids],
    queryFn: () => getDonorIdsFn({ data: { user_ids: ids } }),
    enabled: ids.length > 0,
  });
  const donorSet = new Set<string>(donors.data ?? []);

  if (q.isLoading) return <SkeletonBoard />;
  if (!data || !data.matchday) {
    return (
      <div className="rounded-2xl border border-border bg-card p-10 text-center">
        <div className="text-sm text-muted-foreground">
          No matchday has been scored yet. Check back after results are in.
        </div>
      </div>
    );
  }
  return (
    <>
      <div className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">
        {data.matchday.name}
      </div>
      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        (() => {
          const rankCounts = new Map<number, number>();
          rows.forEach((r) => {
            const k = r.rank ?? 0;
            rankCounts.set(k, (rankCounts.get(k) ?? 0) + 1);
          });
          return (
            <Board>
              {rows.map((row, i) => {
                const rk = row.rank ?? i + 1;
                const tied = (rankCounts.get(rk) ?? 0) > 1 && row.rank != null;
                return (
                  <Row
                    key={row.id}
                    rank={rk}
                    tied={tied}
                    tieInfo={
                      tied
                        ? `Tied on points — ranked by correct results (${row.correct_results ?? 0}), exact scores (${row.exact_scores ?? 0}), correct first scorers (${row.correct_first_scorers ?? 0})`
                        : undefined
                    }
                    isMe={row.id === meId}
                    name={row.display_name}
                    country={row.country}
                    favourite={row.favourite_team}
                    primary={row.total_points}
                    donor={donorSet.has(row.id)}
                  />
                );
              })}
            </Board>
          );
        })()
      )}
    </>
  );
}

function LeaguesTab({ meId }: { meId: string }) {
  const leagues = useQuery({ queryKey: ["my-leagues"], queryFn: () => getMyLeagues() });
  const [selected, setSelected] = useState<string | undefined>(undefined);

  if (leagues.isLoading) return <SkeletonBoard />;
  const list = leagues.data ?? [];
  if (list.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-10 text-center space-y-3">
        <div className="text-sm text-muted-foreground">
          You're not in any private leagues yet.
        </div>
        <Link
          to="/leagues"
          className="inline-block rounded-xl bg-amber-gradient px-4 py-2 text-sm font-bold shadow-glow"
        >
          Create or join a league
        </Link>
      </div>
    );
  }

  const current = selected ?? list[0].id;

  return (
    <>
      <div className="mb-4">
        <Select value={current} onValueChange={setSelected}>
          <SelectTrigger className="w-full md:w-72">
            <SelectValue placeholder="Select a league" />
          </SelectTrigger>
          <SelectContent>
            {list.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name} · {l.member_count} member{l.member_count === 1 ? "" : "s"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <OverallTab meId={meId} leagueId={current} />
    </>
  );
}

function Board({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
      {children}
    </div>
  );
}

function Row({
  rank,
  tied,
  tieInfo,
  isMe,
  name,
  country,
  favourite,
  primary,
  secondary,
  streak,
  donor,
}: {
  rank: number;
  tied?: boolean;
  tieInfo?: string;
  isMe: boolean;
  name: string;
  country: string;
  favourite: string;
  primary: number;
  secondary?: string;
  streak?: number;
  donor?: boolean;
}) {
  const isTop3 = rank <= 3;
  return (
    <div
      title={tieInfo}
      className={`flex items-center justify-between gap-3 px-4 py-3 border-b border-border last:border-0 ${
        isMe ? "bg-primary/10 ring-1 ring-inset ring-primary/40" : ""
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`flex items-center justify-center w-8 font-score font-bold text-sm tabular-nums ${
            isTop3 ? "text-amber-glow" : "text-muted-foreground"
          }`}
        >
          {isTop3 ? <Trophy size={18} className="fill-current" /> : (
            <span>{tied && <span className="text-muted-foreground/70 mr-0.5">=</span>}{rank}</span>
          )}
        </div>
        {isTop3 && (
          <div className="font-score font-bold text-sm text-muted-foreground tabular-nums w-6 -ml-1">
            {tied && <span className="text-muted-foreground/70">=</span>}{rank}
          </div>
        )}
        <div className="text-xl leading-none" aria-hidden>
          {teamFlag(country) || "🏳️"}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-sm truncate flex items-center gap-2">
            {name}
            {donor && (
              <span className="text-amber-glow" title="Marcador Supporter" aria-label="Marcador Supporter">
                ⭐
              </span>
            )}
            {isMe && (
              <span className="text-[10px] uppercase tracking-wider text-primary font-bold">
                You
              </span>
            )}
            {streak !== undefined && streak >= 3 && (
              <span
                className="text-[11px] font-bold text-amber-glow tabular-nums"
                title={`${streak} matchday streak`}
              >
                🔥 {streak}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {country}
            {favourite ? ` · ♥ ${favourite}` : ""}
          </div>
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="font-score font-bold text-xl text-amber-glow tabular-nums">
          {primary}
        </div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {secondary ?? "pts"}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
      No scores yet. Lock in your predictions to get on the board.
    </div>
  );
}

function SkeletonBoard() {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between px-4 py-3 border-b border-border last:border-0 animate-pulse"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-4 bg-muted rounded" />
            <div className="w-6 h-6 bg-muted rounded-full" />
            <div className="space-y-1">
              <div className="w-32 h-3 bg-muted rounded" />
              <div className="w-20 h-2 bg-muted rounded" />
            </div>
          </div>
          <div className="w-10 h-6 bg-muted rounded" />
        </div>
      ))}
    </div>
  );
}
