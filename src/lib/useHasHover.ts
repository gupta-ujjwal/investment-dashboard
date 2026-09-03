import { useEffect, useState } from 'react'

/** True only for pointers that support real hover (mouse/trackpad) — avoids
 *  the well-known mobile quirk where a tap leaves an element "stuck" in a
 *  hover/spotlight state. Shared by HoverTile and CardSpotlight. */
export function useHasHover(): boolean {
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
