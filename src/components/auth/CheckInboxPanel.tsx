import { Mail } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export function CheckInboxPanel({
  email,
  description,
  onResend,
  bottomSlot,
  cooldownSeconds = 60,
}: {
  email: string;
  description?: React.ReactNode;
  onResend: () => Promise<void>;
  bottomSlot?: React.ReactNode;
  cooldownSeconds?: number;
}) {
  const [remaining, setRemaining] = useState(cooldownSeconds);
  const [busy, setBusy] = useState(false);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt.current) / 1000);
      setRemaining(Math.max(0, cooldownSeconds - elapsed));
    }, 500);
    return () => clearInterval(id);
  }, [cooldownSeconds]);

  const handleResend = async () => {
    if (remaining > 0 || busy) return;
    setBusy(true);
    try {
      await onResend();
      toast.success("Email resent ✓");
      startedAt.current = Date.now();
      setRemaining(cooldownSeconds);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not resend email.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="text-center">
      <div className="mx-auto size-20 rounded-full bg-amber-gradient flex items-center justify-center shadow-glow mb-6">
        <Mail className="size-10 text-primary-foreground" />
      </div>
      <h1 className="font-display font-bold text-3xl mb-2">Check your inbox</h1>
      <p className="text-sm text-muted-foreground mb-8">
        {description ?? (
          <>
            We sent a confirmation link to <strong className="text-foreground">{email}</strong>. Click it to activate your Marcador account.
          </>
        )}
      </p>

      <button
        type="button"
        onClick={handleResend}
        disabled={remaining > 0 || busy}
        className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold hover:bg-secondary transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {remaining > 0 ? `Resend in ${remaining}s` : busy ? "Resending..." : "Resend confirmation email"}
      </button>

      {bottomSlot && <div className="mt-6 text-sm">{bottomSlot}</div>}
    </div>
  );
}
