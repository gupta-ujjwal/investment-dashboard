# P0 + P0.5 trust & consistency fixes

> Implemented via `/brainstorm` → `/develop` on 2026-06-28.

## What
Three trust/consistency fixes to the dashboard, so the numbers it shows agree with each other and
read honestly — drawn from the product audit's P0/P0.5 tier (findings #1, #2, #3 under the #6 trust
gate; the privacy-consent #4 and net-worth-relabel #5 findings are deliberately out of scope).

1. **#1 — Investments shows real asset classes.** The Investments tab grouped every imported holding
   by market and labeled them all "Equity", contradicting Overview's class breakdown and the per-row
   class chips. It now groups by `(asset class × market)` and labels each row by its true class
   (Equity / ETF / Mutual Funds / InvIT / Other).
2. **#2 — Planning sees the whole portfolio.** Planning's risk allocation read only manually-added
   assets and was blind to ~86% of a typical (import-heavy) portfolio. Imported holdings now carry a
   risk band **derived from their asset class**, with an optional **per-holding override** set from the
   holdings row menu. This adds one optional `riskBand?` scalar to `CanonicalHolding`.
3. **#3 — "STALE" reframed to "as of `<date>`".** The alarming red "STALE" badge — which fires for a
   whole market whenever you import two brokers on different days — is reframed as a muted, informative
   "as of `<import date>`" chip. The underlying staleness *computation* (dsl.md R8) is unchanged.

