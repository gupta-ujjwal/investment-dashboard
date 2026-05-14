type Props =
  | { state: 'committing' }
  | { state: 'done'; onContinue: () => void }

export function CommitStep(props: Props) {
  if (props.state === 'committing') {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-12 text-center shadow-sm">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-slate-700" />
        <p className="mt-4 text-sm text-slate-600">Committing changes to your local database…</p>
      </section>
    )
  }

  return (
    <section className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-12 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          className="h-5 w-5"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
      </div>
      <h2 className="mt-4 text-base font-semibold text-emerald-900">Import complete</h2>
      <p className="mt-1 text-sm text-emerald-700">Your dashboard has been updated.</p>
      <button
        type="button"
        onClick={props.onContinue}
        className="mt-6 rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
      >
        View dashboard
      </button>
    </section>
  )
}
