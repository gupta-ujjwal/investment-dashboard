import type { UndoableToast } from './useUndoableAction'

type Props = {
  toast: UndoableToast | null
  onUndo: () => void
  onDismiss: () => void
}

/**
 * Bottom-of-viewport toast with an Undo button. Renders nothing when
 * `toast === null`. Pairs with `useUndoableAction` — the hook drives the
 * state, this component is the pixels.
 *
 * Accessibility: `role="status"` + `aria-live="polite"` so screen readers
 * announce the toast without interrupting whatever the user was doing. The
 * Undo button is the first interactive element so keyboard users can
 * Shift+Tab into it from wherever focus is parked.
 */
export function UndoToast({ toast, onUndo, onDismiss }: Props) {
  if (!toast) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4"
    >
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-bone-100/15 bg-ink-850 px-4 py-3 shadow-lg shadow-ink-950/60">
        <div className="min-w-0 flex-1">
          <p className="truncate font-sans text-sm text-bone-50">{toast.message}</p>
          {toast.detail && (
            <p className="truncate font-mono text-[11px] text-bone-400">{toast.detail}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onUndo}
          className="rounded-full border border-act-400 px-3 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-act-400 transition hover:bg-act-400 hover:text-ink-950"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="font-mono text-lg text-bone-400 transition hover:text-bone-100"
        >
          ×
        </button>
      </div>
    </div>
  )
}
