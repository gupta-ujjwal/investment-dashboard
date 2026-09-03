type Tone = 'accent' | 'gain' | 'loss'

const strokeColor: Record<Tone, string> = {
  accent: 'var(--color-act-400)',
  gain: 'var(--color-jade-400)',
  loss: 'var(--color-ember-400)',
}

/** A minimal inline trend line for a KPI figure — the "small multiple" every
 *  reference fintech dashboard (Mercury, Stripe) puts beside its headline
 *  numbers. Built directly on SVG rather than pulling in a chart-library
 *  dependency for a decorative 100×28 line; `pathLength="1"` lets the
 *  draw-in animation skip JS length measurement. Purely decorative — the
 *  real number is announced by the KPI value beside it — so it's
 *  `aria-hidden` and (like `.reveal`) drawn instantly under
 *  `prefers-reduced-motion` via the CSS in index.css. */
export function Sparkline({
  values,
  tone = 'accent',
  className,
}: {
  values: number[]
  tone?: Tone
  className?: string
}) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const w = 100
  const h = 28
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w
    const y = h - ((v - min) / range) * h
    return `${x},${y}`
  })

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d={`M${points.join(' L')}`}
        fill="none"
        stroke={strokeColor[tone]}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        pathLength={1}
        className="sparkline-draw"
      />
    </svg>
  )
}
