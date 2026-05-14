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
      <h2 className="font-display text-2xl font-medium text-ink">Pick the broker</h2>
      <p className="mt-2 max-w-prose text-sm text-ink-muted">
        Each broker exports a slightly different file. Pick the source so we know how to read it.
      </p>

      <ul className="mt-8 divide-y divide-rule border-y border-rule">
        {options.map((opt) => (
          <li key={opt.source}>
            <button
              type="button"
              onClick={() => dispatch({ type: 'pick-source', source: opt.source })}
              className="group flex w-full items-baseline gap-6 py-6 text-left transition-colors hover:text-oxblood focus:outline-none focus-visible:bg-paper-deep"
            >
              <span
                aria-hidden
                className="font-display text-4xl font-medium text-oxblood leading-none"
              >
                {opt.initial}
              </span>
              <span className="flex-1">
                <span className="font-display block text-xl font-medium text-ink group-hover:text-oxblood">
                  {opt.title}
                </span>
                <span className="smallcaps mt-1 block text-[0.65rem] text-ink-muted">
                  {opt.market}
                </span>
                <span className="mt-2 block text-sm text-ink-muted">{opt.detail}</span>
              </span>
              <span
                aria-hidden
                className="smallcaps text-[0.7rem] text-ink-soft transition-colors group-hover:text-oxblood"
              >
                Choose →
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
