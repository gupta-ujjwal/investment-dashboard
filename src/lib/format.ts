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

const inrAmountFormatter = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const usdAmountFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatAmount(amount: number, currency: Currency): string {
  if (!Number.isFinite(amount)) return '—'
  return currency === 'INR'
    ? inrAmountFormatter.format(amount)
    : usdAmountFormatter.format(amount)
}

export function currencyGlyph(currency: Currency): string {
  return currency === 'INR' ? '₹' : '$'
}
