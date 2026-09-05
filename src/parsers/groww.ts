import ExcelJS from 'exceljs'
import type { AssetClass, CanonicalHolding } from '../storage/holdings'
import type { ParseResult } from './types'
import { ParseError } from './types'
import {
  cellNumberOrUndefined,
  cellString,
  findHeaderRowBySignature,
  mapHeaderColumns,
  previewFirstRows,
} from './xlsx-utils'

const HEADER_SIGNATURE = ['Stock Name', 'ISIN'] as const
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

  const headerRowIndex = findHeaderRowBySignature(ws, HEADER_SIGNATURE)
  if (headerRowIndex < 0) {
    throw new ParseError('groww', {
      kind: 'header-not-found',
      expected: HEADER_SIGNATURE.join(' + '),
      foundFirstCells: [cellString(ws.getRow(1).getCell(1))],
      firstRowsPreview: previewFirstRows(ws),
    })
  }

  const colIndexByName = mapHeaderColumns(ws.getRow(headerRowIndex))
  for (const required of REQUIRED_COLUMNS) {
    if (!colIndexByName.has(required)) {
      throw new ParseError('groww', {
        kind: 'missing-column',
        expected: required,
        found: [...colIndexByName.keys()],
        firstRowsPreview: previewFirstRows(ws),
      })
    }
  }

  const nameCol = colIndexByName.get('Stock Name')!
  const isinCol = colIndexByName.get('ISIN')!
  const qtyCol = colIndexByName.get('Quantity')!
  const avgPriceCol = colIndexByName.get('Average buy price')!
  // Optional: current per-unit price. Not in REQUIRED_COLUMNS — a Groww export
  // without it still imports, the holding just lands with no `currentPrice`.
  const closingPriceCol = colIndexByName.get('Closing price')

  const rows: CanonicalHolding[] = []
  let skipped = 0
  const importedAt = Date.now()

  for (let i = headerRowIndex + 1; i <= ws.rowCount; i++) {
    const row = ws.getRow(i)
    const name = cellString(row.getCell(nameCol))
    const isin = cellString(row.getCell(isinCol))
    const quantity = cellNumberOrUndefined(row.getCell(qtyCol))
    const avgBuyPrice = cellNumberOrUndefined(row.getCell(avgPriceCol))
    const currentPrice =
      closingPriceCol === undefined
        ? undefined
        : cellNumberOrUndefined(row.getCell(closingPriceCol))

    const ghost = !name || name === 'NA' || quantity === undefined || quantity === 0
    if (ghost) {
      if (name || isin) skipped++
      continue
    }
    if (!isin) {
      skipped++
      continue
    }
    // A garbage/empty cell in a required numeric column (e.g. a broker export
    // glitch) must be rejected, not silently coerced to 0 — a 0 avgBuyPrice
    // would understate invested capital with no signal (dsl.md R1: absence
    // never collapses to a sentinel).
    if (avgBuyPrice === undefined) {
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
      ...(currentPrice !== undefined && { currentPrice }),
    })
  }

  return { rows, skipped }
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
