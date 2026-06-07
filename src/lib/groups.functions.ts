import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type StandingRow = {
  id: string;
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
};

export type CompletedMatch = {
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
};

export type GroupWithStandings = {
  id: number;
  name: string;
  standings: StandingRow[];
  hasLiveMatch: boolean;
  updatedAt: string | null;
  completedMatches: CompletedMatch[];
};

function h2hPoints(team: string, opponents: Set<string>, matches: CompletedMatch[]): number {
  let pts = 0;
  for (const m of matches) {
    if (m.home_team === team && opponents.has(m.away_team)) {
      if (m.home_score > m.away_score) pts += 3;
      else if (m.home_score === m.away_score) pts += 1;
    } else if (m.away_team === team && opponents.has(m.home_team)) {
      if (m.away_score > m.home_score) pts += 3;
      else if (m.away_score === m.home_score) pts += 1;
    }
  }
  return pts;
}

function sortStandings(rows: StandingRow[], matches: CompletedMatch[]): StandingRow[] {
  // First pass: sort by points / GD / GF / alpha
  const base = [...rows].sort(
    (a, b) =>
      b.points - a.points ||
      b.goal_difference - a.goal_difference ||
      b.goals_for - a.goals_for ||
      a.team.localeCompare(b.team),
  );
  // Apply H2H tiebreaker within groups tied on points+GD+GF
  const result: StandingRow[] = [];
  let i = 0;
  while (i < base.length) {
    let j = i + 1;
    while (
      j < base.length &&
      base[j].points === base[i].points &&
      base[j].goal_difference === base[i].goal_difference &&
      base[j].goals_for === base[i].goals_for
    )
      j++;
    if (j - i > 1) {
      const tied = base.slice(i, j);
      const teamSet = new Set(tied.map((t) => t.team));
      tied.sort((a, b) => {
        const others = (t: string) => {
          const s = new Set(teamSet);
          s.delete(t);
          return s;
        };
        const ha = h2hPoints(a.team, others(a.team), matches);
        const hb = h2hPoints(b.team, others(b.team), matches);
        return hb - ha || a.team.localeCompare(b.team);
      });
      result.push(...tied);
    } else {
      result.push(base[i]);
    }
    i = j;
  }
  return result;
}

type AnyClient = {
  from: (t: string) => {
    select: (s: string) => {
      order: (col: string, opts?: { ascending?: boolean }) => Promise<{
        data: Array<Record<string, unknown>> | null;
        error: { message: string } | null;
      }>;
    };
  };
};

async function loadAll(client: AnyClient): Promise<GroupWithStandings[]> {
  const [groupsRes, standingsRes, matchesRes] = await Promise.all([
    client.from("wc_groups").select("id, name").order("id", { ascending: true }),
    client
      .from("wc_standings")
      .select(
        "id, group_id, team, played, won, drawn, lost, goals_for, goals_against, goal_difference, points, updated_at",
      )
      .order("group_id", { ascending: true }),
    client
      .from("matches")
      .select("group_letter, home_team, away_team, home_score, away_score, status")
      .order("id", { ascending: true }),
  ]);
  if (groupsRes.error) throw safeError(groupsRes, "groups"groupsRes);
  if (standingsRes.error) throw safeError(standingsRes, "groups"standingsRes);
  if (matchesRes.error) throw safeError(matchesRes, "groups"matchesRes);

  // Map group letter -> id
  const groups = (groupsRes.data ?? []) as Array<Record<string, unknown>>;
  const idByLetter = new Map<string, number>();
  for (const g of groups) {
    const name = String(g.name);
    const letter = name.replace(/^Group\s+/i, "").trim().slice(0, 1).toUpperCase();
    if (letter) idByLetter.set(letter, Number(g.id));
  }

  const standingsByGroup = new Map<number, StandingRow[]>();
  const updatedByGroup = new Map<number, string>();
  for (const r of (standingsRes.data ?? []) as Array<Record<string, unknown>>) {
    const gid = Number(r.group_id);
    const row: StandingRow = {
      id: String(r.id),
      team: String(r.team),
      played: Number(r.played),
      won: Number(r.won),
      drawn: Number(r.drawn),
      lost: Number(r.lost),
      goals_for: Number(r.goals_for),
      goals_against: Number(r.goals_against),
      goal_difference: Number(r.goal_difference),
      points: Number(r.points),
    };
    const arr = standingsByGroup.get(gid) ?? [];
    arr.push(row);
    standingsByGroup.set(gid, arr);
    const ts = r.updated_at ? String(r.updated_at) : null;
    if (ts && (!updatedByGroup.get(gid) || ts > (updatedByGroup.get(gid) as string))) {
      updatedByGroup.set(gid, ts);
    }
  }

  const liveByGroup = new Map<number, boolean>();
  const completedByGroup = new Map<number, CompletedMatch[]>();
  for (const m of (matchesRes.data ?? []) as Array<Record<string, unknown>>) {
    const letter = m.group_letter ? String(m.group_letter).toUpperCase() : null;
    if (!letter) continue;
    const gid = idByLetter.get(letter);
    if (!gid) continue;
    const status = String(m.status ?? "upcoming");
    if (status === "live") liveByGroup.set(gid, true);
    if (status === "completed" && m.home_score != null && m.away_score != null) {
      const arr = completedByGroup.get(gid) ?? [];
      arr.push({
        home_team: String(m.home_team),
        away_team: String(m.away_team),
        home_score: Number(m.home_score),
        away_score: Number(m.away_score),
      });
      completedByGroup.set(gid, arr);
    }
  }

  return groups.map((g) => {
    const id = Number(g.id);
    const completed = completedByGroup.get(id) ?? [];
    return {
      id,
      name: String(g.name),
      standings: sortStandings(standingsByGroup.get(id) ?? [], completed),
      hasLiveMatch: !!liveByGroup.get(id),
      updatedAt: updatedByGroup.get(id) ?? null,
      completedMatches: completed,
    };
  });
}

export const getGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GroupWithStandings[]> => {
    return loadAll(context.supabase as unknown as AnyClient);
  });

export const getGroupsPublic = createServerFn({ method: "GET" }).handler(
  async (): Promise<GroupWithStandings[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadAll(supabaseAdmin as unknown as AnyClient);
  },
);
