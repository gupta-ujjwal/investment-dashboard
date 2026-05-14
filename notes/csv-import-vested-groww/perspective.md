# 4 Shapes — CSV/XLSX import slice

## NATURE

The import flow is a **watershed**: heterogeneous tributaries (Vested USD-shaped, Groww INR-shaped, future Robinhood/Zerodha) drain into one canonical reservoir, with a *preview-and-consent gate* at the confluence that mirrors how customs works — inspect, classify, admit or send back, before the gate closes. The merge-by-key rule is the same logic as a river redrawing its course: new channels (insert), existing channels deepened (update), abandoned channels become the user's decision to silt over or keep mapped (missing-from-upload). Worth flagging: by collapsing each upload to "latest layer wins" with no preserved snapshot history, we discard the **sedimentary-layer / tree-ring pattern** the broker exports naturally carry — a record we cannot reconstruct later when the analytics slice asks "value as of date X."

## DOMAIN

The domain vocabulary is **Holding / Transaction / Cost basis / Source**, not payments — the slice deliberately models *positions* (snapshot view), not *transactions* (event ledger), which is the cheap-now / expensive-later cut. **Source is a first-class field** because the user's mental model is "my Groww holdings + my Vested holdings," not "my equity portfolio" — matching how they actually speak about their accounts. The slice lives entirely in **pre-portfolio (data ingest)**; live-price computation is the "txn-equivalent" and analytics is "post-txn," and neither bleeds into this slice — natural slicing that mirrors Euler's pre-txn/txn/post-txn split.

## THEORY

The canonical-holdings map is structurally a **G-Map (grow-only map) with LWW values keyed by `(source, sourceSymbol)`** — a well-studied CRDT shape; the "missing-from-upload" branch sidesteps LWW's classic remove problem by making removal *explicit user consent* instead of inferred from absence. The diff function is **set algebra over the key**: symmetric difference yields `inserts ∪ missing`, key-matched intersection yields `updates` — pure, easily unit-tested without a fake IndexedDB. The wizard is a **linear DFA with one conditional skip** (preview → commit when `missing = ∅`); `useReducer` is the right tool — formal state machine libs like XState earn their keep on branching graphs and parallel states, which this flow doesn't have.

## IMPLEMENTATION

The Groww file is 6 KB / 30 rows; Vested is 22 KB / 15 rows — **empirically verified by reading them via Python during research**, not extrapolated. Parse time is sub-millisecond; worker offload (Approach C) is cargo-cult given real numbers. The two things only the real data exposed — **NA-ghost rows** (rows 27–28 in the Groww sample, zero quantities, no name) and **asset-class bleed** (MFs/ETFs/InvITs riding inside a "stocks" export) — would have been invisible from Groww's docs (which don't publicly document the schema anyway); the slice's design only fits because we have ground-truth samples on disk at `notes/csv-import-vested-groww/samples/`. The codebase has zero existing patterns to extend (4 files of bare scaffold) — so every conventional choice this slice makes (parser file layout, storage interface seam, route structure, schema versioning hook) **becomes precedent** for the next 5 features that copy it, making the slice more consequential than its size suggests.

## TENSIONS

- **Theory says snapshot history is a cheap CRDT extension; domain says users think in current positions; implementation says ship the simple thing now.** We're siding with domain + implementation, but the analytics slice will pay interest on this — "performance over time" needs the layers we're about to discard.
- **Nature says preserve the sedimentary layers (each upload is a dated snapshot); domain says current state is what the user wants to see.** We capture only `importedAt` per row, not the upload-event as a first-class entity. If we later want "as of date X" views, this is unrecoverable from current data.
- **Domain says cost basis is sacred; merge semantics blindly overwrite `avgBuyPrice` on every re-import.** This trusts the broker to compute splits/bonuses/buybacks correctly. Acceptable, but worth a one-line warning in the UI ("re-importing replaces avg buy price with the broker's latest figure") so the user isn't surprised when a corporate action shifts a number they thought was stable.

## Take

The slice's design is shaped almost entirely by **domain + implementation** with theory acting as a check on data-model choice. Nature flags a real but defensible loss (snapshot history) that's worth recording in the plan but not worth fixing now. The single most consequential tension is the snapshot-history discard — surface it in the canonical plan so the analytics slice walks in eyes-open, not surprised.
