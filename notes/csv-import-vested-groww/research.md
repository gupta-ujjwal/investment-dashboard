# Research

## A. Codebase

The repo is a barely-scaffolded Vite + React 19 + TS + Tailwind v4 hello-world; everything in this slice is greenfield.

- `src/App.tsx:1-23` — current root renders a single hello-world `<main>` with a "Holdings" placeholder section. We replace this with a route switch.
- `src/main.tsx:6-14` — mounts `<App />` under `StrictMode` with a defensive `getElementById('root')` guard. No changes needed.
- `src/index.css:1` — just `@import "tailwindcss";`. Tailwind v4 is in via `@tailwindcss/vite` plugin (`vite.config.ts:4,7`). All styling will be utility classes; no extra CSS files needed for this slice.
- `vite.config.ts:6` — `base: '/investment-dashboard/'` for GitHub Pages subpath. Any router we add must respect this (RRv7 takes `basename`; same string).
- `package.json:11-22` — current deps are only React + React DOM + Tailwind plugin. **Zero state-mgmt lib, zero router, zero storage utils, zero test runner.** This slice will add at minimum: `idb`, `xlsx` (SheetJS), and (if Approach A) `react-router-dom`.
- `CLAUDE.md:1-58` — hard constraints reiterated: edge-only, no server, GitHub Pages static bundle, two markets (IN/US) coexist, privacy-first, prefer boring tech. Storage decision recorded today: **IndexedDB now, SQLite-WASM deferred** (see `frame.md`).
- `.claude/rules/frontend-design.md:23-57` — Playwright MCP verification is required before any UI-touching draft PR is marked ready-for-review. The wizard and list view both fall under this rule; the `/implement-lite` follow-on will need to load Playwright MCP tools and capture screenshots of empty-state, source-picker, upload, preview, and post-commit list states.
- `.agency/do.md` — referenced by the frontend-design rule as the canonical PR-evidence procedure. Not directly used by `/brainstorm-lite`, but `/implement-lite` will consume it.
- Recent commits (`git log a995d42..6b73c36`) — scaffolding only; no prior holdings-logic precedent to extend. We're defining the data-layer conventions for this codebase in this slice.

## B. Sample exports (ground truth)

Both stored at `notes/csv-import-vested-groww/samples/`.

### Groww — `Stocks Holdings Statement May 13 2026.xlsx`

Banded XLSX (not a flat CSV). Structure:

| Row | Content |
|----:|---------|
| 1   | `Name | Ujjwal Gupta` |
| 2   | `Unique Client Code | 0164139036` |
| 4   | Title: `Holdings statement for stocks as on 13-05-2026` (as-of date here) |
| 6–9 | Summary block: `Invested Value`, `Closing Value`, `Unrealised P&L` |
| 11  | **Data header row**: `Stock Name | ISIN | Quantity | Average buy price | Buy value | Closing price | Closing value | Unrealised P&L` |
| 12+ | Data rows |

