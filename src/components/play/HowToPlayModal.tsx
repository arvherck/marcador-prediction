import { Link } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function HowToPlayModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">How Marcador works</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 text-sm">
          <Section icon="⚽" title="The basics">
            Predict the exact scoreline and first team to score for any World Cup match.
            The more accurate your prediction, the more points you earn.
          </Section>

          <Section icon="📊" title="How to score points">
            <div className="rounded-lg border border-border overflow-hidden">
              <Row label="Correct result (win/draw/loss)" value="+3" />
              <Row label="Correct home goals" value="+2" />
              <Row label="Correct away goals" value="+2" />
              <Row label="Correct goal difference" value="+3" />
              <Row label="Correct first team to score" value="+3" />
              <Row label="Maximum per match (group stage)" value="13" highlight />
            </div>
          </Section>

          <Section icon="🔥" title="Round multipliers">
            <p className="mb-2 text-muted-foreground">
              Points are multiplied in knockout rounds — the later the stage, the more at stake.
            </p>
            <div className="rounded-lg border border-border overflow-hidden">
              <Row label="Group Stage" value="×1 · up to 13" />
              <Row label="Round of 32" value="×2 · up to 26" />
              <Row label="Round of 16" value="×3 · up to 39" />
              <Row label="Quarterfinals" value="×4 · up to 52" />
              <Row label="Semifinals" value="×5 · up to 65" />
              <Row label="Final" value="×6 · up to 78" highlight />
            </div>
          </Section>

          <Section icon="⚡" title="2× Booster">
            Once per matchday, apply a 2× booster to one match to double your points for that
            fixture. It applies <em>after</em> the round multiplier, so a boosted Final
            prediction can earn up to <span className="text-amber-glow font-semibold">156 points</span>.
          </Section>

          <Section icon="🦄" title="Underdog bonus">
            Correctly predict an exact scoreline that fewer than 10% of other players chose and
            earn a flat <span className="text-amber-glow font-semibold">+5</span> bonus. Reward
            for thinking outside the box.
          </Section>

          <Section icon="🏆" title="Tournament winner">
            Before the tournament starts, pick your World Cup winner. Get it right and earn
            <span className="text-amber-glow font-semibold"> +50</span> bonus points added to
            your total after the Final.
          </Section>

          <Section icon="🔒" title="Prediction locking">
            Predictions lock at kickoff — you cannot change them once the match starts. Make
            sure you submit before the whistle!
          </Section>

          <Section icon="📅" title="When are results scored?">
            Results are entered manually after each match and points are calculated shortly
            after. Check back after each game to see your updated score.
          </Section>
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-3 sm:justify-between">
          <Link
            to="/rules"
            className="text-sm font-medium text-amber-glow hover:underline"
            onClick={() => onOpenChange(false)}
          >
            Read full rules →
          </Link>
          <Button onClick={() => onOpenChange(false)}>Got it!</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="font-display font-bold text-base mb-2 flex items-center gap-2">
        <span aria-hidden>{icon}</span>
        <span>{title}</span>
      </h3>
      <div className="text-muted-foreground leading-relaxed">{children}</div>
    </section>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between px-3 py-2 text-sm border-b border-border last:border-b-0 ${
        highlight ? "bg-card font-semibold text-foreground" : "bg-background/40"
      }`}
    >
      <span>{label}</span>
      <span className={`tabular-nums ${highlight ? "text-amber-glow" : "text-foreground"}`}>{value}</span>
    </div>
  );
}
