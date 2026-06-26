import { useEffect, useRef } from 'react'
import { useFetcher } from 'react-router-dom'
import type { Currency } from '../storage/holdings'
import type { ManualAsset, ManualAssetClass } from '../storage/assets'
import type { AssetFormErrors } from '../lib/assetValidators'
import { FEATURE_PLANNING } from '../featureFlags'
import { Field, inputClass, ModalShell } from './formModal'

/** Action response from the asset intents of `holdingsAction`. */
export type AssetActionResult =
  | { ok: true; mode: 'asset-added' | 'asset-updated' | 'asset-deleted' }
  | { ok: false; error: string; fieldErrors?: AssetFormErrors }

type Mode = 'add' | 'edit'

type Props = {
  open: boolean
  mode: Mode
  asset?: ManualAsset
  onClose: () => void
}

// `equity` is intentionally NOT offered for new assets — equity is backfilled
// (read-only) on the Investments tab from the holdings store, so a manual equity
// asset would double-read against it. It is re-surfaced ONLY when editing a
// pre-existing (legacy) equity asset, so the select round-trips that asset's
// class instead of silently switching it to the first option on save.
const assetClasses: { value: ManualAssetClass; label: string }[] = [
  { value: 'mutualFund', label: 'Mutual fund' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'gold', label: 'Gold / Silver' },
  { value: 'nps', label: 'NPS / Retirement' },
  { value: 'fd', label: 'Fixed deposit' },
  { value: 'savings', label: 'Savings' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' },
]
const LEGACY_EQUITY_OPTION = { value: 'equity' as ManualAssetClass, label: 'Equity (manual · legacy)' }

const currencies: { value: Currency; label: string; subtitle: string }[] = [
  { value: 'INR', label: 'India', subtitle: 'INR' },
  { value: 'USD', label: 'US', subtitle: 'USD' },
]

const riskBands = [
  { value: '', label: 'Untagged' },
  { value: 'safe', label: 'Safe' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'high', label: 'High' },
]

/**
 * Modal form for adding / editing a value-only manual asset. Submits via
 * `useFetcher` to `holdingsAction` (intents `addAsset` / `updateAsset`). Mirrors
 * `HoldingForm` but for the asset shape: no quantity / price, just an optional
 * invested amount and a current value, plus the Phase-3 planning tags (gated on
 * FEATURE_PLANNING).
 */
export function AssetForm({ open, mode, asset, onClose }: Props) {
  const fetcher = useFetcher<AssetActionResult>()
  const firstInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => firstInputRef.current?.focus())
      return () => cancelAnimationFrame(id)
    }
    return undefined
  }, [open])

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.ok === true) onClose()
  }, [fetcher.state, fetcher.data, onClose])

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

  // Re-surface the legacy `equity` option only when editing an asset that is
  // already equity (preserves round-trip; never offered for new assets).
  const classOptions =
    mode === 'edit' && asset?.assetClass === 'equity'
      ? [LEGACY_EQUITY_OPTION, ...assetClasses]
      : assetClasses

  const initial = {
    name: asset?.name ?? '',
    assetClass: (asset?.assetClass ?? 'crypto') as ManualAssetClass,
    currency: (asset?.currency ?? 'INR') as Currency,
    investedAmount: asset?.investedAmount !== undefined ? String(asset.investedAmount) : '',
    currentValue: asset ? String(asset.currentValue) : '',
    riskBand: asset?.riskBand ?? '',
    emergencyFund: asset?.emergencyFund ?? false,
  }

  return (
    <ModalShell onClose={onClose} title={mode === 'add' ? 'Add asset' : `Edit ${initial.name}`}>
      <fetcher.Form method="post" action="/equity" className="grid gap-5">
        <input type="hidden" name="intent" value={mode === 'add' ? 'addAsset' : 'updateAsset'} />
        {mode === 'edit' && asset && <input type="hidden" name="id" value={asset.id} />}

        <Field label="Name" error={errors.name}>
          <input
            ref={firstInputRef}
            name="name"
            type="text"
            required
            defaultValue={initial.name}
            aria-invalid={Boolean(errors.name)}
            className={inputClass(Boolean(errors.name))}
            placeholder="e.g. Sovereign Gold Bond"
          />
        </Field>

        <Field label="Asset class" error={undefined}>
          <select
            name="assetClass"
            defaultValue={initial.assetClass}
            className="w-full border border-bone-100/15 bg-ink-950 px-3 py-2 font-sans text-sm text-bone-100 focus:border-tick-400 focus:outline-none"
          >
            {classOptions.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Currency" error={undefined}>
          <div
            role="radiogroup"
            aria-label="Currency"
            className="grid grid-cols-2 gap-px overflow-hidden border border-bone-100/15 bg-bone-100/10"
          >
            {currencies.map((c) => (
              <label
                key={c.value}
                className="flex cursor-pointer flex-col gap-1 bg-ink-900 px-3 py-2.5 transition has-[:checked]:bg-tick-400/10 has-[:checked]:ring-1 has-[:checked]:ring-inset has-[:checked]:ring-tick-400"
              >
                <input
                  type="radio"
                  name="currency"
                  value={c.value}
                  defaultChecked={initial.currency === c.value}
                  className="sr-only"
                />
                <span className="font-sans text-sm text-bone-50">{c.label}</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-bone-400">
                  {c.subtitle}
                </span>
              </label>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Current value" error={errors.currentValue}>
            <input
              name="currentValue"
              type="text"
              inputMode="decimal"
              required
              defaultValue={initial.currentValue}
              aria-invalid={Boolean(errors.currentValue)}
              className={inputClass(Boolean(errors.currentValue))}
              placeholder="e.g. 500000"
            />
          </Field>
          <Field label="Invested (optional)" error={errors.investedAmount}>
            <input
              name="investedAmount"
              type="text"
              inputMode="decimal"
              defaultValue={initial.investedAmount}
              aria-invalid={Boolean(errors.investedAmount)}
              className={inputClass(Boolean(errors.investedAmount))}
              placeholder="blank if none"
            />
          </Field>
        </div>

        {FEATURE_PLANNING && (
          <div className="grid gap-5 border-t border-bone-100/10 pt-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-bone-500">
              Planning tags (optional)
            </p>
            <Field label="Risk band" error={undefined}>
              <select
                name="riskBand"
                defaultValue={initial.riskBand}
                className="w-full border border-bone-100/15 bg-ink-950 px-3 py-2 font-sans text-sm text-bone-100 focus:border-tick-400 focus:outline-none"
              >
                {riskBands.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>
            <label className="flex cursor-pointer items-center gap-2 border border-bone-100/15 px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-bone-300 transition has-[:checked]:border-tick-400 has-[:checked]:text-tick-400">
              <input
                type="checkbox"
                name="emergencyFund"
                value="true"
                defaultChecked={initial.emergencyFund}
                className="h-3 w-3 accent-tick-400"
              />
              Part of emergency fund
            </label>
          </div>
        )}

        {fetcher.data && !fetcher.data.ok && !fetcher.data.fieldErrors && (
          <div
            role="alert"
            className="border border-ember-400/40 bg-ember-900/30 p-3 font-sans text-xs text-ember-300"
          >
            {fetcher.data.error}
          </div>
        )}

        <div className="mt-2 flex flex-col-reverse items-stretch justify-end gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="border border-bone-100/15 px-4 py-2.5 font-sans text-[11px] font-medium uppercase tracking-[0.16em] text-bone-300 transition hover:border-bone-100/40 hover:text-bone-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="border border-tick-400 bg-tick-400 px-6 py-2.5 font-sans text-[11px] font-medium uppercase tracking-[0.16em] text-ink-950 transition hover:bg-tick-200 disabled:opacity-50"
          >
            {submitting ? 'Saving…' : mode === 'add' ? 'Add asset' : 'Save changes'}
          </button>
        </div>
      </fetcher.Form>
    </ModalShell>
  )
}
