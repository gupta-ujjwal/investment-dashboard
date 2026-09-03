import { useRef, useState, type ReactNode } from 'react'
import { useHasHover } from '../../lib/useHasHover'

/** React Bits' "Card Spotlight" reimagined without its dependency — a
 *  radial glow that tracks the cursor within the card, at the cobalt accent.
 *  Purely a hover reaction to the user's own pointer (not an autoplaying
 *  animation), so it isn't gated behind `prefers-reduced-motion`; it *is*
 *  gated to real hover-capable pointers, since a touch device has no
 *  continuous move events to track. */
export function CardSpotlight({ children, className }: { children: ReactNode; className?: string }) {
  const hasHover = useHasHover()
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 50, y: 50 })
  const [active, setActive] = useState(false)

  function handleMove(e: React.MouseEvent) {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    setPos({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    })
  }

  return (
    <div
      ref={ref}
      className={`relative isolate ${className ?? ''}`}
      onMouseMove={hasHover ? handleMove : undefined}
      onMouseEnter={hasHover ? () => setActive(true) : undefined}
      onMouseLeave={hasHover ? () => setActive(false) : undefined}
    >
      {hasHover && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 transition-opacity duration-300"
          style={{
            opacity: active ? 1 : 0,
            background: `radial-gradient(480px circle at ${pos.x}% ${pos.y}%, color-mix(in srgb, var(--color-act-400) 22%, transparent), transparent 70%)`,
          }}
        />
      )}
      {children}
    </div>
  )
}
