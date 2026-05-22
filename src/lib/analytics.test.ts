import { describe, expect, it } from 'vitest'
import type { CanonicalHolding, Currency } from '../storage/holdings'
import type { HistoryRecord } from '../storage/history'
import { deriveRows } from './holdingsView'
import {
  allocation,
  benchmarkSeries,
  concentration,
  portfolioTotals,
  sectorAllocation,
  topMovers,
  valueSeries,
  type BenchmarkData,
  type SectorMap,
  type ValuePoint,
} from './analytics'

function holding(over: Partial<CanonicalHolding> = {}): CanonicalHolding {
  return {
    name: 'Test Co',
    source: 'groww',
    sourceSymbol: 'INE000000001',
    quantity: 10,
    avgBuyPrice: 100,
    currency: 'INR',
    assetClass: 'equity',
    importedAt: 1000,
    ...over,
  }
}

/** A fully base-stamped holding — quantity 10, so figures scale by 10. */
function stamped(over: Partial<CanonicalHolding> = {}): CanonicalHolding {
  return holding({
    avgBuyPrice: 100,
    currentPrice: 150,
    avgBuyPriceBase: 100,
    currentPriceBase: 150,
    ...over,
  })
}

describe('portfolioTotals', () => {
  it('sums invested, value and P&L across fully-stamped holdings', () => {
    const t = portfolioTotals([
      stamped({ sourceSymbol: 'A', avgBuyPriceBase: 100, currentPriceBase: 150 }),
      stamped({ sourceSymbol: 'B', avgBuyPriceBase: 200, currentPriceBase: 220 }),
    ])
    expect(t.totalInvestedBase).toBe(3000) // 10*100 + 10*200
    expect(t.totalValueBase).toBe(3700) // 10*150 + 10*220
    expect(t.totalProfitBase).toBe(700)
    expect(t.totalProfitPct).toBeCloseTo(700 / 3000)
    expect(t.positions).toBe(2)
    expect(t.unstamped).toBe(0)
  })

  it('reports undefined base totals and an unstamped count when FX is missing', () => {
    const t = portfolioTotals([
      stamped({ sourceSymbol: 'A' }),
      holding({ sourceSymbol: 'B', currentPrice: 150 }), // no *Base fields
    ])
    expect(t.totalInvestedBase).toBeUndefined()
    expect(t.totalProfitPct).toBeUndefined()
    expect(t.unstamped).toBe(1)
    expect(t.positions).toBe(2)
  })

  it('guards a zero cost basis — P&L % is undefined, not Infinity', () => {
    const t = portfolioTotals([
      stamped({ avgBuyPrice: 0, avgBuyPriceBase: 0, currentPriceBase: 150 }),
    ])
    expect(t.totalInvestedBase).toBe(0)
    expect(t.totalProfitPct).toBeUndefined()
  })
})

describe('allocation', () => {
  it('buckets current value by market, largest first', () => {
    const rows = deriveRows([
      stamped({ sourceSymbol: 'IN', currency: 'INR', currentPriceBase: 150 }),
      stamped({ sourceSymbol: 'US', currency: 'USD', currentPriceBase: 400 }),
    ])
    const slices = allocation(rows, 'market')
    expect(slices.map((s) => s.key)).toEqual(['USD', 'INR']) // 4000 > 1500
    expect(slices[0].label).toBe('US')
    expect(slices[0].pct).toBeCloseTo(4000 / 5500)
    expect(slices[1].pct).toBeCloseTo(1500 / 5500)
  })

  it('buckets by holding when asked', () => {
    const rows = deriveRows([
      stamped({ sourceSymbol: 'A', name: 'Alpha' }),
      stamped({ sourceSymbol: 'B', name: 'Bravo' }),
    ])
    const slices = allocation(rows, 'holding')
    expect(slices.map((s) => s.label).sort()).toEqual(['Alpha', 'Bravo'])
  })

  it('excludes holdings with no computable base value', () => {
    const rows = deriveRows([
      stamped({ sourceSymbol: 'A' }),
      holding({ sourceSymbol: 'B', currentPrice: 150 }), // unstamped
    ])
    const slices = allocation(rows, 'holding')
    expect(slices).toHaveLength(1)
    expect(slices[0].pct).toBe(1)
  })

  it('returns [] when nothing is allocatable', () => {
    const rows = deriveRows([holding()]) // no current price at all
    expect(allocation(rows, 'market')).toEqual([])
  })
})

