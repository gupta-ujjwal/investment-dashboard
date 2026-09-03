# Plan: Dashboard UX redesign — make the app ask for decisions

> Produced from a design & product review on 2026-08-09, walking all seven routes at 1440×900 and
> 390×844 against a seeded portfolio (20 holdings across NSE/NASDAQ, 6 manual assets, 8 months of
> budget, 10 history snapshots). HEAD at review time: `512f69c`.
>
> **Design references:** `implementation-docs/dashboard-ux-redesign-templates/` — open the HTML files
> in a browser. Every structural element carries a `data-tw` attribute holding the literal Tailwind
> class string to write. Read that directory's `README.md` before starting any UI PR.
>
> **Two PRs. Implement one at a time — see § PR breakdown.** PR-2 depends on PR-1's tokens, so the
> order is fixed. Within each PR the commit order is also specified and is part of the plan: PR-1
> commit 1 is the isolated, cherry-pickable P0 fix, and PR-2's pure-logic commits must land before
> the components that consume them.

---

## Frame

- **Kind**: UX/product redesign across existing routes. One P0 layout bug fix, one new pure-fold
  module + component (the action rail), one storage field, one IA consolidation, and a token/palette
  pass. **No IndexedDB schema version bump** — `DB_VERSION` stays 5 (the one new settings field is an
  optional scalar on the settings singleton, per `productContext/dsl.md` § decision guide).
- **Files likely touched**: `src/routes/AppShell.tsx`, `src/routes/OverviewRoute.tsx` (→ `TodayRoute`),
  `src/routes/InvestmentsRoute.tsx` + `src/routes/EquityRoute.tsx` (→ merged `PortfolioRoute`),
  `src/routes/PlanningRoute.tsx`, `src/index.css`, `src/components/charts/chartTheme.ts`,
  `src/components/charts/*Donut.tsx`, `src/App.tsx` (routes + loaders), `src/storage/settings.ts`,
  plus new `src/lib/actionRail.ts`, `src/lib/sinceLastVisit.ts`,
  `src/components/ActionRail.tsx`, `src/components/ActionCard.tsx`, and their tests.
- **External surface affected**: none. No new network calls, no new egress, no new API keys. Every
  signal is a pure fold over data already in the loaders. The privacy doctrine
  (`CLAUDE.md` § Hard constraints, `productContext/dsl.md` § R10) is untouched.
- **Out of scope**: live price feeds; a transactions ledger; liabilities / true net worth; the AI
  agent; any new asset class; changing the CSV/import pipeline; light theme.

---

## Research summary — what the walkthrough established

### The blocker (verified by measurement, not by eye)

`AppShell.tsx:18` is `<div className="flex min-h-screen">` — a **row** flex container at every
breakpoint. The desktop sidebar is correctly `hidden … md:flex` (`AppShell.tsx:20`), but the mobile
`<header>` (`AppShell.tsx:56`) is still a *sibling flex item*. On a phone it therefore renders as a
left column, not a top bar.

Measured at 390×844 on `/overview`:

```
shell computed:  display: flex   flex-direction: row
header:          x=0    w=588
main:            x=588  w=40
```

`documentElement.scrollWidth` per route against a 390px viewport:
`overview 728` · `equity 713` · `planning 758` · `investments 744` · `budget 1034`.

Introduced by `89ce63c` (PR #52, merged 3 Aug 2026). The prior shell was `min-h-screen` (block flow)
with a full-width top bar — see `git show 89ce63c^:src/routes/AppShell.tsx:25`.

**How it passed review**: the evidence committed with that PR
(`implementation-docs/evidence-nocturne-theme/mobile-01-overview.png`) already shows the bug — a
cut-off nav and an empty body. The capture ran against an **empty IndexedDB**, so "blank page, no
data yet" read as a plausible empty state. The process fix (seed before mobile capture, assert
`scrollWidth === clientWidth`) matters as much as the one-line code fix.

### Desktop wastes the viewport, then breaks numbers to fit

`AppShell.tsx:93` caps `<main>` at `md:max-w-5xl` (1024px). At 1440px that leaves ~980px of dead
ground while content is squeezed. Consequence on `/equity`: the hero KPIs wrap **mid-number** —
`₹53,44,36` / `0.48` and `₹10,10,64` / `1.18` — and instrument names wrap to two lines in a 20-row
table with no room.

