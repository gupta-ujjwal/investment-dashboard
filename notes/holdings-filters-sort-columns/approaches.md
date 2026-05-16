# Approaches

The price-source decision is settled (import-time snapshot from the broker export).
The **data-layer changes are identical across every approach** and not a point of variation:

- Schema: `CanonicalHolding` gains optional `currentPrice?` (`src/storage/holdings.ts:9-21`).
- Parsers: Groww reads `Closing price`, Vested reads `Current Price (USD)` — **optional** columns, gated on the column name being present in `mapHeaderColumns` output (`src/parsers/xlsx-utils.ts:25-32`), so a future export that drops the column degrades to `currentPrice = undefined` instead of `0`.
- Stamping: `stampHolding` (`src/lib/refreshFx.ts:12-25`) also computes `currentPriceBase = currentPrice * rate` when `currentPrice` is defined; `StampedHolding` (`:6-10`) gains an optional `currentPriceBase?`.

The approaches differ only in **where the table's derived math, sort, and filter logic live**.

## Approach 1: Extend HoldingsTable in place

- **Scope**: All sort/filter `useState` and all derived-row math (cost, current value, profit abs/%, base conversions, the `—` fallbacks) live inside `HoldingsTable.tsx`. `HoldingsRoute` mostly unchanged beyond the caption.
- **Files/modules**: `src/storage/holdings.ts`, `src/lib/refreshFx.ts`, `src/parsers/groww.ts`, `src/parsers/vested.ts`, `src/components/HoldingsTable.tsx`, `src/routes/HoldingsRoute.tsx`, `src/lib/format.ts`.
- **Primitive**: extend (the component already exists) + inline (math used in one place).
- **Key risks**:
  - Edge-case math (`currentPrice` undefined, `avgBuyPriceBase` undefined, profit when invested = 0) is only reachable through a rendered component — hard to unit-test, easy to regress.
  - `HoldingsTable.tsx` already renders two layouts (desktop table + mobile cards); adding sort + filter + 9-column derivation inline makes it a large multi-concern component.
- **Complexity**: medium — driver is the table rewrite itself.
- **Tradeoffs**: fewer files, but the testable logic is trapped in JSX. Cited motivation: `HoldingsTable.tsx:38` (sort is currently one hard-coded line) and `:32-35` (`baseCostLabel` already shows the `—`-fallback pattern that will multiply across 5 derived cells).

## Approach 2: Extract a pure holdings-view module (recommended)

- **Scope**: A new pure module `src/lib/holdingsView.ts` owns: per-row derivation (`DerivedRow` = holding + cost, currentValue, profitAbs, profitPct, all in base ccy, with explicit `undefined` where price/FX is missing), the sort comparators (one per sortable column, asc/desc), and the filter predicates (market, text search). `HoldingsTable` becomes a thin presentational component fed `DerivedRow[]` + sort/filter state via props. Sort/filter state lives as `useState` in `HoldingsRoute` (so the caption, the filtered-empty state, and the table all read the same state).
- **Files/modules**: `src/storage/holdings.ts`, `src/lib/refreshFx.ts`, `src/parsers/groww.ts`, `src/parsers/vested.ts`, `src/lib/format.ts`, **new** `src/lib/holdingsView.ts`, `src/components/HoldingsTable.tsx` (rewrite, presentational), `src/routes/HoldingsRoute.tsx` (state + caption + filter/sort controls). New test `src/lib/holdingsView.test.ts`.
- **Primitive**: abstract (the rule of three — derivation is consumed by desktop rows, mobile cards, sort keys, and the filtered-empty check) + extend (parsers/stamping). Cited motivation: `src/lib/refreshFx.ts` and `src/parsers/diff.ts` are the codebase's established pattern — pure, unit-tested logic modules with thin components on top; `diff.test.ts`/`refreshFx.test.ts` exist. This approach makes the holdings math match that convention.
- **Key risks**:
  - Slightly more upfront structure than Approach 1 — one extra module + its test.
  - Sort/filter state in `HoldingsRoute` means the route component grows; mitigated by keeping the controls themselves as small sub-components.
- **Complexity**: medium — same table rewrite as Approach 1, plus ~one well-bounded pure module.
- **Tradeoffs**: the profit/base-conversion edge cases (`currentPrice` undefined → price cells `—`; `avgBuyPriceBase` undefined → base totals `—`; invested = 0 → profit % is `—` not `Infinity`) become directly unit-testable without rendering. Matches house style. The cost is one more file.

## Approach 3 (ruled out): generic DataTable abstraction

A reusable column-config-driven `<DataTable>` with pluggable sort/filter. Ruled out — there is exactly **one** table in the app (`HoldingsTable`); the Analytics page uses KPI cards and chart frames, not tables (`src/routes/AnalyticsRoute.tsx:28-71`). Building a generic table for a single consumer is speculative abstraction the CLAUDE.md "build only what Phase 1 needs" rule forbids. Revisit only if a second sortable table appears.

## Note on filter/sort state location

Considered putting sort + filter state in the URL via `useSearchParams` (react-router-dom is already a dependency) — bookmarkable, survives refresh. Deferred: the app has no other URL-state precedent, and the win is marginal for a personal single-user dashboard. Local `useState` in `HoldingsRoute`. Can be lifted to URL params later without touching `holdingsView.ts`.
