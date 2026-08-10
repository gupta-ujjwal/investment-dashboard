import type { Dispatch } from 'react'
import type { BrokerSource } from '../../storage/holdings'
import type { WizardAction } from './wizardState'

type Props = {
  dispatch: Dispatch<WizardAction>
}

const options: Array<{
  source: BrokerSource
  title: string
  subtitle: string
  market: string
  ccy: string
}> = [
  {
    source: 'vested',
    title: 'Vested',
    subtitle: 'US stocks & ETFs',
    market: 'NYSE · NASDAQ',
    ccy: 'USD',
  },
  {
    source: 'groww',
    title: 'Groww',
    subtitle: 'India stocks · MFs · ETFs',
    market: 'NSE · BSE',
    ccy: 'INR',
  },
]

export function SourcePicker({ dispatch }: Props) {
  return (
    <section className="border border-bone-100/10 bg-ink-900 p-6 sm:p-8">
      <div className="flex items-baseline justify-between">
        <h3 className="font-sans text-lg font-semibold tracking-tight text-bone-50">
          Pick a broker
        </h3>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-bone-400">
          step 01 / 04
        </span>
      </div>
      <p className="mt-2 max-w-xl font-sans text-sm text-bone-400">
        Every broker exports a different shape. Choose your source so we know how to read it.
      </p>
      <div className="mt-6 grid gap-px overflow-hidden border border-bone-100/10 bg-bone-100/10 sm:grid-cols-2">
        {options.map((opt) => (
          <button
            key={opt.source}
            type="button"
            onClick={() => dispatch({ type: 'pick-source', source: opt.source })}
            className="group relative flex flex-col items-start gap-4 bg-ink-900 px-6 py-7 text-left transition hover:bg-ink-850 focus:outline-none"
          >
            <div className="flex w-full items-center justify-between">
              <span className="font-sans text-lg font-semibold tracking-tight text-bone-50 transition group-hover:text-act-400">
                {opt.title}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-bone-400">
                {opt.ccy}
              </span>
            </div>
            <div className="font-sans text-sm text-bone-300">{opt.subtitle}</div>
            <div className="mt-auto flex w-full items-center justify-between border-t border-bone-100/10 pt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-bone-400">
              <span>{opt.market}</span>
              <span className="text-act-400 opacity-0 transition group-hover:opacity-100">→</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}
