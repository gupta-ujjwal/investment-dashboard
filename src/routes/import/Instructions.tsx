import type { Dispatch } from 'react'
import type { BrokerSource } from '../../storage/holdings'
import type { WizardAction } from './wizardState'

type Props = {
  source: BrokerSource
  dispatch: Dispatch<WizardAction>
}

const instructions: Record<BrokerSource, { title: string; steps: string[] }> = {
  vested: {
    title: 'Download your Vested holdings',
    steps: [
      'Open the Vested app or vestedfinance.com and sign in.',
      'Go to Portfolio → tap the share / export icon at the top right.',
      'Choose "Download holdings as .xlsx" (or visit Profile → Statements if the in-app export is unavailable).',
      'Save the file somewhere you can find it — you\'ll upload it on the next step.',
    ],
  },
  groww: {
    title: 'Download your Groww holdings',
    steps: [
      'Open the Groww app or groww.in and sign in.',
      'Tap Profile (top right) → Reports.',
      'Pick "Holdings statement" → choose the financial year covering today → tap Download (Excel).',
      'Save the file somewhere you can find it — you\'ll upload it on the next step.',
    ],
  },
}

export function Instructions({ source, dispatch }: Props) {
  const info = instructions[source]

  return (
    <section className="rounded-2xl border border-bone-100/10 bg-ink-900 p-6 sm:p-8">
      <div className="flex items-baseline justify-between">
        <h3 className="font-sans text-lg font-semibold tracking-tight text-bone-50">
          {info.title}
        </h3>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-bone-400">
          step 02 / 04
        </span>
      </div>
      <ol className="mt-6 space-y-1 border-t border-bone-100/10">
        {info.steps.map((step, i) => (
          <li key={i} className="flex gap-5 border-b border-bone-100/10 py-4">
            <span className="font-mono text-[11px] tabular-nums text-act-400">
              {String(i + 1).padStart(2, '0')}
            </span>
            <span className="font-sans text-sm text-bone-100">{step}</span>
          </li>
        ))}
      </ol>
      <div className="mt-8 flex flex-col-reverse items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <button type="button" onClick={() => dispatch({ type: 'back-to-source' })} className="btn-secondary">
          ← Back
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: 'instructions-acknowledged' })}
          className="btn-primary"
        >
          I have the file →
        </button>
      </div>
    </section>
  )
}
