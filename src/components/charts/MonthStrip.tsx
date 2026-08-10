import { useEffect, useRef } from 'react'
import type { BaseCurrency } from '../../storage/holdings'
import type { BudgetMonth } from '../../storage/budget'
import { summarizeMonth } from '../../lib/budget'
import { formatMoney } from '../../lib/format'
import { compactMoney, formatMonthKey } from './chartTheme'

type Props = {
  /** Months as the loader supplies them (newest-first); the strip reverses to
   *  oldest→newest so the timeline reads left-to-right. */
  months: BudgetMonth[]
  base: BaseCurrency
  /** The focused month key, or `null` while adding a new month. */
  focused: string | null
  onFocus: (month: string) => void
  onAdd: () => void
}

const TRACK_PX = 72

/**
 * The horizontal month timeline — one segment per logged month, each a small
 * stacked bar (spent = ember, invested = jade, remaining = bone) whose height is
 * scaled to the busiest month so the row doubles as an at-a-glance trend. The
 * segment is also the navigation control: click to focus that month below. A `+`
 * at the end (newest side) adds a month. Horizontally scroll-snaps for long
 * histories; the focused segment is auto-scrolled into view.
 */
export function MonthStrip({ months, base, focused, onFocus, onAdd }: Props) {
  const ordered = [...months].reverse() // oldest → newest
  const rows = ordered.map((m) => ({ month: m, s: summarizeMonth(m) }))

  // Scale bars to the busiest month: max of income vs (spent+invested) so an
  // overspent bar (outflow > income) still fits the track. 0 when no data.
  const scale = rows.reduce(
    (max, { s }) => Math.max(max, s.totalIncome, s.totalExpenses + s.invested),
    0,
  )

  const focusedRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    focusedRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [focused])

  return (
    <div className="flex items-end gap-2 overflow-x-auto pb-2 [scrollbar-width:thin] snap-x">
      {rows.map(({ month, s }) => {
        const isFocused = month.month === focused
        const px = (value: number) => (scale > 0 ? Math.round((value / scale) * TRACK_PX) : 0)
        const remaining = Math.max(s.remaining, 0)
        return (
          <button
            key={month.month}
            ref={isFocused ? focusedRef : undefined}
            type="button"
            onClick={() => onFocus(month.month)}
            aria-pressed={isFocused}
            aria-label={`${formatMonthKey(month.month)} — income ${formatMoney(
              s.totalIncome,
              base,
            )}, spent ${formatMoney(s.totalExpenses, base)}, invested ${formatMoney(s.invested, base)}`}
            title={`${formatMonthKey(month.month)} · income ${compactMoney(s.totalIncome, base)}`}
            className={`group flex shrink-0 snap-start flex-col items-center gap-1.5 border px-3 pt-2 pb-1.5 transition ${
              isFocused
                ? 'border-act-400 bg-ink-800'
                : 'border-bone-100/10 bg-ink-900 hover:border-bone-100/25'
            }`}
          >
            <div className="flex h-[72px] w-8 flex-col-reverse" aria-hidden="true">
              <span style={{ height: px(s.totalExpenses) }} className="w-full bg-ember-400/70" />
              <span style={{ height: px(s.invested) }} className="w-full bg-jade-400/70" />
              <span style={{ height: px(remaining) }} className="w-full bg-bone-400/50" />
            </div>
            <span
              className={`whitespace-nowrap font-mono text-[10px] tabular-nums ${
                isFocused ? 'text-act-400' : 'text-bone-400 group-hover:text-bone-200'
              }`}
            >
              {formatMonthKey(month.month)}
            </span>
          </button>
        )
      })}

      <button
        type="button"
        onClick={onAdd}
        aria-label="Add a month"
        aria-pressed={focused === null}
        className={`flex h-[104px] shrink-0 snap-start items-center justify-center border border-dashed px-4 font-mono text-lg transition ${
          focused === null
            ? 'border-act-400 text-act-400'
            : 'border-bone-100/20 text-bone-400 hover:border-act-400 hover:text-act-400'
        }`}
      >
        +
      </button>
    </div>
  )
}
