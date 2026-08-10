import { useState, type ChangeEvent, type Dispatch } from 'react'
import { diffHoldings } from '../../parsers/diff'
import { parseGroww } from '../../parsers/groww'
import { parseVested } from '../../parsers/vested'
import { ParseError } from '../../parsers/types'
import { getForSource, type BrokerSource } from '../../storage/holdings'
import type { WizardAction } from './wizardState'

type Props = {
  source: BrokerSource
  parseError: string | null
  dispatch: Dispatch<WizardAction>
}

const parserByBrokerSource = {
  vested: parseVested,
  groww: parseGroww,
}

export function UploadStep({ source, parseError, dispatch }: Props) {
  const [busy, setBusy] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setBusy(true)
    try {
      const buf = await file.arrayBuffer()
      const result = await parserByBrokerSource[source](buf)
      const existing = await getForSource(source)
      const diff = diffHoldings(existing, result.rows, source)
      dispatch({ type: 'parse-ok', result, diff })
    } catch (err) {
      const message =
        err instanceof ParseError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Unknown error while parsing the file.'
      dispatch({ type: 'parse-failed', message })
    } finally {
      setBusy(false)
    }
  }

  const sourceLabel = source === 'vested' ? 'Vested' : 'Groww'

  return (
    <section className="border border-bone-100/10 bg-ink-900 p-6 sm:p-8">
      <div className="flex items-baseline justify-between">
        <h3 className="font-sans text-lg font-semibold tracking-tight text-bone-50">
          Upload your {sourceLabel} file
        </h3>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-bone-400">
          step 03 / 04
        </span>
      </div>
      <p className="mt-2 max-w-xl font-sans text-sm text-bone-400">
        Pick the{' '}
        <code className="font-mono text-[12px] text-act-400">.xlsx</code> you just downloaded.
        Parsing happens here, in your browser.
      </p>

      <label className="mt-6 flex cursor-pointer flex-col items-center justify-center gap-3 border border-dashed border-bone-100/20 bg-ink-850 px-6 py-16 text-center transition hover:border-act-400/60 hover:bg-ink-800">
        <span
          aria-hidden="true"
          className={`font-mono text-2xl text-act-400 ${busy ? 'spin-slow' : ''}`}
        >
          {busy ? '◐' : '⤓'}
        </span>
        <span className="font-sans text-base text-bone-100">
          {fileName ?? 'Click to choose a file'}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-bone-400">
          {busy ? 'Parsing…' : `${sourceLabel} holdings export · .xlsx`}
        </span>
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={handleFile}
          disabled={busy}
          className="sr-only"
        />
      </label>

      {parseError && (
        <div className="mt-6 border border-ember-400/40 bg-ember-900/30 p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ember-300">
            Parse failed
          </p>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-ember-300/90">
            {parseError}
          </pre>
          <p className="mt-3 font-sans text-xs text-ember-300/70">
            If the file format has changed, please open an issue with the error above.
          </p>
        </div>
      )}

      <div className="mt-6 flex justify-between">
        <button
          type="button"
          onClick={() => dispatch({ type: 'back-to-source' })}
          className="border border-bone-100/15 px-4 py-2.5 font-sans text-[11px] font-medium  text-bone-300 transition hover:border-bone-100/40 hover:text-bone-50"
        >
          ← Back
        </button>
      </div>
    </section>
  )
}
