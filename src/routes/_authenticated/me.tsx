import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { EmptyBall } from "@/components/EmptyBall";
import { getMyHistoryFn, getMyMatchdayScoresFn } from "@/lib/game.functions";

export const Route = createFileRoute("/_authenticated/me")({
  head: () => ({ meta: [{ title: "Mi Marcador · Marcador" }] }),
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

  const total = (scores.data as Score[] | undefined)?.reduce((a, b) => a + b.total_points, 0) ?? 0;

  return (
    <AppShell displayName={me.profile?.display_name} isAdmin={me.is_admin}>
      <header className="mb-6">
        <div className="text-xs uppercase tracking-[0.2em] text-amber-glow font-semibold">
          Perfil
        </div>
        <h1 className="font-display font-bold text-3xl md:text-4xl mt-1">Mi Marcador</h1>
        <p className="text-sm text-muted-foreground mt-2">
          {me.profile?.display_name} · {me.profile?.country} · {me.profile?.favourite_team}
        </p>
        <div className="mt-4 inline-flex items-baseline gap-2 rounded-xl bg-card border border-border px-4 py-2">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">Total</span>
          <span className="font-score font-bold text-3xl text-amber-glow">{total}</span>
          <span className="text-xs text-muted-foreground">pts</span>
        </div>
      </header>

      <Section title="Puntos por jornada">
        <BarChart data={(scores.data as Score[] | undefined) ?? []} />
      </Section>

      <Section title="Ranking en el tiempo">
        <RankChart data={(scores.data as Score[] | undefined) ?? []} />
      </Section>

      <Section title="Historial de predicciones">
        <History groups={(history.data as HistoryGroup[] | undefined) ?? []} />
      </Section>
    </AppShell>
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

function BarChart({ data }: { data: Score[] }) {
  if (!data.length) {
    return (
      <div className="rounded-2xl border border-border bg-card">
        <EmptyBall title="Sin puntos todavía" sub="Cuando termine una jornada verás aquí tus puntos." />
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
        <EmptyBall title="Sin ranking todavía" sub="Tu posición aparecerá tras la primera jornada calculada." />
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
          title="Aún no has jugado"
          sub="Cuando envíes predicciones, su historial aparecerá aquí."
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
