export function EmptyBall({
  title,
  sub,
}: {
  title: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col items-center text-center py-16">
      <div className="relative h-28 w-28 mb-6">
        <svg viewBox="0 0 100 100" className="animate-ball drop-shadow-[0_8px_18px_rgba(0,0,0,0.5)]">
          <circle cx="50" cy="50" r="46" fill="#f5f3ee" stroke="#1a1a1a" strokeWidth="2" />
          <polygon points="50,28 62,38 57,52 43,52 38,38" fill="#1a1a1a" />
          <polygon points="50,28 38,38 24,34 30,20 44,16" fill="none" stroke="#1a1a1a" strokeWidth="1.5" />
          <polygon points="50,28 62,38 76,34 70,20 56,16" fill="none" stroke="#1a1a1a" strokeWidth="1.5" />
          <polygon points="43,52 38,38 24,34 18,50 28,62" fill="none" stroke="#1a1a1a" strokeWidth="1.5" />
          <polygon points="57,52 62,38 76,34 82,50 72,62" fill="none" stroke="#1a1a1a" strokeWidth="1.5" />
          <polygon points="43,52 57,52 62,68 50,78 38,68" fill="none" stroke="#1a1a1a" strokeWidth="1.5" />
        </svg>
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 h-2 w-20 rounded-full bg-black/60 blur-sm animate-ball-shadow" />
      </div>
      <h2 className="font-display font-bold text-xl">{title}</h2>
      {sub && (
        <p className="mt-2 text-sm text-muted-foreground max-w-sm">{sub}</p>
      )}
    </div>
  );
}
