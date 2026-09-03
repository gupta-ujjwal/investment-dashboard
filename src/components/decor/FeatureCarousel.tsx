import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion'

export type FeatureSlide = {
  title: string
  body: string
}

const AUTOPLAY_MS = 4500

/** Skiper's "Creative carousel" (skiper50), adapted for text rather than
 *  images — the original is built on `swiper` for 3D-rotating photo slides,
 *  which doesn't fit a three-line feature intro. This keeps the same
 *  motion-led feel (fade + rise on slide change) on framer-motion alone, with
 *  dot navigation and autoplay paused under `prefers-reduced-motion`. Default
 *  export: lazy-loaded. */
export default function FeatureCarousel({ slides }: { slides: FeatureSlide[] }) {
  const [index, setIndex] = useState(0)
  const reducedMotion = usePrefersReducedMotion()

  useEffect(() => {
    if (reducedMotion || slides.length <= 1) return
    const id = setInterval(() => setIndex((i) => (i + 1) % slides.length), AUTOPLAY_MS)
    return () => clearInterval(id)
  }, [reducedMotion, slides.length])

  const slide = slides[index]

  return (
    <div className="mx-auto max-w-md text-center">
      <div className="relative h-20 sm:h-16">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={reducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: [0.2, 0.7, 0.2, 1] }}
            className="absolute inset-0"
          >
            <p className="font-sans text-sm font-medium text-bone-100 sm:text-base">{slide.title}</p>
            <p className="mt-1.5 font-sans text-xs text-bone-400">{slide.body}</p>
          </motion.div>
        </AnimatePresence>
      </div>
      {slides.length > 1 && (
        <div className="mt-3 flex items-center justify-center gap-1.5">
          {slides.map((s, i) => (
            <button
              key={s.title}
              type="button"
              aria-label={`Show: ${s.title}`}
              aria-current={i === index}
              onClick={() => setIndex(i)}
              className={`h-1.5 w-1.5 rounded-full transition ${
                i === index ? 'bg-act-400' : 'bg-bone-100/20 hover:bg-bone-100/40'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
