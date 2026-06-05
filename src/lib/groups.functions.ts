import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
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

export type GroupWithStandings = {
  id: number;
  name: string;
  standings: StandingRow[];
};

function sortStandings(rows: StandingRow[]): StandingRow[] {
  return [...rows].sort(
    (a, b) =>
      b.points - a.points ||
      b.goal_difference - a.goal_difference ||
      b.goals_for - a.goals_for ||
      a.team.localeCompare(b.team),
  );
}

type AnySupabase = {
  from: (t: string) => {
    select: (s: string) => {
      order: (col: string, opts?: { ascending?: boolean }) => Promise<{ data: unknown; error: { message: string } | null }>;
      eq?: (a: string, b: string | number) => unknown;
    };
  };
};

async function loadAll(client: AnySupabase): Promise<GroupWithStandings[]> {
  const c = client as unknown as {
    from: (t: string) => {
      select: (s: string) => {
        order: (col: string, opts?: { ascending?: boolean }) => Promise<{
          data: Array<Record<string, unknown>> | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
  const [groupsRes, standingsRes] = await Promise.all([
    c.from("wc_groups").select("id, name").order("id", { ascending: true }),
    c
      .from("wc_standings")
      .select(
        "id, group_id, team, played, won, drawn, lost, goals_for, goals_against, goal_difference, points",
      )
      .order("group_id", { ascending: true }),
  ]);
  if (groupsRes.error) throw new Error(groupsRes.error.message);
  if (standingsRes.error) throw new Error(standingsRes.error.message);

  const byGroup = new Map<number, StandingRow[]>();
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
    const arr = byGroup.get(gid) ?? [];
    arr.push(row);
    byGroup.set(gid, arr);
  }

  return ((groupsRes.data ?? []) as Array<Record<string, unknown>>).map((g) => ({
    id: Number(g.id),
    name: String(g.name),
    standings: sortStandings(byGroup.get(Number(g.id)) ?? []),
  }));
}

export const getGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GroupWithStandings[]> => {
    return loadAll(context.supabase as unknown as AnySupabase);
  });

export const getGroupsPublic = createServerFn({ method: "GET" }).handler(
  async (): Promise<GroupWithStandings[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadAll(supabaseAdmin as unknown as AnySupabase);
  },
);

const rowSchema = z.object({
  id: z.string().uuid(),
  won: z.number().int().min(0).max(50),
  drawn: z.number().int().min(0).max(50),
  lost: z.number().int().min(0).max(50),
  goals_for: z.number().int().min(0).max(200),
  goals_against: z.number().int().min(0).max(200),
});

export const adminSaveGroupStandingsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      group_id: z.number().int().min(1).max(12),
      rows: z.array(rowSchema).length(4),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const adminClient = supabase as unknown as {
      from: (t: string) => {
        select: (s: string) => {
          eq: (a: string, b: string | number) => {
            eq: (a: string, b: string) => { maybeSingle: () => Promise<{ data: unknown }> };
          };
        };
        update: (
          values: Record<string, unknown>,
        ) => {
          eq: (a: string, b: string) => {
            eq: (a: string, b: number) => Promise<{ error: { message: string } | null }>;
          };
        };
      };
    };
    const { data: roleRow } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Forbidden");

    for (const r of data.rows) {
      const played = r.won + r.drawn + r.lost;
      const { error } = await adminClient
        .from("wc_standings")
        .update({
          won: r.won,
          drawn: r.drawn,
          lost: r.lost,
          goals_for: r.goals_for,
          goals_against: r.goals_against,
          played,
        })
        .eq("id", r.id)
        .eq("group_id", data.group_id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
