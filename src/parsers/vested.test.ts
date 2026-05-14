import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parseVested } from './vested'
import { ParseError } from './types'

async function loadFixture(name: string): Promise<ArrayBuffer> {
  const buf = await readFile(`tests/fixtures/${name}`)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

describe('parseVested — real sample', () => {
  it('parses the Vested holdings dashboard', async () => {
    const buf = await loadFixture('vested-sample.xlsx')
    const result = await parseVested(buf)
    expect(result.rows.length).toBeGreaterThan(10)
    for (const row of result.rows) {
      expect(row.source).toBe('vested')
      expect(row.currency).toBe('USD')
      expect(row.sourceSymbol).toMatch(/^[A-Z]{1,5}$/)
      expect(row.quantity).toBeGreaterThan(0)
    }
  })

  it('supports fractional shares', async () => {
    const buf = await loadFixture('vested-sample.xlsx')
    const result = await parseVested(buf)
    const apple = result.rows.find((r) => r.sourceSymbol === 'AAPL')
    expect(apple).toBeDefined()
    expect(apple!.quantity).toBe(2.7)
  })

  it('uses ticker as sourceSymbol', async () => {
    const buf = await loadFixture('vested-sample.xlsx')
    const result = await parseVested(buf)
    const microsoft = result.rows.find((r) => r.name === 'Microsoft Corporation')
    expect(microsoft).toBeDefined()
    expect(microsoft!.sourceSymbol).toBe('MSFT')
  })

  it('tags ETFs based on name', async () => {
    const buf = await loadFixture('vested-sample.xlsx')
    const result = await parseVested(buf)
    const voo = result.rows.find((r) => r.sourceSymbol === 'VOO')
    expect(voo?.assetClass).toBe('etf')
    const aapl = result.rows.find((r) => r.sourceSymbol === 'AAPL')
    expect(aapl?.assetClass).toBe('equity')
  })
})

describe('parseVested — failure modes', () => {
  it('throws ParseError when fed a Groww file', async () => {
    // Groww's row 1 is "Name | Ujjwal Gupta" — coincidentally starts with "Name",
    // matching Vested's expected first cell, so the parser falls through to the
    // column-presence check and bails on a missing column (Ticker / Total Shares
    // Held / Average Cost (USD)). Both branches are valid rejection paths; what
    // matters is that we don't silently produce mystery rows from a Groww file.
    const buf = await loadFixture('groww-sample.xlsx')
    await expect(parseVested(buf)).rejects.toBeInstanceOf(ParseError)
    try {
      await parseVested(buf)
    } catch (e) {
      const err = e as ParseError
      expect(err.source).toBe('vested')
      expect(['header-not-found', 'missing-column']).toContain(err.reason.kind)
    }
  })

  it('throws ParseError for an empty buffer', async () => {
    const empty = new ArrayBuffer(0)
    await expect(parseVested(empty)).rejects.toBeInstanceOf(ParseError)
  })
})
