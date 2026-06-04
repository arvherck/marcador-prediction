import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { meFn } from "@/lib/auth.functions";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    try {
      const me = await meFn();
      if (me) {
        if (!me.profile) throw redirect({ to: "/onboarding" });
        throw redirect({ to: "/play" });
      }
    } catch (e) {
      // re-throw redirects
      if (e && typeof e === "object" && "isRedirect" in e) throw e;
    }
  },
  head: () => {
    const url = "https://marcador-prediction.lovable.app/";
    const image = "https://marcador-prediction.lovable.app/og-marcador.jpg";
    const title = "Marcador — World Cup 2026 Predictions";
    const description =
      "Predict every World Cup 2026 match, boost a call, and climb the global scoreboard. Six fixtures a matchday, points for results and exact scores.";
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
              The <span className="text-amber-glow">scoreboard</span> for every prediction.
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-md">
              Six matches each matchday. Predict the exact score and the first team to find the net.
              Double your call with a booster. Climb the table.
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

            <div className="mt-10 grid grid-cols-3 gap-4 max-w-md">
              <Stat label="Per result" value="+3" />
              <Stat label="Per score" value="+2" />
              <Stat label="Booster" value="2×" />
            </div>
          </div>

          <div className="relative">
            <div className="rounded-2xl bg-card border border-border p-6 shadow-card">
              <div className="flex items-center justify-between text-xs uppercase tracking-widest text-muted-foreground">
                <span>Matchday 1</span>
                <span className="text-primary">Live preview</span>
              </div>
              <div className="mt-4 space-y-3">
                <MiniMatch home="Mexico" away="Canada" hs={2} as={1} />
                <MiniMatch home="USA" away="Argentina" hs={1} as={2} boost />
                <MiniMatch home="Brazil" away="Spain" hs={3} as={2} />
              </div>
              <div className="mt-5 pt-5 border-t border-border flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Your projection</span>
                <span className="font-score text-2xl text-amber-glow">+18 pts</span>
              </div>
            </div>
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

function MiniMatch({
  home,
  away,
  hs,
  as,
  boost,
}: {
  home: string;
  away: string;
  hs: number;
  as: number;
  boost?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-background/60 border border-border px-3 py-2.5">
      <span className="text-sm font-medium truncate">{home}</span>
      <div className="flex items-center gap-2">
        <span className="font-score text-lg">{hs}</span>
        <span className="text-muted-foreground text-xs">·</span>
        <span className="font-score text-lg">{as}</span>
        {boost && (
          <span className="ml-2 rounded-md bg-primary/15 text-primary text-[10px] font-bold px-1.5 py-0.5">
            2×
          </span>
        )}
      </div>
      <span className="text-sm font-medium truncate text-right">{away}</span>
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
