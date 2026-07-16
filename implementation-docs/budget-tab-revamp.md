# Budget tab revamp (focused-month view)

> Implemented via `/brainstorm` → `/develop` on 2026-07-16.

## What

A presentation-only revamp of the Budget tab. The old "aggregate stat grid → always-on
inline form → flat list of one-line month cards" is replaced with a **focused-month**
view: a demoted one-line aggregate summary, a horizontal **month strip** (one stacked
bar per month, doubling as a trend and the month picker), and a **focused-month panel**
with two donuts (income allocation + expense breakdown), a stats row carrying
month-over-month deltas, income/expense line details, and **edit-in-place**.

Touched: `src/routes/BudgetRoute.tsx` (view rewrite), `src/lib/budget.ts` (+ tests) and
`src/components/charts/chartTheme.ts` (new pure helpers), and five new files under
`src/components/charts/` (`DonutShell`, `BudgetAllocationDonut`, `BudgetExpenseDonut`,
`BudgetCharts`, `MonthStrip`). **No external surface changed** — the `budgetMonths` IDB
schema, `budgetAction`, and the tag model are untouched; edit-in-place writes through the
existing `saveMonth`/`deleteMonth` intents verbatim.

## Why

The old tab presented settled monthly cash-flow as a lifeless list with no per-month
visual and no way to compare months. The goal was to make a month legible at a glance and
comparable to its neighbours.

**Approach chosen — in-place rewrite + shell-only donut extraction.** Two alternatives
were weighed:
- *Clone `SectorDonut` twice* — rejected: ~80% boilerplate duplication across two files.
- *Generalise all donuts onto one config-driven primitive* — rejected: the three shipped
  donuts (allocation/currency/sector) differ on three axes (semantic-vs-palette colour,
  Other-fold vs not, centre-label), so a generic "any donut" re-absorbs that variation as
  config — an over-parameterised god-component — and refactoring three shipped, tested
  charts drags Overview/Equity (out of scope) into a budget PR.

The middle path won: extract only the *non-varying* shell (`DonutShell` — ring geometry,
responsive container, legend list, hover tooltip, centred caption) used **only** by the
two new budget donuts. Less duplication than cloning; zero blast radius on the shipped
donuts. Generalising the existing three onto a shared primitive is a deliberate follow-up.

**Plan-review findings folded in (FIX):**
- *Negative "remaining" can't be a donut slice.* An overspent month (spend + invested >
  income) drops the remaining wedge and shows an explicit "overspent by X" callout;
  `allocationSlices` returns a discriminated shape (`overspentBy`), never a negative arc.
- *Degenerate inputs (0/1 month, income 0, all-zero expenses).* All new helpers are pure
  and total — `undefined`/empty, never `NaN`/`Infinity` — and each donut renders an
  explicit empty state instead of feeding an empty series to Recharts.
- *Month-count growth / selected state.* The strip is horizontally scroll-snapped, newest
  focused by default, focused segment auto-scrolled into view and visually accented.
- *Edit-in-place write path.* Reuses the unchanged action; no new write path, no
  data-model risk.

**Deferred (DEFER):** generalising the three shipped donuts onto `DonutShell`; a latent
`expenseBreakdown(max)` edge for `max < 2` (unreachable — the only caller uses the default
of 6).

**Pre-mortem.** Most-likely failure was a render crash on negative-remaining / empty
series white-screening the tab. Mitigated by total helpers + explicit empty/overspent
states + the existing `ChartCard` error boundary. **Rollback** is a plain `git revert` +
static redeploy — no migration, no persisted-state change.

## How

Built bottom-up, each layer verified before the next.

1. **Pure helpers** (`src/lib/budget.ts`, 8 new unit tests, all green):
   - `allocationSlices(summary)` → `{ wedges, overspentBy }`. Wedges are spent/invested/
     remaining filtered to strictly-positive values (a blank month → `[]`); `overspentBy`
     is `-remaining` when overspent, else `undefined`.
   - `expenseBreakdown(month, max=6)` → category slices summed (trimmed) by label, sorted
     desc, tail beyond `max` folded into "Other (n)"; `pct` is `undefined` when expenses
     are 0 (R1); non-positive/blank lines dropped; `[]` when empty. Over existing
     category-total lines only — no synthesised transactions (productContext/dsl.md § R11).
   - `monthOverMonth(current, previous)` → signed deltas, or `undefined` when there is no
     previous month (first month) — never a fabricated 0 delta (R1).
   - `formatMonthKey('2026-06') → 'Jun 2026'` added in `chartTheme.ts` beside its sibling
     `formatDateKey` (reuses the private `MONTHS` array and the same no-`Date` string-parse
     discipline, so a UTC offset can't shift a month-boundary key). This is a small,
     DRY deviation from the plan, which had named `lib/budget.ts` as its home.

2. **Chart components** (`src/components/charts/`): `DonutShell` (shared shell; callers own
   colour + value formatting + empty-state copy), `BudgetAllocationDonut` (semantic tones —
   spent=ember, invested=jade, remaining=bone — + overspent callout + empty state),
   `BudgetExpenseDonut` (donut palette + Other-fold + empty state). Geometry mirrors
   `SectorDonut` (inner 62% / outer 94%, `isAnimationActive={false}`, ring-left/legend-right)
   so the budget donuts read as one of the family.

3. **Month strip** (`MonthStrip`): plain-markup stacked bars (no Recharts) scaled to the
   busiest month so an overspent bar still fits; each segment is a `<button>` (nav +
   `aria-pressed`), `+` at the end adds a month; horizontal scroll-snap with the focused
   segment auto-scrolled into view.

4. **Route rewrite** (`BudgetRoute.tsx`): `focused` month key + `editing` flag drive a
   read-view ↔ inline-editor swap; the loader/action/`LineEditor`/tag flow are preserved
   verbatim. Fresh (0-month) budgets open straight in add-mode; a deleted focused month
   falls back to the newest remaining month via an effect.

**Review outcome.** `/deep-review` (five passes) returned **Block: 0**. Its one
Request-changes finding — the donuts pulled Recharts *eagerly* into the statically-loaded
Budget route, regressing the documented "keep Recharts out of the initial bundle" rule
(productContext/dsl.md § dsl-decision-guide) that Overview/Equity honor via `React.lazy` —
was fixed: the two donuts are wrapped in a default-exported `BudgetCharts` panel,
lazy-mounted behind `Suspense` (the strip stays eager). Verified in the build output: the
main bundle dropped ~9 KB and `BudgetCharts` is now its own chunk. The two Follow-ups and
two Nits are logged, not acted on.

**Build / format / test.** `npm run build` (tsc + vite) exits 0. No formatter in the
project. `npm run test:run` — 264/264 pass. Playwright verification per the frontend-design
rule covered the golden path (desktop + mobile) and every degenerate state
(0-month, 1-month/first, income=0, overspent) with zero new console errors, including a
re-verify after the lazy-load refactor. The only console noise is a pre-existing
react-router hydration warning and a favicon 404 — neither introduced here.
