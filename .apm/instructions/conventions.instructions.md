---
description: Project-wide context for the investment dashboard — scope, hard constraints, and open decisions that should shape every change.
---

Edge dashboard for tracking personal investments across stock markets. All data stays on the user's device; there is no backend.

## What it is

A static web app, hosted on GitHub Pages, where a user can:

- Import their investment holdings via CSV upload, or add them manually one at a time.
- See analytics over their portfolio (allocation, P&L, performance over time, etc.) computed entirely client-side.

## Scope

**Phase 1: India + US equity markets.**
Later phases may add other markets, asset classes (crypto, MF, bonds), or instruments — but do not design speculatively for them. Build only what Phase 1 needs.

## Hard constraints (do not violate without an explicit conversation)

- **Edge-only / no server.** No backend, no auth service, no user accounts, no analytics pixel. All portfolio data lives in the browser (IndexedDB / localStorage / OPFS — to be chosen). Any "API call" is the user's browser hitting a public data provider directly.
- **GitHub Pages hosting.** The deployed artifact must be a static bundle. No SSR, no server-side routes, no Node-at-runtime. Build-time tooling is fine.
- **Privacy first (opt-in egress).** No portfolio data leaves the device by default. Features that require external API calls — live prices, news, AI agent — are **opt-in**, default to off on fresh installs, and require user-supplied API keys stored in IndexedDB (the user spends their own quota on their own account). **Exemption:** a no-key public *reference-rate* call that transmits no portfolio data — only a currency pair (the USD↔INR rate from Frankfurter/ECB, fetched at import and on explicit Refresh FX) — is not gated and may run by default; the opt-in requirement applies to any call that sends tickers or holdings (live prices, news, AI agent). See `productContext/dsl.md` § R10. Consent is two-layer: a global "External APIs: on/off" master switch in Settings, plus per-feature toggles. Disclosure of what data is sent, and to whom, appears at the toggle in Settings and again in a first-run onboarding banner. The AI agent — which sends holdings, not just tickers — requires a separate explicit consent dialog before first use. No first-party telemetry under any condition; be wary of third-party scripts whose ToS implies data collection.
- **Two markets, one app.** India (NSE/BSE, INR) and US (NYSE/NASDAQ, USD) must coexist in a single portfolio view. Currency conversion and per-market quirks (lot sizes, trading hours, ticker formats) are first-class concerns, not afterthoughts.

## Open decisions (not yet made — ask before assuming)

- **Framework:** React + Vite? SvelteKit static? Plain TS? Not chosen.
- **Storage layer:** IndexedDB vs localStorage vs OPFS. Depends on data volume and whether we want versioned/exportable backups.
- **Price data source:** Yahoo Finance (unofficial), Alpha Vantage, NSE/BSE endpoints (CORS issues likely), or "user pastes a price snapshot." All have tradeoffs around CORS, rate limits, and reliability. No decision yet.
- **CSV schema:** Brokers (Zerodha, Groww, Robinhood, Fidelity, …) all export differently. Whether to support N broker formats or define one canonical schema is open.
- **FX rates:** How USD↔INR is fetched and how stale rates are handled.

When a task touches one of these, surface the decision rather than silently picking.

## Repo

- GitHub: https://github.com/gupta-ujjwal/investment-dashboard
- Default branch: `main`
- Deploy target: GitHub Pages from this repo

## Working notes for the agent

- The user's email is `ujjwal.gupta@juspay.in`. They work at Juspay (payments); treat them as a senior engineer — skip beginner explanations.
- This is a personal/side project, not a Juspay project. Don't pull in Juspay-internal tooling, conventions, or repos.
- Prefer boring, well-supported tech over novel choices — the goal is a working dashboard, not a tech showcase.
- Don't introduce a backend "just for X." If a feature seems to require a server, flag it and discuss before coding.
