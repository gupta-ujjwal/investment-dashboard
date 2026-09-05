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

Phase 1 equity scope: import holdings via broker XLSX exports (Vested, Groww), persist in IndexedDB, view unified portfolio with analytics. Manual price snapshots and FX conversion are supported; live price feeds are explicitly out of scope (`CLAUDE.md`). Beyond equities, a personal-finance layer (manual multi-asset net worth, budget/cash-flow, planning/goals) is shipped and on by default — see `README.md`'s "What's shipped" for the current feature list.

Stack: React 19 + TypeScript on Vite 8, Tailwind CSS 4, `react-router-dom` v7 SPA mode, `idb` (promise wrapper over IndexedDB), `exceljs` (XLSX parsing), Recharts (charts, lazy-loaded), Vitest for unit tests (`README.md:9-16`, `package.json:14-32`).

<a id="arch-component-map"></a>
## 2. Component / Module Map

```
src/
├── main.tsx                # React mount point (StrictMode); requests navigator.storage.persist()
├── App.tsx                 # createBrowserRouter setup, loaders, actions
├── index.css               # Tailwind v4 theme tokens (cobalt/graphite) + self-hosted @font-face rules
├── featureFlags.ts         # Compile-time feature toggles — every flag is `true` today
├── assets/fonts/           # Self-hosted Bricolage Grotesque / Instrument Sans / JetBrains Mono (.woff2)
├── lib/
│   ├── format.ts           # Intl formatters (money, qty, percent, date)
│   ├── fx.ts                # Frankfurter fetch + validation
│   ├── refreshFx.ts         # Stamp holdings/assets with FX rate; deriveFxWarning() for stale-rate UI copy
│   ├── holdingsView.ts      # Derive rows, sort, filter
│   ├── netWorth.ts          # Holdings+assets → NetWorthPosition fold; exports the shared finite() guard
│   ├── investments.ts       # Investments-tab row model (holdings-derived + manual asset rows)
│   ├── analytics.ts         # Pure aggregations (KPIs, allocation, movers, series, concentration, sectors)
│   ├── budget.ts / cashflow.ts / goals.ts / planning.ts / riskBand.ts   # Personal-finance folds
│   ├── assetValidators.ts / holdingValidators.ts                        # Form-input validation
│   ├── restoreBackup.ts     # Version-aware backup-file parser
│   ├── useHasHover.ts / usePrefersReducedMotion.ts                      # Small UI hooks
├── storage/
│   ├── holdings.ts          # IndexedDB: db open + upgrade() hook (v1-v5), holdings store + CRUD
│   ├── settings.ts          # IndexedDB: settings singleton
│   ├── history.ts           # IndexedDB: daily snapshot store
│   ├── assets.ts            # IndexedDB: manual value-only assets
│   ├── budget.ts            # IndexedDB: monthly cash-flow records
│   ├── budgetTags.ts        # IndexedDB: reusable budget-category tags
│   ├── holdingMerge.ts      # Pure: per-field sticky-override merge lattice
│   └── backup.ts            # Cross-store export/restore (all six stores, one atomic tx)
├── parsers/
│   ├── types.ts             # ParseResult, ParseError
│   ├── xlsx-utils.ts        # Cell readers (incl. cellNumberOrUndefined), header finders, previews
│   ├── vested.ts            # Vested XLSX parser
│   ├── groww.ts             # Groww XLSX parser
│   └── diff.ts              # Diff existing vs incoming holdings; dedupes within-import duplicate keys
├── routes/
│   ├── AppShell.tsx         # Layout: responsive nav (desktop sidebar + mobile top/bottom bars) + Outlet
│   ├── OverviewRoute.tsx    # Net worth, allocation, history charts — the default landing route
│   ├── PortfolioRoute.tsx   # Holdings table + manual "Other assets", merged Investments/Equity view
│   ├── BudgetRoute.tsx      # Monthly cash-flow entry + charts (FEATURE_BUDGET)
│   ├── PlanningRoute.tsx    # Goals, emergency fund, risk mix (FEATURE_PLANNING)
│   ├── SettingsRoute.tsx    # Profile, base currency, FX refresh, backup/restore
│   ├── SettingsForm.tsx     # Settings form with fetcher
│   ├── DataBackupSection.tsx # Export/restore UI, rendered inside SettingsRoute
│   └── import/
│       ├── ImportRoute.tsx  # Wizard shell + step indicator
│       ├── wizardState.ts   # useReducer state + actions (incl. fxWarning on commit-ok)
│       ├── SourcePicker.tsx
│       ├── Instructions.tsx
│       ├── UploadStep.tsx   # File input + parse
│       ├── PreviewStep.tsx  # Diff review (New/Updates/Missing/Skipped/Duplicates) + commit + snapshot
│       └── CommitStep.tsx   # Committing / done states; done renders an fxWarning note when present
└── components/
    ├── HoldingsTable.tsx / HoldingRow.tsx / HoldingActionsMenu.tsx  # Desktop table + mobile cards
    ├── HoldingForm.tsx / AssetForm.tsx / formModal.tsx              # Add/edit modals (both support mode="edit")
    ├── RefreshBanner.tsx     # FX-unstamped warning banner
    ├── UndoToast.tsx / useUndoableAction.ts
    ├── decor/                # Ambient/motion decoration (AnimatedNumber, CardSpotlight, Sparkline, …)
    └── charts/               # 14 Recharts-based components (allocation/sector/currency donuts, value/P&L
                               # over time, benchmark overlay, budget charts, sparklines) + ChartsPanel
                               # (lazy default export), ChartCard, ChartErrorBoundary, chartTheme
```

