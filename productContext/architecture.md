# Investment Dashboard — Architecture Reference

> What this system is. Skills read sections by anchor ID — update this file when the architecture itself changes.

## How skills use this file

This file is built for section-targeted reads. When a skill is told to read `architecture.md` § `<anchor-id>`, it finds the line `<a id="<anchor-id>"></a>` and reads to the next heading. The Section Index below is the map.

## Section Index

| Anchor | Section | Use when |
|---|---|---|
| `arch-overview` | 1. Overview | grounding what the system is |
| `arch-component-map` | 2. Component / Module Map | mapping a change to a module |
| `arch-routing` | 3. Routing & Navigation | adding routes, loaders, actions |
| `arch-storage` | 4. Storage Layer | changing data model, migrations, persistence |
| `arch-import-pipeline` | 5. Import Pipeline | adding parsers, changing wizard flow |
| `arch-fx` | 6. FX & Currency Conversion | changing FX source, stamping logic |
| `arch-analytics` | 7. Analytics Engine | changing KPIs, aggregations, derived rows |
| `arch-charts` | 8. Charts (Recharts) | changing chart components, theming, lazy-loading |
| `arch-deployment` | 9. Deployment & Infrastructure | changing build, CI/CD, hosting |
| `arch-gaps` | 10. Gaps / Unverified | verifying open questions |

<a id="arch-overview"></a>
## 1. Overview

An edge-only static web app for tracking personal investments across Indian (NSE/BSE, INR) and US (NYSE/NASDAQ, USD) equity markets. All portfolio data lives in the browser (IndexedDB). No backend, no auth, no telemetry. Hosted on GitHub Pages as a static Vite bundle (`README.md:1-7`, `CLAUDE.md:5-16`).

Phase 1 scope (current): import holdings via broker XLSX exports (Vested, Groww), persist in IndexedDB, view unified portfolio with analytics. Manual price snapshots and FX conversion are supported; live price feeds are explicitly out of scope (`CLAUDE.md:14-15`).

Stack: React 19 + TypeScript on Vite 8, Tailwind CSS 4, `react-router-dom` v7 SPA mode, `idb` (promise wrapper over IndexedDB), `exceljs` (XLSX parsing), Recharts (charts, lazy-loaded), Vitest for unit tests (`README.md:9-16`, `package.json:14-32`).

<a id="arch-component-map"></a>
## 2. Component / Module Map

```
src/
├── main.tsx                # React mount point (StrictMode)
├── App.tsx                 # BrowserRouter setup, loaders, actions
├── index.css               # Tailwind v4 theme tokens (ink/bone/tick/jade/ember)
├── featureFlags.ts         # Compile-time feature toggles
├── lib/
│   ├── format.ts           # Intl formatters (money, qty, percent, date)
│   ├── fx.ts               # Frankfurter fetch + validation
│   ├── refreshFx.ts        # Stamp holdings with FX rate
│   ├── holdingsView.ts     # Derive rows, sort, filter
│   └── analytics.ts        # Pure aggregations (KPIs, allocation, movers, series)
├── storage/
│   ├── holdings.ts         # IndexedDB: holdings store + CRUD
│   ├── settings.ts         # IndexedDB: settings singleton
│   └── history.ts          # IndexedDB: daily snapshot store
├── parsers/
│   ├── types.ts            # ParseResult, ParseError
│   ├── xlsx-utils.ts       # Cell readers, header finders, previews
│   ├── vested.ts           # Vested XLSX parser
│   ├── groww.ts            # Groww XLSX parser
│   └── diff.ts             # Diff existing vs incoming holdings
├── routes/
│   ├── AppShell.tsx        # Layout: header + nav tabs + Outlet
│   ├── AnalyticsRoute.tsx  # KPI row + lazy ChartsPanel
│   ├── HoldingsRoute.tsx   # Filters, sort, HoldingsTable
│   ├── SettingsRoute.tsx   # Profile & FX settings
│   ├── SettingsForm.tsx    # Settings form with fetcher
│   └── import/
│       ├── ImportRoute.tsx # Wizard shell + step indicator
│       ├── wizardState.ts  # useReducer state + actions
│       ├── SourcePicker.tsx
│       ├── Instructions.tsx
│       ├── UploadStep.tsx  # File input + parse
│       ├── PreviewStep.tsx # Diff review + commit + snapshot
│       └── CommitStep.tsx  # Committing / done states
└── components/
    ├── HoldingsTable.tsx   # Desktop table + mobile cards
    ├── RefreshBanner.tsx   # FX unstamped warning banner
    └── charts/
        ├── ChartsPanel.tsx      # Grid of 4 charts, lazy default export
        ├── ChartCard.tsx        # Bordered card wrapper
        ├── ChartErrorBoundary.tsx
        ├── chartTheme.ts        # Shared Recharts tokens
        ├── ValueOverTime.tsx    # Line chart
        ├── PnlOverTime.tsx      # Area chart
        ├── AllocationDonut.tsx  # Donut + toggle
        └── TopMovers.tsx        # Diverging bar chart
```

