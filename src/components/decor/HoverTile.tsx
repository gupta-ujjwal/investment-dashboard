import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion'

/** True only for pointers that support real hover (mouse/trackpad) — avoids
 *  the well-known mobile quirk where a tap leaves an element "stuck" in
 *  :hover. Local to HoverTile: nothing else in the app needs this yet. */
function useHasHover(): boolean {
  const [hasHover, setHasHover] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia('(hover: hover) and (pointer: fine)')
    setHasHover(mql.matches)
    const onChange = () => setHasHover(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])
  return hasHover
}

const VARIANTS = {
  // Isolated cards/tiles — a small lift reads fine with room around them.
  lift: { y: -3, scale: 1.015 },
  // Tight vertical nav lists — a lift would overlap neighbouring rows, so
  // nudge sideways instead.
  nudge: { x: 3 },
}

/** Skiper's "ExpandOnHover" (skiper52), adapted from its image-card
 *  width-collapse layout (built for photo galleries) to a restrained lift +
 *  scale that fits KPI tiles / broker cards / nav rows — content this app
 *  actually has. Desktop/mouse only; touch keeps its existing `:active`
 *  affordance untouched. No-op wrapper under reduced motion. */
export function HoverTile({
  children,
  className,
  variant = 'lift',
}: {
  children: ReactNode
  className?: string
  variant?: keyof typeof VARIANTS
}) {
  const hasHover = useHasHover()
  const reducedMotion = usePrefersReducedMotion()
  const enabled = hasHover && !reducedMotion

  return (
    <motion.div
      className={className}
      whileHover={enabled ? VARIANTS[variant] : undefined}
      transition={{ type: 'spring', stiffness: 350, damping: 24 }}
    >
      {children}
    </motion.div>
  )
}
