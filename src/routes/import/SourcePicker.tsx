import type { Dispatch } from 'react'
import type { Source } from '../../storage/holdings'
import type { WizardAction } from './wizardState'

type Props = {
  dispatch: Dispatch<WizardAction>
}

const options: Array<{ source: Source; title: string; subtitle: string }> = [
  {
    source: 'vested',
    title: 'Vested',
    subtitle: 'US stocks & ETFs · USD',
  },
  {
    source: 'groww',
    title: 'Groww',
    subtitle: 'India stocks, MFs, ETFs · INR',
  },
]

export function SourcePicker({ dispatch }: Props) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Pick a broker</h2>
      <p className="mt-1 text-sm text-slate-500">
        Each broker has a slightly different export format. Pick the source so we know how to read your file.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {options.map((opt) => (
          <button
            key={opt.source}
            type="button"
            onClick={() => dispatch({ type: 'pick-source', source: opt.source })}
            className="group flex flex-col items-start rounded-lg border border-slate-200 bg-white px-4 py-4 text-left transition hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400"
          >
            <span className="text-base font-semibold text-slate-900 group-hover:text-slate-700">
              {opt.title}
            </span>
            <span className="mt-1 text-xs text-slate-500">{opt.subtitle}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
