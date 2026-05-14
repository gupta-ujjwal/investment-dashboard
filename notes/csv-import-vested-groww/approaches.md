# Approaches

Three approaches considered. Recommendation: **Approach A** (single router-based wizard, idb, SheetJS, useReducer state machine). Approaches B and C are recorded with explicit reasons for rejection so the choice is documented, not silently made.

---

## Approach A: Router + wizard, useReducer state, idb + SheetJS (RECOMMENDED)

### Scope
- Add `react-router-dom` v7 in SPA mode (`vite.config.ts:6` `basename = '/investment-dashboard/'`).
- Two routes: `/` (home list view) and `/import` (wizard). Root-level guard component reads holdings count from IndexedDB on mount; redirects `/ → /import` when empty.
- Wizard implemented as a single `<ImportWizard />` component with a `useReducer` state machine: `{ step: 'pick-source' | 'instructions' | 'upload' | 'preview' | 'committing' | 'done', source: 'vested' | 'groww' | null, file: File | null, parsed: ParseResult | null, diff: DiffResult | null, decisions: Record<string, 'keep' | 'delete'> }`.
- Parsers as pure functions: `parseGroww(file): Promise<ParseResult>` and `parseVested(file): Promise<ParseResult>`, both returning `{ rows: CanonicalHolding[], skipped: number }`. Source-specific layout knowledge stays inside each.
- Diff as pure function: `diff(existing: CanonicalHolding[], incoming: CanonicalHolding[]): { inserts, updates, missing }`. Pure → unit-testable without a fake IndexedDB.
- Storage as a thin module `src/storage/holdings.ts`: `getAll()`, `commitImport({ inserts, updates, deletes })` running as one IndexedDB transaction.
- List view: a flat table with columns `Name | Source | Symbol | Quantity | Avg Buy Price | Currency | Asset Class`. Sorting/filtering deferred to a later polish slice.

### Files/modules
- `src/App.tsx` (rewritten — router setup)
- `src/routes/home/HomeRoute.tsx`, `src/routes/home/HoldingsTable.tsx` (new)
- `src/routes/import/ImportRoute.tsx`, `src/routes/import/{SourcePicker,Instructions,UploadStep,PreviewStep,CommitStep}.tsx` (new)
- `src/parsers/{types,groww,vested,diff}.ts` (new)
- `src/storage/holdings.ts` (new)
- `package.json` (+ `idb`, `xlsx`, `react-router-dom`)

### Key risks
1. **SheetJS's "any-shape parser" is double-edged**: forgiving readers silently accept misshapen files. Mitigation: parser entrypoints assert the expected header row text and bail with a typed error before returning rows.
2. **IndexedDB schema migrations**: we will need them eventually (when SQLite-WASM lands, or when a column rename happens). Mitigation: ship `version: 1` from day one with an explicit `upgrade(db, oldVersion)` switch so the migration path is in place, even though it does nothing on v1.
3. **React Router v7 has framework-mode opinions** that, while opt-in, can leak via docs and examples. Mitigation: explicitly use the SPA-only entry (`createBrowserRouter` + `RouterProvider`) and link the SPA doc in code comments only if a future contributor would be misled — otherwise no comment.

### Complexity
**Medium.** Driver: the wizard's step machine and the "missing-rows" preview UX (per-row keep/delete with bulk actions). Each parser is small (~50 LOC). Storage is ~40 LOC. The bulk of effort is preview-step UI polish.

### Primitives this approach picks (per `notes/.../research.md`)
- **Add new code paths** (no existing patterns to extend — codebase is bare).
- **Inline parsers per source**, not abstracted into a generic-parser interface. Two sources, two shapes; the "common interface" can wait for source #3 (Zerodha, Robinhood) — research.md (Section A) confirms there's no existing parser scaffold to fit into. **Rule of three** applies.
- **Synchronous in-memory flow** for parse + diff. Files are 6 KB / 22 KB. Web worker offload would be cargo-cult.
- **Per-source replace in the diff function isn't used** — the merge semantics are user-decided (see research.md, Section D): insert + update on key match, surface missing for user decision.

