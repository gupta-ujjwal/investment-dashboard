import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectiveRate, fetchUsdInrRate, FxFetchError } from './fx'

type FetchFn = typeof globalThis.fetch

const originalFetch = globalThis.fetch

function mockFetch(impl: FetchFn) {
  globalThis.fetch = impl
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

describe('fetchUsdInrRate — success path', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('parses a well-formed Frankfurter response', async () => {
    mockFetch(async () => jsonResponse({ amount: 1, base: 'USD', date: '2026-05-14', rates: { INR: 95.77 } }))
    const result = await fetchUsdInrRate()
    expect(result.rate).toBe(95.77)
    expect(result.fetchedAt).toBeTypeOf('number')
    expect(result.fetchedAt).toBeGreaterThan(0)
  })
})

describe('fetchUsdInrRate — validator (Tenet 3 blast radius)', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('rejects an empty rates object', async () => {
    mockFetch(async () => jsonResponse({ rates: {} }))
    await expect(fetchUsdInrRate()).rejects.toThrow(/INR rate is not a finite number/)
  })

  it('rejects a null INR rate', async () => {
    mockFetch(async () => jsonResponse({ rates: { INR: null } }))
    await expect(fetchUsdInrRate()).rejects.toThrow(/INR rate is not a finite number/)
  })

  it('rejects a zero INR rate (below sane range)', async () => {
    mockFetch(async () => jsonResponse({ rates: { INR: 0 } }))
    await expect(fetchUsdInrRate()).rejects.toThrow(/outside sane range/)
  })

  it('rejects a negative INR rate', async () => {
    mockFetch(async () => jsonResponse({ rates: { INR: -50 } }))
    await expect(fetchUsdInrRate()).rejects.toThrow(/outside sane range/)
  })

  it('rejects an absurdly large INR rate', async () => {
    mockFetch(async () => jsonResponse({ rates: { INR: 99999 } }))
    await expect(fetchUsdInrRate()).rejects.toThrow(/outside sane range/)
  })

  it('rejects a NaN rate', async () => {
    mockFetch(async () => new Response('{"rates":{"INR":NaN}}', { status: 200 }))
    await expect(fetchUsdInrRate()).rejects.toBeInstanceOf(FxFetchError)
  })

  it('rejects missing rates object entirely', async () => {
    mockFetch(async () => jsonResponse({ amount: 1, base: 'USD' }))
    await expect(fetchUsdInrRate()).rejects.toThrow(/missing rates object/)
  })

  it('rejects non-200 HTTP status', async () => {
    mockFetch(async () => new Response('upstream', { status: 503 }))
    await expect(fetchUsdInrRate()).rejects.toThrow(/HTTP 503/)
  })

  it('rejects non-JSON body', async () => {
    mockFetch(async () =>
      new Response('<html>cloudflare error</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    )
    await expect(fetchUsdInrRate()).rejects.toThrow(/not JSON/)
  })
})

describe('fetchUsdInrRate — timeout (Tenet 2 critical path)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    globalThis.fetch = originalFetch
  })

  it('aborts after 3 seconds and surfaces a timeout error', async () => {
    mockFetch(
      (_input, init) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('aborted')
            err.name = 'AbortError'
            reject(err)
          })
        }),
    )
    const pending = fetchUsdInrRate()
    const expectation = expect(pending).rejects.toThrow(/timed out after 3000ms/)
    await vi.advanceTimersByTimeAsync(3001)
    await expectation
  })
})

describe('effectiveRate', () => {
  it('returns 1 when from === base', () => {
    expect(effectiveRate('INR', 'INR', 95)).toBe(1)
    expect(effectiveRate('USD', 'USD', 95)).toBe(1)
  })

  it('returns the rate directly for USD → INR base', () => {
    expect(effectiveRate('USD', 'INR', 95.77)).toBe(95.77)
  })

  it('returns the inverse for INR → USD base', () => {
    const rate = 95.77
    expect(effectiveRate('INR', 'USD', rate)).toBeCloseTo(1 / rate, 10)
  })
})
