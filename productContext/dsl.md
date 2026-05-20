# Investment Dashboard — DSL & Rules Reference

> What the rules are. Skills read sections by anchor ID — update this file when terminology, constraints, or reviewer guidance changes.

## How skills use this file

This file is built for section-targeted reads. When a skill is told to read `dsl.md` § `<anchor-id>`, it finds the line `<a id="<anchor-id>"></a>` and reads to the next heading. The Section Index below is the map.

## Section Index

| Anchor | Section | Use when |
|---|---|---|
| `dsl-terminology` | 1. Terminology | understanding domain vocabulary |
| `dsl-domain-rules` | 2. Domain Rules | reasoning about data transformations |
| `dsl-decision-guide` | 3. Reviewer Decision Guide | deciding whether a change is safe |
| `dsl-gaps` | 4. Gaps / Unverified | surfacing open questions |

<a id="dsl-terminology"></a>
## 1. Terminology

**Holding** — A single position in the portfolio. Represented by `CanonicalHolding` (`storage/holdings.ts:9-29`):
- `source`: broker origin (`'vested'` | `'groww'`)
- `sourceSymbol`: ticker (Vested) or ISIN (Groww) — compound key with `source`
- `quantity`, `avgBuyPrice`: native currency figures
- `currency`: `'INR'` or `'USD'`
- `assetClass`: `'equity' | 'mf' | 'etf' | 'invit' | 'other'`
- `importedAt`: ms timestamp of last import
- Optional FX fields: `fxRate`, `fxAsOf`, `avgBuyPriceBase`, `currentPrice`, `currentPriceBase`

**Derived Row** — A holding augmented with computed view figures (`lib/holdingsView.ts:30-48`):
- `investedNative` = quantity × avgBuyPrice (always defined)
- `currentValueNative` = quantity × currentPrice (undefined if no price)
- `investedBase` = quantity × avgBuyPriceBase (undefined if no FX stamp)
- `currentValueBase` = quantity × currentPriceBase (undefined if no price or FX)
- `profitAbsBase` = currentValueBase − investedBase (undefined if either is)
- `profitPct` = (currentPrice − avgBuyPrice) / avgBuyPrice (undefined if no price or zero buy price)
- `isStale` = importedAt < newest import in the set

**Partial value** — Any field whose type is `number | undefined`. `undefined` means "not computable", never a sentinel `0` or `NaN`. Rendered as `—` in the UI (`HoldingsTable.tsx:63`, `format.ts:15`).

**Base currency** — The reporting currency configured in Settings (`'INR'` or `'USD'`, default `'INR'`). All base-currency figures are stamped at import/refresh time, not computed at render time (`base-currency-settings.md:46`).

**Snapshot** — A daily portfolio record in `historySnapshots` (`history.ts:16-25`). Keyed by `YYYY-MM-DD` (local zone). Overwrites on same-day re-import. Embeds full holdings state so it is reconstructable later.

**FX stamp** — The act of attaching `fxRate`/`fxAsOf`/`avgBuyPriceBase`/`currentPriceBase` to a holding. Happens at import commit and on explicit "Refresh FX" click. Destructive overwrite — previous stamps are lost (`refreshFx.ts:12-30`).

**Source** — A broker data origin. Currently `'vested'` (US, ticker-keyed, 3-sheet XLSX) and `'groww'` (India, ISIN-keyed, row-11 header XLSX). The parser set is extensible but each source needs its own parser.

<a id="dsl-domain-rules"></a>
## 2. Domain Rules

### R1. Partial values propagate absence, never use sentinels
Any computation over a `number | undefined` field must return `undefined` if any input is `undefined`. `sumDefined` (`analytics.ts:13-20`) is the canonical pattern. Sorting a partial column must sink `undefined` to the bottom in both directions (`holdingsView.ts:141-156`).

### R2. FX stamping is the only write path for base-currency figures
`avgBuyPriceBase` and `currentPriceBase` are never computed in render code. They are stamped by `stampHolding` (`refreshFx.ts:12-30`) and written via `commitImport` (`holdings.ts:87-97`). The Settings "Refresh FX" button and the import commit are the only triggers.

### R3. Import commit is atomic; snapshot is best-effort
`commitImport` runs inside one IndexedDB readwrite transaction — inserts, updates, deletes are all-or-nothing (`holdings.ts:87-97`). The subsequent `recordSnapshot` (`history.ts:54-59`) is wrapped in `try/catch` and logs a warning on failure — it must never block the import-complete screen (`PreviewStep.tsx:64-71`).

### R4. Effective rate is canonical: one USD→INR fetch
FX is always fetched as `from=USD&to=INR` (`fx.ts:8`). For `INR→USD` base, the inverse is computed in code (`fx.ts:86`). No dual API calls.

### R5. Current price is optional and gated by column presence
Brokers may drop the current-price column from exports. The parser checks `mapHeaderColumns.has(columnName)` before reading; absent column → `currentPrice = undefined` (not `0`). `cellNumberOrUndefined` (`xlsx-utils.ts:31-43`) must be used for optional numeric columns. `cellNumber` returns `0` for empty cells — dangerous for prices.

