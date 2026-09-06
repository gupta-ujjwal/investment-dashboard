import type { Dispatch } from 'react'
import { toDeleteKeys } from '../../parsers/diff'
import { commitImport, exportSnapshot, type CanonicalHolding } from '../../storage/holdings'
import { recordSnapshot } from '../../storage/history'
import { formatMoney, formatQuantity } from '../../lib/format'
import { fetchUsdInrRate, FxFetchError } from '../../lib/fx'
import { deriveFxWarning, stampMany } from '../../lib/refreshFx'
import { getSettings, updateFxMeta } from '../../storage/settings'
import { FEATURE_HISTORY } from '../../featureFlags'
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
  const duplicateCount = diff.duplicates.length
  const skipped = parseResult.skipped
  const extremes = computeExtremes([...diff.inserts, ...diff.updates])

  async function handleCommit() {
    if (!state.diff) return
    dispatch({ type: 'commit-started' })
    try {
      const settings = await getSettings()
      const fallbackRate = settings.lastFxRate
      const fallbackFetchedAt = settings.lastFxAsOf
      let rate: number | null = fallbackRate
      let fetchedAt: number | null = fallbackFetchedAt
      let liveFxFailure: string | null = null
      try {
        const live = await fetchUsdInrRate()
        rate = live.rate
        fetchedAt = live.fetchedAt
        await updateFxMeta(live.rate, live.fetchedAt)
      } catch (fxErr) {
        liveFxFailure = fxErr instanceof FxFetchError ? fxErr.message : String(fxErr)
      }
      // Covers both cases the old console.warn-only signal missed: a stale
      // fallback rate being used silently, and no rate at all — see
      // deriveFxWarning's own doc comment.
      const fxWarning = deriveFxWarning(liveFxFailure, fallbackRate, fallbackFetchedAt)

      const stamp = (rows: CanonicalHolding[]) =>
        rate !== null && fetchedAt !== null
          ? stampMany(rows, settings.baseCurrency, rate, fetchedAt)
          : rows

      const toDelete = state.diff.missing.filter(
        (m) => decisions[m.sourceSymbol] === 'delete',
      )
      // Rows the user chose to "mark closed" become status:'closed' updates
      // — the row stays in storage (and in historySnapshots that captured
      // it), but drops out of current views by default. Touching updatedAt
      // keeps audit timestamps honest. R3 (atomic commit) still holds: this
      // happens inside the same commitImport txn as inserts/updates/deletes.
      const now = Date.now()
      const toClose: CanonicalHolding[] = state.diff.missing
        .filter((m) => decisions[m.sourceSymbol] === 'close')
        .map((m) => ({ ...m, status: 'closed', updatedAt: now }))
      await commitImport({
        inserts: stamp(state.diff.inserts),
        updates: [...stamp(state.diff.updates), ...stamp(toClose)],
        deletes: toDeleteKeys(toDelete),
      })
      // History snapshot is best-effort — holdings are the source of truth,
      // a missed snapshot is a cosmetic one-day gap in the charts, never a
      // reason to fail the import. Written here (not inside `commitImport`)
      // so the FX re-stamp path in refreshFx.ts cannot forge phantom history.
      if (FEATURE_HISTORY) {
        try {
          await recordSnapshot(settings.baseCurrency)
        } catch (histErr) {
          const reason = histErr instanceof Error ? histErr.message : String(histErr)
          console.warn(`[import] history snapshot failed: ${reason}`)
        }
      }
      dispatch({ type: 'commit-ok', fxWarning })
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
      <div className="rounded-2xl border border-bone-100/10 bg-ink-900 p-6 sm:p-8">
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
            className="hidden rounded-full border border-bone-100/15 px-3 py-2 font-sans text-[10px] font-medium  text-bone-300 transition hover:border-act-400 hover:text-act-400 sm:block"
          >
            ↓ Backup .json
          </button>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-bone-100/10 bg-bone-100/10 sm:grid-cols-5">
          <Stat label="New" value={insertCount} tone="jade" />
          <Stat label="Updates" value={updateCount} tone="tick" />
          <Stat label="Missing" value={missingCount} tone={missingCount > 0 ? 'ember' : 'mute'} />
          <Stat label="Skipped" value={skipped} tone="mute" />
          <Stat
            label="Duplicates"
            value={duplicateCount}
            tone={duplicateCount > 0 ? 'ember' : 'mute'}
          />
        </dl>

        {extremes && (
          <div className="mt-6 rounded-r-lg border-l-2 border-bone-200/40 bg-ink-850 px-4 py-3 font-sans text-xs text-bone-300">
            <span className="font-mono uppercase tracking-[0.16em] text-bone-200">
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
          <div className="mt-6 rounded-lg border border-ember-400/40 bg-ember-900/30 p-4 font-sans text-sm text-ember-300">
            <span className="font-mono text-[11px] uppercase tracking-[0.18em]">
              commit failed ·{' '}
            </span>
            {commitError}
          </div>
        )}
      </div>

      {missingCount > 0 && <MissingRowsPanel state={state} dispatch={dispatch} />}

      <div className="flex flex-col-reverse items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <button type="button" onClick={() => dispatch({ type: 'back-to-upload' })} className="btn-secondary">
          ← Reject
        </button>
        <button
          type="button"
          onClick={handleCommit}
          disabled={insertCount === 0 && updateCount === 0 && missingCount === 0}
          className="btn-primary"
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
  tick: 'text-bone-200',
  ember: 'text-ember-400',
  mute: 'text-bone-300',
}
const toneRail: Record<StatTone, string> = {
  jade: 'bg-jade-400/70',
  tick: 'bg-bone-300/70',
  ember: 'bg-ember-400/70',
  mute: 'bg-bone-300/50',
}

function Stat({ label, value, tone }: { label: string; value: number; tone: StatTone }) {
  return (
    <div className="bg-ink-900 px-4 py-5">
      <dt className="flex items-center gap-2 font-sans text-[10px]  text-bone-400">
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
    <div className="rounded-2xl border border-ember-400/30 bg-ember-900/15 p-6 sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-sans text-base font-semibold tracking-tight text-ember-300">
            {missing.length} on file · absent from this upload
          </h3>
          <p className="mt-1 max-w-xl font-sans text-sm text-ember-300/70">
            Pick{' '}
            <span className="font-mono text-[11px] uppercase tracking-[0.16em]">keep</span>{' '}
            (unchanged),{' '}
            <span className="font-mono text-[11px] uppercase tracking-[0.16em]">mark closed</span>{' '}
            (you sold it — preserves history), or{' '}
            <span className="font-mono text-[11px] uppercase tracking-[0.16em]">delete</span>{' '}
            (gone after commit).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => dispatch({ type: 'set-all-decisions', decision: 'keep' })}
            className="rounded-full border border-bone-100/15 px-3 py-1.5 font-sans text-[10px] font-medium  text-bone-300 transition hover:border-bone-100/40 hover:text-bone-50"
          >
            Keep all
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: 'set-all-decisions', decision: 'close' })}
            className="rounded-full border border-bone-100/15 px-3 py-1.5 font-sans text-[10px] font-medium  text-bone-300 transition hover:border-act-400 hover:text-act-400"
          >
            Close all
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: 'set-all-decisions', decision: 'delete' })}
            className="rounded-full border border-ember-400/40 px-3 py-1.5 font-sans text-[10px] font-medium  text-ember-300 transition hover:border-ember-400 hover:text-ember-400"
          >
            Delete all
          </button>
        </div>
      </div>

      <ul className="mt-6 divide-y divide-bone-100/10 overflow-hidden rounded-xl border border-bone-100/10 bg-ink-900">
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
              <div className="flex flex-wrap gap-2">
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
                  tone="default"
                />
                <DecisionButton
                  active={decision === 'close'}
                  onClick={() =>
                    dispatch({
                      type: 'set-decision',
                      sourceSymbol: row.sourceSymbol,
                      decision: 'close',
                    })
                  }
                  label="Mark closed"
                  tone="tick"
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
                  tone="ember"
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
  tone,
}: {
  active: boolean
  onClick: () => void
  label: string
  tone: 'default' | 'tick' | 'ember'
}) {
  const base =
    'rounded-full border px-3 py-1.5 font-sans text-[10px] font-medium  transition'
  let classes: string
  if (active && tone === 'ember') classes = 'border-ember-400 bg-ember-400 text-ink-950'
  else if (active && tone === 'tick') classes = 'border-act-400 bg-act-400 text-ink-950'
  else if (active) classes = 'border-bone-100/40 bg-bone-100/10 text-bone-50'
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
