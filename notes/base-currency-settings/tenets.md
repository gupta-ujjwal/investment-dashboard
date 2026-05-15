# Reliability Tenets — base-currency-settings

Restated: new feature on a personal investment dashboard, edge-only, one user. Adds a Frankfurter HTTP call to the import-commit click and to a manual Refresh button. Blast radius if wrong: the user's own dashboard shows wrong/missing numbers, or commit hangs.

Picked: **1, 2, 3, 6.**

## Skipped — one-line reasons
- **4 (anomaly detection)** — skip. No backend, no telemetry possible by design (privacy-first rule); the single user IS the anomaly detector.
- **5 (dynamic capacity)** — skip. Static bundle, one user, IDB on-device. No allocation to model.
- **7 (test the limits / chaos)** — skip. "10x prod traffic" is meaningless when prod is one browser tab.
- **8 (sacred RCA)** — skip. No incidents to learn from yet.
- **9 (ambitious SLOs)** — skip. No SLA. The implicit SLO is "the dashboard shows the right numbers when I open it".
- **10 (collective ownership)** — skip. N=1.

## Tenet 1 — Redundancy / graceful degradation
Frankfurter is a single external dependency. Plan already has **two-deep fallback**: fetch → cached `lastFxRate` → `undefined` with banner. Missing: a **third-tier manual override** — a small "Paste rate manually" input on Settings for when Frankfurter is dead *and* cache is empty (first-ever use / fresh wipe). ~10 lines of UI. Converts "stuck with undefined" into "user types `95.77`, gets unstuck."

## Tenet 2 — Critical path utterly simple
Import-commit click is the load-bearing action. Adding an external HTTP call to that path is what this tenet warns against. The fail-soft fallback covers "Frankfurter returns an error", but a **hung Frankfurter** (slow response, no error) would leave the user in "committing…" forever. Concrete: wrap `fetchUsdInrRate()` in a `Promise.race` with a 3s timeout — on timeout, treat as fetch failure and fall through to cache.

## Tenet 3 — Blast radius
The refresh-all path is the real blast-radius concern: one transaction writes FX fields to *every* holding. If Frankfurter returns `{"rates":{"INR":0}}`, missing `INR` key, or a NaN-coerced value, the user's whole base-currency view becomes 0s / NaNs in one commit. Concrete: validate response in `fetchUsdInrRate` before returning — rate must be a finite positive number in sane range (e.g., 1 < rate < 1000 for INR per USD); fail otherwise. Single chokepoint, single guard, small unit test file around it.

## Tenet 6 — Rollback
DB version bump 1 → 2 is the irreversible piece. IDB doesn't downgrade — once a v2 write happens, opening with v1 code throws `VersionError`. Concrete: before merging, tag `main` as `pre-base-currency` so the user can `git checkout` + redeploy the old bundle without spelunking history. The new schema is **additive** (no field deletions, no key changes), so a soft-rollback alternative is also free: a `FEATURE_BASE_CURRENCY` const at top of `App.tsx` that hides the Settings form and the base column would let the user disable the feature without redeploy. Cheap insurance for N=1.

## Tensions
- **Tenet 2 ↔ Tenet 1.** T2 says don't add hops to critical path; T1 says it's OK if degrade is handled. Resolved by: FX is "best effort" within commit (timeout + cache fallback + undefined-with-banner). Commit itself never fails because of FX.

## Recommendation
Four small additions to the plan, all guard rails on the existing design:
- (a) 3s timeout on FX fetch [T2]
- (b) Range-validate Frankfurter response in `fx.ts` [T3]
- (c) Manual rate paste input on Settings [T1]
- (d) Tag `pre-base-currency` before merge [T6]

~30 LOC total + one validator test. No architectural change.
