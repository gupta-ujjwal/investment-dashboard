# Approaches — homepage analytics charts (issue #9)

The change is one coherent feature with two sub-decisions. The fork below is on
**where the history snapshot is written from** — the rest is shared.

## Shared scaffolding (both approaches)

- **New store**: `historySnapshots` in IndexedDB, `DB_VERSION` 2→3, added via an
  `oldVersion < 3` branch in the existing `getDB()` upgrade callback
  (`storage/holdings.ts:42`). Keyed by `date` (`YYYY-MM-DD`) — `put()` overwrites
  same-day. Each record embeds the full per-holding array:
  `{ date, capturedAt, baseCurrency, holdings: HoldingSnapshot[] }` where
  `HoldingSnapshot` = `{ source, sourceSymbol, name, currency, quantity,
  avgBuyPrice, currentPrice?, avgBuyPriceBase?, currentPriceBase? }`.
  Embedded-array-per-date keeps it one row/day and trivially overwritable; a
  compound `[date, source, sourceSymbol]` key was rejected — per-holding
  index-query buys nothing while drill-downs are out of scope, and every date
  row still contains every holding so per-holding series stay reconstructable.
- **New `lib/analytics.ts`**: pure aggregation — `allocation()` (by market & by
  holding from `deriveRows`), `topMovers()` (sort `profitPct`), `valueSeries()`
  (map history records → `{date, value, invested, profit}` points). Reuses
  `deriveRows()` from `holdingsView.ts` — no re-derivation.
- **New `components/charts/`**: four Recharts-based components — `ValueLine`,
  `AllocationDonut`, `MoversBars`, `PnlArea` — each restyled to the dark/mono
  tokens. Time-series charts get a "needs ≥2 snapshot days" empty state.
- **KPI rework** in `AnalyticsRoute.tsx`: Total Value / Total Invested /
  Total P&L (abs + %) / Positions, base currency.
- **Loader**: extend `dashboardLoader` (`App.tsx:21`) to also load history.

## Approach 1: Snapshot written from PreviewStep (recommended)

- **Scope**: `recordSnapshot()` lives in new `storage/history.ts`; called from
  `PreviewStep.handleCommit()` (`PreviewStep.tsx:50`) right after `commitImport`
  resolves, doing its own `getAll()` to capture post-commit state.
- **Files/modules**: `storage/holdings.ts` (migration only), new
  `storage/history.ts`, `routes/import/PreviewStep.tsx`, plus shared scaffolding.
- **Primitives**: *add* a new code path (not reshape `commitImport`); *cold path*
  — snapshot write is off the critical commit transaction.
- **Key risks**:
  - Snapshot write failing after `commitImport` succeeds → import looks done but
    history has a gap. Mitigate: wrap in try/catch, `console.warn`, never block
    the "Import complete" screen (history is best-effort, holdings are truth).
- **Complexity**: small–medium. Driver: the four Recharts components + restyle.
- **Tradeoffs vs. A2**: snapshot is a separate IDB transaction from the commit
  (not atomic) — but they target different stores anyway, and a missed snapshot
  is a cosmetic gap, not data loss. Cleanly excludes the FX-refresh path
  (`refreshFx.ts:51,69`) with zero special-casing — that is the deciding factor.

## Approach 2: Snapshot written inside `commitImport` behind a flag

- **Scope**: `commitImport` gains a `recordHistory?: boolean` arg; when set, it
  writes the history record. `PreviewStep` passes `true`; `refreshFx` passes
  `false`/omits.
- **Files/modules**: `storage/holdings.ts` (migration + `commitImport` change),
  `routes/import/PreviewStep.tsx` (pass flag), `lib/refreshFx.ts` (audited to
  ensure it omits the flag), plus shared scaffolding.
- **Primitives**: *reshape* `commitImport`.
- **Key risks**:
  - `commitImport` now does two jobs; the flag is a complecting seam — every
    future caller must remember to reason about history.
  - `refreshFx` is a live caller that must be verified to omit the flag — a
    silent regression vector if a future edit flips it.
- **Complexity**: small, but adds a conditional concern to a currently-pure
  storage primitive.
- **Tradeoffs vs. A1**: only upside is the snapshot *could* share a transaction
  — but it targets a different object store, so atomicity isn't free anyway, and
  IDB multi-store transactions would couple the two stores' write paths. Not
  worth the complecting. **Rejected** in favour of A1.

## Recommendation

Approach 1. The FX-refresh second caller of `commitImport` (`refreshFx.ts:51,69`)
is the decider: writing the snapshot from `PreviewStep` excludes that path for
free, while Approach 2 needs a flag whose only job is to remember the exclusion.
