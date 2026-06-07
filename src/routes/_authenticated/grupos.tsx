import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { AppShell } from "@/components/AppShell";
import { getGroups, getGroupsPublic, type GroupWithStandings, type StandingRow } from "@/lib/groups.functions";
import { useGuest } from "@/lib/guest";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/grupos")({
  head: () => {
    const url = "https://marcador-prediction.lovable.app/grupos";
    const title = "Grupos · World Cup 2026 standings · Marcador";
    const description =
      "Live World Cup 2026 group stage standings — all 12 groups (A to L), points, goal difference, and qualification places, updated after every matchday.";
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
  component: GruposPage,
});

function GruposPage() {
  const { me } = Route.useRouteContext();
  const guest = useGuest();
  const qc = useQueryClient();
  const queryKey = ["groups", guest ? "guest" : "auth"] as const;
  const q = useQuery({
    queryKey,
    queryFn: () => (guest ? getGroupsPublic() : getGroups()),
  });

  useEffect(() => {
    const channel = supabase
      .channel("grupos-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wc_standings" },
        () => qc.invalidateQueries({ queryKey }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches" },
        () => qc.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, queryKey]);

  return (
    <AppShell displayName={me.profile?.display_name} isAdmin={me.is_admin}>
      <header className="mb-6">
        <div className="text-xs uppercase tracking-[0.2em] text-amber-glow font-semibold">
          Tournament
        </div>
        <h1 className="font-display font-bold text-3xl md:text-4xl mt-1 tracking-tight">
          Grupos
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Real World Cup 2026 group stage standings. Top 2 in each group qualify.
        </p>
      </header>

      {q.isLoading && <SkeletonGrid />}
      {q.data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {q.data.map((g) => (
            <GroupCard key={g.id} group={g} />
          ))}
        </div>
      )}
    </AppShell>
  );
}

function rowSig(s: StandingRow): string {
  return `${s.points}|${s.goal_difference}|${s.goals_for}|${s.won}|${s.drawn}|${s.lost}`;
}

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.floor(diff / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function GroupCard({ group }: { group: GroupWithStandings }) {
  const noneStarted = group.standings.every((s) => s.played === 0);
  const prevSigs = useRef<Map<string, string>>(new Map());
  const flash = new Map<string, boolean>();
  for (const s of group.standings) {
    const prev = prevSigs.current.get(s.id);
    const next = rowSig(s);
    if (prev && prev !== next) flash.set(s.id, true);
    prevSigs.current.set(s.id, next);
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-display font-semibold text-base">{group.name}</h2>
          {group.hasLiveMatch && (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 text-destructive text-[10px] font-bold uppercase tracking-wider px-2 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
              Live
            </span>
          )}
        </div>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Top 2 qualify
        </span>
      </div>
      {noneStarted ? (
        <div className="px-4 py-6 text-center text-sm text-muted-foreground">
          Tournament starts 11 June 2026
        </div>
      ) : (
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="text-left font-medium px-3 py-2">Team</th>
              <Th>P</Th>
              <Th>W</Th>
              <Th>D</Th>
              <Th>L</Th>
              <Th>GF</Th>
              <Th>GA</Th>
              <Th>GD</Th>
              <Th>Pts</Th>
            </tr>
          </thead>
          <tbody>
            {group.standings.map((s, i) => (
              <StandingRowView key={s.id} row={s} index={i} flash={!!flash.get(s.id)} />
            ))}
          </tbody>
        </table>
      )}
      <div className="px-4 py-2 border-t border-border text-[10px] text-muted-foreground">
        Updated {relTime(group.updatedAt)}
      </div>
    </div>
  );
}

function StandingRowView({ row, index, flash }: { row: StandingRow; index: number; flash: boolean }) {
  const qualifies = index < 2;
  const last = index === 3;
  const rowCls = [
    "border-t border-border transition-colors",
    qualifies ? "bg-amber-glow/5 border-l-2 border-l-amber-glow" : "border-l-2 border-l-transparent",
    last ? "opacity-60" : "",
    flash ? "animate-row-flash" : "",
  ].join(" ");
  const teamCls = qualifies
    ? "text-amber-glow font-semibold"
    : "text-foreground font-medium";
  return (
    <tr className={rowCls}>
      <td className={`text-left px-3 py-2 ${teamCls}`}>
        <span className="inline-flex items-center gap-2">
          {row.team}
        </span>
      </td>
      <Td>{row.played}</Td>
      <Td>{row.won}</Td>
      <Td>{row.drawn}</Td>
      <Td>{row.lost}</Td>
      <Td>{row.goals_for}</Td>
      <Td>{row.goals_against}</Td>
      <Td>{row.goal_difference > 0 ? `+${row.goal_difference}` : row.goal_difference}</Td>
      <Td className={`font-bold ${qualifies ? "text-amber-glow" : ""}`}>{row.points}</Td>
    </tr>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="font-medium px-2 py-2 text-center">{children}</th>;
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-2 py-2 text-center ${className}`}>{children}</td>;
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border bg-card h-56 animate-pulse" />
      ))}
    </div>
  );
}