### R6. History records are base-currency-scoped
A `HistoryRecord` stores the `baseCurrency` it was captured in (`history.ts:16-25`). When folding into `valueSeries`, records with a different base are skipped — there is no historical FX to honestly re-base them (`analytics.ts:152-153`).

### R7. Source containment in diff
`diffHoldings` enforces that every existing and incoming row matches the requested `source` (`diff.ts:14-27`). Cross-source diff is a programming error, not a user scenario.

### R8. Staleness is relative to the newest import
A holding is stale if its `importedAt` is older than the maximum `importedAt` across the entire portfolio (`holdingsView.ts:82`). This means after importing from one broker, the other broker's holdings appear stale until also re-imported.

### R9. Feature flags are compile-time constants
`FEATURE_BASE_CURRENCY` and `FEATURE_HISTORY` (`featureFlags.ts:1-2`) are boolean exports, not runtime config. Disabling hides UI but does not revert schema. The v3 `historySnapshots` store exists regardless of the flag.

### R10. No live price API in Phase 1
The current price comes from broker export snapshots only. Any mention of fetching live prices from Yahoo Finance, Alpha Vantage, etc. must be flagged as out of scope (`CLAUDE.md:28`).

<a id="dsl-decision-guide"></a>
## 3. Reviewer Decision Guide

### When changing storage / IndexedDB
- **Additive only.** Use `oldVersion < N` guards in the `upgrade` callback. Never alter or drop existing stores or indexes (`holdings.ts:49-65`).
- **No backfill in upgrade.** Populate new stores lazily on the next user action (e.g. next import). Keeps the migration instantaneous.
- **Bump `DB_VERSION`** when adding a store or index. Do not bump for optional scalar fields on existing records.
- **Test both paths:** fresh DB (v0→vN) and upgrade (vN-1→vN).

### When adding a new broker parser
- **Create a new file** in `src/parsers/` rather than parameterising `vested.ts` or `groww.ts`.
- **Use named-column lookup**, never positional parsing. Call `mapHeaderColumns` then check `.has(columnName)` before reading (`xlsx-utils.ts:45-52`).
- **Return `ParseResult`** (`types.ts:3-6`) with `rows` and `skipped`.
- **Unit test with a fixture** in `tests/fixtures/` plus a programmatic "column absent" case.
- **Asset class inference** should follow the existing heuristic pattern (`vested.ts:105-109`, `groww.ts:104-116`).

### When changing FX / currency logic
- **Fetch from Frankfurter only.** No additional FX APIs without explicit discussion (`CLAUDE.md:28`).
- **Validate the rate** in `fetchUsdInrRate`: finite, in range `(1, 1000)` (`fx.ts:59-77`).
- **Preserve the 3-second timeout** on the fetch (`fx.ts:25-26`).
- **Stamp, don't compute at render.** Any new base-currency field must be stamped in `stampHolding` and committed via `commitImport`.
- **Manual rate fallback** must validate the same range before stamping (`refreshFx.ts:60-63`).

### When changing analytics / charts
- **Keep Recharts out of the initial bundle.** Default-export the chart panel so the parent can `React.lazy()` it (`ChartsPanel.tsx:28`).
- **Wrap each chart in `ChartErrorBoundary`.** One bad chart must not white-screen the page (`ChartErrorBoundary.tsx:12-34`).
- **Provide `role="img"` + `aria-label`** on chart containers for screen readers (`AllocationDonut.tsx:84`, `ValueOverTime.tsx:78`).
- **Pure folds only.** `lib/analytics.ts` must stay I/O-free. Any new aggregation belongs there, not in a component.

### When changing the import wizard
- **Wizard state is `useReducer`.** Do not introduce a state machine library for a linear flow.
- **Commit is the only mutating step.** All prior steps (upload, preview) are read-only.
- **Missing rows require explicit user decision.** Default to `'keep'` but surface the choice in the UI (`PreviewStep.tsx:193-278`).
- **Backup download must stay available** on the preview step (`PreviewStep.tsx:79-89`).

### When changing UI / Tailwind
- **Respect the token palette.** Ink (backgrounds), bone (text), tick (accent), jade (gain), ember (loss). No new colours without design rationale.
- **Mobile-first responsive.** Desktop table + mobile card layout pattern exists in `HoldingsTable.tsx`.
- **Reduced motion:** decorative animations (`.reveal`) must respect `prefers-reduced-motion` (`index.css:173-179`). Functional animations (spinners) are exempt.

<a id="dsl-gaps"></a>
## 4. Gaps / Unverified

1. **Live price feed decision** — `CLAUDE.md:28` and `holdings-filters-sort-columns.md:11` both defer live prices to a future slice. No design exists yet.
2. **Broker parser expansion** — Only Vested and Groww are implemented. The architecture supports more sources but no roadmap is documented.
3. **SQLite-WASM vs IndexedDB for analytics** — `csv-import-vested-groww.md:37` flags this as an open question for a future analytics-heavy phase. Not decided.
4. **Restore-from-backup UX** — Backup download exists (`PreviewStep.tsx:79-89`), but restore is mentioned as deferred in `csv-import-vested-groww.md:25` with no design.
