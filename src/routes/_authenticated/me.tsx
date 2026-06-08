import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { EmptyBall } from "@/components/EmptyBall";
import { getMyHistoryFn, getMyMatchdayScoresFn, getMyPointsByRoundFn, getMyProfileStatsFn, type PointsByRoundRow } from "@/lib/game.functions";
import { updateProfileFn } from "@/lib/auth.functions";
import { TEAMS_2026 } from "@/lib/teams";
import { teamFlag } from "@/lib/teamFlags";

export const Route = createFileRoute("/_authenticated/me")({
  head: () => {
    const url = "https://marcador-prediction.lovable.app/me";
    const title = "Mi Marcador · Your predictions · Marcador";
    const description =
      "Your Marcador profile and prediction history — review past matchdays, booster calls, points earned, and your standing on the global table.";
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
  component: MePage,
});

type Score = {
  matchday_id: number;
  name: string;
  starts_at: string;
  total_points: number;
  rank: number | null;
};

type HistoryGroup = {
  matchday_id: number;
  matchday_name: string;
  matches: Array<{
    match_id: number;
    home_team: string;
    away_team: string;
    home_score: number | null;
    away_score: number | null;
    is_final: boolean;
    pred_home: number;
    pred_away: number;
    booster: boolean;
    points: number | null;
  }>;
};

function MePage() {
  const { me } = Route.useRouteContext();
  const history = useQuery({ queryKey: ["my-history"], queryFn: () => getMyHistoryFn() });
  const scores = useQuery({ queryKey: ["my-scores"], queryFn: () => getMyMatchdayScoresFn() });
  const rounds = useQuery({ queryKey: ["my-points-by-round"], queryFn: () => getMyPointsByRoundFn() });
  const stats = useQuery({ queryKey: ["my-stats"], queryFn: () => getMyProfileStatsFn() });

  const total = (scores.data as Score[] | undefined)?.reduce((a, b) => a + b.total_points, 0) ?? 0;


  return (
    <AppShell displayName={me.profile?.display_name} isAdmin={me.is_admin}>
      <ProfileHeader
        displayName={me.profile?.display_name ?? ""}
        country={me.profile?.country ?? ""}
        favouriteTeam={me.profile?.favourite_team ?? ""}
        donor={Boolean(me.profile?.donor)}
        total={total}
        currentStreak={me.profile?.current_streak ?? 0}
        longestStreak={me.profile?.longest_streak ?? 0}
      />

      {stats.data && (
        <Section title="At a glance">
          <StatsGrid stats={stats.data} />
        </Section>
      )}

      <Section title="Points per round">
        <RoundBarChart data={(rounds.data as PointsByRoundRow[] | undefined) ?? []} />
      </Section>


      <Section title="Rank over time">
        <RankChart data={(scores.data as Score[] | undefined) ?? []} />
      </Section>

      <Section title="Prediction history">
        <History groups={(history.data as HistoryGroup[] | undefined) ?? []} />
      </Section>
    </AppShell>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Avatar({ name, size = "lg" }: { name: string; size?: "lg" | "md" }) {
  const cls = size === "lg" ? "h-14 w-14 text-xl" : "h-10 w-10 text-base";
  return (
    <div
      className={`${cls} shrink-0 rounded-full bg-amber-gradient flex items-center justify-center font-display font-bold text-background`}
      aria-hidden
    >
      {initialsOf(name)}
    </div>
  );
}

function ProfileHeader(props: {
  displayName: string;
  country: string;
  favouriteTeam: string;
  donor: boolean;
  total: number;
  currentStreak: number;
  longestStreak: number;
}) {
  const { displayName, country, favouriteTeam, donor, total, currentStreak, longestStreak } = props;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(displayName);
  const [cty, setCty] = useState(country);
  const [team, setTeam] = useState(favouriteTeam);
  const [err, setErr] = useState<string | null>(null);

  const router = useRouter();
  const qc = useQueryClient();
  const updateProfile = useServerFn(updateProfileFn);

  const mutation = useMutation({
    mutationFn: (data: { display_name: string; country: string; favourite_team: string }) =>
      updateProfile({ data }),
    onSuccess: async () => {
      toast.success("Profile updated ✓");
      setEditing(false);
      setErr(null);
      await Promise.all([
        router.invalidate(),
        qc.invalidateQueries({ queryKey: ["leaderboard"] }),
        qc.invalidateQueries({ queryKey: ["my-history"] }),
        qc.invalidateQueries({ queryKey: ["my-stats"] }),
      ]);
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("display_name_taken")) {
        setErr("This display name is already taken — please choose another");
      } else if (msg.includes("Invalid characters")) {
        setErr("Display name can only contain letters, numbers, spaces, hyphens and underscores");
      } else {
        setErr("Could not save profile. Please try again.");
      }
    },
  });

  function startEdit() {
    setName(displayName);
    setCty(country);
    setTeam(favouriteTeam);
    setErr(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setErr(null);
  }

  function save() {
    const n = name.trim();
    const c = cty.trim();
    const t = team.trim();
    if (n.length < 2 || n.length > 40) {
      setErr("Display name must be between 2 and 40 characters");
      return;
    }
    if (!/^[\p{L}\p{N} _-]+$/u.test(n)) {
      setErr("Display name can only contain letters, numbers, spaces, hyphens and underscores");
      return;
    }
    if (c.length < 2 || c.length > 60) {
      setErr("Country must be between 2 and 60 characters");
      return;
    }
    if (t.length < 2) {
      setErr("Please pick your favourite team");
      return;
    }
    if (n === displayName && c === country && t === favouriteTeam) {
      setEditing(false);
      return;
    }
    setErr(null);
    mutation.mutate({ display_name: n, country: c, favourite_team: t });
  }

  return (
    <header className="mb-6">
      <div className="text-xs uppercase tracking-[0.2em] text-amber-glow font-semibold">
        Profile
      </div>
      <h1 className="font-display font-bold text-3xl md:text-4xl mt-1">Mi Marcador</h1>

      {!editing ? (
        <>
          <div className="mt-3 flex items-center gap-3">
            <Avatar name={displayName} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-display font-semibold text-lg truncate">
                  {displayName}
                </span>
                <button
                  type="button"
                  onClick={startEdit}
                  className="text-xs font-semibold text-amber-glow hover:underline inline-flex items-center gap-1"
                  aria-label="Edit profile"
                >
                  <span aria-hidden>✏️</span> Edit
                </button>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5 truncate">
                {country} · {favouriteTeam}
              </p>
            </div>
          </div>
          {donor && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-gradient/10 border border-primary/40 px-3 py-1 text-xs font-semibold text-amber-glow">
              ⭐ Marcador Supporter
            </div>
          )}
        </>
      ) : (
        <div className="mt-3 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-3 mb-4">
            <Avatar name={name || displayName} />
            <div className="text-sm text-muted-foreground">Edit your profile</div>
          </div>

          <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
            Display name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder="Your name"
          />
          <div className="mt-1 text-[11px] text-muted-foreground text-right">
            {name.trim().length} / 40
          </div>

          <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground mt-3 mb-1">
            Country
          </label>
          <input
            value={cty}
            onChange={(e) => setCty(e.target.value)}
            maxLength={60}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder="Where you're tuning in from"
          />

          <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground mt-3 mb-1">
            Favourite World Cup team
          </label>
          <select
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            {!TEAMS_2026.includes(team as (typeof TEAMS_2026)[number]) && team && (
              <option value={team}>{team}</option>
            )}
            {[...TEAMS_2026].sort((a, b) => a.localeCompare(b)).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          {err && (
            <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {err}
            </div>
          )}

          <button
            type="button"
            onClick={save}
            disabled={mutation.isPending}
            className="mt-4 w-full rounded-xl bg-amber-gradient text-background font-display font-bold py-2.5 disabled:opacity-60"
          >
            {mutation.isPending ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={mutation.isPending}
            className="mt-2 w-full text-center text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="mt-4 inline-flex items-baseline gap-2 rounded-xl bg-card border border-border px-4 py-2">
        <span className="text-xs uppercase tracking-widest text-muted-foreground">Total</span>
        <span className="font-score font-bold text-3xl text-amber-glow">{total}</span>
        <span className="text-xs text-muted-foreground">pts</span>
      </div>
      <StreakRow current={currentStreak} longest={longestStreak} />
    </header>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="font-display font-semibold text-lg mb-3">{title}</h2>
      {children}
    </section>
  );
}

function StatsGrid({
  stats,
}: {
  stats: {
    predicted: number;
    total: number;
    accuracy_pct: number | null;
    most_predicted_winner: { team: string; count: number } | null;
  };
}) {
  const pct = stats.total ? Math.round((stats.predicted / stats.total) * 100) : 0;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">
          Predictions submitted
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-score font-bold text-3xl text-amber-glow tabular-nums">
            {stats.predicted}
          </span>
          <span className="text-muted-foreground text-sm">/ {stats.total} matches</span>
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full bg-amber-gradient"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">
          Accuracy rate
        </div>
        <div className="mt-2 font-score font-bold text-3xl text-amber-glow tabular-nums">
          {stats.accuracy_pct == null ? "—" : `${stats.accuracy_pct}%`}
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          {stats.accuracy_pct == null
            ? "Wait for scored matches"
            : "of scored picks earned points"}
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">
          Most picked winner
        </div>
        {stats.most_predicted_winner ? (
          <div className="mt-2">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{teamFlag(stats.most_predicted_winner.team)}</span>
              <span className="font-display font-bold text-lg truncate">
                {stats.most_predicted_winner.team}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              picked in {stats.most_predicted_winner.count} of your predictions
            </div>
          </div>
        ) : (
          <div className="mt-2 text-sm text-muted-foreground">No winners predicted yet.</div>
        )}
      </div>
    </div>
  );
}

function StreakRow({ current, longest }: { current: number; longest: number }) {
  if (current === 0 && longest === 0) {
    return (
      <div className="mt-3 text-sm text-muted-foreground">No streak yet</div>
    );
  }
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <div className="inline-flex items-center gap-1.5 rounded-xl bg-card border border-border px-3 py-1.5 text-sm">
        <span aria-hidden>🔥</span>
        <span className="text-muted-foreground">Current streak:</span>
        <span className="font-bold text-amber-glow tabular-nums">{current}</span>
        <span className="text-muted-foreground">matchday{current === 1 ? "" : "s"}</span>
      </div>
      <div className="inline-flex items-center gap-1.5 rounded-xl bg-card border border-border px-3 py-1.5 text-sm">
        <span aria-hidden>⭐</span>
        <span className="text-muted-foreground">Longest streak:</span>
        <span className="font-bold text-amber-glow tabular-nums">{longest}</span>
        <span className="text-muted-foreground">matchday{longest === 1 ? "" : "s"}</span>
      </div>
    </div>
  );
}

function RoundBarChart({ data }: { data: PointsByRoundRow[] }) {
  const visible = data.filter((d) => d.total_points > 0).sort((a, b) => a.order - b.order);
  if (!visible.length) {
    return (
      <div className="rounded-2xl border border-border bg-card">
        <EmptyBall title="No points yet" sub="Once a matchday finishes, your points will appear here." />
      </div>
    );
  }
  const max = Math.max(1, ...visible.map((d) => d.total_points));
  const W = Math.max(320, visible.length * 80);
  const H = 200;
  const bw = (W - 32) / visible.length - 12;
  return (
    <div className="rounded-2xl border border-border bg-card p-4 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block">
        <defs>
          <linearGradient id="round-bar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.82 0.17 75)" />
            <stop offset="100%" stopColor="oklch(0.72 0.2 50)" />
          </linearGradient>
        </defs>
        {visible.map((d, i) => {
          const h = (d.total_points / max) * (H - 60);
          const x = 16 + i * (bw + 12);
          const y = H - 30 - h;
          return (
            <g key={d.round_key}>
              <rect x={x} y={y} width={bw} height={h} rx="6" fill="url(#round-bar)" />
              <text
                x={x + bw / 2}
                y={y - 6}
                textAnchor="middle"
                className="font-score"
                fontSize="13"
                fontWeight="700"
                fill="oklch(0.82 0.17 75)"
              >
                {d.total_points}
              </text>
              <text
                x={x + bw / 2}
                y={H - 10}
                textAnchor="middle"
                fontSize="10"
                fill="oklch(0.7 0.025 70)"
              >
                {d.round_label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function BarChart({ data }: { data: Score[] }) {
  if (!data.length) {
    return (
      <div className="rounded-2xl border border-border bg-card">
        <EmptyBall title="No points yet" sub="Once a matchday finishes, your points will appear here." />
      </div>
    );
  }
  const max = Math.max(1, ...data.map((d) => d.total_points));
  const W = Math.max(320, data.length * 56);
  const H = 200;
  const bw = (W - 32) / data.length - 12;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block">
        <defs>
          <linearGradient id="bar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.82 0.17 75)" />
            <stop offset="100%" stopColor="oklch(0.72 0.2 50)" />
          </linearGradient>
        </defs>
        {data.map((d, i) => {
          const h = (d.total_points / max) * (H - 60);
          const x = 16 + i * (bw + 12);
          const y = H - 30 - h;
          return (
            <g key={d.matchday_id}>
              <rect x={x} y={y} width={bw} height={h} rx="6" fill="url(#bar)" />
              <text
                x={x + bw / 2}
                y={y - 6}
                textAnchor="middle"
                className="font-score"
                fontSize="13"
                fontWeight="700"
                fill="oklch(0.82 0.17 75)"
              >
                {d.total_points}
              </text>
              <text
                x={x + bw / 2}
                y={H - 10}
                textAnchor="middle"
                fontSize="10"
                fill="oklch(0.7 0.025 70)"
              >
                {shortName(d.name)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function RankChart({ data }: { data: Score[] }) {
  const ranked = data.filter((d) => d.rank !== null) as Required<Score>[];
  if (!ranked.length) {
    return (
      <div className="rounded-2xl border border-border bg-card">
        <EmptyBall title="No rank yet" sub="Your position will appear after the first scored matchday." />
      </div>
    );
  }
  const maxRank = Math.max(...ranked.map((d) => d.rank as number));
  const W = Math.max(320, ranked.length * 56);
  const H = 200;
  const stepX = (W - 32) / Math.max(1, ranked.length - 1);

  const points = ranked.map((d, i) => {
    const x = 16 + i * stepX;
    // invert so rank 1 is at top
    const y = 20 + (((d.rank as number) - 1) / Math.max(1, maxRank - 1)) * (H - 60);
    return { x, y, d };
  });

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  return (
    <div className="rounded-2xl border border-border bg-card p-4 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block">
        <path d={path} fill="none" stroke="oklch(0.82 0.17 75)" strokeWidth="2.5" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="4" fill="oklch(0.82 0.17 75)" />
            <text
              x={p.x}
              y={p.y - 10}
              textAnchor="middle"
              className="font-score"
              fontSize="12"
              fontWeight="700"
              fill="oklch(0.97 0.012 80)"
            >
              #{p.d.rank}
            </text>
            <text
              x={p.x}
              y={H - 10}
              textAnchor="middle"
              fontSize="10"
              fill="oklch(0.7 0.025 70)"
            >
              {shortName(p.d.name)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function History({ groups }: { groups: HistoryGroup[] }) {
  if (!groups.length) {
    return (
      <div className="rounded-2xl border border-border bg-card">
        <EmptyBall
          title="No predictions yet"
          sub="Once you submit predictions, your history will appear here."
        />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.matchday_id} className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
            <span className="font-semibold text-sm">{g.matchday_name}</span>
            <span className="text-xs text-muted-foreground">
              {g.matches.reduce((a, m) => a + (m.points ?? 0), 0)} pts
            </span>
          </div>
          <div className="divide-y divide-border text-xs">
            {g.matches.map((m) => (
              <div key={m.match_id} className="px-4 py-2 flex items-center gap-2">
                <div className="flex-1 truncate">
                  {m.home_team} <span className="text-muted-foreground">vs</span> {m.away_team}
                </div>
                <div className="font-score tabular-nums w-14 text-center">
                  {m.pred_home}-{m.pred_away}
                  {m.booster && <span className="ml-1 text-primary">★</span>}
                </div>
                <div className="font-score tabular-nums w-14 text-center text-muted-foreground">
                  {m.is_final ? `${m.home_score}-${m.away_score}` : "—"}
                </div>
                <div className="w-12 text-right font-bold text-amber-glow">
                  {m.points ?? "—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function shortName(name: string) {
  return name.length > 10 ? name.slice(0, 9) + "…" : name;
}
