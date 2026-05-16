# Research — homepage analytics charts (issue #9)

## Codebase findings

### The homepage is the `/analytics` route
- `src/App.tsx:88` — index route redirects to `/analytics` when holdings exist, `/settings` when empty. So `AnalyticsRoute` IS the homepage.
- `src/routes/AnalyticsRoute.tsx:38-50` — current KPI row: `Total·base`, `India·INR`, `US·USD`, `Brokers`. All show **cost basis** (`avgBuyPrice`), not current value or P&L. `aggregate()` at `:188` sums `quantity * avgBuyPrice`.
- `src/routes/AnalyticsRoute.tsx:64-72` — three `ChartFrame` placeholders ("Coming online"), hand-rolled inline SVG decoration only, no data.
- `dashboardLoader` (`App.tsx:21`) already loads `{ holdings, settings }` — the route loader can be extended to also load history.

### Data model — what exists, what doesn't
- `src/storage/holdings.ts:9-31` — `CanonicalHolding` has `quantity`, `avgBuyPrice`, `currentPrice` (snapshot at import), `avgBuyPriceBase`, `currentPriceBase`, `currency`, `assetClass`, `source`, `importedAt`. **Exactly one price point per holding** — each import overwrites `currentPrice`. No time dimension → time-series charts are impossible without new storage.
- No charting library in `package.json` — `exceljs`, `idb`, `react`, `react-dom`, `react-router-dom` only.
- `src/lib/holdingsView.ts:48-87` — `deriveRow()` already computes `investedNative/Base`, `currentValueNative/Base`, `profitAbsBase`, `profitPct`, `isStale`. The chart aggregation can reuse `deriveRows()` rather than re-deriving.

### Import / commit flow — the snapshot trigger point
- `src/routes/import/PreviewStep.tsx:50` — `handleCommit()` calls `commitImport({inserts, updates, deletes})` after FX-stamping. This is the import commit. **Snapshot should be written here, after `commitImport` resolves**, so `getAll()` reflects post-commit state.
- `src/storage/holdings.ts:79-92` — `commitImport` runs a single readwrite IDB transaction over the `holdings` store.
- **Caveat — `commitImport` has a second caller**: `src/lib/refreshFx.ts:51` and `:69` call `commitImport({inserts:[], updates: stamped, deletes:[]})` when FX rate changes. That is NOT an import — it re-stamps base-currency fields on existing holdings. A history snapshot must NOT fire on FX re-stamp. → writing the snapshot from `PreviewStep` (not inside `commitImport`) naturally excludes the FX path.
- `src/storage/holdings.ts:42-58` — `getDB()` `upgrade` callback already does staged migrations (`oldVersion < 1`, `oldVersion < 2`). Adding `oldVersion < 3` to `createObjectStore('historySnapshots')` follows the established pattern.

### Settings / base currency
- `src/storage/settings.ts:5-13` — `Settings.baseCurrency` is `'INR' | 'USD'`, user-changeable. A history record must store the base currency it was computed in, because the user can change base later and old snapshots would otherwise be mislabelled.
- `FEATURE_BASE_CURRENCY` flag (`src/featureFlags.ts`) is `true`; AnalyticsRoute already gates base-currency KPI behind it.

### Format helpers
- `src/lib/format.ts` — `formatMoney`, `formatPercent`, `formatDate`, `formatQuantity` all exist and handle non-finite → `—`. Charts/tooltips/axes reuse these.

## Internet research
- Recharts: React-native composable chart library, pure client-side (no network, no privacy concern under CLAUDE.md). ~100KB+ gzipped — notable bundle cost for a static GitHub Pages app. Generic default theme needs heavy restyling against the bespoke dark/mono (`ink-*`/`bone-*`/`tick-*`) Tailwind tokens. Decision made by user; tradeoff carried into the plan.

## Implications
1. Time-series charts (value over time, P&L over time) require the new `historySnapshots` store — they render empty/sparse until ≥2 import days accumulate. The chart must have a graceful "needs ≥2 snapshots" empty state.
2. Allocation donut + top-movers bars are computable from current holdings **today** — they work on first import, no history needed.
3. The snapshot captures fresh + stale prices alike (a holding's `currentPrice` is only as fresh as ITS last import). The value-over-time line therefore mixes freshness — same honesty caveat the existing KPIs already carry via `isStale`.
