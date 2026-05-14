import type { Dispatch } from 'react'
import type { Source } from '../../storage/holdings'
import type { WizardAction } from './wizardState'

type Props = {
  source: Source
  dispatch: Dispatch<WizardAction>
}

const instructions: Record<Source, { title: string; steps: string[] }> = {
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
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">{info.title}</h2>
      <ol className="mt-4 space-y-2 text-sm text-slate-700">
        {info.steps.map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <div className="mt-6 flex justify-between">
        <button
          type="button"
          onClick={() => dispatch({ type: 'back-to-source' })}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: 'instructions-acknowledged' })}
          className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
        >
          I have the file
        </button>
      </div>
    </section>
  )
}
