import { useEffect, useId, useRef } from 'react'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Shared modal-form primitives — the dialog shell, a labelled field wrapper,
 * and the input class helper. Extracted so the holding form and the asset form
 * present an identical surface (same backdrop, focus trap affordances, error
 * styling) instead of drifting apart as two copies. Purely presentational; all
 * state and submission live in the consuming form.
 */
export function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  // Focus trap: Tab/Shift+Tab cycles within the panel instead of escaping to
  // the page behind the backdrop, and focus returns to whatever triggered the
  // dialog (the "Add"/"Edit" button) once it unmounts. ModalShell is only ever
  // mounted while its dialog is open (both callers `if (!open) return null`
  // before rendering it), so mount/unmount here lines up exactly with the
  // dialog's own open/close lifecycle.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !panelRef.current) return
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/80 px-3 py-6 backdrop-blur-sm sm:items-center sm:px-6"
    >
      {/* Backdrop click closes; clicking the panel does not. */}
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <div
        ref={panelRef}
        className="relative z-10 flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-bone-100/15 bg-ink-900 shadow-2xl shadow-ink-950/80"
      >
        <header className="flex items-center justify-between border-b border-bone-100/10 bg-ink-850 px-5 py-3">
          <h2
            id={titleId}
            className="font-sans text-base font-semibold tracking-tight text-bone-50"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="font-mono text-lg text-bone-400 transition hover:text-bone-100"
          >
            ×
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  )
}

export function Field({
  label,
  error,
  children,
}: {
  label: string
  error: string | undefined
  children: React.ReactNode
}) {
  return (
    <label className="grid gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-bone-400">
        {label}
      </span>
      {children}
      {error && (
        <span role="alert" className="font-sans text-xs text-ember-400">
          {error}
        </span>
      )}
    </label>
  )
}

export function inputClass(hasError: boolean): string {
  return hasError ? 'field border-ember-400/60 focus:border-ember-400' : 'field'
}
