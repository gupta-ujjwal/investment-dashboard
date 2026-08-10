type Props =
  | { state: 'committing' }
  | { state: 'done'; onContinue: () => void }

export function CommitStep(props: Props) {
  if (props.state === 'committing') {
    return (
      <section className="border border-bone-100/10 bg-ink-900 p-16 text-center">
        <div className="mx-auto h-10 w-10 spin-slow border border-bone-100/15 border-t-act-400" />
        <p className="mt-6 font-sans text-sm text-bone-300">Committing to local storage…</p>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-bone-400">
          indexedDB · on-device
        </p>
      </section>
    )
  }

  return (
    <section className="border border-jade-400/40 bg-jade-900/20 p-16 text-center">
      <div
        className="mx-auto flex h-12 w-12 items-center justify-center border border-jade-400 text-jade-400"
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
      <button
        type="button"
        onClick={props.onContinue}
        className="mt-8 border border-act-400 bg-act-400 px-6 py-2.5 font-sans text-[11px] font-medium uppercase tracking-[0.16em] text-ink-950 transition hover:bg-act-300"
      >
        View analytics →
      </button>
    </section>
  )
}
