import type { BaseCurrency, Currency } from '../storage/holdings'

export type FxFetchResult = {
  rate: number
  fetchedAt: number
}

const FRANKFURTER_URL = 'https://api.frankfurter.dev/v1/latest?from=USD&to=INR'
const FETCH_TIMEOUT_MS = 3000
const RATE_MIN = 1
const RATE_MAX = 1000

export class FxFetchError extends Error {
  readonly cause?: unknown
  constructor(message: string, options?: { cause?: unknown }) {
    super(message)
    this.name = 'FxFetchError'
    this.cause = options?.cause
  }
}

export async function fetchUsdInrRate(
  options: { signal?: AbortSignal } = {},
): Promise<FxFetchResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  const signal = options.signal
    ? mergeSignals(options.signal, controller.signal)
    : controller.signal

  let res: Response
  try {
    res = await fetch(FRANKFURTER_URL, { signal })
  } catch (err) {
    clearTimeout(timer)
    if (controller.signal.aborted) {
      throw new FxFetchError(`Frankfurter timed out after ${FETCH_TIMEOUT_MS}ms`)
    }
    throw new FxFetchError('Network error fetching FX rate', { cause: err })
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    throw new FxFetchError(`Frankfurter returned HTTP ${res.status}`)
  }

  let body: unknown
  try {
    body = await res.json()
  } catch (err) {
    throw new FxFetchError('Frankfurter response was not JSON', { cause: err })
  }

  const rate = extractInrRate(body)
  return { rate, fetchedAt: Date.now() }
}

function extractInrRate(body: unknown): number {
  if (typeof body !== 'object' || body === null) {
    throw new FxFetchError('FX response was not an object')
  }
  const rates = (body as { rates?: unknown }).rates
  if (typeof rates !== 'object' || rates === null) {
    throw new FxFetchError('FX response missing rates object')
  }
  const raw = (rates as Record<string, unknown>).INR
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    throw new FxFetchError('FX response INR rate is not a finite number')
  }
  if (raw <= RATE_MIN || raw >= RATE_MAX) {
    throw new FxFetchError(
      `FX response INR rate ${raw} is outside sane range (${RATE_MIN}, ${RATE_MAX})`,
    )
  }
  return raw
}

export function effectiveRate(
  from: Currency,
  base: BaseCurrency,
  usdInrRate: number,
): number {
  if (from === base) return 1
  if (from === 'USD' && base === 'INR') return usdInrRate
  if (from === 'INR' && base === 'USD') return 1 / usdInrRate
  throw new FxFetchError(`Unsupported currency pair ${from} → ${base}`)
}

function mergeSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  if (typeof AbortSignal !== 'undefined' && 'any' in AbortSignal) {
    return (AbortSignal as unknown as { any: (s: AbortSignal[]) => AbortSignal }).any([a, b])
  }
  const merged = new AbortController()
  const onAbort = () => merged.abort()
  a.addEventListener('abort', onAbort)
  b.addEventListener('abort', onAbort)
  return merged.signal
}
