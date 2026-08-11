import { describe, it, expect, beforeEach } from 'vitest'
import { categoricalColor, donutOther, donutPalette, _resetColorMap } from './chartTheme'

beforeEach(() => {
  _resetColorMap()
})

describe('categoricalColor', () => {
  it('returns donutOther for the grouped-tail key', () => {
    expect(categoricalColor('__other')).toBe(donutOther)
  })

  it('is stable per key across calls', () => {
    const a = categoricalColor('Information Technology')
    const b = categoricalColor('Information Technology')
    expect(a).toBe(b)
  })

  it('is distinct across the first 8 distinct keys', () => {
    const keys = [
      'Information Technology',
      'Financial Services',
      'Communication Services',
      'Consumer Discretionary',
      'Oil Gas & Consumable Fuels',
      'Healthcare',
      'Materials',
      'Energy',
    ]
    const colors = new Set(keys.map((k) => categoricalColor(k)))
    expect(colors.size).toBe(8)
  })

  it('returns a value from the ramp', () => {
    const color = categoricalColor('Equity')
    expect([...donutPalette]).toContain(color)
  })

  it('handles empty string without throwing', () => {
    expect(() => categoricalColor('')).not.toThrow()
    expect([...donutPalette]).toContain(categoricalColor(''))
  })
})
