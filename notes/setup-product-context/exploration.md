# Exploration — Investment Dashboard Codebase

## Entry Points

- `index.html:18` → `<script type="module" src="/src/main.tsx">`
- `src/main.tsx:10` → React 19 `StrictMode`, mounts `App` at `#root`
- `src/App.tsx:90-121` → `createBrowserRouter` with `/` redirect, `/analytics`, `/holdings`, `/import`, `/settings` routes; `basename` from `BASE_URL`

## Routes & Layout

- `src/routes/AppShell.tsx:10-65` — sticky header with NavLink tabs (Analytics, Holdings, Import, Settings); Outlet for child routes
- `src/routes/AnalyticsRoute.tsx:21-99` — KPI row (value/invested/P&L/positions) + lazy-loaded `ChartsPanel` via `Suspense`
- `src/routes/HoldingsRoute.tsx:45-133` — filter/sort state, `HoldingsTable` with `RefreshBanner`, mobile sort dropdown
- `src/routes/import/ImportRoute.tsx:22-60` — 6-step wizard (`useReducer`): pick-source → instructions → upload → preview → committing → done
- `src/routes/SettingsRoute.tsx:6-32` — profile/FX settings; gated behind `FEATURE_BASE_CURRENCY`

## State / Navigation

- Routing: `react-router-dom` v7 SPA mode (`createBrowserRouter`)
- First-run redirect: `App.tsx:101` — if `getAll().length === 0`, redirect `/` → `/import`
- Loaders: `dashboardLoader` (`App.tsx:25-32`) fetches holdings + settings + history; `settingsLoader` fetches settings only
- Action: `settingsAction` (`App.tsx:60-88`) handles save / refresh / manual FX intents

## Storage Layer

- `src/storage/holdings.ts:36-69` — `openDB(DB_NAME='investment-dashboard', DB_VERSION=3)`
  - v1: `holdings` store, keyPath `[source, sourceSymbol]`, index `by-source` on `source`
  - v2: `settings` store (singleton)
  - v3: `historySnapshots` store, keyPath `date` (`YYYY-MM-DD`)
- Types: `CanonicalHolding`, `Source` (`'vested'|'groww'`), `Currency` (`'INR'|'USD'`), `AssetClass` (`equity|mf|etf|invit|other`)
- CRUD: `getAll`, `getForSource`, `commitImport({inserts,updates,deletes})`, `exportSnapshot`
- `src/storage/settings.ts:13-37` — singleton `Settings` with baseCurrency (default INR), numberLocale, FX meta
- `src/storage/history.ts:16-66` — `HistoryRecord` (daily portfolio snapshot); `recordSnapshot`, `getHistory`, `buildRecord`, `toDateKey`

## Import Pipeline

- Parsers (`src/parsers/`):
  - `vested.ts:17-103` — Vested XLSX, 3-sheet aware (`findSheetBySignature`), ticker-keyed, optional `Current Price (USD)`
  - `groww.ts:17-102` — Groww XLSX, row-11 header, ISIN-keyed, optional `Closing price`
  - `xlsx-utils.ts:1-128` — `cellString`, `cellNumber`, `cellNumberOrUndefined`, `mapHeaderColumns`, `findHeaderRowBySignature`, `findSheetBySignature`, `previewAllSheets`
  - `types.ts:1-49` — `ParseResult`, `ParseError` with typed `ParseErrorReason`
  - `diff.ts:9-44` — `diffHoldings(existing,incoming,source)` → inserts/updates/missing; source containment enforced
- Wizard state: `src/routes/import/wizardState.ts:5-87` — `useReducer` with 11 action types; `MissingDecision` ('keep'|'delete')
- Steps: `SourcePicker` → `Instructions` → `UploadStep` (parses + diffs) → `PreviewStep` (review + commit + snapshot) → `CommitStep`
- Commit: `PreviewStep.tsx:27-77` — fetches FX → stamps holdings → `commitImport` → `recordSnapshot` (best-effort, try/catch)