### Tradeoffs vs B
B's "no router, view state in App.tsx" saves ~7 KB and one dependency, but every future feature (settings, holding detail, link-shareable filter URLs) costs back more than that. Router is the right shape now.

### Tradeoffs vs C
C adds workers + XState. Workers solve nothing at this file size (Groww 6 KB → ~30 rows; Vested 22 KB → ~15 rows; parse is microseconds). XState is fine but `useReducer` covers a 5-step linear wizard without the dependency.

---

## Approach B: No router, view-state in App.tsx

### Scope
- App.tsx holds `view: 'import-step-1' | ... | 'home'` in state, switches `<Children />` directly. No URL routing, no `react-router-dom`.
- Same parsers, same storage, same wizard ergonomics — just no URL bar updates.

### Files/modules
- `src/App.tsx` (rewritten — switch on `view` state)
- Same `src/routes/*` (or rename to `src/views/*`), same `src/parsers/*`, same `src/storage/*`

### Key risks
1. **No deep links.** Reload during the wizard's preview step → back to step 1. Browser back button = exit app. Both are user-hostile.
2. **Adds technical debt the day we add a 3rd route.** Any later "Settings" or "Holding detail" or "Filter by source=Groww" feature has to bolt routing in retroactively, refactoring this approach's view-state.
3. **No SSR/static-pre-render benefits** — but neither does Approach A in GitHub Pages mode, so this is a wash.

### Complexity
**Small.** One fewer dependency, one less mental model. But the "lower complexity" reading is misleading — it's deferred complexity, not removed.

### Why not picked
The router cost (`react-router-dom` ~12 KB gzipped, ~5 min of config) is paid back within the next feature. **Boring tech that we'll need anyway is not a YAGNI violation when the second use case is days away.**

---

## Approach C: Web-worker parsing + XState wizard machine

### Scope
- Wrap SheetJS in a web worker via `vite-plugin-comlink` or a hand-rolled `Worker` + `MessageChannel`.
- Wizard state as an XState machine (formal state machine with guards and history).
- Otherwise same shape as A.

### Files/modules
- Same as A plus `src/parsers/parseWorker.ts`, `src/machines/importMachine.ts`.

### Key risks
1. **Premature scaling.** SheetJS on a 22 KB Vested file is sub-millisecond. Workers add a serialization tax (postMessage roundtrip), a build-config tax (worker bundling in Vite), and a mental tax (async-everywhere). Net negative for this slice.
2. **XState is a 50 KB dependency** that earns its keep with parallel states, history, and guards. A 5-step linear wizard with no branching beyond "skip preview when no missing rows" is exactly what `useReducer` was designed for.
3. **Speculative scaling** is the most expensive kind of code: it locks in patterns that future contributors copy without questioning, propagating worker overhead and state-machine ceremony into features that don't need them.

### Complexity
**Large.** Driver: worker plumbing + XState ergonomics. ~3× the boilerplate of Approach A for no current benefit.

### Why not picked
Both ingredients (worker, XState) are correct *when needed*. Neither is needed now. Defer until profiling shows main-thread blocking, or until the wizard genuinely branches enough to outgrow `useReducer`.

---

## Why one approach won

Per `research.md` Section A, the codebase has no existing routing or state-machine pattern to extend, so we're picking conventions, not fitting into them. Approach A picks the boringest sufficient set: `react-router-dom` v7 SPA, `useReducer`, `idb`, `xlsx` slim build. Each is the de-facto default for its slot, each is small, each can be removed in isolation if it becomes wrong-shaped later. Approaches B and C optimize the wrong axis (dependency count for B, future scalability for C) and pay for it in the next feature.