describe('topMovers', () => {
  it('ranks holdings by lifetime P&L %, best first', () => {
    const rows = deriveRows([
      stamped({ sourceSymbol: 'WIN', avgBuyPrice: 100, currentPrice: 200 }), // +100%
      stamped({ sourceSymbol: 'FLAT', avgBuyPrice: 100, currentPrice: 100 }), // 0%
      stamped({ sourceSymbol: 'LOSE', avgBuyPrice: 100, currentPrice: 60 }), // -40%
    ])
    const movers = topMovers(rows)
    expect(movers.map((m) => m.holding.sourceSymbol)).toEqual(['WIN', 'FLAT', 'LOSE'])
    expect(movers[0].profitPct).toBeCloseTo(1)
    expect(movers[2].profitPct).toBeCloseTo(-0.4)
  })

  it('drops holdings with no computable P&L %', () => {
    const rows = deriveRows([
      stamped({ sourceSymbol: 'A' }),
      holding({ sourceSymbol: 'B' }), // no current price
    ])
    expect(topMovers(rows).map((m) => m.holding.sourceSymbol)).toEqual(['A'])
  })
})

describe('valueSeries', () => {
  function record(over: Partial<HistoryRecord>): HistoryRecord {
    return {
      date: '2026-05-16',
      capturedAt: 0,
      baseCurrency: 'INR',
      holdings: [],
      ...over,
    }
  }

  it('folds each history record into a value/invested/profit point', () => {
    const series = valueSeries(
      [
        record({
          date: '2026-05-10',
          holdings: [stamped({ avgBuyPriceBase: 100, currentPriceBase: 120 })],
        }),
        record({
          date: '2026-05-16',
          holdings: [stamped({ avgBuyPriceBase: 100, currentPriceBase: 150 })],
        }),
      ],
      'INR',
    )
    expect(series).toHaveLength(2)
    expect(series[0]).toMatchObject({ date: '2026-05-10', value: 1200, invested: 1000, profit: 200 })
    expect(series[1]).toMatchObject({ date: '2026-05-16', value: 1500, invested: 1000, profit: 500 })
  })

  it('skips records stamped in a different base currency', () => {
    const series = valueSeries(
      [
        record({ date: '2026-05-10', baseCurrency: 'USD', holdings: [stamped()] }),
        record({ date: '2026-05-16', baseCurrency: 'INR', holdings: [stamped()] }),
      ],
      'INR',
    )
    expect(series.map((p) => p.date)).toEqual(['2026-05-16'])
  })

  it('sorts points oldest-first regardless of input order', () => {
    const series = valueSeries(
      [record({ date: '2026-05-16' }), record({ date: '2026-05-01' })],
      'INR',
    )
    expect(series.map((p) => p.date)).toEqual(['2026-05-01', '2026-05-16'])
  })

  it('yields undefined figures for a record with an unstamped holding', () => {
    const series = valueSeries(
      [record({ holdings: [holding({ currentPrice: 150 })] })],
      'INR',
    )
    expect(series[0].value).toBeUndefined()
    expect(series[0].profit).toBeUndefined()
  })

  it('handles a single-snapshot history without error', () => {
    const series = valueSeries([record({ holdings: [stamped()] })], 'INR')
    expect(series).toHaveLength(1)
  })
})

/** Equally-weighted holding (base value 100). Each contributes a uniform 1/n
 *  slice to allocation and to concentration math. */
function equalUnit(symbol: string, currency: Currency = 'INR'): CanonicalHolding {
  return holding({
    sourceSymbol: symbol,
    name: symbol,
    currency,
    quantity: 1,
    avgBuyPrice: 100,
    avgBuyPriceBase: 100,
    currentPrice: 100,
    currentPriceBase: 100,
  })
}

/** Mirror of the production threshold so band-edge tests don't drift if the
 *  threshold ever changes — the test would then need an intentional update. */
const SINGLE_STOCK_THRESHOLD = 0.10

