import type ExcelJS from 'exceljs'

export function cellString(cell: ExcelJS.Cell): string {
  const v = cell.value
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number') return String(v)
  if (typeof v === 'object' && 'text' in v) return String(v.text).trim()
  if (typeof v === 'object' && 'result' in v && v.result != null) return String(v.result).trim()
  return String(v).trim()
}

export function cellNumber(cell: ExcelJS.Cell): number {
  const v = cell.value
  if (v == null) return 0
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = Number(v.replace(/,/g, ''))
    return Number.isFinite(n) ? n : 0
  }
  if (typeof v === 'object' && 'result' in v && typeof v.result === 'number') return v.result
  return 0
}

export function mapHeaderColumns(headerRow: ExcelJS.Row): Map<string, number> {
  const map = new Map<string, number>()
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const name = cellString(cell)
    if (name) map.set(name, colNumber)
  })
  return map
}

/**
 * Find the first row (within `limit`) that contains every signature string as
 * a cell value. Returns -1 if no such row exists.
 *
 * Used to harden parsers against broker exports that add metadata rows above
 * the data band (the Groww layout does this with client info + summary).
 */
export function findHeaderRowBySignature(
  ws: ExcelJS.Worksheet,
  signature: readonly string[],
  limit = 25,
): number {
  const maxRow = Math.min(limit, ws.rowCount)
  for (let i = 1; i <= maxRow; i++) {
    const cells = new Set<string>()
    ws.getRow(i).eachCell({ includeEmpty: false }, (cell) => {
      cells.add(cellString(cell))
    })
    if (signature.every((s) => cells.has(s))) return i
  }
  return -1
}

/**
 * Locate the worksheet (and header row within it) that matches a signature.
 * Searches every sheet in the workbook — required for multi-sheet exports
 * where the data sheet is not `worksheets[0]` (e.g. Vested's three-sheet
 * `User Details` / `Summary` / `Holdings` layout — the brainstorm fixture
 * was a single-sheet variant, real exports put Holdings on sheet 3).
 */
export function findSheetBySignature(
  wb: ExcelJS.Workbook,
  signature: readonly string[],
  limit = 25,
): { ws: ExcelJS.Worksheet; headerRowIndex: number } | null {
  for (const ws of wb.worksheets) {
    const headerRowIndex = findHeaderRowBySignature(ws, signature, limit)
    if (headerRowIndex > 0) return { ws, headerRowIndex }
  }
  return null
}

/**
 * Build a diagnostic preview across every worksheet in the workbook — the
 * first `rows` rows × first `cols` cells of each. Used in ParseError when
 * no sheet matches the expected signature, so the user can see what was
 * actually in the file across all sheets, not just the first.
 */
export function previewAllSheets(wb: ExcelJS.Workbook, rows = 5, cols = 8): string {
  const sections: string[] = []
  for (const ws of wb.worksheets) {
    sections.push(`Sheet "${ws.name}" (${ws.rowCount} rows):\n${previewFirstRows(ws, rows, cols)}`)
  }
  return sections.join('\n\n')
}

/**
 * Build a one-line-per-row preview of the first `rows` rows × first `cols`
 * cells. Used as diagnostic content in ParseError messages when a header
 * signature is missing — the user (or maintainer) can read what the file
 * actually contained without re-uploading.
 */
export function previewFirstRows(ws: ExcelJS.Worksheet, rows = 5, cols = 8): string {
  const lines: string[] = []
  const maxRow = Math.min(rows, ws.rowCount)
  for (let r = 1; r <= maxRow; r++) {
    const cells: string[] = []
    for (let c = 1; c <= cols; c++) {
      const v = cellString(ws.getRow(r).getCell(c))
      cells.push(v ? `"${v}"` : '∅')
    }
    lines.push(`  row ${r}: [${cells.join(', ')}]`)
  }
  return lines.join('\n')
}