## FX / Currency

- `src/lib/fx.ts:22-57` — `fetchUsdInrRate()` from `api.frankfurter.dev/v1/latest?from=USD&to=INR`, 3s timeout, range validation `(1,1000)`
- `src/lib/refreshFx.ts:12-30` — `stampHolding(holding,base,rate,fetchedAt)` computes `avgBuyPriceBase`/`currentPriceBase`
- `src/lib/refreshFx.ts:47-54` — `refreshFx(settings)` re-stamps all holdings on explicit user click
- `src/lib/refreshFx.ts:56-77` — `applyManualRate(settings,rate)` for offline fallback
- Effective rate: `src/lib/fx.ts:79-88` — 1 for same-currency, direct for USD→INR, inverse for INR→USD

## Holdings View Model

- `src/lib/holdingsView.ts:30-48` — `DerivedRow`: native + base figures, all `undefined`-aware (no sentinels)
- `src/lib/holdingsView.ts:50-91` — `deriveRow(holding,newestTimestamp)` computes invested/current/profit/stale
- Sort/filter: `src/lib/holdingsView.ts:99-165` — `applyFilters`, `sortRows`, `viewRows`; `undefined` sinks to bottom
- `src/lib/format.ts:1-44` — `formatMoney`, `formatQuantity`, `formatPercent`, `formatDate`

## Analytics

- `src/lib/analytics.ts:24-64` — `portfolioTotals` → KPI row values; `undefined` propagation
- `src/lib/analytics.ts:88-107` — `allocation(rows,mode)` → `AllocationSlice[]` by market or holding
- `src/lib/analytics.ts:122-127` — `topMovers(rows)` → ranked by lifetime P&L %
- `src/lib/analytics.ts:148-163` — `valueSeries(history,base)` → time-series points; skips mismatched baseCurrency

## Charts (Recharts, lazy-loaded)

- `src/components/charts/ChartsPanel.tsx:28-43` — grid of 4 charts, gated on `FEATURE_HISTORY` for time-series
- `src/components/charts/ValueOverTime.tsx:35-131` — value vs invested line, ordinal X axis
- `src/components/charts/PnlOverTime.tsx:33-117` — P&L area, zero floor
- `src/components/charts/AllocationDonut.tsx:41-139` — donut with market/holding toggle, `MAX_SLICES` tail fold
- `src/components/charts/TopMovers.tsx:36-103` — diverging bar chart of gainers + losers
- `src/components/charts/ChartCard.tsx:18-48` — bordered card wrapper; `ChartErrorBoundary` per chart
- `src/components/charts/chartTheme.ts:10-72` — shared tokens, compactMoney for axis ticks
- Lazy load: `AnalyticsRoute.tsx:13` — `lazy(() => import('../components/charts/ChartsPanel'))`

## Feature Flags

- `src/featureFlags.ts:1-2` — `FEATURE_BASE_CURRENCY = true`, `FEATURE_HISTORY = true`
- Both are compile-time constants; disabling hides UI without code removal

## Tests

- Runner: Vitest (`vitest.config.ts:1-8`)
- Parser tests: `vested.test.ts`, `groww.test.ts`, `diff.test.ts` (fixtures in `tests/fixtures/`)
- Logic tests: `holdingsView.test.ts`, `analytics.test.ts`, `refreshFx.test.ts`, `fx.test.ts`
- Storage tests: `history.test.ts`

## Deploy

- Static build via Vite → `dist/`
- GitHub Actions: `deploy.yml:1-36` — `npm ci && npm run build`, publish `./dist` to Pages
- `vite.config.ts:6` → `base: '/investment-dashboard/'`

## Design System (Tailwind v4)

- Custom tokens in `src/index.css:3-43` — ink/bone/tick/jade/ember scales, Fraunces/Instrument Sans/JetBrains Mono fonts
- Dark theme by default (`color-scheme: dark`)
- Reduced motion: `.reveal` animation disabled via `prefers-reduced-motion`