<a id="arch-routing"></a>
## 3. Routing & Navigation

`react-router-dom` v7 `createBrowserRouter` in `src/App.tsx:90-121`. `basename` is read from `import.meta.env.BASE_URL` (`App.tsx:116`).

Routes:

| Path | Component | Loader | Action | Behaviour |
|---|---|---|---|---|
| `/` | redirect | — | — | Redirects to `/import` if no holdings, else `/analytics` (`App.tsx:98-102`) |
| `/analytics` | `AnalyticsRoute` | `dashboardLoader` | — | KPI row + charts |
| `/holdings` | `HoldingsRoute` | `dashboardLoader` | — | Filterable/sortable holdings table |
| `/import` | `ImportRoute` | — | — | 6-step import wizard |
| `/settings` | `SettingsRoute` | `settingsLoader` | `settingsAction` | Profile, base currency, FX refresh |

`dashboardLoader` (`App.tsx:25-32`) fetches holdings + settings + (optionally) history in parallel. `settingsLoader` (`App.tsx:34-37`) fetches settings only. `settingsAction` (`App.tsx:60-88`) handles three intents: `save`, `manual`, `refresh`.

<a id="arch-storage"></a>
## 4. Storage Layer

Single IndexedDB database (`investment-dashboard`, version 3) opened via `idb`'s `openDB` (`src/storage/holdings.ts:36-69`).

**Stores and schemas:**

| Store | Key | Created | Description |
|---|---|---|---|
| `holdings` | `[source, sourceSymbol]` | v1 | Canonical holdings; index `by-source` on `source` (`holdings.ts:51-54`) |
| `settings` | `'app'` (singleton) | v2 | User profile: name, baseCurrency, numberLocale, lastFxRate, lastFxAsOf (`settings.ts:5-19`) |
| `historySnapshots` | `date` (YYYY-MM-DD) | v3 | Daily portfolio snapshots for time-series charts (`history.ts:16-25`) |

Migrations are additive-only, guarded by `oldVersion < N` (`holdings.ts:49-65`). No data backfill or migration transforms inside the upgrade callback — future schema changes must continue this pattern.

**Key types:**

- `CanonicalHolding` (`holdings.ts:9-29`): flat record with optional FX fields (`fxRate`, `fxAsOf`, `avgBuyPriceBase`, `currentPrice`, `currentPriceBase`).
- `Settings` (`settings.ts:5-11`): baseCurrency (`'INR'|'USD'`), numberLocale (`'en-IN'|'en-US'`), FX metadata.
- `HistoryRecord` (`history.ts:16-25`): date, capturedAt, baseCurrency, embedded holdings array.

**CRUD primitives:**

