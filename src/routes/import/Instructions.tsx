import type { Dispatch } from 'react'
import type { Source } from '../../storage/holdings'
import type { WizardAction } from './wizardState'

type Props = {
  source: Source
  dispatch: Dispatch<WizardAction>
}

const instructions: Record<Source, { title: string; steps: string[] }> = {
  vested: {
    title: 'Download your Vested holdings.',
    steps: [
      'Open the Vested app or vestedfinance.com and sign in.',
      'Go to Portfolio → tap the share / export icon at the top right.',
      'Choose "Download holdings as .xlsx" (or visit Profile → Statements if the in-app export is unavailable).',
      "Save the file somewhere you can find it — you'll upload it on the next step.",
    ],
  },
  groww: {
    title: 'Download your Groww holdings.',
    steps: [
      'Open the Groww app or groww.in and sign in.',
      'Tap Profile (top right) → Reports.',
      'Pick "Holdings statement" → choose the financial year covering today → tap Download (Excel).',
      "Save the file somewhere you can find it — you'll upload it on the next step.",
    ],
  },
}

export function Instructions({ source, dispatch }: Props) {
  const info = instructions[source]
  const sourceLabel = source === 'vested' ? 'Vested' : 'Groww'

  return (
    <section>
      <p className="eyebrow">{sourceLabel}</p>
      <h2 className="font-display mt-2 text-2xl font-normal italic text-ink">{info.title}</h2>

      <ol className="mt-8 space-y-5 border-l-2 border-rule-strong pl-6">
        {info.steps.map((step, i) => (
          <li key={i} className="relative">
            <span
              aria-hidden
              className="font-mono absolute -left-[2.4rem] top-1 text-xs text-brass"
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            <p className="text-[0.95rem] leading-relaxed text-ink">{step}</p>
          </li>
        ))}
      </ol>

      <div className="rule-hairline mt-10 pt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => dispatch({ type: 'back-to-source' })}
          className="font-mono text-xs text-ink-soft hover:text-ink"
        >
          ← back
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: 'instructions-acknowledged' })}
          className="link-brass text-sm font-medium hover:text-brass"
        >
          I have the file →
        </button>
      </div>
    </section>
  )
}
