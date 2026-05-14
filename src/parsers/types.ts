import type { CanonicalHolding, Source } from '../storage/holdings'

export type ParseResult = {
  rows: CanonicalHolding[]
  skipped: number
}

export type ParseErrorReason =
  | { kind: 'header-not-found'; expected: string; foundFirstCells: string[] }
  | { kind: 'missing-column'; expected: string; found: string[] }
  | { kind: 'empty-file' }
  | { kind: 'unparseable'; detail: string }

export class ParseError extends Error {
  readonly source: Source
  readonly reason: ParseErrorReason

  constructor(source: Source, reason: ParseErrorReason) {
    super(formatMessage(source, reason))
    this.name = 'ParseError'
    this.source = source
    this.reason = reason
  }
}

function formatMessage(source: Source, reason: ParseErrorReason): string {
  const label = source === 'vested' ? 'Vested' : 'Groww'
  switch (reason.kind) {
    case 'header-not-found':
      return `${label} export format not recognised: expected header containing "${reason.expected}", found first cells [${reason.foundFirstCells.map((s) => `"${s}"`).join(', ')}].`
    case 'missing-column':
      return `${label} export schema changed: missing expected column "${reason.expected}". Found columns: [${reason.found.map((s) => `"${s}"`).join(', ')}].`
    case 'empty-file':
      return `${label} export appears to be empty or contains no data rows.`
    case 'unparseable':
      return `${label} export could not be parsed: ${reason.detail}`
  }
}
