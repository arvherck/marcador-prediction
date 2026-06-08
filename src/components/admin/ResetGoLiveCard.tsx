import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { adminResetToGoLiveFn, type ResetResult } from "@/lib/admin-reset.functions";

export function ResetGoLiveCard() {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [result, setResult] = useState<ResetResult | null>(null);
  const qc = useQueryClient();

  const m = useMutation({
    mutationFn: () => adminResetToGoLiveFn(),
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ["admin-app-state"] });
      qc.invalidateQueries({ queryKey: ["admin-quick-check"] });
      if (r.ok) toast.success("App reset to go-live state ✓");
      else toast.error("Reset completed with errors — see modal for details");
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Reset failed"),
  });

  const canConfirm = confirmText === "RESET";

  const reopen = () => {
    setConfirmText("");
    setResult(null);
    setOpen(true);
  };

  return (
    <div className="rounded-2xl border border-destructive/40 bg-destructive/5 overflow-hidden mb-4">
      <div className="px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold">🔄 Reset to go-live state</div>
          <div className="text-xs text-muted-foreground">
            Wipes ALL predictions, scores, test users and test artifacts. Real matches, users and leagues are kept.
          </div>
        </div>
        <AlertDialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) {
              setConfirmText("");
              setResult(null);
            }
          }}
        >
          <AlertDialogTrigger asChild>
            <button
              onClick={reopen}
              className="rounded-lg bg-destructive px-3 py-1.5 text-xs font-bold text-destructive-foreground hover:opacity-90"
            >
              🔄 Reset to go-live state
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent className="max-w-lg">
            {!result ? (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset app to go-live state?</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-3 text-sm">
                      <div>
                        <div className="font-medium text-foreground">This will permanently delete:</div>
                        <ul className="mt-1 space-y-0.5 text-muted-foreground">
                          <li>✗ All predictions from all users</li>
                          <li>✗ All matchday scores and rankings</li>
                          <li>✗ All test users (testuser@marcador-test.com)</li>
                          <li>✗ All orphaned __test matchday artifacts</li>
                          <li>✗ All test scores on real matches</li>
                        </ul>
                      </div>
                      <div>
                        <div className="font-medium text-foreground">This will NOT delete:</div>
                        <ul className="mt-1 space-y-0.5 text-muted-foreground">
                          <li>✓ Real user accounts and profiles</li>
                          <li>✓ Real matches and fixtures (104 matches)</li>
                          <li>✓ Real matchday structure</li>
                          <li>✓ Group standings (reset to 0)</li>
                          <li>✓ League structures (memberships kept)</li>
                          <li>✓ Tournament winner predictions</li>
                        </ul>
                      </div>
                      <div className="pt-2">
                        <div className="text-xs font-medium text-foreground mb-1">
                          Type <span className="font-mono">RESET</span> to confirm:
                        </div>
                        <Input
                          autoFocus
                          value={confirmText}
                          onChange={(e) => setConfirmText(e.target.value)}
                          placeholder="RESET"
                          className="font-mono"
                        />
                      </div>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={m.isPending}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={!canConfirm || m.isPending}
                    onClick={(e) => {
                      e.preventDefault();
                      if (canConfirm) m.mutate();
                    }}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {m.isPending ? "Resetting…" : "Reset app"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </>
            ) : (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {result.ok
                      ? "✅ App reset to go-live state"
                      : "⚠️ Reset completed with errors"}
                  </AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="text-sm space-y-2">
                      <div className="font-medium text-foreground">Cleared:</div>
                      <ul className="space-y-0.5 font-mono text-xs">
                        {result.steps.map((s) => (
                          <li
                            key={s.key}
                            className={s.ok ? "text-foreground" : "text-destructive"}
                          >
                            {s.ok ? "·" : "✗"} {s.label}: {s.count}
                            {s.error ? ` — ${s.error}` : ""}
                          </li>
                        ))}
                      </ul>
                      <div className="pt-2 text-muted-foreground">
                        {result.ok
                          ? "The app is now ready for the tournament."
                          : "Some steps failed. Review the list above; nothing has been silently skipped."}
                      </div>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogAction onClick={() => setOpen(false)}>Close</AlertDialogAction>
                </AlertDialogFooter>
              </>
            )}
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
