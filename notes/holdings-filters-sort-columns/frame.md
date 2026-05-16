# Frame: Holdings page — filters, sort, 9-column table (issue #8)

- **Kind**: feature
- **One-line summary**: Rework the Holdings page into a usable portfolio view — a 9-column sortable table with market + symbol filters — sourcing current market price as an import-time snapshot from the broker export (live-API prices deferred to issue #10).
- **Files/modules likely touched**: `src/storage/holdings.ts` (schema), `src/lib/refreshFx.ts` (stamping), `src/parsers/groww.ts` + `src/parsers/vested.ts` + `src/parsers/xlsx-utils.ts` (capture current price), `src/components/HoldingsTable.tsx` (full rewrite), `src/routes/HoldingsRoute.tsx` (caption, filter/sort state), `src/lib/format.ts` (percent formatting), possibly a new `src/lib/holdingsMath.ts` (derived per-row + sort math). Tests: `groww.test.ts`, `vested.test.ts`, new table/math tests.
- **External surface affected**: IndexedDB record shape (`CanonicalHolding` gains optional `currentPrice`, `currentPriceBase`) — additive, no DB version bump needed (optional fields, no new store/index). Broker-export parsing contract widens (one more optional column read).
- **Out of scope**: live price fetch via API (issue #10), manual current-price entry, manual add/edit of holdings, new markets or asset classes, charts on Analytics.

## Confirmed decisions (grill loop)

1. **Price source**: snapshot from broker export at import. Groww `Closing price`, Vested `Current Price (USD)`. Live API tracked separately as issue #10.
2. **Columns** (9, in order): Name (+symbol, asset-class badge), Mkt (IN/US badge), Qty, Avg Price Bought (native ccy), Current Value/unit (native ccy), Total Invested (base ccy), Current Total Value (base ccy), Profit (abs + %), Broker. № index dropped; Class folded to a badge under the name.
3. **Totals currency**: Total Invested / Current Total Value / Profit-abs in the settings base currency. Per-unit prices stay native. Needs `currentPriceBase` stamped at import.
4. **Sort**: every column sortable asc/desc. Default = Current Total Value desc. Desktop = click column header to toggle. Mobile = "Sort by" dropdown + asc/desc direction toggle.
5. **Filters**: by market (IN/US) and by symbol/name text search.
6. **Staleness**: page caption shows newest import date; rows whose import is older than the newest get a subtle "stale" marker.

## Known consequences

- Holdings imported before this ships have no `currentPrice` → price/value/profit cells render "—" until re-imported.
- Holdings where FX failed at import (`avgBuyPriceBase === undefined`) already render "—" for base totals; existing `RefreshBanner` prompts a refresh.
