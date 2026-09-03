import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion'

/** Ambient gradient-and-grain backdrop for hero / first-run surfaces —
 *  React Bits' "Grainient" reimagined without its `ogl` WebGL dependency:
 *  three blurred radial-gradient blobs (Nocturne tick/act/jade) drifting
 *  slowly under a fine grain overlay, all CSS/SVG — no canvas, no new
 *  runtime dependency. Purely decorative: `pointer-events-none`, sits
 *  behind opaque `bg-ink-900` content, never affects contrast/legibility.
 *  Drift stops under `prefers-reduced-motion`. Default export: lazy-loaded
 *  (purely decorative — nothing is lost rendering it a beat late). */
export default function AmbientBackground({ className = '' }: { className?: string }) {
  const reducedMotion = usePrefersReducedMotion()

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden ${className}`}
    >
      <div
        className={`ambient-blob bg-tick-400 ${reducedMotion ? '' : 'animate-ambient-drift-1'}`}
        style={{ left: '-10%', top: '-20%' }}
      />
      <div
        className={`ambient-blob bg-act-400 ${reducedMotion ? '' : 'animate-ambient-drift-2'}`}
        style={{ right: '-15%', top: '10%' }}
      />
      <div
        className={`ambient-blob bg-jade-500 ${reducedMotion ? '' : 'animate-ambient-drift-3'}`}
        style={{ left: '20%', bottom: '-30%' }}
      />
      <svg className="absolute inset-0 h-0 w-0">
        <filter id="ambient-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} stitchTiles="stitch" />
          <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.05 0" />
        </filter>
      </svg>
      <div className="absolute inset-0" style={{ filter: 'url(#ambient-grain)', mixBlendMode: 'overlay' }} />
    </div>
  )
}