<a id="arch-routing"></a>
## 3. Routing & Navigation

`react-router-dom` v7 `createBrowserRouter` in `src/App.tsx` (route tree starts ~line 616). `basename` is derived from `import.meta.env.BASE_URL`.

Routes:

| Path | Component | Loader | Action | Behaviour |
|---|---|---|---|---|
| `/` | redirect | — | — | Redirects to `/import` if no holdings, else `/overview` |
| `/overview` | `OverviewRoute` | `dashboardLoader` | — | Net worth, allocation, history charts — the default landing route |
| `/portfolio` | `PortfolioRoute` | `dashboardLoader` | `holdingsAction` | Holdings table + manual assets, merged Investments/Equity view |
| `/budget` | `BudgetRoute` | `budgetLoader` | `budgetAction` | Monthly cash-flow (gated `FEATURE_BUDGET`, on by default) |
| `/planning` | `PlanningRoute` | `planningLoader` | — | Goals, emergency fund, risk mix (gated `FEATURE_PLANNING`, on by default) |
| `/import` | `ImportRoute` | — | — | 6-step import wizard |
| `/settings` | `SettingsRoute` | `settingsLoader` | `settingsAction` | Profile, base currency, FX refresh, backup/restore |
| `/equity`, `/investments` | redirect | — | — | → `/portfolio` (legacy bookmarks) |
| `/analytics` | redirect | — | — | → `/overview` (legacy bookmarks) |
| `/holdings` | redirect | — | — | → `/equity` → `/portfolio` (legacy bookmarks) |

`dashboardLoader` fetches holdings + settings + assets + (when `FEATURE_HISTORY`) history in parallel. `settingsLoader` fetches settings only. `settingsAction` handles the `save`/`manual`/`refresh` FX intents alongside the profile/base-currency save. `holdingsAction` handles holding and asset add/edit/delete/status/risk-band intents.

<a id="arch-storage"></a>
## 4. Storage Layer

Single IndexedDB database (`investment-dashboard`, version 5) opened via `idb`'s `openDB` (`src/storage/holdings.ts`, `getDB()`).

**Stores and schemas:**

