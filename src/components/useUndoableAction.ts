import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Post-action recovery hook — the Gmail "Undo" toast pattern.
 *
 * The destructive action runs first (delete fires, edit commits). Then the
 * caller invokes `show(snapshot, message)` to surface a toast with an Undo
 * button. If the user clicks Undo within `windowMs`, `onUndo(snapshot)` runs
 * and restores from the snapshot. If `windowMs` elapses, the toast dismisses
 * silently — no second commit needed; the action already happened.
 *
 * Why post-action (vs pre-action confirm): for irreversible writes on the
 * only copy of the user's portfolio, the brain-stem confirm dialog is well
 * known to be ignored. A 5-second undo window with the action visibly
 * already-performed gives the user time to spot a misclick and reverse it,
 * without slowing down the common case. This addresses Reliability Tenet 3
 * (blast radius) on the highest-blast actions: Delete forever and inline
 * numeric edit.
 *
 * Single-toast policy: only one active toast at a time. A new `show()`
 * supersedes the previous one — the previous snapshot's destructive write
 * is implicitly committed (already-happened) and is no longer recoverable.
 * This matches the Gmail behavior and keeps the state model trivial.
 */

export type UndoableToast = {
  message: string
  /** Optional secondary line — used to show "<old> → <new>" for edit-save undo. */
  detail?: string
}

type Props<T> = {
  onUndo: (snapshot: T) => void | Promise<void>
  /** How long the toast is interactive, in ms. Defaults to 5000. */
  windowMs?: number
}

export function useUndoableAction<T>({ onUndo, windowMs = 5000 }: Props<T>) {
  const [active, setActive] = useState<UndoableToast | null>(null)
  const snapshotRef = useRef<T | null>(null)
  const timeoutRef = useRef<number | null>(null)

  const dismiss = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    snapshotRef.current = null
    setActive(null)
  }, [])

  const show = useCallback(
    (snapshot: T, toast: UndoableToast) => {
      if (timeoutRef.current !== null) {
        // Supersede: previous action is now committed (already happened); we
        // only have room for one recoverable snapshot at a time.
        window.clearTimeout(timeoutRef.current)
      }
      snapshotRef.current = snapshot
      setActive(toast)
      timeoutRef.current = window.setTimeout(() => {
        dismiss()
      }, windowMs)
    },
    [dismiss, windowMs],
  )

  const undo = useCallback(async () => {
    const snapshot = snapshotRef.current
    dismiss()
    if (snapshot !== null) {
      await onUndo(snapshot)
    }
  }, [dismiss, onUndo])

  // Clean up on unmount — orphan timers are leaks, especially in test setups
  // and during HMR.
  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
    }
  }, [])

  return { active, show, undo, dismiss }
}
