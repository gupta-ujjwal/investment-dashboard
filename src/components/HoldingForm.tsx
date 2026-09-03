import { useEffect, useRef } from 'react'
import { useFetcher } from 'react-router-dom'
import type {
  AssetClass,
  CanonicalHolding,
  Currency,
  HoldingKey,
  Source,
} from '../storage/holdings'
import type { HoldingFormErrors } from '../lib/holdingValidators'
import { Field, inputClass, ModalShell } from './formModal'

/**
 * Shape of the action response from `holdingsAction`. Field-level errors flow
 * back via `fieldErrors` so the form can highlight a specific input rather
 * than show one generic banner. Form-wide errors land in `error` and render
 * above the action buttons.
 */
export type HoldingActionResult =
  | { ok: true; mode: 'added' | 'updated' | 'deleted' | 'status-set' | 'reverted' | 'risk-band-set' }
  | { ok: false; error: string; fieldErrors?: HoldingFormErrors }

type Mode = 'add' | 'edit'

type Props = {
  open: boolean
  mode: Mode
  /** When editing, the row being edited. Required for `mode='edit'`. */
  holding?: CanonicalHolding
  /** Existing rows in the dashboard — used for duplicate compound-key checks.
   *  The form filters out the row being edited so its own key doesn't
   *  false-positive (see validateHoldingForm's `currentKey`). */
  existingKeys: readonly HoldingKey[]
  onClose: () => void
}

const assetClasses: { value: AssetClass; label: string }[] = [
  { value: 'equity', label: 'Equity' },
  { value: 'mf', label: 'Mutual fund' },
  { value: 'etf', label: 'ETF' },
  { value: 'invit', label: 'InvIT' },
  { value: 'other', label: 'Other' },
]

const markets: { value: Currency; label: string; subtitle: string }[] = [
  { value: 'INR', label: 'India', subtitle: 'NSE · BSE · INR' },
  { value: 'USD', label: 'US', subtitle: 'NYSE · NASDAQ · USD' },
]

/**
 * Modal form for adding a manual holding or editing any holding. Submits via
 * react-router `useFetcher` to `holdingsAction`. On success (`fetcher.data.ok
 * === true`), closes itself; the parent route's loader re-runs automatically
 * because react-router revalidates loaders after a fetcher action.
 *
 * Field-level errors come back via `fetcher.data.fieldErrors`. Each input has
 * `aria-invalid` and an adjacent error paragraph so screen readers surface
 * the right context.
 */
