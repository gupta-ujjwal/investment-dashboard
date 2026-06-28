import { useEffect, useRef, useState } from 'react'
import type { CanonicalHolding } from '../storage/holdings'
import type { RiskBand } from '../storage/assets'
import { effectiveBand, isBandOverridden } from '../lib/riskBand'

type Props = {
  holding: CanonicalHolding
  onEdit: () => void
  onMarkClosed: () => void
  onReopen: () => void
  onRevertOverrides: () => void
  /** Set the risk-band override, or clear it (Auto → asset-class-derived) with
   *  `undefined`. */
  onSetRiskBand: (band: RiskBand | undefined) => void
  onDelete: () => void
}

const RISK_BAND_LABELS: Record<RiskBand, string> = {
  safe: 'Safe',
  moderate: 'Moderate',
  high: 'High',
}

/**
 * Per-row overflow menu — Edit, Mark closed / Re-open, Revert to broker
 * (conditional), Delete forever. Clicking Delete forever flips the menu
 * panel into a confirm view with steering copy; from there, Cancel goes
 * back to the menu, "Yes, delete" fires `onDelete` and closes the menu.
 *
 * UX intent: Delete forever is the only one-way action; Mark closed and
 * Revert are reversible and need no confirm. Reliability Tenet 3 (blast
 * radius) — the destructive verb gets a deliberate pause, the others stay
 * one click.
 */
export function HoldingActionsMenu({
  holding,
  onEdit,
  onMarkClosed,
  onReopen,
  onRevertOverrides,
  onSetRiskBand,
  onDelete,
}: Props) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Click-outside closes. Escape closes (and pops out of confirm first).
  useEffect(() => {
    if (!open) return undefined
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setConfirming(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirming) {
          setConfirming(false)
        } else {
          setOpen(false)
        }
      }
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, confirming])

  function close() {
    setOpen(false)
    setConfirming(false)
  }

  const isClosed = holding.status === 'closed'
  const hasOverrides = (holding.manualOverrides?.length ?? 0) > 0
  const currentBand = effectiveBand(holding)
  const bandOverridden = isBandOverridden(holding)

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        aria-label={`Actions for ${holding.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-7 w-7 items-center justify-center border border-transparent font-mono text-bone-300 transition hover:border-bone-100/20 hover:text-bone-50"
      >
        ⋯
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-60 border border-bone-100/15 bg-ink-850 shadow-lg shadow-ink-950/60"
        >
          {!confirming && (
            <ul className="py-1">
              <MenuItem
                onSelect={() => {
                  close()
                  onEdit()
                }}
              >
                ✎  Edit…
              </MenuItem>
              {isClosed ? (
                <MenuItem
                  onSelect={() => {
                    close()
                    onReopen()
                  }}
                >
                  ↺  Re-open position
                </MenuItem>
              ) : (
                <MenuItem
                  onSelect={() => {
                    close()
                    onMarkClosed()
                  }}
                >
                  ✓  Mark as closed
                </MenuItem>
              )}
              {hasOverrides && (
                <MenuItem
                  onSelect={() => {
                    close()
                    onRevertOverrides()
                  }}
                >
                  ⤺  Revert to broker
                </MenuItem>
              )}

              <li role="separator" className="mx-2 my-1 border-t border-bone-100/10" />
              <li
                role="presentation"
                className="px-3 pb-0.5 pt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-bone-500"
              >
                Risk band {bandOverridden ? '· overridden' : '· auto'}
              </li>
              {(['safe', 'moderate', 'high'] as const).map((band) => (
                <MenuItem
                  key={band}
                  onSelect={() => {
                    close()
                    onSetRiskBand(band)
                  }}
                >
                  {currentBand === band ? '● ' : '○ '}
                  {RISK_BAND_LABELS[band]}
                </MenuItem>
              ))}
              <MenuItem
                onSelect={() => {
                  close()
                  onSetRiskBand(undefined)
                }}
              >
                {bandOverridden ? '○ ' : '● '}Auto (by asset class)
              </MenuItem>

              <li role="separator" className="mx-2 my-1 border-t border-bone-100/10" />
              <MenuItem
                tone="ember"
                onSelect={() => setConfirming(true)}
              >
                🗑  Delete forever…
              </MenuItem>
            </ul>
          )}
          {confirming && (
            <div className="p-3">
              <p className="font-sans text-sm text-bone-50">
                Delete <span className="font-mono">{holding.sourceSymbol}</span> permanently?
              </p>
              <p className="mt-2 font-sans text-xs text-bone-400">
                Historical snapshots keep their copy of this row. You'll lose its current values
                and any edits.{' '}
                {!isClosed && (
                  <>
                    Use <span className="text-bone-200">Mark as closed</span> instead if you sold
                    the position — it preserves time-series fidelity.
                  </>
                )}
              </p>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="border border-bone-100/15 px-3 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-bone-300 transition hover:border-bone-100/40 hover:text-bone-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    close()
                    onDelete()
                  }}
                  className="border border-ember-400 bg-ember-400/10 px-3 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-ember-400 transition hover:bg-ember-400 hover:text-ink-950"
                >
                  Yes, delete
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MenuItem({
  children,
  onSelect,
  tone = 'default',
}: {
  children: React.ReactNode
  onSelect: () => void
  tone?: 'default' | 'ember'
}) {
  const toneClass =
    tone === 'ember'
      ? 'text-ember-400 hover:bg-ember-400/10'
      : 'text-bone-100 hover:bg-ink-800'
  return (
    <li role="none">
      <button
        type="button"
        role="menuitem"
        onClick={onSelect}
        className={`block w-full px-3 py-1.5 text-left font-sans text-sm transition ${toneClass}`}
      >
        {children}
      </button>
    </li>
  )
}