describe('concentration — empty / unpriced inputs', () => {
  it('returns all-undefined for an empty portfolio', () => {
    const c = concentration([])
    expect(c.top5Pct).toBeUndefined()
    expect(c.hhi).toBeUndefined()
    expect(c.hhiBand).toBeUndefined()
    expect(c.singleStockRisk).toBeUndefined()
  })

  it('returns all-undefined when no holding has a base-currency price', () => {
    const rows = deriveRows([
      holding({ sourceSymbol: 'A', avgBuyPriceBase: undefined, currentPriceBase: undefined }),
      holding({ sourceSymbol: 'B', avgBuyPriceBase: undefined, currentPriceBase: undefined }),
    ])
    const c = concentration(rows)
    expect(c.top5Pct).toBeUndefined()
    expect(c.hhi).toBeUndefined()
    expect(c.hhiBand).toBeUndefined()
    expect(c.singleStockRisk).toBeUndefined()
  })
})

describe('concentration — degenerate single holding', () => {
  it('single priced holding gives top5=1, HHI=1, band=high, flag fires', () => {
    const rows = deriveRows([equalUnit('AAPL', 'USD')])
    const c = concentration(rows)
    expect(c.top5Pct).toBe(1)
    expect(c.hhi).toBe(1)
    expect(c.hhiBand).toBe('high')
    expect(c.singleStockRisk).toBeDefined()
    expect(c.singleStockRisk!.holding.sourceSymbol).toBe('AAPL')
    expect(c.singleStockRisk!.weight).toBe(1)
  })
})

describe('concentration — HHI bands match DOJ thresholds', () => {
  it('10 equal positions: HHI 0.10 → low band; single-stock flag stays off at the 10% threshold', () => {
    // Each position is exactly 1/10 = 0.10 weight, which is NOT strictly
    // greater than the SINGLE_STOCK_THRESHOLD. Flag must stay off.
    const rows = deriveRows(
      Array.from({ length: 10 }, (_, i) => equalUnit(`TICK${i}`)),
    )
    const c = concentration(rows)
    expect(c.hhi).toBeCloseTo(0.1)
    expect(c.hhiBand).toBe('low')
    expect(c.singleStockRisk).toBeUndefined()
    expect(c.top5Pct).toBeCloseTo(0.5)
  })

  it('5 equal positions: HHI 0.20 → moderate band; top5 = 1', () => {
    const rows = deriveRows(
      Array.from({ length: 5 }, (_, i) => equalUnit(`TICK${i}`)),
    )
    const c = concentration(rows)
    expect(c.hhi).toBeCloseTo(0.2)
    expect(c.hhiBand).toBe('moderate')
    expect(c.top5Pct).toBe(1)
  })

  it('4 equal positions: HHI 0.25 → high band (boundary inclusive on the high side)', () => {
    const rows = deriveRows(
      Array.from({ length: 4 }, (_, i) => equalUnit(`TICK${i}`)),
    )
    const c = concentration(rows)
    expect(c.hhi).toBeCloseTo(0.25)
    expect(c.hhiBand).toBe('high')
  })
})

describe('concentration — single-stock-risk flag', () => {
  it('fires when one position strictly exceeds 10% of portfolio value', () => {
    // BIG: 100 × 100 = 10,000 base value.  9 × SMALL: each 1 × 100 = 100, so
    // 900 base value total. Portfolio = 10,900. BIG weight ≈ 0.917, well over
    // the threshold → flag names BIG.
    const rows = deriveRows([
      holding({
        sourceSymbol: 'BIG',
        name: 'Big Co',
        quantity: 100,
        avgBuyPrice: 100,
        avgBuyPriceBase: 100,
        currentPrice: 100,
        currentPriceBase: 100,
      }),
      ...Array.from({ length: 9 }, (_, i) => equalUnit(`SMALL${i}`)),
    ])
    const c = concentration(rows)
    expect(c.singleStockRisk).toBeDefined()
    expect(c.singleStockRisk!.holding.sourceSymbol).toBe('BIG')
    expect(c.singleStockRisk!.weight).toBeGreaterThan(SINGLE_STOCK_THRESHOLD)
  })

  it('does not fire when all positions are at or below 10%', () => {
    const rows = deriveRows(
      Array.from({ length: 11 }, (_, i) => equalUnit(`TICK${i}`)),
    )
    const c = concentration(rows)
    expect(c.singleStockRisk).toBeUndefined()
  })

  it('skips unpriced holdings when computing weights', () => {
    // Two priced equal-weighted holdings (50/50). One unpriced row exists
    // but does not participate in the concentration math.
    const rows = deriveRows([
      equalUnit('A'),
      equalUnit('B'),
      holding({
        sourceSymbol: 'UNPRICED',
        currentPrice: undefined,
        currentPriceBase: undefined,
      }),
    ])
    const c = concentration(rows)
    expect(c.hhi).toBeCloseTo(0.5)
    expect(c.singleStockRisk).toBeDefined()
    expect(c.singleStockRisk!.weight).toBeCloseTo(0.5)
  })
})