| Store | Key | Created | Description |
|---|---|---|---|
| `holdings` | `[source, sourceSymbol]` | v1 | Canonical holdings; index `by-source` on `source`. `source` is `'vested' \| 'groww' \| 'manual'`. |
| `settings` | `'app'` (singleton) | v2 | User profile: name, baseCurrency, numberLocale, lastFxRate, lastFxAsOf (`settings.ts`) |
| `historySnapshots` | `date` (YYYY-MM-DD) | v3 | Daily portfolio snapshots for time-series charts (`history.ts`) |
| `assets` | `id` (generated) | v4 | Value-only manual assets — crypto, gold, FD, savings, cash, legacy manual equity (`storage/assets.ts`) |
| `budgetMonths` | `month` (YYYY-MM) | v4 | Monthly cash-flow records (`storage/budget.ts`) |
| `budgetTags` | `id` (generated) | v5 | Reusable budget-category tags, created with an idempotency `contains` guard so a partial/re-run upgrade can't throw (`storage/budgetTags.ts`) |

Migrations are additive-only, guarded by `oldVersion < N`. No data backfill or migration transforms inside the upgrade callback — future schema changes must continue this pattern. Optional scalar additions on `CanonicalHolding` (e.g. `status`, `manualOverrides`, `riskBand`) do not bump `DB_VERSION` (`dsl.md § dsl-decision-guide` → "When changing storage / IndexedDB"). Degraded-open handling (`blocked`/`blocking`/`terminated`/`VersionError`) surfaces a message instead of white-screening. `main.tsx` requests `navigator.storage.persist()` on boot — a defense against Safari ITP's 7-day-no-interaction wipe and browser storage-pressure eviction, since manual export/backup is otherwise the only recovery path.

**Key types:**

- `CanonicalHolding` (`holdings.ts`): flat record. Always: `name`, `source`, `sourceSymbol`, `quantity`, `avgBuyPrice`, `currency`, `assetClass`, `importedAt`. Optional FX fields: `fxRate`, `fxAsOf`, `avgBuyPriceBase`, `currentPrice`, `currentPriceBase`. Optional status + audit fields: `status?: 'open' \| 'closed'` (default `'open'` — see dsl.md § R12), `createdAt?: number`, `updatedAt?: number`, `riskBand?: RiskBand` (planning override). Optional `manualOverrides?: OverridableField[]` (sticky per-field overrides — dsl.md § R13).
- `BrokerSource` (`holdings.ts`): `Exclude<Source, 'manual'>`. The import wizard, parser map, and `diffHoldings` are typed against this so the compiler enforces that no manual row reaches the broker path (preserves R7).
- `OverridableField` (`holdings.ts`): the set of fields a user can override (`'quantity' | 'avgBuyPrice' | 'currentPrice' | 'name' | 'assetClass'`). Identity-shape fields (`source`, `sourceSymbol`, `currency`) are deliberately excluded.
- `Settings` (`settings.ts`): baseCurrency (`'INR'|'USD'`), numberLocale (`'en-IN'|'en-US'`), FX metadata.
- `HistoryRecord` (`history.ts`): date, capturedAt, baseCurrency, embedded holdings + assets arrays.

**CRUD primitives:**

- `getAll()` / `getForSource(source)` / `getHolding(key)` — read all, per-source, or one row.
- `commitImport({ inserts, updates, deletes })` — single readwrite transaction atomic write for the bulk import path.
- `upsertHolding(row, opts?: { addOverrides? })` — single-row atomic write. When `addOverrides` is supplied, the field names are unioned into `row.manualOverrides` inside the same tx, so a broker-row edit's value-write and override-extend are atomic by construction (dsl.md § R3, R13). Used by the holdings action (add / update) and the undo-toast restore path.
- `deleteHolding(key)` — single-row delete in one readwrite tx.
- `setHoldingStatus(key, status)` — flip `status` on a single row; touches `updatedAt`. Used by Mark closed / Re-open.
- `setHoldingRiskBand(key, band)` — set/clear a row's planning risk-band override; touches `updatedAt`.
- `revertHoldingOverrides(key)` — clear a row's `manualOverrides` set; touches `updatedAt`. Used by the per-row Revert to broker action.
- `restoreAllHoldings(holdings)` — atomic clear-then-add for the Restore-from-backup flow.
- `exportSnapshot()` — JSON backup of holdings only (legacy, offered inside the import wizard); `storage/backup.ts`'s `exportBackup()`/`restoreAll()` supersede it, covering all six stores from Settings.
- `getSettings()` / `saveSettings()` / `updateFxMeta()` — settings singleton.
- `recordSnapshot(baseCurrency)` / `getHistory()` — history write/read.

