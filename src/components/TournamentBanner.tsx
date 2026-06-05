import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trophy, Lock, Check, X } from "lucide-react";
import {
  getTournamentStatus,
  submitTournamentPickFn,
} from "@/lib/tournament.functions";
import { TEAMS_2026 } from "@/lib/teams";
import { teamFlag } from "@/lib/teamFlags";

export function TournamentBanner() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["tournament-status"],
    queryFn: () => getTournamentStatus(),
  });
  const [pick, setPick] = useState<string>("");

  const submit = useMutation({
    mutationFn: (winner: string) =>
      submitTournamentPickFn({ data: { predicted_winner: winner } }),
    onSuccess: () => {
      toast.success("Champion locked in!");
      qc.invalidateQueries({ queryKey: ["tournament-status"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed."),
  });

  if (q.isLoading || !q.data) return null;
  const { myPick, locked, actualWinner } = q.data;

  // Locked-in with result revealed
  if (myPick && actualWinner) {
    const correct = myPick.predicted_winner === actualWinner;
    return (
      <Card>
        <div className="flex items-center gap-3">
          <Trophy className="text-amber-glow shrink-0" size={28} />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Your champion
            </div>
            <div className="font-display font-bold text-lg truncate">
              {teamFlag(myPick.predicted_winner)} {myPick.predicted_winner}
            </div>
          </div>
          {correct ? (
            <span className="flex items-center gap-1 text-xs font-bold text-success bg-success/10 px-2 py-1 rounded-md">
              <Check size={14} /> +50 pts
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs font-bold text-muted-foreground bg-secondary px-2 py-1 rounded-md">
              <X size={14} /> No bonus
            </span>
          )}
        </div>
      </Card>
    );
  }

  // Locked-in, no result yet
  if (myPick) {
    return (
      <Card>
        <div className="flex items-center gap-3">
          <Trophy className="text-amber-glow shrink-0" size={28} />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Your champion · Locked in
            </div>
            <div className="font-display font-bold text-lg truncate">
              {teamFlag(myPick.predicted_winner)} {myPick.predicted_winner}
            </div>
          </div>
          <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
            +50 if correct
          </span>
        </div>
      </Card>
    );
  }

  // No pick, predictions closed
  if (locked) {
    return (
      <Card muted>
        <div className="flex items-center gap-3">
          <Lock className="text-muted-foreground shrink-0" size={20} />
          <div className="text-sm text-muted-foreground">
            Tournament champion predictions are closed.
          </div>
        </div>
      </Card>
    );
  }

  // No pick, open
  return (
    <Card>
      <div className="flex items-center gap-2 mb-2">
        <Trophy className="text-amber-glow" size={20} />
        <div className="font-display font-bold text-base">Pick your champion</div>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        One pick. +50 bonus points if you call the World Cup winner correctly.
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <select
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          className="flex-1 rounded-lg bg-input border border-border px-3 py-2 text-sm"
        >
          <option value="">Select a team…</option>
          {TEAMS_2026.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button
          onClick={() => submit.mutate(pick)}
          disabled={!pick || submit.isPending}
          className="rounded-lg bg-amber-gradient px-4 py-2 text-sm font-bold text-primary-foreground shadow-glow disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {submit.isPending ? "Locking…" : "Lock in my pick"}
        </button>
      </div>
    </Card>
  );
}

function Card({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <div
      className={`mb-4 rounded-2xl border p-4 shadow-card ${
        muted ? "border-border bg-card/60" : "border-primary/40 bg-card"
      }`}
    >
      {children}
    </div>
  );
}
