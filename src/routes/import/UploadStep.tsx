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
    <section>
      <p className="smallcaps text-[0.65rem] text-ink-muted">{sourceLabel}</p>
      <h2 className="font-display mt-2 text-2xl font-medium text-ink">
        Upload your {sourceLabel} file
      </h2>
      <p className="mt-3 max-w-prose text-sm text-ink-muted">
        Choose the <span className="font-mono text-xs text-ink">.xlsx</span> file you just
        downloaded. Parsing happens in your browser; nothing is uploaded.
      </p>

      <label className="mt-8 flex cursor-pointer flex-col items-center justify-center border-y-2 border-rule-strong bg-paper-deep/40 px-6 py-16 text-center transition-colors hover:bg-paper-deep">
        <span
          className="font-display text-3xl font-medium text-ink"
          style={{ fontStyle: fileName ? 'normal' : 'italic' }}
        >
          {fileName ? fileName : 'Choose a file'}
        </span>
        <span className="smallcaps mt-3 text-[0.65rem] text-ink-muted">
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
        <div className="mt-6 border-l-4 border-oxblood bg-paper-deep/60 px-5 py-4">
          <p className="smallcaps text-[0.65rem] text-oxblood">Parse failed</p>
          <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs text-ink">
            {parseError}
          </pre>
          <p className="mt-3 text-xs text-ink-muted italic">
            If the broker has changed its export format, please open an issue with the message
            above.
          </p>
        </div>
      )}

      <div className="rule-hairline mt-10 pt-6">
        <button
          type="button"
          onClick={() => dispatch({ type: 'back-to-source' })}
          className="smallcaps text-[0.7rem] text-ink-muted hover:text-ink"
        >
          ← Back
        </button>
      </div>
    </section>
  )
}
