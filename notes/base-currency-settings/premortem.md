# Pre-mortem — base-currency-settings (Approach 1)

## Most likely failure mode

A user clicks **Refresh FX** in Settings while Frankfurter is briefly degraded (Cloudflare 5xx, partial response, or a transient parse). The refresh writes invalid FX values across every holding in one transaction, the dashboard renders `$0.00` / `NaN` / `—` on every base-currency row, and there's no "previous refresh" to fall back to because the design overwrites in place. The user clears state by re-importing the broker file or wiping IDB.

Concrete trigger: Frankfurter returns 200 with `{"rates": {}}` (no `INR` key), or `{"rates": {"INR": null}}`, or content-type drift. Without input validation in `fx.ts`, the destructured `rate = json.rates.INR` becomes `undefined`, every holding's `avgBuyPriceBase = avgBuyPrice * undefined = NaN`, and the transaction commits NaN-poisoned rows.

This is the single failure mode worth designing against. It's caught by **Tenet 3's response validator** — adding it to the plan upgrades this from "likely once a year" to "essentially impossible".

## Rollback shape

Two layers, both in place before merge:

1. **Soft rollback (preferred):** `FEATURE_BASE_CURRENCY` const at the top of `src/App.tsx`, default `true`. Set to `false` and redeploy → Settings form hides the new fields, Holdings table hides the base column, Analytics hides the "Total · base" KPI. The IDB stays on schema v2 (additive — no harm), and `avgBuyPriceBase` is simply ignored on read. No data loss. One-line change in code, one `npm run deploy`.

2. **Hard rollback:** `git tag pre-base-currency` placed on the current `main` HEAD before merge. To revert: `git checkout pre-base-currency && npm run deploy`. User must also clear site data (IDB v2 → v1 is `VersionError`), but holdings can be re-imported in seconds from the original broker file. Documented in the PR description so it's there for the user to find later.

The soft rollback is the load-bearing one. The hard rollback exists only for "I no longer want this feature" scenarios, which are unlikely on a personal tool.

## Detection signal + responder

No automated detection — privacy-first rule forbids telemetry. The signal channels are:

- **Pre-merge:** unit tests for `fx.ts` validator (rejects empty `rates`, NaN, zero, negative, > 1000), unit tests for the stamp transform (handles undefined input correctly), Playwright check that the Settings "Refresh FX" button writes plausible values and that Holdings/Analytics render the base column without `NaN` / `undefined` strings. Already covered by the project's `frontend-design.md` rule (Playwright verification before draft PR ready-for-review).
- **Post-merge:** the user notices wrong numbers within seconds of opening the dashboard. Responder = the user. The soft-rollback feature flag is the recovery action.
- **First refresh after rollout:** spend 30 seconds eyeballing the numbers — does the INR equivalent of a known USD holding match the user's mental approximation? E.g., 100 AAPL at $200 should land at ~₹19,000-20,000 in base, not ₹2 or ₹2M.

The "responder is the user" model is acceptable for a personal app but means the validator (Tenet 3) is doing all the heavy lifting against silent corruption. That's the right place to spend the time.
