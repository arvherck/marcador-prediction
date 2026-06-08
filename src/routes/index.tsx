import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getUpcomingMatchesPublic } from "@/lib/game.functions";


export const Route = createFileRoute("/")({

  head: () => {
    const url = "https://marcador-prediction.lovable.app/";
    const image = "https://marcador-prediction.lovable.app/og-marcador.jpg";
    const title = "Marcador — World Cup 2026 Predictions";
    const description =
      "Predict every World Cup 2026 match. Exact scores, first scorer, and a 2× booster per matchday. Climb the global scoreboard.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { property: "og:type", content: "website" },
        { property: "og:image", content: image },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { name: "twitter:image", content: image },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "Marcador",
            url,
            description,
          }),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "Marcador",
            url,
            logo: image,
            description:
              "Marcador is the scoreboard for World Cup 2026 predictions — predict matches, run private leagues, and track a global ranking.",
          }),
        },
      ],
    };
  },
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-6 py-5 flex items-center justify-between max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <Logo />
          <span className="font-display font-bold text-lg tracking-tight">Marcador</span>
        </div>
        <Link
          to="/auth"
          className="text-sm font-medium text-muted-foreground hover:text-foreground transition"
        >
          Sign in
        </Link>
      </header>

      <main className="flex-1 flex items-center">
        <div className="max-w-6xl mx-auto w-full px-6 py-12 grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground mb-6">
              <span className="size-1.5 rounded-full bg-primary animate-pulse" />
              World Cup 2026 · Canada · Mexico · USA
            </div>
            <h1 className="font-display font-bold text-5xl md:text-7xl leading-[1.02] tracking-tight">
              Predict every match. <span className="text-amber-glow">Every matchday.</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-md">
              Call the exact score and the first team to find the net for every World Cup 2026
              fixture. Double a pick with a booster. Climb the table.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/auth"
                className="inline-flex items-center justify-center rounded-xl bg-amber-gradient px-6 py-3 font-semibold shadow-glow hover:opacity-95 transition"
              >
                Start predicting
              </Link>
              <Link
                to="/auth"
                className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-6 py-3 font-semibold hover:bg-secondary transition"
              >
                I have an account
              </Link>
            </div>
            <div className="mt-4">
              <Link
                to="/rules"
                className="text-sm text-muted-foreground hover:text-amber-glow transition"
              >
                How does it work? →
              </Link>
            </div>


            <div className="mt-10 grid grid-cols-3 gap-4 max-w-md">
              <Stat label="Per result" value="+3" />
              <Stat label="Per score" value="+2" />
              <Stat label="Booster" value="2×" />
            </div>
          </div>

          <div className="relative">
            <UpcomingPreview />
            <div className="absolute -inset-6 -z-10 bg-amber-gradient opacity-20 blur-3xl rounded-full" />
          </div>
        </div>
      </main>

      <footer className="px-6 py-6 text-center text-xs text-muted-foreground">
        Marcador · the scoreboard
      </footer>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-3">
      <div className="font-score text-2xl text-amber-glow">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function UpcomingPreview() {
  const q = useQuery({
    queryKey: ["upcoming-public"],
    queryFn: () => getUpcomingMatchesPublic(),
    staleTime: 60_000,
  });
  const matches = q.data ?? [];
  return (
    <div className="rounded-2xl bg-card border border-border p-6 shadow-card">
      <div className="flex items-center justify-between text-xs uppercase tracking-widest text-muted-foreground">
        <span>Next up</span>
        <span className="text-primary">Live preview</span>
      </div>
      <div className="mt-4 space-y-3 min-h-[156px]">
        {q.isLoading && (
          <>
            <div className="h-12 rounded-xl bg-background/60 border border-border animate-pulse" />
            <div className="h-12 rounded-xl bg-background/60 border border-border animate-pulse" />
            <div className="h-12 rounded-xl bg-background/60 border border-border animate-pulse" />
          </>
        )}
        {!q.isLoading && matches.length === 0 && (
          <div className="text-sm text-muted-foreground">
            Fixtures coming soon.
          </div>
        )}
        {matches.map((m) => (
          <MiniMatch key={m.id} match={m} />
        ))}
      </div>
      <div className="mt-5 pt-5 border-t border-border flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Predict to score</span>
        <span className="font-score text-2xl text-amber-glow">+3 / +2</span>
      </div>
    </div>
  );
}

function MiniMatch({
  match,
}: {
  match: {
    home_team: string;
    away_team: string;
    kickoff_at: string;
    stadium: string | null;
    city: string | null;
  };
}) {
  const ko = new Date(match.kickoff_at);
  const when = ko.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const venue = [match.stadium, match.city].filter(Boolean).join(" · ");
  return (
    <div className="rounded-xl bg-background/60 border border-border px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium truncate">{match.home_team}</span>
        <span className="text-muted-foreground text-xs shrink-0">vs</span>
        <span className="text-sm font-medium truncate text-right">{match.away_team}</span>
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="truncate">{venue}</span>
        <span className="shrink-0 tabular-nums">{when}</span>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <div className="size-9 rounded-lg bg-amber-gradient flex items-center justify-center shadow-glow">
      <span className="font-score font-bold text-primary-foreground text-base">M</span>
    </div>
  );
}
