import { useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { clearGuest } from "@/lib/guest";

export function useGuestGate() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const require = useCallback((fn: () => void, guest: boolean) => {
    if (guest) {
      setOpen(true);
      return;
    }
    fn();
  }, []);

  const modal = (
    <GuestGateModal
      open={open}
      onClose={() => setOpen(false)}
      onSignUp={() => {
        clearGuest();
        navigate({ to: "/auth" });
      }}
    />
  );

  return { require, modal, open, setOpen };
}

function GuestGateModal({
  open,
  onClose,
  onSignUp,
}: {
  open: boolean;
  onClose: () => void;
  onSignUp: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="size-12 rounded-xl bg-amber-gradient flex items-center justify-center shadow-glow mb-4">
          <span className="font-score font-bold text-primary-foreground text-lg">M</span>
        </div>
        <h2 className="font-display font-bold text-xl leading-tight">
          Create a free account
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Create a free account para hacer predicciones y competir en la tabla.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={onSignUp}
            className="w-full rounded-xl bg-amber-gradient px-4 py-3 text-sm font-bold text-primary-foreground shadow-glow"
          >
            Sign up
          </button>
          <button
            onClick={onClose}
            className="w-full rounded-xl border border-border bg-secondary/40 px-4 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground transition"
          >
            Stay as guest
          </button>
        </div>
      </div>
    </div>
  );
}
