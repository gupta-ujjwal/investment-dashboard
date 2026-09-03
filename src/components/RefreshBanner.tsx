import { Link } from 'react-router-dom'
import type { BaseCurrency } from '../storage/holdings'

const baseLabel: Record<BaseCurrency, string> = { INR: '₹ INR', USD: '$ USD' }

export function RefreshBanner({
  unstamped,
  baseCurrency,
}: {
  unstamped: number
  baseCurrency: BaseCurrency
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-ember-400/30 bg-ember-900/15 px-5 py-4 font-sans text-sm text-ember-300 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ember-400">
          fx pending ·{' '}
        </span>
        {unstamped} {unstamped === 1 ? 'holding has' : 'holdings have'} no{' '}
        {baseLabel[baseCurrency]} value yet. Refresh FX to compute.
      </div>
      <Link
        to="/settings"
        className="inline-flex w-fit items-center gap-2 rounded-full border border-ember-400/40 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-ember-300 transition hover:border-ember-400 hover:text-ember-200"
      >
        → Settings
      </Link>
    </div>
  )
}
