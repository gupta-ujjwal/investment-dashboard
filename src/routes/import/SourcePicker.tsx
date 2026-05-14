import type { Dispatch } from 'react'
import type { Source } from '../../storage/holdings'
import type { WizardAction } from './wizardState'

type Props = {
  dispatch: Dispatch<WizardAction>
}

const options: Array<{
  source: Source
  initial: string
  title: string
  market: string
  detail: string
}> = [
  {
    source: 'vested',
    initial: 'V',
    title: 'Vested',
    market: 'US Markets',
    detail: 'NYSE & NASDAQ — US Dollar',
  },
  {
    source: 'groww',
    initial: 'G',
    title: 'Groww',
    market: 'Indian Markets',
    detail: 'NSE & BSE — Indian Rupee',
  },
]

export function SourcePicker({ dispatch }: Props) {
  return (
    <section>
      <h2 className="font-display text-2xl font-normal italic text-ink">Pick the broker.</h2>
      <p className="mt-2 max-w-prose text-sm text-ink-muted">
        Each broker exports a slightly different file. Pick the source so we know how to read it.
      </p>

      <ul className="mt-8 divide-y divide-rule border-y border-rule">
        {options.map((opt) => (
          <li key={opt.source}>
            <button
              type="button"
              onClick={() => dispatch({ type: 'pick-source', source: opt.source })}
              className="group flex w-full items-baseline gap-6 py-6 text-left transition-colors focus:outline-none focus-visible:bg-bg-elev"
            >
              <span
                aria-hidden
                className="font-display text-4xl font-medium text-brass leading-none transition-colors group-hover:text-ink"
              >
                {opt.initial}
              </span>
              <span className="flex-1">
                <span className="font-display block text-xl italic font-normal text-ink transition-colors group-hover:text-brass">
                  {opt.title}
                </span>
                <span className="eyebrow mt-1 block">{opt.market}</span>
                <span className="mt-2 block text-sm text-ink-muted">{opt.detail}</span>
              </span>
              <span
                aria-hidden
                className="font-mono text-xs text-ink-soft transition-colors group-hover:text-brass"
              >
                choose →
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
