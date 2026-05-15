# Research: base-currency-settings

## Codebase findings

### Persistence
- `src/storage/holdings.ts:24-45` — IndexedDB is opened via `idb`'s `openDB` with one store (`holdings`), keyPath `['source','sourceSymbol']`, version 1. The upgrade callback uses `oldVersion < 1` to gate creates, so an additive bump to version 2 just adds another guarded branch (`if (oldVersion < 2)`) — no destructive migration needed. Adding a second store (`settings`) inside the same DB keeps single-DB invariants and means the existing `getDB()` singleton serves both.
- `src/storage/holdings.ts:8-17` — `CanonicalHolding` is a flat record. Adding optional fields `fxRate?`, `fxAsOf?`, `avgBuyPriceBase?` requires no migration code; old rows still satisfy the shape because the fields are optional. (The schema isn't enforced at the IDB layer — IDB just stores the JS object — so absent fields are simply absent.)
- `src/storage/holdings.ts:63-73` — `commitImport` is a single read/write transaction over `inserts/updates/deletes`. Same call shape works for stamped-with-FX rows.
- `src/storage/holdings.ts:75-86` — `exportSnapshot()` already wraps holdings in a JSON envelope with `schemaVersion`. Versioning is already in the export format, so adding settings to it later is trivial.

### Render-time compute today (what the user wants to eliminate for FX)
- `src/routes/AnalyticsRoute.tsx:153-173` — `aggregate(holdings)` walks every row, branches on `h.currency`, and sums two independent totals (`inrCost`, `usdCost`). No cross-currency aggregation today. To add a "Total in base" KPI, we either (a) sum `quantity * avgBuyPriceBase` over rows in the same `aggregate` walk, or (b) precompute and cache. The user picked light model (Q2), so we extend the existing reduce.
- `src/components/HoldingsTable.tsx:59-96` — desktop table shows `cost = h.quantity * h.avgBuyPrice` and renders `formatMoney(cost, h.currency)`. Adding one more column showing `formatMoney(h.quantity * h.avgBuyPriceBase, baseCurrency)` (or `—` if undefined) is a minimal extension. Mobile card mirror: line 134.
- `src/routes/HoldingsRoute.tsx:27-28` — already filters by currency to build the caption ("3 INR · 2 USD"). Doesn't need to change for FX; might gain a `needsRefresh` count from the loader.

### Import flow — where FX needs to slot in
- `src/routes/import/ImportRoute.tsx:1-42` — wizard is a reducer-driven state machine: `pick-source → instructions → upload → preview → committing → done`. FX fetch can hook into any step but the "stamp at commit" pattern lives in `PreviewStep`.
- `src/routes/import/PreviewStep.tsx:22-39` — `handleCommit` is the only place that writes to storage. Adding `await fetchUsdInrRate()` before `commitImport`, then mapping over `state.diff.inserts/updates` to stamp `fxRate`/`fxAsOf`/`avgBuyPriceBase`, is the smallest possible insertion. Failure handling already exists (`commit-failed` action carries a `message`), so an FX failure can reuse it or fall through to cached rate (see fx.ts design below).
- `src/routes/import/wizardState.ts:24-29` — `commit-failed` carries a plain string message. The existing failure UI in `PreviewStep.tsx:94-101` renders this as "commit failed · …". We can reuse this for FX failures with a clear message, or distinguish FX-failure into its own action variant. Recommendation: reuse — one failure surface is simpler.
- `src/parsers/diff.ts:30-44` — `diffHoldings` operates on `CanonicalHolding[]` and is purely structural (matches by `sourceSymbol`). It doesn't touch `fxRate`/`avgBuyPriceBase`, so stamping FX *after* the diff is computed (i.e., on inserts+updates before commit) keeps the diff logic untouched.

### App-level loaders
- `src/App.tsx:8-30` — `holdingsLoader = async () => getAll()` is shared by `/analytics` and `/holdings`. To surface base-currency info on those pages (header label "Cost (₹)" / refresh-needed banner), the loader must also fetch settings. Cleanest: `holdingsLoader` becomes a small object loader `async () => ({ holdings: await getAll(), settings: await getSettings() })`. The two awaits can be `Promise.all`'d.
- `src/App.tsx:18-21` — index loader redirects based on `holdings.length`. After settings exist, we could also gate on "is base currency set?" but the default-INR semantics mean we don't need to — there's always a base.
- `SettingsRoute` currently has no loader (`src/App.tsx:25`). It'll need one to populate the form.

### Formatting
- `src/lib/format.ts:1-17` — `formatMoney(amount, currency)` is currency-aware via two pre-built `Intl.NumberFormat` instances. New base-currency column reuses this directly: `formatMoney(qty * baseAvg, settings.baseCurrency)`. No changes needed unless we add the "Indian locale" radio's effect on plain-number formatting, which only matters for non-currency numbers and can be deferred.

### Tests
- `src/parsers/diff.test.ts:17`, `src/parsers/groww.test.ts:19`, `src/parsers/vested.test.ts:18` — all assert on `currency`. None will break with the additive schema. New tests needed: settings store CRUD, fx.ts (mock fetch), the import-commit FX stamping path, and the analytics aggregate when a holding has undefined base.

## Internet findings

### Frankfurter (chosen FX provider)
- Probed live at `2026-05-15T06:30Z`: `GET https://api.frankfurter.dev/v1/latest?from=USD&to=INR` → `200`, body `{"amount":1.0,"base":"USD","date":"2026-05-14","rates":{"INR":95.77}}`. CORS headers present (`access-control-allow-origin: *`), `cache-control: public, max-age=86400`. No API key. Source: ECB daily reference rates.
- The old `api.frankfurter.app` host returns a 301 to the new `api.frankfurter.dev/v1/...` path. Use the v1 path directly in code to avoid the redirect roundtrip.
- Granularity: **daily**. The response's `date` field is the date the rate is valid for (e.g., today's call returned yesterday's date — ECB publishes after close). Implication for our model: `fxAsOf` should record *when we fetched it* (client time), not the API's `date`. We can surface both in Settings ("Last refreshed: 2026-05-15 12:00 IST · ECB rate for 2026-05-14"), but only the fetch timestamp is load-bearing for the "is the cached rate stale" question.
- Rate limit: not officially documented. Frankfurter is fronted by Cloudflare with a 1-day public cache, so even an aggressive user clicking Refresh repeatedly mostly hits cache, not the origin.

### Why not alternatives
- `exchangerate.host` — went paid in 2024; free tier now key-gated. Adds an env var and a secret, which violates "static bundle, no server" cleanliness (the key would ship in the JS).
- `open.er-api.com` — works and is CORS-friendly, but maintained by one person without ECB backing. Frankfurter is a safer default.
- Embedding a manual-rate-only fallback satisfies the privacy/offline corner; the chosen `fx.ts` design (fetch with cache fallback, plus a manual "paste rate" override in Settings if both fail) covers this without a second provider.

### Currency conversion math
- For base = INR, USD holding with `avgBuyPrice = 100`: rate `{from: USD, to: INR}` = 95.77, so `avgBuyPriceBase = 100 * 95.77 = 9577 INR`. Trivial; one multiplication per row.
- For base = USD, INR holding with `avgBuyPrice = 100`: we need the inverse rate. One Frankfurter call with `from=INR&to=USD` works, OR we keep `from=USD&to=INR` (one call) and invert (`1 / 95.77`). Either is fine. Recommendation: always fetch with `from=USD&to=INR` (single canonical rate), invert in code when base = USD. Keeps the cache simple — only one number to store globally.
