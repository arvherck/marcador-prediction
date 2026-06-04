import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { completeOnboardingFn } from "@/lib/auth.functions";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => {
    const url = "https://marcador-prediction.lovable.app/onboarding";
    const title = "Set up your profile · Marcador";
    const description =
      "Finish your Marcador profile — choose a display name, your country, and your favourite World Cup 2026 team before you start predicting.";
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
  component: OnboardingPage,
});

const TEAMS = [
  "Argentina","Australia","Belgium","Brazil","Cameroon","Canada","Colombia","Croatia",
  "Denmark","Ecuador","Egypt","England","France","Germany","Ghana","Iran","Italy",
  "Japan","Mexico","Morocco","Netherlands","Nigeria","Norway","Paraguay","Peru",
  "Poland","Portugal","Qatar","Saudi Arabia","Senegal","South Korea","Spain",
  "Sweden","Switzerland","Tunisia","Türkiye","USA","Uruguay","Wales"
];

function OnboardingPage() {
  const router = useRouter();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [country, setCountry] = useState("");
  const [team, setTeam] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await completeOnboardingFn({
        data: { display_name: displayName, country, favourite_team: team },
      });
      toast.success("You're in. Let's predict.");
      await router.invalidate();
      navigate({ to: "/play" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save profile.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center size-12 rounded-xl bg-amber-gradient shadow-glow mb-4">
            <span className="font-score font-bold text-primary-foreground text-lg">M</span>
          </div>
          <h1 className="font-display font-bold text-3xl">One last thing</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Tell the scoreboard who you are.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <Field label="Display name">
            <input
              required
              maxLength={40}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Diego10"
              className="w-full rounded-xl bg-input border border-border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/50"
            />
          </Field>
          <Field label="Country">
            <input
              required
              list="country-list"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="Where you're tuning in from"
              className="w-full rounded-xl bg-input border border-border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/50"
            />
            <datalist id="country-list">
              {TEAMS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Field>
          <Field label="Favourite World Cup team">
            <select
              required
              value={team}
              onChange={(e) => setTeam(e.target.value)}
              className="w-full rounded-xl bg-input border border-border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">Choose a team…</option>
              {TEAMS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-amber-gradient px-4 py-3 text-sm font-bold shadow-glow disabled:opacity-50"
          >
            {loading ? "Saving…" : "Enter the scoreboard"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}
