import { useState, type ChangeEvent, type Dispatch } from 'react'
import { diffHoldings } from '../../parsers/diff'
import { parseGroww } from '../../parsers/groww'
import { parseVested } from '../../parsers/vested'
import { ParseError } from '../../parsers/types'
import { getForSource, type Source } from '../../storage/holdings'
import type { WizardAction } from './wizardState'

type Props = {
  source: Source
  parseError: string | null
  dispatch: Dispatch<WizardAction>
}

const parserBySource = {
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
      const result = await parserBySource[source](buf)
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
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Upload your {sourceLabel} file</h2>
      <p className="mt-1 text-sm text-slate-500">
        Choose the <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">.xlsx</code> file you just
        downloaded. Parsing happens in your browser; nothing is uploaded.
      </p>

      <label className="mt-6 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center hover:border-slate-400 hover:bg-slate-100">
        <span className="text-sm font-medium text-slate-700">
          {fileName ? fileName : 'Click to choose a file'}
        </span>
        <span className="mt-1 text-xs text-slate-500">
          {busy ? 'Parsing…' : `Looking for: ${sourceLabel} holdings export (.xlsx)`}
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
        <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <p className="font-medium">Parse failed</p>
          <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-xs">{parseError}</pre>
          <p className="mt-2 text-xs text-rose-600">
            If the file format has changed, please open an issue with the error message above.
          </p>
        </div>
      )}

      <div className="mt-6 flex justify-between">
        <button
          type="button"
          onClick={() => dispatch({ type: 'back-to-source' })}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Back
        </button>
      </div>
    </section>
  )
}