**Pure helpers (no IDB):**

- `mergeWithOverrides(existing, incoming)` (`storage/holdingMerge.ts`) — the per-field write-priority lattice (`manual > broker` for fields in `existing.manualOverrides`, `broker > manual` otherwise). Called by `diffHoldings`'s update path; unit-tested in `holdingMerge.test.ts`. The `closed → open` flip on re-import is the caller's responsibility, not the merge function's.
- `finite(v)` (`lib/netWorth.ts`) — non-finite (NaN/±Infinity) guard shared by `netWorthTotals` and `lib/investments.ts`'s holdings-derived fold, so a malformed row can't poison a sum without being counted as excluded (dsl.md § R1).

<a id="arch-import-pipeline"></a>
## 5. Import Pipeline

The import flow is a linear 6-step wizard driven by `useReducer` (`src/routes/import/wizardState.ts`):

1. **Pick source** (`SourcePicker.tsx`) — user selects Vested or Groww.
2. **Instructions** (`Instructions.tsx`) — platform-specific download guidance.
3. **Upload** (`UploadStep.tsx`) — user picks `.xlsx`; file is parsed in-browser.
4. **Preview** (`PreviewStep.tsx`) — diff review: New / Updates / Missing / Skipped / Duplicates counts; per-row keep/mark-closed/delete decisions for missing rows; sanity-check extremes; backup download.
5. **Committing** (`CommitStep.tsx`) — spinner while `commitImport` runs.
6. **Done** (`CommitStep.tsx`) — success, navigate to `/overview`; renders an inline `fxWarning` note when the commit used a stale/fallback FX rate instead of a live one.

**Parsing:**

- `parseVested(file)` (`vested.ts`): reads XLSX, finds sheet by `Name + Ticker` signature, extracts columns by header name, returns `ParseResult`.
- `parseGroww(file)` (`groww.ts`): reads first worksheet, finds header row by `Stock Name + ISIN` signature (up to row 25), extracts columns.
- Both parsers use `cellNumberOrUndefined` for the *optional* current-price column (absent → `undefined`, not sentinel `0`) **and** for the *required* `quantity`/`avgBuyPrice` columns — an unparseable required cell skips the row (folds into `skipped`) rather than silently importing a `0` cost basis (`xlsx-utils.ts`).
- `ParseError` (`types.ts`) is thrown on structural mismatch; messages include diagnostic previews.

**Diff & commit:**

- `diffHoldings(existing, incoming, source)` (`diff.ts`) first dedupes `incoming` against itself by `sourceSymbol` (keeps the last occurrence, matching broker-truth-wins semantics), returning the discarded rows as `duplicates: DuplicateRow[]` — this is what stopped a same-file duplicate key from throwing a raw IndexedDB `ConstraintError` on `commitImport`. It then produces inserts, updates, missing against storage. Source containment is enforced.
- `PreviewStep.tsx`'s `handleCommit` fetches live FX (best-effort, 3s timeout), stamps inserts/updates, commits, then records a history snapshot (best-effort, not atomic with commit). `deriveFxWarning()` (`lib/refreshFx.ts`) decides the Done-screen warning copy from the live-fetch outcome and the fallback rate/timestamp.

<a id="arch-fx"></a>
## 6. FX & Currency Conversion

FX rate is fetched from Frankfurter (`api.frankfurter.dev/v1/latest?from=USD&to=INR`), an ECB daily rate with CORS open and no API key (`lib/fx.ts`) — the app's only outbound network call (dsl.md § R10 exemption: a no-key currency-pair fetch that carries no ticker/holding data).

**Fetch & validation:**

- `fetchUsdInrRate()` (`lib/fx.ts`): 3-second timeout via `AbortController`, validates response shape, checks rate is finite and in range `(1, 1000)`. Throws `FxFetchError` on any failure.
- `effectiveRate(from, base, usdInrRate)` (`lib/fx.ts`): returns `1` for same currency, direct rate for `USD→INR`, inverse for `INR→USD`.

