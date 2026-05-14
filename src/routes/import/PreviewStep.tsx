import type { Dispatch } from 'react'
import { toDeleteKeys } from '../../parsers/diff'
import { commitImport, exportSnapshot, type CanonicalHolding } from '../../storage/holdings'
import { currencyGlyph, formatAmount, formatQuantity } from '../../lib/format'
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
    <section className="space-y-10">
      <div>
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <p className="eyebrow">Review</p>
            <h2 className="font-display mt-2 text-2xl font-normal italic text-ink">
              Before we commit.
            </h2>
          </div>
          <button type="button" onClick={handleBackup} className="link-brass text-xs">
            Download backup ↓
          </button>
        </div>

        <dl className="mt-8 grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
          <Stat label="New" value={insertCount} accent="ink" />
          <Stat label="Updates" value={updateCount} accent="ink" />
          <Stat
            label="Missing from file"
            value={missingCount}
            accent={missingCount > 0 ? 'loss' : 'soft'}
          />
          <Stat label="Skipped" value={skipped} accent="soft" />
        </dl>

        {extremes && (
          <blockquote className="mt-10 border-l-2 border-brass py-1 pl-6">
            <p className="eyebrow">Sanity check</p>
            <p className="font-display mt-2 text-lg italic leading-snug text-ink">
              Largest holding{' '}
              <span className="font-mono not-italic text-base text-ink">
                {formatQuantity(extremes.maxQty.quantity)}
              </span>{' '}
              of <span className="not-italic">{extremes.maxQty.name}</span>;
              highest average cost{' '}
              <span className="font-mono not-italic text-base text-ink">
                {currencyGlyph(extremes.maxPrice.currency)}
                {formatAmount(extremes.maxPrice.avgBuyPrice, extremes.maxPrice.currency)}
              </span>{' '}
              for <span className="not-italic">{extremes.maxPrice.name}</span>.
            </p>
          </blockquote>
        )}

        {commitError && (
          <div className="mt-8 border-l-4 border-loss bg-surface/60 px-5 py-4 text-sm text-ink">
            <p className="eyebrow text-loss">Commit failed</p>
            <p className="mt-2">{commitError}</p>
          </div>
        )}
      </div>

      {missingCount > 0 && <MissingRowsPanel state={state} dispatch={dispatch} />}

      <div className="rule-hairline pt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => dispatch({ type: 'back-to-upload' })}
          className="font-mono text-xs text-ink-soft hover:text-ink"
        >
          ← reject
        </button>
        <button
          type="button"
          onClick={handleCommit}
          disabled={insertCount === 0 && updateCount === 0 && missingCount === 0}
          className="link-brass text-sm font-medium hover:text-brass disabled:cursor-not-allowed disabled:text-ink-soft disabled:border-rule disabled:hover:text-ink-soft disabled:hover:border-rule"
        >
          Commit changes →
        </button>
      </div>
    </section>
  )
}

type StatAccent = 'ink' | 'loss' | 'soft'
const accentClasses: Record<StatAccent, string> = {
  ink: 'text-ink',
  loss: 'text-loss',
  soft: 'text-ink-soft',
}

function Stat({ label, value, accent }: { label: string; value: number; accent: StatAccent }) {
  return (
    <div className="border-t-2 border-rule-strong pt-3">
      <dt className="eyebrow">{label}</dt>
      <dd
        className={`font-display mt-1 text-4xl font-normal tabular leading-none ${accentClasses[accent]}`}
      >
        {value}
      </dd>
    </div>
  )
}

function MissingRowsPanel({ state, dispatch }: Props) {
  if (!state.diff) return null
  const { missing } = state.diff

  return (
    <div className="border-y-2 border-rule-strong py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <p className="eyebrow text-loss">Missing rows</p>
          <h3 className="font-display mt-1 text-lg italic font-normal text-ink">
            {missing.length} {missing.length === 1 ? 'holding exists' : 'holdings exist'} in your
            dashboard but {missing.length === 1 ? 'is not' : 'are not'} in this file.
          </h3>
          <p className="mt-1 max-w-prose text-sm text-ink-muted">
            For each row, choose <span className="text-ink">Keep</span> (your dashboard stays
            unchanged) or <span className="text-loss">Delete</span> (we remove it on commit).
          </p>
        </div>
        <div className="flex shrink-0 gap-4">
          <button
            type="button"
            onClick={() => dispatch({ type: 'set-all-decisions', decision: 'keep' })}
            className="font-mono text-xs text-ink-muted hover:text-ink"
          >
            keep all
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: 'set-all-decisions', decision: 'delete' })}
            className="font-mono text-xs text-loss hover:text-ink"
          >
            delete all
          </button>
        </div>
      </div>

      <ul className="mt-6 divide-y divide-rule">
        {missing.map((row) => {
          const decision = state.decisions[row.sourceSymbol] ?? 'keep'
          return (
            <li key={row.sourceSymbol} className="flex items-center justify-between py-4">
              <div>
                <p className="font-display text-base font-normal text-ink">{row.name}</p>
                <p className="mt-1 text-xs text-ink-muted">
                  <span className="font-mono text-ink-muted">{row.sourceSymbol}</span>
                  <span className="mx-2 text-ink-soft">·</span>
                  <span className="font-mono">{formatQuantity(row.quantity)}</span>
                  <span className="mx-1 text-ink-soft">@</span>
                  <span className="font-mono">
                    {currencyGlyph(row.currency)}
                    {formatAmount(row.avgBuyPrice, row.currency)}
                  </span>
                </p>
              </div>
              <div className="flex gap-3">
                <DecisionButton
                  active={decision === 'keep'}
                  onClick={() =>
                    dispatch({
                      type: 'set-decision',
                      sourceSymbol: row.sourceSymbol,
                      decision: 'keep',
                    })
                  }
                  label="keep"
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
                  label="delete"
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
  let classes: string
  if (active && destructive) {
    classes = 'border-b-2 border-loss pb-0.5 text-loss font-medium'
  } else if (active) {
    classes = 'border-b-2 border-brass pb-0.5 text-ink font-medium'
  } else {
    classes =
      'border-b border-transparent pb-0.5 text-ink-muted hover:text-ink hover:border-rule'
  }

  return (
    <button type="button" onClick={onClick} className={`font-mono text-xs ${classes}`}>
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
