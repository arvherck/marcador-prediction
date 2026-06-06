import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import {
  diffInDays,
  pillDayLabel,
  type DayBucket,
} from "@/lib/date-labels";

export function ComingUpStrip({
  days,
  activeKeys,
  onJump,
}: {
  days: DayBucket[];
  activeKeys: Set<string>;
  onJump: (key: string) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Center the first active pill on mount
    if (activeRef.current && scrollerRef.current) {
      const el = activeRef.current;
      const parent = scrollerRef.current;
      const target =
        el.offsetLeft - parent.clientWidth / 2 + el.clientWidth / 2;
      parent.scrollTo({ left: Math.max(0, target), behavior: "auto" });
    }
    // only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (days.length === 0) return null;

  return (
    <div className="-mx-2 px-2 mb-4">
      <div
        ref={scrollerRef}
        className="flex gap-2 overflow-x-auto pb-2 snap-x scroll-px-2 [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {days.map((d) => {
          const isActive = activeKeys.has(d.key);
          const isPast = diffInDays(d.date, new Date()) < 0;
          const isToday = diffInDays(d.date, new Date()) === 0;
          const allPredicted =
            d.available > 0 && d.predicted >= d.available;
          const setRef = isActive && !activeRef.current
            ? (el: HTMLButtonElement | null) => {
                if (el && !activeRef.current) activeRef.current = el;
              }
            : undefined;
          return (
            <button
              key={d.key}
              ref={setRef}
              onClick={() => onJump(d.key)}
              className={[
                "snap-start shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold border transition whitespace-nowrap",
                isActive
                  ? "bg-amber-gradient text-primary-foreground border-transparent shadow-glow"
                  : isPast
                  ? "bg-card/40 text-muted-foreground/60 border-border/60"
                  : "bg-card text-foreground border-border hover:border-primary/50",
              ].join(" ")}
              aria-current={isActive ? "true" : undefined}
              title={d.date.toLocaleDateString(undefined, {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            >
              {isToday && <span aria-hidden>📅</span>}
              <span>{pillDayLabel(d.date)}</span>
              <span
                className={
                  isActive
                    ? "text-primary-foreground/85"
                    : "text-muted-foreground"
                }
              >
                · {d.matches.length}
              </span>
              {allPredicted && (
                <Check
                  size={12}
                  className={
                    isActive ? "text-primary-foreground" : "text-success"
                  }
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
