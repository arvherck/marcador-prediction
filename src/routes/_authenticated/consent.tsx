import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { recordConsentFn } from "@/lib/auth.functions";

export const Route = createFileRoute("/_authenticated/consent")({
  head: () => ({
    meta: [
      { title: "One quick thing · Marcador" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConsentPage,
});

function ConsentPage() {
  const navigate = useNavigate();
  const recordConsent = useServerFn(recordConsentFn);
  const [age18, setAge18] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!age18 || !privacy) {
      setShowErrors(true);
      return;
    }
    setLoading(true);
    try {
      await recordConsent({ data: { age_confirmed: true, privacy_accepted: true } });
      navigate({ to: "/onboarding", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not record consent.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-background text-foreground">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center size-12 rounded-xl bg-amber-gradient shadow-glow mb-4">
            <span className="font-score font-bold text-primary-foreground text-lg">M</span>
          </div>
          <h1 className="font-display font-bold text-3xl">One quick thing before you start</h1>
          <p className="text-sm text-muted-foreground mt-2">
            We need your consent to keep things squared away.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-card/60 p-5">
          <label className="flex items-start gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={age18}
              onChange={(e) => setAge18(e.target.checked)}
              className="mt-0.5 size-4 rounded border-border accent-amber-glow"
            />
            <span>I am 18 years of age or older</span>
          </label>
          {showErrors && !age18 && (
            <p className="ml-6 -mt-2 text-[11px] text-destructive">
              Please confirm you are 18+ to continue
            </p>
          )}

          <label className="flex items-start gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={privacy}
              onChange={(e) => setPrivacy(e.target.checked)}
              className="mt-0.5 size-4 rounded border-border accent-amber-glow"
            />
            <span>
              I agree to the{" "}
              <a
                href="/privacy"
                target="_blank"
                rel="noreferrer"
                className="text-amber-glow hover:underline"
              >
                Privacy Policy
              </a>{" "}
              and understand how my data is used
            </span>
          </label>
          {showErrors && !privacy && (
            <p className="ml-6 -mt-2 text-[11px] text-destructive">
              Please agree to the Privacy Policy to continue
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !age18 || !privacy}
            className="w-full rounded-xl bg-amber-gradient px-4 py-3 text-sm font-bold shadow-glow disabled:opacity-50"
          >
            {loading ? "..." : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
