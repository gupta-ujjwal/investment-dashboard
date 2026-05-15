# Approaches

After grilling, most design knobs are pinned: light data model (Q2), Frankfurter (Q3), three settings fields (Q4), IDB store (Q5), wipe-and-reimport (Q6), "Save & refresh" combined action (Q7), import fetches fresh with cache fallback (Q8), Holdings adds one base column / Analytics promotes a Total-base KPI (Q9). The remaining open knob is **where in the import pipeline the FX fetch slots in** — that's the real axis the approaches differ on.

## Approach 1: Stamp at commit, fail soft *(recommended)*

- **Scope**: New `src/lib/fx.ts` exposing `fetchUsdInrRate()`. New `src/storage/settings.ts` exposing `getSettings()` / `saveSettings()` / `updateFxMeta()`. Holdings store gains optional `fxRate`/`fxAsOf`/`avgBuyPriceBase` (additive). DB version bumps 1 → 2 only to register the new `settings` object store.
- **FX-on-import**: hooks into `PreviewStep.handleCommit` (`src/routes/import/PreviewStep.tsx:22-39`). Call `fetchUsdInrRate()` immediately before `commitImport()`. Map `state.diff.inserts/updates` to stamp each row with `fxRate` + `fxAsOf` + `avgBuyPriceBase = avgBuyPrice * effectiveRate(currency, base, rate)`. On fetch failure: fall back to `settings.lastFxRate` (cached). If that's also absent, commit with `undefined` base fields and surface the "Refresh needed" banner on Holdings/Analytics.
- **Refresh**: Settings page's button reads the same `fetchUsdInrRate()`, then walks every holding via `getAll()`, recomputes the three FX fields per row, and writes back via a single `commitImport({inserts:[],updates:[...all rows...],deletes:[]})` transaction. Then `updateFxMeta({lastFxRate, lastFxAsOf})`.
- **Base-currency change**: Button is the same code path; label flips to "Save & refresh FX" when `baseCurrency` differs from saved value. On click: save new settings, then run refresh.
- **Files/modules**: `src/lib/fx.ts` (new), `src/storage/settings.ts` (new), `src/storage/holdings.ts` (schema + DB bump), `src/routes/SettingsRoute.tsx` (rewrite), `src/routes/import/PreviewStep.tsx` (handleCommit), `src/components/HoldingsTable.tsx` (column), `src/routes/AnalyticsRoute.tsx` (KPI), `src/routes/HoldingsRoute.tsx` (banner), `src/App.tsx` (loaders).
- **Key risks**:
  - Frankfurter is single-vendor; if it's down at commit time, the user gets `undefined` base fields and a banner. Mitigated by cache fallback and the manual "Refresh FX" affordance.
  - Concurrent state: if the user changes base currency in one tab while another tab still has the old base loaded, the second tab can see stale data. Acceptable for a personal dashboard; full multi-tab sync isn't worth the complexity.
- **Complexity**: small. ~150 LOC net add. Main driver is the Settings UI rewrite (form + meta panel), not the FX plumbing.
- **Tradeoffs vs. Approach 2**: defers the API call to the latest possible moment in the wizard, so abandoned preview sessions don't hit Frankfurter. The commit step gains one async dependency, but `commit-failed` already exists as a UI state, so the failure surface is free.
- **Research grounding**: the existing `handleCommit` at `src/routes/import/PreviewStep.tsx:22-39` is the only writer to storage in the wizard; stamping here is the smallest insertion. `diffHoldings` (`src/parsers/diff.ts:30-44`) doesn't touch FX fields, so stamping post-diff leaves diff logic untouched. Frankfurter probe at `2026-05-15T06:30Z` confirmed CORS + key-free access.

## Approach 2: Stamp at parse, FX baked into canonical

- **Scope**: Same modules and schema. The difference is FX is fetched inside `UploadStep` (or the parse-stage callback), so the `ParseResult.rows` already carry stamped FX fields before `diffHoldings` runs. The preview screen then shows base-currency numbers in its sanity-check line.
- **Files/modules**: Same as Approach 1, but the FX call moves to `src/routes/import/UploadStep.tsx` (and possibly into `parsers/*.ts` if you want FX truly inside parsing). Preview is unchanged structurally; just gets richer data.
- **Key risks**:
  - Every upload attempt hits Frankfurter even if the user later aborts at preview — slightly wasteful, though Frankfurter is Cloudflare-cached.
  - Two failure surfaces now: parse-level FX failure and (unchanged) commit-level commit failure. More state to manage.
  - "Sanity check" line on preview (`src/routes/import/PreviewStep.tsx:80-92`) gains base-currency content, but that line is the only argument *for* moving FX earlier — and the user didn't ask for base-currency previews.
- **Complexity**: small-to-medium. Same code as Approach 1 plus one extra UI state (parse-with-FX-pending).
- **Tradeoffs vs. Approach 1**: shows the user a base-currency-aware preview, at the cost of an extra async step earlier in the flow and an extra failure mode. The user explicitly said "All this computation happens while importing or doing refresh" — Approach 1's "at commit" satisfies this just as well as Approach 2's "at parse"; preview is not in scope of the user's request.
- **Research grounding**: same as Approach 1, just with the call site moved.

## Approach 3: Read-side derive, no per-holding stamp *(ruled out)*

- **Scope**: Store only a single `currentFxRate` and `fxAsOf` in settings. Holdings/Analytics derive base-currency values on the fly: `qty * avgBuyPrice * rate(currency, base, currentFxRate)` in render.
- **Why ruled out**: directly violates the "Analytics and Holdings should not do any computation" intent — the FX math leaks into render. Also loses the per-holding audit trail (which rate was each row imported with?), which closes the door on a future feature like "show holdings imported before/after a rate change". The simplicity gain is tiny vs. the loss in flexibility.
- **Research grounding**: the user's stated requirement in the brief ("Analytics and holding page should not do any computation they should be mainly read. All this computation happens while importing or doing refresh") rules out per-render FX. Approaches 1 and 2 satisfy this; Approach 3 does not.

## Primitives picked

- **Extend** existing `commitImport` rather than carving a new "refresh" writer — same transactional shape, just inputs are different. (`src/storage/holdings.ts:63-73`.)
- **Additive** schema change: new fields are optional on `CanonicalHolding`; old rows continue to satisfy the type. No migration code; the user-driven wipe is the migration. (`src/storage/holdings.ts:8-17`.)
- **Inline** the FX fetch at the call sites where it's needed (commit + refresh + base-change) rather than centralizing into a single "FX service" abstraction. Three call sites, two of which share identical body (`refresh-all-holdings`). The shared body is one helper inside `SettingsRoute.tsx` (or a tiny `src/lib/refreshFx.ts` if it gets longer than 20 lines).
- **Sync** on the user's click; **no background or scheduled** FX work. Privacy-first rule + the user's explicit "no auto-fetch".
- **Now**, not later: ship the minimum that satisfies the brief. Future "live unit prices" feature can layer on the same `lastFxRate`/`lastFxAsOf` settings record without reshaping anything.
