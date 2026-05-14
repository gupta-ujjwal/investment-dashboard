import type { Dispatch } from 'react'
import { toDeleteKeys } from '../../parsers/diff'
import { commitImport, exportSnapshot, type CanonicalHolding } from '../../storage/holdings'
import { formatMoney, formatQuantity } from '../../lib/format'
import type { WizardAction, WizardState } from './wizardState'

type Props = {
  state: WizardState
  dispatch: Dispatch<WizardAction>
}

export function PreviewStep({ state, dispatch }: Props) {
  if (!state.diff || !state.parseResult || !state.source) return null

  const { diff, parseResult, decisions, commitError } = state
  const insertCount = diff.inserts.length
  const updateCount = diff.updates.length
  const missingCount = diff.missing.length
  const skipped = parseResult.skipped
  const extremes = computeExtremes([...diff.inserts, ...diff.updates])

  async function handleCommit() {
    if (!state.diff) return
    dispatch({ type: 'commit-started' })
    try {
      const toDelete = state.diff.missing.filter(
        (m) => decisions[m.sourceSymbol] === 'delete',
      )
      await commitImport({
        inserts: state.diff.inserts,
        updates: state.diff.updates,
        deletes: toDeleteKeys(toDelete),
      })
      dispatch({ type: 'commit-ok' })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      dispatch({ type: 'commit-failed', message })
    }
  }

  async function handleBackup() {
    const json = await exportSnapshot()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    a.href = url
    a.download = `holdings-backup-${stamp}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="space-y-6">
      <div className="border border-bone-100/10 bg-ink-900 p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-sans text-lg font-semibold tracking-tight text-bone-50">
              Review changes
            </h3>
            <p className="mt-1 font-sans text-sm text-bone-400">
              Compare the parsed file against existing positions before commit.
            </p>
          </div>
          <button
            type="button"
            onClick={handleBackup}
            className="hidden border border-bone-100/15 px-3 py-2 font-sans text-[10px] font-medium uppercase tracking-[0.16em] text-bone-300 transition hover:border-tick-400 hover:text-tick-400 sm:block"
          >
            ↓ Backup .json
          </button>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden border border-bone-100/10 bg-bone-100/10 sm:grid-cols-4">
          <Stat label="New" value={insertCount} tone="jade" />
          <Stat label="Updates" value={updateCount} tone="tick" />
          <Stat label="Missing" value={missingCount} tone={missingCount > 0 ? 'ember' : 'mute'} />
          <Stat label="Skipped" value={skipped} tone="mute" />
        </dl>

        {extremes && (
          <div className="mt-6 border-l-2 border-tick-400/60 bg-ink-850 px-4 py-3 font-sans text-xs text-bone-300">
            <span className="font-mono uppercase tracking-[0.16em] text-tick-400">
              sanity check ·{' '}
            </span>
            largest holding {formatQuantity(extremes.maxQty.quantity)} {extremes.maxQty.name}
            {' · '}
            highest avg buy{' '}
            {formatMoney(extremes.maxPrice.avgBuyPrice, extremes.maxPrice.currency)} for{' '}
            {extremes.maxPrice.name}
          </div>
        )}

        {commitError && (
          <div className="mt-6 border border-ember-400/40 bg-ember-900/30 p-4 font-sans text-sm text-ember-300">
            <span className="font-mono text-[11px] uppercase tracking-[0.18em]">
              commit failed ·{' '}
            </span>
            {commitError}
          </div>
        )}
      </div>

      {missingCount > 0 && <MissingRowsPanel state={state} dispatch={dispatch} />}

      <div className="flex flex-col-reverse items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={() => dispatch({ type: 'back-to-upload' })}
          className="border border-bone-100/15 px-4 py-2.5 font-sans text-[11px] font-medium uppercase tracking-[0.16em] text-bone-300 transition hover:border-bone-100/40 hover:text-bone-50"
        >
          ← Reject
        </button>
        <button
          type="button"
          onClick={handleCommit}
          disabled={insertCount === 0 && updateCount === 0 && missingCount === 0}
          className="border border-tick-400 bg-tick-400 px-6 py-2.5 font-sans text-[11px] font-medium uppercase tracking-[0.16em] text-ink-950 transition hover:bg-tick-200 disabled:cursor-not-allowed disabled:border-bone-100/15 disabled:bg-bone-100/5 disabled:text-bone-400"
        >
          Commit changes →
        </button>
      </div>
    </section>
  )
}

type StatTone = 'jade' | 'tick' | 'ember' | 'mute'
const toneAccent: Record<StatTone, string> = {
  jade: 'text-jade-400',
  tick: 'text-tick-400',
  ember: 'text-ember-400',
  mute: 'text-bone-300',
}
const toneRail: Record<StatTone, string> = {
  jade: 'bg-jade-400/70',
  tick: 'bg-tick-400/70',
  ember: 'bg-ember-400/70',
  mute: 'bg-bone-300/50',
}

function Stat({ label, value, tone }: { label: string; value: number; tone: StatTone }) {
  return (
    <div className="bg-ink-900 px-4 py-5">
      <dt className="flex items-center gap-2 font-sans text-[10px] uppercase tracking-[0.18em] text-bone-400">
        <span className={`h-px w-3 ${toneRail[tone]}`} />
        {label}
      </dt>
      <dd className={`mt-2 font-display text-3xl leading-none tabular-nums ${toneAccent[tone]}`}>
        {value}
      </dd>
    </div>
  )
}

function MissingRowsPanel({ state, dispatch }: Props) {
  if (!state.diff) return null
  const { missing } = state.diff

  return (
    <div className="border border-ember-400/30 bg-ember-900/15 p-6 sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-sans text-base font-semibold tracking-tight text-ember-300">
            {missing.length} on file · absent from this upload
          </h3>
          <p className="mt-1 max-w-xl font-sans text-sm text-ember-300/70">
            Pick{' '}
            <span className="font-mono text-[11px] uppercase tracking-[0.16em]">keep</span>{' '}
            (unchanged) or{' '}
            <span className="font-mono text-[11px] uppercase tracking-[0.16em]">delete</span>{' '}
            (removed on commit).
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => dispatch({ type: 'set-all-decisions', decision: 'keep' })}
            className="border border-bone-100/15 px-3 py-1.5 font-sans text-[10px] font-medium uppercase tracking-[0.16em] text-bone-300 transition hover:border-bone-100/40 hover:text-bone-50"
          >
            Keep all
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: 'set-all-decisions', decision: 'delete' })}
            className="border border-ember-400/40 px-3 py-1.5 font-sans text-[10px] font-medium uppercase tracking-[0.16em] text-ember-300 transition hover:border-ember-400 hover:text-ember-400"
          >
            Delete all
          </button>
        </div>
      </div>

      <ul className="mt-6 divide-y divide-bone-100/10 border border-bone-100/10 bg-ink-900">
        {missing.map((row) => {
          const decision = state.decisions[row.sourceSymbol] ?? 'keep'
          return (
            <li
              key={row.sourceSymbol}
              className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate font-sans text-sm font-medium text-bone-50">
                  {row.name}
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-bone-400">
                  {row.sourceSymbol} · {formatQuantity(row.quantity)} @{' '}
                  {formatMoney(row.avgBuyPrice, row.currency)}
                </p>
              </div>
              <div className="flex gap-2">
                <DecisionButton
                  active={decision === 'keep'}
                  onClick={() =>
                    dispatch({
                      type: 'set-decision',
                      sourceSymbol: row.sourceSymbol,
                      decision: 'keep',
                    })
                  }
                  label="Keep"
                />
                <DecisionButton
                  active={decision === 'delete'}
                  onClick={() =>
                    dispatch({
                      type: 'set-decision',
                      sourceSymbol: row.sourceSymbol,
                      decision: 'delete',
                    })
                  }
                  label="Delete"
                  destructive
                />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function DecisionButton({
  active,
  onClick,
  label,
  destructive = false,
}: {
  active: boolean
  onClick: () => void
  label: string
  destructive?: boolean
}) {
  const base = 'border px-3 py-1.5 font-sans text-[10px] font-medium uppercase tracking-[0.16em] transition'
  let classes: string
  if (active && destructive) classes = 'border-ember-400 bg-ember-400 text-ink-950'
  else if (active) classes = 'border-tick-400 bg-tick-400 text-ink-950'
  else classes = 'border-bone-100/15 text-bone-300 hover:border-bone-100/40 hover:text-bone-50'

  return (
    <button type="button" onClick={onClick} className={`${base} ${classes}`}>
      {label}
    </button>
  )
}

function computeExtremes(rows: CanonicalHolding[]) {
  if (rows.length === 0) return null
  let maxQty = rows[0]
  let maxPrice = rows[0]
  for (const r of rows) {
    if (r.quantity > maxQty.quantity) maxQty = r
    if (r.avgBuyPrice > maxPrice.avgBuyPrice) maxPrice = r
  }
  return { maxQty, maxPrice }
}
