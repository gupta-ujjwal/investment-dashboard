import { readFile } from 'node:fs/promises'
import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { parseVested } from './vested'
import { ParseError } from './types'

async function loadFixture(name: string): Promise<ArrayBuffer> {
  const buf = await readFile(`tests/fixtures/${name}`)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

/** A minimal Vested-shaped workbook missing the optional `Current Price (USD)`
 *  column — exercises the column-absent path without a binary fixture. */
async function vestedWorkbookWithoutCurrentPrice(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Holdings')
  ws.addRow(['Name', 'Ticker', 'Total Shares Held', 'Average Cost (USD)'])
  ws.addRow(['Apple, Inc.', 'AAPL', 2.7, 215.72])
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
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

  it('captures the current price from the "Current Price (USD)" column', async () => {
    const buf = await loadFixture('vested-sample.xlsx')
    const result = await parseVested(buf)
    const apple = result.rows.find((r) => r.sourceSymbol === 'AAPL')
    expect(apple!.currentPrice).toBe(298.87)
    for (const row of result.rows) {
      expect(row.currentPrice).toBeGreaterThan(0)
    }
  })
})

describe('parseVested — optional current-price column', () => {
  it('leaves currentPrice undefined (not 0) when "Current Price (USD)" is absent', async () => {
    const result = await parseVested(await vestedWorkbookWithoutCurrentPrice())
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].currentPrice).toBeUndefined()
  })
})

describe('parseVested — required-column garbage cells', () => {
  it('skips a row with an unparseable Average Cost cell instead of importing avgBuyPrice: 0', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Holdings')
    ws.addRow(['Name', 'Ticker', 'Total Shares Held', 'Average Cost (USD)'])
    ws.addRow(['Apple, Inc.', 'AAPL', 2.7, 'N/A'])
    const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer
    const result = await parseVested(buf)
    expect(result.rows).toHaveLength(0)
    expect(result.skipped).toBe(1)
  })

  it('skips a row with an unparseable Total Shares Held cell', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Holdings')
    ws.addRow(['Name', 'Ticker', 'Total Shares Held', 'Average Cost (USD)'])
    ws.addRow(['Apple, Inc.', 'AAPL', 'garbled', 215.72])
    const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer
    const result = await parseVested(buf)
    expect(result.rows).toHaveLength(0)
    expect(result.skipped).toBe(1)
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