**Stamping:**

- `stampHolding(holding, base, rate, fetchedAt)` (`lib/refreshFx.ts`): computes `avgBuyPriceBase` and optionally `currentPriceBase` (only if `currentPrice` is defined). Preserves all original fields.
- `stampAsset(asset, base, rate, fetchedAt)` (`lib/refreshFx.ts`): the manual-asset analogue.
- `refreshFx(settings)` (`lib/refreshFx.ts`): fetches live rate, re-stamps all holdings AND manual assets against the same rate, commits, saves FX meta to settings.
- `applyManualRate(settings, rate)` (`lib/refreshFx.ts`): offline fallback; validates manual rate range, then stamps and commits.
- `deriveFxWarning(liveFxFailure, fallbackRate, fallbackFetchedAt)` (`lib/refreshFx.ts`): pure, unit-tested decision function for the import-commit FX outcome. Returns `null` when the live fetch succeeded; otherwise names either the stale fallback rate + date or, if there was no fallback at all, that no conversion happened. Replaces a prior `console.warn`-only signal that fired only when there was no fallback rate at all — a stale-but-present rate previously produced no signal whatsoever.

**UI integration:**

- Settings page shows last rate / last refresh, "Refresh FX" button, manual rate paste fallback (`SettingsForm.tsx:106-208`).
- `RefreshBanner` (`RefreshBanner.tsx`) appears on Overview and Portfolio when any holding lacks base-currency figures.

<a id="arch-analytics"></a>
## 7. Analytics Engine

All analytics are pure folds over `DerivedRow[]` (output of `deriveRows` in `lib/holdingsView.ts`) and, for net-worth-wide figures, over `NetWorthPosition[]` (`lib/netWorth.ts`, which folds holdings + manual assets together). No I/O.

**Portfolio totals (`lib/analytics.ts`):**

- `totalInvestedBase`, `totalValueBase`, `totalProfitBase`, `totalProfitPct`.
- Propagates `undefined` if any row lacks the needed field (no sentinel values).
- `unstamped` count drives the "refresh needed" banner.

**Net worth (`lib/netWorth.ts`):** `netWorthTotals` sums holdings + assets with a strict total (undefined if anything is missing) alongside a known-subtotal + `excludedCount`, guarded by the shared `finite()` check so a non-finite value is treated as excluded rather than poisoning the sum.

