import type { ReactNode } from 'react'
import { ChartErrorBoundary } from './ChartErrorBoundary'
import { HoverTile } from '../decor/HoverTile'

type Props = {
  title: string
  /** Mono uppercase chip, top-right — names the chart type (`line`, `donut`…). */
  chip: string
  /** Optional headline figure, shown in display serif under the title. */
  figure?: string
  /** Optional right-aligned controls (e.g. the allocation mode toggle). */
  action?: ReactNode
  children: ReactNode
  /** Extra classes on the card root — e.g. `lg:col-span-2` for a grid's
   *  trailing odd-one-out tile. */
  className?: string
}

/** The bordered card every homepage chart sits in — matches the dashboard's
 *  KPI tiles and the prior placeholder `ChartFrame`. Wraps the body in an
 *  error boundary so one bad chart can't take the page down. */
export function ChartCard({ title, chip, figure, action, children, className }: Props) {
  return (
    // `min-w-0` is load-bearing: as a grid/flex child this card defaults to
    // `min-width: auto` and would refuse to shrink below the chart's content
    // width, overflowing the viewport on mobile. Recharts' ResponsiveContainer
    // only sizes down correctly once the card itself can.
    <HoverTile className={`flex min-h-[320px] min-w-0 flex-col rounded-2xl bg-ink-900 p-6 ${className ?? ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-sans text-base font-semibold tracking-tight text-bone-100">
            {title}
          </h3>
          {figure !== undefined && (
            <p className="mt-1 font-display text-2xl leading-tight tracking-tight text-bone-50 tabular-nums">
              {figure}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {action}
          <span className="rounded border border-bone-100/15 bg-ink-800 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-bone-400">
            {chip}
          </span>
        </div>
      </div>
      <div className="mt-5 min-w-0 flex-1">
        <ChartErrorBoundary title={title}>{children}</ChartErrorBoundary>
      </div>
    </HoverTile>
  )
}

/** Centred placeholder for a chart that has no data yet — a holdings set with
 *  no priced positions, or a history with fewer than two snapshot days. */
export function ChartEmpty({ message }: { message: string }) {
  return (
    <div
      className="flex h-56 items-center justify-center px-6 text-center"
      style={{
        backgroundImage: `
          linear-gradient(to right, rgba(242, 235, 219, 0.05) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(242, 235, 219, 0.04) 1px, transparent 1px)
        `,
        backgroundSize: '14px 100%, 100% 12px',
      }}
    >
      <p className="max-w-[17rem] font-sans text-xs leading-relaxed text-bone-400">
        {message}
      </p>
    </div>
  )
}
