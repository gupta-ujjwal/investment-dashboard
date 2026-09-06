import ExcelJS from 'exceljs'
import type { AssetClass, CanonicalHolding } from '../storage/holdings'
import type { ParseResult } from './types'
import { ParseError } from './types'
import {
  cellNumberOrUndefined,
  cellString,
  findSheetBySignature,
  mapHeaderColumns,
  previewAllSheets,
} from './xlsx-utils'

const HEADER_SIGNATURE = ['Name', 'Ticker'] as const
const REQUIRED_COLUMNS = ['Name', 'Ticker', 'Total Shares Held', 'Average Cost (USD)'] as const

export async function parseVested(file: ArrayBuffer): Promise<ParseResult> {
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(file)
  } catch (e) {
    throw new ParseError('vested', {
      kind: 'unparseable',
      detail: e instanceof Error ? e.message : String(e),
    })
  }

  if (wb.worksheets.length === 0) {
    throw new ParseError('vested', { kind: 'empty-file' })
  }

  const found = findSheetBySignature(wb, HEADER_SIGNATURE)
  if (!found) {
    throw new ParseError('vested', {
      kind: 'header-not-found',
      expected: HEADER_SIGNATURE.join(' + '),
      foundFirstCells: wb.worksheets.map((w) => `sheet "${w.name}"`),
      firstRowsPreview: previewAllSheets(wb),
    })
  }

  const { ws, headerRowIndex } = found
  const headerRow = ws.getRow(headerRowIndex)
  const colIndexByName = mapHeaderColumns(headerRow)
  for (const required of REQUIRED_COLUMNS) {
    if (!colIndexByName.has(required)) {
      throw new ParseError('vested', {
        kind: 'missing-column',
        expected: required,
        found: [...colIndexByName.keys()],
        firstRowsPreview: previewAllSheets(wb),
      })
    }
  }

  const nameCol = colIndexByName.get('Name')!
  const tickerCol = colIndexByName.get('Ticker')!
  const qtyCol = colIndexByName.get('Total Shares Held')!
  const avgCostCol = colIndexByName.get('Average Cost (USD)')!
  // Optional: current per-unit price. Not in REQUIRED_COLUMNS — a Vested export
  // without it still imports, the holding just lands with no `currentPrice`.
  const currentPriceCol = colIndexByName.get('Current Price (USD)')

  const rows: CanonicalHolding[] = []
  let skipped = 0
  const importedAt = Date.now()

  for (let i = headerRowIndex + 1; i <= ws.rowCount; i++) {
    const row = ws.getRow(i)
    const name = cellString(row.getCell(nameCol))
    const ticker = cellString(row.getCell(tickerCol))
    const quantity = cellNumberOrUndefined(row.getCell(qtyCol))
    const avgBuyPrice = cellNumberOrUndefined(row.getCell(avgCostCol))
    const currentPrice =
      currentPriceCol === undefined
        ? undefined
        : cellNumberOrUndefined(row.getCell(currentPriceCol))

    const ghost = !name || quantity === undefined || quantity === 0
    if (ghost) {
      if (name || ticker) skipped++
      continue
    }
    if (!ticker) {
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
      source: 'vested',
      sourceSymbol: ticker,
      quantity,
      avgBuyPrice,
      currency: 'USD',
      assetClass: assetClassFromVested(name),
      importedAt,
      ...(currentPrice !== undefined && { currentPrice }),
    })
  }

  return { rows, skipped }
}

function assetClassFromVested(name: string): AssetClass {
  const upperName = name.toUpperCase()
  if (/\bETF\b|\bTRUST\b|\bFUND\b/.test(upperName)) return 'etf'
  return 'equity'
}