describe('currency exposure (via allocation(rows, "market") — degenerate cases)', () => {
  it('all-INR portfolio yields a single "India" slice at 100%', () => {
    const rows = deriveRows([equalUnit('A', 'INR'), equalUnit('B', 'INR')])
    const slices = allocation(rows, 'market')
    expect(slices).toHaveLength(1)
    expect(slices[0].label).toBe('India')
    expect(slices[0].pct).toBe(1)
  })

  it('all-USD portfolio yields a single "US" slice at 100%', () => {
    const rows = deriveRows([equalUnit('AAPL', 'USD'), equalUnit('MSFT', 'USD')])
    const slices = allocation(rows, 'market')
    expect(slices).toHaveLength(1)
    expect(slices[0].label).toBe('US')
    expect(slices[0].pct).toBe(1)
  })
})

describe('sectorAllocation', () => {
  const sectors: SectorMap = {
    AAPL: { sector: 'Information Technology', market: 'USD', name: 'Apple' },
    MSFT: { sector: 'Information Technology', market: 'USD', name: 'Microsoft' },
    JPM: { sector: 'Financials', market: 'USD', name: 'JPMorgan' },
    INE002A01018: { sector: 'Energy', market: 'INR', name: 'Reliance' },
  }

  it('returns [] for an empty portfolio', () => {
    expect(sectorAllocation([], sectors)).toEqual([])
  })

  it('returns [] when no holding is priced', () => {
    const rows = deriveRows([
      holding({
        sourceSymbol: 'AAPL',
        currentPrice: undefined,
        currentPriceBase: undefined,
      }),
    ])
    expect(sectorAllocation(rows, sectors)).toEqual([])
  })

  it('buckets priced holdings by sector and sorts largest-first', () => {
    const rows = deriveRows([
      equalUnit('AAPL', 'USD'), // IT — 100
      equalUnit('MSFT', 'USD'), // IT — 100
      equalUnit('JPM', 'USD'),  // Financials — 100
    ])
    const slices = sectorAllocation(rows, sectors)
    expect(slices.map((s) => s.label)).toEqual(['Information Technology', 'Financials'])
    expect(slices[0].pct).toBeCloseTo(2 / 3)
    expect(slices[1].pct).toBeCloseTo(1 / 3)
  })

  it('groups tickers missing from the sector map into the "Unknown" bucket', () => {
    const rows = deriveRows([
      equalUnit('AAPL', 'USD'),      // mapped → IT
      equalUnit('NEW_TICKER', 'USD'), // unmapped → Unknown
      equalUnit('OTHER_NEW', 'USD'),  // unmapped → Unknown (same bucket)
    ])
    const slices = sectorAllocation(rows, sectors)
    const byLabel = new Map(slices.map((s) => [s.label, s]))
    expect(byLabel.get('Unknown')!.pct).toBeCloseTo(2 / 3)
    expect(byLabel.get('Information Technology')!.pct).toBeCloseTo(1 / 3)
    // Stable key for the Unknown bucket — not "Unknown" the string.
    expect(byLabel.get('Unknown')!.key).toBe('__unknown')
  })

  it('coexists with INR ISIN keys and USD ticker keys honestly (no unified ontology)', () => {
    const rows = deriveRows([
      equalUnit('AAPL', 'USD'),
      equalUnit('INE002A01018', 'INR'),
    ])
    const slices = sectorAllocation(rows, sectors)
    const labels = slices.map((s) => s.label).sort()
    expect(labels).toEqual(['Energy', 'Information Technology'])
  })

  it('excludes unpriced rows from the sector denominator', () => {
    const rows = deriveRows([
      equalUnit('AAPL', 'USD'),
      holding({
        sourceSymbol: 'MSFT',
        currentPrice: undefined,
        currentPriceBase: undefined,
      }),
    ])
    const slices = sectorAllocation(rows, sectors)
    expect(slices).toHaveLength(1)
    expect(slices[0].label).toBe('Information Technology')
    expect(slices[0].pct).toBe(1)
  })
})

