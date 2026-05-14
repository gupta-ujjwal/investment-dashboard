import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parseGroww } from './groww'
import { ParseError } from './types'

async function loadFixture(name: string): Promise<ArrayBuffer> {
  const buf = await readFile(`tests/fixtures/${name}`)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

describe('parseGroww — real sample', () => {
  it('parses the Groww holdings statement', async () => {
    const buf = await loadFixture('groww-sample.xlsx')
    const result = await parseGroww(buf)
    expect(result.rows.length).toBeGreaterThan(20)
    expect(result.skipped).toBeGreaterThanOrEqual(2)
    for (const row of result.rows) {
      expect(row.source).toBe('groww')
      expect(row.currency).toBe('INR')
      expect(row.sourceSymbol).toMatch(/^IN[EF]\w+$/)
      expect(row.quantity).toBeGreaterThan(0)
    }
  })

  it('tags asset classes from the sample', async () => {
    const buf = await loadFixture('groww-sample.xlsx')
    const result = await parseGroww(buf)
    const byClass = new Map<string, string[]>()
    for (const row of result.rows) {
      const list = byClass.get(row.assetClass) ?? []
      list.push(row.name)
      byClass.set(row.assetClass, list)
    }
    expect(byClass.has('equity')).toBe(true)
    expect(byClass.has('mf')).toBe(true)
    expect(byClass.has('etf')).toBe(true)
    expect(byClass.has('invit')).toBe(true)
    expect(byClass.get('invit')!.some((n) => /INVIT/i.test(n))).toBe(true)
    expect(byClass.get('etf')!.some((n) => /ETF|BEES/i.test(n))).toBe(true)
  })

  it('skips NA-ghost rows', async () => {
    const buf = await loadFixture('groww-sample.xlsx')
    const result = await parseGroww(buf)
    for (const row of result.rows) {
      expect(row.name).not.toBe('NA')
      expect(row.quantity).not.toBe(0)
    }
  })

  it('uses ISIN as sourceSymbol, not stock name', async () => {
    const buf = await loadFixture('groww-sample.xlsx')
    const result = await parseGroww(buf)
    const asianPaints = result.rows.find((r) => r.name === 'ASIAN PAINTS LIMITED')
    expect(asianPaints).toBeDefined()
    expect(asianPaints!.sourceSymbol).toBe('INE021A01026')
  })
})

describe('parseGroww — failure modes', () => {
  it('throws ParseError when fed a Vested file', async () => {
    const buf = await loadFixture('vested-sample.xlsx')
    await expect(parseGroww(buf)).rejects.toBeInstanceOf(ParseError)
    try {
      await parseGroww(buf)
    } catch (e) {
      const err = e as ParseError
      expect(err.source).toBe('groww')
      expect(err.reason.kind).toBe('header-not-found')
    }
  })

  it('throws ParseError for an empty buffer', async () => {
    const empty = new ArrayBuffer(0)
    await expect(parseGroww(empty)).rejects.toBeInstanceOf(ParseError)
    try {
      await parseGroww(empty)
    } catch (e) {
      const err = e as ParseError
      expect(err.source).toBe('groww')
      expect(err.reason.kind).toBe('unparseable')
    }
  })
})
