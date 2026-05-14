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
