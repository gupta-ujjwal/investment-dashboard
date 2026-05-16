# Pre-mortem — Holdings page rework (issue #8)

Recommended approach: Approach 2 (pure `holdingsView.ts` module + thin `HoldingsTable`).

## Most likely failure mode

A current-price column is **missing or garbage** in a real broker export and the value
`0` propagates as if it were a real price. `cellNumber` (`xlsx-utils.ts:13-23`) returns `0`
for an absent column, a blank cell, or unparseable text. If the parser reads the current
price by column *index* without first confirming the column *name* exists in
`mapHeaderColumns`, a Groww export that renamed `Closing price` (or a partial export) yields
`currentPrice = 0` for every row. The table then renders Current Total Value = ₹0 and
Profit = −100% across the whole portfolio — a confident, wrong, alarming number. The user
sees their portfolio "wiped out" and has no signal that it is a parsing artdefact, not a
market crash. This is worse than a thrown error, because it looks plausible.

## Rollback shape

Code: `git revert` the feature commit(s) on `main` + redeploy the GitHub Pages bundle —
all-or-nothing, ~1 minute, no ramp. Data: **no DB version bump**, so IndexedDB `upgrade()`
never ran and there is nothing to migrate back. Holdings already imported under the new code
carry extra `currentPrice` / `currentPriceBase` fields; the reverted (old) code reads named
fields by spread and silently ignores unknowns, so those records still load and render
correctly on the old Holdings page. Rollback is therefore a pure code revert with zero data
remediation. The one pre-merge check that makes this true: confirm the old build renders a
holding record that *contains* `currentPrice` without error (it will — verify once).

## Detection signal + responder

There is no telemetry (privacy-first, no analytics). Detection is shifted entirely
**pre-deploy**: (1) a `holdingsView.test.ts` suite that asserts the partial-value contract —
absent column → `undefined` (never `0`), `undefined` → `—` cell, undefined sorts to the
bottom for both directions, invested = 0 → profit % is `—` not `Infinity`; (2) the existing
`groww.test.ts` / `vested.test.ts` extended with a fixture whose current-price column is
*absent*, asserting `currentPrice === undefined` (not `0`); (3) the mandatory Playwright
verification from `.claude/rules/frontend-design.md` — load the populated table and read the
numbers against the source file before the draft PR is marked ready. The responder is the
implementing engineer during `/implement-lite` + PR review; the "continue or roll back"
gate is "do the rendered Current Total Value figures match the broker file's own totals
row" (Groww's `Closing value` column, Vested's `Current Value (USD)` column give a free
cross-check).
