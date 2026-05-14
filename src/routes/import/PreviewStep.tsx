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
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Review changes before committing</h2>
          <button
            type="button"
            onClick={handleBackup}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Download backup (.json)
          </button>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="New holdings" value={insertCount} tone="emerald" />
          <Stat label="Updates" value={updateCount} tone="amber" />
          <Stat label="Missing from file" value={missingCount} tone={missingCount > 0 ? 'rose' : 'slate'} />
          <Stat label="Skipped (NA)" value={skipped} tone="slate" />
        </dl>

        {extremes && (
          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <span className="font-semibold text-slate-700">Sanity check:</span>{' '}
            largest holding {formatQuantity(extremes.maxQty.quantity)} {extremes.maxQty.name}
            {' · '}
            highest avg buy price {formatMoney(extremes.maxPrice.avgBuyPrice, extremes.maxPrice.currency)}{' '}
            for {extremes.maxPrice.name}
          </div>
        )}

        {commitError && (
          <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            Commit failed: {commitError}
          </div>
        )}
      </div>

      {missingCount > 0 && (
        <MissingRowsPanel state={state} dispatch={dispatch} />
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => dispatch({ type: 'back-to-upload' })}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Reject changes
        </button>
        <button
          type="button"
          onClick={handleCommit}
          disabled={insertCount === 0 && updateCount === 0 && missingCount === 0}
          className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          Commit changes
        </button>
      </div>
    </section>
  )
}

type StatTone = 'emerald' | 'amber' | 'rose' | 'slate'
const toneClasses: Record<StatTone, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200',
  slate: 'bg-slate-50 text-slate-600 ring-slate-200',
}

function Stat({ label, value, tone }: { label: string; value: number; tone: StatTone }) {
  return (
    <div className={`rounded-md px-3 py-2 ring-1 ring-inset ${toneClasses[tone]}`}>
      <dt className="text-xs font-medium">{label}</dt>
      <dd className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

function MissingRowsPanel({ state, dispatch }: Props) {
  if (!state.diff) return null
  const { missing } = state.diff

  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50/40 p-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h3 className="text-sm font-semibold text-rose-900">
            {missing.length} holdings exist in your dashboard but aren't in this file
          </h3>
          <p className="mt-1 text-xs text-rose-700">
            For each row, choose <span className="font-medium">Keep</span> (your dashboard stays unchanged)
            or <span className="font-medium">Delete</span> (we remove it on commit).
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => dispatch({ type: 'set-all-decisions', decision: 'keep' })}
            className="rounded-md border border-rose-300 bg-white px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
          >
            Keep all
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: 'set-all-decisions', decision: 'delete' })}
            className="rounded-md border border-rose-300 bg-white px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
          >
            Delete all
          </button>
        </div>
      </div>

      <ul className="mt-4 divide-y divide-rose-200 overflow-hidden rounded-md border border-rose-200 bg-white">
        {missing.map((row) => {
          const decision = state.decisions[row.sourceSymbol] ?? 'keep'
          return (
            <li key={row.sourceSymbol} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-900">{row.name}</p>
                <p className="text-xs text-slate-500">
                  <span className="font-mono">{row.sourceSymbol}</span>
                  {' · '}
                  {formatQuantity(row.quantity)} @ {formatMoney(row.avgBuyPrice, row.currency)}
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
  const base = 'rounded-md px-2.5 py-1 text-xs font-medium ring-1 ring-inset'
  let classes: string
  if (active && destructive) classes = 'bg-rose-600 text-white ring-rose-700'
  else if (active) classes = 'bg-slate-900 text-white ring-slate-900'
  else classes = 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'

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
