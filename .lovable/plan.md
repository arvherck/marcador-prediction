## Investigation

The "Group standings accuracy" test fails because the **expected values in the test fixture are wrong**, not the database calculation. I recomputed each team by hand from the 6 Group A matches the test applies — the DB-produced standings are arithmetically correct; the hardcoded expectations in `src/lib/admin-tests.functions.ts` do not match the match results they're verifying against.

### Recomputed from the test's own match list

Matches applied (Scenario 1):
```
Mexico 2-0 South Africa
South Korea 1-1 Czechia
Mexico 1-0 South Korea
Czechia 3-1 South Africa
Czechia 0-0 Mexico
South Africa 2-2 South Korea
```

| Team        | P | W | D | L | GF | GA | GD | Pts | Current expected (wrong) |
|-------------|---|---|---|---|----|----|----|-----|--------------------------|
| Mexico      | 3 | 2 | 1 | 0 | 3  | 0  | +3 | 7   | ✓ matches |
| Czechia     | 3 | 1 | 2 | 0 | 4  | 2  | +2 | 5   | ✗ test says D=1 L=1 GA=3 GD=1 Pts=4 |
| South Korea | 3 | 0 | 2 | 1 | 3  | 4  | −1 | 2   | ✓ matches |
| South Africa| 3 | 0 | 1 | 2 | 3  | 7  | −4 | 1   | ✗ test says GA=6 GD=−3 |

Scenario 2 (Mexico vs South Africa rewritten to 0-0):

| Team         | P | W | D | L | GF | GA | GD | Pts | Current expected (wrong) |
|--------------|---|---|---|---|----|----|----|-----|--------------------------|
| Mexico       | 3 | 1 | 2 | 0 | 1  | 0  | +1 | 5   | ✓ matches |
| South Africa | 3 | 0 | 2 | 1 | 3  | 5  | −2 | 2   | ✗ test says GA=4 GD=−1 |

The DB's `recalculate_team_standing` trigger output (shown via the ❌ markers in the screenshot) matches my hand-calculated values exactly. The test's hardcoded `STANDINGS_SCENARIO_1.Czechia`, `STANDINGS_SCENARIO_1["South Africa"]`, and `STANDINGS_SCENARIO_2["South Africa"]` are wrong.

## Fix

Edit `src/lib/admin-tests.functions.ts` only — no DB or trigger changes.

1. `STANDINGS_SCENARIO_1.Czechia` → `{ played: 3, won: 1, drawn: 2, lost: 0, goals_for: 4, goals_against: 2, goal_difference: 2, points: 5 }`
2. `STANDINGS_SCENARIO_1["South Africa"]` → `{ played: 3, won: 0, drawn: 1, lost: 2, goals_for: 3, goals_against: 7, goal_difference: -4, points: 1 }`
3. `STANDINGS_SCENARIO_2["South Africa"]` → `{ played: 3, won: 0, drawn: 2, lost: 1, goals_for: 3, goals_against: 5, goal_difference: -2, points: 2 }`

The expected ordering (Mexico > Czechia > South Korea > South Africa) stays the same — both old and corrected Czechia totals still rank 2nd, and SA still 4th.

After the fix the test should pass green.