### Every signal is computed; none is surfaced as an action

The analytics engine already derives everything the action rail needs. All of these are pure folds
already called by existing loaders:

| Signal | Function | Currently rendered as |
|---|---|---|
| Risk-band drift vs target | `riskAllocation()` — `src/lib/planning.ts:89`, returns `RiskSlice[]` with `pct` and `targetPct` | Three identical `tick-400` bars on Planning. High at **62.3% vs 25% target** produces no colour change, no alert, no action. |
| Emergency-fund gap | `emergencyFundStatus()` — `src/lib/planning.ts:30`, returns `fundedPct`, `coverageMonths`, `target` | A progress bar reading **78%** with no CTA. |
| Unstamped FX positions | `portfolioTotals().unstamped` — `src/lib/analytics.ts:42` | `RefreshBanner`, which is the *one* existing thing shaped like an action card. |
| Concentration | `concentration()` — `src/lib/analytics.ts:375`, returns `hhi`, band, top-5 weight | `HHI 0.06` and a bare em-dash. |
| Goal projection | `projectGoal()` — `src/lib/goals.ts:29` | **"~552 months to goal (46 yr)"** with no adjacent lever. |
| Monthly averages / savings rate | `monthlyAverages()` — `src/lib/budget.ts` | Six more KPI tiles. |

`RefreshBanner` is the existing precedent worth generalising — the action rail is that pattern, made
plural and rule-driven.

### ⚠ The honest-delta constraint — read before building PR-2 commit 1

The obvious retention feature is "▲ ₹X since your last visit". **It does not work as stated**, and
building it naively would ship a lie.

There are no live prices. `currentPrice` is a snapshot captured at import
(`src/storage/holdings.ts` — "Snapshot captured at import from the broker export"), and
`recordSnapshot()` only writes on net-worth-moving events — import, FX refresh, asset edit
(`src/storage/history.ts:64`, which explicitly notes budget edits do *not* snapshot). So between two
imports, net worth is **numerically identical**. A "since your last visit" delta would read
`▲ ₹0` on every visit that isn't immediately post-import.

**The honest framing, which is also the better product:**

- Compute the delta between the two most recent `historySnapshots` records, and label it by the
  event: **"▲ ₹1,84,220 since your 3 Aug import"**.
- When no new snapshot exists since the user's last visit, say so plainly — *"Unchanged since your
  3 Aug import"* — and let the `stalePrices` action card fire. The absence of movement becomes the
  call to action. This is a better loop than a fake delta, and it's the only version consistent with
  the repo's existing honesty discipline (cf. `goals.ts` `assumptionNote`, the `provenanceLabel`
  work in `src/lib/cashflow.ts:45`).
- `lastSeenAt` is still worth storing, but its job is *"how many imports happened since you last
  looked"*, not *"how much did the number move"*.

### Existing plumbing that makes this cheap

- `dashboardLoader` (`src/App.tsx:85`) already returns `{ holdings, settings, history, assets,
  budgetMonths }` and is shared by `/overview`, `/investments`, `/equity`. The action rail needs no
  new loader.
- `planningLoader` (`src/App.tsx:109`) returns `{ holdings, assets, settings, budgetMonths }`.
- `settingsAction` / `readSettingsFromForm` (`src/App.tsx:173` / `:197`) **merges** — it spreads
  `...current` and `readTarget()` returns a `'keep'` sentinel for absent fields. A partial inline
  form posting `intent=save` preserves every omitted field. Reuse it; do not write a second path.
- `effectiveValue()` (`src/lib/cashflow.ts:27`) is the established tri-state precedence helper
  (`undefined` = unset → derived; explicit `0` = honoured override). Every new rule that reads a
  target must go through it rather than re-deriving precedence.

### Palette and IA facts

- `donutPalette` (`src/components/charts/chartTheme.ts:26`) is six steps: `tick-400 / bone-300 /
  tick-500 / bone-400 / tick-700 / bone-500`. At the 8px legend swatch these are two hues at
  slightly different lightness. The 6-slice sector donut and the 5-line "Expenses by tag" chart are
  undecodable as a result.
