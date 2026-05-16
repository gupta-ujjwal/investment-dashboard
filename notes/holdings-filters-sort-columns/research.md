# Research: Holdings page — filters, sort, 9-column table

## Codebase findings

### Data model has no current price
- `CanonicalHolding` (`src/storage/holdings.ts:9-21`) stores `quantity`, `avgBuyPrice`, `currency`, `assetClass`, `importedAt`, and optional FX fields (`fxRate`, `fxAsOf`, `avgBuyPriceBase`). No current/market price field exists.
- DB is at version 2 (`src/storage/holdings.ts:29`). Adding **optional** scalar fields needs no version bump — no new store or index, and `upgrade()` only creates stores (`:39-49`).
- `exportSnapshot` (`src/storage/holdings.ts:83-94`) serializes whole holdings — new optional fields ride along with no change.

### Broker exports DO carry a current price (verified against fixtures)
- Groww (`tests/fixtures/groww-sample.xlsx`): header row 11 = `Stock Name, ISIN, Quantity, Average buy price, Buy value, Closing price, Closing value, Unrealised P&L`. **`Closing price`** is the current per-unit price.
- Vested (`tests/fixtures/vested-sample.xlsx`, `Holdings` sheet): header = `Name, Ticker, Total Shares Held, Current Price (USD), Current Value (USD), Average Cost (USD), Total Amount Invested (USD), Investment Returns (USD), Investment Returns (%), ...`. **`Current Price (USD)`** is the current per-unit price.
- Groww parser (`src/parsers/groww.ts:54-90`) currently reads only name/isin/qty/avgPrice; `REQUIRED_COLUMNS` (`:14`) lists 4. Vested parser (`src/parsers/vested.ts:13`) the same shape.
- `mapHeaderColumns` (`src/parsers/xlsx-utils.ts:25-32`) returns `Map<colName, colIndex>` — an optional column is read via `colIndexByName.get('Closing price')` guarded by an `undefined` check.
- `cellNumber` (`src/parsers/xlsx-utils.ts:13-23`) returns `0` for missing/garbage cells. So "column absent" must be distinguished from "cell empty" by the **presence of the column name in the map**, not by the cell value — else a missing column silently becomes `currentPrice = 0`.

### Stamping path — `currentPriceBase` mirrors `avgBuyPriceBase`
- `stampHolding` (`src/lib/refreshFx.ts:12-25`) computes `avgBuyPriceBase = avgBuyPrice * effectiveRate(currency, base, usdInrRate)`. `currentPriceBase = currentPrice * rate` is the identical transform — same `rate`, same call site.
- `StampedHolding` type (`src/lib/refreshFx.ts:6-10`) makes `avgBuyPriceBase` required; a stamped `currentPriceBase` should be **optional** since `currentPrice` itself is optional (old imports, future export drops the column).
- `stampMany` is called from three places: `refreshFx` (`:45`), `applyManualRate` (`:63`), and import `PreviewStep` (`src/routes/import/PreviewStep.tsx:42-44`). All three flow through `stampHolding` — one edit there covers every path.
- Import-time FX can fail: `PreviewStep` (`:42-45`) makes `stamp` a passthrough when `rate === null`, so holdings can land with no `avgBuyPriceBase` and (after this change) no `currentPriceBase`.

### Current Holdings UI
- `HoldingsTable.tsx:38` sorts by `name.localeCompare` — the only sort today, hard-coded.
- Desktop table (`HoldingsTable.tsx:51-117`): 9 columns (№, Instrument, Mkt, Class, Broker, Quantity, Avg buy, Cost basis, Cost ₹). Mobile (`:120-156`): stacked `<article>` cards, no header row.
- `baseCostLabel` (`HoldingsTable.tsx:32-35`) renders `—` when `avgBuyPriceBase === undefined` — the existing precedent for "value not computable yet".
- `HoldingsRoute.tsx:14-31` empty state (no holdings); `:33-35` computes market counts + `unstamped`; `:48-51` shows `RefreshBanner` when `unstamped > 0`.
- `RefreshBanner` (`src/components/RefreshBanner.tsx`) is the established pattern for "some rows need an FX refresh" — points the user to Settings.

### Formatting
- `formatMoney(amount, currency)` and `formatQuantity` exist (`src/lib/format.ts:14-24`). **No percent formatter** — Profit % needs one (or inline `toFixed`).

## Internet findings

- Live-price API survey done in this brainstorm: only Alpha Vantage satisfies browser-CORS + India&US free + no-CC, at 25 req/day with no batch endpoint. Captured in **GitHub issue #10** (created during this session). Not needed for issue #8 — price here is an import snapshot.

## Connection to the frame

The snapshot approach reuses two existing seams: the parser column-mapping (`mapHeaderColumns`) and the FX stamping (`stampHolding`). Both extend cleanly with one optional field each. The table is the only piece that is a genuine rewrite rather than an extension — sort/filter state, 9 columns, derived per-row math, and a mobile control surface are all new.