Files: `src/lib/investments.ts`, `src/lib/netWorth.ts`, `src/lib/planning.ts`, `src/lib/riskBand.ts` (new),
`src/storage/holdings.ts`, `src/storage/restoreBackup.ts`→`src/lib/restoreBackup.ts`, `src/App.tsx`,
`src/routes/InvestmentsRoute.tsx`, `src/routes/PlanningRoute.tsx`, `src/routes/EquityRoute.tsx`,
`src/components/HoldingRow.tsx`, `src/components/HoldingActionsMenu.tsx`, `src/components/HoldingForm.tsx`,
plus tests (`investments`, `planning`, `riskBand`, `restoreBackup`). External surface: one optional scalar
on the holdings IndexedDB record — `DB_VERSION` stays 5 (optional-scalar additions don't bump it).

## Why
A personal-finance dashboard is a trust instrument: one number that disagrees with another, or a planning
tab blind to most of the portfolio, undermines confidence in every correct figure beside it. The audit
ranked these as the highest-severity issues because they are *wrong/misleading numbers*, not missing
features.

**Approaches considered.** (1) One branch, three commits ordered #1 → #3 → #2, extending existing patterns —
**chosen**. (2) Split #1+#3 (pure render, no storage) from #2 (storage+UI) into two PRs — kept as the
fallback if the additive-field round-trip test failed or the override UI grew. (3) Store the derived band on
every holding at import — **rejected**: it violates "derive don't store" (a stored derived value goes stale
when the map changes; `netWorth.ts`/`holdingsView.ts` prove derive-at-read is the house style). Approach 1
won because the three fixes share the "trust" theme and the storage change turned out to be a sanctioned
optional-scalar addition (no migration), so a second PR boundary was unnecessary; commit ordering still gives
the two pure fixes independent revertability.

**The key scope decision (#2):** the user chose derive **+ per-holding override** over derive-only. The
`assetClass → RiskBand` default map is the trust surface, and the holding asset-class enum has only five
values (it can't tell a debt ETF from an equity ETF), so the map is deliberately coarse — diversified classes
default to the conservative middle and the override is the documented correction:

| assetClass | derived band | rationale |
|---|---|---|
| equity | high | direct single-stock risk |
| etf / mf / invit | moderate | diversified / income; composition unknown at holding level |
| other | (undefined → bucketed "untagged") | unknown — never guessed |

**Plan-review dispositions (all FIX, folded in):** pinned the full default map; reused Planning's existing
`'untagged'` bucket so the fold never drops an unmapped/unpriced holding (slices always reconcile to 100% of
priced value); scoped the #6 gate to *computed* numbers (the band is an overridable classification, not a
number); kept a muted visual affordance on #3 rather than removing the signal; enumerated the #1 row-`key`
consumers before changing it; made the additive-field round-trip test the merge gate; validated the new
`riskBand` on the restore path so a corrupt value can't restore as garbage.

**Pre-mortem / rollback.** Most-likely failure was an `other`-class holding being dropped from the fold
(slices summing <100%) — guarded by the `?? 'untagged'` bucket and a reconcile test. Rollback is per-fix
`git revert` (commits ordered so #1/#3 revert independently of #2); no `DB_VERSION` bump means there is no
migration to reverse — a reverted build simply ignores any orphan `riskBand` field, which the restore
round-trip test proves.

## How
Implemented as three logical commits on `feat/p0-trust-correctness-fixes` off `origin/main`.

**#1 — Investments grouping.** `deriveEquityRows` → `deriveHoldingsRows` in `lib/investments.ts`: buckets open
holdings by `(market, assetClass)` over a fixed `CLASS_ORDER` (India before US, stable order), labeling each
row `${HOLDING_GROUP[assetClass]} · ${India|US}` and carrying `assetClass` + `classLabel`. `HOLDING_GROUP` was
promoted from module-private in `netWorth.ts` to an exported single source of truth (the same map Overview's
allocation already used). The row type/discriminant/key renamed `EquityDerivedRow`/`equityDerived`/`equity:<m>`
→ `HoldingsDerivedRow`/`holdingsDerived`/`holdings:<class>:<m>` (the key is consumed only as a React list key;
all consumers were in the three diffed files). `InvestmentsRoute.tsx` renders `row.classLabel` instead of the
hardcoded "Equity" and the ambiguous "Equity: 2" KPI became "Holdings: N imported positions".

**#2 — Planning sees the portfolio.** New tested `lib/riskBand.ts` with `deriveBand(assetClass)`,
`effectiveBand(holding) = holding.riskBand ?? deriveBand(...)`, and `isBandOverridden`. `CanonicalHolding`
gained an optional `riskBand?` (override only); `setHoldingRiskBand(key, band|undefined)` writes it in one
readwrite tx mirroring `setHoldingStatus` (passing `undefined` deletes the field → reverts to derived). A
`setRiskBand` action intent (with an `isRiskBand` guard; empty `band` = Auto) wires through `holdingsAction`;
`HoldingActionsMenu` gained a "Risk band" group (Safe / Moderate / High / Auto, marking the current effective
band) and `RowActions.onSetRiskBand` threads it from `EquityRoute`. `planningLoader` now fetches holdings, and
`riskAllocation(holdings, assets, targets)` folds both — holdings via `effectiveBand(h) ?? 'untagged'`, open +
priced only, partial-aware. `restoreBackup.ts`'s `validateHolding` now validates the `riskBand` value (mirroring
the asset path) and preserves it through restore.

**#3 — staleness presentation.** `StaleMarker` → `AsOfMarker` in `HoldingRow.tsx`: visible label "as of
`<date>`", neutral `bone` tone (was ember red), informative tooltip; still gated by `row.isStale`, so R8's
computation is untouched.

**Conventions / anchors honored:** dsl.md decision-guide (optional scalar → no `DB_VERSION` bump; upgrade
comment updated), R1 (partial values), R3 (single readwrite tx), R8 (computation unchanged), R12 (closed rows
excluded); derive-don't-store house pattern; existing token palette in the new menu group.

**Verification.** `tsc -b --noEmit` clean; `vite build` succeeds; full Vitest suite **230 passed** (added
`riskBand.test.ts`, extended `investments`/`planning`/`restoreBackup` tests — including the fold reconcile-to-100%
and the backup round-trip/downgrade-tolerance gates). Playwright on the seeded two-market portfolio confirmed:
Investments shows distinct ETF/MF/InvIT rows; Planning risk mix reads High 66.5% / Moderate 19.7% / Untagged
13.8% (was "Untagged 100%" of just the ₹5L manual asset); setting an MF to High via the row menu moved exactly
its value Moderate→High end-to-end; holding chips read "as of `<date>`" with no "stale" word remaining; zero new
console errors (the one warning is the pre-existing react-router HydrateFallback on `main`).

**Review.** `/deep-review` ran clean — Block: 0, Request changes: 0, Follow-up: 0, Nit: 0.

No formatter is configured in this project, so style was applied by hand and matches the surrounding code.
