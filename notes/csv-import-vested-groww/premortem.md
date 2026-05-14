# Pre-mortem

For Approach A (router + wizard, useReducer, idb + SheetJS, parsers per source).

## Most likely failure mode

**Groww or Vested silently changes their XLSX export format**, OR the user uploads a different export type by mistake (Groww's P&L statement instead of the holdings statement; Vested's tax report instead of the holdings dashboard). Concrete scenario worth designing against: Groww inserts a new column between `Quantity` and `Average buy price` next quarter, OR renames `Average buy price` to `Avg. Buy Price`. The user uploads the new file; what happens?

- **If we parsed by column index** (e.g., "column D is avg buy price"), the parser produces 30 rows where `avgBuyPrice` is now actually `buy value` — silently wrong, all numbers shifted one place. The preview counters look normal (28 updates, 2 inserts). The user clicks commit. IndexedDB now contains 30 rows of plausibly-shaped corruption. **Unrecoverable without a backup.**
- **If we parsed by named header** (SheetJS's named-column mode with an explicit assertion that the named columns we expect are *all* present at the header row), the parser bails with `ParseError("Groww export schema changed: missing expected column 'Average buy price' at header row 11. Found columns: [Stock Name, ISIN, Quantity, Buy Value, ...]")`. The user sees the error, files an issue, the parser gets patched in a follow-up commit. **Blast radius: one rejected upload.**

The design decision that determines which scenario happens is **named-column parsing + explicit header assertions**, not positional parsing. This is the single most consequential defensive choice in the slice.

Secondary failure mode worth naming: **IndexedDB quota exhaustion or upgrade failure**. With ~50 rows × ~100 bytes, quota is a non-issue *now*, but the upgrade callback running against a future v2 schema on a device with v1 data is a real risk. The migration must take a backup snapshot to the same DB inside a separate object store (`backups`) before transforming `holdings` rows, and the upgrade must be wrapped in a try/catch that rolls the upgrade back if any step throws.

## Rollback shape

Two cuts because code and data roll back independently:

- **Code rollback**: `git revert HEAD && git push` triggers `deploy.yml` → GitHub Pages serves the prior bundle within ~2 minutes. Straightforward. The new bundle keeps running for any user who has it cached until they hard-refresh, which for a single-user app is the user themselves. Acceptable.
- **Data rollback (the harder one)**: For v1 there is no schema migration yet, so reverting code does not modify the IndexedDB store on the user's device — it stays in whatever state the user last committed it to. **For recovering from a bad import** (parser bug that produced corrupt rows the user committed before noticing), the rollback artifact is **the .json backup file the user downloaded at the preview step**, re-imported via the (deferred to a settings slice) restore action. *Without the backup button in v1, there is no data-rollback path at all.*

Concrete next-action if a bug ships: (1) revert the commit, push, wait for redeploy. (2) On the dev's own browser, restore from the most recent backup .json (manual `idb` insertion via DevTools is fine for a single-user app). (3) Patch the parser, add a regression test using a fixture file mimicking the broken case, push. (4) On any device that committed corrupted data without a backup: data loss is unrecoverable. This is why the backup button is in scope.

## Detection signal + responder

No telemetry by hard constraint, so detection lives in two places:

- **At parse time**: typed `ParseError` from `parseGroww` / `parseVested` with the offending row text in the message. Rendered in the wizard's upload step as a red banner ("Groww export format not recognised. Expected `Stock Name` at row 11, found `Some new header`. Please file an issue at github.com/gupta-ujjwal/investment-dashboard/issues with the file attached."). **Responder: the user.** They see the error → file an issue → parser gets patched.
- **At preview time**: the four counters (`inserts`, `updates`, `missing-from-upload`, `NA-ghosts-skipped`) are the schema-drift alert. When Groww silently changes their format in a way that *doesn't* trip the header assertion (e.g., they change the unit of a price column from rupees to paise — same column name, 100× numbers), the counters and the missing-rows table will show implausible values. **Responder: the user**, who clicks cancel and files an issue.

Concrete signals worth tightening in implementation:
- The preview step should also surface **value-distribution sanity** (e.g., "largest holding's avg buy price: ₹4111 / $215") so out-of-range values catch the user's eye. Even a one-line "extreme values" row beats raw counters for catching unit-shift bugs.
- The `ParseError` message must be reproducible: include the parser version, the offending row index, the offending row's raw cell values. If the user pastes the error into an issue, the maintainer should be able to write a fixture-based regression test without seeing the file.

## What this pre-mortem changed

- Locked **named-column parsing + explicit header assertions** as a non-negotiable design requirement, not an implementation detail.
- Locked **"Download backup (.json)" button on the preview step** into v1 scope (subject to user ratification — flagged in the canonical plan's Recommendation).
- Locked the **`upgrade(db, oldVersion)` hook with backup-snapshot-before-migrate** scaffolding into v1 even though it's a no-op for v1 → there's no v0 to migrate from.
- Locked the **"extreme values" sanity row** into the preview step's UX scope (small addition, large detection value).