- **`AllocationDonut` in `market` mode and `CurrencyExposureDonut` render the identical split**
  (59.12 / 40.88 on the seed) — for a two-market IN/US portfolio, market *is* currency. Two panels,
  one fact.
- `chartColor.value` is `tick-400` — the same token as the nav active state and every CTA. One hue
  currently means "you are here", "click this", "this is data", and "this is progress".
- Route config `src/App.tsx:631-655`: `/overview`, `/investments`, `/equity` all use
  `dashboardLoader`. `/analytics` → `/overview` and `/holdings` → `/equity` redirects already exist,
  so the precedent for preserving old links through a rename is established.

---

## Approaches considered

### Approach 1 — Two PRs, split on presentation vs. intelligence (RECOMMENDED)

One PR changes **how the app looks and where things are**; the second changes **what it says**.
That seam is the only two-way split that leaves both halves coherent: PR-1 is entirely
presentational and adds no new concepts, PR-2 adds one pure module and rewrites one route around it.

- **Why this seam and not "urgent vs. nice-to-have"**: splitting by priority would put the token
  additions in PR-1 and the action cards that consume them in PR-2 — fine — but it would also strand
  the plain-language pass and the chart palette across both, so neither PR could be reviewed as a
  whole. Presentation/intelligence keeps each PR internally consistent.
- **Why tokens land in PR-1**: PR-2's action cards need `sev-*` and the reserved `act-*` accent to
  exist. Shipping the palette early also fixes the unreadable charts for free.
- **Why the IA merge is in PR-1, not PR-2**: merging Investments + Equity is a routing and
  presentation change. It shares the responsive-table work and the 4-tab shell with the mobile fix,
  so separating them would mean touching `AppShell.tsx` twice.
- **Risks**: both PRs are large — see the sequencing note under § Recommendation for the mitigation.
  Beyond size: the rail becoming a nag wall (hard cap of 4, no dismiss-by-default); the IA merge
  breaking bookmarks (redirects, following the existing `/analytics` precedent); scope creep into a
  live-price feature (explicitly out of scope — see the honest-delta constraint).
- **Complexity**: PR-1 large but mechanical · PR-2 large and genuinely new.

### Approach 2 — Eight small sequenced PRs

The shell fix, tokens, the delta fold, the rail, Today, the IA merge, copy, and retention each on
their own branch. Lower review risk per diff and the P0 ships in isolation within the hour. Rejected
by explicit instruction (2026-08-09): the review overhead of eight round-trips outweighs the
per-diff safety for a single-maintainer personal project.

### Approach 3 — One "redesign" branch behind a flag

Everything at once behind `FEATURE_REDESIGN`, flipped when complete. Rejected: the P0 mobile bug
would sit unfixed on `main` for weeks, and the flag would gate a *layout* change — precisely the
kind of change flags handle worst, since it means maintaining two live shells.

---

## Recommendation

**Approach 1.** PR-1 then PR-2, in that order — PR-2's cards depend on PR-1's `sev-*` tokens.

⚠ **One sequencing safeguard.** Bundling the P0 mobile fix into a large PR means the four-line fix
waits on review of an IA merge. Mitigate it inside the branch rather than by adding a third PR:
**make the shell fix the first commit, alone and self-contained**, so it can be cherry-picked onto
`main` at any point if PR-1's review drags. Commit order within each PR is specified below and is
part of the plan, not incidental.

---

## PR breakdown

Two PRs. Each lists its commits in order — follow them, because the first commit of PR-1 is the
cherry-pickable hotfix and the pure-logic commits of PR-2 must land before the components that
consume them.

Follow the repo's `/do` flow: draft PR → Playwright evidence with **seeded data at both viewports**
→ mark ready.

---

### PR-1 · Correctness and the design system

**Nothing here changes what the app says — only how it looks and where things live.** No new
modules, no new storage fields, no new logic. Reviewable as one coherent presentational pass.

**References**: `01-app-shell.html`, `00-tokens.html`, `04-portfolio.html`

#### Commit 1 — the shell fix (self-contained, cherry-pickable)

`src/routes/AppShell.tsx:18` — `flex min-h-screen` → `flex min-h-screen flex-col md:flex-row`.

