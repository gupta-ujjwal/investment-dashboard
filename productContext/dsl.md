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

**Holding** — A single position in the portfolio. Represented by `CanonicalHolding` (`storage/holdings.ts:25-58`):
- `source`: origin (`'vested'` | `'groww'` | `'manual'`) — see **Source** and **BrokerSource** below
- `sourceSymbol`: ticker (Vested, manual) or ISIN (Groww) — compound key with `source`
- `quantity`, `avgBuyPrice`: native currency figures
- `currency`: `'INR'` or `'USD'`
- `assetClass`: `'equity' | 'mf' | 'etf' | 'invit' | 'other'`
- `importedAt`: ms timestamp of last import (for manual rows this mirrors `createdAt`)
- Optional FX fields: `fxRate`, `fxAsOf`, `avgBuyPriceBase`, `currentPrice`, `currentPriceBase`
- Optional status + audit fields: `status?: 'open' | 'closed'` (default `'open'` when absent — see **R12**), `createdAt?: number` (immutable first-write), `updatedAt?: number` (every-write)
- `manualOverrides?: OverridableField[]` — sticky per-field overrides for broker rows. Fields listed here win over future broker re-imports (see **R13**). `undefined` or absent when no overrides; never `[]` (R1).

**Derived Row** — A holding augmented with computed view figures (`lib/holdingsView.ts:30-48`):
- `investedNative` = quantity × avgBuyPrice (always defined)
- `currentValueNative` = quantity × currentPrice (undefined if no price)
- `investedBase` = quantity × avgBuyPriceBase (undefined if no FX stamp)
- `currentValueBase` = quantity × currentPriceBase (undefined if no price or FX)
- `profitAbsBase` = currentValueBase − investedBase (undefined if either is)
- `profitPct` = (currentPrice − avgBuyPrice) / avgBuyPrice (undefined if no price or zero buy price)
- `isStale` = importedAt < newest import in the set (always `false` when `status === 'closed'` — a closed position cannot go stale)

**Partial value** — Any field whose type is `number | undefined`. `undefined` means "not computable", never a sentinel `0` or `NaN`. Rendered as `—` in the UI (`HoldingsTable.tsx:63`, `format.ts:15`).

**Base currency** — The reporting currency configured in Settings (`'INR'` or `'USD'`, default `'INR'`). All base-currency figures are stamped at import/refresh time, not computed at render time (`base-currency-settings.md:46`).

**Snapshot** — A daily portfolio record in `historySnapshots` (`history.ts:16-25`). Keyed by `YYYY-MM-DD` (local zone). Overwrites on same-day re-import. Embeds full holdings state so it is reconstructable later.

**FX stamp** — The act of attaching `fxRate`/`fxAsOf`/`avgBuyPriceBase`/`currentPriceBase` to a holding. Happens at import commit and on explicit "Refresh FX" click. Destructive overwrite — previous stamps are lost (`refreshFx.ts:12-30`).

**Source** — A holding's origin. Three values today: `'vested'` (US, ticker-keyed, 3-sheet XLSX), `'groww'` (India, ISIN-keyed, row-11 header XLSX), and `'manual'` (direct-CRUD via the holdings page form — never flows through a parser). The parser set is extensible but each broker source needs its own parser.

**BrokerSource** — `Exclude<Source, 'manual'>` (`storage/holdings.ts:7-10`). The import wizard and diff path are typed against `BrokerSource`, not `Source`, so the compiler enforces that no `'manual'` row reaches a parser or `diffHoldings` (preserves R7 by construction).

**OverridableField** — One of `'quantity' | 'avgBuyPrice' | 'currentPrice' | 'name' | 'assetClass'` (`storage/holdings.ts:14-19`). The set of fields a user can override on a broker-imported row; listed fields are sticky across re-imports (R13). Identity-shape fields (`source`, `sourceSymbol`, `currency`) are deliberately not in the set — changing them produces a different row.

**Status** — `'open'` (default; absent → treated as `'open'`) or `'closed'`. Closed rows persist in storage and in any `historySnapshots` that captured them (R12), drop out of `/holdings` and analytics by default, and can be re-opened via the row menu or by a re-import that delivers the row again (`diff.ts` flips `closed → open` on a re-import update).

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

