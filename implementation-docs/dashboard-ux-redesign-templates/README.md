# Design reference templates — `dashboard-ux-redesign`

Static HTML references for the plan at `implementation-docs/dashboard-ux-redesign.md`.
Open any file directly in a browser (`file://`) — they are self-contained apart from the shared
`_tokens.css` sibling.

**These are references, not code to copy.** The app is React + Tailwind v4; these are plain
HTML + CSS. The bridge is the `data-tw` attribute: every structural element carries the literal
Tailwind class string to write in the component.

```html
<aside class="sidebar" data-tw="sticky top-0 hidden h-screen w-56 shrink-0 flex-col px-3 py-5 hairline-r md:flex">
```

→ in `AppShell.tsx`, that element's `className` is the `data-tw` value. The `class` attribute and
`_tokens.css` exist only so the file renders standalone.

| File | Consumed by | What it pins down |
|---|---|---|
| `_tokens.css` | all | The token set. Mirrors `src/index.css` `@theme` plus the three additions. |
| `00-tokens.html` | PR-1 c3–c4 | New `act-*` / `sev-*` tokens, the 8-step categorical ramp, type scale, and the colour-usage rules table. |
| `01-app-shell.html` | PR-1 c1–c2, c5 | The `flex-col md:flex-row` fix, fluid `max-w`, the 4-tab sidebar + utility group, mobile bottom tab bar, and the `scrollWidth` regression guard. |
| `02-today.html` | PR-2 c4 | The three-band Today layout: hero → action rail → supporting grid. |
| `03-action-cards.html` | PR-2 c2–c3 | The action card component: severities, all-clear, cold start, and the v1 rule table. |
| `04-portfolio.html` | PR-1 c6 | Merged Investments + Equity: filter chips, `tabular-nums` table, mobile card fallback. |

### One deliberate divergence

`01-app-shell.html` shows the desktop and mobile shells side by side in one window, so its demo
boxes switch on explicit `.is-desktop` / `.is-mobile` classes rather than a `md:` breakpoint —
CSS media queries key off the viewport, not the container, and would otherwise render both boxes in
the same state. **The real component uses the responsive Tailwind classes in `data-tw`, not these
state classes.**

## Rules that apply to every template

- **Never assign a categorical colour by array index.** Key it off the slice's stable identifier
  (asset class, sector name, tag label) so a slice keeps its colour when the ordering changes.
- **`--color-act-400` is a fill only for actions.** If it appears on a chart series or a progress
  bar, the change is wrong.
- **Every money figure gets `tabular-nums` + `whitespace-nowrap`.** This is the fix for the Equity
  KPIs breaking mid-number today.
- **Severity ≠ money direction.** `sev-crit` means a target is breached; `ember-400` means value
  fell. A green portfolio can still show a red card.

Figures in the templates are real loader output from the seeded portfolio used in the review
(20 holdings, 6 manual assets, 8 months of budget) — not placeholders. Keep them when building, so
a screenshot of the finished component is directly comparable to the template.