- `getAll()` / `getForSource(source)` — read all or per-source holdings.
- `commitImport({ inserts, updates, deletes })` — single readwrite transaction atomic write (`holdings.ts:87-97`).
- `exportSnapshot()` — JSON backup of all holdings (`holdings.ts:99-110`).
- `getSettings()` / `saveSettings()` / `updateFxMeta()` — settings singleton (`settings.ts:23-37`).
- `recordSnapshot(baseCurrency)` / `getHistory()` — history write/read (`history.ts:54-66`).

<a id="arch-import-pipeline"></a>
## 5. Import Pipeline

The import flow is a linear 6-step wizard driven by `useReducer` (`src/routes/import/wizardState.ts:5-87`):

1. **Pick source** (`SourcePicker.tsx`) — user selects Vested or Groww.
2. **Instructions** (`Instructions.tsx`) — platform-specific download guidance.
3. **Upload** (`UploadStep.tsx`) — user picks `.xlsx`; file is parsed in-browser.
4. **Preview** (`PreviewStep.tsx`) — diff review: inserts / updates / missing counts; per-row keep/delete decisions for missing rows; sanity-check extremes; backup download.
5. **Committing** (`CommitStep.tsx`) — spinner while `commitImport` runs.
6. **Done** (`CommitStep.tsx`) — success, navigate to `/analytics`.

**Parsing:**

- `parseVested(file)` (`vested.ts:17-103`): reads XLSX, finds sheet by `Name + Ticker` signature, extracts columns by header name, returns `ParseResult`.
- `parseGroww(file)` (`groww.ts:17-102`): reads first worksheet, finds header row by `Stock Name + ISIN` signature (up to row 25), extracts columns.
- Both parsers use `cellNumberOrUndefined` for optional numeric columns (current price) so absent columns yield `undefined`, not sentinel `0` (`xlsx-utils.ts:31-43`).
- `ParseError` (`types.ts:19-29`) is thrown on structural mismatch; messages include diagnostic previews.

**Diff & commit:**

- `diffHoldings(existing, incoming, source)` (`diff.ts:9-44`) produces inserts, updates, missing. Source containment is enforced.
- `PreviewStep.tsx:27-77` fetches live FX (best-effort, 3s timeout), stamps inserts/updates, commits, then records a history snapshot (best-effort, not atomic with commit).

<a id="arch-fx"></a>
## 6. FX & Currency Conversion

FX rate is fetched from Frankfurter (`api.frankfurter.dev/v1/latest?from=USD&to=INR`), an ECB daily rate with CORS open and no API key (`lib/fx.ts:8`).

**Fetch & validation:**

- `fetchUsdInrRate()` (`lib/fx.ts:22-57`): 3-second timeout via `AbortController`, validates response shape, checks rate is finite and in range `(1, 1000)`. Throws `FxFetchError` on any failure.
- `effectiveRate(from, base, usdInrRate)` (`lib/fx.ts:79-88`): returns `1` for same currency, direct rate for `USD→INR`, inverse for `INR→USD`.

**Stamping:**

- `stampHolding(holding, base, rate, fetchedAt)` (`lib/refreshFx.ts:12-30`): computes `avgBuyPriceBase` and optionally `currentPriceBase` (only if `currentPrice` is defined). Preserves all original fields.
- `refreshFx(settings)` (`lib/refreshFx.ts:47-54`): fetches live rate, re-stamps all holdings, commits as updates, saves FX meta to settings.
- `applyManualRate(settings, rate)` (`lib/refreshFx.ts:56-77`): offline fallback; validates manual rate range, then stamps and commits.

**UI integration:**

- Settings page shows last rate / last refresh, "Refresh FX" button, manual rate paste fallback (`SettingsForm.tsx:106-208`).
- `RefreshBanner` (`RefreshBanner.tsx`) appears on Analytics and Holdings when any holding lacks base-currency figures.

<a id="arch-analytics"></a>
## 7. Analytics Engine

All analytics are pure folds over `DerivedRow[]` (output of `deriveRows` in `lib/holdingsView.ts:88-91`). No I/O.

**Portfolio totals (`lib/analytics.ts:41-64`):**

