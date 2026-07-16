# W2 PR-A — Budget feeds the flywheel

> Implemented via `/brainstorm` → `/develop` on 2026-07-16. First of three PRs in the W2 connective-tissue
> wave (the overarching plan is `implementation-docs/w2-connective-tissue.md`). PR-B (Overview deep-links +
> inline Planning config) and PR-C (the Budget "invested" hint) are separate follow-up branches.

## What
Wires the Budget tab's numbers into the rest of the app, all as pure read-folds — no schema change, no new
write path. Adds `monthlyAverages` to `lib/budget.ts` and a new `lib/cashflow.ts` (precedence + liquidity
folds); `dashboardLoader` and `planningLoader` now also read budget months; `OverviewRoute` gains a **Cash
flow** card and feeds a budget-derived emergency need + goal contribution into its existing emergency/goal
cards; `PlanningRoute` feeds the same budget-derived emergency need. Every derived figure carries a visible
"from Settings" / "budget-derived · avg of N mo" provenance label. Touches: `src/lib/budget.ts`,
`src/lib/cashflow.ts` (new), `src/App.tsx`, `src/routes/OverviewRoute.tsx`, `src/routes/PlanningRoute.tsx`,
plus tests. External surface: none — `DB_VERSION` stays 5, loaders only read.

## Why
The tabs were well-built silos: Budget knew the user's income/expenses/savings, but Planning re-asked for the
emergency monthly need in Settings and the goal projection re-asked for a monthly contribution — the same
facts entered twice. PR-A closes that loop so Budget feeds Planning and the goal.

**Approach.** One of three cohesive sub-PRs (chosen over a single big PR so the data-limited #4 hint and the
pure-UI deep-links can't gate this derivation work, and each reverts independently). Rejected: building a real
per-transaction "invested" source (W3-scale; broker exports carry no buy dates).

**Design decisions the plan-review settled (all folded in):**
- **Runway vs emergency-coverage were near-duplicate gauges.** Resolved: the Cash-flow card leads with
  **savings rate** (the budget-native metric nothing else shows); months-of-**runway** is a secondary "total
  liquidity" line whose numerator is **cash + savings + FD manual assets only** — equity/holdings are excluded
  (a volatile, tax-on-sale portfolio is not emergency liquidity) — kept distinct from the emergency card
  (earmarked assets ÷ need).
- **Precedence is tri-state.** `effectiveValue(settings, derived)`: Settings `undefined` = unset → use derived;
  an explicit `0` is honored as a real override; neither → `none`. One tested helper feeds all three surfaces
  (blast radius).
- **Sparse months are unstable.** `monthlyAverages` returns `undefined` under 2 logged months; the card shows
  the averaging window ("avg of N months").
- **No telemetry → the user is the detector.** A visible provenance label is the only anomaly signal, so it's
  a shared, unit-tested helper.
- **Deferred:** an *essentials-only* emergency need (needs an "essential" flag on budget tags) — the derived
  need uses total average monthly spend for now.

**Reliability tenets:** T1 (every fold returns `undefined`, never NaN/Infinity, on zero denominator / absent
data); T2 (all pure reads — no new write path; the only W2 write, PR-B's settingsAction reuse, isn't here);
T3 (one shared `effectiveValue` + one shared `provenanceLabel` feed three surfaces); T4 (degenerate-input
unit tests + the provenance label). **Pre-mortem's most-likely failure** — a single logged month producing a
confident-but-meaningless average propagating to three surfaces — is guarded by the ≥2-month `undefined`
identity and a cold-start composition test. **Rollback:** `git revert`; no migration (read-only), data untouched.

## How
Built folds-first with tracer-bullet tests, then wired loaders and UI.

- **`lib/budget.ts` — `monthlyAverages(months)`**: `undefined` under `MIN_MONTHS_FOR_AVERAGE = 2`; else avg
  income/expenses/invested/net + a savings rate (`(income − expenses)/income`, `undefined` at zero income).
- **`lib/cashflow.ts` (new)**: `effectiveValue` (tri-state precedence + `ValueSource`), `liquidAssets`
  (cash/savings/fd manual assets, base-currency `currentValueBase`, partial-aware, `undefined` when none
  valued), `runwayMonths` (`undefined` not `Infinity` on zero/absent expenses), and `provenanceLabel`
  (shared "from Settings" / "budget-derived · avg of N mo").
- **`App.tsx`**: `dashboardLoader` and `planningLoader` add `getAllBudgetMonths()` (FEATURE_BUDGET-gated,
  `[]` fallback).
- **`OverviewRoute.tsx`**: computes `avg = monthlyAverages(budgetMonths)`, `emergencyNeed`/`contribution` via
  `effectiveValue(settings.X, avg?.Y)`, feeds `.value` into the existing `emergencyFundStatus`/`projectGoal`
  calls, renders the `CashFlowCard` when `avg` is defined, and shows the provenance label on the emergency +
  goal cards.
- **`PlanningRoute.tsx`**: same budget-derived emergency need + provenance via the shared helpers.

**Deviation from the plan:** the row-menu/Settings write path is untouched here (that's PR-B). The consolidated
doc lives at `implementation-docs/w2-budget-flywheel.md` rather than clobbering the multi-PR
`w2-connective-tissue.md` plan.

**Verification.** `tsc -b --noEmit` clean; `vite build` green; Vitest **250 passed** (13 new folds +
provenance + cold-start-composition tests). Playwright on a seeded 3-month budget: cold-start (no card, no
NaN); populated Cash-flow card with correct math (savings rate 56.05%, runway 4.0 mo); emergency need + goal
contribution reading "budget-derived · avg of 3 mo" on Overview *and* Planning; the Settings-override flipping
to "from Settings" when an explicit need is set; desktop + mobile; 0 new console errors (the favicon 404 and
react-router warnings pre-exist on `main`).

**Review.** `/deep-review` — Block 0. Three findings (share `provenanceLabel`, unit-test it, add a cold-start
composition test) were fixed in-loop as they implemented the plan's own T3/T4 dispositions; two Spec
observations (Overview's emergency card needs assets to show a fund; `avgNet` "Left over" vs savings-rate
"net") were assessed intentional/consistent and accepted.

No formatter is configured; style applied by hand to match surrounding code.
