import { useEffect, useState } from "react";
import { Lock } from "lucide-react";

export function KickoffCountdown({ kickoffAt }: { kickoffAt: string | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!kickoffAt) {
    return (
      <div className="rounded-2xl border border-border bg-card/60 px-4 py-3 text-center text-xs uppercase tracking-[0.2em] text-muted-foreground flex items-center justify-center gap-2">
        <Lock size={14} /> Matchday locked
      </div>
    );
  }

  const diff = Math.max(0, new Date(kickoffAt).getTime() - now);
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);

  const urgent = diff < 60_000 && diff > 0;
  const soon = diff < 10 * 60_000 && diff > 0;

  return (
    <div
      className={`rounded-2xl p-4 bg-amber-gradient shadow-glow ${
        urgent ? "animate-urgent" : soon ? "animate-pulse" : ""
      }`}
    >
      <div className="text-[10px] uppercase tracking-[0.3em] font-bold text-primary-foreground/80 text-center">
        {urgent ? "⚠ Locking soon" : "Locks in"}
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2">
        <Tile value={d} label="d" />
        <Tile value={h} label="h" />
        <Tile value={m} label="m" />
        <Tile value={s} label="s" />
      </div>
    </div>
  );
}

function Tile({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl bg-background/30 backdrop-blur-sm py-2 text-center">
      <div className="font-score font-bold text-3xl md:text-4xl text-primary-foreground tabular-nums leading-none">
        {String(value).padStart(2, "0")}
      </div>
      <div className="text-[10px] uppercase tracking-widest text-primary-foreground/70 mt-1">
        {label}
      </div>
    </div>
  );
}
