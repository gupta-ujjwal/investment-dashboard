import { useId, useMemo, useState } from 'react'
import type { ManualAsset } from '../storage/assets'
import type { BudgetMonth } from '../storage/budget'
import type { CanonicalHolding } from '../storage/holdings'
import type { Settings } from '../storage/settings'
import { buildActionRail, type ActionSeverity } from '../lib/actionRail'
import { ActionCard, SEVERITY_TEXT } from './ActionCard'
import { ChartErrorBoundary } from './charts/ChartErrorBoundary'

type Props = {
  holdings: readonly CanonicalHolding[]
  assets: readonly ManualAsset[]
  budgetMonths: readonly BudgetMonth[]
  settings: Settings
  now: number
}

/**
 * The homepage action rail — up to 4 things worth a look, folded from
 * holdings/assets/budget/settings by `buildActionRail` (pure, no I/O). Three
 * states: cold-start (nothing imported yet — defensive; `OverviewRoute`
 * itself renders a full-page empty state before this ever mounts, but the
 * component doesn't assume a caller-enforced invariant), all-clear (rules
 * evaluated, nothing fired), and populated (collapsible to a one-line
 * summary via `RailDisclosure` below). Wrapped in `ChartErrorBoundary`
 * so a bad fold degrades to a placeholder instead of taking the homepage
 * down with it — the same per-widget bulkhead every other Overview card and
 * chart already gets.
 */
export function ActionRail({ holdings, assets, budgetMonths, settings, now }: Props) {
  const items = useMemo(
    () => buildActionRail({ holdings, assets, budgetMonths, settings, now }),
    [holdings, assets, budgetMonths, settings, now],
  )

  const coldStart = holdings.length === 0 && assets.length === 0

  return (
    <ChartErrorBoundary title="Action rail">
      {coldStart ? (
        <p className="rounded-2xl border border-dashed border-bone-100/15 bg-ink-900 px-5 py-4 font-sans text-xs text-bone-400">
          Add holdings or assets to get personalized guidance here.
        </p>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-bone-100/10 bg-ink-900 px-5 py-4 font-sans text-xs text-bone-400">
          Nothing needs your attention right now.
        </p>
      ) : (
        <RailDisclosure
          count={items.length}
          severity={items[0].severity}
          storageKey="overview:action-rail:collapsed"
        >
          <ul className="space-y-3">
            {items.map((item) => (
              <ActionCard key={item.id} item={item} />
            ))}
          </ul>
        </RailDisclosure>
      )}
    </ChartErrorBoundary>
  )
}

const SEVERITY_DOT: Record<ActionSeverity, string> = {
  crit: 'bg-sev-crit',
  warn: 'bg-sev-warn',
  info: 'bg-sev-info',
}

/** Collapsed form of the populated rail — a returning user who just wants
 *  the numbers shouldn't have to scroll past a wall of cards every visit,
 *  so the whole list folds into a single summary line (count + worst
 *  severity) and back. Same mechanics as Portfolio's `SectionDisclosure` —
 *  a real `<button>` inside the section, `aria-expanded`/`aria-controls`,
 *  a rotating caret, default open (hiding a returning user's cards by
 *  default would be a surprise), and a guarded `localStorage` write
 *  (`'1'` = collapsed) that falls back to session-only toggling on
 *  private-mode/quota failures — but a deliberately different shape:
 *  `SectionDisclosure` collapses its body to nothing, while here the
 *  collapsed state must render a one-line stand-in for the list. The strip
 *  therefore stays on screen in both states, so the toggle never moves or
 *  restyles between them. `severity` must be the worst present — the
 *  caller passes `items[0].severity` off `buildActionRail`'s
 *  crit -> warn -> info sort. */
function RailDisclosure({
  count,
  severity,
  storageKey,
  children,
}: {
  count: number
  severity: ActionSeverity
  storageKey: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(storageKey) !== '1'
    } catch {
      return true
    }
  })
  const bodyId = useId()

  function toggle() {
    setOpen((prev) => {
      const next = !prev
      try {
        if (next) localStorage.removeItem(storageKey)
        else localStorage.setItem(storageKey, '1')
      } catch {
        // Session-only fallback — see doc comment above.
      }
      return next
    })
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex w-full items-center gap-2.5 rounded-2xl border border-bone-100/10 bg-ink-900 px-5 py-3.5 text-left transition hover:border-bone-100/30"
      >
        <span
          aria-hidden="true"
          className={`h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[severity]}`}
        />
        <span className="font-sans text-sm text-bone-100">
          <span className={`font-semibold ${SEVERITY_TEXT[severity]}`}>{count}</span>{' '}
          {count === 1 ? 'needs' : 'need'} your attention
        </span>
        <span
          aria-hidden="true"
          className={`ml-auto font-mono text-[10px] text-bone-400 transition-transform ${open ? '' : '-rotate-90'}`}
        >
          ▾
        </span>
      </button>
      {open && <div id={bodyId}>{children}</div>}
    </div>
  )
}
