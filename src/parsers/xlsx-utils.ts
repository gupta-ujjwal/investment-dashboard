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
