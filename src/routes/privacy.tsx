import { createFileRoute, Link } from "@tanstack/react-router";
import { FeedbackButton } from "@/components/feedback/FeedbackButton";
import { CookieNotice } from "@/components/CookieNotice";

export const Route = createFileRoute("/privacy")({
  head: () => {
    const url = "https://marcador-prediction.lovable.app/privacy";
    const title = "Privacy Policy — Marcador";
    const description =
      "How Marcador handles your personal data: what we collect, why, how long we keep it, and your GDPR rights.";
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
  component: PrivacyPage,
});

const TOC: { id: string; label: string }[] = [
  { id: "who", label: "1. Who we are" },
  { id: "data", label: "2. What data we collect" },
  { id: "why", label: "3. Why & legal basis" },
  { id: "retention", label: "4. How long we keep it" },
  { id: "sharing", label: "5. Who we share with" },
  { id: "rights", label: "6. Your GDPR rights" },
  { id: "cookies", label: "7. Cookies & local storage" },
  { id: "children", label: "8. Children" },
  { id: "changes", label: "9. Changes to this policy" },
  { id: "contact", label: "10. Contact" },
];

function PrivacyPage() {
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
          Privacy Policy
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: June 2026</p>

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

          <article className="prose-privacy space-y-12">
            <Section id="who" title="1. Who we are">
              <p>
                Marcador is a free World Cup 2026 prediction game. This privacy policy
                explains how we handle your personal data when you use the app at{" "}
                <a
                  href="https://marcador-prediction.lovable.app"
                  className="text-amber-glow hover:underline"
                >
                  marcador-prediction.lovable.app
                </a>
                .
              </p>
              <p>
                For questions about your data, contact us via the feedback form in the app.
              </p>
            </Section>

            <Section id="data" title="2. What data we collect">
              <h3>When you create an account</h3>
              <ul>
                <li>Email address (via our authentication provider).</li>
                <li>Display name (you choose this).</li>
                <li>Country (you provide this).</li>
                <li>Favourite World Cup team (you provide this).</li>
              </ul>

              <h3>When you use the app</h3>
              <ul>
                <li>Your match predictions (scorelines, first scorer selections).</li>
                <li>Your points and leaderboard rankings.</li>
                <li>Your private league memberships.</li>
                <li>Your tournament winner prediction.</li>
                <li>Feedback you submit voluntarily.</li>
              </ul>

              <h3>Automatically collected</h3>
              <ul>
                <li>
                  Session tokens stored in your browser's localStorage to keep you
                  logged in.
                </li>
                <li>
                  IP address (processed by our backend infrastructure provider — we do
                  not store or access this directly).
                </li>
              </ul>

              <h3>We do NOT collect</h3>
              <ul>
                <li>Payment card details (handled entirely by Stripe if you donate).</li>
                <li>Location data beyond the country you provide.</li>
                <li>Any data from third-party tracking or advertising tools.</li>
              </ul>
            </Section>

            <Section id="why" title="3. Why we collect it and legal basis">
              <ul>
                <li>
                  <strong>Email address:</strong> To create and manage your account, and
                  to send you score notifications if you opt in.{" "}
                  <em>Legal basis: Contract (necessary to provide the service).</em>
                </li>
                <li>
                  <strong>Display name, country, team:</strong> To personalise your
                  experience and show your profile on leaderboards.{" "}
                  <em>Legal basis: Contract.</em>
                </li>
                <li>
                  <strong>Predictions and scores:</strong> To run the game, calculate
                  points and display leaderboards. <em>Legal basis: Contract.</em>
                </li>
                <li>
                  <strong>Feedback:</strong> To improve the app.{" "}
                  <em>Legal basis: Legitimate interest.</em>
                </li>
              </ul>
            </Section>

            <Section id="retention" title="4. How long we keep your data">
              <p>
                Your data is kept for as long as your account is active. If you delete
                your account, all personal data is deleted immediately and permanently.
              </p>
              <p>
                We will also delete inactive accounts (no login for 6+ months) after
                January 2027, following the end of the 2026 World Cup tournament.
              </p>
              <p>
                Anonymised prediction data (with no link to your identity) may be retained
                for statistical purposes.
              </p>
            </Section>

            <Section id="sharing" title="5. Who we share your data with">
              <p>We do not sell your data. We share it only with:</p>
              <ul>
                <li>
                  <strong>Supabase</strong> (
                  <a
                    href="https://supabase.com"
                    className="text-amber-glow hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    supabase.com
                  </a>
                  ): Our database and authentication provider. They host and process your
                  data on our behalf. Supabase is GDPR compliant and their data processing
                  agreement is available at{" "}
                  <a
                    href="https://supabase.com/privacy"
                    className="text-amber-glow hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    supabase.com/privacy
                  </a>
                  .
                </li>
                <li>
                  <strong>Stripe</strong> (
                  <a
                    href="https://stripe.com"
                    className="text-amber-glow hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    stripe.com
                  </a>
                  ): If you make a donation, your payment is processed by Stripe. We
                  receive only confirmation that a payment was made — we never see your
                  card details. Stripe's privacy policy is at{" "}
                  <a
                    href="https://stripe.com/privacy"
                    className="text-amber-glow hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    stripe.com/privacy
                  </a>
                  .
                </li>
              </ul>
              <p>No other third parties receive your personal data.</p>
            </Section>

            <Section id="rights" title="6. Your rights under GDPR">
              <p>If you are based in the EU or UK, you have the following rights:</p>
              <ul>
                <li>
                  <strong>Right to access:</strong> Request a copy of all personal data we
                  hold about you.
                </li>
                <li>
                  <strong>Right to correction:</strong> Ask us to correct inaccurate data
                  (or update it yourself in your profile settings).
                </li>
                <li>
                  <strong>Right to deletion:</strong> Delete your account and all
                  associated data at any time from your Mi Marcador profile page.
                </li>
                <li>
                  <strong>Right to portability:</strong> Request a copy of your data in a
                  machine-readable format.
                </li>
                <li>
                  <strong>Right to object:</strong> Object to us processing your data for
                  legitimate interest purposes.
                </li>
              </ul>
              <p>
                To exercise any of these rights, use the feedback form in the app or
                contact us through it.
              </p>
            </Section>

            <Section id="cookies" title="7. Cookies and local storage">
              <p>
                Marcador uses your browser's localStorage to store your login session
                token. This is essential for the app to work — without it you would be
                logged out every time you close the browser.
              </p>
              <p>
                We do not use advertising cookies, tracking cookies, or analytics tools.
              </p>
            </Section>

            <Section id="children" title="8. Children">
              <p>
                Marcador is intended for users aged 18 and over. We do not knowingly
                collect data from anyone under 18. If you believe a minor has created an
                account, please contact us via the feedback form.
              </p>
            </Section>

            <Section id="changes" title="9. Changes to this policy">
              <p>
                If we make significant changes to this policy, we will notify users via a
                banner in the app. The "last updated" date at the top of this page will
                always reflect the most recent version.
              </p>
            </Section>

            <Section id="contact" title="10. Contact">
              <p>
                For any privacy-related questions or to exercise your rights, please use
                the feedback form in the app and select "Question" as the category. We
                aim to respond within 30 days.
              </p>
            </Section>

            <div className="pt-6 border-t border-border text-sm text-muted-foreground flex items-center justify-between flex-wrap gap-3">
              <span>Last updated: June 2026</span>
              <Link to="/" className="text-amber-glow hover:underline">
                ← Back to Marcador
              </Link>
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
          <Link to="/rules" className="hover:text-amber-glow transition-colors">Rules</Link>
          <span aria-hidden>·</span>
          <FeedbackButton />
        </div>
      </footer>
      <CookieNotice />
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="font-display font-bold text-2xl md:text-3xl text-amber-glow mb-4">{title}</h2>
      <div className="space-y-3 text-sm md:text-base text-muted-foreground leading-relaxed [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1.5 [&_strong]:text-foreground [&_em]:text-foreground/80 [&_h3]:font-display [&_h3]:font-bold [&_h3]:text-lg [&_h3]:text-foreground [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:leading-relaxed">
        {children}
      </div>
    </section>
  );
}
