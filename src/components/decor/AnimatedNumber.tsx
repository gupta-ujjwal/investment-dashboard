import { useEffect, useRef, useState } from 'react'
import { animate } from 'framer-motion'
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion'
import { formatMoneyParts } from '../../lib/format'
import type { Currency } from '../../storage/holdings'

type Props = {
  /** The real numeric value — formatting stays the caller's job (formatMoney,
   *  formatPercent, …) so this stays currency/locale-agnostic. */
  value: number
  format: (n: number) => string
  className?: string
  durationS?: number
}

/** Skiper's "Animated number" (skiper37), reimplemented on framer-motion
 *  alone — the original also pulls in `@number-flow/react` and
 *  `react-intersection-observer` for a feature set (countdown, viewport
 *  trigger) this app doesn't need. Counts up from 0 on mount; renders the
 *  final value immediately under `prefers-reduced-motion`. */
export function AnimatedNumber({ value, format, className, durationS = 1.1 }: Props) {
  const reducedMotion = usePrefersReducedMotion()
  const [display, setDisplay] = useState(reducedMotion ? value : 0)
  const mounted = useRef(false)

  useEffect(() => {
    if (reducedMotion) {
      setDisplay(value)
      return
    }
    const from = mounted.current ? display : 0
    mounted.current = true
    const controls = animate(from, value, {
      duration: durationS,
      ease: [0.2, 0.7, 0.2, 1],
      onUpdate: setDisplay,
    })
    return () => controls.stop()
  }, [value, reducedMotion, durationS])

  return <span className={className}>{format(display)}</span>
}

/** Hero-figure money: the currency symbol reads smaller/lighter ahead of the
 *  number (Mercury/Stripe convention — the digits carry the weight, the
 *  symbol is just context). Only for the one or two dominant figures per
 *  screen; every other money value in the app stays plain `formatMoney`. */
export function AnimatedMoney({
  value,
  currency,
  className,
  durationS,
}: {
  value: number
  currency: Currency
  className?: string
  durationS?: number
}) {
  const { symbol } = formatMoneyParts(value, currency)
  return (
    <span className="inline-flex items-baseline gap-1">
      {symbol && <span className="text-[0.4em] font-normal text-bone-400">{symbol}</span>}
      <AnimatedNumber
        value={value}
        format={(n) => formatMoneyParts(n, currency).number}
        className={className}
        durationS={durationS}
      />
    </span>
  )
}
