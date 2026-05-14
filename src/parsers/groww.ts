import ExcelJS from 'exceljs'
import type { AssetClass, CanonicalHolding } from '../storage/holdings'
import type { ParseResult } from './types'
import { ParseError } from './types'
import { cellNumber, cellString, mapHeaderColumns } from './xlsx-utils'

const HEADER_FIRST_CELL = 'Stock Name'
const HEADER_SCAN_LIMIT = 25
const REQUIRED_COLUMNS = ['Stock Name', 'ISIN', 'Quantity', 'Average buy price'] as const

export async function parseGroww(file: ArrayBuffer): Promise<ParseResult> {
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(file)
  } catch (e) {
    throw new ParseError('groww', {
      kind: 'unparseable',
      detail: e instanceof Error ? e.message : String(e),
    })
  }

  const ws = wb.worksheets[0]
  if (!ws || ws.rowCount === 0) {
    throw new ParseError('groww', { kind: 'empty-file' })
  }

  const { headerRowIndex, foundFirstCells } = scanForHeader(ws)
  if (headerRowIndex < 0) {
    throw new ParseError('groww', {
      kind: 'header-not-found',
      expected: HEADER_FIRST_CELL,
      foundFirstCells,
    })
  }

  const colIndexByName = mapHeaderColumns(ws.getRow(headerRowIndex))
  for (const required of REQUIRED_COLUMNS) {
    if (!colIndexByName.has(required)) {
      throw new ParseError('groww', {
        kind: 'missing-column',
        expected: required,
        found: [...colIndexByName.keys()],
      })
    }
  }

  const nameCol = colIndexByName.get('Stock Name')!
  const isinCol = colIndexByName.get('ISIN')!
  const qtyCol = colIndexByName.get('Quantity')!
  const avgPriceCol = colIndexByName.get('Average buy price')!

  const rows: CanonicalHolding[] = []
  let skipped = 0
  const importedAt = Date.now()

  for (let i = headerRowIndex + 1; i <= ws.rowCount; i++) {
    const row = ws.getRow(i)
    const name = cellString(row.getCell(nameCol))
    const isin = cellString(row.getCell(isinCol))
    const quantity = cellNumber(row.getCell(qtyCol))
    const avgBuyPrice = cellNumber(row.getCell(avgPriceCol))

    const ghost = !name || name === 'NA' || quantity === 0
    if (ghost) {
      if (name || isin) skipped++
      continue
    }
    if (!isin) {
      skipped++
      continue
    }

    rows.push({
      name,
      source: 'groww',
      sourceSymbol: isin,
      quantity,
      avgBuyPrice,
      currency: 'INR',
      assetClass: assetClassFromGroww(isin, name),
      importedAt,
    })
  }

  return { rows, skipped }
}

function scanForHeader(ws: ExcelJS.Worksheet): {
  headerRowIndex: number
  foundFirstCells: string[]
} {
  const foundFirstCells: string[] = []
  const limit = Math.min(HEADER_SCAN_LIMIT, ws.rowCount)
  for (let i = 1; i <= limit; i++) {
    const first = cellString(ws.getRow(i).getCell(1))
    if (first) foundFirstCells.push(first)
    if (first === HEADER_FIRST_CELL) {
      return { headerRowIndex: i, foundFirstCells }
    }
  }
  return { headerRowIndex: -1, foundFirstCells: foundFirstCells.slice(0, 10) }
}

function assetClassFromGroww(isin: string, name: string): AssetClass {
  const upperName = name.toUpperCase()
  if (isin.startsWith('INF')) {
    return /ETF|BEES/.test(upperName) ? 'etf' : 'mf'
  }
  if (/\bINVIT\b|\bREIT\b|\bINV\s*IT\b/.test(upperName)) {
    return 'invit'
  }
  if (isin.startsWith('INE')) {
    return 'equity'
  }
  return 'other'
}
