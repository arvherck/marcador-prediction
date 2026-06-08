import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Calendar, HelpCircle, Trophy } from "lucide-react";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { AppShell } from "@/components/AppShell";
import { EmptyBall } from "@/components/EmptyBall";
import { TournamentBanner } from "@/components/TournamentBanner";
import { useGuestGate } from "@/components/GuestGate";
import { useGuest } from "@/lib/guest";
import { ByDateView } from "@/components/play/ByDateView";
import { ByMatchdayView } from "@/components/play/ByMatchdayView";
import { ClosingSoonBanner } from "@/components/play/ClosingSoonBanner";
import { HowToPlayModal } from "@/components/play/HowToPlayModal";
import { UiTestPreviewBanner } from "@/components/play/UiTestPreviewBanner";

import {
  getAllMatches,
  getAllMatchesPublic,
  getMatchdaysWithProgress,
  getPlayOverview,
} from "@/lib/game.functions";
import { supabase } from "@/integrations/supabase/client";

const searchSchema = z.object({
  view: fallback(z.enum(["date", "matchday"]), "date").default("date"),
  md: fallback(z.number().int().optional(), undefined).optional(),
});

export const Route = createFileRoute("/_authenticated/play")({
  validateSearch: zodValidator(searchSchema),
  head: () => {
    const url = "https://marcador-prediction.lovable.app/play";
    const title = "Predict every match · Marcador";
    const description =
      "Predict every World Cup 2026 match. Exact scores, first scorer, and one 2× booster per matchday.";
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
  component: PlayPage,
});

function PlayPage() {
  const { me } = Route.useRouteContext();
  const { view, md } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const guest = useGuest();
  const guestGate = useGuestGate();
  const qc = useQueryClient();
  const [howToPlayOpen, setHowToPlayOpen] = useState(false);


  const matchesQ = useQuery({
    queryKey: ["all-matches", guest ? "guest" : me.id],
    queryFn: async () => {
      if (guest) return getAllMatchesPublic();
      const { data } = await supabase.auth.getSession();
      if (!data.session) return [];
      return getAllMatches();
    },
  });

  const progressQ = useQuery({
    queryKey: ["matchdays-progress", guest ? "guest" : me.id],
    queryFn: async () => {
      if (guest) return [];
      return getMatchdaysWithProgress();
    },
    enabled: !guest,
  });

  const overviewQ = useQuery({
    queryKey: ["play-overview", me.id],
    queryFn: () => getPlayOverview(),
    enabled: !guest,
  });

  // Realtime: notify on team confirmation
  useEffect(() => {
    if (guest) return;
    const ch = supabase
      .channel("matches-confirmed")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "matches" },
        (payload) => {
          const oldRow = payload.old as { teams_confirmed?: boolean } | null;
          const newRow = payload.new as {
            teams_confirmed?: boolean;
            home_team?: string;
            away_team?: string;
          } | null;
          if (oldRow?.teams_confirmed === false && newRow?.teams_confirmed === true) {
            toast(`🔓 ${newRow.home_team} vs ${newRow.away_team} — now open for predictions!`);
            qc.invalidateQueries({ queryKey: ["all-matches"] });
            qc.invalidateQueries({ queryKey: ["matchdays-progress"] });
            qc.invalidateQueries({ queryKey: ["play-overview"] });
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [qc, guest]);

  const matches = matchesQ.data ?? [];
  const matchdays = progressQ.data ?? [];

  const guestAction = () => guestGate.setOpen(true);

  const headerStats = useMemo(() => {
    if (guest || !overviewQ.data) return null;
    return overviewQ.data;
  }, [overviewQ.data, guest]);

  return (
    <AppShell displayName={me.profile?.display_name} isAdmin={me.is_admin}>
      <UiTestPreviewBanner isAdmin={!!me.is_admin} />
      {!guest && (

        <ClosingSoonBanner
          matches={matches}
          view={view}
          onSwitchToDate={(matchId) => {
            navigate({
              search: (p: z.infer<typeof searchSchema>) => ({
                ...p,
                view: "date" as const,
              }),
            });
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                document
                  .getElementById(`match-${matchId}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "center" });
              });
            });
          }}
        />
      )}
      {!guest && <TournamentBanner />}
      <header className="mb-5 relative">
        <div className="text-xs uppercase tracking-[0.2em] text-amber-glow font-semibold">
          Marcador
        </div>
        <h1 className="font-display font-bold text-3xl md:text-4xl mt-1 leading-tight">
          Predict every match
        </h1>
        {headerStats && (
          <p className="text-sm text-muted-foreground mt-2">
            <span className="font-bold text-foreground">{headerStats.predicted}</span> prediction
            {headerStats.predicted === 1 ? "" : "s"} submitted ·{" "}
            <span className="font-bold text-foreground">{headerStats.remaining}</span> match
            {headerStats.remaining === 1 ? "" : "es"} remaining
          </p>
        )}
        {guest && (
          <p className="text-sm text-muted-foreground mt-2">
            Browse every fixture. Sign up to lock in your predictions.
          </p>
        )}
        <button
          type="button"
          onClick={() => setHowToPlayOpen(true)}
          aria-label="How to play"
          className="absolute top-0 right-0 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-amber-glow transition-colors"
        >
          <HelpCircle size={14} />
          <span className="hidden sm:inline">How to play</span>
        </button>
      </header>

      <HowToPlayModal open={howToPlayOpen} onOpenChange={setHowToPlayOpen} />


      <HowPointsWork />


      <div className="mb-4 inline-flex rounded-xl border border-border bg-card p-1 text-xs font-bold">
        <button
          onClick={() => navigate({ search: (p: z.infer<typeof searchSchema>) => ({ ...p, view: "date" as const }) })}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
            view === "date"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Calendar size={14} /> By date
        </button>
        <button
          onClick={() => navigate({ search: (p: z.infer<typeof searchSchema>) => ({ ...p, view: "matchday" as const }) })}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
            view === "matchday"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Trophy size={14} /> By matchday
        </button>
      </div>

      {matchesQ.isLoading && <SkeletonList />}
      {!matchesQ.isLoading && matches.length === 0 && (
        <EmptyBall
          title="No matches yet"
          sub="Fixtures haven't been published. Check back soon."
        />
      )}

      {!matchesQ.isLoading && matches.length > 0 && view === "date" && (
        <ByDateView
          matches={matches}
          guest={guest}
          onGuestAction={guestAction}
        />
      )}

      {!matchesQ.isLoading && matches.length > 0 && view === "matchday" && (
        <ByMatchdayView
          matchdays={
            matchdays.length
              ? matchdays
              : // synthesize a minimal list for guests from the matches we have
                synthesizeMatchdays(matches)
          }
          matches={matches}
          activeMd={md ?? null}
          onActive={(id) => navigate({ search: (p: z.infer<typeof searchSchema>) => ({ ...p, md: id }) })}
          guest={guest}
          onGuestAction={guestAction}
        />
      )}

      <ScoringLegend />
      {guestGate.modal}
    </AppShell>
  );
}

function synthesizeMatchdays(
  matches: Array<{ matchday_id: number; kickoff_at: string }>,
) {
  const m = new Map<number, { id: number; name: string; starts_at: string; is_scored: boolean; total: number; available: number; predicted: number }>();
  for (const x of matches) {
    const row = m.get(x.matchday_id) ?? {
      id: x.matchday_id,
      name: `Matchday ${x.matchday_id}`,
      starts_at: x.kickoff_at,
      is_scored: false,
      total: 0,
      available: 0,
      predicted: 0,
    };
    row.total += 1;
    row.available += 1;
    if (x.kickoff_at < row.starts_at) row.starts_at = x.kickoff_at;
    m.set(x.matchday_id, row);
  }
  return Array.from(m.values()).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

function HowPointsWork() {
  const rounds: Array<[string, number]> = [
    ["Group Stage", 1],
    ["Round of 32", 2],
    ["Round of 16", 3],
    ["Quarterfinals", 4],
    ["Semifinals", 5],
    ["Final", 6],
  ];
  return (
    <details className="mb-5 rounded-2xl border border-border bg-card/60 group">
      <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between text-sm font-semibold">
        <span>
          <span className="text-amber-glow">ℹ️ How points work</span>{" "}
          <span className="text-muted-foreground font-normal text-xs">
            — knockout rounds are worth more
          </span>
        </span>
        <span className="text-muted-foreground text-xs group-open:rotate-180 transition">▾</span>
      </summary>
      <div className="px-4 pb-4 pt-1 text-sm space-y-2">
        <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5">
          {rounds.map(([label, mul]) => {
            const cap = 13 * mul;
            return (
              <div key={label} className="contents">
                <div className="flex items-center gap-2">
                  {mul > 1 && (
                    <span className="rounded-md bg-amber-glow/15 text-amber-glow px-1.5 py-0.5 text-[10px] font-bold tabular-nums">
                      {mul}×
                    </span>
                  )}
                  <span>{label}</span>
                </div>
                <span className="text-muted-foreground tabular-nums">
                  up to {cap} pts/match
                </span>
              </div>
            );
          })}
        </div>
        <div className="pt-2 border-t border-border space-y-1 text-xs text-muted-foreground">
          <div>
            <span className="font-bold text-foreground">+ Booster:</span> doubles all points for one
            match per matchday (applied after the round multiplier).
          </div>
          <div>
            <span className="font-bold text-foreground">+ Underdog bonus:</span> flat +5 for rare
            exact scorelines (predicted by &lt;10% of users). Not multiplied.
          </div>
        </div>
      </div>
    </details>
  );
}

function ScoringLegend() {
  const items = [
    ["+3", "Correct result"],
    ["+2", "Correct home goals"],
    ["+2", "Correct away goals"],
    ["+3", "Correct goal difference"],
    ["+3", "Correct first scorer"],
    ["+5", "Underdog bonus (<10%, flat)"],
    ["2×", "Booster multiplier"],
  ];
  return (
    <div className="mt-8 rounded-2xl border border-border bg-card/60 p-4">
      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">
        Scoring
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        {items.map(([pts, label]) => (
          <div key={label} className="flex items-center gap-2">
            <span className="font-score font-bold text-primary w-9 tabular-nums">{pts}</span>
            <span className="text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="rounded-2xl border border-border bg-card h-40 animate-pulse" />
      ))}
    </div>
  );
}
