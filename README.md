# Investment Dashboard

Edge dashboard for tracking personal investments across the Indian and US stock markets. Everything runs in the browser — no backend, no accounts, no telemetry. Hosted as a static bundle on GitHub Pages.

> **Status:** Phase 1 scaffold. The current build renders a placeholder shell; CSV import, holdings storage, manual price snapshots, and the allocation view land in the next slice.

## Stack

- **React 19 + TypeScript** on **Vite 8** — static build, no SSR
- **Tailwind CSS 4** via `@tailwindcss/vite`
- **GitHub Actions → GitHub Pages** for deploys

Future slices add Dexie (IndexedDB) for holdings, PapaParse for CSV, Recharts for analytics, and decimal.js for money math. Not pulled in until the first feature actually needs them.

## Local development

```bash
npm install
npm run dev        # http://localhost:5173/investment-dashboard/
npm run build      # tsc -b && vite build → dist/
npm run preview    # serve the built bundle
npm run typecheck  # tsc -b --noEmit (also the /do check command)
```

## Deploy

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds and publishes to GitHub Pages. One-time repo setup: **Settings → Pages → Source = "GitHub Actions"**.

The deployed URL is https://gupta-ujjwal.github.io/investment-dashboard/, so `vite.config.ts` pins `base: '/investment-dashboard/'`.

## Hard constraints

See [`CLAUDE.md`](./CLAUDE.md) for the full spec. The short version:

- **Edge-only.** All portfolio data stays in the user's browser.
- **No backend.** Any "API call" is the browser hitting a public data provider directly.
- **Two markets, one app.** India (NSE/BSE, INR) and US (NYSE/NASDAQ, USD) coexist as first-class concerns.
- **Phase 1 only.** Build for India + US equities; defer crypto/MF/bonds.

## Phase 1 open decisions

These are deliberately *not* settled in the scaffold — each gets a real conversation when the relevant feature is built:

- **Storage layer**: IndexedDB (via Dexie) is the working assumption; not yet committed.
- **Price data**: Phase 1 uses **manual paste** — the user pastes a price snapshot and every holding stores its `priceAsOf` timestamp. No CORS-proxy, no scraping, no third-party SDK.
- **FX**: same manual-paste model for USD↔INR until we have a CORS-friendly source.
- **CSV schema**: one canonical schema first; multi-broker import is a later slice.