- `totalInvestedBase`, `totalValueBase`, `totalProfitBase`, `totalProfitPct`.
- Propagates `undefined` if any row lacks the needed field (no sentinel values).
- `unstamped` count drives the "refresh needed" banner.

**Allocation (`lib/analytics.ts:88-107`):**

- Buckets by `market` (INR/USD) or `holding` (individual ticker).
- Only rows with `currentValueBase` defined are counted.
- Returns `AllocationSlice[]` sorted largest-first.

**Top movers (`lib/analytics.ts:122-127`):**

- Ranks by lifetime P&L % (currency-neutral, needs only native prices).
- Drops rows where `profitPct` is undefined.

**Value series (`lib/analytics.ts:148-163`):**

- Folds `HistoryRecord[]` into `ValuePoint[]` (date, value, invested, profit).
- Skips records stamped in a different base currency (cannot honestly re-base).

**Derived rows (`lib/holdingsView.ts:30-91`):**

- `DerivedRow` carries both native and base figures, plus `isStale` flag.
- `undefined` means "not computable" — renderer shows `—`.
- Staleness: a row is stale if its `importedAt` is older than the newest import across the whole set.

<a id="arch-charts"></a>
## 8. Charts (Recharts)

Four charts rendered inside `ChartsPanel` (`src/components/charts/ChartsPanel.tsx:28-43`), which is the **default export** so `AnalyticsRoute` can `React.lazy()` it. This keeps the ~100KB+ Recharts bundle out of the initial chunk.

| Chart | Type | Gated on | Empty state |
|---|---|---|---|
| `ValueOverTime` | Line (value + invested) | `FEATURE_HISTORY` | Awaits 2+ snapshot days |
| `PnlOverTime` | Area (profit) | `FEATURE_HISTORY` | Awaits 2+ snapshot days |
| `AllocationDonut` | Donut | Always | Needs priced holdings |
| `TopMovers` | Diverging bar | Always | Needs current price |

**Shared infrastructure:**

- `ChartCard.tsx:18-48` — bordered card with title, chip, optional figure, optional action. Wraps body in `ChartErrorBoundary`.
- `ChartErrorBoundary.tsx:12-34` — per-chart error boundary; degrades to "unavailable" placeholder instead of white-screening `/analytics`.
- `chartTheme.ts:10-72` — shared tokens (`chartColor`, `donutPalette`, `axisTick`), `compactMoney` for axis labels.

**Accessibility:** each chart's `ResponsiveContainer` is wrapped in `<div role="img" aria-label={summary}>` with a text summary of the data.

<a id="arch-deployment"></a>
## 9. Deployment & Infrastructure

- **Build:** Vite 8 (`vite.config.ts:1-8`) with `@vitejs/plugin-react` and `@tailwindcss/vite`. Output to `dist/`.
- **Static hosting:** GitHub Pages from `main` branch pushes (`deploy.yml:1-36`).
- **Base path:** `/investment-dashboard/` (`vite.config.ts:6`). Router `basename` derived from `import.meta.env.BASE_URL` (`App.tsx:116`).
- **CI:** GitHub Actions workflow (`deploy.yml:18-36`) runs `npm ci && npm run build` then uploads `./dist`.
- **Type checking:** `tsc -b --noEmit` (also `npm run typecheck`).
- **Tests:** Vitest (`vitest.config.ts:1-8`), `npm run test:run` for one-shot, `npm test` for watch mode.

<a id="arch-gaps"></a>
## 10. Gaps / Unverified

1. **Live price feed** — issue #10 is referenced in `holdings-filters-sort-columns.md:11` but no implementation exists. The current price comes from broker exports only.
2. **Broker expansion beyond Vested/Groww** — `csv-import-vested-groww.md:10-13` lists Robinhood, Zerodha, Fidelity as future candidates but no parsers exist.
3. **SQLite-WASM evaluation** — `csv-import-vested-groww.md:37` defers this to the analytics slice; not yet decided.
4. **Restore-from-backup** — `csv-import-vested-groww.md:25` mentions backup download ships in v1 but restore UX is deferred.
