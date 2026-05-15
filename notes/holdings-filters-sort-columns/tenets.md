# Reliability Tenets — Holdings page rework (issue #8)

Change in one line: a frontend feature — rework the Holdings table, capture current price as
an import-time snapshot, add two optional fields to the IndexedDB holding record. Edge-only,
single-user, no backend, no payments critical path. Blast radius: one page + the import
pipeline + the on-device DB record shape.

Most of the ten tenets (capacity, SLO, redundancy, RCA, org ownership) don't apply to a
single-user static dashboard. Four genuinely do.

## Tenet 2 — Critical path: simple, few dependencies

The "critical path" here is the **import → stamp → persist** pipeline — it is the only thing
that can corrupt durable on-device data. This change threads through it (two parsers +
`stampHolding`). Keep it dramatically simple: `currentPrice` and `currentPriceBase` are
**optional** fields, **no DB version bump**, no migration, no new store or index. The one way
to break the path is to make `currentPriceBase` *required* on `StampedHolding` — that would
break the FX-failed passthrough in `PreviewStep.tsx:42-45`. Concrete: keep both new fields
`?`-optional everywhere, and the import path gains zero new failure modes.

*Ask: does this add a hop or dependency to import? No — it reads one more optional column and writes one more optional field. Hold that line.*

## Tenet 3 — Reduce blast radius

A broker can ship a malformed export — current-price column present but garbage, blank, or
absurd. That must not throw during render and blank the whole table. The `holdingsView.ts`
per-row derivation is the **bulkhead**: one bad row yields one `—` cell, never a thrown
render. Concrete: derivation catches non-finite `currentPrice`/`avgBuyPriceBase` per row and
emits `undefined`; the row still renders with its good columns intact.

*Ask: if one row's price is NaN, what dies? Exactly one cell — not the page.*

## Tenet 4 — Anomaly detection (light)

Privacy-first means there is no telemetry — the only "detector" of a wrong number is the
user's own eye. The substitute is the **test suite as the detection signal**: a
`holdingsView.test.ts` covering the partial-value cases (undefined `currentPrice` → price
cells `—`; undefined `avgBuyPriceBase` → base totals `—`; invested = 0 → profit % is `—`,
not `Infinity`; sort places `undefined` at the bottom for both directions). Without those
tests a regression ships silently to a static bundle with no alarm.

*Ask: earliest signal of a wrong derived value? A failing unit test in CI — make sure the cases exist.*

## Tenet 6 — Staggered rollout + rollback

A static GitHub Pages bundle **cannot stagger** — deploy is 100% at once; that tension is
inherent and unfixable here. Mitigation is that the change is **additive and reversible**:
code rollback is `git revert` + redeploy. The data question — users' IndexedDB will already
hold the new `currentPrice` fields after they import once — is benign: no DB version bump
means `upgrade()` never runs, there is nothing to revert, and old code reads named fields so
extra fields are silently ignored. Verify the revert build still parses a holding record
that contains `currentPrice` (it will, by field-spread) and that's the whole rollback story.

*Ask: rollback button? `git revert` + redeploy. Migration to undo? None — additive optional fields, no version bump.*

## Tension

Tenet 6 wants staggering; a static single-bundle deploy gives none. There is no canary, no
cohort. The honest compensation is Tenet 4's test suite plus the additive/reversible shape of
the change — correctness has to be proven *before* deploy because there is no safe ramp
*after* it.

## Recommendation

Picked: 2, 3, 4, 6. The single highest-leverage action is the `holdingsView.test.ts` partial-
value suite — it doubles as Tenet 4's missing detector and Tenet 3's proof that a bad row is
contained. Keep both new fields optional (Tenet 2) and the rollback stays a trivial revert
(Tenet 6).
