import type { Currency } from '../storage/holdings'

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
})
const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

export function formatMoney(amount: number, currency: Currency): string {
  if (!Number.isFinite(amount)) return '—'
  return currency === 'INR' ? inrFormatter.format(amount) : usdFormatter.format(amount)
}

const qtyFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 })

export function formatQuantity(quantity: number): string {
  if (!Number.isFinite(quantity)) return '—'
  return qtyFormatter.format(quantity)
}

/** Format a profit/loss ratio (0.15 → "+15.00%"). Signed; non-finite → "—". */
export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return '—'
  const pct = ratio * 100
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(2)}%`
}

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

/** Format a millisecond timestamp as "16 May 2026". Non-finite → "—". */
export function formatDate(ts: number): string {
  if (!Number.isFinite(ts)) return '—'
  return dateFormatter.format(ts)
}
