export type Scorer = "home" | "away" | "none";

export type ReconcileInput = {
  home: number;
  away: number;
  scorer: Scorer;
  changed: "home" | "away" | "scorer";
  homeTeam?: string;
  awayTeam?: string;
};

export type ReconcileResult = {
  home: number;
  away: number;
  scorer: Scorer;
  hint?: string;
};

export function reconcilePrediction(input: ReconcileInput): ReconcileResult {
  let { home, away, scorer } = input;
  home = Math.max(0, home);
  away = Math.max(0, away);
  let hint: string | undefined;
  const homeName = input.homeTeam ?? "Home";
  const awayName = input.awayTeam ?? "Away";

  if (input.changed === "scorer") {
    if (scorer === "none") {
      if (home !== 0 || away !== 0) {
        home = 0;
        away = 0;
        hint = "No goal selected — score set to 0-0";
      }
    } else if (scorer === "home" && home === 0) {
      home = 1;
      hint = `Home goals set to 1 — ${homeName} scores first`;
    } else if (scorer === "away" && away === 0) {
      away = 1;
      hint = `Away goals set to 1 — ${awayName} scores first`;
    }
  } else {
    // score changed
    if (home === 0 && away === 0) {
      if (scorer !== "none") {
        scorer = "none";
        hint = "0-0 — first scorer set to no goal";
      }
    } else if (scorer === "home" && home === 0) {
      if (away > 0) {
        scorer = "away";
        hint = `Switched first scorer to ${awayName}`;
      } else {
        scorer = "none";
        hint = "First scorer set to no goal";
      }
    } else if (scorer === "away" && away === 0) {
      if (home > 0) {
        scorer = "home";
        hint = `Switched first scorer to ${homeName}`;
      } else {
        scorer = "none";
        hint = "First scorer set to no goal";
      }
    }
  }

  return { home, away, scorer, hint };
}

export function isConsistent(home: number, away: number, scorer: Scorer): boolean {
  if (home === 0 && away === 0) return scorer === "none";
  if (scorer === "home" && home === 0) return false;
  if (scorer === "away" && away === 0) return false;
  return true;
}
