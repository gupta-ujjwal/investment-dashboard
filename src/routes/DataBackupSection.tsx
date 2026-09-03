import { useRef, useState } from 'react'
import type { CanonicalHolding } from '../storage/holdings'
import {
  backupManifest,
  exportBackup,
  restoreAll,
  type BackupManifest,
} from '../storage/backup'
import { parseBackup, type ParsedBackup } from '../lib/restoreBackup'
import { formatQuantity } from '../lib/format'

type RestoreState =
  | { kind: 'idle' }
  | { kind: 'invalid'; error: string }
  | { kind: 'preview'; backup: ParsedBackup; fileName: string }
  | { kind: 'restoring' }
  | { kind: 'done'; restoredCount: number }

type Props = {
  currentHoldings: CanonicalHolding[]
}

export function DataBackupSection({ currentHoldings }: Props) {
  const [state, setState] = useState<RestoreState>({ kind: 'idle' })
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleDownload() {
    const json = await exportBackup()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    a.href = url
    a.download = `dashboard-backup-${stamp}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    let text: string
    try {
      text = await file.text()
    } catch (err) {
      setState({
        kind: 'invalid',
        error: `Could not read file: ${err instanceof Error ? err.message : String(err)}`,
      })
      return
    }
    const result = parseBackup(text)
    if (!result.ok) {
      setState({ kind: 'invalid', error: result.error })
      return
    }
    setState({ kind: 'preview', backup: result.backup, fileName: file.name })
  }

  async function handleConfirm() {
    if (state.kind !== 'preview') return
    setState({ kind: 'restoring' })
    try {
      await restoreAll(state.backup)
      const m = backupManifest(state.backup)
      setState({
        kind: 'done',
        restoredCount: m.holdings + m.assets + m.budgetMonths + m.budgetTags,
      })
      // Hard reload so every route loader picks up the new holdings — the
      // Analytics/Holdings caches are scoped per loader and would otherwise
      // show stale data until the user navigates.
      setTimeout(() => window.location.reload(), 800)
    } catch (err) {
      setState({
        kind: 'invalid',
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const currentCount = currentHoldings.length

  return (
    <fieldset className="space-y-6 rounded-2xl border border-bone-100/10 bg-ink-900 p-6 sm:p-8">
      <legend className="px-2 font-mono text-[10px] uppercase tracking-[0.2em] text-bone-400">
        Data backup
      </legend>

      <div className="space-y-3">
        <h3 className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-bone-400">
          <span className="h-px w-3 bg-bone-200/60" />
          Download
        </h3>
        <p className="font-sans text-[12px] text-bone-400">
          {currentCount} holding{currentCount === 1 ? '' : 's'} on this device. The
          export captures everything — holdings, manual assets, budget months, and
          planning / goal targets (base-currency stamps included). History
          snapshots are not included.
        </p>
        <button
          type="button"
          onClick={handleDownload}
          disabled={currentCount === 0}
          className="btn-secondary"
        >
          ↓ Download .json
        </button>
      </div>

      <div className="space-y-3 border-t border-bone-100/10 pt-6">
        <h3 className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-bone-400">
          <span className="h-px w-3 bg-ember-400/60" />
          Restore
        </h3>
        <p className="font-sans text-[12px] text-bone-400">
          Replaces all holdings, assets, and budget months on this device with
          the contents of a backup file, atomically. Cannot be undone.
        </p>
        <label className="btn-secondary cursor-pointer has-[:focus-visible]:outline has-[:focus-visible]:outline-1 has-[:focus-visible]:outline-act-400 has-[:focus-visible]:outline-offset-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFileChosen}
            className="sr-only"
          />
          Choose backup .json …
        </label>
      </div>

      {state.kind === 'invalid' && (
        <div
          role="alert"
          className="rounded-xl border border-ember-400/40 bg-ember-900/30 p-4 font-sans text-sm text-ember-300"
        >
          <span className="font-mono text-[11px] uppercase tracking-[0.18em]">
            restore failed ·{' '}
          </span>
          {state.error}
        </div>
      )}

      {state.kind === 'preview' && (
        <RestoreConfirmPanel
          backup={state.backup}
          fileName={state.fileName}
          currentCount={currentCount}
          onCancel={() => setState({ kind: 'idle' })}
          onConfirm={handleConfirm}
        />
      )}

      {state.kind === 'restoring' && (
        <div className="rounded-xl border border-bone-100/10 bg-ink-850 p-4 font-mono text-[11px] uppercase tracking-[0.18em] text-bone-300">
          Replacing…
        </div>
      )}

      {state.kind === 'done' && (
        <div className="rounded-xl border border-jade-400/40 bg-jade-900/20 p-4 font-sans text-sm text-jade-300">
          <span className="font-mono text-[11px] uppercase tracking-[0.18em]">
            restored ·{' '}
          </span>
          Replaced existing data with {state.restoredCount} record
          {state.restoredCount === 1 ? '' : 's'}. Reloading…
        </div>
      )}
    </fieldset>
  )
}

type ConfirmProps = {
  backup: ParsedBackup
  fileName: string
  currentCount: number
  onCancel: () => void
  onConfirm: () => void
}

function RestoreConfirmPanel({
  backup,
  fileName,
  currentCount,
  onCancel,
  onConfirm,
}: ConfirmProps) {
  const manifest: BackupManifest = backupManifest(backup)
  const largest = computeLargest(backup.holdings)
  const exportedAt = new Date(backup.exportedAt)
  const exportedAtDisplay = Number.isFinite(exportedAt.getTime())
    ? exportedAt.toLocaleString()
    : backup.exportedAt
  // Pre-v4 (holdings-only) backups carry no asset/budget sections — surface
  // that explicitly so the user knows those stores will be *emptied*, not left
  // untouched, by an old backup. This is the data-safety manifest.
  const isLegacy = backup.schemaVersion < 4

  return (
    <div className="space-y-5 rounded-2xl border border-ember-400/30 bg-ember-900/15 p-6 sm:p-8">
      <div>
        <h3 className="font-sans text-base font-semibold tracking-tight text-ember-300">
          Replace all data
        </h3>
        <p className="mt-1 font-mono text-[11px] text-ember-300/70">
          {fileName} · exported {exportedAtDisplay} · schema v{backup.schemaVersion}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-bone-100/10 bg-bone-100/10 sm:grid-cols-4">
        <Stat label="Holdings" value={manifest.holdings} tone="tick" />
        <Stat label="Assets" value={manifest.assets} tone="tick" />
        <Stat label="Budget months" value={manifest.budgetMonths} tone="tick" />
        <Stat label="Budget tags" value={manifest.budgetTags} tone="tick" />
      </dl>

      <div className="rounded-r-lg border-l-2 border-bone-100/20 bg-ink-850 px-4 py-3 font-sans text-xs text-bone-300">
        <span className="font-mono uppercase tracking-[0.16em] text-bone-400">
          manifest ·{' '}
        </span>
        planning / goal targets {manifest.hasSettings ? 'included' : 'not in file'} ·
        replaces {currentCount} holding{currentCount === 1 ? '' : 's'} on device.
        {isLegacy && (
          <span className="text-ember-300">
            {' '}This is a pre-v4 backup — assets and budget months will be cleared.
          </span>
        )}
      </div>

      {largest ? (
        <div className="rounded-r-lg border-l-2 border-bone-200/40 bg-ink-850 px-4 py-3 font-sans text-xs text-bone-300">
          <span className="font-mono uppercase tracking-[0.16em] text-bone-200">
            sanity check ·{' '}
          </span>
          largest holding {formatQuantity(largest.quantity)} {largest.name}
        </div>
      ) : (
        <div className="rounded-r-lg border-l-2 border-bone-200/40 bg-ink-850 px-4 py-3 font-sans text-xs text-bone-300">
          <span className="font-mono uppercase tracking-[0.16em] text-bone-200">
            sanity check ·{' '}
          </span>
          backup is empty — this will wipe all current holdings.
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="inline-flex items-center gap-2 rounded-full border border-ember-400 bg-ember-400 px-6 py-2.5 font-sans text-[11px] font-medium  text-ink-950 transition hover:bg-ember-300"
        >
          Replace all data
        </button>
      </div>
    </div>
  )
}

type Tone = 'jade' | 'tick' | 'ember' | 'mute'
const toneAccent: Record<Tone, string> = {
  jade: 'text-jade-400',
  tick: 'text-bone-200',
  ember: 'text-ember-400',
  mute: 'text-bone-300',
}
const toneRail: Record<Tone, string> = {
  jade: 'bg-jade-400/70',
  tick: 'bg-bone-300/70',
  ember: 'bg-ember-400/70',
  mute: 'bg-bone-300/50',
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: number | string
  tone: Tone
}) {
  return (
    <div className="bg-ink-900 px-4 py-5">
      <dt className="flex items-center gap-2 font-sans text-[10px]  text-bone-400">
        <span className={`h-px w-3 ${toneRail[tone]}`} />
        {label}
      </dt>
      <dd
        className={`mt-2 font-display text-3xl leading-none tabular-nums ${toneAccent[tone]}`}
      >
        {value}
      </dd>
    </div>
  )
}

function computeLargest(rows: CanonicalHolding[]): CanonicalHolding | null {
  if (rows.length === 0) return null
  let max = rows[0]
  for (const r of rows) if (r.quantity > max.quantity) max = r
  return max
}
