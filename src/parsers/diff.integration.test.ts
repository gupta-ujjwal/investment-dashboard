import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { diffHoldings } from './diff'
import { parseGroww } from './groww'

/**
 * Deliberately in its own file/commit, not folded into diff.test.ts. This
 * test spans two independent fixes — the parser's unparseable-price guard
 * and diffHoldings' within-import dedup — so it depends on BOTH being
 * present at once. Keeping it separate makes that dependency an explicit,
 * revertible unit: reverting either fix alone should also revert this test,
 * which a reviewer can only see if the two aren't silently coupled inside
 * one of the two fixes' own commits.
 */
describe('diffHoldings — combined with the parser (duplicate row + invalid-price row together)', () => {
  it('a within-file duplicate ISIN and a row with an unparseable price both resolve correctly in the same import', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Sheet1')
    ws.addRow(['Stock Name', 'ISIN', 'Quantity', 'Average buy price'])
    ws.addRow(['ASIAN PAINTS LIMITED', 'INE021A01026', 22, 2410.04]) // valid, unique
    ws.addRow(['HDFC BANK LIMITED', 'INE040A01034', 10, 1500]) // valid, duplicated below
    ws.addRow(['HDFC BANK LIMITED', 'INE040A01034', 12, 1550]) // duplicate of the row above
    ws.addRow(['TATA MOTORS LIMITED', 'INE155A01022', 5, '#N/A']) // unparseable price → skipped
    const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer

    const parseResult = await parseGroww(buf)
    // The price-guard drops the TATA MOTORS row before diff ever sees it.
    expect(parseResult.rows).toHaveLength(3)
    expect(parseResult.skipped).toBe(1)

    const result = diffHoldings([], parseResult.rows, 'groww')
    // The dedup pass collapses the two HDFC rows into one insert.
    expect(result.inserts).toHaveLength(2)
    expect(result.duplicates).toHaveLength(1)
    expect(result.duplicates[0].sourceSymbol).toBe('INE040A01034')
    const hdfc = result.inserts.find((r) => r.sourceSymbol === 'INE040A01034')
    expect(hdfc?.quantity).toBe(12) // last-in-file wins, independent of the price-guard skip
  })
})
