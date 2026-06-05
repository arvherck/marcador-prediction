import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { createDonationCheckoutFn } from "@/lib/donations.functions";

const PRESETS = [
  { emoji: "☕", amount: 3, label: "Buy us a coffee" },
  { emoji: "🍺", amount: 5, label: "Buy us a beer" },
  { emoji: "🍕", amount: 10, label: "Buy us a pizza" },
  { emoji: "🏆", amount: 25, label: "You're a legend" },
];

export function DonateModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [selected, setSelected] = useState<number | null>(5);
  const [custom, setCustom] = useState("");

  const checkout = useMutation({
    mutationFn: (amount_cents: number) =>
      createDonationCheckoutFn({ data: { amount_cents } }),
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not start checkout."),
  });

  const customNum = parseFloat(custom.replace(",", "."));
  const customValid = !Number.isNaN(customNum) && customNum >= 1 && customNum <= 1000;
  const amount = custom ? (customValid ? Math.round(customNum * 100) : 0) : selected ? selected * 100 : 0;

  const disabled = checkout.isPending || amount < 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Support Marcador ⚽</DialogTitle>
          <DialogDescription>
            Keep the scoreboard running. Every contribution helps.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 mt-2">
          {PRESETS.map((p) => {
            const active = !custom && selected === p.amount;
            return (
              <button
                key={p.amount}
                type="button"
                onClick={() => {
                  setSelected(p.amount);
                  setCustom("");
                }}
                className={`rounded-xl border p-3 text-left transition ${
                  active
                    ? "border-primary bg-primary/10 ring-1 ring-primary/40"
                    : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <div className="text-2xl leading-none mb-1">{p.emoji}</div>
                <div className="font-score font-bold text-lg text-amber-glow">€{p.amount}</div>
                <div className="text-[11px] text-muted-foreground">{p.label}</div>
              </button>
            );
          })}
        </div>

        <div className="mt-2">
          <label className="text-xs text-muted-foreground">Or enter a custom amount (€)</label>
          <input
            type="number"
            inputMode="decimal"
            min={1}
            max={1000}
            step="1"
            placeholder="Custom amount"
            value={custom}
            onChange={(e) => {
              setCustom(e.target.value);
              if (e.target.value) setSelected(null);
            }}
            className="mt-1 w-full rounded-lg bg-input border border-border px-3 py-2 text-sm"
          />
          {custom && !customValid && (
            <p className="text-[11px] text-destructive mt-1">Minimum €1, maximum €1,000.</p>
          )}
        </div>

        <button
          type="button"
          onClick={() => amount >= 100 && checkout.mutate(amount)}
          disabled={disabled}
          className="mt-3 w-full rounded-xl bg-amber-gradient px-4 py-3 text-sm font-bold shadow-glow disabled:opacity-40"
        >
          {checkout.isPending ? "Opening Stripe…" : amount >= 100 ? `Donate €${(amount / 100).toFixed(2)}` : "Donate"}
        </button>

        <p className="text-[11px] text-center text-muted-foreground mt-2">
          Secure payment via Stripe. No account needed.
        </p>
      </DialogContent>
    </Dialog>
  );
}
