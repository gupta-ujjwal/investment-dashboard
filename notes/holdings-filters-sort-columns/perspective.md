# 4 Shapes — Holdings page rework (issue #8)

Proposal restated: rework the Holdings page into a 9-column sortable/filterable table whose
"current price" is an import-time snapshot lifted from the broker export, with totals
converted to a base currency; recommended structure is a pure `holdingsView.ts` projection
module behind a thin `HoldingsTable` component.

## Nature

The snapshot-vs-live distinction is **photograph vs. live feed**. A snapshot is honest about
being a fixed moment — and a photograph carries a timestamp. The stale-row marker is exactly
that timestamp; the design flows with nature by making the as-of date visible rather than
fighting it by pretending the number is current. The table itself is **sedimentary** — each
import is a deposited layer, and a Groww layer and a Vested layer can be different ages;
reading a row's staleness is reading the age of its stratum.

## Domain

This is the personal-investing domain, not Juspay payments — the load-bearing noun is the
**holding** (a position), and it is a *derived view*, not a state machine. The flow is
import → reconcile → view; this table sits firmly on the "post" side, the analytics end.
The plan uses standard portfolio vocabulary correctly (cost basis, P&L, base currency) — one
nit: the brokers call it "current price", so the column the issue names "Current Value/unit"
should be labelled to match the source term to avoid drift. Reconciliation is already a
first-class primitive here: `diff.ts` dedups re-imports, and the FX stamping is the
multi-currency recon step — the snapshot price is naturally re-reconciled on every import.

## Theory

`holdingsView.ts` is a **pure projection**: `CanonicalHolding[] → DerivedRow[]` is a `map`,
the sort comparators define a total order, and the filters are predicates composed under
conjunction. The sharp theoretical point: the derived values are **partial functions** —
`profitPct` is undefined when invested = 0, `currentValueBase` is undefined when price or FX
is missing. Model that partiality explicitly with `undefined` (an `Option`), never with a
sentinel `0` or `NaN`. Sorting over a partial column then needs a defined rule for the
undefined elements — sort them to the bottom irrespective of asc/desc, or the order is
ill-defined.

## Implementation

The existing code already hands you the shape: `stampHolding` (`refreshFx.ts:12-25`) is a
one-line transform per field, and `baseCostLabel` (`HoldingsTable.tsx:32-35`) is the
`—`-fallback render — both patterns just need replicating for `currentPrice`. The smallest
spike is: add `currentPrice?` to the type, read it in one parser, render one column. Two
frictions the diagram hides: (1) `cellNumber` (`xlsx-utils.ts:13-23`) returns `0` for an
absent column, so "column missing" and "price genuinely 0" collide — the parser must gate on
the column **name being present in `mapHeaderColumns`**, not on the cell value; (2)
`StampedHolding` (`refreshFx.ts:6-10`) makes `avgBuyPriceBase` **required** — a new
`currentPriceBase` must be **optional**, or the import-FX-failed passthrough
(`PreviewStep.tsx:42-45`) breaks.

## Tensions

- **Nature vs. Domain**: nature says a snapshot is honestly a fixed moment; the domain says a
  portfolio view *wants* to feel live — users read "current value" as current. The staleness
  marker resolves the tension at the UI, but it is a band-aid over a real data gap that issue
  #10 (live prices) must eventually close. The plan should not let the marker become an
  excuse to never do #10.
- **Theory vs. Implementation**: theory says model partial values with `undefined`; the
  codebase's `cellNumber` returns the sentinel `0`. The plan must actively resist letting
  that sentinel propagate into `currentPrice` — a `0` price would silently render a -100%
  loss instead of an honest "—".

## Take

The `holdingsView.ts` projection is the right call — it makes the partial-value math
(undefined price, undefined FX, zero-invested) unit-testable, which is where the real bugs
live. The main thing to get right is partiality discipline end to end: absent column →
`undefined` (not `0`), undefined derived value → `—` cell and sort-to-bottom. The user can
redirect on the column label and on whether the stale marker is enough of an honesty signal.
