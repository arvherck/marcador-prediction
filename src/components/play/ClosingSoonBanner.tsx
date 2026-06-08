import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import type { MatchRow } from "@/lib/game.functions";
import { useNow } from "@/hooks/useNow";
import { formatCountdown, isImminentUnpredicted } from "@/lib/imminent";

export function ClosingSoonBanner({
  matches,
  view,
  onSwitchToDate,
}: {
  matches: MatchRow[];
  view: "date" | "matchday";
  onSwitchToDate: (matchId: string) => void;
}) {
  const now = useNow(1000);

  const imminent = useMemo(
    () =>
      matches
        .filter((m) => isImminentUnpredicted(m, now))
        .sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at)),
    [matches, now],
  );

  if (imminent.length === 0) return null;

  const nearest = imminent[0];
  const msRemaining = new Date(nearest.kickoff_at).getTime() - now;
  const minutes = Math.floor(msRemaining / 60_000);
  const n = imminent.length;

  // Determine state
  const urgent = minutes < 30; // red
  const last5 = minutes < 5;

  let message: string;
  if (last5) {
    message = `🔴 Predictions locking in ${formatCountdown(msRemaining)}!`;
  } else if (urgent) {
    message = `🔴 ${nearest.home_team ?? "TBD"} vs ${nearest.away_team ?? "TBD"} kicks off in ${formatCountdown(msRemaining)} — last chance to predict!`;
  } else if (n === 1) {
    message = `⏰ ${nearest.home_team ?? "TBD"} vs ${nearest.away_team ?? "TBD"} kicks off in ${formatCountdown(msRemaining)} — predict now!`;
  } else {
    message = `⏰ ${n} matches kick off in under 2 hours — you haven't predicted them all yet!`;
  }

  const handleClick = () => {
    if (view === "matchday") {
      onSwitchToDate(nearest.id);
      // ByDateView mounts after route search change; scroll after a frame
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document
            .getElementById(`match-${nearest.id}`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      });
      return;
    }
    document
      .getElementById(`match-${nearest.id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const palette = urgent
    ? "bg-red-500/15 border-red-500/50 text-red-100"
    : "bg-amber-glow/15 border-amber-glow/50 text-amber-50";
  const linkColor = urgent ? "text-red-100" : "text-amber-glow";

  return (
    <div
      role="alert"
      className={`mb-4 -mx-4 md:mx-0 md:rounded-2xl border ${palette} px-4 py-3 flex items-center gap-3 flex-wrap`}
    >
      <span className="inline-block animate-pulse text-lg leading-none" aria-hidden>
        {urgent ? "🔴" : "⏰"}
      </span>
      <p className="flex-1 min-w-[12rem] text-sm font-semibold leading-snug">
        {message.replace(/^[⏰🔴]\s*/, "")}
      </p>
      <button
        onClick={handleClick}
        className={`inline-flex items-center gap-1 text-sm font-bold underline-offset-2 hover:underline ${linkColor}`}
      >
        Predict now <ArrowRight size={14} />
      </button>
    </div>
  );
}
