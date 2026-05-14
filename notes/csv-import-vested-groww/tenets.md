# Reliability tenets — CSV/XLSX import slice

Picked **2, 3, 4 (adapted), 6**. Skipped: 1 (no peers — single device), 5 (no scaling problem at 50 rows), 7 (no production traffic to chaos-test; parser unit tests substitute), 8 (no incidents yet), 9 (no SLA — single user), 10 (single-author project).

---

## Tenet 2 — Critical path: 100x strong, utterly simple

**This slice IS the critical path** for every Phase 1 feature that follows. Live prices, FX, analytics, list view, edit, manual add — all operate on the `holdings` IndexedDB store this slice defines. Complexity at this layer compounds into every later slice.

- **Atomic commit, no half-writes.** The `commitImport({ inserts, updates, deletes })` call must run inside one `idb` `db.transaction(['holdings'], 'readwrite')` — either all three sets land or none do. A mid-transaction crash must leave the DB in either the pre-import or post-import state, never partial. `idb`'s transaction model gives this for free; the discipline is to put the whole commit inside one `tx`, not three sequential ones.
- **The v1 schema is a promise.** Every field on `CanonicalHolding` is one we're committing to support forever or to write a migration for. Keep v1 minimal: `{ name, source, sourceSymbol, quantity, avgBuyPrice, currency, assetClass, importedAt }`. Resist "while we're here" additions (e.g., `lastSeenAt`, `notes`, `tags`) — add them when the slice that needs them lands.

## Tenet 3 — Reduce blast radius

**The blast radius is the user's only copy of their portfolio data.** There's no other replica anywhere on earth — by design (privacy-first, edge-only). A buggy parser writing NaN rows or a wizard step that silently wipes the wrong source is unrecoverable.

- **Parsers must validate at the gate, not produce mystery rows.** If `parseGroww` doesn't find `"Stock Name"` in the expected header row scan, return a typed `ParseError`, do not return `{ rows: [], skipped: 0 }`. Same for Vested — header-row mismatch = explicit rejection, not silent empty result. This bounds the worst case to "upload rejected with a clear error message" rather than "DB now has plausibly-shaped corruption."
- **Export-before-commit safety net.** Add a "Download backup (.json)" button on the preview step that dumps the current `holdings` store to a file before the user clicks commit. ~20 LOC, ~5 KB on disk. Recovery from "I committed and the result looks wrong" goes from impossible to one click. This is the cheapest, highest-leverage reliability investment in the slice — it earns its place in the v1 scope.
- **Per-source containment.** Operations against Groww rows must never touch Vested rows (and vice versa). The diff function takes only the incoming source's existing rows as input — the other source's rows are not in scope for the merge. Codify this as a function signature: `diff(existingForSource, incoming, source) → {...}` not `diff(allExisting, incoming) → {...}`.

## Tenet 4 (adapted) — Detection at the gate, not via telemetry

The hard constraint "no telemetry, no third-party scripts" rules out the usual anomaly-detection apparatus. The substitute is **user-visible counters at the preview step** — the user IS the alert system.

- **The preview step is the missing alert.** Display the counters loudly: "Parse summary: 28 inserts, 2 updates, 3 missing-from-upload (review below), 2 NA ghosts skipped." When Groww silently changes their export shape next month, the counters spike or crater visibly *before* the user clicks commit. The user catches the schema-drift "incident" at the gate rather than discovering it after the DB is overwritten.
- **Fail loudly on unrecognised file shapes.** When the parser bails with a `ParseError`, show the offending row's first cell verbatim ("expected `Stock Name` at row 11, found `Some new header text`") so the user can self-diagnose and the project can patch the parser. No silent zero-row imports; no console-only warnings the user will never see.

## Tenet 6 — Mandatory staggering + rollback

GitHub Pages is a brutal deploy story for this tenet — one branch, one bucket, instant 100% rollout, no built-in canary, no rollback button. The slice has to provide its own substitutes.

- **Code rollback** is `git revert HEAD && push` → re-deploys the prior bundle in minutes. Adequate for shipping the *code*. The harder problem is *data* rollback: once a future slice writes v2 schema to IndexedDB on the user's device, reverting the code doesn't downgrade their data. **For v1 there's nothing to roll back from**, but the migration scaffolding must preserve a `v_n → v_{n+1}` upgrade path that takes a backup snapshot before transforming rows. Wire the hook in `idb`'s `upgrade` callback now (no-op for v1) so future slices inherit the safety net instead of bolting it on.
- **The wizard's preview-then-commit gate is the structural A/B.** It is the "tested rollback that fires without a redeploy" the tenet demands: the user sees the proposed change and either approves it or cancels — pre-commit. Make the cancel button equal-weight to the commit button visually; "Reject changes" is the rollback action.
- **GitHub Actions staggering.** The existing `deploy.yml` ships on push to `main`. Add a PR-preview-deploy (or at minimum a manual `workflow_dispatch` gate) before `/implement-lite` ships this slice, so the diff can be eyeballed in a deployed environment first. Implementation-phase concern; capture in the plan.

---

## Tensions

- **Tenet 3 (export-before-commit backup) vs slice scope discipline.** Adding the backup button is one extra component in the wizard. It's tempting to push it to a later "settings / backup" slice. I'd resist — the blast-radius story is *qualitatively* different with vs without a one-click backup, and the cost is trivial. Keep it in v1.
- **Tenet 6 (data rollback) vs Tenet 2 (schema simplicity).** Wiring a no-op `upgrade` hook for v1 adds ceremony that does nothing today. It's the right call anyway because the alternative — adding the hook retroactively when v2 migrations land — is the kind of "we'll fix it later" the tenet checklist exists to prevent.
- **No real tension between Tenet 2 (critical-path simplicity) and Tenet 3 (parser validation).** Validation IS the simplicity story — it's the difference between a parser that fails predictably and one that produces shapes the rest of the codebase has to defensively guard against.

## Take

The four picks reinforce rather than compete: simple critical path (2), tight blast radius via parser validation + export-before-commit + per-source containment (3), user-visible counters as the detection layer (4-adapted), preview-gate as the structural rollback (6). The one decision the user should ratify or override: **whether to include the "Download backup (.json)" button on the preview step in this slice (recommended) or push it to a follow-on backup/settings slice.**
