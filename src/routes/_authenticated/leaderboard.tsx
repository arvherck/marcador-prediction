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
  getMatchdayLeaderboard,
  getMyLeagues,
} from "@/lib/game.functions";
import { useGuest } from "@/lib/guest";
import { teamFlag } from "@/lib/teamFlags";

export const Route = createFileRoute("/_authenticated/leaderboard")({
  head: () => ({
    meta: [
      { title: "El Marcador · Marcador" },
      { name: "description", content: "Live standings across the tournament." },
    ],
  }),
  component: LeaderboardPage,
});

type OverallRow = {
  id: string;
  display_name: string;
  country: string;
  favourite_team: string;
  total_points: number;
  last_md_points: number;
};

type MatchdayRow = {
  id: string;
  display_name: string;
  country: string;
  favourite_team: string;
  total_points: number;
  rank: number | null;
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
          <OverallTab meId={me.id} />
        </TabsContent>
        <TabsContent value="matchday">
          <MatchdayTab meId={me.id} />
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

function OverallTab({ meId, leagueId }: { meId: string; leagueId?: string }) {
  const q = useQuery({
    queryKey: ["leaderboard", "overall", leagueId ?? "global"],
    queryFn: () =>
      getLeaderboard({ data: leagueId ? { league_id: leagueId } : {} }),
  });

  if (q.isLoading) return <SkeletonBoard />;
  const rows = (q.data ?? []) as OverallRow[];
  if (!rows.length) return <EmptyState />;

  return (
    <Board>
      {rows.map((row, i) => (
        <Row
          key={row.id}
          rank={i + 1}
          isMe={row.id === meId}
          name={row.display_name}
          country={row.country}
          favourite={row.favourite_team}
          primary={row.total_points}
          secondary={
            row.last_md_points > 0 ? `+${row.last_md_points} last MD` : "—"
          }
        />
      ))}
    </Board>
  );
}

function MatchdayTab({ meId }: { meId: string }) {
  const q = useQuery({
    queryKey: ["leaderboard", "matchday"],
    queryFn: () => getMatchdayLeaderboard({ data: {} }),
  });

  if (q.isLoading) return <SkeletonBoard />;
  const data = q.data;
  if (!data || !data.matchday) {
    return (
      <div className="rounded-2xl border border-border bg-card p-10 text-center">
        <div className="text-sm text-muted-foreground">
          No matchday has been scored yet. Check back after results are in.
        </div>
      </div>
    );
  }
  const rows = data.rows as MatchdayRow[];
  return (
    <>
      <div className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">
        {data.matchday.name}
      </div>
      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <Board>
          {rows.map((row, i) => (
            <Row
              key={row.id}
              rank={row.rank ?? i + 1}
              isMe={row.id === meId}
              name={row.display_name}
              country={row.country}
              favourite={row.favourite_team}
              primary={row.total_points}
            />
          ))}
        </Board>
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
  isMe,
  name,
  country,
  favourite,
  primary,
  secondary,
}: {
  rank: number;
  isMe: boolean;
  name: string;
  country: string;
  favourite: string;
  primary: number;
  secondary?: string;
}) {
  const isTop3 = rank <= 3;
  return (
    <div
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
          {isTop3 ? <Trophy size={18} className="fill-current" /> : rank}
        </div>
        {isTop3 && (
          <div className="font-score font-bold text-sm text-muted-foreground tabular-nums w-5 -ml-1">
            {rank}
          </div>
        )}
        <div className="text-xl leading-none" aria-hidden>
          {teamFlag(country) || "🏳️"}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-sm truncate flex items-center gap-2">
            {name}
            {isMe && (
              <span className="text-[10px] uppercase tracking-wider text-primary font-bold">
                You
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