### R10. External API calls follow the opt-in consent model
Live prices, news, and the AI agent are the only sanctioned external-egress features. Each is **off by default**, requires a user-supplied API key stored in IndexedDB, and is gated by both a global "External APIs" master switch and a per-feature toggle in Settings (`CLAUDE.md` — Privacy first). The AI agent sends holdings (not just tickers) and additionally requires a separate explicit consent dialog before first use. No code path may originate an external request without satisfying these gates. Today's only external call (Frankfurter FX) is exempt because it sends no portfolio data — only currency codes; if that ever changes, it falls under the doctrine.

### R11. Holdings are positional; transactions are an additive future store
The primary rendering path is **positional**: `CanonicalHolding` stores current quantity + avg buy price, and each import overwrites the previous snapshot (`storage/holdings.ts:25-58`, `holdings.ts:117-128`). The decision (issue #19) is to keep this as the rendering path and add an **optional `transactions` store alongside `holdings`** — populated only when a transaction-flavoured broker export is provided. Transactions unlock realized P&L, dividend ledger, STCG/LTCG split, and XIRR (#23 and the XIRR slice of #24); they never replace positional rendering. Today's analytics (unrealized P&L, allocation, top movers, value-over-time) stay positional and are unaffected. Implementation is tracked in a follow-up issue; this rule exists so the dependency is visible before either store grows.

### R12. Closed rows persist indefinitely; the only removal verb is Delete forever
`status:'closed'` rows stay in the `holdings` store and in any `historySnapshots` that captured them — they are never auto-purged or expired (`storage/holdings.ts:52-55`). `isStale` is suppressed on closed rows (`holdingsView.ts:84`). The user-facing removal paths are: (a) overflow-menu **Delete forever** (with confirm panel + 5s undo toast), and (b) the import wizard's missing-row prompt choosing **Delete** for a still-missing row. **Mark as closed** and the `closed → open` re-import flip are the reversible paths; neither destroys data. Snapshots are deliberately untouched so historical valuations of closed positions stay reconstructable for analytics (R6 still applies — base-currency containment).

### R13. Manual overrides are sticky across broker re-imports
When a user edits a broker-imported row (inline-cell on desktop, modal on mobile, or the row's `update` action), every changed field is unioned into `manualOverrides` inside the same IDB readwrite tx via `upsertHolding(row, { addOverrides })` (`storage/holdings.ts:139-157`). On the next broker import, `diffHoldings`'s update path calls `mergeWithOverrides(existing, incoming)` (`storage/holdingMerge.ts`, `parsers/diff.ts:46-58`); fields listed in `existing.manualOverrides` keep the user's value; non-overridden fields take the broker's. The `✎ edited` badge marks affected rows; the only restoration to broker truth is the per-row **Revert to broker** action, which clears the set via `revertHoldingOverrides`. The set is `undefined` or absent when empty — never `[]` (R1).

### R14. Live-price refresh must respect `manualOverrides` (forward-compat for issue #10)
Issue #10's live-price fetch is not yet implemented, but when it lands it MUST skip the `currentPrice` field on any row where `'currentPrice' ∈ row.manualOverrides`. The user's asserted price wins over a provider-asserted price — the sticky-override lattice from R13 extends to the live-price path even though no broker import is involved. Equivalently: live-price is a third write path for `currentPrice` (after parser-stamped + user-edited), and the override set sits above it. Today's only `currentPrice` writer is the broker parser, so the rule has no enforcement site yet — it exists so #10's design respects it from day one.

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

1. **Live price feed implementation** — the privacy doctrine now permits opt-in external calls (see R10 and `CLAUDE.md` — Privacy first), but the live-price feature itself is still undesigned. Provider choice (Alpha Vantage was the lone survivor of the May 2026 survey, 25 req/day free tier) and quota strategy are open. Tracked by issue #10.
2. **Broker parser expansion** — Only Vested and Groww are implemented. The architecture supports more sources but no roadmap is documented.
3. **SQLite-WASM vs IndexedDB for analytics** — `csv-import-vested-groww.md:37` flags this as an open question for a future analytics-heavy phase. Not decided.
4. ~~**Restore-from-backup UX**~~ — Resolved. Settings → Data → Restore picks a backup `.json`, validates the schema, previews a 3-up diff, and atomically replaces every holding on confirm (`routes/DataBackupSection.tsx`, `lib/restoreBackup.ts`, `storage/holdings.ts:restoreAllHoldings`). Replace-only semantics: merge-on-restore is a future option, not the current behaviour.
