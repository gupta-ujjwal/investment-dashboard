type Props =
  | { state: 'committing' }
  | { state: 'done'; onContinue: () => void; fxWarning: string | null }

export function CommitStep(props: Props) {
  if (props.state === 'committing') {
    return (
      <section className="rounded-2xl border border-bone-100/10 bg-ink-900 p-16 text-center">
        <div className="mx-auto h-10 w-10 spin-slow rounded-full border border-bone-100/15 border-t-act-400" />
        <p className="mt-6 font-sans text-sm text-bone-300">Committing to local storage…</p>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-bone-400">
          indexedDB · on-device
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-jade-400/40 bg-jade-900/20 p-16 text-center">
      <div
        className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-jade-400 text-jade-400"
        aria-hidden="true"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="h-6 w-6"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
      </div>
      <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.2em] text-jade-300">
        Reconciled
      </p>
      <h2 className="mt-2 font-sans text-2xl font-semibold tracking-tight text-bone-50">
        Import complete
      </h2>
      <p className="mt-2 font-sans text-sm text-bone-300">
        Your positions are saved on this device.
      </p>
      {props.fxWarning && (
        <div className="mx-auto mt-6 max-w-md rounded-lg border border-ember-400/40 bg-ember-900/30 p-4 text-left font-sans text-xs text-ember-300">
          <span className="font-mono text-[11px] uppercase tracking-[0.18em]">
            fx warning ·{' '}
          </span>
          {props.fxWarning}
        </div>
      )}
      <button type="button" onClick={props.onContinue} className="btn-primary mt-8">
        View analytics →
      </button>
    </section>
  )
}
