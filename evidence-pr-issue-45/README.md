# Playwright evidence — PR #45 (personal-finance dashboard revamp)

Captured against the local dev server (`npm run dev`, `http://localhost:5173/investment-dashboard/`)
with a realistic seeded dataset (3 holdings incl. one deliberately unstamped, 5 manual
assets across gold/crypto/FD/savings/NPS, 2 budget months, and planning/goal targets).
Two viewports: **desktop 1440×900** and **mobile 390×844**.

> Capture note: the Playwright **MCP** browser could not launch in this environment — the
> shell injects `LD_LIBRARY_PATH=/nix/store/...alsa-lib...`, forcing Chrome to load Nix
> libs that need a newer glibc than the system provides (`GLIBC_2.38 not found`). The same
> Playwright Chromium (`chromium-1223`, Chrome-for-Testing 148) was driven via a
> `playwright-core` script with `LD_LIBRARY_PATH` cleared, producing identical artifacts.
> The capture script + raw console log live in the gitignored `notes/` scratch, not here.

## Screenshots

| File | Route | What it shows |
|------|-------|---------------|
| `analytics-desktop.png` | `/analytics` | Net worth **₹15,78,800** with the **partial-total explainer** (1 of 3 positions excluded — the unstamped Infosys holding — never silently understated), allocation-by-class bars, **Goal 31.6%**, equity-holdings KPIs, risk row, charts |
| `analytics-mobile.png` | `/analytics` | Same, single-column; header nav is a horizontal scroll strip |
| `holdings-desktop.png` | `/holdings` | Equity holdings table + **Other assets** section (gold/crypto/FD/savings/NPS) with EMERGENCY tags; value-only Savings shows `—` for invested/return |
| `holdings-add-asset-modal.png` | `/holdings` | Add-asset modal: name, class, currency, current/invested, planning tags (risk band + emergency-fund) |
| `holdings-mobile.png` | `/holdings` | Mobile card layout for holdings + assets |
| `budget-desktop.png` | `/budget` | Cross-month summary (Income ₹5,60,000 · Spent 40% · Invested 9% · Remaining 51%), month editor, saved months with per-month % |
| `budget-mobile.png` | `/budget` | Mobile budget layout |
| `planning-desktop.png` | `/planning` | Emergency fund **97%** (₹8,70,500 / ₹9,00,000, ~5.8 mo cover), risk allocation vs target (Safe 70%/target 50%, Moderate 5.5%/30%, High 24.5%/20%), bulk-invest what-if |
| `planning-mobile.png` | `/planning` | Mobile planning layout |
| `settings-desktop.png` | `/settings` | **Planning & goals** fieldset (goal corpus, monthly contribution, emergency need/months, allocation targets 50/30/20) + updated Data-backup copy ("captures everything — holdings, manual assets, budget months, and planning/goal targets") |

## Console summary

47 messages total across all routes/viewports: **1 error, 13 warnings, 0 new to this PR.**

| Class | Count | New? | Detail |
|-------|-------|------|--------|
| `error` — `Failed to load resource: 404` | 1 | **pre-existing** | Browser's automatic `/favicon.ico` request — no favicon is declared in `index.html` (identical to `main`). Not feature-related. |
| `warning` — *"Matched leaf route at `/` does not have an element or Component"* | — | **pre-existing** | React Router v7 dev-mode warning for the index route, which is a loader-only redirect (unchanged from `main`). |
| `warning` — *"No `HydrateFallback` element provided…"* | — | **pre-existing** | Generic React Router v7 dev-mode hydration warning, emitted on every route regardless of this PR. |

**Conclusion: no new errors or warnings introduced by this PR.** (Raw console dump kept in
the gitignored `notes/dashboard-revamp-expansion/console-raw.txt`, not committed.)

## Accessibility snapshot (excerpt — net-worth region, `/analytics`)

The net-worth section exposes a labelled region with the partial-total status surfaced as
text (not colour-only): a `region "Net worth"` containing the KPI figures and a
`status` node carrying the "N of M positions have no base-currency value yet … excluded
from the total" explainer. Charts keep their `img` role + text `aria-label` summaries.
</content>
