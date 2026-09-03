import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

/** JS-level mirror of the `@media (prefers-reduced-motion: reduce)` gate
 *  already used in index.css — for animation driven by React/canvas rather
 *  than CSS keyframes (count-up numbers, carousel autoplay, ambient
 *  backgrounds). */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(QUERY).matches,
  )

  useEffect(() => {
    const mql = window.matchMedia(QUERY)
    const onChange = () => setReduced(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return reduced
}
