import { useState } from 'react'

/** Selected window as indices into the chart's full data array. `null` is
 *  the resting state — no controlled props are passed, so Recharts' `<Brush>`
 *  defaults to the full range. */
type ZoomRange = { startIndex: number; endIndex: number }

type ChartZoom = {
  /** Controlled `startIndex`/`endIndex` props for the `<Brush>`. */
  startIndex: number | undefined
  endIndex: number | undefined
  /** Wire straight to `<Brush onChange>`; Recharts calls it with the user's
   *  window after each traveller drag or slide pan. */
  onChange: (range: ZoomRange) => void
  /** True whenever the visible window is not the full range — including
   *  windows panned rather than narrowed. Gates the reset affordance. */
  isZoomed: boolean
  /** Restore the full range. */
  reset: () => void
}

/**
 * Shared zoom state for the time-series charts' `<Brush>` range selector —
 * one instance per chart. The chart keeps receiving its FULL data array;
 * Recharts narrows the rendered window internally, so every series follows
 * the window in lockstep (this is what keeps `ValueOverTime`'s benchmark
 * overlay synced with the main lines with no per-series wiring).
 *
 * State is always written as an explicit range, never cleared back to
 * `null` once set: Recharts' chart store keeps its last
 * `dataStartIndex`/`dataEndIndex` when the controlled props return to
 * `undefined`, so a plain clear would leave the chart stuck narrowed.
 */
export function useChartZoom(dataLength: number): ChartZoom {
  const [range, setRange] = useState<ZoomRange | null>(null)

  // A data-length change (snapshot imported or deleted) invalidates the
  // stored indices — reset to the full range. Adjusted during render rather
  // than in an effect (React's documented pattern for prop-derived resets)
  // so nothing paints against indices that may exceed the new bounds.
  const [prevLength, setPrevLength] = useState(dataLength)
  const fullRange: ZoomRange | null =
    dataLength > 0 ? { startIndex: 0, endIndex: dataLength - 1 } : null
  if (dataLength !== prevLength) {
    setPrevLength(dataLength)
    setRange(fullRange)
  }

  const isZoomed =
    range !== null && (range.startIndex > 0 || range.endIndex < dataLength - 1)

  return {
    startIndex: range?.startIndex,
    endIndex: range?.endIndex,
    onChange: setRange,
    isZoomed,
    reset: () => setRange(fullRange),
  }
}

/** "Reset zoom" pill for a `ChartCard`'s `action` slot, rendered only while
 *  zoomed. Styled as the app's small mono control pill (the BudgetRoute /
 *  PortfolioRoute secondary pill shape) so the in-chart control reads as
 *  dashboard chrome, not Recharts UI. */
export function ChartZoomReset({ onReset }: { onReset: () => void }) {
  return (
    <button
      type="button"
      onClick={onReset}
      className="rounded-full border border-bone-100/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-bone-300 transition hover:border-act-400 hover:text-act-400"
    >
      Reset zoom
    </button>
  )
}