**Concentration risk (`lib/analytics.ts`):** top-5 weight, HHI band, single-stock-risk flag (`>10%`) over priced holdings. All four fields are `undefined` together when nothing is priced — `top5Pct` is the discriminator UI code uses to tell "nothing priced" apart from "measured, below threshold" (`PortfolioRoute.tsx`'s `RiskRow`).

**Allocation (`lib/analytics.ts`):**

- Buckets by `market` (INR/USD) or `holding` (individual ticker); `lib/netWorth.ts`'s `netWorthAllocation` buckets by asset-class group across holdings + assets.
- Only rows with `currentValueBase` defined are counted.
- Returns slices sorted largest-first.

**Top movers (`lib/analytics.ts`):**

- Ranks by lifetime P&L % (currency-neutral, needs only native prices).
- Drops rows where `profitPct` is undefined.

**Value series (`lib/analytics.ts`):**

- Folds `HistoryRecord[]` into value/invested/profit points over time.
- Skips records stamped in a different base currency (cannot honestly re-base).

**Derived rows (`lib/holdingsView.ts`):**

- `DerivedRow` carries both native and base figures, plus `isStale` flag.
- `undefined` means "not computable" — renderer shows `—`.
- Staleness: a row is stale if its `importedAt` is older than the newest import across the whole set.

**Personal-finance folds** (`lib/budget.ts`, `lib/cashflow.ts`, `lib/goals.ts`, `lib/planning.ts`, `lib/riskBand.ts`): power the Budget and Planning routes — monthly cash-flow totals, category tagging, goal/time-to-target projection, and asset-class-derived risk bands with per-holding override.

<a id="arch-charts"></a>
## 8. Charts (Recharts)

14 chart components across `/overview`, `/portfolio`, and `/budget`, grouped into per-route panels (`OverviewCharts.tsx`, `ChartsPanel.tsx`, `BudgetCharts.tsx`) that are the **default export** of their module so the route can `React.lazy()` them — keeps the 500KB+ Recharts bundle out of the initial chunk.

| Chart | Type | Gated on | Empty state |
|---|---|---|---|
| `ValueOverTime` | Line (value + invested), optional NIFTY/S&P benchmark overlay | `FEATURE_HISTORY` / `FEATURE_BENCHMARK_OVERLAY` | Awaits 2+ snapshot days |
| `PnlOverTime` | Area (profit) | `FEATURE_HISTORY` | Awaits 2+ snapshot days |
| `NetWorthHistoryArea` | Stacked area (net worth by asset class) | `FEATURE_HISTORY` | Awaits 2+ snapshot days |
| `AssetClassSparklines` | Per-class sparkline + change | `FEATURE_HISTORY` | Awaits 2+ snapshot days |
| `AllocationDonut` / `SectorDonut` / `CurrencyExposureDonut` | Donut | `FEATURE_SECTOR_DONUT` for sector | Needs priced holdings |
| `TopMovers` | Diverging bar | Always | Needs current price |
| `TagTrends`, `BudgetAllocationDonut`, `BudgetExpenseDonut`, `MonthStrip` | Budget-tab charts | `FEATURE_BUDGET` | Needs budget entries |

**Shared infrastructure:**

- `ChartCard.tsx` — bordered card with title, chip, optional figure, optional action. Wraps body in `ChartErrorBoundary`.
- `ChartErrorBoundary.tsx` — per-chart error boundary; degrades to "unavailable" placeholder instead of white-screening the route.
- `chartTheme.ts`, `DonutShell.tsx` — shared tokens (`chartColor`, `donutPalette`, `axisTick`), `compactMoney` for axis labels, shared donut layout.

**Accessibility:** each chart's `ResponsiveContainer` is wrapped in `<div role="img" aria-label={summary}>` with a text summary of the data.

<a id="arch-deployment"></a>
## 9. Deployment & Infrastructure

- **Build:** Vite 8 (`vite.config.ts:1-8`) with `@vitejs/plugin-react` and `@tailwindcss/vite`. Output to `dist/`.
- **Static hosting:** GitHub Pages from `main` branch pushes (`deploy.yml:1-36`).
- **Base path:** `/investment-dashboard/` (`vite.config.ts:6`). Router `basename` derived from `import.meta.env.BASE_URL` (`App.tsx`).
- **CI:** GitHub Actions workflow (`deploy.yml:18-36`) runs `npm ci && npm run build` then uploads `./dist`.
- **Type checking:** `tsc -b --noEmit` (also `npm run typecheck`).
- **Tests:** Vitest (`vitest.config.ts:1-8`), `npm run test:run` for one-shot, `npm test` for watch mode.

<a id="arch-gaps"></a>
## 10. Gaps / Unverified

1. **Live price feed** — issue #10 tracks this; no implementation exists. The current price comes from broker exports only.
2. **Broker expansion beyond Vested/Groww** — `csv-import-vested-groww.md:10-13` lists Robinhood, Zerodha, Fidelity as future candidates but no parsers exist (tracked as issue #22).
3. **SQLite-WASM evaluation** — `csv-import-vested-groww.md:37` defers this to the analytics slice; not yet decided. IndexedDB has handled the load so far.
4. **Duplicate-row picker** — within-import duplicate keys are deduped automatically (last occurrence wins); a full per-row Combine/Keep-one decision panel, mirroring the existing Missing-rows panel, is planned but unbuilt.

**Corrected, not a gap:** restore-from-backup is fully shipped, not deferred — `storage/backup.ts` + `lib/restoreBackup.ts` + `routes/DataBackupSection.tsx` (rendered live in `SettingsRoute.tsx`) cover export/preview/restore across all six stores in one atomic transaction. An earlier version of this document claimed restore UX was deferred; that was false as of the personal-finance revamp (PR #31) and has been corrected here.
