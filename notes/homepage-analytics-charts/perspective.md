# 4 Shapes — homepage analytics charts (issue #9)

Proposal: rework `/analytics` into an at-a-glance portfolio view, add a
date-keyed `historySnapshots` IndexedDB store written after each import commit,
rework the KPI row, and add four Recharts charts.

## Nature
The history store is a **growth-ring** pattern — a tree records each season as a
ring; the dashboard records each import day as a snapshot. The ring is written
once and never edited; you read the whole trunk to see the history. That argues
for append-only, date-keyed records and a chart that simply *connects the rings*
— no interpolation, no synthetic daily fill. It also argues the time axis should
be honest about sparseness: a tree with three rings is three years old, full
stop; don't draw a smooth curve implying daily data you never had.

## Domain
The load-bearing noun here is the **portfolio snapshot** — the dashboard's
equivalent of a settlement/recon checkpoint. The natural slice is
*import → snapshot → analytics*, mirroring pre-txn → txn → post-txn: the import
is the event, the snapshot is the ledger entry, the charts are recon/reporting.
The snapshot must be stamped with the `baseCurrency` it was computed in (the
user can re-base later — an old INR-base snapshot relabelled as USD is a
silent data-integrity bug). Staleness is already a first-class domain concept
(`isStale` in `holdingsView.ts`); the value-over-time line inherits it — a
snapshot mixes each holding's last-known price, exactly as the KPIs already do.

## Theory
The snapshot store is an **event log** (immutable facts keyed by time); the
charts are **left folds** over that log. `lib/analytics.ts` should be pure
fold functions — `allocation`, `topMovers`, `valueSeries` — over `deriveRows()`
output, no I/O, fully unit-testable. Date-keyed `put()` makes the write an
**idempotent upsert**: re-importing the same day is a no-op-shaped overwrite,
which is the correct semantics for "today's snapshot". The one real theorem in
play is the **end-to-end argument**: correctness of the chart belongs in the
aggregation layer, not the renderer — Recharts must stay a dumb projection.

## Implementation
The smallest spike: `commitImport` already runs (`PreviewStep.tsx:50`); add a
`recordSnapshot()` call right after it, doing its own `getAll()`. The existing
staged `upgrade` callback (`storage/holdings.ts:42`) shows the migration shape
to copy verbatim. The friction the diagram hides: `commitImport` has a *second*
caller — `refreshFx.ts:51,69` — so the snapshot write must live in `PreviewStep`,
not in `commitImport`, or FX re-stamps would forge phantom history rows. Recharts
is the implementation tax: its default theme fights the bespoke `ink/bone/tick`
tokens, so budget real time for `<svg>`-level restyling, not just prop-tweaking.

## Tensions
- **Nature vs. Implementation**: nature says "connect the rings honestly, sparse
  is fine"; the Recharts default wants a smooth continuous axis. Resolve by
  using a categorical/ordinal X axis (one tick per snapshot day), not a
  time-scaled axis that implies missing days.
- **Theory vs. the four-chart scope**: P&L-over-time is a fold over the *same*
  log as value-over-time — theoretically redundant. The user chose both; resolve
  by designing them as one visual pair (shared X axis, P&L as the gap between
  value and invested) rather than two independent widgets.
