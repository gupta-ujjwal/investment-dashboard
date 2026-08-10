import type { BaseCurrency } from '../../storage/holdings'

/**
 * Shared Recharts styling. Recharts ships a generic light-theme look; every
 * chart here is stripped back to the dashboard's own tokens — near-black
 * cards, bone text, amber/jade/ember accents — so the four charts read as one
 * instrument panel, not four widgets.
 */

export const chartColor = {
  value: 'var(--color-bone-200)',
  invested: 'var(--color-bone-400)',
  gain: 'var(--color-jade-400)',
  loss: 'var(--color-ember-400)',
  /** Benchmark overlay (issue #24, PR B). Reuses the existing `bone-500`
   *  neutral so we don't introduce a fifth chart token; the line is a thin
   *  dashed stroke so it reads as "reference, not portfolio" even though
   *  it shares a hue with the `invested` cost-basis line. */
  benchmark: 'var(--color-bone-500)',
  axis: 'var(--color-bone-400)',
  grid: 'rgba(233, 233, 237, 0.07)',
} as const

/** Categorical chart ramp (8 steps + neutral tail). Hue-separated AND
 *  luminance-separated for colour-blind safety. Assign by stable key via
 *  `categoricalColor()`, never by array index — a slice must keep its colour
 *  when ordering or filtering changes. */
export const donutPalette = [
  'var(--cat-1)',
  'var(--cat-2)',
  'var(--cat-3)',
  'var(--cat-4)',
  'var(--cat-5)',
  'var(--cat-6)',
  'var(--cat-7)',
  'var(--cat-8)',
] as const
export const donutOther = 'var(--cat-other)'

/** First-seen order for sequential colour assignment. The first 8 distinct
 *  keys are guaranteed distinct colours; subsequent keys cycle. A key keeps
 *  its colour when ordering or filtering changes within a session. */
const colorOrder: string[] = []
const colorIndex = new Map<string, number>()

/** Stable colour per categorical key. Assigns palette colours sequentially by
 *  first-seen order so the first 8 distinct keys are always distinct. Returns
 *  `donutOther` for the grouped-tail key. Never assigns by array index — a
 *  slice keeps its colour when ordering or filtering changes. */
export function categoricalColor(key: string): string {
  if (key === '__other') return donutOther
  let idx = colorIndex.get(key)
  if (idx === undefined) {
    idx = colorOrder.length
    colorOrder.push(key)
    colorIndex.set(key, idx)
  }
  return donutPalette[idx % donutPalette.length]
}

/** Reset the colour assignment map. For test isolation only. */
export function _resetColorMap(): void {
  colorOrder.length = 0
  colorIndex.clear()
}

/** Axis tick text — mono, tiny, bone-400, matching the app's micro-labels. */
export const axisTick = {
  fill: 'var(--color-bone-400)',
  fontSize: 10,
  fontFamily: 'var(--font-mono)',
} as const

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/** `2026-05-16` → `16 May`. Formats the key string directly — no `Date`
 *  parsing, so a negative UTC offset can't shift the label by a day. */
export function formatDateKey(key: string): string {
  const [year, month, day] = key.split('-').map(Number)
  if (!year || !month || !day || month < 1 || month > 12) return key
  return `${day} ${MONTHS[month - 1]}`
}

/** `2026-06` → `Jun 2026`. Same string-parse discipline as `formatDateKey` — no
 *  `Date`, so a UTC offset can't shift a month-boundary key into the prior month. */
export function formatMonthKey(key: string): string {
  const [year, month] = key.split('-').map(Number)
  if (!year || !month || month < 1 || month > 12) return key
  return `${MONTHS[month - 1]} ${year}`
}

/** Compact currency for axis ticks — `₹2.7K`, `₹5L`, `₹2Cr`, `$1.2K`, `$3.4M`.
 *  Hand-rolled rather than `Intl` compact notation: `en-IN`'s compact form
 *  abbreviates thousands as "T", which reads as "trillion" on a finance axis.
 *  INR scales by the Indian lakh/crore system, USD by K/M/B. */
export function compactMoney(value: number, currency: BaseCurrency): string {
  if (!Number.isFinite(value)) return '—'
  const symbol = currency === 'INR' ? '₹' : '$'
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)
  const scale = (n: number, suffix: string, whole: number) =>
    `${sign}${symbol}${(abs / n).toFixed(abs / n >= whole ? 0 : 1)}${suffix}`
  if (currency === 'INR') {
    if (abs >= 1e7) return scale(1e7, 'Cr', 100)
    if (abs >= 1e5) return scale(1e5, 'L', 100)
    if (abs >= 1e3) return scale(1e3, 'K', 100)
  } else {
    if (abs >= 1e9) return scale(1e9, 'B', 100)
    if (abs >= 1e6) return scale(1e6, 'M', 100)
    if (abs >= 1e3) return scale(1e3, 'K', 100)
  }
  return `${sign}${symbol}${abs.toFixed(0)}`
}