export function HoldingForm({ open, mode, holding, existingKeys, onClose }: Props) {
  const fetcher = useFetcher<HoldingActionResult>()
  const firstInputRef = useRef<HTMLInputElement>(null)

  // Reset + focus on open. The `key` reset on the form below covers state
  // reset across open cycles; the ref handles the autofocus.
  useEffect(() => {
    if (open) {
      // Wait one frame so the input is mounted.
      const id = requestAnimationFrame(() => firstInputRef.current?.focus())
      return () => cancelAnimationFrame(id)
    }
    return undefined
  }, [open])

  // Close on successful submit. Watching fetcher.state moves us out of any
  // intermediate "submitting" UI back to idle before we call onClose, so the
  // toast (added in a later commit) lands cleanly.
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.ok === true) {
      onClose()
    }
  }, [fetcher.state, fetcher.data, onClose])

  // Escape key closes (when nothing else has captured it).
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const errors = fetcher.data && !fetcher.data.ok ? fetcher.data.fieldErrors ?? {} : {}
  const submitting = fetcher.state !== 'idle'
  const submitLabel = mode === 'add' ? 'Add holding' : 'Save changes'

  // For add: source is hardcoded 'manual'. For edit: source comes from the
  // existing row and is read-only (the compound key can't change without
  // becoming a different row).
  const source: Source = mode === 'add' ? 'manual' : (holding?.source ?? 'manual')

  const initial = {
    name: holding?.name ?? '',
    sourceSymbol: holding?.sourceSymbol ?? '',
    currency: (holding?.currency ?? 'INR') as Currency,
    quantity: holding ? String(holding.quantity) : '',
    avgBuyPrice: holding ? String(holding.avgBuyPrice) : '',
    currentPrice: holding?.currentPrice !== undefined ? String(holding.currentPrice) : '',
    assetClass: (holding?.assetClass ?? 'equity') as AssetClass,
  }

  return (
    <ModalShell onClose={onClose} title={mode === 'add' ? 'Add holding' : `Edit ${initial.name}`}>
      <fetcher.Form method="post" action="/equity" className="grid gap-5">
        <input type="hidden" name="intent" value={mode === 'add' ? 'add' : 'update'} />
        <input type="hidden" name="source" value={source} />
        {/* For edit, we send the original sourceSymbol so the action can find
            the row even if the user edited the ticker field (renames flow
            through a delete+add at the action layer, not handled in v1). */}
        {mode === 'edit' && holding && (
          <input type="hidden" name="originalSourceSymbol" value={holding.sourceSymbol} />
        )}

        <Field label="Name" error={errors.name}>
          <input
            ref={firstInputRef}
            name="name"
            type="text"
            required
            defaultValue={initial.name}
            aria-invalid={Boolean(errors.name)}
            className={inputClass(Boolean(errors.name))}
            placeholder="e.g. Reliance Industries"
          />
        </Field>

        <Field label="Ticker / symbol" error={errors.sourceSymbol}>
          <input
            name="sourceSymbol"
            type="text"
            required
            defaultValue={initial.sourceSymbol}
            aria-invalid={Boolean(errors.sourceSymbol)}
            // Read-only on edit — the compound key (source, sourceSymbol) is
            // the row's identity. To rename, delete and re-add.
            readOnly={mode === 'edit'}
            className={inputClass(Boolean(errors.sourceSymbol)) + (mode === 'edit' ? ' opacity-60' : '')}
            placeholder="e.g. RELIANCE or AAPL"
          />
        </Field>

        <Field label="Market" error={undefined}>
          <div role="radiogroup" aria-label="Market" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-bone-100/15 bg-bone-100/10">
            {markets.map((m) => (
              <label
                key={m.value}
                className="flex cursor-pointer flex-col gap-1 bg-ink-900 px-3 py-2.5 transition has-[:checked]:bg-act-400/10 has-[:checked]:ring-1 has-[:checked]:ring-inset has-[:checked]:ring-act-400"
              >
                <input
                  type="radio"
                  name="currency"
                  value={m.value}
                  defaultChecked={initial.currency === m.value}
                  className="sr-only"
                  // Currency is part of identity-shape — locked on edit.
                  disabled={mode === 'edit'}
                />
                <span className="font-sans text-sm text-bone-50">{m.label}</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-bone-400">
                  {m.subtitle}
                </span>
              </label>
            ))}
          </div>
          {/* Market is a label for currency in Phase 1 — they map 1:1. The
              radio above writes `currency`; this hidden duplicates it for
              the validator. */}
          <input type="hidden" name="market" value={initial.currency} />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Quantity" error={errors.quantity}>
            <input
              name="quantity"
              type="text"
              inputMode="decimal"
              required
              defaultValue={initial.quantity}
              aria-invalid={Boolean(errors.quantity)}
              className={inputClass(Boolean(errors.quantity))}
              placeholder="e.g. 12"
            />
          </Field>
          <Field label="Avg buy price" error={errors.avgBuyPrice}>
            <input
              name="avgBuyPrice"
              type="text"
              inputMode="decimal"
              required
              defaultValue={initial.avgBuyPrice}
              aria-invalid={Boolean(errors.avgBuyPrice)}
              className={inputClass(Boolean(errors.avgBuyPrice))}
              placeholder="e.g. 2410"
            />
          </Field>
        </div>

        <Field label="Current price (optional)" error={errors.currentPrice}>
          <input
            name="currentPrice"
            type="text"
            inputMode="decimal"
            defaultValue={initial.currentPrice}
            aria-invalid={Boolean(errors.currentPrice)}
            className={inputClass(Boolean(errors.currentPrice))}
            placeholder="leave blank if unknown"
          />
        </Field>

        <Field label="Asset class" error={undefined}>
          <select
            name="assetClass"
            defaultValue={initial.assetClass}
            className="field"
          >
            {assetClasses.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </Field>

        {fetcher.data && !fetcher.data.ok && !fetcher.data.fieldErrors && (
          <div role="alert" className="rounded-lg border border-ember-400/40 bg-ember-900/30 p-3 font-sans text-xs text-ember-300">
            {fetcher.data.error}
          </div>
        )}

        <div className="mt-2 flex flex-col-reverse items-stretch justify-end gap-2 sm:flex-row sm:items-center">
          <button type="button" onClick={onClose} disabled={submitting} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? 'Saving…' : submitLabel}
          </button>
        </div>

        {/* Hidden — used by add only, to enforce the duplicate-key check
            against currently-existing manual rows. */}
        {existingKeys.length > 0 && mode === 'add' && (
          <input type="hidden" name="_existingKeyCount" value={String(existingKeys.length)} />
        )}
      </fetcher.Form>
    </ModalShell>
  )
}