That is the whole commit. Do not fold anything else in; it exists so it can be lifted onto `main`
independently if this PR's review takes time.

#### Commit 2 — viewport and figure correctness

- `AppShell.tsx:93` — drop `md:max-w-5xl`, adopt
  `w-full min-w-0 max-w-[1600px] flex-1 px-5 pb-24 pt-8 sm:px-7 sm:pt-10 xl:px-11`.
- Add `tabular-nums whitespace-nowrap` to every currency and percentage figure across
  `OverviewRoute`, `EquityRoute`, `InvestmentsRoute`, `BudgetRoute`, `PlanningRoute`. This is what
  stops `₹53,44,36` / `0.48`.
- Add the `scrollWidth === clientWidth` assertion to the evidence capture script and seed IndexedDB
  before the mobile pass (see `01-app-shell.html` § regression guard).

#### Commit 3 — token additions

`src/index.css` `@theme` — add `--color-act-{300,400,500,900}`, `--color-sev-{crit,warn,info,ok}`,
and `--cat-1..8` + `--cat-other`. Adding only; nothing removed yet.

#### Commit 4 — chart palette and the duplicate donut

- `src/components/charts/chartTheme.ts` — replace `donutPalette` with the 8-step ramp; point
  `donutOther` at `--cat-other`.
- Add `categoricalColor(key: string): string`, hashing a **stable identifier** (asset class, sector
  name, tag label) into the ramp. **Never assign by array index** — a slice must keep its colour
  when ordering or filtering changes.
- Stop rendering `CurrencyExposureDonut` on Equity where base markets and currencies are 1:1 (the
  IN/US Phase-1 case, i.e. always today). It renders the identical split to `AllocationDonut` in
  `market` mode — 59.12 / 40.88 on the seed. Keep the component; call the removal out in the PR body
  rather than silently dropping a panel.
- Rewrite the benchmark caption. Current:
  `BENCHMARK HIDDEN — SWITCH BASE TO COMPARE AGAINST A SINGLE INDEX`. Replacement, sentence case:
  *"Your portfolio spans two markets, so there's no single index to compare against. Set a base
  currency of INR or USD in Settings to overlay NIFTY 50 or the S&P 500."*
- **Demote `tick-*`**: it must no longer appear in `chartTheme.ts`, on any CTA, or on any progress
  fill. It keeps nav-active, focus rings, and the brand mark. This demotion is the point of the
  commit — adding colours without removing the overload leaves no free signal for "act here".

*Tests*: `chartTheme.test.ts` — `categoricalColor` is stable per key across calls, distinct across
the first 8 distinct keys, and returns `--cat-other` for the grouped tail key.

#### Commit 5 — four-tab shell and mobile bottom nav

- `AppShell.tsx` — four primary tabs (Today, Portfolio, Cash flow, Plan); Import and Settings move
  to a bottom utility group behind an `mt-auto` divider.
- Replace the horizontally-scrolling mobile pill row with a 4-item bottom tab bar. Four tabs is
  exactly what fits without crowding — which is why the IA collapse and the mobile nav belong
  together.
- Nav labels only at this point; the routes still resolve to the existing components. Renaming
  Overview → Today is PR-2's commit 4.

#### Commit 6 — Portfolio merge

- Merge `InvestmentsRoute` + `EquityRoute` → `PortfolioRoute` at `/portfolio`. Asset class and
  market become filter chips over one table.
- Redirect `/investments` and `/equity`, following the existing `/analytics` → `/overview` and
  `/holdings` → `/equity` precedent at `src/App.tsx:640`.
