# Investment Dashboard

Edge dashboard for tracking personal investments across the Indian and US stock markets. Everything runs in the browser — no backend, no accounts, no telemetry. Hosted as a static bundle on GitHub Pages.

> **Status:** Phase 1 — first vertical slice shipped. The app accepts Vested + Groww XLSX exports, persists holdings in IndexedDB, and shows a unified list view. Manual price snapshots, FX, and analytics land in later slices.

## Stack

- **React 19 + TypeScript** on **Vite 8** — static build, no SSR
- **Tailwind CSS 4** via `@tailwindcss/vite`
- **`react-router-dom` v7** in SPA mode (`createBrowserRouter`)
- **`idb`** — promise wrapper over IndexedDB; one `holdings` object store keyed by `(source, sourceSymbol)`
- **`exceljs`** — XLSX parsing for Vested + Groww holdings exports
- **Vitest** for parser + diff unit tests; fixtures at `tests/fixtures/`
- **GitHub Actions → GitHub Pages** for deploys

Future slices add Recharts for analytics and decimal.js for money math when those features actually need them.

## Local development

```bash
npm install
npm run dev        # http://localhost:5173/investment-dashboard/
npm run build      # tsc -b && vite build → dist/
npm run preview    # serve the built bundle
npm run typecheck  # tsc -b --noEmit (also the /do check command)
npm test           # vitest in watch mode
npm run test:run   # vitest run (one-shot)
```

## Deploy

Pushing to `main` will trigger a GitHub Actions workflow that builds and publishes to GitHub Pages. The deployed URL is https://gupta-ujjwal.github.io/investment-dashboard/, so `vite.config.ts` pins `base: '/investment-dashboard/'`.

**One-time setup before the first deploy can fire:**

1. Repo **Settings → Pages → Source = "GitHub Actions"**.

## Hard constraints

See [`CLAUDE.md`](./CLAUDE.md) for the full spec. The short version:

- **Edge-only.** All portfolio data stays in the user's browser.
- **No backend.** Any "API call" is the browser hitting a public data provider directly.
- **Two markets, one app.** India (NSE/BSE, INR) and US (NYSE/NASDAQ, USD) coexist as first-class concerns.
- **Phase 1 only.** Build for India + US equities; defer crypto/MF/bonds.

## Phase 1 status — what's settled vs open

**Settled (this slice):**

- **Storage layer**: IndexedDB via [`idb`](https://github.com/jakearchibald/idb). Single `holdings` object store keyed by compound `[source, sourceSymbol]` (ticker for Vested / ISIN for Groww). Schema version 1; future migrations land in the `upgrade(db, oldVersion)` hook in `src/storage/holdings.ts`.
- **CSV / XLSX schema**: multi-source per-broker parsers (`src/parsers/vested.ts`, `src/parsers/groww.ts`) project source-specific shapes into one `CanonicalHolding`. Merge on re-import is by `(source, sourceSymbol)`; missing rows are surfaced for user keep / delete decision.
- **XLSX library**: `exceljs` — picked over SheetJS (`xlsx`) because the npm-published `xlsx` has two unpatched advisories (Prototype Pollution + ReDoS). Tradeoff: ~3× the bundle.

**Still open (later slices):**

- **Price data**: Phase 1 plan is **manual paste** — the user pastes a price snapshot and every holding stores its `priceAsOf` timestamp. No CORS-proxy, no scraping, no third-party SDK.
- **Analytics storage (SQLite-WASM?)**: when the analytics slice lands, the question of whether IndexedDB or SQLite-WASM is the right engine reopens. Two constraints captured in `implementation-docs/csv-import-vested-groww.md`: GitHub Pages can't set COOP/COEP headers (limits OPFS-VFS variants) and SQLite WASM is ~600 KB–1 MB (must be lazy-loaded behind the analytics route).

**Settled (base-currency slice):**

- **FX**: live fetch from [Frankfurter](https://frankfurter.dev) (`api.frankfurter.dev/v1/latest`) — ECB daily, CORS-open, no key. Single outbound HTTP call per import-commit and per user-clicked "Refresh FX". Range-validated (rate must be in `(1, 1000)`) and 3-second timed-out. Manual-rate paste in Settings is the offline fallback.
- **Base currency**: configurable in Settings (default INR). Each holding stores `fxRate`/`fxAsOf`/`avgBuyPriceBase` so Holdings and Analytics are pure read-views — refresh is the only cache-invalidator.