**Parser implications:**
- Header is **not** row 1. Either scan for the row whose first cell equals `Stock Name`, or hardcode row 11 with a fallback scan. Scanning is more robust to future Groww layout drift.
- Persist only `Stock Name`, `ISIN`, `Quantity`, `Average buy price`. Drop `Buy value` (derivable = qty × avg), `Closing price`, `Closing value`, `Unrealised P&L` (all stale at upload).
- **Asset-class bleed**: the "stocks" export includes mutual funds (ISIN prefix `INF`, e.g. row 26 `MIRAEAMC - MAFANG` / `INF769K01HF4`), ETFs (e.g. row 32 `NIP IND ETF NIFTY BEES` / `INF204KB14I2`), and InvITs (e.g. row 23 `IRB INVIT FUND` / `INE183W23014`). User decision: **accept all**, tag `assetClass` derived from ISIN prefix + name heuristics.
- **NA-ghost rows**: rows 27 and 28 have `Stock Name = "NA"` with zero qty + zero prices. **Skip silently**, surface count in preview as `skipped: N`.
- **As-of date** is in row 4's title cell. Parsing it from there is brittle (locale, format drift). Filename also encodes it (`Stocks Holdings Statement May 13 2026.xlsx`) but the user-uploaded filename can be anything. Decision in plan: capture `importedAt = Date.now()`, do **not** parse `asOfDate` for this slice — re-add if needed.
- Currency: implicit INR (Groww). Market: implicit IN (NSE/BSE — exact exchange is in Groww's `instruments.csv` mapping, deferred).

### Vested — `Vested Holdings Dashboard.xlsx`

Clean XLSX, row-1 headers. Structure:

| Row | Content |
|----:|---------|
| 1   | Header: `Name | Ticker | Total Shares Held | Current Price (USD) | Current Value (USD) | Average Cost (USD) | Total Amount Invested (USD) | Investment Returns (USD) | Investment Returns (%) | Daily Change (USD) | Daily Change (%)` |
| 2+  | Data rows (e.g., `Apple Inc | AAPL | 2.7 | 195.27 | 527.23 | 215.19 | 581.02 | -53.79 | -9.26 | -16.44 | -3.02`) |

**Parser implications:**
- Header at row 1 — use SheetJS `sheet_to_json` with default header mode, no row-skipping.
- Persist only `Name`, `Ticker`, `Total Shares Held`, `Average Cost (USD)`. Drop `Current Price`, `Current Value`, `Returns *`, `Daily Change *` (all stale).
- **Fractional shares** are real here (`2.7`, `0.6`, `4.25`, `2.725`, `1.925`). `quantity` must be `number`, not `integer`.
- No ISIN; ticker is the natural identifier. Vested-side key for the merge.
- Currency: implicit USD. Market: implicit US (NYSE/NASDAQ — exact exchange not in file; deferred resolution).
- AssetClass: the sample has equities (`AAPL`, `AMZN`, `MSFT`, `NVDA`, etc.) and ETFs (`VOO`, `SOXX`, `ROBT`, `KTEC`). No clean prefix-based discriminator like Groww's ISIN. Heuristic: name-pattern match (`ETF`, `Fund`, `Trust`) — imperfect, acceptable for a tag that isn't load-bearing yet.

## C. External libraries (citations)

- **[SheetJS Community Edition (`xlsx`)](https://www.npmjs.com/package/xlsx)** — Apache-2.0 licensed, the de-facto Excel parser for JS. `XLSX.read(buffer, { type: 'array' })` to load, `XLSX.utils.sheet_to_json(sheet, { range: 10, header: 1 })` to start parsing from row 11 (zero-indexed `range: 10`) with header-row mode. Handles the Groww banded layout natively. Full browser build ~470 KB minified; the slim build (no XLS/XLSB/Numbers) is ~250 KB and is what we want — we only ever parse XLSX.
- **[`idb`](https://github.com/jakearchibald/idb)** — MIT, tiny promise wrapper over IndexedDB by Jake Archibald. ~1 KB gzipped. Schema versioning via `openDB(name, version, { upgrade })`. We'll define one object store `holdings` keyed by compound `[source, sourceSymbol]`.
- **[`react-router-dom` v7 (SPA mode)](https://reactrouter.com)** — the boring, well-supported router choice. SPA-mode skips the framework-mode opinions (file-based routing, SSR). For 2 routes (`/` home, `/import` wizard) this is mild overkill but earns its keep the second we add a 3rd route. TanStack Router has better TS ergonomics but is the more novel choice — passing per `CLAUDE.md`'s "boring over novel" preference.
- **Groww instruments master CSV** (deferred — for the future live-price slice, not this one): [`https://growwapi-assets.groww.in/instruments/instrument.csv`](https://groww.in/trade-api/docs/curl/instruments) provides `ISIN → NSE/BSE ticker, exchange, lot size`. We'll bundle a snapshot at build time when ticker resolution becomes load-bearing.

## D. Decisions already locked in conversation (not open in `CLAUDE.md` anymore for this slice)

- **Slice scope** = CSV/XLSX import for Vested + Groww + persist + list-view homepage. No prices, no analytics, no manual add.
- **Source attribute is first-class** on the canonical holding and visible in the list view.
- **Asset-class filter**: accept everything (equities + MFs + ETFs + InvITs); tag with `assetClass`; skip NA ghosts silently with a count.
- **Merge semantics**: by `(source, sourceSymbol)`. New row → insert. Existing → update qty + avg buy price + name. **Missing-from-upload → flag during preview, user decides keep / delete per row.**
- **Storage**: IndexedDB via `idb`. SQLite-WASM deferred with two flagged constraints for the future analytics slice: (i) GitHub Pages can't set COOP/COEP headers — OPFS-VFS variant needs a service-worker shim or fall back to non-OPFS sql.js; (ii) ~600 KB–1 MB WASM bundle weight, must be lazy-loaded behind the analytics route.

## E. Things explicitly NOT researched (out of scope for this slice)

- Yahoo Finance / Alpha Vantage / NSE direct fetch for live prices — price-data slice.
- USD↔INR FX provider selection — FX slice.
- Bundle-size budgets and code-splitting strategy — premature for a 4-file scaffold.
- A11y audit of the wizard — Playwright snapshot at `/implement-lite` time covers basic regressions; deep a11y is a polish pass.
