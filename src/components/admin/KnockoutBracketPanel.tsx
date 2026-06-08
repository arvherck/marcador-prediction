import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  adminBracketStatus,
  adminPopulateBracket,
  adminOverrideKnockoutTeams,
  adminResetKnockoutMatch,
  adminCascadeKnockout,
  type KnockoutRow,
} from "@/lib/game.functions";

type ThirdTeam = {
  team: string;
  group: string;
  points: number;
  gd: number;
  gf: number;
  fair_play: number;
};

type PopulateResponse =
  | { ok: true; populated: number[]; pending: number[] }
  | { ok: false; reason: "group_stage_incomplete"; remaining: number }
  | { ok: false; reason: "not_enough_thirds"; have: number }
  | {
      ok: false;
      reason: "needs_third_confirmation";
      third_teams: ThirdTeam[];
      third_slots: number[];
      winners: Record<string, string>;
      runners: Record<string, string>;
    };

const PHASE_ORDER = ["Round of 32", "Round of 16", "Quarterfinal", "Semifinal", "Third Place", "Final"];

export function KnockoutBracketPanel() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-bracket-status"],
    queryFn: () => adminBracketStatus(),
  });

  const [thirdDialog, setThirdDialog] = useState<{
    teams: ThirdTeam[];
    assignment: Record<string, string>;
  } | null>(null);

  const populate = useMutation({
    mutationFn: (third?: Record<string, string>) =>
      adminPopulateBracket({ data: { thirdAssignment: third } }),
    onSuccess: (res) => {
      const r = res as unknown as PopulateResponse;
      if (r.ok) {
        toast.success(`✓ Bracket updated — ${r.populated.length} match(es) populated, ${r.pending.length} pending.`);
        setThirdDialog(null);
        qc.invalidateQueries({ queryKey: ["admin-bracket-status"] });
        qc.invalidateQueries({ queryKey: ["admin-mds"] });
        return;
      }
      if (r.reason === "group_stage_incomplete") {
        toast.error(`Group stage not complete — ${r.remaining} match(es) remaining.`);
        return;
      }
      if (r.reason === "not_enough_thirds") {
        toast.error(`Only ${r.have} third-placed teams available; need 8.`);
        return;
      }
      if (r.reason === "needs_third_confirmation") {
        const initial: Record<string, string> = {};
        r.third_teams.forEach((t, i) => {
          initial[String(i + 1)] = t.team;
        });
        setThirdDialog({ teams: r.third_teams, assignment: initial });
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed."),
  });

  const cascade = useMutation({
    mutationFn: () => adminCascadeKnockout(),
    onSuccess: () => {
      toast.success("Cascade complete.");
      qc.invalidateQueries({ queryKey: ["admin-bracket-status"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed."),
  });

  const rows = q.data?.rows ?? [];
  const grouped = useMemo(() => {
    const m = new Map<string, KnockoutRow[]>();
    for (const r of rows) {
      const k = r.phase ?? "Other";
      const arr = m.get(k) ?? [];
      arr.push(r);
      m.set(k, arr);
    }
    return PHASE_ORDER.filter((p) => m.has(p)).map((p) => [p, m.get(p)!] as const);
  }, [rows]);

  const populated = rows.filter((r) => r.teams_confirmed).length;
  const total = rows.length;
  const allPopulated = total > 0 && populated === total;

  if (q.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading bracket…</p>;
  }

  return (
    <div className="space-y-4">
      {/* Banner */}
      {!q.data?.groupStageComplete && (
        <div className="rounded-2xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Group stage in progress — {q.data?.groupRemaining ?? "?"} match(es) remaining before the bracket can be populated.
        </div>
      )}
      {q.data?.groupStageComplete && !allPopulated && (
        <div className="rounded-2xl border border-success/40 bg-success/10 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-medium">
            ✅ All group matches complete — Round of 32 bracket ready to populate.
          </div>
          <button
            onClick={() => populate.mutate(undefined)}
            disabled={populate.isPending}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {populate.isPending ? "Populating…" : "Populate bracket"}
          </button>
        </div>
      )}
      {allPopulated && (
        <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          ✓ Bracket up to date — {populated}/{total} matches populated.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {populated}/{total} knockout matches have both teams confirmed.
        </p>
        <button
          onClick={() => cascade.mutate()}
          disabled={cascade.isPending}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50"
        >
          {cascade.isPending ? "Cascading…" : "Cascade winners"}
        </button>
      </div>

      {grouped.map(([phase, list]) => (
        <PhaseBlock key={phase} phase={phase} rows={list} />
      ))}

      {thirdDialog && (
        <ThirdPlaceConfirmDialog
          teams={thirdDialog.teams}
          assignment={thirdDialog.assignment}
          onChange={(slot, team) =>
            setThirdDialog((d) =>
              d ? { ...d, assignment: { ...d.assignment, [slot]: team } } : d,
            )
          }
          onCancel={() => setThirdDialog(null)}
          onConfirm={() => populate.mutate(thirdDialog.assignment)}
          submitting={populate.isPending}
        />
      )}
    </div>
  );
}

function PhaseBlock({ phase, rows }: { phase: string; rows: KnockoutRow[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="px-4 py-2 border-b border-border text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {phase} · {rows.length} matches
      </div>
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <KnockoutRowEditor key={r.id} row={r} />
        ))}
      </ul>
    </div>
  );
}

function KnockoutRowEditor({ row }: { row: KnockoutRow }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [home, setHome] = useState(row.home_team ?? "");
  const [away, setAway] = useState(row.away_team ?? "");

  const save = useMutation({
    mutationFn: () =>
      adminOverrideKnockoutTeams({
        data: {
          match_id: row.id,
          home_team: home.trim() || null,
          away_team: away.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Teams updated.");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["admin-bracket-status"] });
      qc.invalidateQueries({ queryKey: ["admin-mds"] });
      qc.invalidateQueries({ queryKey: ["all-matches"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed."),
  });

  const reset = useMutation({
    mutationFn: () => adminResetKnockoutMatch({ data: { match_id: row.id } }),
    onSuccess: () => {
      toast.success("Match reset to placeholder.");
      qc.invalidateQueries({ queryKey: ["admin-bracket-status"] });
      qc.invalidateQueries({ queryKey: ["admin-mds"] });
      qc.invalidateQueries({ queryKey: ["all-matches"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed."),
  });

  return (
    <li className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground tabular-nums">
          #{row.id} · {new Date(row.kickoff_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          {row.auto_populated && <span className="ml-2 text-success">· Auto</span>}
          {!row.auto_populated && row.teams_confirmed && <span className="ml-2 text-amber-glow">· Manual</span>}
        </div>
        {editing ? (
          <div className="mt-1 grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
            <input
              value={home}
              onChange={(e) => setHome(e.target.value)}
              placeholder={row.home_placeholder ?? "Home team"}
              className="rounded-md border border-border bg-background px-2 py-1 text-sm"
            />
            <span className="text-muted-foreground text-xs">vs</span>
            <input
              value={away}
              onChange={(e) => setAway(e.target.value)}
              placeholder={row.away_placeholder ?? "Away team"}
              className="rounded-md border border-border bg-background px-2 py-1 text-sm"
            />
          </div>
        ) : (
          <div className="mt-1 text-sm">
            <span className={row.home_team ? "font-semibold" : "text-muted-foreground italic"}>
              {row.home_team ?? row.home_placeholder ?? "TBD"}
            </span>
            <span className="text-muted-foreground mx-2">vs</span>
            <span className={row.away_team ? "font-semibold" : "text-muted-foreground italic"}>
              {row.away_team ?? row.away_placeholder ?? "TBD"}
            </span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        {editing ? (
          <>
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {save.isPending ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => {
                setHome(row.home_team ?? "");
                setAway(row.away_team ?? "");
                setEditing(false);
              }}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setEditing(true)}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
            >
              Edit
            </button>
            <button
              onClick={() => reset.mutate()}
              disabled={reset.isPending}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50"
              title="Reset to placeholder"
            >
              Reset
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function ThirdPlaceConfirmDialog({
  teams,
  assignment,
  onChange,
  onCancel,
  onConfirm,
  submitting,
}: {
  teams: ThirdTeam[];
  assignment: Record<string, string>;
  onChange: (slot: string, team: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  submitting: boolean;
}) {
  const teamOptions = teams.map((t) => t.team);
  const slots = ["1", "2", "3", "4", "5", "6", "7", "8"];
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-card border border-border rounded-2xl max-w-2xl w-full p-5 space-y-4 my-8">
        <div>
          <h3 className="font-display font-bold text-lg">Confirm 3rd place slots</h3>
          <p className="text-sm text-muted-foreground mt-1">
            8 qualified third-placed teams, ranked. Assign each to its Round of 32 slot (defaults below).
          </p>
        </div>

        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="px-2 py-1.5">Rank</th>
                <th className="px-2 py-1.5">Team</th>
                <th className="px-2 py-1.5">Grp</th>
                <th className="px-2 py-1.5 text-right">Pts</th>
                <th className="px-2 py-1.5 text-right">GD</th>
                <th className="px-2 py-1.5 text-right">GF</th>
                <th className="px-2 py-1.5 text-right">FP</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t, i) => (
                <tr key={t.team} className="border-t border-border">
                  <td className="px-2 py-1.5 tabular-nums">{i + 1}</td>
                  <td className="px-2 py-1.5 font-semibold">{t.team}</td>
                  <td className="px-2 py-1.5">{t.group}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{t.points}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{t.gd}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{t.gf}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{t.fair_play}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {slots.map((slot) => (
            <label key={slot} className="text-xs flex items-center gap-2">
              <span className="w-24 text-muted-foreground">Best 3rd #{slot}</span>
              <select
                value={assignment[slot] ?? ""}
                onChange={(e) => onChange(slot, e.target.value)}
                className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              >
                <option value="" disabled>
                  Pick a team…
                </option>
                {teamOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-semibold hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Confirm & populate"}
          </button>
        </div>
      </div>
    </div>
  );
}
