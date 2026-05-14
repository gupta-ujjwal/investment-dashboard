type Props =
  | { state: 'committing' }
  | { state: 'done'; onContinue: () => void }

export function CommitStep(props: Props) {
  if (props.state === 'committing') {
    return (
      <section className="border-y border-rule px-6 py-20 text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-rule border-t-ink" />
        <p className="smallcaps mt-6 text-[0.7rem] text-ink-muted">
          Committing changes to your local database
        </p>
      </section>
    )
  }

  return (
    <section className="text-center">
      <p className="smallcaps text-[0.7rem] text-oxblood">Filed</p>
      <h2 className="font-display mt-3 text-4xl font-medium leading-tight text-ink sm:text-5xl">
        Import complete.
      </h2>
      <p className="mt-4 text-sm italic text-ink-muted">
        Your dashboard has been updated. Nothing left this device.
      </p>
      <div className="rule-hairline-strong mx-auto mt-10 w-24" />
      <button
        type="button"
        onClick={props.onContinue}
        className="smallcaps mt-8 border-b-2 border-ink pb-1 text-[0.7rem] font-semibold text-ink hover:text-oxblood hover:border-oxblood"
      >
        View dashboard →
      </button>
    </section>
  )
}
