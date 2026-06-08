import { createFileRoute, Link } from "@tanstack/react-router";
import { FeedbackButton } from "@/components/feedback/FeedbackButton";

export const Route = createFileRoute("/rules")({
  head: () => {
    const url = "https://marcador-prediction.lovable.app/rules";
    const title = "Rules & How to Play — Marcador";
    const description =
      "Full rules for Marcador: scoring system, round multipliers, 2× booster, underdog bonus, tournament winner, and leaderboards.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { property: "og:type", content: "article" },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: RulesPage,
});

const TOC: { id: string; label: string }[] = [
  { id: "overview", label: "1. Overview" },
  { id: "predictions", label: "2. How to make predictions" },
  { id: "scoring", label: "3. Scoring system" },
  { id: "multipliers", label: "4. Round multipliers" },
  { id: "booster", label: "5. The 2× Booster" },
  { id: "underdog", label: "6. Underdog bonus" },
  { id: "winner", label: "7. Tournament winner" },
  { id: "consistency", label: "8. Consistency rules" },
  { id: "leaderboard", label: "9. Leaderboard & Ligas" },
  { id: "general", label: "10. General rules" },
  { id: "fairplay", label: "11. Fair play" },
];

function RulesPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="px-6 py-5 border-b border-border">
        <div className="max-w-6xl mx-auto w-full flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="size-9 rounded-lg bg-amber-gradient flex items-center justify-center shadow-glow">
              <span className="font-score font-bold text-primary-foreground text-base">M</span>
            </div>
            <span className="font-display font-bold text-lg tracking-tight">Marcador</span>
          </Link>
          <Link
            to="/auth"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-10">
        <div className="text-xs uppercase tracking-[0.2em] text-amber-glow font-semibold">
          Marcador
        </div>
        <h1 className="font-display font-bold text-4xl md:text-5xl mt-2 leading-tight">
          Rules & how to play
        </h1>
        <p className="mt-3 text-muted-foreground max-w-2xl">
          Everything you need to know to predict, score, and climb the leaderboard.
        </p>

        <div className="mt-10 grid md:grid-cols-[220px_1fr] gap-10">
          <aside className="md:sticky md:top-6 md:self-start">
            <nav className="rounded-xl border border-border bg-card/60 p-4 text-sm">
              <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
                Contents
              </div>
              <ul className="space-y-2">
                {TOC.map((t) => (
                  <li key={t.id}>
                    <a
                      href={`#${t.id}`}
                      className="text-muted-foreground hover:text-amber-glow transition-colors"
                    >
                      {t.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          <article className="prose-rules space-y-12">
            <Section id="overview" title="1. Overview">
              <p>
                Marcador is a free-to-play World Cup 2026 prediction game. Predict the scoreline
                and first team to score for any match in the tournament to earn points and climb
                the leaderboard.
              </p>
            </Section>

            <Section id="predictions" title="2. How to make predictions">
              <ul>
                <li>You can predict any match where the teams are confirmed and the match has not yet kicked off.</li>
                <li>Predict the home team score, away team score, and which team scores first.</li>
                <li>Predictions are saved automatically as you type.</li>
                <li>You can change your prediction at any time until kickoff.</li>
                <li>Once the match kicks off, your prediction is locked and cannot be changed.</li>
              </ul>
            </Section>

            <Section id="scoring" title="3. Scoring system">
              <RulesTable
                head={["Points category", "Points awarded"]}
                rows={[
                  ["Correct result", "+3 points"],
                  ["Correct home goals", "+2 points"],
                  ["Correct away goals", "+2 points"],
                  ["Correct goal difference", "+3 points"],
                  ["Correct first scorer", "+3 points"],
                  ["Underdog bonus", "+5 points"],
                  ["Max per match (group)", "13 points"],
                ]}
              />

              <h3>What counts as a correct result?</h3>
              <ul>
                <li>A correct result means predicting the right winner, or correctly predicting a draw.</li>
                <li>For knockout matches that go to extra time: the result after 120 minutes counts.</li>
                <li>For knockout matches decided by penalties: the match is counted as a draw for scoring purposes.</li>
              </ul>

              <h3>Goal difference explained</h3>
              <p>
                Goal difference is home goals minus away goals. Example: if you predict 2–0 and
                the actual result is 3–1, you predicted the goal difference correctly (+2 in
                both cases) and earn the +3 points.
              </p>
            </Section>

            <Section id="multipliers" title="4. Round multipliers">
              <p>
                To keep the competition alive throughout the tournament, points are multiplied
                in knockout rounds:
              </p>
              <RulesTable
                head={["Round", "Multiplier", "Max points / match"]}
                rows={[
                  ["Group Stage", "×1", "13"],
                  ["Round of 32", "×2", "26"],
                  ["Round of 16", "×3", "39"],
                  ["Quarterfinals", "×4", "52"],
                  ["Third Place", "×4", "52"],
                  ["Semifinals", "×5", "65"],
                  ["Final", "×6", "78"],
                ]}
              />
              <ul>
                <li>The multiplier applies to all base points (result, goals, goal difference, first scorer).</li>
                <li>The underdog bonus (+5) is <strong>not</strong> multiplied.</li>
                <li>The booster is applied <strong>after</strong> the multiplier.</li>
              </ul>
            </Section>

            <Section id="booster" title="5. The 2× Booster">
              <ul>
                <li>Each matchday, you have one 2× booster to use.</li>
                <li>Apply it to any one match to double your points for that fixture.</li>
                <li>The booster applies after the round multiplier.</li>
              </ul>
              <Callout>
                Example: correct exact score in the Final = 13 × 6 (Final multiplier) × 2
                (booster) = <span className="text-amber-glow font-semibold">156 points</span>.
              </Callout>
              <ul>
                <li>The booster locks when the match you applied it to kicks off — choose carefully!</li>
                <li>If you do not use your booster in a matchday, it does not carry over.</li>
              </ul>
            </Section>

            <Section id="underdog" title="6. Underdog bonus">
              <ul>
                <li>
                  If you correctly predict an exact scoreline (home <em>and</em> away goals both
                  correct) <em>and</em> fewer than 10% of other players predicted the same
                  scoreline for that match, you earn +5 bonus points.
                </li>
                <li>The underdog bonus is calculated after all predictions for that match are collected.</li>
                <li>The underdog bonus is <strong>not</strong> multiplied by the round multiplier — it is always a flat +5.</li>
                <li>The underdog bonus stacks with all other points, including the booster.</li>
              </ul>
            </Section>

            <Section id="winner" title="7. Tournament winner prediction">
              <ul>
                <li>Before the tournament's first match (June 11, 2026), you can predict which team will win the World Cup.</li>
                <li>If your prediction is correct, you earn +50 bonus points added to your overall total.</li>
                <li>Tournament winner predictions lock when the group stage begins.</li>
                <li>You can only make one tournament winner prediction and it cannot be changed once locked.</li>
              </ul>
            </Section>

            <Section id="consistency" title="8. Consistency rules">
              <p>Your scoreline and first scorer predictions must be logically consistent:</p>
              <ul>
                <li>If you predict 0–0, the first scorer must be set to "No goal".</li>
                <li>If you select a team as first scorer, that team must have at least 1 goal in your prediction.</li>
                <li>The app will automatically correct inconsistencies as you type.</li>
              </ul>
            </Section>

            <Section id="leaderboard" title="9. Leaderboard and Ligas">
              <h3>Overall leaderboard</h3>
              <p>
                All users are ranked by total points earned across all matches and all
                matchdays. The leaderboard updates after each matchday is scored.
              </p>
              <h3>Ligas (private leagues)</h3>
              <ul>
                <li>Create a private liga and invite friends with a unique join code (format: MRC-XXXX).</li>
                <li>You can create up to 3 ligas.</li>
                <li>You can join as many ligas as you like.</li>
                <li>Each liga has its own leaderboard showing only its members' scores.</li>
              </ul>
            </Section>

            <Section id="general" title="10. General rules">
              <ul>
                <li>Marcador is free to play — no purchase required.</li>
                <li>One account per person.</li>
                <li>Predictions must be submitted before kickoff.</li>
                <li>Results are entered by the Marcador admin after each match.</li>
                <li>Points are calculated and leaderboards updated after each matchday.</li>
                <li>In the event of a dispute, the admin's decision is final.</li>
                <li>Marcador is not affiliated with FIFA or any national football association.</li>
              </ul>
            </Section>

            <Section id="fairplay" title="11. Fair play">
              <ul>
                <li>Creating multiple accounts to gain an unfair advantage is not permitted.</li>
                <li>Any account found cheating will be removed.</li>
                <li>The spirit of the game is friendly competition — please play fair and have fun!</li>
              </ul>
            </Section>

            <div className="pt-8 mt-8 border-t border-border text-sm text-muted-foreground space-y-2">
              <div>Last updated: June 2026</div>
              <div>
                Questions? Reach the admin from the in-app Support link.
              </div>
              <div className="pt-3">
                <Link
                  to="/play"
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-gradient px-5 py-2.5 font-semibold text-primary-foreground shadow-glow hover:opacity-95 transition"
                >
                  Ready to predict? → Start playing
                </Link>
              </div>
            </div>
          </article>
        </div>
      </main>

      <footer className="px-6 py-6 text-center text-xs text-muted-foreground border-t border-border">
        <div className="flex items-center justify-center gap-3">
          <span>Marcador · the scoreboard</span>
          <span aria-hidden>·</span>
          <Link to="/" className="hover:text-amber-glow transition-colors">Home</Link>
          <span aria-hidden>·</span>
          <FeedbackButton />
        </div>
      </footer>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="font-display font-bold text-2xl md:text-3xl text-amber-glow mb-4">{title}</h2>
      <div className="space-y-3 text-sm md:text-base text-muted-foreground leading-relaxed [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1.5 [&_strong]:text-foreground [&_h3]:font-display [&_h3]:font-bold [&_h3]:text-lg [&_h3]:text-foreground [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:leading-relaxed">
        {children}
      </div>
    </section>
  );
}

function RulesTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="rounded-xl border border-border overflow-hidden my-4">
      <table className="w-full text-sm">
        <thead className="bg-card/60 text-xs uppercase tracking-widest text-muted-foreground">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-2.5 text-left font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border bg-background/30">
              {r.map((c, j) => (
                <td
                  key={j}
                  className={`px-4 py-2.5 ${j === 0 ? "text-foreground" : "tabular-nums text-amber-glow font-semibold"}`}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-amber-glow/30 bg-amber-glow/5 px-4 py-3 my-4 text-sm text-foreground">
      {children}
    </div>
  );
}