describe('benchmarkSeries', () => {
  /** Synthetic benchmark — five points at 1000/1100/1200/1300/1400. */
  const benchmark: BenchmarkData = {
    index: 'TEST',
    rebaseLabel: 'TEST (rebased)',
    series: [
      { date: '2026-01-01', close: 1000 },
      { date: '2026-01-08', close: 1100 },
      { date: '2026-01-15', close: 1200 },
      { date: '2026-01-22', close: 1300 },
      { date: '2026-01-29', close: 1400 },
    ],
  }

  function value(date: string, v: number | undefined): ValuePoint {
    return { date, value: v, invested: v, profit: 0 }
  }

  it('returns [] when portfolio has fewer than 2 points', () => {
    expect(benchmarkSeries([value('2026-01-01', 100)], benchmark)).toEqual([])
  })

  it('rebases the benchmark so the first overlay point matches portfolio anchor', () => {
    const portfolio: ValuePoint[] = [
      value('2026-01-01', 5000),
      value('2026-01-29', 7000),
    ]
    const overlay = benchmarkSeries(portfolio, benchmark)
    expect(overlay).toHaveLength(2)
    expect(overlay[0]).toEqual({ date: '2026-01-01', value: 5000 })
    // Benchmark rose 1000 → 1400 (40%) over the range; rebased to 5000 → 7000.
    expect(overlay[1].value).toBeCloseTo(7000, 1)
  })

  it('forward-fills the benchmark across non-trading days', () => {
    // Portfolio has a snapshot on 2026-01-05 (Mon — but benchmark has no
    // point that day). The overlay must use 2026-01-01's close (1000).
    const portfolio: ValuePoint[] = [
      value('2026-01-01', 1000),
      value('2026-01-05', 1100),
      value('2026-01-29', 1400),
    ]
    const overlay = benchmarkSeries(portfolio, benchmark)
    const at0105 = overlay.find((p) => p.date === '2026-01-05')
    expect(at0105).toBeDefined()
    // Rebase factor = 1000/1000 = 1; close on 2026-01-05 forward-filled to
    // 1000 (from 2026-01-01) → overlay value 1000.
    expect(at0105!.value).toBeCloseTo(1000)
  })

  it('clips portfolio dates that precede the bundled benchmark range', () => {
    const portfolio: ValuePoint[] = [
      value('2025-12-01', 100), // before benchmark start — clipped
      value('2026-01-15', 6000),
      value('2026-01-29', 7000),
    ]
    const overlay = benchmarkSeries(portfolio, benchmark)
    expect(overlay.map((p) => p.date)).toEqual(['2026-01-15', '2026-01-29'])
  })

  it('clips portfolio dates that follow the bundled benchmark range', () => {
    const portfolio: ValuePoint[] = [
      value('2026-01-01', 5000),
      value('2026-01-15', 6000),
      value('2026-02-15', 8000), // after benchmark end — clipped
    ]
    const overlay = benchmarkSeries(portfolio, benchmark)
    expect(overlay.map((p) => p.date)).toEqual(['2026-01-01', '2026-01-15'])
  })

  it('returns [] when portfolio is entirely outside benchmark range', () => {
    const portfolio: ValuePoint[] = [
      value('2024-01-01', 100),
      value('2024-02-01', 200),
    ]
    expect(benchmarkSeries(portfolio, benchmark)).toEqual([])
  })

  it('returns [] when portfolio anchor value is undefined for every covered date', () => {
    const portfolio: ValuePoint[] = [
      value('2026-01-01', undefined),
      value('2026-01-29', undefined),
    ]
    expect(benchmarkSeries(portfolio, benchmark)).toEqual([])
  })

  it('skips a leading undefined-value portfolio point to anchor the rebase later', () => {
    const portfolio: ValuePoint[] = [
      value('2026-01-01', undefined), // skipped as anchor
      value('2026-01-08', 1100),       // becomes the anchor
      value('2026-01-29', 1400),
    ]
    const overlay = benchmarkSeries(portfolio, benchmark)
    expect(overlay).toHaveLength(2)
    expect(overlay[0]).toEqual({ date: '2026-01-08', value: 1100 })
  })
})