- Table → cards below 860px. Never a horizontally-scrolling 8-column table on a phone.
- This should delete the double-counting footnote under the current Investments table ("1
  manually-added equity asset … counted separately from the holdings-derived equity rows above") —
  **verify the merged view genuinely reconciles rather than just hiding the note.**

#### Commit 7 — plain language

- Verdict-first, metric-second. `HHI 0.06` / `SINGLE-STOCK RISK —` / `TOP-5 WEIGHT 40.97%` →
  *"No single position is more than 10% of your portfolio."* Keep the metric as a `title` tooltip
  only if it earns one.
- **Never render a bare em-dash as a value** — it reads ambiguously as zero, unknown, or N/A.
- Sentence-case every section header. Mono survives only for tickers, ISINs, timestamps, FX stamps,
  and broker names.

**Acceptance for PR-1**
- `documentElement.scrollWidth === clientWidth` on every route at 390×844 **with data seeded**.
- No currency figure wraps at 1280, 1440, or 1920.
- Six-slice sector donut and the five-line tag chart are decodable at the 8px legend swatch.
- Grep: `tick-400` survives only in `AppShell.tsx` and the focus-ring rule in `index.css`.
- Grep: `uppercase tracking-[0.16em]` survives only on genuine machine readouts.
- Every old path still resolves via redirect; Portfolio totals equal Overview's net worth exactly.

---

### PR-2 · The app asks for decisions

**The product half.** One new pure module, one new component pair, one route rewrite, and the
retention loops. Depends on PR-1's `sev-*` and `act-*` tokens.

**References**: `03-action-cards.html`, `02-today.html`

#### Commit 1 — honest change-since-last-import (pure logic first)

**Read § The honest-delta constraint before writing any code. Do not build "since your last visit".**

New `src/lib/sinceLastVisit.ts`:

```ts
export type ChangeSinceImport = {
  delta: number | undefined        // undefined when < 2 snapshots — never 0
  deltaPct: number | undefined
  sinceDate: string                // the prior snapshot's YYYY-MM-DD
  importsSinceLastSeen: number
  unchanged: boolean               // exactly one snapshot, or no movement
}
export function changeSinceLastImport(
  history: readonly HistoryRecord[],
  lastSeenAt: number | undefined,
  baseCurrency: BaseCurrency,
): ChangeSinceImport
```

Partial-aware (R1): a snapshot whose positions lack base values contributes `undefined`, never `0`.
Must refuse to compare across differing `baseCurrency` stamps — an INR-base record read as USD is
exactly the failure `history.ts` warns about.

`src/storage/settings.ts` — add optional `lastSeenAt?: number`. Optional scalar on the settings
singleton → **no `DB_VERSION` bump**; absent in `DEFAULT_SETTINGS`, never `0`.

*Tests*: zero snapshots; one snapshot (→ `unchanged: true`, `delta` `undefined`); two with movement;
two with mixed base currency (→ refuses); snapshots containing unstamped positions (→ `undefined`).

#### Commit 2 — the action-rail rule engine (pure logic, no UI)

New `src/lib/actionRail.ts`:

```ts
export type ActionSeverity = 'crit' | 'warn' | 'info'
export type ActionItem = {
  id: string                       // stable: 'risk-drift-high', 'emergency-gap'
  severity: ActionSeverity
  headline: string
  emphasis: string                 // the substring rendered in the severity colour
  detail: string
  primary: { label: string; to: string }
  secondary?: { label: string; to: string }
}
export function buildActionRail(input: RailInput): ActionItem[]
```

`RailInput` carries `now: number` — **injected, never `Date.now()` inside** — or the stale-price rule
is untestable.

Rule set v1 (full table in `03-action-cards.html`):

| id | Fires when | Source | Sev |
|---|---|---|---|
| `risk-drift-<band>` | `abs(pct − targetPct) > 0.10` | `riskAllocation()` — planning.ts:89 | crit |
| `emergency-gap` | `fundedPct < 1` and `target` defined | `emergencyFundStatus()` — planning.ts:30 | warn |
| `stale-prices` | newest `importedAt` > 7 days before `now` | `holdings[]` | info |
| `unstamped-fx` | `totals.unstamped > 0` | `portfolioTotals()` — analytics.ts:42 | info |
| `missing-month` | previous calendar month absent | `budgetMonths[]` | warn |
| `concentration` | any single position > 10% of value | `concentration()` — analytics.ts:375 | warn |

**Every rule must be partial-aware.** An undefined target means the rule *cannot evaluate* and must
not fire — never that the target is zero. This is R1 and it is the most likely bug in the PR.

Cap at 4 items, ordered `crit → warn → info` then by magnitude; overflow collapses to a quiet
"2 more" row. No dismiss in v1 — a dismissable card is one the user never fixes.

*Tests*: one case per rule firing, one per rule **correctly not** firing on undefined input, the
4-item cap, the ordering, and the empty result. Highest-value test file in the plan.

#### Commit 3 — ActionRail and ActionCard components

`src/components/ActionRail.tsx` + `ActionCard.tsx`. Presentational only; all logic stays in the lib.
Three states, all designed: populated, all-clear (**name the conditions checked** — "all clear"
alone reads as a broken feature), and cold start (no data → the import CTA).

Wrap the rail in the existing `ChartErrorBoundary` pattern so a throwing rule cannot take the hero
down with it.

#### Commit 4 — Overview becomes Today

- Rename `OverviewRoute.tsx` → `TodayRoute.tsx`; path `/overview` → `/today`; add
  `{ path: 'overview', loader: () => redirect('/today') }`. Update the root redirect at
  `src/App.tsx:622`. **See § Open decisions — confirm the rename before doing it.**
- Restructure into the three bands from `02-today.html`:
  1. **Hero** — net worth as the one display figure, with the commit-1 delta, the month delta, and
     invested / position-count demoted to a third inline delta. 90-day sparkline right.
  2. **Action rail** at full width, immediately below.
  3. **Supporting grid** — allocation, month's cash, movers. 12px type, no display numerals.
- Delete the 12-tile KPI wall. Emergency fund and Goal stop being full-width sections; Goal becomes
  one row in a supporting panel and earns a card only when the rail fires on it.
- History charts move below the supporting grid, still lazy.

#### Commit 5 — Plan earns its tab

- Give Plan the rebalance math the `risk-drift` card links to: *"To reach 25% high-risk, either sell
  ₹32,20,000, or direct the next 14 months of contributions to safe assets."* `bulkAllocation()`
  (`src/lib/planning.ts:144`) is most of this already.
- Add a what-if control to the Goal card. *"~552 months (46 yr)"* with no adjacent lever teaches
  users to stop reading the card.

#### Commit 6 — retention loops

- **Monthly close** — on the 1st, the `missing-month` rule surfaces "Close out August" with a
  3-field inline form posting to the existing `budgetAction`.
- **Milestones** — first ₹1 crore, 6 months' emergency cover, a risk band returning inside target.
  Fire once, quietly; store fired ids in settings as an optional `string[]` (still no schema bump).
- **Honest streaks only** — "5 months logged in a row", "savings rate above 30% for 4 months".
  **No app-open streaks.** A senior user reads engagement theatre as a reason to distrust the numbers.

**Acceptance for PR-2**
- With one snapshot the hero shows *"Unchanged since your 3 Aug import"*, never `▲ ₹0`. Reloading
  three times does not move the reference date.
- On the seeded portfolio exactly 3 cards render: risk drift (crit), emergency gap (warn), stale
  prices (info).
- With targets unset, **zero** cards render — not six reading `NaN` or `0%`.
- Every card has exactly one primary button.
- One element on Today uses the display-size numeral; everything else is ≤ 21px.
- Plan renders at least one computed recommendation, not only input forms.
- A milestone fires at most once; nothing counts app opens.

---

## 4 Shapes

- **Nature**: the app is currently a *gauge cluster* — it reports state faithfully and asks nothing.
  The redesign makes it a *co-pilot*: same instruments, plus a short list of callouts. The action
  rail is the annunciator panel, and the defining property of an annunciator is that it is usually
  dark.
- **Domain**: personal finance rewards *infrequent, correct* decisions. That argues against
  engagement mechanics and for a rail that is empty most of the time. The stale-price reality (no
  live feed) is a domain fact, not a gap to paper over — surfacing "unchanged since your last
  import" is more honest than manufacturing daily movement.
- **Theory**: the rail is a fold `PortfolioState → ActionItem[]`. Keeping it a pure function of
  already-loaded data is what makes it testable and what stops it becoming a second source of truth.
  The risk is rule creep — every future feature will want a card.
- **Implementation**: highest-risk path is partial data. Six rules × "target unset" × "value
  unstamped" is a large space where `undefined` can be read as `0` and fire a false alarm. One
  `undefined`-in/`undefined`-out discipline, enforced in tests, is the mitigation.

---

## Picked reliability tenets

- **T2 · Critical-path simplicity** — the rail is a pure fold with no I/O, no new loader, no new
  store. A rule that throws must not take down the hero; wrap `ActionRail` in the existing
  `ChartErrorBoundary` pattern.
- **T3 · Blast-radius limits** — with only two PRs, the blast radius is managed at **commit** grain
  rather than PR grain. That is why the commit order is specified and not incidental: each commit is
  independently revertable, the shell fix is isolated as PR-1 commit 1, and PR-2's pure-logic
  commits land before the components that consume them. A reviewer should be able to `git revert`
  any single commit without unpicking the rest.
- **T6 · Staggered rollout with rollback** — post-deploy rollback remains `git revert` → redeploy via
  `deploy.yml`. **Because PR-2 is large, gate the rail behind `FEATURE_ACTION_RAIL`** (defaulting
  `false`, flipped in a one-line follow-up after evidence — the repo's established canary-gate
  pattern). That flag is what restores per-surface rollback granularity that the 8-PR split would
  otherwise have given: noisy rules can be disabled without reverting the Today layout.
- **T4 · Anomaly detection** — with no telemetry, the visible provenance label is the only anomaly
  signal. Every rail card must be traceable to the fold that produced it; keep `id` stable and
  human-readable.

---

## Pre-mortem — it's three months on and this went badly

1. **The rail became a nag wall.** Six cards every visit, the user stops reading it, and it's worse
   than the KPI wall it replaced. → Hard cap of 4. Rules must clear when the condition clears. Ship
   with six rules and delete any that fires on more than half of sessions.
2. **A rule fired on undefined data.** "Emergency fund is ₹0 short" or "high-risk is NaN% over
   target" on a fresh install destroys trust permanently. → Every rule returns `undefined` when it
   cannot evaluate; one test per rule for the un-evaluable case; cold-start state designed explicitly.
3. **"Since last visit" shipped as a lie.** Built against `lastSeenAt` without reading the constraint
   section, so it reads `▲ ₹0` forever and looks broken. → The constraint is called out twice in this
   plan for that reason.
4. **The IA merge broke bookmarks.** → Redirects for `/overview`, `/investments`, `/equity`,
   following the existing `/analytics` and `/holdings` precedent.
5. **The palette change recoloured every chart at once**, so PR-1's evidence became an
   unreviewable wall of visual diff and the real regressions hid inside it. → The palette is its own
   commit (PR-1 commit 4). Post before/after pairs per chart in the evidence comment, grouped by
   commit rather than dumped as one set.
6. **PR-1 grew until the P0 fix was still unmerged a fortnight later.** → The shell fix is commit 1,
   alone and self-contained. If review drags, cherry-pick it onto `main` and carry on; do not wait
   for the IA merge.
7. **PR-2 was too big to review, so it was rubber-stamped.** → `FEATURE_ACTION_RAIL` off by default
   means merging is not shipping. Review the pure-logic commits (1 and 2) properly — they carry all
   the risk — and treat the component commits as presentational.
8. **Mobile broke again.** → The `scrollWidth` assertion lands in PR-1 commit 2 and runs on every
   subsequent capture. This is the single durable outcome of the review.

---

## Open decisions — surface, don't assume

- **`/today` vs keeping `/overview`** as the path. The rename is cosmetic; if it isn't wanted, keep
  the path and change only the heading. Ask before renaming.
- **Whether Plan survives as a top-level tab.** It currently holds three input forms and three bars.
  PR-2 commit 5 gives it the rebalance math and a reason to exist. If that's not wanted, fold it
  into Settings rather than keeping a fourth tab that nobody opens — and drop it from PR-1 commit 5's
  tab list before building the bottom nav, since three tabs and four tabs are different layouts.

**Decided 2026-08-09 (was open):**

- **Two PRs, not eight.** Instructed by the maintainer. The safeguards that the finer split would
  have provided are re-created inside the branches: an isolated cherry-pickable first commit for the
  P0 fix, specified commit ordering, and `FEATURE_ACTION_RAIL` for post-merge rollback granularity.
- **`FEATURE_ACTION_RAIL` — yes.** Was optional under the 8-PR split; is now required, because it is
  the only remaining mechanism for disabling the rail without reverting the Today layout.

---

## Status

Not started. PR-1 is unblocked. Ship PR-1 commit 1 (the four-line shell fix) first regardless of how
the rest of the branch progresses.
