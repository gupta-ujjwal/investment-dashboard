# Investment Dashboard

Edge dashboard for tracking personal investments across the Indian and US stock markets. Everything runs in the browser — no backend, no accounts, no telemetry. Hosted as a static bundle on GitHub Pages.

> **Status:** Phase 1 equities are live, plus a personal-finance layer beyond the original equity-only scope: import (Vested + Groww XLSX), a unified Portfolio view, base-currency FX conversion, Overview net-worth/analytics, Budget (cash flow), and Planning (goals + risk mix) — all shipped and on by default. Manual price snapshots are still the only price-data path; live price feeds remain out of scope.

## Stack

- **React 19 + TypeScript** on **Vite 8** — static build, no SSR
- **Tailwind CSS 4** via `@tailwindcss/vite`
- **`react-router-dom` v7** in SPA mode (`createBrowserRouter`)
- **`idb`** — promise wrapper over IndexedDB; six object stores (`holdings`, `settings`, `historySnapshots`, `assets`, `budgetMonths`, `budgetTags`) at schema version 5 — see `src/storage/holdings.ts`'s `upgrade()` hook
- **`exceljs`** — XLSX parsing for Vested + Groww holdings exports; picked over SheetJS (`xlsx`) because the npm-published `xlsx` has two unpatched advisories (Prototype Pollution + ReDoS)
- **Recharts** — analytics/history charts, lazy-loaded per chart family so the ~500KB+ library isn't in the initial bundle
- **Vitest** for parser/diff/lib unit tests; fixtures at `tests/fixtures/`
- **GitHub Actions → GitHub Pages** for deploys

Money math is still plain floats — `decimal.js` remains deferred until a concrete precision bug shows up (none has at current portfolio sizes; display rounding and the partial-value discipline in `productContext/dsl.md` § R1 keep the exposure bounded).

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

## What's shipped

- **Storage layer**: IndexedDB via [`idb`](https://github.com/jakearchibald/idb), schema version 5, six object stores — `holdings` (compound key `[source, sourceSymbol]`; ticker for Vested, ISIN for Groww), `settings`, `historySnapshots`, `assets`, `budgetMonths`, `budgetTags`. Every migration since v1 is additive-only, guarded by `oldVersion < N` in the `upgrade()` hook in `src/storage/holdings.ts` — no version bump has ever dropped or reshaped existing data.
- **Import**: per-broker parsers (`src/parsers/vested.ts`, `src/parsers/groww.ts`) project source-specific XLSX shapes into one `CanonicalHolding`. Merge on re-import is by `(source, sourceSymbol)`, with per-field sticky overrides (`src/storage/holdingMerge.ts`) so a manual edit survives the next broker re-import. Missing rows surface a per-row Keep / Mark closed / Delete decision; within-file duplicate keys are deduped (last wins) with the count surfaced on the review screen, rather than crashing the commit. Required numeric cells (quantity, avg buy price) that fail to parse are skipped, never silently imported as `0`.
- **Routes**: `/overview` (net worth, allocation, history charts), `/portfolio` (holdings table + manual assets, merged Investments/Equity view), `/budget` (cash flow), `/planning` (goals + risk mix), `/import` (the wizard), `/settings`. `/analytics`, `/holdings`, `/equity`, `/investments` are legacy redirects, kept for old bookmarks.
- **FX & base currency**: live fetch from [Frankfurter](https://frankfurter.dev) (`api.frankfurter.dev/v1/latest`) — ECB daily, CORS-open, no key — the app's only outbound network call (fonts are self-hosted, not CDN-loaded). Single outbound HTTP call per import-commit and per user-clicked "Refresh FX", range-validated `(1, 1000)` and 3-second timed-out. A commit that falls back to a stale or absent rate surfaces an inline warning on the Done screen — not just a console log. Manual-rate paste in Settings is the offline fallback. Base currency is configurable in Settings (default INR); each holding stores `fxRate`/`fxAsOf`/`avgBuyPriceBase` so downstream views are pure read-views.
- **Backup/restore**: full export/restore of all six stores from Settings (`src/routes/DataBackupSection.tsx`), with a version-aware parser and a preview-before-destructive-restore step. `navigator.storage.persist()` is requested on boot as additional protection against browser storage-pressure eviction.
- **Analytics**: net-worth totals, allocation, sector/currency exposure, benchmark overlay (NIFTY 50 / S&P 500), concentration risk (top-5 weight, HHI band, single-stock flag) — all pure folds over holdings + assets, no new IndexedDB store per widget.

## Still open

- **Price data**: manual only — a holding's `currentPrice` comes from whatever the broker export carried at import time. No CORS-proxy, no scraping, no third-party quote SDK. Live price feeds are tracked as a future, explicitly opt-in feature (would require the consent-and-disclosure layer `CLAUDE.md` describes for any ticker-sending call).
- **Money math**: plain floats, `decimal.js` deferred (see Stack above).
- **Duplicate-row handling**: within-file duplicates are deduped automatically (last occurrence wins) rather than offered as a per-row Combine/Keep-one choice — a fuller picker, including quantity-weighted-average "combine" semantics for two lots of the same instrument, is a planned follow-up.
- **Broker coverage**: Vested + Groww only; Zerodha/Kuvera/Robinhood parsers are tracked but unbuilt.
